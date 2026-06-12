# stripe-webhook — v38 (12.06.2026)
Source de vérité : fonction déployée sur Supabase (version 38).
Changements v38 :
- invoice.payment_failed ne révoque PLUS le premium (Stripe relance la carte
  automatiquement ; seul customer.subscription.deleted révoque). Notif admin à la place.
- charge.refunded → dépense compta « à valider » (entité RI par défaut, à vérifier) + notif.
- Dates compta en Europe/Zurich (plus de décalage UTC à minuit).
Événements requis dans le Dashboard Stripe (Développeurs → Webhooks) :
checkout.session.completed, invoice.payment_succeeded, invoice.payment_failed,
customer.subscription.updated, customer.subscription.deleted, charge.refunded
