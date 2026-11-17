-- Households and members, so two families can never see each other.
-- Run after events.sql, people.sql and reminders.sql.
create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Home',
  created_at timestamptz not null default now()
);

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  household uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  role text not null default 'owner',      -- owner | carer | viewer
  created_at timestamptz not null default now(),
  unique (household, user_id)
);

alter table public.households enable row level security;
alter table public.members enable row level security;

-- You see a household only if you are a member of it.
create policy "members read their household" on public.households
  for select using (exists (
    select 1 from public.members m where m.household = households.id and m.user_id = auth.uid()
  ));

create policy "members read the member list" on public.members
  for select using (exists (
    select 1 from public.members m where m.household = members.household and m.user_id = auth.uid()
  ));

-- Replace the temporary "demo" policies on the data tables with real ones.
drop policy if exists "read own household" on public.events;
create policy "read own household events" on public.events for select using (
  exists (select 1 from public.members m where m.user_id = auth.uid()
          and m.household::text = events.household)
);
