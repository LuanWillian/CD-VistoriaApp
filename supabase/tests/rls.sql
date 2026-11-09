-- Conferência de RLS (leitura para todos os logados, escrita só do dono), numeração e checks. Rode num banco com a migration aplicada:
--   docker exec -i supabase_db_vistoria-veicular psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
-- No projeto hospedado: cole no SQL Editor. Tudo roda dentro de uma transação
-- desfeita no fim (rollback); só a sequence de números avança.
-- Sucesso = mensagem "RLS OK". Qualquer falha interrompe com a explicação.

begin;

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'rls.a@teste.local', 'authenticated', 'authenticated'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'rls.b@teste.local', 'authenticated', 'authenticated'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'rls.c@teste.local', 'authenticated', 'authenticated');

-- A e B têm perfil; C não (o administrador ainda não cadastrou o nome).
insert into public.perfis (id, nome) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Ana Perfil'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Bia Perfil');

-- ---------- Usuário A ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  n1 text; n2 text; n3 text;
begin
  insert into public.inspections (id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
    motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
  values ('11111111-1111-4111-8111-111111111111', 'AB123C', 'Fiat', 'Uno', 'Prata', 1000, 'Flex',
    '{"Antena":"presente"}', 'Ana', 'Beto', 'p', 'p', 'p', 'p', 'p', '2026-11-07 13:00-03')
  returning numero into n1;

  insert into public.inspections (id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
    motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
  values ('22222222-2222-4222-8222-222222222222', 'CD456E', 'Ford', 'Ka', 'Azul', 0, 'Gasolina',
    '{}', 'Ana', 'Beto', 'p', 'p', 'p', 'p', 'p', now())
  returning numero into n2;

  -- o nome do vistoriador vem do perfil, não do que o aparelho mandou ('Ana')
  if (select vistoriador_nome from public.inspections where id = '11111111-1111-4111-8111-111111111111') <> 'Ana Perfil' then
    raise exception 'vistoriador_nome não veio do perfil';
  end if;

  -- perfis: A lê só o próprio e não cria nem altera
  if (select count(*) from public.perfis) <> 1 then raise exception 'A enxerga perfis de outros usuários'; end if;
  begin
    update public.perfis set nome = 'Outro Nome' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    raise exception 'A alterou o próprio perfil';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.perfis (id, nome) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Falso');
    raise exception 'A criou um perfil';
  exception when insufficient_privilege then null;
  end;

  if n1 !~ '^VIS-\d{6}$' then raise exception 'número fora do formato VIS-000000: %', n1; end if;
  if substr(n2, 5)::bigint <> substr(n1, 5)::bigint + 1 then
    raise exception 'números não são consecutivos: % e %', n1, n2;
  end if;

  -- o cliente não escolhe o número
  insert into public.inspections (id, numero, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
    motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
  values ('33333333-3333-4333-8333-333333333333', 'VIS-999999', 'EF789G', 'VW', 'Gol', 'Branco', 5, 'Diesel',
    '{}', 'Ana', 'Beto', 'p', 'p', 'p', 'p', 'p', now())
  returning numero into n3;
  if n3 = 'VIS-999999' or substr(n3, 5)::bigint <> substr(n2, 5)::bigint + 1 then
    raise exception 'o gatilho não impôs o número do servidor (veio %)', n3;
  end if;

  -- avaria e foto de avaria na própria vistoria
  insert into public.damages (id, inspection_id, area, tipo, gravidade, descricao)
  values ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111', 'Capô', 'Risco', 'Leve', 'x');
  insert into public.damage_photos (id, damage_id, path)
  values ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/avaria_55555555.jpg');

  -- checks
  begin
    insert into public.inspections (id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
      motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
    values (gen_random_uuid(), 'ab123c', 'Fiat', 'Uno', 'Prata', 1, 'Flex', '{}', 'Ana', 'Beto', 'p', 'p', 'p', 'p', 'p', now());
    raise exception 'chassi em minúsculas foi aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.inspections (id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
      motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
    values (gen_random_uuid(), 'AB123C', 'Fiat', 'Uno', 'Prata', 1, 'Álcool', '{}', 'Ana', 'Beto', 'p', 'p', 'p', 'p', 'p', now());
    raise exception 'combustível Álcool foi aceito';
  exception when check_violation then null;
  end;
  begin
    insert into public.damages (id, inspection_id, area, tipo, gravidade)
    values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'Capô', 'Risco', 'Média');
    raise exception 'gravidade Média foi aceita';
  exception when check_violation then null;
  end;

  -- Storage: A grava na própria pasta, não na de B
  insert into storage.objects (bucket_id, name)
  values ('vistorias', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/frente.jpg');
  begin
    insert into storage.objects (bucket_id, name)
    values ('vistorias', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/x/frente.jpg');
    raise exception 'A gravou na pasta de B no Storage';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- Usuário B ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare
  c int;
begin
  -- Todo usuário logado LÊ tudo (migration 0003)...
  select count(*) into c from public.inspections where id = '11111111-1111-4111-8111-111111111111';
  if c <> 1 then raise exception 'B não enxerga a vistoria de A'; end if;
  select count(*) into c from public.damages where id = '44444444-4444-4444-8444-444444444444';
  if c <> 1 then raise exception 'B não enxerga a avaria de A'; end if;
  select count(*) into c from public.damage_photos where id = '55555555-5555-4555-8555-555555555555';
  if c <> 1 then raise exception 'B não enxerga a foto de avaria de A'; end if;
  select count(*) into c from storage.objects where bucket_id = 'vistorias'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/frente.jpg';
  if c <> 1 then raise exception 'B não enxerga o arquivo de A no Storage'; end if;

  -- ...mas só o dono altera, apaga ou cria.
  update public.inspections set marca = 'X' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B alterou a vistoria de A'; end if;

  delete from public.inspections where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B apagou a vistoria de A'; end if;

  begin
    insert into public.damages (id, inspection_id, area, tipo, gravidade)
    values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'Capô', 'Risco', 'Leve');
    raise exception 'B inseriu avaria na vistoria de A';
  exception when insufficient_privilege then null;
  end;

  update public.damages set descricao = 'x' where id = '44444444-4444-4444-8444-444444444444';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B alterou a avaria de A'; end if;
  delete from public.damage_photos where id = '55555555-5555-4555-8555-555555555555';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B apagou a foto de avaria de A'; end if;

  begin
    insert into public.inspections (id, user_id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
      motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AB123C', 'Fiat', 'Uno', 'Prata', 1, 'Flex', '{}',
      'Bia', 'Beto', 'p', 'p', 'p', 'p', 'p', now());
    raise exception 'B criou uma vistoria em nome de A';
  exception
    when insufficient_privilege then null;
    -- B não enxerga o perfil de A, então o gatilho já recusa antes da RLS
    when raise_exception then
      if sqlerrm not like '%não está cadastrado%' then raise; end if;
  end;
end $$;

-- ---------- Usuário C (sem perfil) ----------
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';

do $$
begin
  begin
    insert into public.inspections (id, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
      motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
    values (gen_random_uuid(), 'AB123C', 'Fiat', 'Uno', 'Prata', 1, 'Flex', '{}', 'Qualquer Nome', 'Beto',
      'p', 'p', 'p', 'p', 'p', now());
    raise exception 'C criou vistoria sem ter perfil';
  exception when raise_exception then
    if sqlerrm not like '%não está cadastrado%' then raise; end if;
  end;
end $$;

-- ---------- Campos imutáveis no update ----------
reset role;
alter table public.inspections disable trigger inspections_antes_atualizar;
update public.inspections set updated_at = '2000-01-01' where id = '11111111-1111-4111-8111-111111111111';
alter table public.inspections enable trigger inspections_antes_atualizar;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';

do $$
declare
  antes record;
  depois record;
begin
  select numero, realizada_em, created_at into antes from public.inspections where id = '11111111-1111-4111-8111-111111111111';
  update public.inspections
     set numero = 'VIS-000999', realizada_em = '2000-01-01', created_at = '2000-01-01', marca = 'Fiat 2',
         vistoriador_nome = 'Outro Nome'
   where id = '11111111-1111-4111-8111-111111111111';
  select numero, realizada_em, created_at, updated_at, marca, vistoriador_nome into depois
    from public.inspections where id = '11111111-1111-4111-8111-111111111111';
  if depois.numero <> antes.numero then raise exception 'numero mudou no update'; end if;
  if depois.realizada_em <> antes.realizada_em then raise exception 'realizada_em mudou no update'; end if;
  if depois.created_at <> antes.created_at then raise exception 'created_at mudou no update'; end if;
  if depois.updated_at < '2001-01-01' then raise exception 'updated_at não foi atualizado'; end if;
  if depois.vistoriador_nome <> 'Ana Perfil' then raise exception 'vistoriador_nome mudou no update'; end if;
  if depois.marca <> 'Fiat 2' then raise exception 'o update normal não foi aplicado'; end if;
  raise notice 'RLS OK';
end $$;

rollback;
