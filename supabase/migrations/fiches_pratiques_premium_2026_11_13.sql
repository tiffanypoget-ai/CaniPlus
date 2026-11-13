-- Bibliothèque « Fiches pratiques » réservée aux abonnés Premium.
-- Les fiches sont des lignes de public.resources avec type = 'fiche' :
-- texte lisible dans l'app (content) + PDF A4 dans un bucket privé.
-- Appliquée en production le 13 novembre 2026.

insert into storage.buckets (id, name, public)
values ('fiches-pratiques', 'fiches-pratiques', false)
on conflict (id) do nothing;

-- Lecture des PDF : abonnés Premium actifs et éducatrices/admin.
create policy "premium lit fiches pratiques" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'fiches-pratiques'
    and (
      public.is_educatrice()
      or exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid()) and p.premium_until > now()
      )
    )
  );

-- Dépôt, remplacement et suppression des PDF : admin uniquement.
create policy "admin depose fiches pratiques" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'fiches-pratiques' and public.is_admin());

create policy "admin remplace fiches pratiques" on storage.objects
  for update to authenticated
  using (bucket_id = 'fiches-pratiques' and public.is_admin())
  with check (bucket_id = 'fiches-pratiques' and public.is_admin());

create policy "admin supprime fiches pratiques" on storage.objects
  for delete to authenticated
  using (bucket_id = 'fiches-pratiques' and public.is_admin());

-- L'admin peut rattacher un PDF à une fiche (mise à jour de storage_path).
create policy "admin update resources" on public.resources
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create index if not exists resources_type_idx on public.resources (type);
