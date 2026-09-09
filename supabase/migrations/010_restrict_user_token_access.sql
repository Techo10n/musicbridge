-- Lock down public.users so OAuth tokens are no longer readable by every
-- authenticated user.
--
-- Problem: `users_select_all` (001_initial.sql) used `using (true)` — row
-- level security is per-row, not per-column, so it also exposed
-- spotify_access_token / spotify_refresh_token / apple_music_user_token /
-- youtube_access_token / youtube_refresh_token to any authenticated caller who
-- ran `select('*')` (or even a targeted column list) against someone else's
-- row. The client actively did this (UserProfileModal fetching another
-- user's row with `select('*')`).
--
-- `users_select_all` existed because friend search, the People tab, and
-- sender/follower display all need a handful of public profile fields for
-- OTHER users' rows. Removing it outright breaks all of those. Instead:
--
--   1. Replace it with an owner-only SELECT policy, so the base table
--      (including every token column) is only ever readable by its own row's
--      owner.
--   2. Add a `public.user_public_profiles` view exposing only the
--      non-sensitive columns, for every row. Views execute with the
--      privileges of their *owner* (the migration role, typically a
--      superuser/table owner) rather than the querying role, so this view
--      bypasses the owner-only RLS policy above by design while never
--      selecting the token columns in the first place — there is no column
--      list to widen later by accident.
--
-- Call sites that previously embedded `users` directly via PostgREST
-- (`sender:sender_id(...)`, `following:following_id(...)`, etc.) are updated
-- in the same change to fetch public profile data from
-- `user_public_profiles` with a separate batched query instead of relying on
-- PostgREST's embedding-through-views support, which is version-dependent
-- and cannot be verified against the live project from here.

drop policy if exists "users_select_all" on public.users;

create policy "users_select_own"
  on public.users for select
  using (auth.uid() = id);

create view public.user_public_profiles
  with (security_invoker = false)
as
select
  id,
  username,
  display_name,
  avatar_url,
  bio,
  primary_service,
  favorite_song,
  created_at
from public.users;

comment on view public.user_public_profiles is
  'Public-safe projection of public.users. Excludes every OAuth token column. '
  'Readable by any authenticated user regardless of the owner-only RLS policy '
  'on public.users, because views run as their owner rather than the caller.';

grant select on public.user_public_profiles to authenticated;
