-- Migration : seed du 1er guide boutique "Accueillir un 2e chien" a 25 CHF
-- Date : 2026-05-01 (lancement public CaniPlus)
--
-- IMPORTANT : avant d'executer ce SQL, uploader le fichier PDF dans le bucket
-- Supabase Storage `digital-products` avec le nom EXACT : `accueillir-2e-chien.pdf`
--
-- Le bucket digital-products doit etre PRIVE (pas public) — l'edge function
-- get-product-download genere une signed URL apres verification de l'achat.

-- 1. Nettoyer les anciens placeholders/seeds (au cas ou)
DELETE FROM digital_products
 WHERE slug IN (
   'pack-10-fiches-education',
   'guide-premiers-mois-chiot',
   'guide-langage-canin',
   'adopter-chien-refuge',
   'randonnee-nature-suisse'
 );

-- 2. Insert du 1er guide (les autres viendront plus tard)
INSERT INTO digital_products (
  slug, title, subtitle, description, long_description,
  price_chf, file_path, pages_count, category, tags, bullet_points,
  display_order, is_published
) VALUES (
  'accueillir-2e-chien',
  'Accueillir un 2e chien',
  'Préparer ton chien, ta maison et ton quotidien à l''arrivée d''un deuxième compagnon',
  'Le guide complet pour réussir l''accueil d''un deuxième chien : choisir le bon compagnon, préparer ton chien résident, réussir la rencontre, gérer les ressources au quotidien. Basé sur 10 ans d''accompagnement de familles à deux chiens.',
  E'Tu y penses depuis des mois. Tu veux être sûr·e de ne pas tout chambouler. Ce guide te donne la méthode complète — celle que j''utilise avec les familles que j''accompagne à Ballaigues.\n\n**Ce que tu vas y apprendre :**\n- Comment savoir si c''est vraiment le bon moment (les signaux qui disent oui, ceux qui disent pas maintenant)\n- Choisir le bon second chien : sexe, âge, taille, complémentarité\n- Les pièges classiques (dont la grande erreur des deux chiots)\n- Préparer ta maison et ton premier chien\n- Réussir la rencontre (jamais à la maison en premier, pourquoi)\n- Premières heures, première nuit, premières balades\n- Gestion des ressources (gamelles, jouets, paniers, canapé, attention humaine)\n- Le langage entre chiens : signaux d''apaisement, inconfort, vraie "hiérarchie"\n- Ton rôle : ni alpha, ni copain — organisateur\n- Les tensions, la première dispute, les cas particuliers (senior + jeune, refuge, deux chiots)\n- Checklists semaine 1, 2-3, mois 2, mois 3\n- FAQ complète\n\n103 pages illustrées, tutoiement bienveillant, zéro méthode punitive. Livraison instantanée par email.',
  25.00,
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

-- Verifier
SELECT slug, title, price_chf, is_published FROM digital_products WHERE is_published = true ORDER BY display_order;
