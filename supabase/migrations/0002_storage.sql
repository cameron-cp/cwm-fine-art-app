-- Storage bucket for artwork images.
-- Private bucket; UI fetches via signed URLs / image transformer.

insert into storage.buckets (id, name, public)
values ('artworks', 'artworks', false)
on conflict (id) do nothing;

create policy "authenticated read artworks bucket"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'artworks');

create policy "authenticated write artworks bucket"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'artworks');

create policy "authenticated update artworks bucket"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'artworks');

create policy "authenticated delete artworks bucket"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'artworks');
