-- =====================================================================
-- CD Vistoria — APAGA OS DADOS DE DEMONSTRAÇÃO
--
-- Apaga só as vistorias criadas por demo_criar.sql (ids md5('demo-cdvistoria-N')).
-- As avarias e os recebimentos delas saem junto (on delete cascade).
-- Vistorias de verdade não são tocadas.
--
-- Como usar: Supabase → SQL Editor → New query → cole TUDO → Run.
-- =====================================================================
delete from public.inspections
where id in (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g);

select count(*) as demonstracao_restante
from public.inspections
where id in (select md5('demo-cdvistoria-' || g)::uuid from generate_series(1, 1000) g);
