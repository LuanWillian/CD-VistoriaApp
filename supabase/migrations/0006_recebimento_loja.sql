-- Recebimento na loja: contas de loja confirmam a chegada do veículo.
-- RODE ESTA MIGRATION ANTES de publicar a versão do app com "Recebimentos".
--
-- 1. perfis ganha papel (vistoriador | loja) e loja.
-- 2. Contas de loja leem só as vistorias, avarias e arquivos da própria loja;
--    não criam nem excluem vistorias, avarias ou arquivos.
-- 3. Tabelas recebimentos (uma por vistoria) e recebimento_fotos. Nome, loja,
--    conta e data do recebimento vêm do servidor. Ninguém altera nem apaga
--    um recebimento pelo app (sem políticas de update/delete).
-- Contas sem perfil continuam com o comportamento de vistoriador.

-- ---------------------------------------------------------------------
-- 1. Papel e loja no perfil
-- ---------------------------------------------------------------------
alter table public.perfis add column if not exists papel text not null default 'vistoriador';
alter table public.perfis add column if not exists loja text;

alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('vistoriador', 'loja'));
alter table public.perfis drop constraint if exists perfis_loja_check;
alter table public.perfis add constraint perfis_loja_check
  check (papel <> 'loja' or (loja is not null and btrim(loja) <> ''));

create or replace function public.meu_papel()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select p.papel from public.perfis p where p.id = auth.uid() $$;

create or replace function public.minha_loja()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select p.loja from public.perfis p where p.id = auth.uid() $$;

revoke all on function public.meu_papel() from public;
revoke all on function public.minha_loja() from public;
grant execute on function public.meu_papel() to authenticated;
grant execute on function public.minha_loja() to authenticated;

-- ---------------------------------------------------------------------
-- 2. Vistorias, avarias e fotos: leitura por papel; loja não cria nem exclui
-- ---------------------------------------------------------------------
drop policy if exists "inspections: todos leem" on public.inspections;
drop policy if exists "inspections: leitura por papel" on public.inspections;
create policy "inspections: leitura por papel" on public.inspections
  for select to authenticated
  using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador' or loja = public.minha_loja());

drop policy if exists "inspections: dono cria" on public.inspections;
create policy "inspections: dono cria" on public.inspections
  for insert to authenticated
  with check (user_id = (select auth.uid()) and coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador');

drop policy if exists "inspections: todos excluem" on public.inspections;
drop policy if exists "inspections: vistoriadores excluem" on public.inspections;
create policy "inspections: vistoriadores excluem" on public.inspections
  for delete to authenticated using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador');

drop policy if exists "damages: todos leem" on public.damages;
drop policy if exists "damages: leitura por papel" on public.damages;
create policy "damages: leitura por papel" on public.damages
  for select to authenticated
  using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador' or exists (
    select 1 from public.inspections i where i.id = inspection_id and i.loja = public.minha_loja()));

drop policy if exists "damages: todos excluem" on public.damages;
drop policy if exists "damages: vistoriadores excluem" on public.damages;
create policy "damages: vistoriadores excluem" on public.damages
  for delete to authenticated using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador');

drop policy if exists "damage_photos: todos leem" on public.damage_photos;
drop policy if exists "damage_photos: leitura por papel" on public.damage_photos;
create policy "damage_photos: leitura por papel" on public.damage_photos
  for select to authenticated
  using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador' or exists (
    select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.loja = public.minha_loja()));

drop policy if exists "damage_photos: todos excluem" on public.damage_photos;
drop policy if exists "damage_photos: vistoriadores excluem" on public.damage_photos;
create policy "damage_photos: vistoriadores excluem" on public.damage_photos
  for delete to authenticated using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador');

-- ---------------------------------------------------------------------
-- 3. Recebimentos
-- ---------------------------------------------------------------------
create table if not exists public.recebimentos (
  id uuid primary key,                       -- gerado no aparelho (envio idempotente)
  inspection_id uuid not null unique references public.inspections (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id),
  recebedor_nome text not null,              -- preenchido pelo gatilho (perfil)
  loja text not null,                        -- preenchido pelo gatilho (perfil)
  status text not null check (status in ('conforme', 'divergencia')),
  descricao text,
  assinatura text not null,                  -- caminho no bucket "vistorias"
  recebido_em timestamptz not null default now(),
  constraint recebimentos_descricao_check
    check (status = 'conforme' or btrim(coalesce(descricao, '')) <> '')
);

create table if not exists public.recebimento_fotos (
  id uuid primary key,
  recebimento_id uuid not null references public.recebimentos (id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);
create index if not exists recebimento_fotos_recebimento_id_idx on public.recebimento_fotos (recebimento_id);

-- Definer: precisa enxergar a vistoria para distinguir "excluída" de "de outra loja".
create or replace function public.recebimentos_antes_inserir()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  perfil record;
  loja_vistoria text;
  achou boolean;
begin
  select p.nome, p.papel, p.loja into perfil from public.perfis p where p.id = auth.uid();
  if perfil is null or perfil.papel is distinct from 'loja' then
    raise exception 'Só contas de loja registram recebimento.' using errcode = 'P0001';
  end if;
  select true, i.loja into achou, loja_vistoria from public.inspections i where i.id = new.inspection_id;
  if achou is null then
    raise exception 'Esta vistoria foi excluída pelo CD.' using errcode = '23503';
  end if;
  if loja_vistoria is distinct from perfil.loja then
    raise exception 'Esta vistoria não é da sua loja.' using errcode = 'P0001';
  end if;
  new.user_id := auth.uid();
  new.recebedor_nome := perfil.nome;
  new.loja := perfil.loja;
  new.recebido_em := now();
  return new;
end;
$$;

drop trigger if exists recebimentos_antes_inserir on public.recebimentos;
create trigger recebimentos_antes_inserir
  before insert on public.recebimentos
  for each row execute function public.recebimentos_antes_inserir();

alter table public.recebimentos enable row level security;
alter table public.recebimento_fotos enable row level security;

drop policy if exists "recebimentos: leitura por papel" on public.recebimentos;
create policy "recebimentos: leitura por papel" on public.recebimentos
  for select to authenticated
  using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador' or loja = public.minha_loja());

drop policy if exists "recebimentos: loja registra" on public.recebimentos;
create policy "recebimentos: loja registra" on public.recebimentos
  for insert to authenticated
  with check (public.meu_papel() = 'loja' and user_id = (select auth.uid()));

drop policy if exists "recebimento_fotos: leitura por papel" on public.recebimento_fotos;
create policy "recebimento_fotos: leitura por papel" on public.recebimento_fotos
  for select to authenticated
  using (coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador' or exists (
    select 1 from public.recebimentos r where r.id = recebimento_id and r.loja = public.minha_loja()));

drop policy if exists "recebimento_fotos: dono registra" on public.recebimento_fotos;
create policy "recebimento_fotos: dono registra" on public.recebimento_fotos
  for insert to authenticated
  with check (exists (
    select 1 from public.recebimentos r where r.id = recebimento_id and r.user_id = (select auth.uid())));

grant select, insert on public.recebimentos, public.recebimento_fotos to authenticated;

-- ---------------------------------------------------------------------
-- 4. Storage (bucket privado "vistorias")
--    Leitura: vistoriador lê tudo; loja lê arquivos de vistorias da sua loja
--    (a 2ª pasta do caminho é o id da vistoria). Exclusão: só vistoriador.
--    Envio continua só na própria pasta (política da 0001).
-- ---------------------------------------------------------------------
drop policy if exists "vistorias: todos leem arquivos" on storage.objects;
drop policy if exists "vistorias: leitura por papel" on storage.objects;
create policy "vistorias: leitura por papel" on storage.objects
  for select to authenticated
  using (bucket_id = 'vistorias' and (
    coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador'
    or exists (select 1 from public.inspections i
               where i.id::text = (storage.foldername(name))[2] and i.loja = public.minha_loja())));

drop policy if exists "vistorias: todos excluem arquivos" on storage.objects;
drop policy if exists "vistorias: vistoriadores excluem arquivos" on storage.objects;
create policy "vistorias: vistoriadores excluem arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vistorias' and coalesce(public.meu_papel(), 'vistoriador') = 'vistoriador');
