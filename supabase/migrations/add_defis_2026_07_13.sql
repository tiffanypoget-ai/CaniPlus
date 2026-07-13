-- ============================================================================
-- Les Défis CaniPlus — mini-programmes gratuits et guidés sur plusieurs jours
-- Créé le 13 juillet 2026.
--
-- Porte d'entrée grand public : un défi = un parcours de N jours (un exercice
-- par jour, déblocage quotidien), qui se conclut par une récompense — pour le
-- premier défi : 1 mois de premium OFFERT (abonnement Stripe RI avec trial de
-- 30 jours, créé par l'edge function claim-defi-reward), puis 10 CHF/mois.
--
-- Structure générique : plusieurs défis peuvent coexister dans le temps,
-- aucun contenu n'est codé en dur dans l'app.
-- ============================================================================

-- ── 1. defis : le catalogue ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS defis (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug             TEXT UNIQUE NOT NULL,
  titre            TEXT NOT NULL,
  pitch            TEXT,                       -- accroche courte (carte de la liste)
  description      TEXT,                       -- promesse complète (écran d'accueil du défi)
  image_url        TEXT,
  duree_jours      INTEGER NOT NULL DEFAULT 7,
  statut           TEXT NOT NULL DEFAULT 'brouillon' CHECK (statut IN ('brouillon', 'actif', 'archive')),
  recompense_type  TEXT NOT NULL DEFAULT 'premium_trial_30j',
  recompense_texte TEXT,                       -- description de la récompense (écran de fin)
  fin_titre        TEXT,                       -- titre de l'écran de félicitations
  fin_texte        TEXT,                       -- texte de l'écran de félicitations
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 2. defi_jours : le contenu de chaque jour ────────────────────────────────
CREATE TABLE IF NOT EXISTS defi_jours (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  defi_id        UUID NOT NULL REFERENCES defis(id) ON DELETE CASCADE,
  jour           INTEGER NOT NULL,
  titre          TEXT NOT NULL,
  objectif       TEXT,
  exercice       TEXT,
  astuces        TEXT,          -- encadré « Il n'y arrive pas ? » (une astuce par ligne)
  conseil        TEXT,          -- conseil complémentaire optionnel
  partage_invite TEXT,          -- phrase affichée à côté du bouton partage
  partage_texte  TEXT,          -- texte pré-rempli du partage natif (jamais bloquant)
  UNIQUE (defi_id, jour)
);

-- ── 3. defi_progression : où en est chaque personne ──────────────────────────
-- jours_completes : { "1": "2026-07-13T18:02:00Z", "2": ... } — la date de
-- validation de chaque jour sert au déblocage quotidien (jour suivant ouvert
-- le lendemain, heure suisse) et à la garde anti-triche de claim-defi-reward.
CREATE TABLE IF NOT EXISTS defi_progression (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  defi_id           UUID NOT NULL REFERENCES defis(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  jours_completes   JSONB NOT NULL DEFAULT '{}'::jsonb,
  completed_at      TIMESTAMPTZ,
  reward_claimed_at TIMESTAMPTZ,
  UNIQUE (user_id, defi_id)
);

CREATE INDEX IF NOT EXISTS idx_defi_progression_defi ON defi_progression (defi_id);

-- ── 4. profiles : suivi du rappel J-7 de fin de mois offert ─────────────────
-- Posé par l'edge function trial-reminder (cron quotidien) pour ne jamais
-- envoyer deux fois l'email « ton premium devient payant dans 7 jours ».
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS premium_trial_reminder_sent_at TIMESTAMPTZ;

-- ── 5. RLS ───────────────────────────────────────────────────────────────────
ALTER TABLE defis ENABLE ROW LEVEL SECURITY;
ALTER TABLE defi_jours ENABLE ROW LEVEL SECURITY;
ALTER TABLE defi_progression ENABLE ROW LEVEL SECURITY;

-- Défis actifs lisibles par tous les connectés ; brouillons visibles admin
-- uniquement (même logique que les soirées : prévisualisation dans l'app).
DROP POLICY IF EXISTS defis_read ON defis;
CREATE POLICY defis_read ON defis
  FOR SELECT USING (
    statut = 'actif'
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS defis_admin_all ON defis;
CREATE POLICY defis_admin_all ON defis
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

DROP POLICY IF EXISTS defi_jours_read ON defi_jours;
CREATE POLICY defi_jours_read ON defi_jours
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM defis WHERE defis.id = defi_jours.defi_id AND defis.statut = 'actif')
    OR EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

DROP POLICY IF EXISTS defi_jours_admin_all ON defi_jours;
CREATE POLICY defi_jours_admin_all ON defi_jours
  FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

-- Chacun gère SA progression ; l'admin lit tout (stats participants/complétions).
DROP POLICY IF EXISTS defi_progression_own ON defi_progression;
CREATE POLICY defi_progression_own ON defi_progression
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS defi_progression_admin_read ON defi_progression;
CREATE POLICY defi_progression_admin_read ON defi_progression
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

-- ── 6. Seed : « Défi Journée Off » (7 jours, actif) ──────────────────────────
INSERT INTO defis (slug, titre, pitch, description, duree_jours, statut, recompense_type, recompense_texte, fin_titre, fin_texte)
VALUES (
  'defi-journee-off',
  $t$Défi Journée Off — apprends à ton chien à se poser, partout$t$,
  $t$7 jours, 5 à 10 minutes par jour, pour un chien qui sait se poser partout.$t$,
  $t$Un chien qui sait se poser, c'est un chien bien dans ses pattes — à la maison, en balade, en terrasse. Pendant 7 jours, à raison de 5 à 10 minutes par jour, tu vas apprendre à ton chien à trouver le calme tout seul, étape par étape : d'abord dans ton salon, puis dehors, puis au milieu de la vraie vie.$t$,
  7,
  'actif',
  'premium_trial_30j',
  $t$1 mois de premium offert, avec toutes les ressources et une nouvelle ressource chaque semaine. Puis 10 CHF/mois, résiliable à tout moment.$t$,
  $t$Bravo, tu as réussi le Défi Journée Off !$t$,
  $t$En sept jours, ton chien est passé du calme dans le salon au calme dans la vraie vie. Tu lui as appris quelque chose que beaucoup de chiens ne savent jamais faire : être posé, détendu, quel que soit l'endroit. Et ce n'est qu'un début. Le calme, c'est la base sur laquelle tout le reste se construit.$t$
)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO defi_jours (defi_id, jour, titre, objectif, exercice, astuces, conseil, partage_invite, partage_texte)
SELECT d.id, j.jour, j.titre, j.objectif, j.exercice, j.astuces, j.conseil, j.partage_invite, j.partage_texte
FROM defis d,
LATERAL (VALUES
  (1,
   $t$Le calme, ça commence à la maison$t$,
   $t$Montrer à ton chien que se poser et ne rien faire, c'est exactement ce qui te plaît. Sans lui demander, sans le forcer. Juste en récompensant les moments où il choisit le calme tout seul.$t$,
   $t$Installe-toi tranquillement chez toi, dans une pièce calme, avec quelques récompenses dans la poche. Ne demande rien à ton chien. Vaque à tes occupations. Dès qu'il se pose de lui-même (il se couche, s'assoit, soupire), marque doucement d'un petit mot calme et donne une récompense, sans en faire des tonnes. Puis laisse-le tranquille. S'il se relève et se repose plus tard, recommence.$t$,
   $t$Pose-toi vraiment toi-même : assieds-toi, ralentis, respire calmement. Souvent, ton chien copie ton énergie.
Réduis son espace : installe-toi dans une petite pièce, ou ferme la porte pour limiter son terrain. Avec moins d'endroits où aller, il finit par se poser.
Laisse le temps faire : ne propose rien, ne joue pas. L'ennui finit par inviter au calme. Attends plus longtemps que tu ne le crois.$t$,
   NULL,
   $t$Prends ton chien en photo dans son moment de calme et partage.$t$,
   $t$Jour 1 du Défi Journée Off relevé : mon chien apprend que le calme, ça paie ! #DéfiJournéeOff$t$),
  (2,
   $t$L'interrupteur : de l'excité au calme$t$,
   $t$Apprendre à ton chien à redescendre tout seul après un moment d'excitation. C'est ça le vrai mode off : pas un chien qui dort toute la journée, mais un chien qui sait s'activer puis se poser.$t$,
   $t$Joue avec ton chien 30 secondes à une minute, quelque chose qu'il aime. Puis arrête net : range le jouet, cesse de bouger, pose-toi. Attends. Il restera en mode « on continue ? » un moment, puis redescendra. Dès qu'il se calme, marque et récompense tranquillement. Puis repars sur un petit jeu et recommence. On alterne : on monte, on redescend.$t$,
   $t$Arrête-toi vraiment : plus aucun mouvement, range le jouet hors de vue.
Sois patiente sur le premier essai, un chien excité met parfois plusieurs minutes à comprendre que le jeu est en pause.
Baisse ton énergie franchement. Si tu restes dynamique, il reste en attente de la suite.$t$,
   NULL,
   $t$Filme le moment où ton chien passe du jeu au calme et partage.$t$,
   $t$Jour 2 du Défi Journée Off : mon chien sait passer du jeu au calme tout seul. #DéfiJournéeOff$t$),
  (3,
   $t$Le calme sort dehors$t$,
   $t$Emmener le calme dehors. Pour ton chien, c'est un monde différent : des odeurs, de l'air, mille choses à explorer. Il apprend que le mode off marche aussi en pleine nature.$t$,
   $t$Pars en balade dans un endroit calme, un champ à l'écart, une lisière de forêt, sans autres chiens ni passage. Laisse d'abord ton chien marcher, renifler, explorer en longe au harnais. Puis, vers la fin de la balade, quand il est déjà bien dépensé, installe-toi. Pose-toi au sol ou sur une souche, détends-toi, et attends. Récompense chaque fois qu'il se pose de lui-même. Le décor va le distraire au début, laisse-lui le temps.$t$,
   $t$Prolonge la balade avant de tenter le calme. Il n'est peut-être pas encore assez dépensé.
Laisse-le renifler tout son soûl. Le nez qui travaille fatigue un chien autant qu'une course.
Si l'endroit est trop stimulant, éloigne-toi vers plus tranquille.$t$,
   $t$Fais-le en fin de balade, jamais au départ. Compte 30 à 40 minutes de marche et de reniflage, parfois jusqu'à une heure selon ton chien : un jeune plein d'énergie aura besoin de plus, un chien tranquille ou âgé de moins.$t$,
   $t$Ton chien posé en pleine nature — partage la photo.$t$,
   $t$Jour 3 du Défi Journée Off : le calme, même en pleine nature. #DéfiJournéeOff$t$),
  (4,
   $t$Le calme même quand c'est tentant$t$,
   $t$Ton chien découvre que rester calme face à quelque chose qu'il convoite, c'est ça qui le lui fait gagner. Pas se jeter dessus. Le début du self-control.$t$,
   $t$Prends une friandise que ton chien aime. Montre-la-lui, puis pose ta main fermée dessus, au sol ou devant toi. Il va pousser du nez, gratter, insister. Ne dis rien, ne bouge pas la main. Attends. Dès qu'il arrête, recule, se pose ou détourne la tête, marque et donne la friandise de ta main opposée. Répète et augmente petit à petit : la friandise à découvert sous ta main, puis posée au sol à côté de toi pendant qu'il reste posé.$t$,
   $t$S'il s'acharne sur ta main, garde-la fermée et attends. Ne la retire pas. Il finira par lâcher, et c'est ce moment que tu récompenses.
Commence plus facile : une friandise moins irrésistible.
S'il est trop excité pour réfléchir, fais-le après une balade.$t$,
   $t$Donne toujours la récompense de ta main opposée, pas celle qui couvrait la friandise, pour qu'il ne reste pas focalisé à fixer ta main. Sessions courtes, ce jeu demande de la concentration.$t$,
   $t$Filme la petite bouille de ton chien qui se retient et partage.$t$,
   $t$Jour 4 du Défi Journée Off : mon chien apprend le self-control. #DéfiJournéeOff$t$),
  (5,
   $t$Le calme même quand tu t'actives$t$,
   $t$Ton chien reste posé pendant que toi tu bouges. Beaucoup de chiens se lèvent dès que leur humain se met en mouvement. On lui apprend que ce n'est pas parce que tu t'actives qu'il doit te suivre partout.$t$,
   $t$Installe ton chien dans un endroit où il est à l'aise pour se poser, chez toi. Une fois posé, commence tout petit : amorce juste le geste de te lever, décolle-toi de ton siège. Rien que ça, c'est déjà un mouvement pour lui. S'il reste posé, marque et récompense. Puis monte doucement : te lever complètement, faire un pas, aller jusqu'à la porte et revenir, ranger un objet, t'éloigner un instant. À chaque étape où il reste tranquille, valide. S'il se lève, ne dis rien, attends qu'il se repose et reprends plus facile.$t$,
   $t$Réduis l'ampleur de ton mouvement : au début, un simple transfert de poids ou te lever à moitié suffit.
Reviens vite vers lui les premières fois, avant qu'il se lève. Tu allonges au fur et à mesure.
Choisis un moment où il est déjà fatigué, en fin de journée.$t$,
   $t$Ton premier palier, ce n'est pas un pas, c'est juste le fait de te lever, parfois même amorcer le geste. Mieux vaut dix petits paliers réussis qu'un grand raté.$t$,
   $t$Montre ton chien tranquille pendant que tu vaques à tes occupations.$t$,
   $t$Jour 5 du Défi Journée Off : je bouge, mon chien reste posé. #DéfiJournéeOff$t$),
  (6,
   $t$Le calme quand quelque chose se passe$t$,
   $t$La difficulté vient de l'extérieur, quelque chose qui bouge autour. Un promeneur, un vélo, un autre chien au loin. Il apprend que même quand il se passe des choses, il peut rester posé.$t$,
   $t$Place-toi d'où tu vois passer du mouvement, mais à bonne distance : un banc en retrait d'un chemin, le coin tranquille d'un parc. Ton chien en longe au harnais. L'idée n'est pas qu'il soit au milieu de l'agitation, mais qu'il l'observe de loin, assez loin pour rester capable de se poser. Récompense chaque fois qu'il reste calme pendant qu'une distraction passe. S'il regarde, laisse-le regarder. Ce qu'on récompense, c'est qu'il finisse par se détendre malgré tout.$t$,
   $t$Éloigne-toi encore. Quelques mètres de plus suffisent souvent à tout changer.
Choisis un moment plus calme, avec moins de passage, pour commencer.
Fais-le en fin de balade, chien déjà dépensé.$t$,
   $t$La distance est toute la clé du jour. S'il s'agite dès qu'il voit passer quelqu'un, tu es trop près. Recule de dix, vingt, trente mètres s'il le faut. Tu te rapprocheras les jours d'après, à son rythme.$t$,
   $t$Ton chien posé pendant que la vie défile autour — partage.$t$,
   $t$Jour 6 du Défi Journée Off : posé même quand ça bouge autour. #DéfiJournéeOff$t$),
  (7,
   $t$Le calme dans la vraie vie$t$,
   $t$L'aboutissement. Se poser dans un vrai lieu de vie, là où il y a du monde, du bruit, des odeurs de nourriture. Une terrasse, un banc en ville, devant la boulangerie.$t$,
   $t$Choisis un lieu fréquenté mais où tu peux rester un peu en retrait, à une heure pas trop chargée. Ton chien en longe au harnais. Installe-toi comme toute la semaine, et récompense le calme. Tu connais tous les outils maintenant : la distance si c'est trop, le fait qu'il soit dépensé avant, ta propre énergie posée. Sers-t'en. Laisse-lui le temps d'observer ce nouveau monde, puis de comprendre qu'ici aussi il peut se poser.$t$,
   $t$Recule d'un cran : un banc à l'écart plutôt qu'en pleine terrasse.
Reviens à une heure plus creuse.
S'il est trop sollicité, ce n'est pas un échec : ce lieu sera un objectif pour les semaines à venir.$t$,
   $t$Ne choisis pas l'endroit le plus dur d'emblée. Un lieu vivant mais gérable, à une heure calme. Tu veux finir la semaine sur une réussite.$t$,
   $t$Montre le chemin parcouru : ton chien posé dans la vraie vie.$t$,
   $t$Défi Journée Off réussi : mon chien sait se poser partout, même dans la vraie vie ! #DéfiJournéeOff$t$)
) AS j(jour, titre, objectif, exercice, astuces, conseil, partage_invite, partage_texte)
WHERE d.slug = 'defi-journee-off'
ON CONFLICT (defi_id, jour) DO NOTHING;

-- ── 7. Cron : rappel J-7 avant la fin du mois offert ─────────────────────────
-- Pré-requis (déjà en place pour cash-payment-reminder) : extensions pg_cron +
-- pg_net, et le secret défini côté DB :
--   ALTER DATABASE postgres SET app.settings.cron_secret = '<valeur du secret edge CRON_SECRET>';
-- Tous les jours à 07:00 UTC (09:00 heure suisse en été) : trial-reminder
-- interroge Stripe (abonnements en essai finissant dans ~7 jours) et envoie
-- l'email Brevo « ton premium devient payant le … ».
DO $$
BEGIN
  PERFORM cron.unschedule('premium-trial-reminder-daily');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'premium-trial-reminder-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/trial-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Cron-Secret', current_setting('app.settings.cron_secret', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
