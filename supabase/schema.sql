-- טבלת הנתונים האישיים של כל משתמש: שמורים, אהבתי, העדפות, רצף ומה שכבר נראה.
create table if not exists public.user_data (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at bigint not null default 0
);

alter table public.user_data enable row level security;

-- כל משתמש רואה ומשנה רק את השורה שלו
create policy "own row: select" on public.user_data
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "own row: insert" on public.user_data
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own row: update" on public.user_data
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own row: delete" on public.user_data
  for delete to authenticated using ((select auth.uid()) = user_id);
