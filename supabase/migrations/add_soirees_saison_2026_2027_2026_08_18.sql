-- ============================================================================
-- Les soirées CaniPlus — saison 1 (septembre 2026 → juin 2027)
-- Créé le 18 août 2026.
--
-- Suite de add_soirees_webinaires_2026_07_13.sql, qui a posé le modèle :
-- une soirée = une ligne digital_products (category='soiree') pour les
-- informations PUBLIQUES + une ligne webinar_access pour les SECRETS (lien
-- Zoom, replay), table sans lecture publique servie par get-webinar-access.
-- Ce modèle est conservé tel quel : le tunnel de paiement existant
-- (create-product-checkout → Stripe RI → stripe-webhook → user_purchases)
-- fonctionne déjà et la contrainte UNIQUE(user_id, product_id) de
-- user_purchases interdit déjà le double achat.
--
-- Cette migration ajoute :
--   1. Le replay « lien cloud Zoom + code », qui remplace Bunny Stream pour
--      la saison 1 (la sécurisation Bunny n'est pas prête).
--   2. L'identifiant de réunion Zoom, pour que Tiffany retrouve la séance
--      dans son compte sans devoir ouvrir le lien.
--   3. Le statut « annulée » d'une soirée.
--   4. soiree_emails_sent : journal des emails envoyés, pour qu'un rappel ou
--      un email de replay ne parte jamais deux fois (même pattern que
--      vaccine_reminders_sent).
--   5. Le seed des 10 soirées de la saison, en brouillon.
--
-- Entité : ces soirées relèvent de la raison individuelle de Tiffany. Le
-- tunnel utilisé (create-product-checkout / stripe-webhook) tourne sur
-- STRIPE_SECRET_KEY = compte RI. Le compte club (STRIPE_SECRET_KEY_CLUB,
-- stripe-webhook-club) n'est jamais sollicité ici.
-- ============================================================================

-- ── 1. webinar_access : replay Zoom protégé par code ────────────────────────
-- zoom_meeting_id   : identifiant de la réunion (ex. 88395098054), pratique
--                     pour retrouver la séance et l'enregistrement côté Zoom.
-- replay_url        : lien de partage cloud Zoom de l'enregistrement.
-- replay_code       : code d'accès du partage (Zoom l'exige sur les partages
--                     protégés). Affiché à l'inscrit à côté du lien.
-- replay_expires_at : fin des 7 jours de replay inclus dans le prix. Passé
--                     cette date, get-webinar-access cesse de servir le replay
--                     (la suppression de l'enregistrement côté Zoom reste
--                     manuelle pour Tiffany).
--
-- bunny_video_id est conservée : la colonne ne sert pas pour la saison 1 mais
-- l'hébergement Bunny reste au programme, et get-webinar-access sait déjà la
-- lire. Le replay Zoom est prioritaire quand les deux sont renseignés.
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS zoom_meeting_id   TEXT;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS replay_url        TEXT;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS replay_code       TEXT;
ALTER TABLE webinar_access ADD COLUMN IF NOT EXISTS replay_expires_at TIMESTAMPTZ;

-- ── 2. digital_products : soirée annulée ────────────────────────────────────
-- « à venir » et « passée » se déduisent de event_date ; seule l'annulation
-- demande une information stockée. On ne dépublie pas une soirée annulée :
-- les personnes déjà inscrites doivent continuer à voir l'information.
ALTER TABLE digital_products ADD COLUMN IF NOT EXISTS event_cancelled BOOLEAN NOT NULL DEFAULT false;

-- ── 3. soiree_emails_sent : journal anti-doublon ────────────────────────────
-- Une ligne par (soirée, destinataire, type d'email). L'unicité fait office de
-- verrou : une seconde tentative d'envoi tombe sur un conflit et n'envoie rien.
-- On indexe sur l'email plutôt que sur l'achat pour rester correct si une
-- inscription est remboursée puis rachetée.
CREATE TABLE IF NOT EXISTS soiree_emails_sent (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  UUID NOT NULL REFERENCES digital_products(id) ON DELETE CASCADE,
  purchase_id UUID REFERENCES user_purchases(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('confirmation', 'rappel_j1', 'rappel_jour_j', 'replay')),
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (product_id, email, kind)
);

CREATE INDEX IF NOT EXISTS idx_soiree_emails_sent_product
  ON soiree_emails_sent (product_id, kind);

-- RLS : aucune lecture publique. Les edge functions écrivent en service_role ;
-- l'admin peut consulter le journal depuis l'app.
ALTER TABLE soiree_emails_sent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS soiree_emails_sent_admin_all ON soiree_emails_sent;
CREATE POLICY soiree_emails_sent_admin_all ON soiree_emails_sent
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── 4. Seed des 10 soirées de la saison 2026-2027 ───────────────────────────
-- Toutes le lundi de 20h00 à 21h30 (90 min), salle Zoom ouverte dès 19h45.
-- CHF 20.- par soirée, replay 7 jours inclus. Achat à l'unité : pas
-- d'abonnement saison.
--
-- Les dates portent leur décalage explicite (+02:00 en heure d'été, +01:00 en
-- heure d'hiver) pour que TIMESTAMPTZ enregistre bien 20h00 heure suisse et
-- pas 20h00 UTC. Bascule 2026 : dernier dimanche d'octobre (25.10.2026).
-- Bascule 2027 : dernier dimanche de mars (28.03.2027).
--
-- is_published = false : les soirées restent invisibles pour les clientes tant
-- que Tiffany n'a pas publié. Le brief conditionne la communication à la
-- livraison ET au test de ce chantier — rien ne doit apparaître avant.
--
-- ON CONFLICT (slug) DO NOTHING : la migration peut être rejouée sans écraser
-- des textes que Tiffany aurait retouchés depuis l'admin.
INSERT INTO digital_products (
  slug, title, subtitle, description, price_chf, category,
  event_date, event_duration_min, display_order, is_published
) VALUES
  ('soiree-01-le-rappel',
   'Le rappel',
   'Obtenir un chien qui revient, même quand c''est difficile',
   'Première soirée CaniPlus : construire un rappel fiable, et comprendre pourquoi il se dégrade.',
   20.00, 'soiree', '2026-09-14 20:00:00+02', 90, 1, false),

  ('soiree-02-marche-en-laisse',
   'La marche en laisse sans tirer',
   'Des balades détendues, sans bras arraché',
   'Pourquoi ton chien tire, et comment lui apprendre à marcher à côté de toi sans conflit.',
   20.00, 'soiree', '2026-10-05 20:00:00+02', 90, 2, false),

  ('soiree-03-langage-du-chien',
   'Décoder le langage de son chien',
   'Lire les signaux avant qu''ils deviennent des problèmes',
   'Postures, signaux d''apaisement, expressions : apprendre à voir ce que ton chien dit déjà.',
   20.00, 'soiree', '2026-11-16 20:00:00+01', 90, 3, false),

  ('soiree-04-calme-et-frustration',
   'Le calme et la gestion de la frustration',
   'Aider son chien à redescendre en pression',
   'Comment installer le calme à la maison et apprendre à ton chien à supporter l''attente.',
   20.00, 'soiree', '2026-12-14 20:00:00+01', 90, 4, false),

  ('soiree-05-reactivite-en-balade',
   'La réactivité en balade',
   'Quand ton chien aboie ou tire sur les autres',
   'Comprendre ce qui déclenche la réactivité et travailler les rencontres autrement.',
   20.00, 'soiree', '2027-01-18 20:00:00+01', 90, 5, false),

  ('soiree-06-anxiete-de-separation',
   'L''anxiété de séparation',
   'Rester seul sans détresse',
   'Repérer une vraie anxiété de séparation et construire la solitude par étapes.',
   20.00, 'soiree', '2027-02-01 20:00:00+01', 90, 6, false),

  ('soiree-07-jeu-et-enrichissement',
   'Jeu et enrichissement au quotidien',
   'Occuper son chien sans l''épuiser',
   'Des activités qui fatiguent la tête, se glissent dans la journée et renforcent votre lien.',
   20.00, 'soiree', '2027-03-15 20:00:00+01', 90, 7, false),

  ('soiree-08-protection-des-ressources',
   'La protection des ressources',
   'Gamelle, jouets, canapé : quand le chien garde',
   'Comprendre la protection de ressources et la désamorcer sans passer en force.',
   20.00, 'soiree', '2027-04-19 20:00:00+02', 90, 8, false),

  ('soiree-09-balades-et-autocontroles',
   'Balades réussies et autocontrôles',
   'Des sorties agréables pour vous deux',
   'Construire les autocontrôles qui rendent la balade tranquille, en ville comme en nature.',
   20.00, 'soiree', '2027-05-10 20:00:00+02', 90, 9, false),

  ('soiree-10-ado-et-jeune-chien',
   'Ado et jeune chien',
   'Traverser l''adolescence sans tout perdre',
   'Pourquoi tout semble régresser vers 8-18 mois, et comment tenir le cap.',
   20.00, 'soiree', '2027-06-14 20:00:00+02', 90, 10, false)
ON CONFLICT (slug) DO NOTHING;

-- ── 5. Liens Zoom des 10 soirées (secrets, jamais lisibles publiquement) ────
-- Réunions déjà créées sur le compte us06web : un identifiant par soirée, code
-- secret intégré au lien, salle d'attente active, enregistrement cloud
-- automatique. Aucun compte Zoom n'est nécessaire côté participante.
INSERT INTO webinar_access (product_id, zoom_url, zoom_meeting_id)
SELECT p.id, v.zoom_url, v.zoom_meeting_id
FROM (VALUES
  ('soiree-01-le-rappel',                'https://us06web.zoom.us/j/88395098054?pwd=WjXqC8A9wIYVtnf1gVSGSIR1uiO8K7.1', '88395098054'),
  ('soiree-02-marche-en-laisse',         'https://us06web.zoom.us/j/82511550935?pwd=28rHlWn2nZso5wwV0i7pyci9SCMppl.1', '82511550935'),
  ('soiree-03-langage-du-chien',         'https://us06web.zoom.us/j/84013524457?pwd=yCyq0P6nDVIbJqSKHxXOQFOGoKMrRp.1', '84013524457'),
  ('soiree-04-calme-et-frustration',     'https://us06web.zoom.us/j/84963362705?pwd=0eWsbjUUuvzh9zyVoAHlQM8gV0rWtj.1', '84963362705'),
  ('soiree-05-reactivite-en-balade',     'https://us06web.zoom.us/j/86793754379?pwd=zxcsdbtEwYfP6nsDmNM4BlRRETwAZr.1', '86793754379'),
  ('soiree-06-anxiete-de-separation',    'https://us06web.zoom.us/j/87020907424?pwd=dy5faO0wXQ24j3aJaKbHFKdUI3hlhX.1', '87020907424'),
  ('soiree-07-jeu-et-enrichissement',    'https://us06web.zoom.us/j/84955712529?pwd=TJv5V5QEilrIFn1COnh8lJF5AHxhSX.1', '84955712529'),
  ('soiree-08-protection-des-ressources','https://us06web.zoom.us/j/81332195668?pwd=br0aSyvfkndXKZaW4DjgmZOejjEhEh.1', '81332195668'),
  ('soiree-09-balades-et-autocontroles', 'https://us06web.zoom.us/j/86914125486?pwd=0tHFSZA8iwZVr7s5zVY7mN7pgn2WjP.1', '86914125486'),
  ('soiree-10-ado-et-jeune-chien',       'https://us06web.zoom.us/j/86970459032?pwd=DUYU6rr3YjedPfkz0zrotPSo0eXsNJ.1', '86970459032')
) AS v(slug, zoom_url, zoom_meeting_id)
JOIN digital_products p ON p.slug = v.slug
ON CONFLICT (product_id) DO UPDATE
  SET zoom_url        = EXCLUDED.zoom_url,
      zoom_meeting_id = EXCLUDED.zoom_meeting_id;
