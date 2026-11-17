-- Reminders the family sets in the app. The hub polls this and speaks them aloud
-- in the recorded voice, which is what makes a reminder real rather than a note.
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  household text not null default 'demo',
  local_id text not null,
  time text not null,
  label text not null,
  kind text not null default 'other',
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique (household, local_id)
);

alter table public.reminders enable row level security;
create policy "read own reminders" on public.reminders for select using (true);
create policy "write own reminders" on public.reminders for insert with check (true);
create policy "update own reminders" on public.reminders for update using (true);

alter publication supabase_realtime add table public.reminders;

-- Storage bucket for the enrolment photos.
insert into storage.buckets (id, name, public) values ('people', 'people', false)
  on conflict (id) do nothing;
