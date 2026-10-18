-- Stream Zone customer reviews: run this in Supabase SQL Editor.
-- Public visitors can read and submit reviews immediately.
-- Only user IDs explicitly added to review_admins can delete reviews.

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 50),
  product text not null check (char_length(btrim(product)) between 1 and 60),
  rating integer not null check (rating between 1 and 5),
  body text not null check (char_length(btrim(body)) between 8 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.review_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;
alter table public.review_admins enable row level security;

drop policy if exists "Anyone can read reviews" on public.reviews;
create policy "Anyone can read reviews"
  on public.reviews for select
  to anon, authenticated
  using (true);

drop policy if exists "Anyone can post a review" on public.reviews;
create policy "Anyone can post a review"
  on public.reviews for insert
  to anon, authenticated
  with check (
    char_length(btrim(display_name)) between 1 and 50
    and char_length(btrim(product)) between 1 and 60
    and rating between 1 and 5
    and char_length(btrim(body)) between 8 and 1000
  );

drop policy if exists "Only listed admins can delete reviews" on public.reviews;
create policy "Only listed admins can delete reviews"
  on public.reviews for delete
  to authenticated
  using (
    exists (
      select 1 from public.review_admins
      where review_admins.user_id = (select auth.uid())
    )
  );

drop policy if exists "Admins can view their own admin record" on public.review_admins;
create policy "Admins can view their own admin record"
  on public.review_admins for select
  to authenticated
  using (user_id = (select auth.uid()));

-- IMPORTANT: after creating your admin login under Supabase Authentication,
-- copy that user's UUID and run the following separately, replacing the UUID:
-- insert into public.review_admins (user_id)
-- values ('PASTE-ADMIN-AUTH-USER-UUID-HERE')
-- on conflict (user_id) do nothing;
--
-- Do NOT add a public insert/update policy to review_admins.
-- Do NOT expose your service_role key in website files.
