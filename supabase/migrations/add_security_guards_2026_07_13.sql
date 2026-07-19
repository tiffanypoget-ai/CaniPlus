-- Migration 2026-07-13 (soir) : gardes de sécurité côté base
--
-- Issue de la relecture complète multi-agents. Quatre failles corrigées :
--   1. profiles_update_own n'avait pas de WITH CHECK et aucune protection de
--      colonnes : un membre pouvait se donner role='admin' ou premium_until
--      via l'API. → WITH CHECK + trigger qui fige les colonnes sensibles.
--   2. Un membre pouvait marquer ses propres subscriptions status='paid'
--      (cotisation / leçons gratuites). → trigger.
--   3. Idem sur private_course_requests (payment_status='paid', créneau,
--      prix modifiables par le membre). → trigger.
--   4. La progression des défis était librement falsifiable (started_at,
--      jours_completes, completed_at) ce qui contournait la garde anti-triche
--      du mois offert. → triggers INSERT + UPDATE (horodatage réel, déblocage
--      quotidien vérifié en base, started_at immuable).
--
-- Tous les triggers laissent passer : le service role (edge functions,
-- webhooks, crons) et les comptes role='admin'. Ils FIGENT silencieusement
-- (pas d'erreur) les colonnes interdites pour ne casser aucun flux existant,
-- sauf la progression défis où la triche est explicitement rejetée.

-- ── Helper : l'appelant est-il privilégié ? ─────────────────────────────────
CREATE OR REPLACE FUNCTION request_is_privileged() RETURNS BOOLEAN AS $$
BEGIN
  RETURN (auth.uid() IS NULL)
    OR coalesce(auth.role(), '') = 'service_role'
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin');
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ── 1. profiles ──────────────────────────────────────────────────────────────
ALTER POLICY profiles_update_own ON profiles WITH CHECK ((SELECT auth.uid()) = id);

CREATE OR REPLACE FUNCTION profiles_protect_sensitive() RETURNS TRIGGER AS $$
BEGIN
  IF request_is_privileged() THEN RETURN NEW; END IF;
  NEW.role := OLD.role;
  NEW.user_type := OLD.user_type;
  NEW.premium_until := OLD.premium_until;
  NEW.premium_cancel_at := OLD.premium_cancel_at;
  NEW.stripe_customer_id := OLD.stripe_customer_id;
  NEW.stripe_subscription_id := OLD.stripe_subscription_id;
  NEW.premium_trial_reminder_sent_at := OLD.premium_trial_reminder_sent_at;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_protect_sensitive ON profiles;
CREATE TRIGGER trg_profiles_protect_sensitive
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION profiles_protect_sensitive();

-- ── 2. subscriptions ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION subscriptions_guard() RETURNS TRIGGER AS $$
BEGIN
  IF request_is_privileged() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    -- Un membre crée toujours une entrée à payer, jamais payée
    IF NEW.status = 'paid' THEN NEW.status := 'pending'; END IF;
    NEW.paid_at := NULL;
    RETURN NEW;
  END IF;
  -- UPDATE membre : impossible de se marquer payé ou de gonfler ses leçons
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' THEN
    NEW.status := OLD.status;
  END IF;
  NEW.paid_at := OLD.paid_at;
  NEW.private_lessons_total := OLD.private_lessons_total;
  NEW.private_lessons_used := OLD.private_lessons_used;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_subscriptions_guard ON subscriptions;
CREATE TRIGGER trg_subscriptions_guard
  BEFORE INSERT OR UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION subscriptions_guard();

-- ── 3. private_course_requests ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pcr_guard() RETURNS TRIGGER AS $$
BEGIN
  IF request_is_privileged() THEN RETURN NEW; END IF;
  -- Le membre peut : passer en cash (payment_status='cash_pending') et
  -- annuler sa demande (status='cancelled'). Tout le reste est figé.
  IF NEW.payment_status IS DISTINCT FROM OLD.payment_status
     AND NEW.payment_status <> 'cash_pending' THEN
    NEW.payment_status := OLD.payment_status;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'cancelled' THEN
    NEW.status := OLD.status;
  END IF;
  NEW.chosen_slot := OLD.chosen_slot;
  NEW.price_chf := OLD.price_chf;
  NEW.paid_at := OLD.paid_at;
  NEW.admin_notes := OLD.admin_notes;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_pcr_guard ON private_course_requests;
CREATE TRIGGER trg_pcr_guard
  BEFORE UPDATE ON private_course_requests
  FOR EACH ROW EXECUTE FUNCTION pcr_guard();

-- ── 4. defi_progression ──────────────────────────────────────────────────────
-- INSERT : un membre démarre toujours une progression vierge, datée maintenant.
CREATE OR REPLACE FUNCTION defi_progression_guard_insert() RETURNS TRIGGER AS $$
BEGIN
  IF request_is_privileged() THEN RETURN NEW; END IF;
  NEW.started_at := now();
  NEW.jours_completes := '{}'::jsonb;
  NEW.completed_at := NULL;
  NEW.reward_claimed_at := NULL;
  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_defi_progression_guard_insert ON defi_progression;
CREATE TRIGGER trg_defi_progression_guard_insert
  BEFORE INSERT ON defi_progression
  FOR EACH ROW EXECUTE FUNCTION defi_progression_guard_insert();

-- UPDATE : jours validés immuables, nouvelles validations horodatées
-- maintenant, déblocage quotidien (heure suisse) vérifié EN BASE,
-- completed_at posé par la base uniquement quand tous les jours y sont.
CREATE OR REPLACE FUNCTION defi_progression_guard_update() RETURNS TRIGGER AS $$
DECLARE
  k TEXT;
  newv TEXT;
  prev TEXT;
  duree INT;
BEGIN
  IF request_is_privileged() THEN RETURN NEW; END IF;

  NEW.user_id := OLD.user_id;
  NEW.defi_id := OLD.defi_id;
  NEW.started_at := OLD.started_at;
  IF OLD.reward_claimed_at IS NOT NULL THEN
    NEW.reward_claimed_at := OLD.reward_claimed_at;
  END IF;

  -- Pas de suppression ni de réécriture d'un jour déjà validé
  FOR k IN SELECT jsonb_object_keys(OLD.jours_completes) LOOP
    IF NOT (NEW.jours_completes ? k)
       OR (NEW.jours_completes->>k) IS DISTINCT FROM (OLD.jours_completes->>k) THEN
      RAISE EXCEPTION 'La progression d''un jour validé ne peut pas être modifiée';
    END IF;
  END LOOP;

  -- Nouvelles validations : horodatage réel + déblocage quotidien
  FOR k IN SELECT jsonb_object_keys(NEW.jours_completes) LOOP
    CONTINUE WHEN OLD.jours_completes ? k;
    newv := NEW.jours_completes->>k;
    IF newv IS NULL
       OR abs(extract(epoch FROM (newv::timestamptz - now()))) > 600 THEN
      RAISE EXCEPTION 'Horodatage de validation invalide pour le jour %', k;
    END IF;
    IF k ~ '^[0-9]+$' AND k::int > 1 THEN
      prev := OLD.jours_completes->>((k::int - 1)::text);
      IF prev IS NULL THEN
        RAISE EXCEPTION 'Le jour % n''est pas encore débloqué', k;
      END IF;
      IF (prev::timestamptz AT TIME ZONE 'Europe/Zurich')::date
         >= (now() AT TIME ZONE 'Europe/Zurich')::date THEN
        RAISE EXCEPTION 'Le jour % s''ouvre demain', k;
      END IF;
    END IF;
  END LOOP;

  -- completed_at : posé par la base, seulement quand le défi est complet
  IF NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    IF OLD.completed_at IS NOT NULL THEN
      NEW.completed_at := OLD.completed_at;
    ELSE
      SELECT duree_jours INTO duree FROM defis WHERE id = NEW.defi_id;
      IF (SELECT count(*) FROM jsonb_object_keys(NEW.jours_completes)) < coalesce(duree, 1) THEN
        RAISE EXCEPTION 'Défi non terminé';
      END IF;
      NEW.completed_at := now();
    END IF;
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_defi_progression_guard_update ON defi_progression;
CREATE TRIGGER trg_defi_progression_guard_update
  BEFORE UPDATE ON defi_progression
  FOR EACH ROW EXECUTE FUNCTION defi_progression_guard_update();
