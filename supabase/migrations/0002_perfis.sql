-- Nome do vistoriador vem da conta, não do que é digitado no celular.
-- O administrador cadastra o nome de cada usuário em public.perfis (Table Editor
-- do Supabase). O vistoriador só lê o próprio perfil; não cria nem altera.
-- No insert de uma vistoria, o banco grava o nome do perfil de quem enviou,
-- ignorando o que veio do aparelho. Sem perfil, a vistoria é recusada.

-- ---------------------------------------------------------------------
-- 1. Perfis
-- ---------------------------------------------------------------------
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(btrim(nome)) between 2 and 120),
  created_at timestamptz not null default now()
);

comment on table public.perfis is
  'Nome completo de cada vistoriador (um por usuário do Auth). Preenchido pelo administrador.';

alter table public.perfis enable row level security;

drop policy if exists "perfis: dono lê" on public.perfis;
create policy "perfis: dono lê" on public.perfis
  for select to authenticated using (id = (select auth.uid()));

-- Sem políticas de insert/update/delete: só o painel (service role) altera.
revoke insert, update, delete on public.perfis from anon, authenticated;
grant select on public.perfis to authenticated;

-- ---------------------------------------------------------------------
-- 2. Gatilhos das vistorias: nome do vistoriador sempre do perfil
-- ---------------------------------------------------------------------
create or replace function public.inspections_antes_inserir()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  nome_perfil text;
begin
  new.numero := public.gerar_numero_vistoria();
  select p.nome into nome_perfil from public.perfis p where p.id = new.user_id;
  if nome_perfil is null then
    raise exception 'Seu nome de vistoriador não está cadastrado. Peça ao administrador para cadastrá-lo.'
      using errcode = 'P0001';
  end if;
  new.vistoriador_nome := nome_perfil;
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
  new.vistoriador_nome := old.vistoriador_nome;
  new.updated_at := now();
  return new;
end;
$$;
