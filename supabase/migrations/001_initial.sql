-- ============================================================
-- MusicBridge — Initial Schema Migration
-- Run this in the Supabase SQL editor or via the CLI:
--   supabase db push
-- ============================================================

-- Enable UUID helper
create extension if not exists "uuid-ossp";

-- ─── Enum Types ──────────────────────────────────────────────────────────────

create type music_service as enum ('spotify', 'apple_music', 'youtube_music');
create type friendship_status as enum ('pending', 'accepted', 'declined');
create type shared_item_type as enum ('song', 'playlist');

-- ─── Users ───────────────────────────────────────────────────────────────────
-- Extends auth.users — one row per registered user.
-- Token columns are nullable so the user can connect services incrementally.

create table public.users (
  id                     uuid references auth.users on delete cascade not null primary key,
  username               text unique not null,
  display_name           text not null,
  avatar_url             text,
  primary_service        music_service,
  -- Spotify OAuth tokens
  spotify_access_token   text,
  spotify_refresh_token  text,
  spotify_token_expiry   timestamptz,
  -- Apple Music user token (obtained via MusicKit)
  apple_music_user_token text,
  -- YouTube / Google OAuth tokens
  youtube_access_token   text,
  youtube_refresh_token  text,
  youtube_token_expiry   timestamptz,
  created_at             timestamptz default now() not null
);

-- ─── Friendships ─────────────────────────────────────────────────────────────

create table public.friendships (
  id           uuid default uuid_generate_v4() primary key,
  requester_id uuid references public.users(id) on delete cascade not null,
  addressee_id uuid references public.users(id) on delete cascade not null,
  status       friendship_status default 'pending' not null,
  created_at   timestamptz default now() not null,
  -- Each pair can only have one friendship record
  unique (requester_id, addressee_id)
);

-- ─── Shared Items ─────────────────────────────────────────────────────────────
-- Stores songs and playlists shared between users.
-- Service-specific IDs are stored so each recipient can open the item
-- in whichever streaming service they use.

create table public.shared_items (
  id                        uuid default uuid_generate_v4() primary key,
  sender_id                 uuid references public.users(id) on delete cascade not null,
  recipient_id              uuid references public.users(id) on delete cascade not null,
  type                      shared_item_type not null,
  title                     text not null,
  artist                    text,                 -- null for playlists
  cover_image_url           text not null,
  -- Song IDs across services (null if not resolved for that service)
  spotify_id                text,
  apple_music_id            text,
  youtube_music_id          text,
  -- Playlist IDs across services
  spotify_playlist_id       text,
  apple_music_playlist_id   text,
  youtube_music_playlist_id text,
  -- Array of track objects: [{title, artist, spotify_id, apple_music_id, youtube_music_id}]
  tracks                    jsonb,
  message                   text,
  opened                    boolean default false not null,
  created_at                timestamptz default now() not null
);

-- ─── Row Level Security ───────────────────────────────────────────────────────

alter table public.users         enable row level security;
alter table public.friendships   enable row level security;
alter table public.shared_items  enable row level security;

-- ── Users RLS ─────────────────────────────────────────────────────────────────

-- Allow users to register their own profile row
create policy "users_insert_own"
  on public.users for insert
  with check (auth.uid() = id);

-- Users can read any profile (needed for friend search & sender info)
create policy "users_select_all"
  on public.users for select
  using (true);

-- Users can only update their own profile
create policy "users_update_own"
  on public.users for update
  using (auth.uid() = id);

-- ── Friendships RLS ───────────────────────────────────────────────────────────

-- Requester or addressee can read the friendship
create policy "friendships_select_participants"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- Only the requester can create a friendship request
create policy "friendships_insert_requester"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

-- Either participant can update (accept/decline)
create policy "friendships_update_participants"
  on public.friendships for update
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ── Shared Items RLS ──────────────────────────────────────────────────────────

-- Sender or recipient can read shared items
create policy "shared_items_select_participants"
  on public.shared_items for select
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

-- Only the sender can create a shared item
create policy "shared_items_insert_sender"
  on public.shared_items for insert
  with check (auth.uid() = sender_id);

-- Only the recipient can update (e.g. mark as opened)
create policy "shared_items_update_recipient"
  on public.shared_items for update
  using (auth.uid() = recipient_id);

-- ─── Indexes ──────────────────────────────────────────────────────────────────

create index friendships_requester_idx  on public.friendships(requester_id);
create index friendships_addressee_idx  on public.friendships(addressee_id);
create index shared_items_recipient_idx on public.shared_items(recipient_id, created_at desc);
create index shared_items_sender_idx    on public.shared_items(sender_id);
