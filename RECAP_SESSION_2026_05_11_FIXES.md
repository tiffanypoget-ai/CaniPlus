# Récap fixes — 11 mai 2026 (session bug-fix paiement sur place)

Tous les correctifs ont été poussés sur GitHub directement (sans GitHub Desktop) via une edge function temporaire `dev-push-files` qui a été supprimée après usage. Vercel redéploie automatiquement.

## Bugs corrigés

**1. Onglet admin « À encaisser » plantait avec « Could not find a relationship between 'subscriptions' and 'user_id' »**
- Cause : PostgREST n'inférait pas la FK profiles via la jointure `profiles:user_id ( ... )` 
- Fix : deux requêtes séparées (subscriptions cash pending, puis profiles via `in('id', userIds)`)
- Bonus : affichage du supplément déplacement à côté du type de prestation

**2. Profil affichait « À régler · CHF 60 » même après paiement sur place**
- Cause : label statique en dur, sans tenir compte de `status='pending_payment'` + `payment_mode='cash'`
- Fix : nouveau label « Réservée · à payer sur place (60 + X CHF déplacement) » avec badge « Cash à la séance »

**3. Choix sur place dans Profil → leçon privée échouait silencieusement**
- Cause : RLS subscriptions n'autorisait UPDATE qu'au service_role
- Fix : policy `subscriptions_update_own` (USING/WITH CHECK = `auth.uid() = user_id`)

**4. Colonnes manquantes sur subscriptions**
- `postal_code`, `city`, `road_km`, `travel_extra_chf` n'avaient été ajoutées qu'à `private_course_requests`
- Fix : ALTER TABLE pour les ajouter aussi à `subscriptions`

**5. Inscription au cours théorique en cash non effective**
- Cause : course_attendance n'avait pas de policy UPDATE pour le upsert
- Fix : policy `ca_update_own`

**6. Bouton « S'inscrire & payer » s'affichait alors qu'on était déjà inscrit**
- Cause : la condition n'utilisait pas attendees pour vérifier
- Fix : check `attendees.some(a => a.user_id === profile.id)` → affiche « Inscrit·e à ce cours » à la place

**7. Bouton cours privé sur Planning → window.confirm rustique**
- Fix : vrai bottom-sheet stylé avec deux boutons « En ligne / Sur place »
- Aussi : policy `pcr_update_cash_own` pour permettre l'UPDATE en cash par l'utilisateur

**8. TWINT bloquait l'achat sur le site vitrine**
- Cause : TWINT pas activé sur le compte Stripe pour ce type de session
- Fix : retrait de `payment_method_types: ['card', 'twint']` (Stripe utilise les méthodes activées)
- À remettre quand le PSP TWINT confirmera l'autorisation

## État actuel

- 4 fichiers front pushés sur main, Vercel redéploie
- 6 policies RLS ajoutées
- 4 colonnes ajoutées à subscriptions
- 2 edge functions déployées (public-product-checkout v2, dev-* supprimées)

Tout est prêt à tester à ton retour.
