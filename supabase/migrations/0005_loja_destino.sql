-- Loja de destino da vistoria (para onde o veículo vendido é enviado).
-- Fica vazia (null) nas vistorias feitas antes deste campo existir; o app novo
-- sempre envia uma loja da lista em config.js (LOJAS).
-- RODE ESTA MIGRATION ANTES de publicar a versão do app que tem o campo Loja:
-- sem a coluna, o envio das vistorias novas é recusado pelo servidor.

alter table public.inspections add column if not exists loja text;

alter table public.inspections drop constraint if exists inspections_loja_check;
alter table public.inspections add constraint inspections_loja_check
  check (loja is null or btrim(loja) <> '');

-- O dashboard filtra por loja (o índice de realizada_em já existe na 0001).
create index if not exists inspections_loja_idx on public.inspections (loja);
