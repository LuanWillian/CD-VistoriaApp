-- =====================================================================
-- CD Vistoria — estrutura inicial do banco
-- Como usar: cole este arquivo inteiro no SQL Editor do Supabase e clique
-- em "Run", ou rode `npx supabase db push` com o projeto vinculado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Numeração oficial (VIS-000001, VIS-000002, ...)
-- ---------------------------------------------------------------------
create sequence if not exists public.inspections_numero_seq;
grant usage on sequence public.inspections_numero_seq to authenticated;

create or replace function public.gerar_numero_vistoria()
returns text
language plpgsql
set search_path = ''
as $$
declare
  n bigint := nextval('public.inspections_numero_seq');
begin
  -- Seis dígitos com zeros à esquerda; acima de 999999 o número cresce sem ser cortado.
  return 'VIS-' || case when n < 1000000 then lpad(n::text, 6, '0') else n::text end;
end;
$$;

-- ---------------------------------------------------------------------
-- 2. Vistorias
-- ---------------------------------------------------------------------
create table if not exists public.inspections (
  id uuid primary key,                       -- gerado no aparelho (envio idempotente)
  numero text not null unique,               -- preenchido pelo gatilho; o cliente não escolhe
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  chassi text not null check (chassi ~ '^[A-Z0-9]{6}$'),
  marca text not null check (btrim(marca) <> ''),
  modelo text not null check (btrim(modelo) <> ''),
  cor text not null check (btrim(cor) <> ''),
  km integer not null check (km >= 0),
  combustivel text not null check (combustivel in ('Gasolina', 'Flex', 'Diesel', 'Elétrico', 'Híbrido')),
  checklist jsonb not null check (jsonb_typeof(checklist) = 'object'),  -- item → presente/ausente
  checklist_obs text,
  sem_avarias boolean not null default false,
  vistoriador_nome text not null,
  motorista_nome text not null,
  foto_frente text not null,                 -- caminhos no bucket "vistorias"
  foto_traseira text not null,
  foto_chassi text not null,
  assinatura_vistoriador text not null,
  assinatura_motorista text not null,
  realizada_em timestamptz not null,         -- data e hora da finalização no aparelho
  created_at timestamptz not null default now(),  -- chegada no servidor
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Gatilhos: número no insert e campos imutáveis no update
-- ---------------------------------------------------------------------
create or replace function public.inspections_antes_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.numero := public.gerar_numero_vistoria();
  return new;
end;
$$;

create or replace function public.inspections_antes_atualizar()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.numero := old.numero;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.realizada_em := old.realizada_em;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists inspections_antes_inserir on public.inspections;
create trigger inspections_antes_inserir
  before insert on public.inspections
  for each row execute function public.inspections_antes_inserir();

drop trigger if exists inspections_antes_atualizar on public.inspections;
create trigger inspections_antes_atualizar
  before update on public.inspections
  for each row execute function public.inspections_antes_atualizar();

-- ---------------------------------------------------------------------
-- 4. Avarias
--    Área e tipo não têm check de propósito: as listas ficam em config.js
--    e podem mudar sem migration.
-- ---------------------------------------------------------------------
create table if not exists public.damages (
  id uuid primary key,
  inspection_id uuid not null references public.inspections (id) on delete cascade,
  area text not null,
  tipo text not null,
  gravidade text not null check (gravidade in ('Leve', 'Moderada', 'Grave')),
  descricao text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 5. Fotos das avarias
-- ---------------------------------------------------------------------
create table if not exists public.damage_photos (
  id uuid primary key,
  damage_id uuid not null references public.damages (id) on delete cascade,
  path text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 6. Índices
-- ---------------------------------------------------------------------
create index if not exists inspections_chassi_idx on public.inspections (chassi);
create index if not exists inspections_created_at_idx on public.inspections (created_at desc);
create index if not exists inspections_realizada_em_idx on public.inspections (realizada_em desc);
create index if not exists inspections_user_id_idx on public.inspections (user_id);
create index if not exists damages_inspection_id_idx on public.damages (inspection_id);
create index if not exists damage_photos_damage_id_idx on public.damage_photos (damage_id);

-- ---------------------------------------------------------------------
-- 7. Row Level Security: cada usuário só acessa as próprias vistorias
-- ---------------------------------------------------------------------
alter table public.inspections enable row level security;
alter table public.damages enable row level security;
alter table public.damage_photos enable row level security;

create policy "inspections: dono lê" on public.inspections
  for select to authenticated using (user_id = (select auth.uid()));
create policy "inspections: dono cria" on public.inspections
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "inspections: dono edita" on public.inspections
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "inspections: dono exclui" on public.inspections
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "damages: dono lê" on public.damages
  for select to authenticated using (exists (
    select 1 from public.inspections i where i.id = inspection_id and i.user_id = (select auth.uid())));
create policy "damages: dono cria" on public.damages
  for insert to authenticated with check (exists (
    select 1 from public.inspections i where i.id = inspection_id and i.user_id = (select auth.uid())));
create policy "damages: dono edita" on public.damages
  for update to authenticated
  using (exists (select 1 from public.inspections i where i.id = inspection_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.inspections i where i.id = inspection_id and i.user_id = (select auth.uid())));
create policy "damages: dono exclui" on public.damages
  for delete to authenticated using (exists (
    select 1 from public.inspections i where i.id = inspection_id and i.user_id = (select auth.uid())));

create policy "damage_photos: dono lê" on public.damage_photos
  for select to authenticated using (exists (
    select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.user_id = (select auth.uid())));
create policy "damage_photos: dono cria" on public.damage_photos
  for insert to authenticated with check (exists (
    select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.user_id = (select auth.uid())));
create policy "damage_photos: dono edita" on public.damage_photos
  for update to authenticated
  using (exists (select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.user_id = (select auth.uid())))
  with check (exists (select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.user_id = (select auth.uid())));
create policy "damage_photos: dono exclui" on public.damage_photos
  for delete to authenticated using (exists (
    select 1 from public.damages d join public.inspections i on i.id = d.inspection_id
    where d.id = damage_id and i.user_id = (select auth.uid())));

-- ---------------------------------------------------------------------
-- Para liberar a LEITURA de todas as vistorias a administradores no futuro:
--
-- 1) Marque o usuário como admin (no SQL Editor):
--    update auth.users
--       set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
--     where email = 'admin@suaempresa.com.br';
--
-- 2) Crie policies de leitura adicionais (elas somam às de dono):
--    create policy "inspections: admin lê" on public.inspections
--      for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
--    create policy "damages: admin lê" on public.damages
--      for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
--    create policy "damage_photos: admin lê" on public.damage_photos
--      for select to authenticated using ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
--    create policy "vistorias: admin lê arquivos" on storage.objects
--      for select to authenticated
--      using (bucket_id = 'vistorias' and (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
--
-- O usuário precisa sair e entrar de novo para o token trazer o papel novo.
-- ---------------------------------------------------------------------

-- ---------------------------------------------------------------------
-- 8. Storage: bucket privado "vistorias", pasta <user_id>/<inspection_id>/
--    (o RLS de storage.objects já vem ligado no Supabase)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('vistorias', 'vistorias', false, 5242880, array['image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "vistorias: dono lê arquivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vistorias: dono envia arquivos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vistorias: dono substitui arquivos" on storage.objects
  for update to authenticated
  using (bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "vistorias: dono exclui arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vistorias' and (storage.foldername(name))[1] = (select auth.uid())::text);
