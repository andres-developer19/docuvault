-- ============================================================
-- CORRECCION 6: 2 bugs detectados en pruebas E2E
-- 1) Correos con mayusculas: Supabase guarda el correo en minusculas,
--    las invitaciones se comparaban con exactitud y no se veian.
-- 2) SEGURIDAD: cualquier usuario registrado podia meter categorias/
--    subcategorias/documentos/miembros en familias ajenas porque el
--    WITH CHECK solo exigia auth.uid() = user_id.
-- ============================================================

-- ========== 1) Correos: comparacion sin distinguir mayusculas ==========

drop policy if exists "inv_select" on public.family_invites;
create policy "inv_select" on public.family_invites
  for select using (
    lower(invited_email) = lower(auth.jwt() ->> 'email')
    or public.is_family_accessible(family_id)
  );

drop policy if exists "inv_update" on public.family_invites;
create policy "inv_update" on public.family_invites
  for update using (lower(invited_email) = lower(auth.jwt() ->> 'email'))
  with check (lower(invited_email) = lower(auth.jwt() ->> 'email'));

drop policy if exists "acc_insert" on public.family_access;
create policy "acc_insert" on public.family_access
  for insert with check (
    exists (
      select 1 from public.families f
      where f.id = family_access.family_id and f.user_id = auth.uid()
    )
    or exists (
      select 1 from public.family_invites fi
      where fi.family_id = family_access.family_id
        and fi.status = 'pending'
        and lower(fi.invited_email) = lower(auth.jwt() ->> 'email')
        and family_access.user_id = auth.uid()
    )
  );

-- ========== 2) Seguridad: SOLO miembros reales escriben ==========

drop policy if exists "cat_access" on public.categories;
create policy "cat_access" on public.categories
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id and public.is_family_accessible(family_id));

drop policy if exists "mem_access" on public.members;
create policy "mem_access" on public.members
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id and public.is_family_accessible(family_id));

drop policy if exists "doc_access" on public.documents;
create policy "doc_access" on public.documents
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id and public.is_family_accessible(family_id));

drop policy if exists "sub_access" on public.subcategories;
create policy "sub_access" on public.subcategories
  for all using (
    exists (
      select 1 from public.categories c
      where c.id = subcategories.category_id
        and public.is_family_accessible(c.family_id)
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.categories c
      where c.id = subcategories.category_id
        and public.is_family_accessible(c.family_id)
    )
  );