-- The people the brooch should recognise. The app writes here, the hub reads it
-- and enrols the faces. Run this in the Supabase SQL editor alongside events.sql.
create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  household text not null default 'demo',
  name text not null,
  relationship text not null,
  photo_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists people_household_idx on public.people (household);

alter table public.people enable row level security;
create policy "read own household people" on public.people for select using (true);
create policy "write own household people" on public.people for insert with check (true);
create policy "delete own household people" on public.people for delete using (true);

-- The hub polls this and pulls the photos it needs from storage.
alter publication supabase_realtime add table public.people;
