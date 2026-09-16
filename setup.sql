create table public.families (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table public.subcategories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  subcategory_id uuid references public.subcategories(id) on delete cascade,
  name text not null,
  file_url text not null,
  file_path text not null,
  file_type text not null default 'application/octet-stream',
  file_size bigint default 0,
  created_at timestamptz default now()
);

alter table public.families enable row level security;
alter table public.categories enable row level security;
alter table public.subcategories enable row level security;
alter table public.documents enable row level security;

create policy "familias_propias" on public.families
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categorias_propias" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "subcategorias_propias" on public.subcategories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "documentos_propios" on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);