-- Lot 2 : les 37 fiches du site à CHF 5, et le journal des envois premium.
-- Fiches créées NON publiées : elles deviennent achetables le 17.11.2026, avec
-- la mise en ligne des fonctions de paiement (règle de calendrier du brief).
-- PDF : bucket privé fiches-pratiques, déposés par Tiffany le 14.11.2026.
-- Sous-titres : copiés mot pour mot des PDF.

create table if not exists public.fiches_envois (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.digital_products(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists fiches_envois_user_date on public.fiches_envois (user_id, created_at);
alter table public.fiches_envois enable row level security;
-- Aucune règle : seule la fonction envoyer-fiche (service_role) y écrit et y lit.

insert into public.digital_products (slug, title, subtitle, price_chf, file_path, category, tags, display_order, is_published) values
('fiche-comment-ton-chien-apprend', 'Comment ton chien apprend', 'Deux mécanismes, tout le temps, même quand tu ne fais pas exprès.', 5, 'fiches/comment-ton-chien-apprend.pdf', 'fiche', array['education'], 1, false),
('fiche-le-renforcement-positif', 'Le renforcement positif', 'Payer ce qu''on veut voir, au bon moment, avec la bonne monnaie.', 5, 'fiches/le-renforcement-positif.pdf', 'fiche', array['education'], 2, false),
('fiche-le-mot-marqueur', 'Le mot marqueur', 'Un « oui » qui veut dire « c''est exactement ça, et la récompense arrive ».', 5, 'fiches/le-mot-marqueur.pdf', 'fiche', array['education'], 3, false),
('fiche-la-regle-des-3d', 'La règle des 3D', 'Distance, Durée, Distraction. On n''en augmente qu''une à la fois.', 5, 'fiches/la-regle-des-3d.pdf', 'fiche', array['education'], 4, false),
('fiche-les-zones-de-travail', 'Les zones de travail', 'Ton chien n''apprend pas pareil partout. Choisis l''endroit avant de choisir l''exercice.', 5, 'fiches/les-zones-de-travail.pdf', 'fiche', array['education'], 5, false),
('fiche-les-erreurs-courantes-en-education', 'Les erreurs courantes en éducation', 'Six pièges dans lesquels on tombe tous, et comment en sortir.', 5, 'fiches/les-erreurs-courantes-en-education.pdf', 'fiche', array['education'], 6, false),
('fiche-les-10-reflexes-du-quotidien', 'Les 10 réflexes du quotidien', 'Des petites habitudes qui font un chien plus serein, sans y passer tes journées.', 5, 'fiches/les-10-reflexes-du-quotidien.pdf', 'fiche', array['quotidien'], 7, false),
('fiche-le-rappel', 'Le rappel', 'Ton chien ne désobéit pas, il choisit. Ton travail, c''est de rendre le choix facile.', 5, 'fiches/le-rappel.pdf', 'fiche', array['education'], 8, false),
('fiche-la-marche-en-laisse', 'La marche en laisse', 'La laisse molle n''est pas une position, c''est une conversation.', 5, 'fiches/la-marche-en-laisse.pdf', 'fiche', array['education'], 9, false),
('fiche-l-exercice-du-regard', 'L''exercice du regard', 'Un chien qui te regarde ne peut pas fixer autre chose. C''est ton refuge quand ça chauffe.', 5, 'fiches/l-exercice-du-regard.pdf', 'fiche', array['education'], 10, false),
('fiche-la-touche-prolongee-de-la-main', 'La touche prolongée de la main', 'Sa truffe dans ta paume pendant que le problème passe. Un refuge qui tient dans la main.', 5, 'fiches/la-touche-prolongee-de-la-main.pdf', 'fiche', array['education'], 11, false),
('fiche-les-autocontroles-le-principe', 'Les autocontrôles - le principe', 'Le chien qui se gère tout seul, sans qu''on lui demande rien.', 5, 'fiches/les-autocontroles-le-principe.pdf', 'fiche', array['education'], 12, false),
('fiche-l-autocontrole-la-main', 'L''autocontrôle - la main', 'Apprendre à ton chien à se gérer tout seul face à une friandise. Sans un mot.', 5, 'fiches/l-autocontrole-la-main.pdf', 'fiche', array['education'], 13, false),
('fiche-l-autocontrole-la-gamelle', 'L''autocontrôle - la gamelle', 'Trente secondes à chaque repas. Le rituel le plus rentable de la semaine.', 5, 'fiches/l-autocontrole-la-gamelle.pdf', 'fiche', array['education'], 14, false),
('fiche-l-autocontrole-la-porte', 'L''autocontrôle - la porte', 'La porte s''ouvre pour un chien posé. Personne n''a besoin de parler.', 5, 'fiches/l-autocontrole-la-porte.pdf', 'fiche', array['education'], 15, false),
('fiche-la-gestion-de-la-frustration', 'La gestion de la frustration', 'Apprendre à ton chien que « pas maintenant » n''est pas la fin du monde.', 5, 'fiches/la-gestion-de-la-frustration.pdf', 'fiche', array['comportement'], 16, false),
('fiche-la-sonnette', 'La sonnette', 'Quand ça sonne, ton chien file sur son tapis au lieu de foncer à la porte en aboyant.', 5, 'fiches/la-sonnette.pdf', 'fiche', array['quotidien'], 17, false),
('fiche-la-socialisation-du-chiot', 'La socialisation du chiot', 'Une fenêtre qui se referme vers 3 mois. Ce qui compte, c''est la qualité, pas la quantité.', 5, 'fiches/la-socialisation-du-chiot.pdf', 'fiche', array['chiot'], 18, false),
('fiche-la-proprete-du-chiot', 'La propreté du chiot', 'Sortir souvent, fêter chaque réussite, ne jamais gronder un accident.', 5, 'fiches/la-proprete-du-chiot.pdf', 'fiche', array['chiot'], 19, false),
('fiche-rester-seul-sereinement', 'Rester seul sereinement', 'Quand ton chien détruit, hurle ou fait ses besoins seulement en ton absence.', 5, 'fiches/rester-seul-sereinement.pdf', 'fiche', array['comportement'], 20, false),
('fiche-le-jeu-un-outil-educatif', 'Le jeu, un outil éducatif', 'Jouer avec ton chien n''est pas du temps perdu. C''est même l''un des meilleurs moyens de vous rapprocher.', 5, 'fiches/le-jeu-un-outil-educatif.pdf', 'fiche', array['quotidien'], 21, false),
('fiche-le-jeu-des-3-gobelets', 'Le jeu des 3 gobelets', 'Un jeu de mémoire qui fatigue la tête mieux qu''une heure de balle.', 5, 'fiches/le-jeu-des-3-gobelets.pdf', 'fiche', array['quotidien'], 22, false),
('fiche-les-signaux-d-apaisement', 'Les signaux d''apaisement', 'Les petits gestes par lesquels ton chien dit « calmons-nous » ou « je ne suis pas à l''aise ».', 5, 'fiches/les-signaux-d-apaisement.pdf', 'fiche', array['comportement'], 23, false),
('fiche-les-plantes-toxiques', 'Les plantes toxiques', 'Les plus dangereuses de nos jardins, haies et forêts. Liste non exhaustive.', 5, 'fiches/les-plantes-toxiques.pdf', 'fiche', array['sante'], 24, false),
('fiche-les-dangers-a-la-maison', 'Les dangers à la maison', 'Ce qui traîne dans la cuisine, la pharmacie ou le garage, et qui peut l''envoyer chez le vétérinaire.', 5, 'fiches/les-dangers-a-la-maison.pdf', 'fiche', array['sante'], 25, false),
('fiche-la-chaleur-et-le-coup-de-chaleur', 'La chaleur et le coup de chaleur', 'Le danger n''est pas seulement la voiture au soleil. C''est surtout l''effort par temps doux.', 5, 'fiches/la-chaleur-et-le-coup-de-chaleur.pdf', 'fiche', array['sante'], 26, false),
('fiche-les-transports-publics-en-suisse', 'Les transports publics en Suisse', 'Train, bus, tram, bateau : les règles, et comment préparer ton chien.', 5, 'fiches/les-transports-publics-en-suisse.pdf', 'fiche', array['pratique'], 27, false),
('fiche-vers-qui-se-diriger', 'Vers qui se diriger', 'Éducateur, spécialiste du comportement ou vétérinaire : qui fait quoi.', 5, 'fiches/vers-qui-se-diriger.pdf', 'fiche', array['pratique'], 28, false),
('fiche-le-tapis-de-relaxation', 'Le tapis de relaxation', 'Un petit bout de tissu qui veut dire « ici, on souffle ». À emporter au restaurant, chez le véto, en visite.', 5, 'fiches/le-tapis-de-relaxation.pdf', 'fiche', array['comportement'], 29, false),
('fiche-l-habituation-a-la-museliere', 'L''habituation à la muselière', 'Une muselière que ton chien enfile tout seul, la queue en l''air. Avant d''en avoir besoin.', 5, 'fiches/l-habituation-a-la-museliere.pdf', 'fiche', array['education'], 30, false),
('fiche-la-reactivite-en-laisse', 'La réactivité en laisse', 'Ton chien aboie et tire sur les autres chiens. Ce n''est pas un problème d''obéissance.', 5, 'fiches/la-reactivite-en-laisse.pdf', 'fiche', array['comportement'], 31, false),
('fiche-l-en-face-d-urgence', 'L''en face d''urgence', 'Ton chien face à toi, son regard dans le tien, pendant que le déclencheur passe derrière lui.', 5, 'fiches/l-en-face-d-urgence.pdf', 'fiche', array['comportement'], 32, false),
('fiche-on-y-va-le-demi-tour', 'On y va - le demi-tour', 'Le déclencheur arrive, tu ne peux pas t''écarter. Alors on fait demi-tour, ensemble et joyeusement.', 5, 'fiches/on-y-va-le-demi-tour.pdf', 'fiche', array['comportement'], 33, false),
('fiche-vite-vite', 'Vite, vite', 'La main collée à la truffe, on passe vite. Quand le déclencheur ne bouge pas et qu''il faut continuer.', 5, 'fiches/vite-vite.pdf', 'fiche', array['comportement'], 34, false),
('fiche-respire', 'Respire', 'Payer la grande inspiration. Un petit exercice pour passer de l''excitation au calme.', 5, 'fiches/respire.pdf', 'fiche', array['comportement'], 35, false),
('fiche-entre-les-jambes', 'Entre les jambes', 'Ton chien se glisse entre tes jambes, à l''abri, pendant que le déclencheur passe.', 5, 'fiches/entre-les-jambes.pdf', 'fiche', array['comportement'], 36, false),
('fiche-derriere', 'Derrière', 'Ton chien passe derrière toi, à l''abri de ton corps, pendant que le déclencheur passe.', 5, 'fiches/derriere.pdf', 'fiche', array['comportement'], 37, false)
on conflict (slug) do nothing;
