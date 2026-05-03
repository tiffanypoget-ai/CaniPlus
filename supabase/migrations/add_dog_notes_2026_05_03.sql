-- Migration : remarques partagées par chien (membre + admin)
-- Date : 2026-05-03
-- Contexte : permettre au membre et à l'admin de noter des remarques sur un chien
-- (allergies, réactivité, observations de cours, etc.) et de les voir mutuellement.
-- Push + cloche envoyés à l'autre partie quand une remarque est ajoutée.

-- ─── 1. Table dog_notes ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dog_notes (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  dog_id      UUID         NOT NULL REFERENCES dogs(id) ON DELETE CASCADE,
  author_id   UUID         REFERENCES auth.users(id) ON DELETE SET NULL,
  author_role TEXT         NOT NULL CHECK (author_role IN ('owner', 'admin')),
  author_name TEXT,        -- snapshot du nom au moment de l'écriture (Tiffany / Adrien Ryser)
  content     TEXT         NOT NULL CHECK (length(trim(content)) > 0),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dog_notes_dog_id_idx
  ON dog_notes(dog_id, created_at DESC);

COMMENT ON TABLE dog_notes IS
  'Remarques partagées entre le membre et l''admin sur un chien (allergies, comportement, observations).';
COMMENT ON COLUMN dog_notes.author_role IS
  '"owner" si écrit par le propriétaire du chien, "admin" si écrit par Tiffany.';

-- ─── 2. RLS ──────────────────────────────────────────────────────────
ALTER TABLE dog_notes ENABLE ROW LEVEL SECURITY;

-- Le propriétaire du chien peut lire et écrire ses notes
DROP POLICY IF EXISTS "owner_read_dog_notes" ON dog_notes;
CREATE POLICY "owner_read_dog_notes" ON dog_notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM dogs d
      WHERE d.id = dog_notes.dog_id
        AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_insert_dog_notes" ON dog_notes;
CREATE POLICY "owner_insert_dog_notes" ON dog_notes
  FOR INSERT
  WITH CHECK (
    author_role = 'owner'
    AND author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM dogs d
      WHERE d.id = dog_notes.dog_id
        AND d.owner_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "owner_delete_own_dog_notes" ON dog_notes;
CREATE POLICY "owner_delete_own_dog_notes" ON dog_notes
  FOR DELETE
  USING (
    author_id = auth.uid()
    AND author_role = 'owner'
  );

-- (Admin passe par service_role via edge function admin-query, donc pas de policy admin)
