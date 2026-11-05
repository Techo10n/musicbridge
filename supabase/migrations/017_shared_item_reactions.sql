-- ============================================================
-- Reactions on shares: one emoji per person per share.
--
-- The client has read and written `shared_item_reactions` since reactions
-- shipped, but no migration ever created it, and production never had it.
-- supabase-js reports errors in its result rather than throwing, so every
-- reaction looked saved until the next reload.
--
-- Any emoji is allowed: the app uses the system emoji picker. The length cap
-- only stops abuse. Joined sequences (skin tones, families, flags) run to about
-- ten code points, well under 32.
-- ============================================================

create table if not exists public.shared_item_reactions (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.shared_items (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  -- `useReactions` upserts on this pair, so switching a reaction replaces it.
  unique (item_id, user_id)
);

-- The feed loads reactions for a page of items at once.
create index if not exists shared_item_reactions_item_idx
  on public.shared_item_reactions (item_id);

alter table public.shared_item_reactions enable row level security;

-- Visibility follows the share. The subquery runs under the caller's own RLS
-- on `shared_items`, so anyone who can see a share can see its reactions,
-- and nobody else can.
create policy "reactions_select_visible_items"
  on public.shared_item_reactions for select
  using (exists (select 1 from public.shared_items si where si.id = item_id));

create policy "reactions_insert_own"
  on public.shared_item_reactions for insert
  with check (
    auth.uid() = user_id
    and exists (select 1 from public.shared_items si where si.id = item_id)
  );

create policy "reactions_update_own"
  on public.shared_item_reactions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reactions_delete_own"
  on public.shared_item_reactions for delete
  using (auth.uid() = user_id);
