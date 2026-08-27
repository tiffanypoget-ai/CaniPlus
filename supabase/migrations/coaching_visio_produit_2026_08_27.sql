-- Lot 19 : le coaching personnalisé en visio devient achetable depuis le site.
--
-- ⚠️ CETTE MIGRATION N'A PAS ÉTÉ EXÉCUTÉE. Elle est fournie pour que tu
-- l'appliques toi-même, une fois la PR relue : Supabase → SQL Editor, coller,
-- exécuter. Rien n'a été créé dans ta base ni dans ton compte Stripe.
--
-- Aucune fiche produit Stripe n'est nécessaire : public-product-checkout
-- construit la session avec un price_data en ligne, à partir de cette ligne.
--
-- Après exécution, le bouton « Réserver mon heure, 60 CHF » de la carte
-- Coaching de l'accueil devient fonctionnel. Tant qu'elle n'est pas jouée, le
-- bouton renvoie « Produit introuvable ou non publié. » — pense donc à
-- l'exécuter en même temps que tu fusionnes, ou à laisser is_published à false
-- puis à le basculer quand tu es prête.

insert into public.digital_products (
  slug,
  title,
  subtitle,
  description,
  price_chf,
  category,
  is_published,
  display_order,
  bullet_points
) values (
  'coaching-visio-60',
  'Coaching personnalisé en visio',
  'Une heure en tête-à-tête avec Tiffany, depuis chez toi',
  'Une séance individuelle d''une heure, en visio sur Zoom ou Meet. On regarde ta situation, ton chien et tes objectifs, et tu repars avec un plan concret. Idéal pour préparer une arrivée, faire le point ou valider un choix. Après paiement, tu reçois un email pour convenir du créneau.',
  60.00,
  'coaching',
  true,
  1,
  array[
    '1 heure d''échange individuel',
    'En visio, sur Zoom ou Meet',
    'Partout en Suisse romande',
    'Créneau fixé avec toi après le paiement'
  ]
)
on conflict (slug) do nothing;
