-- Atomically replace the songs for a saved reel import.

create or replace function public.upsert_reel_import_songs(
  p_reel_import_id uuid,
  p_songs jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.reel_imports ri
    where ri.id = p_reel_import_id
      and ri.user_id = auth.uid()
  ) then
    raise exception 'reel_import_not_found';
  end if;

  delete from public.reel_import_songs
  where reel_import_id = p_reel_import_id;

  insert into public.reel_import_songs (
    reel_import_id,
    position,
    title,
    artist,
    cover_url
  )
  select
    p_reel_import_id,
    (song->>'position')::integer,
    song->>'title',
    song->>'artist',
    nullif(song->>'cover_url', '')
  from jsonb_array_elements(coalesce(p_songs, '[]'::jsonb)) as song;
end;
$$;
