-- ============================================================================
-- Migration : chat en direct membre ↔ admin
-- Date : 2026-05-04
-- ============================================================================
--
-- Tables :
--   - conversations : 1 par membre (relation user ↔ Tiffany)
--   - chat_messages : messages individuels
--
-- Bucket : chat-attachments (privé)
--
-- Triggers :
--   - on_conversation_message_insert : maj last_message_at, unread counts
--   - on_user_signup_create_conversation : crée auto la conversation au signup
--     avec un message de bienvenue de Tiffany
--
-- Cron : purge des messages > 3 mois (hebdo dimanche 4h)
--
-- Profiles : ajout admin_chat_status (available / vacation) + vacation_until
-- ============================================================================


-- ─── 1. Champs admin_chat_status sur profiles ──────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS admin_chat_status TEXT DEFAULT 'available'
    CHECK (admin_chat_status IN ('available', 'vacation')),
  ADD COLUMN IF NOT EXISTS vacation_until TIMESTAMPTZ;


-- ─── 2. Table conversations ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.conversations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id             UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at       TIMESTAMPTZ DEFAULT NOW(),
  last_message_preview  TEXT,
  last_message_sender   TEXT CHECK (last_message_sender IN ('member', 'admin')),
  unread_count_admin    INTEGER NOT NULL DEFAULT 0,
  unread_count_member   INTEGER NOT NULL DEFAULT 0,
  archived_admin        BOOLEAN NOT NULL DEFAULT false,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un membre n'a qu'une seule conversation
  UNIQUE(member_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_member ON public.conversations(member_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message
  ON public.conversations(last_message_at DESC)
  WHERE archived_admin = false;
CREATE INDEX IF NOT EXISTS idx_conversations_unread_admin
  ON public.conversations(unread_count_admin DESC, last_message_at DESC)
  WHERE archived_admin = false AND unread_count_admin > 0;


-- ─── 3. Table chat_messages ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  sender_role       TEXT NOT NULL CHECK (sender_role IN ('member', 'admin')),
  content           TEXT,
  attachment_url    TEXT,
  attachment_type   TEXT CHECK (attachment_type IN ('image', 'video', 'pdf')),
  attachment_name   TEXT,
  attachment_size   INTEGER,
  read_at           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un message doit avoir au moins du contenu OU un attachement
  CHECK (content IS NOT NULL OR attachment_url IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation
  ON public.chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_unread
  ON public.chat_messages(conversation_id, read_at)
  WHERE read_at IS NULL;


-- ─── 4. RLS policies ───────────────────────────────────────────────────────

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- Membres : lisent UNIQUEMENT leur propre conversation
DROP POLICY IF EXISTS "conv_select_own" ON public.conversations;
CREATE POLICY "conv_select_own"
  ON public.conversations FOR SELECT
  USING (member_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Admin : lit/modifie toutes les conversations
DROP POLICY IF EXISTS "conv_admin_all" ON public.conversations;
CREATE POLICY "conv_admin_all"
  ON public.conversations FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Membres : lisent les messages de leur conversation, peuvent INSERT
DROP POLICY IF EXISTS "chat_select_own" ON public.chat_messages;
CREATE POLICY "chat_select_own"
  ON public.chat_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.member_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "chat_insert_own_member" ON public.chat_messages;
CREATE POLICY "chat_insert_own_member"
  ON public.chat_messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND (
      (sender_role = 'member' AND EXISTS (
        SELECT 1 FROM public.conversations c
        WHERE c.id = chat_messages.conversation_id AND c.member_id = auth.uid()
      ))
      OR (sender_role = 'admin' AND EXISTS (
        SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
      ))
    )
  );

-- Admin update/delete : écrit + supprime tous les messages
DROP POLICY IF EXISTS "chat_admin_all" ON public.chat_messages;
CREATE POLICY "chat_admin_all"
  ON public.chat_messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- Membre peut UPDATE read_at de ses propres messages reçus (marquer comme lu)
DROP POLICY IF EXISTS "chat_member_mark_read" ON public.chat_messages;
CREATE POLICY "chat_member_mark_read"
  ON public.chat_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = chat_messages.conversation_id
        AND c.member_id = auth.uid()
    )
  );


-- ─── 5. Trigger : maj conversation après chaque INSERT message ────────────

CREATE OR REPLACE FUNCTION public.on_chat_message_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preview TEXT;
BEGIN
  -- Construire un preview (1ère ligne du content ou indicateur de pièce jointe)
  IF NEW.content IS NOT NULL AND length(trim(NEW.content)) > 0 THEN
    v_preview := substring(NEW.content from 1 for 80);
  ELSIF NEW.attachment_type = 'image' THEN
    v_preview := '[photo]';
  ELSIF NEW.attachment_type = 'video' THEN
    v_preview := '[vidéo]';
  ELSIF NEW.attachment_type = 'pdf' THEN
    v_preview := '[document PDF]';
  ELSE
    v_preview := '[pièce jointe]';
  END IF;

  -- Maj la conversation
  UPDATE public.conversations
  SET
    last_message_at      = NEW.created_at,
    last_message_preview = v_preview,
    last_message_sender  = NEW.sender_role,
    unread_count_admin   = CASE WHEN NEW.sender_role = 'member' THEN unread_count_admin + 1 ELSE unread_count_admin END,
    unread_count_member  = CASE WHEN NEW.sender_role = 'admin'  THEN unread_count_member + 1 ELSE unread_count_member END,
    archived_admin       = false  -- Si admin avait archivé, le message la fait remonter
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_on_chat_message_insert ON public.chat_messages;
CREATE TRIGGER trg_on_chat_message_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_message_insert();


-- ─── 6. Trigger : auto-créer la conversation à l'inscription ──────────────

CREATE OR REPLACE FUNCTION public.create_welcome_conversation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conv_id     UUID;
  v_admin_id    UUID;
  v_welcome_msg TEXT;
BEGIN
  -- Skip pour les admins (pas besoin d'auto-conversation pour Tiffany elle-même)
  IF NEW.role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Trouve l'admin pour le sender du message de bienvenue
  SELECT id INTO v_admin_id
  FROM public.profiles
  WHERE role = 'admin'
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    -- Pas d'admin trouvé, on crée juste la conversation vide
    INSERT INTO public.conversations (member_id) VALUES (NEW.id)
    ON CONFLICT (member_id) DO NOTHING;
    RETURN NEW;
  END IF;

  -- Crée la conversation
  INSERT INTO public.conversations (member_id, last_message_sender)
  VALUES (NEW.id, 'admin')
  ON CONFLICT (member_id) DO NOTHING
  RETURNING id INTO v_conv_id;

  -- Si elle a été créée maintenant (pas existant), ajoute le message de bienvenue
  IF v_conv_id IS NOT NULL THEN
    v_welcome_msg :=
      'Bienvenue ' || COALESCE(split_part(NEW.full_name, ' ', 1), 'à toi') ||
      ' chez CaniPlus ! 🐾' || E'\n\n' ||
      'Si tu as la moindre question sur les cours, ton chien ou la vie du club, écris-moi ici en privé. ' ||
      'Je réponds en semaine entre 8h15 et 17h.' || E'\n\n' ||
      'À très vite !' || E'\n' ||
      '— Tiffany';

    INSERT INTO public.chat_messages (
      conversation_id, sender_id, sender_role, content
    ) VALUES (
      v_conv_id, v_admin_id, 'admin', v_welcome_msg
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_welcome_conversation ON public.profiles;
CREATE TRIGGER trg_create_welcome_conversation
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_welcome_conversation();


-- ─── 7. Backfill : créer conversation + welcome pour tous les membres ─────

DO $$
DECLARE
  v_admin_id UUID;
  v_member RECORD;
  v_conv_id UUID;
BEGIN
  SELECT id INTO v_admin_id FROM public.profiles WHERE role = 'admin' ORDER BY created_at ASC LIMIT 1;
  IF v_admin_id IS NULL THEN
    RAISE NOTICE 'Pas d''admin trouvé, skip backfill';
    RETURN;
  END IF;

  FOR v_member IN
    SELECT p.id, p.full_name
    FROM public.profiles p
    WHERE p.role <> 'admin'
      AND NOT EXISTS (SELECT 1 FROM public.conversations c WHERE c.member_id = p.id)
  LOOP
    INSERT INTO public.conversations (member_id, last_message_sender)
    VALUES (v_member.id, 'admin')
    RETURNING id INTO v_conv_id;

    INSERT INTO public.chat_messages (conversation_id, sender_id, sender_role, content)
    VALUES (
      v_conv_id, v_admin_id, 'admin',
      'Bienvenue ' || COALESCE(split_part(v_member.full_name, ' ', 1), 'à toi') ||
      ' chez CaniPlus ! 🐾' || E'\n\n' ||
      'Si tu as la moindre question sur les cours, ton chien ou la vie du club, écris-moi ici en privé. ' ||
      'Je réponds en semaine entre 8h15 et 17h.' || E'\n\n' ||
      'À très vite !' || E'\n' || '— Tiffany'
    );
  END LOOP;
END $$;


-- ─── 8. Cron : purge des messages > 3 mois (hebdo dimanche 4h) ────────────

SELECT cron.unschedule('purge-old-chat-messages')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-chat-messages');

SELECT cron.schedule(
  'purge-old-chat-messages',
  '0 4 * * 0',
  $$
    DELETE FROM public.chat_messages
    WHERE created_at < NOW() - INTERVAL '3 months';
  $$
);


-- ─── 9. Bucket Storage chat-attachments ───────────────────────────────────
-- À créer manuellement dans le dashboard Supabase Storage si pas déjà fait.
-- Configuration recommandée :
--   - Privé (pas public)
--   - Politiques RLS : voir ci-dessous

-- Tentative de création via SQL (peut nécessiter d'être lancé manuellement)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', false)
ON CONFLICT (id) DO NOTHING;

-- RLS sur le bucket : un user upload uniquement dans son dossier (path = user_id/...)
DROP POLICY IF EXISTS "chat_attach_upload_own" ON storage.objects;
CREATE POLICY "chat_attach_upload_own"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'chat-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "chat_attach_read_own_or_admin" ON storage.objects;
CREATE POLICY "chat_attach_read_own_or_admin"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'chat-attachments'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

DROP POLICY IF EXISTS "chat_attach_delete_admin" ON storage.objects;
CREATE POLICY "chat_attach_delete_admin"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'chat-attachments'
    AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );


-- ─── 10. Vérifications finales ────────────────────────────────────────────

SELECT
  (SELECT COUNT(*) FROM public.conversations) AS conversations_count,
  (SELECT COUNT(*) FROM public.chat_messages) AS messages_count,
  (SELECT COUNT(*) FROM public.profiles WHERE role <> 'admin') AS members_count;
