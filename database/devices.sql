-- The brooch and hub publish their own state here. The app never invents it:
-- if nothing has been written, the app says "Not connected".
create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  household text not null default 'demo',
  pairing_code text unique not null,
  name text not null default 'ARERA Brooch',
  battery int,
  worn boolean default false,
  online boolean default false,
  wifi text,
  firmware text,
  last_seen timestamptz default now(),
  paired_at timestamptz default now()
);

alter table public.devices enable row level security;
create policy "read own devices" on public.devices for select using (true);
create policy "write own devices" on public.devices for insert with check (true);
create policy "update own devices" on public.devices for update using (true);

alter publication supabase_realtime add table public.devices;
