-- Persist user-saved reel song lists.
-- This replaces the app's previous AsyncStorage-only reel history.

create extension if not exists "pgcrypto";

create table public.reel_imports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  title      text not null,
  reel_url   text not null,
  created_at timestamptz default now() not null,
  unique (user_id, reel_url)
);

create table public.reel_import_songs (
  id             uuid primary key default gen_random_uuid(),
  reel_import_id uuid not null references public.reel_imports(id) on delete cascade,
  position       integer not null,
  title          text not null,
  artist         text not null,
  cover_url      text,
  created_at     timestamptz default now() not null,
  unique (reel_import_id, position)
);

alter table public.reel_imports enable row level security;
alter table public.reel_import_songs enable row level security;

create policy "reel_imports_owner_select"
  on public.reel_imports for select
  using (auth.uid() = user_id);

create policy "reel_imports_owner_insert"
  on public.reel_imports for insert
  with check (auth.uid() = user_id);

create policy "reel_imports_owner_update"
  on public.reel_imports for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "reel_imports_owner_delete"
  on public.reel_imports for delete
  using (auth.uid() = user_id);

create policy "reel_import_songs_owner_select"
  on public.reel_import_songs for select
  using (
    exists (
      select 1
      from public.reel_imports ri
      where ri.id = reel_import_id
        and ri.user_id = auth.uid()
    )
  );

create policy "reel_import_songs_owner_insert"
  on public.reel_import_songs for insert
  with check (
    exists (
      select 1
      from public.reel_imports ri
      where ri.id = reel_import_id
        and ri.user_id = auth.uid()
    )
  );

create policy "reel_import_songs_owner_update"
  on public.reel_import_songs for update
  using (
    exists (
      select 1
      from public.reel_imports ri
      where ri.id = reel_import_id
        and ri.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from public.reel_imports ri
      where ri.id = reel_import_id
        and ri.user_id = auth.uid()
    )
  );

create policy "reel_import_songs_owner_delete"
  on public.reel_import_songs for delete
  using (
    exists (
      select 1
      from public.reel_imports ri
      where ri.id = reel_import_id
        and ri.user_id = auth.uid()
    )
  );

create index reel_imports_user_created_idx
  on public.reel_imports(user_id, created_at desc);

create index reel_import_songs_import_position_idx
  on public.reel_import_songs(reel_import_id, position);
