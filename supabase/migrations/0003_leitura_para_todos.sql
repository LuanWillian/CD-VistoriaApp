-- Todo usuário cadastrado (logado) pode VER todas as vistorias, avarias, fotos
-- de avaria e arquivos (fotos e assinaturas). Criar, editar e excluir continuam
-- só para o dono (as policies de insert/update/delete da 0001 não mudam).
--
-- Para voltar ao modelo "cada um vê só as suas", recrie as policies "dono lê"
-- da 0001 no lugar das "todos leem" abaixo.

-- ---------------------------------------------------------------------
-- 1. Tabelas
-- ---------------------------------------------------------------------
drop policy if exists "inspections: dono lê" on public.inspections;
drop policy if exists "inspections: todos leem" on public.inspections;
create policy "inspections: todos leem" on public.inspections
  for select to authenticated using (true);

drop policy if exists "damages: dono lê" on public.damages;
drop policy if exists "damages: todos leem" on public.damages;
create policy "damages: todos leem" on public.damages
  for select to authenticated using (true);

drop policy if exists "damage_photos: dono lê" on public.damage_photos;
drop policy if exists "damage_photos: todos leem" on public.damage_photos;
create policy "damage_photos: todos leem" on public.damage_photos
  for select to authenticated using (true);

-- ---------------------------------------------------------------------
-- 2. Storage (bucket privado "vistorias"): leitura para todos os logados.
--    Enviar, substituir e excluir arquivos continua só na própria pasta.
-- ---------------------------------------------------------------------
drop policy if exists "vistorias: dono lê arquivos" on storage.objects;
drop policy if exists "vistorias: todos leem arquivos" on storage.objects;
create policy "vistorias: todos leem arquivos" on storage.objects
  for select to authenticated
  using (bucket_id = 'vistorias');
