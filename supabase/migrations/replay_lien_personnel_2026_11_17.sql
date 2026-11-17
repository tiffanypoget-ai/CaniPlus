-- Lot 3 : replay des soirées par lien personnel (17.11.2026).
--
-- Chaque achat reçoit un jeton aléatoire : le mail du lendemain et le mail de
-- replay pointent vers caniplus.ch/replay?t=<jeton>. La page lit la vidéo
-- (YouTube non répertoriée, ou lien Zoom) tant que replay_expires_at n'est
-- pas passé, puis annonce la fin du replay. Le jeton ne donne accès qu'au
-- replay de CETTE soirée, et seulement si l'achat est payé.
--
-- replay_rappel_at : date du mail envoyé à Tiffany le lendemain de
-- l'expiration, pour qu'elle retire la vidéo de YouTube ou de Zoom (aucun des
-- deux ne coupe l'accès tout seul).

alter table public.user_purchases
  add column if not exists replay_token uuid not null default gen_random_uuid();
create unique index if not exists user_purchases_replay_token_key
  on public.user_purchases (replay_token);

alter table public.webinar_access
  add column if not exists replay_rappel_at timestamptz;
