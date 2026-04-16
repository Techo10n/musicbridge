-- ============================================================
-- MusicBridge — Migration 004: Follows system + profile fields
-- Replaces the mutual-friendship model with directed follows.
-- Adds bio, favorite_song to users.
-- Sets up avatars storage bucket.
-- ============================================================

-- ─── Drop old friendship system ───────────────────────────────────────────────

drop table if exists public.friendships cascade;
drop type  if exists friendship_status cascade;

-- ─── Add profile fields to users ──────────────────────────────────────────────

alter table public.users
  add column if not exists bio           text,
  add column if not exists favorite_song jsonb;
-- favorite_song shape: { title: string, artist: string, service: music_service, service_id: string, cover_url: string }

-- ─── Follows ──────────────────────────────────────────────────────────────────
-- Directed graph: follower_id follows following_id.
-- No approval step — instant follow (Instagram model).

create table public.follows (
  id           uuid default uuid_generate_v4() primary key,
  follower_id  uuid references public.users(id) on delete cascade not null,
  following_id uuid references public.users(id) on delete cascade not null,
  created_at   timestamptz default now() not null,
  -- A user can only follow another user once
  unique (follower_id, following_id),
  -- Cannot follow yourself
  check (follower_id <> following_id)
);

alter table public.follows enable row level security;

-- Anyone can see who follows whom (needed for follower/following counts on profiles)
create policy "follows_select_all"
  on public.follows for select
  using (true);

-- Only the follower can create their own follow
create policy "follows_insert_own"
  on public.follows for insert
  with check (auth.uid() = follower_id);

-- Only the follower can unfollow
create policy "follows_delete_own"
  on public.follows for delete
  using (auth.uid() = follower_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index follows_follower_idx  on public.follows(follower_id);
create index follows_following_idx on public.follows(following_id);

-- ─── Avatars storage bucket ───────────────────────────────────────────────────
-- Public read so avatar URLs are accessible without auth.
-- Authenticated users can upload to their own folder (avatars/{user_id}/*).

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

create policy "avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_auth_insert"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_update"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_auth_delete"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and auth.uid() is not null
    and (storage.foldername(name))[1] = auth.uid()::text
  );
