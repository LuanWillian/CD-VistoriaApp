-- =====================================================================
-- CD Vistoria — DADOS DE DEMONSTRAÇÃO (para apresentar o app)
--
-- Cria 120 vistorias falsas dos últimos 75 dias, com as marcas da empresa,
-- avarias e recebimentos nas lojas. Não cria fotos nem assinaturas (as telas
-- mostram o espaço vazio e o PDF sai sem as imagens).
--
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- Pode rodar de novo: apaga os dados de demonstração antigos e cria outros.
-- Para tirar tudo depois: supabase/snippets/demo_apagar.sql.
--
-- Todas as vistorias ficam na conta do primeiro vistoriador cadastrado em
-- "perfis". Os nomes de vistoriador, motorista e de quem recebeu na loja são
-- inventados. Os ids seguem o padrão md5('demo-cdvistoria-N'), o que permite
-- apagar só a demonstração sem tocar nas vistorias de verdade.
-- =====================================================================
begin;

-- Os gatilhos de inserção exigem a conta logada no app (vistoriador ou loja).
-- No SQL Editor não há conta logada: desliga só durante este script.
alter table public.inspections disable trigger inspections_antes_inserir;
alter table public.recebimentos disable trigger recebimentos_antes_inserir;

-- Remove uma demonstração anterior (as avarias e recebimentos vão junto).
delete from public.inspections
where id in (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g);

do $$
declare
  dono uuid;
  -- marca | modelo | combustível | loja de destino
  -- marca|modelo|combustível|loja de destino
  carros text[] := array[
    'GWM|Haval H6 HEV|Híbrido|PG Prime GWM Natal',
    'GWM|Haval H6 PHEV|Híbrido|PG Prime GWM João Pessoa',
    'GWM|Haval H6 GT|Híbrido|PG Prime GWM Mossoró',
    'GWM|Tank 300|Híbrido|PG Prime GWM Natal',
    'GWM|Ora 03|Elétrico|PG Prime GWM João Pessoa',
    'GWM|Poer P30|Diesel|PG Prime GWM Mossoró',
    'Jeep|Compass|Flex|PG Prime Jeep Natal',
    'Jeep|Renegade|Flex|PG Prime Jeep Natal',
    'Jeep|Commander|Diesel|PG Prime Jeep Natal',
    'Jeep|Rampage|Diesel|PG Prime Jeep Natal',
    'BMW|X1 sDrive20i|Gasolina|PG Prime BMW Natal',
    'BMW|320i M Sport|Gasolina|PG Prime BMW João Pessoa',
    'BMW|X3 xDrive30e|Híbrido|PG Prime BMW Natal',
    'BMW|X5 xDrive50e|Híbrido|PG Prime BMW João Pessoa',
    'BMW|iX1 xDrive30|Elétrico|PG Prime BMW Natal',
    'Audi|Q3 Sportback|Gasolina|PG Prime Audi Natal',
    'Audi|Q5|Gasolina|PG Prime Audi Natal',
    'Audi|A3 Sedan|Gasolina|PG Prime Audi Natal',
    'Audi|Q8 e-tron|Elétrico|PG Prime Audi Natal',
    'Land Rover|Defender 110|Diesel|PG Prime Selection Natal',
    'Land Rover|Range Rover Evoque|Gasolina|PG Prime Selection João Pessoa',
    'Land Rover|Discovery Sport|Diesel|PG Prime Selection Natal',
    'Leapmotor|C10|Elétrico|PG Prime Selection Natal',
    'Leapmotor|C10 REEV|Híbrido|PG Prime Selection João Pessoa',
    'BAIC|X55|Gasolina|PG Prime Selection Natal',
    'BRP|Can-Am Maverick R|Gasolina|PG Prime Selection Natal',
    'BRP|Can-Am Spyder RT|Gasolina|PG Prime Selection João Pessoa',
    'Triumph|Tiger 900|Gasolina|PG Prime Selection Natal',
    'Triumph|Street Triple RS|Gasolina|PG Prime Selection João Pessoa'
  ];
  cores text[] := array['Branco', 'Preto', 'Prata', 'Cinza', 'Azul', 'Vermelho', 'Verde'];
  vistoriadores text[] := array['Carlos Henrique', 'Marcos Vinícius', 'Rafael Souza'];
  motoristas text[] := array['José Ribamar', 'Antônio Carlos', 'Francisco Neto', 'Paulo Roberto', 'Severino Alves'];
  recebedores text[] := array['Ana Beatriz', 'Bruno Medeiros', 'Camila Farias', 'Diego Nunes', 'Larissa Melo', 'Thiago Rocha'];
  checklist_itens text[] := array['Antena', 'Calotas', 'Manual do proprietário', 'Triângulo', 'Equipamento de som',
    'Estepe/Kit', 'Bateria', 'Documento', 'Macaco', 'Chave de roda', 'Extintor', 'Tapetes', 'Carregador'];
  areas text[] := array['Para-choque dianteiro', 'Capô', 'Para-brisa', 'Porta dianteira esquerda', 'Porta dianteira direita',
    'Porta traseira esquerda', 'Paralama dianteiro direito', 'Lateral traseira esquerda', 'Tampa do porta-malas',
    'Para-choque traseiro', 'Faróis/Lanternas', 'Retrovisores', 'Rodas/Pneus', 'Interior'];
  tipos text[] := array['Amassado', 'Arranhão', 'Risco', 'Trinca', 'Quebrado', 'Faltando peça', 'Descascado/Pintura danificada'];
  divergencias text[] := array[
    'Risco na porta traseira direita que não consta na vistoria.',
    'Retrovisor esquerdo com a capa solta.',
    'Faltou o manual do proprietário no porta-luvas.',
    'Pequeno amassado no para-choque traseiro.',
    'Tapete dianteiro do passageiro não veio.'
  ];
  letras text := 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
  n int;
  vid uuid;
  carro text[];
  quando timestamptz;
  chassi text;
  checklist jsonb;
  sem_avarias boolean;
  qtd_avarias int;
  sorteio float;
  gravidade text;
  pasta text;
begin
  select p.id into dono from public.perfis p
  where coalesce(p.papel, 'vistoriador') = 'vistoriador'
  order by p.created_at limit 1;
  if dono is null then
    raise exception 'Cadastre ao menos um vistoriador em "perfis" antes de criar a demonstração.';
  end if;

  perform setseed(0.42); -- mesmos dados a cada execução

  for n in 1..120 loop
    vid := md5('demo-cdvistoria-' || n)::uuid;
    carro := string_to_array(carros[1 + floor(random() * array_length(carros, 1))::int], '|');
    -- Mais vistorias nos dias recentes; 4 delas hoje (para o filtro "Hoje").
    if n <= 4 then
      quando := date_trunc('day', now()) + make_interval(hours => 8 + n * 2, mins => floor(random() * 50)::int);
      if quando > now() then quando := now() - make_interval(mins => n * 7); end if;
    else
      quando := date_trunc('day', now())
        - make_interval(days => 1 + floor(power(random(), 1.6) * 74)::int)
        + make_interval(hours => 7 + floor(random() * 11)::int, mins => floor(random() * 60)::int);
    end if;

    chassi := '';
    for i in 1..6 loop
      chassi := chassi || substr(letras, 1 + floor(random() * length(letras))::int, 1);
    end loop;

    checklist := '{}'::jsonb;
    for i in 1..array_length(checklist_itens, 1) loop
      checklist := checklist || jsonb_build_object(checklist_itens[i],
        case when random() < 0.08 then 'ausente' else 'presente' end);
    end loop;

    sem_avarias := random() < 0.62;
    pasta := dono::text || '/' || vid::text || '/';

    insert into public.inspections (
      id, numero, user_id, loja, chassi, marca, modelo, cor, km, combustivel, checklist, checklist_obs, sem_avarias,
      vistoriador_nome, motorista_nome, foto_frente, foto_traseira, foto_chassi,
      assinatura_vistoriador, assinatura_motorista, realizada_em, created_at, updated_at
    ) values (
      vid, public.gerar_numero_vistoria(), dono, carro[4], chassi, carro[1], carro[2],
      cores[1 + floor(random() * array_length(cores, 1))::int],
      floor(random() * 40)::int, carro[3], checklist, null, sem_avarias,
      vistoriadores[1 + floor(random() * array_length(vistoriadores, 1))::int],
      motoristas[1 + floor(random() * array_length(motoristas, 1))::int],
      pasta || 'frente.jpg', pasta || 'traseira.jpg', pasta || 'chassi.jpg',
      pasta || 'ass_vistoriador.png', pasta || 'ass_motorista.png',
      quando, quando, quando
    );

    if not sem_avarias then
      qtd_avarias := 1 + floor(power(random(), 2) * 3)::int;
      for i in 1..qtd_avarias loop
        sorteio := random();
        gravidade := case when sorteio < 0.55 then 'Leve' when sorteio < 0.87 then 'Moderada' else 'Grave' end;
        insert into public.damages (id, inspection_id, area, tipo, gravidade, descricao)
        values (
          md5('demo-cdvistoria-avaria-' || n || '-' || i)::uuid, vid,
          areas[1 + floor(random() * array_length(areas, 1))::int],
          tipos[1 + floor(random() * array_length(tipos, 1))::int],
          gravidade, null
        );
      end loop;
    end if;

    -- Recebimento na loja: quase todas as de mais de 2 dias já foram recebidas;
    -- as mais recentes ficam "Aguardando recebimento".
    if quando < now() - interval '2 days' and random() < 0.9 then
      if random() < 0.86 then
        insert into public.recebimentos (id, inspection_id, user_id, recebedor_nome, loja, status, descricao, assinatura, recebido_em)
        values (md5('demo-cdvistoria-receb-' || n)::uuid, vid, dono,
          recebedores[1 + floor(random() * array_length(recebedores, 1))::int], carro[4], 'conforme', null,
          pasta || 'receb_assinatura.png', quando + make_interval(hours => 18 + floor(random() * 30)::int));
      else
        insert into public.recebimentos (id, inspection_id, user_id, recebedor_nome, loja, status, descricao, assinatura, recebido_em)
        values (md5('demo-cdvistoria-receb-' || n)::uuid, vid, dono,
          recebedores[1 + floor(random() * array_length(recebedores, 1))::int], carro[4], 'divergencia',
          divergencias[1 + floor(random() * array_length(divergencias, 1))::int],
          pasta || 'receb_assinatura.png', quando + make_interval(hours => 18 + floor(random() * 30)::int));
      end if;
    end if;
  end loop;

  raise notice 'Demonstração criada: 120 vistorias na conta %.', dono;
end;
$$;

alter table public.inspections enable trigger inspections_antes_inserir;
alter table public.recebimentos enable trigger recebimentos_antes_inserir;

commit;

-- Conferência rápida
select
  count(*) as vistorias,
  count(*) filter (where realizada_em >= date_trunc('day', now())) as hoje,
  (select count(*) from public.damages d where d.inspection_id in
    (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g)) as avarias,
  (select count(*) from public.recebimentos r where r.inspection_id in
    (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g)) as recebimentos
from public.inspections
where id in (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g);
