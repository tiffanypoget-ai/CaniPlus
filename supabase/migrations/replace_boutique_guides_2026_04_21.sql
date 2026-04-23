-- Migration : remplacement des 3 anciens produits boutique par les 3 nouveaux guides CaniPlus
-- Date : 2026-04-21
-- Contexte : Tiffany a rédigé 3 guides complets avec illustrations (Pexels libre de droits) :
--   1) Accueillir un 2e chien              — 24 CHF (~103 pages)
--   2) Adopter un chien de refuge          — 19 CHF (~70 pages)
--   3) Randonnée & nature en Suisse        — 29 CHF (~58 pages)
--
-- Les 3 anciens produits (pack-10-fiches-education, guide-premiers-mois-chiot, guide-langage-canin)
-- sont dépubliés (is_published = false) mais conservés en base pour historique des achats.
--
-- ⚠️ Après cette migration, Tiffany doit :
--   1) Uploader les 3 nouveaux PDFs dans le bucket digital-products :
--      - accueillir-2e-chien.pdf
--      - adopter-chien-refuge.pdf
--      - randonnee-nature-suisse.pdf
--   2) Uploader les covers dans le bucket article-covers (ou en CDN)
--   3) Vérifier les URLs cover_image_url
--
-- Rollback : voir la section en bas si besoin de revenir en arrière.

-- ─── 1. Dépublier les 3 anciens produits (mais on les garde pour l'historique) ──
UPDATE digital_products
SET is_published = false,
    updated_at = NOW()
WHERE slug IN (
  'pack-10-fiches-education',
  'guide-premiers-mois-chiot',
  'guide-langage-canin'
);

-- ─── 2. Insérer les 3 nouveaux guides ────────────────────────────────────────
INSERT INTO digital_products (
  slug, title, subtitle, description, long_description,
  price_chf, file_path, pages_count, category, tags, bullet_points, display_order, is_published
) VALUES
(
  'accueillir-2e-chien',
  'Accueillir un 2e chien',
  'Préparer ton chien, ta maison et ton quotidien à l''arrivée d''un deuxième compagnon',
  'Le guide complet pour réussir l''accueil d''un deuxième chien : choisir le bon compagnon, préparer ton chien résident, réussir la rencontre, gérer les ressources au quotidien. Basé sur 10 ans d''accompagnement de familles à deux chiens.',
  E'Tu y penses depuis des mois. Tu veux être sûr·e de ne pas tout chambouler. Ce guide te donne la méthode complète — celle que j''utilise avec les familles que j''accompagne à Ballaigues.\n\n**Ce que tu vas y apprendre :**\n- Comment savoir si c''est vraiment le bon moment (les signaux qui disent oui, ceux qui disent pas maintenant)\n- Choisir le bon second chien : sexe, âge, taille, complémentarité\n- Les pièges classiques (dont la grande erreur des deux chiots)\n- Préparer ta maison et ton premier chien\n- Réussir la rencontre (jamais à la maison en premier, pourquoi)\n- Premières heures, première nuit, premières balades\n- Gestion des ressources (gamelles, jouets, paniers, canapé, attention humaine)\n- Le langage entre chiens : signaux d''apaisement, inconfort, vraie "hiérarchie"\n- Ton rôle : ni alpha, ni copain — organisateur\n- Les tensions, la première dispute, les cas particuliers (senior + jeune, refuge, deux chiots)\n- Checklists semaine 1, 2-3, mois 2, mois 3\n- FAQ complète\n\n103 pages illustrées, tutoiement bienveillant, zéro méthode punitive. Livraison instantanée par email.',
  24.00,
  'accueillir-2e-chien.pdf',
  103,
  'guide',
  ARRAY['accueil', 'deux-chiens', 'rencontre', 'ressources', 'cohabitation', 'chiot', 'refuge', 'senior'],
  ARRAY[
    '103 pages illustrées, structuré par étapes (pas par jours)',
    'Méthode éprouvée sur 10 ans d''accompagnement',
    'Cas particuliers : senior + jeune, chien de refuge, deux chiots',
    'Checklists pas-à-pas pour les 3 premiers mois'
  ],
  1,
  true
),
(
  'adopter-chien-refuge',
  'Adopter un chien de refuge',
  'Préparer, accueillir et faire grandir une vraie confiance avec un chien qui a une histoire',
  'Un chien de refuge, ce n''est pas un chien "comme les autres" : il arrive avec une histoire que tu ne connais pas. Ce guide te donne la méthode complète, du choix au refuge jusqu''aux 3 premiers mois à la maison. Pensé pour la Suisse romande.',
  E'Tu hésites entre "sauver" et "bien choisir". Tu sens qu''il te faut une vraie méthode. Ce guide est pour toi.\n\n**Ce que tu vas y apprendre :**\n- Les bonnes et les mauvaises raisons d''adopter (le mythe de la "reconnaissance")\n- Où chercher : refuges suisses, associations de sauvetage, cas particuliers (import étranger)\n- Choisir le bon chien : profil, ce que tu observes et demandes au refuge\n- Préparer la maison (sans sur-équipement)\n- Le jour J : trajet, arrivée, décompression\n- La règle 3-3-3 : ce qu''elle dit vraiment et comment l''appliquer\n- Gérer le stress, la peur, la réactivité (sans aggraver)\n- Balades, rencontres, règles pour la maison : procéder en douceur\n- Les apprentissages prioritaires (et ce qu''il ne faut surtout pas corriger tout de suite)\n- Les erreurs les plus fréquentes — dont la plus grosse : se culpabiliser\n- Santé : premières visites, bilan, à qui s''adresser en Suisse romande\n- FAQ complète avant et après l''adoption\n\n70 pages illustrées, sans jugement, sans pression. Livraison instantanée par email.',
  19.00,
  'adopter-chien-refuge.pdf',
  70,
  'guide',
  ARRAY['refuge', 'adoption', 'chien-adulte', 'reactivite', 'confiance', 'regle-3-3-3'],
  ARRAY[
    '70 pages illustrées, adapté Suisse romande',
    'La règle 3-3-3 expliquée concrètement',
    'Méthode sans culpabilisation',
    'Spécial chien qui a une histoire'
  ],
  2,
  true
),
(
  'randonnee-nature-suisse',
  'Randonnée & nature avec ton chien en Suisse',
  'Sortir loin, en sécurité, en respectant ton chien et la montagne suisse',
  'Le guide de la randonnée canine en Suisse : préparation, matériel, dangers spécifiques (tiques, processionnaires, troupeaux, chiens de protection, chasse), règles cantonales, itinéraires testés par canton, bivouac et refuge CAS.',
  E'Tu adores les Alpes, le Jura, les rives du Léman. Tu veux partager ça avec ton chien sans mettre sa santé ni sa sécurité en jeu. Ce guide est pour toi.\n\n**Ce que tu vas y apprendre :**\n\n*Préparation et matériel*\n- Savoir si ton chien est prêt (âge, race, condition, rappel)\n- Le matériel qui sert vraiment : harnais de rando, longe de nature, gourde, trousse, protection des pattes\n\n*Dangers spécifiques Suisse*\n- Tiques, processionnaires, serpents (vipère, couleuvre)\n- Troupeaux et chiens de protection (le chapitre à lire avant d''aller en alpage)\n- Chasse et ses saisons\n- Falaises, torrents, gorges, lacs et rivières\n- Altitude, hypothermie, mal aigu des montagnes\n- Orages, avalanches, neige\n- Plantes toxiques\n\n*Règles et cartes*\n- Les différences entre Vaud, Valais, Fribourg, Neuchâtel, Jura, Berne\n- Cartes officielles (map.geo.admin.ch, SuisseMobile)\n- Parcs naturels régionaux et nationaux\n\n*Itinéraires testés par canton*\nVaud, Valais, Fribourg, Neuchâtel et Jura, Berne, Genève, Tessin et Grisons — avec distance, dénivelé, points d''attention chien.\n\n*Séjour en autonomie*\nBivouac, refuge CAS, camping, voiture.\n\n*Après la sortie*\nVérifications (tiques, coussinets), récupération, quand consulter le véto, construire ton carnet de courses.\n\n58 pages illustrées, livraison instantanée par email, mises à jour gratuites (les règles cantonales évoluent).',
  29.00,
  'randonnee-nature-suisse.pdf',
  58,
  'guide',
  ARRAY['randonnee', 'montagne', 'suisse', 'nature', 'itineraires', 'bivouac', 'securite'],
  ARRAY[
    '58 pages illustrées, spécifique Suisse',
    'Dangers locaux (tiques, troupeaux, chiens de protection)',
    'Règles cantonales et cartes officielles',
    'Itinéraires testés par canton + bivouac/refuge CAS'
  ],
  3,
  true
)
ON CONFLICT (slug) DO UPDATE
  SET title            = EXCLUDED.title,
      subtitle         = EXCLUDED.subtitle,
      description      = EXCLUDED.description,
      long_description = EXCLUDED.long_description,
      price_chf        = EXCLUDED.price_chf,
      file_path        = EXCLUDED.file_path,
      pages_count      = EXCLUDED.pages_count,
      category         = EXCLUDED.category,
      tags             = EXCLUDED.tags,
      bullet_points    = EXCLUDED.bullet_points,
      display_order    = EXCLUDED.display_order,
      is_published     = EXCLUDED.is_published,
      updated_at       = NOW();

-- ─── 3. Vérification ────────────────────────────────────────────────────
-- SELECT slug, title, price_chf, is_published, display_order
-- FROM digital_products
-- ORDER BY display_order, created_at;

-- Les nouveaux guides doivent apparaître avec is_published = true.
-- Les anciens (pack-10-fiches-education, guide-premiers-mois-chiot, guide-langage-canin)
-- sont conservés mais is_published = false (non visibles dans la boutique).

-- ─── 4. Rollback (si besoin d'annuler) ──────────────────────────────────
-- Pour re-publier les anciens et dépublier les nouveaux :
-- UPDATE digital_products SET is_published = true, updated_at = NOW()
--   WHERE slug IN ('pack-10-fiches-education', 'guide-premiers-mois-chiot', 'guide-langage-canin');
-- UPDATE digital_products SET is_published = false, updated_at = NOW()
--   WHERE slug IN ('accueillir-2e-chien', 'adopter-chien-refuge', 'randonnee-nature-suisse');
