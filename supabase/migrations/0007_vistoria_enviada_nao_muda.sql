-- Vistoria enviada não muda (achado do teste de carga de 20/11/2026).
--
-- A especificação diz "Vistoria finalizada não é editável", e o app nunca altera
-- uma vistoria depois de enviada. Mas as regras da 0001 ainda deixavam o dono
-- alterar, pela API, a vistoria (km, chassi, loja…), as avarias e as fotos de
-- avaria, e substituir as fotos e assinaturas no Storage. Isso permitia mudar um
-- laudo antigo sem deixar rastro.
--
-- 1. Sem UPDATE em inspections, damages e damage_photos (nem para o dono).
-- 2. Storage: o dono só substitui um arquivo ANTES de a vistoria (ou o recebimento)
--    existir no servidor, que é o caso do reenvio depois de uma queda de conexão.
--    Depois de gravado, não substitui mais. Enviar arquivo novo e ler continuam iguais.
--
-- Pode rodar de novo sem problema.

-- ---------------------------------------------------------------------
-- 1. Tabelas: ninguém altera depois de enviado
-- ---------------------------------------------------------------------
drop policy if exists "inspections: dono edita" on public.inspections;
drop policy if exists "damages: dono edita" on public.damages;
drop policy if exists "damage_photos: dono edita" on public.damage_photos;

-- ---------------------------------------------------------------------
-- 2. Storage: substituir só antes de a vistoria/recebimento chegar
--    Caminho: <conta>/<id da vistoria>/<arquivo>
-- ---------------------------------------------------------------------
drop policy if exists "vistorias: dono substitui arquivos" on storage.objects;
drop policy if exists "vistorias: dono substitui antes de enviar" on storage.objects;
create policy "vistorias: dono substitui antes de enviar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'vistorias'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not exists (select 1 from public.inspections i
                    where i.id::text = (storage.foldername(name))[2] and i.user_id = (select auth.uid()))
    and not exists (select 1 from public.recebimentos r
                    where r.inspection_id::text = (storage.foldername(name))[2] and r.user_id = (select auth.uid()))
  )
  with check (
    bucket_id = 'vistorias'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
