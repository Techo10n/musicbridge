-- ============================================================
-- MusicBridge — Profile auto-creation trigger
-- Creates a public.users row whenever a new auth.users row is
-- inserted, reading username/display_name from user metadata.
-- This avoids the RLS race condition when email confirmation
-- is enabled (no session = auth.uid() is null at insert time).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, username, display_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'username',
    new.raw_user_meta_data ->> 'display_name'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
