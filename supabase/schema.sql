-- SpacedCube sync table. Run once in the Supabase SQL editor of your project.
-- One row per user and set (OLL, PLL); the whole state is stored and the newest updatedAt wins (decided by the app).

create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  "set"      text        not null check ("set" in ('OLL', 'PLL')),
  state      jsonb       not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) < 512000),
  updated_at timestamptz not null default now(),
  primary key (user_id, "set")
);

alter table public.progress enable row level security;

-- Signed-in users see and change only their own rows.
drop policy if exists "own rows" on public.progress;
create policy "own rows" on public.progress
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The anon role (requests made with only the public key) gets nothing.
revoke all on public.progress from anon;
grant select, insert, update, delete on public.progress to authenticated;
