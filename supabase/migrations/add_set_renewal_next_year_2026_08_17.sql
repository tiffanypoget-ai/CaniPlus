-- add_set_renewal_next_year_2026_08_17.sql
--
-- « Present l'annee prochaine » est la seule colonne de la liste clients que le
-- membre ne renseigne pas lui-meme : c'est Tiffany qui la coche depuis l'admin.
--
-- Les policies de profiles n'autorisent l'UPDATE que sur sa propre ligne
-- (profiles_update_own). Plutot que d'ajouter une policy « admin peut tout
-- modifier sur tous les profils » — qui ouvrirait aussi role, premium_until,
-- etc. — on expose une fonction SECURITY DEFINER qui ne touche que cette
-- colonne et ne s'execute que si l'appelant est admin.

create or replace function public.set_renewal_next_year(
  target_user_id uuid,
  value boolean
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not public.is_admin() then
    raise exception 'reserve aux administrateurs';
  end if;

  update public.profiles
     set renewal_next_year = value
   where id = target_user_id;
end;
$$;

revoke all on function public.set_renewal_next_year(uuid, boolean) from public, anon;
grant execute on function public.set_renewal_next_year(uuid, boolean) to authenticated;
