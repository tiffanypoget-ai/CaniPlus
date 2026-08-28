-- Suppression automatique des demandes de réservation restées sans suite.
--
-- La politique de confidentialité annonce « Demandes de réservation sans
-- suite : supprimées 12 mois après la demande ». Jusqu'ici rien ne l'appliquait :
-- l'engagement était écrit mais aucune ligne n'était jamais supprimée. Une
-- politique qui promet une suppression qui n'a pas lieu est pire que pas de
-- promesse du tout.
--
-- CE QUI EST SUPPRIMÉ
--   Une demande de plus de 12 mois qui n'a jamais abouti à un cours :
--     status = 'pending'    → jamais traitée
--     status = 'rejected'   → refusée
--     status = 'cancelled'  → annulée
--   et qui n'a jamais été payée.
--
-- CE QUI EST GARDÉ, VOLONTAIREMENT
--   - Toute demande 'confirmed', même impayée : elle correspond à un cours
--     qui a été agendé, et peut avoir été réglé sur place sans que le
--     paiement soit enregistré ici.
--   - Toute demande payée ('paid' ou 'cash_paid'), quel que soit son statut :
--     c'est une pièce comptable, conservée 10 ans (obligation légale suisse),
--     comme annoncé dans la politique.
--
-- Autrement dit, on ne supprime que ce qui n'a produit ni cours ni facture.
--
-- Au moment de l'installation, aucune ligne n'a plus de 12 mois : la plus
-- ancienne date du 9 avril 2026. La fonction ne supprime donc rien
-- aujourd'hui, elle commencera à servir courant 2027.

create or replace function public.nettoyer_demandes_sans_suite()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  supprimees integer;
begin
  with effacees as (
    delete from public.private_course_requests
    where created_at < now() - interval '12 months'
      and status in ('pending', 'rejected', 'cancelled')
      and coalesce(payment_status, 'pending') not in ('paid', 'cash_paid')
    returning 1
  )
  select count(*) into supprimees from effacees;

  -- Trace volontaire : pouvoir répondre « voilà ce qui a été supprimé et
  -- quand » fait partie de ce qu'on doit à quelqu'un qui exerce son droit
  -- d'accès. Visible dans les logs Postgres du projet.
  if supprimees > 0 then
    raise log '[nettoyage-demandes] % demande(s) sans suite supprimee(s)', supprimees;
  end if;

  return supprimees;
end;
$fn$;

comment on function public.nettoyer_demandes_sans_suite() is
  'Applique la durée de conservation annoncée dans la politique de confidentialité : supprime les demandes de plus de 12 mois restées sans suite. Ne touche jamais une demande confirmée ni une demande payée.';

-- Une fois par mois suffit : la donnée la plus ancienne dépasse alors le seuil
-- de 30 jours au pire, ce qui reste conforme à un engagement exprimé en mois.
-- Le 1er du mois à 4h du matin, à côté de la purge du chat (dimanche 4h).
select cron.schedule(
  'nettoyage-demandes-sans-suite',
  '0 4 1 * *',
  $cron$ select public.nettoyer_demandes_sans_suite(); $cron$
);
