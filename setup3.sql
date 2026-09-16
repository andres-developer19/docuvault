-- ============================================================
-- CORRECCION: elimina la recursion infinita en las politicas
-- Causa: familias <-> family_access se consultaban en bucle.
-- Solucion: funcion SECURITY DEFINER que rompe el ciclo.
-- ============================================================

-- Funcion auxiliar: dice si el usuario actual tiene acceso a la familia
create or replace function public.is_family_accessible(family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.families f
    where f.id = family_id
      and (
        f.user_id = auth.uid()
        or exists (
          select 1
          from public.family_access fa
          where fa.family_id = family_id
            and fa.user_id = auth.uid()
        )
      )
  );
$$;

-- Limpieza: borra duplicados de familias (misma persona y nombre)
-- Crea un monton de "Mi Familia" repetidas por el bug anterior.
delete from public.families a
using public.families b
where a.user_id = b.user_id
  and a.name = b.name
  and a.created_at > b.created_at;

-- ========== Reemplazar todas las politicas ==========
drop policy if exists "fam_select" on public.families;
drop policy if exists "fam_insert" on public.families;
drop policy if exists "fam_update" on public.families;
drop policy if exists "fam_delete" on public.families;
drop policy if exists "cat_access" on public.categories;
drop policy if exists "sub_access" on public.subcategories;
drop policy if exists "doc_access" on public.documents;
drop policy if exists "mem_access" on public.members;
drop policy if exists "acc_select" on public.family_access;
drop policy if exists "acc_insert" on public.family_access;
drop policy if exists "acc_delete" on public.family_access;
drop policy if exists "inv_select" on public.family_invites;
drop policy if exists "inv_insert" on public.family_invites;
drop policy if exists "inv_update" on public.family_invites;
drop policy if exists "inv_delete" on public.family_invites;

-- FAMILIAS
create policy "fam_select" on public.families
  for select using (public.is_family_accessible(id));

create policy "fam_insert" on public.families
  for insert with check (auth.uid() = user_id);

create policy "fam_update" on public.families
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "fam_delete" on public.families
  for delete using (auth.uid() = user_id);

-- CATEGORIAS
create policy "cat_access" on public.categories
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id);

-- SUBCATEGORIAS
create policy "sub_access" on public.subcategories
  for all using (
    exists (
      select 1 from public.categories c
      where c.id = subcategories.category_id
        and public.is_family_accessible(c.family_id)
    )
  )
  with check (auth.uid() = user_id);

-- DOCUMENTOS
create policy "doc_access" on public.documents
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id);

-- MIEMBROS
create policy "mem_access" on public.members
  for all using (public.is_family_accessible(family_id))
  with check (auth.uid() = user_id);

-- ACCESO COMPARTIDO
create policy "acc_select" on public.family_access
  for select using (public.is_family_accessible(family_id));

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
        and fi.invited_email = (auth.jwt() ->> 'email')
        and family_access.user_id = auth.uid()
    )
  );

create policy "acc_delete" on public.family_access
  for delete using (
    exists (
      select 1 from public.families f
      where f.id = family_access.family_id and f.user_id = auth.uid()
    )
  );

-- INVITACIONES
create policy "inv_select" on public.family_invites
  for select using (
    invited_email = (auth.jwt() ->> 'email')
    or public.is_family_accessible(family_id)
  );

create policy "inv_insert" on public.family_invites
  for insert with check (
    exists (
      select 1 from public.families f
      where f.id = family_invites.family_id and f.user_id = auth.uid()
    )
  );

create policy "inv_update" on public.family_invites
  for update using (invited_email = (auth.jwt() ->> 'email'))
  with check (invited_email = (auth.jwt() ->> 'email'));

create policy "inv_delete" on public.family_invites
  for delete using (
    exists (
      select 1 from public.families f
      where f.id = family_invites.family_id and f.user_id = auth.uid()
    )
  );