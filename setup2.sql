create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  relation text default '',
  created_at timestamptz default now()
);

alter table public.documents add column if not exists member_id uuid references public.members(id) on delete set null;

create table if not exists public.family_access (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text default 'member',
  created_at timestamptz default now(),
  unique(family_id, user_id)
);

create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_by uuid not null references auth.users(id),
  invited_email text not null,
  status text default 'pending',
  created_at timestamptz default now()
);

create index if not exists members_family_idx on public.members(family_id);
create index if not exists documents_member_idx on public.documents(member_id);
create index if not exists family_access_user_idx on public.family_access(user_id);
create index if not exists family_invites_email_idx on public.family_invites(invited_email);

alter table public.members enable row level security;
alter table public.family_access enable row level security;
alter table public.family_invites enable row level security;

drop policy if exists "familias_propias" on public.families;
drop policy if exists "categorias_propias" on public.categories;
drop policy if exists "subcategorias_propias" on public.subcategories;
drop policy if exists "documentos_propios" on public.documents;

create policy "fam_select" on public.families for select using (
  auth.uid() = user_id
  or exists (select 1 from public.family_access fa where fa.family_id = families.id and fa.user_id = auth.uid())
);
create policy "fam_insert" on public.families for insert with check (auth.uid() = user_id);
create policy "fam_update" on public.families for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fam_delete" on public.families for delete using (auth.uid() = user_id);

create policy "cat_access" on public.categories for all using (
  exists (select 1 from public.families f where f.id = categories.family_id and (
    f.user_id = auth.uid()
    or exists (select 1 from public.family_access fa where fa.family_id = f.id and fa.user_id = auth.uid())
  ))
) with check (auth.uid() = user_id);

create policy "sub_access" on public.subcategories for all using (
  exists (select 1 from public.categories c where c.id = subcategories.category_id and exists (
    select 1 from public.families f where f.id = c.family_id and (
      f.user_id = auth.uid()
      or exists (select 1 from public.family_access fa where fa.family_id = f.id and fa.user_id = auth.uid())
    )
  ))
) with check (auth.uid() = user_id);

create policy "doc_access" on public.documents for all using (
  exists (select 1 from public.families f where f.id = documents.family_id and (
    f.user_id = auth.uid()
    or exists (select 1 from public.family_access fa where fa.family_id = f.id and fa.user_id = auth.uid())
  ))
) with check (auth.uid() = user_id);

create policy "mem_access" on public.members for all using (
  exists (select 1 from public.families f where f.id = members.family_id and (
    f.user_id = auth.uid()
    or exists (select 1 from public.family_access fa where fa.family_id = f.id and fa.user_id = auth.uid())
  ))
) with check (auth.uid() = user_id);

create policy "acc_select" on public.family_access for select using (
  exists (select 1 from public.families f where f.id = family_access.family_id and f.user_id = auth.uid())
  or user_id = auth.uid()
);
create policy "acc_insert" on public.family_access for insert with check (
  exists (select 1 from public.families f where f.id = family_access.family_id and f.user_id = auth.uid())
  or exists (select 1 from public.family_invites fi
    where fi.family_id = family_access.family_id and fi.status = 'pending'
    and fi.invited_email = (auth.jwt() ->> 'email'))
);
create policy "acc_delete" on public.family_access for delete using (
  exists (select 1 from public.families f where f.id = family_access.family_id and f.user_id = auth.uid())
);

create policy "inv_select" on public.family_invites for select using (
  invited_email = (auth.jwt() ->> 'email')
  or exists (select 1 from public.families f where f.id = family_invites.family_id and f.user_id = auth.uid())
);
create policy "inv_insert" on public.family_invites for insert with check (
  exists (select 1 from public.families f where f.id = family_invites.family_id and f.user_id = auth.uid())
);
create policy "inv_update" on public.family_invites for update using (
  invited_email = (auth.jwt() ->> 'email')
) with check (invited_email = (auth.jwt() ->> 'email'));
create policy "inv_delete" on public.family_invites for delete using (
  exists (select 1 from public.families f where f.id = family_invites.family_id and f.user_id = auth.uid())
);