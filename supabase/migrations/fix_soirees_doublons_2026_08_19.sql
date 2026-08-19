-- ============================================================================
-- Correctif : doublons de soirées créés par le seed du 18.08.2026
-- Appliqué en production le 19 août 2026.
-- ----------------------------------------------------------------------------
-- Ce qui s'est passé
--   La première version de add_soirees_saison_2026_2027_2026_08_18.sql insérait
--   les 10 soirées de la saison sous les slugs 'soiree-01-...' à 'soiree-10-...'.
--   Elles existaient déjà depuis le 3 août sous d'autres slugs
--   ('soiree-2026-09-rappel' et suivants), avec leurs descriptions, bullet
--   points et images de couverture. Le ON CONFLICT (slug) ne pouvait pas les
--   reconnaître : la base s'est retrouvée avec 20 soirées, dont 10 vides
--   portant les liens Zoom et 10 complètes sans lien.
--
-- Ce que fait ce correctif
--   1. Reporte les liens Zoom des doublons vers les soirées d'origine.
--   2. Supprime les doublons.
--
-- Aucune inscription n'existait sur les lignes supprimées (vérifié avant
-- exécution : 0 ligne dans user_purchases). Le garde-fou ci-dessous refait la
-- vérification et interrompt tout si ce n'est plus vrai.
--
-- Ce fichier est idempotent : rejoué après coup, il ne trouve plus de doublon
-- et ne fait rien.
-- ============================================================================

DO $do$
DECLARE
  nb_achats  integer;
  nb_doublons integer;
BEGIN
  SELECT count(*) INTO nb_doublons
  FROM digital_products
  WHERE category = 'soiree' AND slug ~ '^soiree-(0[1-9]|10)-';

  IF nb_doublons = 0 THEN
    RAISE NOTICE 'Aucun doublon à corriger.';
    RETURN;
  END IF;

  -- Garde-fou : ne jamais supprimer une soirée qui porte des inscriptions.
  SELECT count(*) INTO nb_achats
  FROM user_purchases up
  JOIN digital_products p ON p.id = up.product_id
  WHERE p.category = 'soiree' AND p.slug ~ '^soiree-(0[1-9]|10)-';

  IF nb_achats > 0 THEN
    RAISE EXCEPTION
      'Correctif interrompu : % inscription(s) sur les doublons. À traiter à la main.',
      nb_achats;
  END IF;

  -- 1. Reporter les liens Zoom sur les soirées d'origine
  WITH paires(nouveau, ancien) AS (VALUES
    ('soiree-01-le-rappel',                 'soiree-2026-09-rappel'),
    ('soiree-02-marche-en-laisse',          'soiree-2026-10-laisse'),
    ('soiree-03-langage-du-chien',          'soiree-2026-11-langage'),
    ('soiree-04-calme-et-frustration',      'soiree-2026-12-calme'),
    ('soiree-05-reactivite-en-balade',      'soiree-2027-01-reactivite'),
    ('soiree-06-anxiete-de-separation',     'soiree-2027-02-separation'),
    ('soiree-07-jeu-et-enrichissement',     'soiree-2027-03-jeu'),
    ('soiree-08-protection-des-ressources', 'soiree-2027-04-ressources'),
    ('soiree-09-balades-et-autocontroles',  'soiree-2027-05-balades'),
    ('soiree-10-ado-et-jeune-chien',        'soiree-2027-06-ado')
  )
  INSERT INTO webinar_access (product_id, zoom_url, zoom_meeting_id)
  SELECT po.id, wn.zoom_url, wn.zoom_meeting_id
  FROM paires
  JOIN digital_products pn ON pn.slug = paires.nouveau
  JOIN digital_products po ON po.slug = paires.ancien
  JOIN webinar_access    wn ON wn.product_id = pn.id
  ON CONFLICT (product_id) DO UPDATE
    SET zoom_url        = EXCLUDED.zoom_url,
        zoom_meeting_id = EXCLUDED.zoom_meeting_id;

  -- 2. Supprimer les doublons (webinar_access suit en cascade)
  DELETE FROM digital_products
  WHERE category = 'soiree' AND slug ~ '^soiree-(0[1-9]|10)-';

  RAISE NOTICE '% doublon(s) supprimé(s), liens Zoom reportés.', nb_doublons;
END
$do$;

-- Contrôle final : 10 soirées, toutes avec leur lien Zoom.
--   SELECT p.display_order, p.slug, p.title, (w.zoom_url IS NOT NULL) AS a_zoom
--   FROM digital_products p
--   LEFT JOIN webinar_access w ON w.product_id = p.id
--   WHERE p.category = 'soiree' ORDER BY p.display_order;
