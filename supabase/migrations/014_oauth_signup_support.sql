-- ============================================================
-- Let an OAuth sign-up create a profile row.
--
-- Problem: handle_new_user (002) reads `username` and `display_name` out of
-- raw_user_meta_data and inserts them into public.users, where both columns
-- are NOT NULL. Only the app's own email+password signUp() puts them there.
-- A Sign in with Apple or Google sign-in carries neither, so the insert
-- raised a not-null violation — and because the trigger fires on
-- auth.users, that aborted account creation entirely rather than just
-- skipping the profile row. Passwordless email OTP has the same shape.
--
-- Fix: give every new row a username it can keep until the user picks one,
-- and record whether the user has actually chosen it. Onboarding requires a
-- real username before the app is usable, so the placeholder is never shown
-- to anyone but its owner, and only briefly.
-- ============================================================

-- Existing rows all have a username the user chose at registration.
alter table public.users
  add column if not exists username_claimed boolean not null default true;

comment on column public.users.username_claimed is
  'False while the username is the auto-generated placeholder from '
  'handle_new_user(). Onboarding sets it true once the user picks one.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  meta_username     text := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  meta_display_name text := nullif(trim(new.raw_user_meta_data ->> 'display_name'), '');
  -- Google sends `full_name` and `name`; Apple sends nothing after the first
  -- authorization, and nothing at all when the user hides their email.
  oauth_name        text := coalesce(
                              nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
                              nullif(trim(new.raw_user_meta_data ->> 'name'), '')
                            );
  -- The id is already unique, so a placeholder derived from it cannot collide
  -- and needs no retry loop.
  placeholder       text := 'user_' || substr(replace(new.id::text, '-', ''), 1, 12);
begin
  insert into public.users (id, username, display_name, username_claimed)
  values (
    new.id,
    coalesce(meta_username, placeholder),
    coalesce(
      meta_display_name,
      oauth_name,
      -- Local part of the email, when there is one to use.
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ),
    meta_username is not null
  );
  return new;
end;
$$;

-- Case-insensitive uniqueness. Without this, "Zech" and "zech" are two
-- accounts, and the availability check in onboarding would call a taken name
-- free. Onboarding lowercases every new username, so this only has to bring
-- existing rows into line.
--
-- Lowercase what can be lowercased without colliding. A row is left alone if
-- another row already holds its lowercase form, so this can never merge two
-- accounts; the index below then fails loudly and names the pair, which is the
-- right outcome because resolving it means picking a winner.
update public.users u
   set username = lower(u.username)
 where u.username <> lower(u.username)
   and not exists (
     select 1 from public.users o
      where o.id <> u.id
        and lower(o.username) = lower(u.username)
   );

create unique index if not exists users_username_lower_key
  on public.users (lower(username));

-- Usernames must be resolvable before sign-up completes, so the availability
-- check cannot depend on the caller being authenticated. SECURITY DEFINER
-- answers one boolean without exposing any row.
create or replace function public.username_available(candidate text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select not exists (
    select 1 from public.users where lower(username) = lower(trim(candidate))
  );
$$;

grant execute on function public.username_available(text) to anon, authenticated;
