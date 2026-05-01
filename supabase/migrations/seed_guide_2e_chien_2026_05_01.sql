-- Migration : seed du 1er guide boutique "Accueillir un 2e chien" a 25 CHF
-- Date : 2026-05-01 (lancement public CaniPlus)
--
-- IMPORTANT : avant d'executer ce SQL, uploader le fichier PDF dans le bucket
-- Supabase Storage `digital-products` avec le nom EXACT : `accueillir-2e-chien.pdf`
--
-- Le bucket digital-products doit etre PRIVE (pas public) — l'edge function
-- get-product-download genere une signed URL apres verification de l'achat.
--
-- Contenu reel : 42 pages, 5 chapitres
-- 01 Preparer son arrivee · 02 Les 48 premieres heures · 03 Les premieres
-- rencontres · 04 Construire l'entente au quotidien · 05 Faire tribu sur la duree

-- 1. Nettoyer les anciens placeholders/seeds (au cas ou)
DELETE FROM digital_products
 WHERE slug IN (
   'pack-10-fiches-education',
   'guide-premiers-mois-chiot',
   'guide-langage-canin',
   'adopter-chien-refuge',
   'randonnee-nature-suisse'
 );

-- 2. Insert (ou update) du 1er guide
INSERT INTO digital_products (
  slug, title, subtitle, description, long_description,
  price_chf, file_path, cover_image_url, pages_count, category, tags, bullet_points,
  display_order, is_published
) VALUES (
  'accueillir-2e-chien',
  'Accueillir un 2e chien',
  'Préparer le terrain, vivre les premières heures, faire tribu sur la durée',
  'Tout ce que je dis aux familles qui veulent un deuxième chien. Préparer la maison avant l''arrivée, accompagner les rencontres, installer la vie à deux, et faire grandir une vraie tribu sur la durée. 42 pages.',
  E'Tu y penses depuis des mois. Peut-être des années. Ton chien est adorable, bien dans ses pattes, et tu te dis qu''il lui manque quelque chose. Ou c''est toi qui as envie d''un deuxième compagnon, d''une autre histoire à vivre.\n\nÇa ne se joue pas à la chance. Un deuxième chien réussi, ça se construit étape par étape, avec du temps, de la préparation, et une méthode qui respecte chacun à son rythme.\n\nAU SOMMAIRE\n\n1. PRÉPARER SON ARRIVÉE\nPoser les bonnes fondations avant le grand jour.\n\n2. LES 48 PREMIÈRES HEURES\nVivre l''arrivée sans rien précipiter.\n\n3. LES PREMIÈRES RENCONTRES\nLire les signaux et accompagner les retrouvailles.\n\n4. CONSTRUIRE L''ENTENTE AU QUOTIDIEN\nInstaller les piliers d''une vraie cohabitation.\n\n5. FAIRE TRIBU SUR LA DURÉE\nGrandir ensemble, saison après saison.\n\nC''est tout ce que je dis aux familles que j''accompagne sur ce sujet. Lis-le une première fois en entier. Tu y reviendras piocher pendant des mois.\n\n42 pages. Méthode positive, zéro punition. Livraison par e-mail tout de suite après le paiement.',
  25.00,
  'accueillir-2e-chien.pdf',
  '/images/boutique/cover-accueillir-2e-chien.jpg',
  42,
  'guide',
  ARRAY['accueil', 'deux-chiens', 'rencontre', 'cohabitation', 'preparation'],
  ARRAY[
    '42 pages, 5 chapitres',
    'De la préparation à la vie à deux installée',
    'Méthode positive, zéro punition',
    'Construit sur ce que je dis aux familles que j''accompagne'
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
      cover_image_url  = EXCLUDED.cover_image_url,
      pages_count      = EXCLUDED.pages_count,
      category         = EXCLUDED.category,
      tags             = EXCLUDED.tags,
      bullet_points    = EXCLUDED.bullet_points,
      display_order    = EXCLUDED.display_order,
      is_published     = EXCLUDED.is_published,
      updated_at       = NOW();

-- Verification
SELECT slug, title, price_chf, pages_count, is_published
  FROM digital_products
 WHERE is_published = true
 ORDER BY display_order;
