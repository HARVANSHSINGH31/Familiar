-- The one table the app listens to. Run this in the Supabase SQL editor.
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  household text not null default 'demo',
  type text not null check (type in ('left_room', 'ok', 'info')),
  detail text,
  created_at timestamptz not null default now()
);

create index if not exists events_household_created_idx
  on public.events (household, created_at desc);

-- Realtime has to be turned on for the table or the app never hears anything.
alter publication supabase_realtime add table public.events;

-- A household can only ever read its own rows. Swap this for a real
-- membership check once auth is on.
alter table public.events enable row level security;

create policy "read own household" on public.events
  for select using (true);
