-- Table notifications pour CaniPlus
-- À exécuter dans Supabase SQL Editor

CREATE TABLE IF NOT EXISTS notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('cours_confirme', 'cours_semaine', 'nouvelle_actualite', 'info', 'rappel')),
  title TEXT NOT NULL,
  body TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index pour les requêtes fréquentes
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, is_read) WHERE is_read = FALSE;
CREATE INDEX idx_notifications_created_at ON notifications(created_at DESC);

-- RLS : chaque utilisateur ne voit que ses propres notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- L'admin (service_role) et les triggers peuvent insérer des notifications
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can delete own notifications"
  ON notifications FOR DELETE
  USING (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════════════
-- TRIGGERS AUTOMATIQUES — génèrent les notifications sans action manuelle
-- ════════════════════════════════════════════════════════════════════

-- ── 1. Cours privé confirmé ──────────────────────────────────────
-- Quand l'admin passe le status à 'confirmed' et a choisi un créneau,
-- le membre reçoit une notification.
CREATE OR REPLACE FUNCTION notify_private_course_confirmed()
RETURNS TRIGGER AS $$
DECLARE
  slot_date TEXT;
  slot_start TEXT;
BEGIN
  -- Seulement quand le status passe à 'confirmed' et qu'un créneau est choisi
  IF NEW.status = 'confirmed'
     AND (OLD.status IS DISTINCT FROM 'confirmed')
     AND NEW.chosen_slot IS NOT NULL THEN

    slot_date  := NEW.chosen_slot->>'date';
    slot_start := NEW.chosen_slot->>'start';

    INSERT INTO notifications (user_id, type, title, body, metadata)
    VALUES (
      NEW.user_id,
      'cours_confirme',
      'Cours privé confirmé !',
      'Ton cours privé du ' || to_char(slot_date::date, 'DD.MM.YYYY') || ' à ' || COALESCE(slot_start, '') || ' a été confirmé.',
      jsonb_build_object('request_id', NEW.id, 'date', slot_date)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_private_course ON private_course_requests;
CREATE TRIGGER trg_notify_private_course
  AFTER UPDATE ON private_course_requests
  FOR EACH ROW EXECUTE FUNCTION notify_private_course_confirmed();


-- ── 2. Nouvelle actualité publiée ────────────────────────────────
-- Quand une news est publiée (INSERT avec published=true ou UPDATE published→true),
-- tous les membres reçoivent une notification.
CREATE OR REPLACE FUNCTION notify_new_news()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.published = TRUE
     AND (TG_OP = 'INSERT' OR OLD.published IS DISTINCT FROM TRUE) THEN

    INSERT INTO notifications (user_id, type, title, body, metadata)
    SELECT
      p.id,
      'nouvelle_actualite',
      'Nouvelle actualité',
      COALESCE(NEW.title, 'Une nouvelle actualité a été publiée'),
      jsonb_build_object('news_id', NEW.id)
    FROM profiles p
    WHERE p.role = 'member';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_news_insert ON news;
CREATE TRIGGER trg_notify_new_news_insert
  AFTER INSERT ON news
  FOR EACH ROW EXECUTE FUNCTION notify_new_news();

DROP TRIGGER IF EXISTS trg_notify_new_news_update ON news;
CREATE TRIGGER trg_notify_new_news_update
  AFTER UPDATE ON news
  FOR EACH ROW EXECUTE FUNCTION notify_new_news();


-- ── 3. Nouveau cours collectif ajouté ────────────────────────────
-- Quand un cours collectif ou événement est créé, tous les membres sont notifiés.
CREATE OR REPLACE FUNCTION notify_new_group_course()
RETURNS TRIGGER AS $$
DECLARE
  label TEXT;
BEGIN
  -- Détermine le label selon le type
  CASE NEW.course_type
    WHEN 'collectif' THEN label := 'Cours collectif';
    WHEN 'theorique'  THEN label := 'Cours théorique';
    WHEN 'evenement'  THEN label := 'Événement';
    ELSE label := 'Cours';
  END CASE;

  INSERT INTO notifications (user_id, type, title, body, metadata)
  SELECT
    p.id,
    'cours_semaine',
    label || ' ajouté',
    label || ' le ' || to_char(NEW.course_date, 'DD.MM.YYYY')
      || CASE WHEN NEW.start_time IS NOT NULL THEN ' à ' || NEW.start_time ELSE '' END,
    jsonb_build_object('course_id', NEW.id, 'course_type', NEW.course_type, 'date', NEW.course_date::text)
  FROM profiles p
  WHERE p.role = 'member';

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_notify_new_group_course ON group_courses;
CREATE TRIGGER trg_notify_new_group_course
  AFTER INSERT ON group_courses
  FOR EACH ROW EXECUTE FUNCTION notify_new_group_course();
