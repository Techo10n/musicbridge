-- ============================================================
-- Make the notification switches in Settings actually do something.
--
-- They have always written to AsyncStorage and nothing read them, so turning
-- one off changed nothing and the app quietly lied. The check belongs on the
-- server: `send-notification` is the only thing that delivers a push, and a
-- client-side preference cannot stop a push aimed at a different device.
--
-- Defaults are true so existing users keep receiving what they receive today.
-- ============================================================

alter table public.users
  add column if not exists notify_shares  boolean not null default true,
  add column if not exists notify_follows boolean not null default true;

comment on column public.users.notify_shares is
  'False silences push for a song or playlist sent to this user. Checked by the '
  'send-notification edge function, not by the client.';
comment on column public.users.notify_follows is
  'False silences push for someone adding this user.';

-- The edge function reads these with the service role, so no policy change is
-- needed. `users_update_own` (001) already lets someone change their own.
