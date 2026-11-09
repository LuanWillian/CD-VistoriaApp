-- Todo usuário cadastrado (logado) pode EXCLUIR qualquer vistoria (e suas avarias,
-- fotos de avaria e arquivos). Ler já era de todos (0003). Criar e editar continuam
-- só para o dono (as policies de insert/update da 0001 não mudam).
--
-- Para voltar a "só o dono exclui", recrie as policies "dono exclui" da 0001
-- no lugar das "todos excluem" abaixo.

drop policy if exists "inspections: dono exclui" on public.inspections;
drop policy if exists "inspections: todos excluem" on public.inspections;
create policy "inspections: todos excluem" on public.inspections
  for delete to authenticated using (true);

drop policy if exists "damages: dono exclui" on public.damages;
drop policy if exists "damages: todos excluem" on public.damages;
create policy "damages: todos excluem" on public.damages
  for delete to authenticated using (true);

drop policy if exists "damage_photos: dono exclui" on public.damage_photos;
drop policy if exists "damage_photos: todos excluem" on public.damage_photos;
create policy "damage_photos: todos excluem" on public.damage_photos
  for delete to authenticated using (true);

-- Storage (bucket privado "vistorias"): apagar arquivos de qualquer pasta.
-- Enviar e substituir continuam só na própria pasta.
drop policy if exists "vistorias: dono exclui arquivos" on storage.objects;
drop policy if exists "vistorias: todos excluem arquivos" on storage.objects;
create policy "vistorias: todos excluem arquivos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'vistorias');
