-- Push notification tokens
-- Each user can have multiple tokens (one per device).
-- Tokens are upserted on app launch; deleting a row removes that device.

create table public.push_tokens (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  token      text not null,
  platform   text,                          -- 'ios' | 'android'
  created_at timestamptz default now() not null,
  unique (user_id, token)
);

alter table public.push_tokens enable row level security;

-- Users can only manage their own tokens
create policy "push_tokens: owner full access"
  on public.push_tokens for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
