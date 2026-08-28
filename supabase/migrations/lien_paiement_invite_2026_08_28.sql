-- Lien de paiement personnel pour une demande sans compte.
--
-- Un membre paie depuis son planning, dans l'app : il est identifié par sa
-- session. Quelqu'un qui a réservé depuis le site n'a pas de compte, donc pas
-- de session, donc pas d'écran où cliquer. Il lui faut un lien qu'on peut lui
-- envoyer par email et qui l'amène directement au paiement.
--
-- public_token sert de clé de ce lien. C'est un UUID v4 tiré au hasard : 122
-- bits, indevinable. Il vaut identification à lui seul, donc il ne doit jamais
-- apparaître dans une notification, un log ou une page.
--
-- payment_link_sent_at borne les renvois : la fonction qui envoie l'email
-- refuse si un envoi date de moins d'une heure. Sans ce garde-fou, un appel
-- répété à la fonction publique aurait suffi à harceler un client par email.

alter table public.private_course_requests
  add column if not exists public_token uuid not null default gen_random_uuid(),
  add column if not exists payment_link_sent_at timestamptz;

comment on column public.private_course_requests.public_token is
  'Clé du lien de paiement envoyé aux demandeurs sans compte. Vaut identification : ne jamais l''afficher ni la journaliser.';
comment on column public.private_course_requests.payment_link_sent_at is
  'Dernier envoi de l''email « créneau confirmé, voici le lien pour payer ». Borne les renvois.';

-- Le jeton sert à retrouver UNE demande : sans unicité garantie, une collision
-- (même improbable) ferait tomber deux clients sur le même paiement.
create unique index if not exists private_course_requests_public_token_key
  on public.private_course_requests (public_token);
