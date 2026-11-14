-- L'admin (Tiffany) lit et liste les PDF du bucket privé fiches-pratiques
-- depuis caniplus.ch/admin, onglet Fiches. Jusqu'ici elle ne les voyait que
-- grâce à son premium offert (règle « premium lit fiches pratiques »).
create policy "admin lit fiches pratiques" on storage.objects
  for select to authenticated
  using (bucket_id = 'fiches-pratiques' and public.is_admin());
