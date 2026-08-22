-- ============================================================================
-- Désactivation de la newsletter hebdomadaire
-- 21.08.2026
--
-- Tiffany ne fait pas de newsletter. Le formulaire d'inscription a été retiré
-- de la page d'accueil le même jour ; laisser la tâche tourner aurait envoyé
-- une campagne Brevo le mercredi 26.08 à 09h00 sans que personne ne l'ait
-- écrite ni relue.
--
-- La tâche est désactivée, pas supprimée : `active = false`. Son planning et
-- sa commande restent en base. Pour la relancer un jour :
--     SELECT cron.alter_job(<jobid>, active := true);
-- L'edge function weekly-newsletter reste déployée et appelable à la main
-- depuis l'admin (elle accepte un admin_password et un mode dry_run).
--
-- À faire AVANT de la réactiver : remettre un moyen de s'inscrire quelque part
-- sur le site, sinon on écrit à une liste qui ne peut plus grandir.
-- ============================================================================

DO $$
DECLARE
  v_jobid BIGINT;
BEGIN
  SELECT jobid INTO v_jobid
    FROM cron.job
   WHERE jobname = 'weekly-newsletter-wednesday';

  IF v_jobid IS NULL THEN
    RAISE NOTICE 'weekly-newsletter-wednesday introuvable — rien à désactiver.';
  ELSE
    PERFORM cron.alter_job(v_jobid, active := false);
    RAISE NOTICE 'weekly-newsletter-wednesday (jobid %) désactivée.', v_jobid;
  END IF;
END $$;
