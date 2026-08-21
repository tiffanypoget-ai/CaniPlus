-- ============================================================================
-- Réparation des tâches planifiées cassées
-- Appliqué en production le 19 août 2026.
-- ----------------------------------------------------------------------------
-- Constat, en inspectant net._http_response plutôt que cron.job_run_details.
-- C'est la distinction qui a masqué le problème pendant des mois : un job
-- marqué « succeeded » signifie seulement que net.http_post a été mis en file,
-- pas que l'appel HTTP a abouti. Quatre jobs échouaient en silence.
--
--   1. premium-trial-reminder-daily → 401 à chaque exécution.
--      Le header partait vide : le job lisait
--      current_setting('app.settings.cron_secret'), paramètre jamais défini sur
--      cette base. Il ne peut pas l'être — ALTER DATABASE est refusé sur
--      Supabase managé (« permission denied to set parameter »). Toute migration
--      qui suppose ce paramètre est donc à proscrire ici.
--
--   2. weekly-newsletter-wednesday → 401 tous les mercredis.
--      Le job portait une clé service_role en dur, devenue caduque quand
--      Supabase est passé aux nouvelles secret keys. La newsletter hebdomadaire
--      ne partait plus. Corrigé côté fonction (v23 accepte CRON_SECRET) et côté
--      job ci-dessous.
--
--   3. cash-payment-reminder-hourly → le job n'existait pas.
--      Sa migration (add_cash_reminder_2026_05_11.sql) n'avait jamais été
--      appliquée. Aucun rappel de paiement sur place n'était envoyé.
--
--   4. admin-publish-reminder-tuesday → erreur SQL, jamais d'appel HTTP.
--      Guillemet fermant manquant après la clé d'autorisation : le corps JSON
--      se retrouvait en SQL nu, d'où « syntax error at or near { ». La clé qu'il
--      portait était de toute façon périmée, mais notify-admin laisse passer le
--      kind 'publish_reminder' sans auth privilégiée : le header disparaît.
--
-- Convention retenue partout : le jeton CRON_SECRET en clair dans la commande,
-- comme auto-cancel-unpaid-private et publish-scheduled-bundles, seuls jobs
-- dont les appels répondaient 200. Aucune dépendance à un paramètre de session
-- ni à une clé rotative.
--
-- Le jeton n'est pas écrit ici : il est recopié depuis un job existant, ce qui
-- garde ce fichier versionnable sans secret.
--
-- Ajout au passage : timeout_milliseconds explicite. net.http_post coupe à 5 s
-- par défaut, or la newsletter appelle Claude pour le conseil de la semaine et
-- dépasse ce délai — sa réponse n'était jamais enregistrée.
-- ============================================================================

DO $do$
DECLARE tok text;
BEGIN
  SELECT (regexp_match(command, 'Bearer ([A-Za-z0-9_\-\.]{8,})'))[1] INTO tok
  FROM cron.job WHERE jobname = 'auto-cancel-unpaid-private';

  IF tok IS NULL THEN
    RAISE EXCEPTION
      'Jeton cron introuvable dans auto-cancel-unpaid-private. '
      'Renseigner CRON_SECRET à la main dans les commandes ci-dessous.';
  END IF;

  -- ── 1. trial-reminder ─────────────────────────────────────────────────────
  BEGIN PERFORM cron.unschedule('premium-trial-reminder-daily'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('premium-trial-reminder-daily', '0 7 * * *',
    format($f$SELECT net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/trial-reminder',
      headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret',%L),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000) AS request_id;$f$, tok));

  -- ── 2. weekly-newsletter ──────────────────────────────────────────────────
  -- Requiert weekly-newsletter v23 ou plus, qui accepte CRON_SECRET.
  BEGIN PERFORM cron.unschedule('weekly-newsletter-wednesday'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('weekly-newsletter-wednesday', '0 7 * * 3',
    format($f$SELECT net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/weekly-newsletter',
      headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret',%L),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000) AS request_id;$f$, tok));

  -- ── 3. cash-payment-reminder ──────────────────────────────────────────────
  BEGIN PERFORM cron.unschedule('cash-payment-reminder-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('cash-payment-reminder-hourly', '0 * * * *',
    format($f$SELECT net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/cash-payment-reminder',
      headers := jsonb_build_object('Content-Type','application/json','X-Cron-Secret',%L),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000) AS request_id;$f$, tok));

  -- ── 4. admin-publish-reminder ─────────────────────────────────────────────
  BEGIN PERFORM cron.unschedule('admin-publish-reminder-tuesday'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('admin-publish-reminder-tuesday', '0 16 * * 2',
    $f$SELECT net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/notify-admin',
      headers := jsonb_build_object('Content-Type','application/json'),
      body := jsonb_build_object(
        'kind',  'publish_reminder',
        'title', 'Valide le bundle editorial pour mercredi',
        'body',  'C''est mardi 18h. Si le bundle editorial est pret, valide-le maintenant. Sinon il ne partira pas mercredi 9h.'
      )) AS request_id;$f$);

  -- ── 5. soiree-reminders : timeout explicite ───────────────────────────────
  BEGIN PERFORM cron.unschedule('soiree-reminders-hourly'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule('soiree-reminders-hourly', '0 * * * *',
    format($f$SELECT net.http_post(
      url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/soiree-emails',
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || %L),
      body := '{"action":"reminders"}'::jsonb,
      timeout_milliseconds := 120000) AS request_id;$f$, tok));
END
$do$;

-- ── Contrôle de santé, à relancer après toute modification d'un cron ────────
-- Aucune ligne ne doit ressortir avec true dans les deux dernières colonnes.
--   SELECT jobname, active,
--          (command LIKE '%current_setting%') AS depend_parametre_absent,
--          (command LIKE '%Bearer eyJ%')      AS cle_service_role_en_dur
--   FROM cron.job ORDER BY jobname;
--
-- Et pour voir ce que les appels ont VRAIMENT renvoyé (pas seulement s'ils ont
-- été mis en file) :
--   SELECT id, status_code, error_msg, left(content, 200), created
--   FROM net._http_response ORDER BY created DESC LIMIT 20;
