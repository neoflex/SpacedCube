-- SpacedCube sync table. Run once in the Supabase SQL editor of your project (safe to run again).
-- One row per user and set (OLL, PLL); the whole state is stored and the newest updatedAt wins (decided by the app).

create table if not exists public.progress (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  "set"      text        not null check ("set" in ('OLL', 'PLL')),
  state      jsonb       not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, "set")
);

-- A state is an object of at most 256 KB (a heavy user with two years of chart history is about 50 KB).
alter table public.progress drop constraint if exists progress_state_check;
alter table public.progress add constraint progress_state_check
  check (jsonb_typeof(state) = 'object' and octet_length(state::text) < 262144);

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

-- "Delete account" in the app: removes the caller's sign-in; their progress rows go with it (on delete cascade).
create or replace function public.delete_my_account()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
