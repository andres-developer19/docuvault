-- FIX 1: Políticas de Storage — permitir a usuarios autenticados subir/editar/borrar en documentos/<su-id>/...
drop policy if exists "Public read documentos" on storage.objects;
create policy "Public read documentos" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'documentos');

drop policy if exists "Auth upload documentos" on storage.objects;
create policy "Auth upload documentos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Auth update documentos" on storage.objects;
create policy "Auth update documentos" on storage.objects
  for update to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'documentos'
              and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Auth delete documentos" on storage.objects;
create policy "Auth delete documentos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documentos'
         and (storage.foldername(name))[1] = auth.uid()::text);

-- FIX 2: El titular ("Yo") pasa a ser miembro automático de su familia
insert into public.members (user_id, family_id, name, relation)
select f.user_id, f.id, 'Yo', 'Titular'
from public.families f
where not exists (
  select 1 from public.members m
  where m.family_id = f.id
    and m.user_id = f.user_id
    and m.relation = 'Titular'
);