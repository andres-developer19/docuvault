-- FIX: faltaba la columna member_id en categories (causaba error 400)
alter table public.categories add column if not exists member_id uuid references public.members(id) on delete set null;