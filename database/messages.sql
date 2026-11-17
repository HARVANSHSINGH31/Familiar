-- What the family asks the brooch to say out loud. The hub polls this, speaks
-- any row with spoken = false, then marks it spoken.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  household text not null default 'demo',
  body text not null,
  spoken boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;
create policy "read own messages" on public.messages for select using (true);
create policy "write own messages" on public.messages for insert with check (true);
create policy "update own messages" on public.messages for update using (true);

alter publication supabase_realtime add table public.messages;
