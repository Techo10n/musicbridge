-- ============================================================
-- Public drops: a share addressed to everyone who follows you.
--
-- Until now every share had exactly one recipient, so the feed could only ever
-- contain things sent directly to you. A drop is the same row with
-- `recipient_id` null, which keeps one table, one insert path, and one card
-- rather than inventing a parallel "post" concept that would need its own
-- conversion, reactions and notifications.
-- ============================================================

alter table public.shared_items
  alter column recipient_id drop not null;

comment on column public.shared_items.recipient_id is
  'Null means a public drop: visible to everyone who follows the sender, rather '
  'than to one person. `opened` is meaningless for these — it is a property of '
  'the row, and a drop has many viewers.';

-- SELECT: the sender, the addressee, or a follower when there is no addressee.
--
-- The follow check is scoped to drops on purpose. Applying it to every row
-- would let a follower read direct messages between two people they follow,
-- which is the opposite of what a direct share means.
drop policy if exists "shared_items_select_participants" on public.shared_items;

create policy "shared_items_select_participants"
  on public.shared_items for select
  using (
    auth.uid() = sender_id
    or auth.uid() = recipient_id
    or (
      recipient_id is null
      and exists (
        select 1 from public.follows
         where follower_id = auth.uid()
           and following_id = shared_items.sender_id
      )
    )
  );

-- The feed reads drops by sender and date. Without this it is a sequential scan
-- over every row that has no recipient.
create index if not exists shared_items_public_idx
  on public.shared_items (sender_id, created_at desc)
  where recipient_id is null;

-- `shared_items_update_recipient` already reads `auth.uid() = recipient_id`,
-- which is null for a drop, so nobody can mark one opened. That is correct and
-- needs no change: unread state belongs to a direct share.
