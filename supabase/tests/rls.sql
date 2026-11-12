-- Conferência de RLS (leitura e exclusão para todos os vistoriadores; contas de loja só a própria loja; criar/editar só do dono; recebimentos na loja), numeração e checks. Rode num banco com as migrations aplicadas:
--   docker exec -i supabase_db_cd-vistoriaapp psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/rls.sql
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

  -- ...mas só o dono altera ou cria (excluir é de todos: migration 0004, testada no fim).
  update public.inspections set marca = 'X' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B alterou a vistoria de A'; end if;

  begin
    insert into public.damages (id, inspection_id, area, tipo, gravidade)
    values (gen_random_uuid(), '11111111-1111-4111-8111-111111111111', 'Capô', 'Risco', 'Leve');
    raise exception 'B inseriu avaria na vistoria de A';
  exception when insufficient_privilege then null;
  end;

  update public.damages set descricao = 'x' where id = '44444444-4444-4444-8444-444444444444';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'B alterou a avaria de A'; end if;

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
end $$;

-- ---------- Recebimento na loja (migration 0006) ----------
-- D e E são contas de loja (D: PG Prime BMW Natal; E: PG Prime Audi Natal).
-- A (vistoriador) cria uma vistoria para cada loja e uma sem loja.
reset role;
insert into auth.users (id, email, aud, role) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'rls.d@teste.local', 'authenticated', 'authenticated'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'rls.e@teste.local', 'authenticated', 'authenticated');
insert into public.perfis (id, nome, papel, loja) values
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'Davi Loja', 'loja', 'PG Prime BMW Natal'),
  ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', 'Eva Loja', 'loja', 'PG Prime Audi Natal');
do $$
begin
  begin
    insert into public.perfis (id, nome, papel) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Sem Loja', 'loja');
    raise exception 'perfil de loja sem loja foi aceito';
  exception when check_violation then null;
  end;
end $$;

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
insert into public.inspections (id, loja, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
  motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
values
  ('66666666-6666-4666-8666-666666666666', 'PG Prime BMW Natal', 'BM0001', 'BMW', 'X1', 'Preto', 1, 'Flex', '{}', 'Ana',
   'Beto', 'p', 'p', 'p', 'p', 'p', now()),
  ('77777777-7777-4777-8777-777777777777', 'PG Prime Audi Natal', 'AU0001', 'Audi', 'Q5', 'Preto', 1, 'Flex', '{}', 'Ana',
   'Beto', 'p', 'p', 'p', 'p', 'p', now());
insert into public.damages (id, inspection_id, area, tipo, gravidade)
values ('88888888-8888-4888-8888-888888888888', '77777777-7777-4777-8777-777777777777', 'Capô', 'Risco', 'Leve');
insert into storage.objects (bucket_id, name) values
  ('vistorias', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/66666666-6666-4666-8666-666666666666/frente.jpg'),
  ('vistorias', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/77777777-7777-4777-8777-777777777777/frente.jpg');

do $$
begin
  -- vistoriador não registra recebimento
  begin
    insert into public.recebimentos (id, inspection_id, status, assinatura)
    values (gen_random_uuid(), '66666666-6666-4666-8666-666666666666', 'conforme', 'p');
    raise exception 'vistoriador registrou recebimento';
  exception
    when insufficient_privilege then null;
    when raise_exception then null;
  end;
end $$;

-- ---------- D (loja PG Prime BMW Natal) ----------
set local request.jwt.claims = '{"sub":"dddddddd-dddd-4ddd-8ddd-dddddddddddd","role":"authenticated"}';

do $$
declare
  c int;
  r record;
begin
  -- só lê o que é da própria loja
  select count(*) into c from public.inspections;
  if c <> 1 then raise exception 'D deveria ver só 1 vistoria (a da sua loja), viu %', c; end if;
  if not exists (select 1 from public.inspections where id = '66666666-6666-4666-8666-666666666666') then
    raise exception 'D não vê a vistoria da sua loja';
  end if;
  select count(*) into c from public.damages where id = '88888888-8888-4888-8888-888888888888';
  if c <> 0 then raise exception 'D vê avaria de outra loja'; end if;
  select count(*) into c from storage.objects where bucket_id = 'vistorias' and name like '%77777777-7777-4777-8777-777777777777%';
  if c <> 0 then raise exception 'D vê arquivo de outra loja'; end if;
  select count(*) into c from storage.objects where bucket_id = 'vistorias' and name like '%66666666-6666-4666-8666-666666666666%';
  if c <> 1 then raise exception 'D não vê o arquivo da vistoria da sua loja'; end if;

  -- não cria nem exclui vistoria, avaria ou arquivo
  begin
    insert into public.inspections (id, loja, chassi, marca, modelo, cor, km, combustivel, checklist, vistoriador_nome,
      motorista_nome, foto_frente, foto_traseira, foto_chassi, assinatura_vistoriador, assinatura_motorista, realizada_em)
    values (gen_random_uuid(), 'PG Prime BMW Natal', 'AB123C', 'Fiat', 'Uno', 'Prata', 1, 'Flex', '{}', 'x', 'Beto',
      'p', 'p', 'p', 'p', 'p', now());
    raise exception 'D criou uma vistoria';
  exception when insufficient_privilege then null;
  end;
  delete from public.inspections where id = '66666666-6666-4666-8666-666666666666';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'D excluiu uma vistoria'; end if;
  delete from storage.objects where bucket_id = 'vistorias' and name like '%66666666-6666-4666-8666-666666666666%';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'D excluiu um arquivo'; end if;

  -- divergência sem descrição é recusada
  begin
    insert into public.recebimentos (id, inspection_id, status, descricao, assinatura)
    values (gen_random_uuid(), '66666666-6666-4666-8666-666666666666', 'divergencia', '  ', 'p');
    raise exception 'divergência sem descrição foi aceita';
  exception when check_violation then null;
  end;

  -- recebe a vistoria da sua loja; nome, loja, conta e data vêm do servidor
  insert into public.recebimentos (id, inspection_id, user_id, recebedor_nome, loja, status, assinatura, recebido_em)
  values ('99999999-9999-4999-8999-999999999999', '66666666-6666-4666-8666-666666666666',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Nome Falso', 'Outra Loja', 'conforme',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd/66666666-6666-4666-8666-666666666666/receb_assinatura.png', '2000-01-01');
  select * into r from public.recebimentos where id = '99999999-9999-4999-8999-999999999999';
  if r.recebedor_nome <> 'Davi Loja' then raise exception 'recebedor_nome não veio do perfil (veio %)', r.recebedor_nome; end if;
  if r.loja <> 'PG Prime BMW Natal' then raise exception 'loja do recebimento não veio do perfil (veio %)', r.loja; end if;
  if r.user_id <> 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' then raise exception 'user_id do recebimento não é o de D'; end if;
  if r.recebido_em < now() - interval '1 minute' then raise exception 'recebido_em não veio do servidor'; end if;

  -- uma vez só, sem alterar nem apagar
  begin
    insert into public.recebimentos (id, inspection_id, status, assinatura)
    values (gen_random_uuid(), '66666666-6666-4666-8666-666666666666', 'conforme', 'p');
    raise exception 'segundo recebimento da mesma vistoria foi aceito';
  exception when unique_violation then null;
  end;
  update public.recebimentos set status = 'divergencia', descricao = 'x' where id = '99999999-9999-4999-8999-999999999999';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'D alterou o recebimento'; end if;
  delete from public.recebimentos where id = '99999999-9999-4999-8999-999999999999';
  get diagnostics c = row_count;
  if c <> 0 then raise exception 'D apagou o recebimento'; end if;

  -- foto do próprio recebimento
  insert into public.recebimento_fotos (id, recebimento_id, path)
  values (gen_random_uuid(), '99999999-9999-4999-8999-999999999999', 'dddddddd-dddd-4ddd-8ddd-dddddddddddd/x/receb_1.jpg');
end $$;

-- ---------- E (loja PG Prime Audi Natal) ----------
set local request.jwt.claims = '{"sub":"eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee","role":"authenticated"}';

do $$
declare
  c int;
begin
  begin
    insert into public.recebimentos (id, inspection_id, status, assinatura)
    values (gen_random_uuid(), '66666666-6666-4666-8666-666666666666', 'conforme', 'p');
    raise exception 'E recebeu vistoria de outra loja';
  exception
    when raise_exception then null;
    when unique_violation then null; -- já recebida: também não pode
  end;
  select count(*) into c from public.recebimentos;
  if c <> 0 then raise exception 'E vê recebimento de outra loja'; end if;
  begin
    insert into public.recebimento_fotos (id, recebimento_id, path)
    values (gen_random_uuid(), '99999999-9999-4999-8999-999999999999', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee/x/receb_2.jpg');
    raise exception 'E pôs foto no recebimento de D';
  exception when insufficient_privilege then null;
  end;
end $$;

-- ---------- A vê todos os recebimentos; C (sem perfil) continua vendo tudo ----------
set local request.jwt.claims = '{"sub":"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa","role":"authenticated"}';
do $$
begin
  if not exists (select 1 from public.recebimentos where id = '99999999-9999-4999-8999-999999999999') then
    raise exception 'vistoriador não vê o recebimento';
  end if;
end $$;
set local request.jwt.claims = '{"sub":"cccccccc-cccc-4ccc-8ccc-cccccccccccc","role":"authenticated"}';
do $$
begin
  if (select count(*) from public.inspections where id in ('66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777')) <> 2 then
    raise exception 'conta sem perfil deixou de ver as vistorias';
  end if;
end $$;

-- ---------- Excluir é de todos (migration 0004) ----------
set local request.jwt.claims = '{"sub":"bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb","role":"authenticated"}';

do $$
declare
  c int;
begin
  delete from public.damage_photos where id = '55555555-5555-4555-8555-555555555555';
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'B não conseguiu apagar a foto de avaria de A'; end if;

  delete from storage.objects where bucket_id = 'vistorias'
    and name = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/11111111-1111-4111-8111-111111111111/frente.jpg';
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'B não conseguiu apagar o arquivo de A no Storage'; end if;

  delete from public.inspections where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics c = row_count;
  if c <> 1 then raise exception 'B não conseguiu apagar a vistoria de A'; end if;
  select count(*) into c from public.damages where id = '44444444-4444-4444-8444-444444444444';
  if c <> 0 then raise exception 'a avaria deveria sair junto com a vistoria'; end if;

  raise notice 'RLS OK';
end $$;

rollback;
