-- Range l'ancienne fiche produit du coaching visio.
--
-- Tant que le coaching se payait d'avance, il lui fallait une fiche dans
-- digital_products, comme un guide ou une soirée : c'est elle que le bouton
-- « Réserver mon heure, 60 CHF » appelait.
--
-- Depuis la bascule vers la réservation (proposer trois moments, payer une
-- fois le créneau confirmé), plus aucun bouton ne la propose. Elle n'était
-- déjà affichée nulle part : la boutique du site est en HTML fixe et ne la
-- contient pas, et l'app ne liste que les soirées (category = 'soiree').
--
-- Elle restait pourtant payable : public-product-checkout accepte un slug, et
-- quelqu'un connaissant 'coaching-visio-60' pouvait encore déclencher
-- l'ancien paiement immédiat, en court-circuitant le nouveau parcours.
-- La fonction filtre sur is_published, donc la dépublier suffit à fermer ce
-- chemin : elle répond alors « Produit introuvable ou non publié ».
--
-- Dépubliée et non supprimée : les achats passés y font référence
-- (user_purchases.product_id), et les supprimer casserait l'historique.
-- Pour revenir en arrière : repasser is_published à true.

update public.digital_products
   set is_published = false
 where slug = 'coaching-visio-60';
