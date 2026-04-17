-- Ajouter la colonne content à la table resources (pour les fiches lisibles dans l'app)
ALTER TABLE resources ADD COLUMN IF NOT EXISTS content TEXT;

-- ══════════════════════════════════════════════════════════════════
-- 10 FICHES PREMIUM — Éducation canine bienveillante
-- ══════════════════════════════════════════════════════════════════

INSERT INTO resources (title, description, type, category, content) VALUES

-- 1. Le rappel
('Le rappel : exercices pratiques',
 'Apprends à ton chien à revenir vers toi avec enthousiasme, en toute situation.',
 'article', 'education',
 'LE RAPPEL : EXERCICES PRATIQUES

Le rappel est probablement l''ordre le plus important en éducation canine. Un bon rappel, c''est la liberté pour ton chien et la tranquillité d''esprit pour toi.

POURQUOI LE RAPPEL EST SI DIFFICILE ?
Quand tu appelles ton chien, tu lui demandes d''abandonner ce qu''il fait (renifler, jouer, explorer) pour venir vers toi. C''est un gros effort ! Le rappel doit donc être plus intéressant que tout le reste.

EXERCICE 1 — LE RAPPEL « JACKPOT »
1. Choisis un mot spécial UNIQUEMENT pour le rappel (ex: « Viens ! » ou un sifflet)
2. À la maison, prononce ce mot et donne immédiatement une poignée de friandises (pas une seule, 5 à 10 !)
3. Répète 5 fois par jour pendant une semaine
4. Ton chien va associer ce mot = festin garanti

EXERCICE 2 — LE PING-PONG (à deux personnes)
1. Placez-vous à 5 mètres l''un de l''autre dans un espace clos
2. Personne A appelle le chien → récompense généreuse
3. Personne B appelle le chien → récompense généreuse
4. Augmentez progressivement la distance

EXERCICE 3 — LE RAPPEL EN BALADE
1. Commence en longe (5-10 m) dans un endroit calme
2. Attends que ton chien s''éloigne naturellement
3. Appelle-le avec ton mot spécial
4. S''il revient → jackpot + il repart jouer (pas de laisse tout de suite !)
5. S''il ne revient pas → raccourcis doucement la longe, JAMAIS de punition

LES ERREURS À ÉVITER
• Ne rappelle JAMAIS ton chien pour quelque chose de désagréable (fin de balade, bain, vétérinaire)
• N''utilise pas son prénom comme rappel (il l''entend 100 fois par jour)
• Ne cours pas après lui (ça devient un jeu de poursuite)
• Ne le gronde jamais quand il revient, même après 10 minutes

ASTUCE PRO
Fais régulièrement des « rappels gratuits » : tu l''appelles, tu le récompenses, et tu le laisses repartir. Comme ça, revenir vers toi ne signifie pas toujours « fin de la liberté ».'),

-- 2. La marche en laisse
('Marche en laisse détendue',
 'Fini les balades où ton chien tire ! Méthode progressive et bienveillante.',
 'article', 'education',
 'MARCHE EN LAISSE DÉTENDUE

Tirer en laisse est LE problème numéro 1 en balade. Bonne nouvelle : avec de la patience et la bonne méthode, ça se corrige !

POURQUOI TON CHIEN TIRE ?
Ton chien va plus vite que toi, c''est normal. Il veut explorer, renifler, avancer. Quand il tire et que tu suis, il apprend que tirer = avancer. On va inverser cette logique.

MATÉRIEL RECOMMANDÉ
• Harnais en Y ou en H (pas de collier pour l''apprentissage)
• Laisse de 2-3 mètres (pas enrouleur, pas trop courte)
• Des friandises de haute valeur

EXERCICE 1 — L''ARBRE
1. Quand ton chien tire, tu t''arrêtes (comme un arbre)
2. Tu attends qu''il revienne vers toi ou que la laisse se détende
3. Dès que la laisse est lâche → tu repars + friandise
4. S''il tire à nouveau → tu t''arrêtes à nouveau

EXERCICE 2 — LE DEMI-TOUR
1. Quand ton chien tire, fais demi-tour sans rien dire
2. Marche dans l''autre sens
3. Ton chien va te suivre (il n''a pas le choix, vous êtes reliés)
4. Dès qu''il est à ta hauteur → friandise + tu repars dans le bon sens

EXERCICE 3 — LA ZONE MAGIQUE
1. Récompense systématiquement quand ton chien marche à côté de toi
2. Au début, une friandise tous les 3-4 pas
3. Puis tous les 10 pas, puis 20, etc.
4. La zone « à côté de toi » devient l''endroit le plus rentable

CONSEILS IMPORTANTS
• Sois patient — il faut 3-6 semaines pour voir un vrai changement
• Sois constant — si tu tires une fois et pas l''autre, ton chien ne comprend pas
• Prévois des « balades libres » avec longe où il peut renifler sans contrainte
• Les premières séances d''entraînement durent 5-10 min, pas plus

UNE BALADE = DEUX TEMPS
1. Temps éducatif (10-15 min) : marche structurée avec récompenses
2. Temps libre : longe ou espace clos, ton chien fait ce qu''il veut

Ton chien a besoin de renifler ! Une balade 100% « au pied » n''est pas épanouissante. L''objectif est qu''il ne TIRE pas, pas qu''il marche au pas militaire.'),

-- 3. Les signaux d'apaisement
('Les signaux d''apaisement',
 'Apprends à lire le langage corporel de ton chien pour mieux le comprendre.',
 'article', 'comportement',
 'LES SIGNAUX D''APAISEMENT

Les chiens communiquent principalement par le corps. Comprendre leurs signaux, c''est comme apprendre leur langue. Ça change tout dans la relation.

QU''EST-CE QU''UN SIGNAL D''APAISEMENT ?
Ce sont des comportements que les chiens utilisent pour calmer une situation, montrer qu''ils sont pacifiques, ou exprimer un malaise. Ils s''en servent entre eux ET avec nous.

LES SIGNAUX LES PLUS COURANTS

Détourner la tête / le regard
→ « Je ne suis pas une menace » ou « Cette situation me met mal à l''aise »
→ Quand tu le fixes ou qu''un inconnu s''approche trop vite

Se lécher la truffe (petit coup de langue rapide)
→ Stress léger, inconfort
→ Très fréquent chez le vétérinaire ou quand on le gronde

Bâiller (hors fatigue)
→ Tension, stress, demande de calme
→ Si ton chien bâille souvent en cours, il est peut-être surstimulé

Se secouer (comme s''il était mouillé, mais il est sec)
→ Il « évacue » le stress après une situation tendue
→ Après une rencontre avec un autre chien, après un exercice difficile

Se gratter (alors qu''il ne se gratte pas d''habitude)
→ Déplacement : il ne sait pas quoi faire, il est mal à l''aise

Marcher lentement / se figer
→ « J''arrive doucement, je ne suis pas menaçant »
→ Un chien qui se fige face à un autre chien exprime un fort malaise

Faire un arc de cercle
→ Approche polie chez le chien (l''approche frontale est impolie)
→ Si ton chien fait un détour pour croiser un autre chien, c''est normal et sain

COMMENT UTILISER CES CONNAISSANCES ?
• Si ton chien montre des signaux d''apaisement, ne le force pas à continuer
• En balade : respecte ses détours, ses arrêts, ses reniflements
• Avec les enfants : apprends-leur à reconnaître un chien qui « dit non »
• Chez le véto : préviens le stress en identifiant les premiers signaux

ATTENTION
Un chien qui montre beaucoup de signaux d''apaisement au quotidien est peut-être chroniquement stressé. Parles-en à ton éducatrice.'),

-- 4. La socialisation du chiot
('Socialisation du chiot : le guide complet',
 'La période critique de socialisation et comment en profiter au maximum.',
 'article', 'education',
 'SOCIALISATION DU CHIOT : LE GUIDE COMPLET

La socialisation est LA base de tout. Un chiot bien socialisé sera un adulte équilibré et confiant. C''est un investissement qui dure toute sa vie.

LA PÉRIODE CRITIQUE : 3 À 16 SEMAINES
Pendant cette fenêtre, le cerveau du chiot est une éponge. Tout ce qu''il vit de positif sera « normal » pour lui à l''âge adulte. Après 16 semaines, cette fenêtre se referme progressivement.

CE QU''IL FAUT LUI FAIRE DÉCOUVRIR

Humains variés :
• Hommes, femmes, enfants, personnes âgées
• Personnes avec chapeau, lunettes, barbe, fauteuil roulant
• Personnes en uniforme (facteur, ouvriers)

Environnements :
• Ville (bruits, foule, trottoirs)
• Campagne (animaux de ferme, tracteurs)
• Surfaces variées (grilles, escaliers, herbe mouillée, carrelage)
• Voiture, train, bus

Sons :
• Tonnerre, feux d''artifice (en audio d''abord, volume bas)
• Aspirateur, sèche-cheveux
• Musique, cris d''enfants

Autres chiens :
• Chiens adultes calmes et bien socialisés
• Chiots du même âge (cours chiots)
• Chiens de tailles et races différentes

LA RÈGLE D''OR : POSITIF, TOUJOURS POSITIF
Chaque nouvelle expérience doit être associée à quelque chose d''agréable (friandise, jeu, câlin). Si le chiot a peur, on ne force JAMAIS. On recule, on laisse observer de loin, et on récompense le calme.

ERREURS FRÉQUENTES
• Attendre que toutes les vaccinations soient faites pour sortir (tu rates la période critique !)
• Forcer le chiot à « affronter » sa peur (ça aggrave tout)
• Le porter tout le temps (il doit marcher et explorer)
• Trop de stimulations d''un coup (2-3 nouvelles expériences par jour suffisent)

ET APRÈS 16 SEMAINES ?
La socialisation continue toute la vie, mais c''est plus lent. Continue d''exposer ton chien à des situations variées, toujours en positif. Un adolescent canin (6-18 mois) peut traverser des « phases de peur » — c''est normal, sois patient.'),

-- 5. Gérer la réactivité en laisse
('Gérer la réactivité en laisse',
 'Ton chien aboie ou tire quand il croise d''autres chiens ? Comprendre et agir.',
 'article', 'comportement',
 'GÉRER LA RÉACTIVITÉ EN LAISSE

Ton chien se transforme en furie quand il croise un autre chien ? Il aboie, tire, fait des bonds ? Tu n''es pas seul(e), c''est l''un des problèmes les plus courants.

QU''EST-CE QUE LA RÉACTIVITÉ ?
Un chien réactif a une réaction disproportionnée face à un stimulus (autre chien, vélo, jogger...). Ce n''est PAS de l''agressivité dans la plupart des cas. C''est souvent de la frustration ou de la peur.

FRUSTRATION : « Je veux aller voir mais je suis bloqué par la laisse ! »
→ Souvent des chiens très sociables qui n''ont pas appris à gérer la frustration
→ Ils tirent, sautent, gémissent, aboient

PEUR : « Ce truc me fait peur, je dois le faire partir ! »
→ Le chien se met en posture défensive (corps tendu, poil hérissé)
→ Il aboie pour mettre de la distance

LA MÉTHODE : DISTANCE + RÉCOMPENSE

Étape 1 — Trouve la « distance de confort »
C''est la distance à laquelle ton chien voit l''autre chien SANS réagir. Ça peut être 30 mètres au début, c''est normal.

Étape 2 — Récompense le calme
À cette distance, dès que ton chien regarde l''autre chien sans réagir → friandise. On appelle ça le « Look at That » (LAT).

Étape 3 — Réduis progressivement la distance
Semaine après semaine, tu te rapproches de quelques mètres. Toujours sous le seuil de réaction.

Étape 4 — Le « U-turn »
Quand un chien arrive en face et que tu ne peux pas garder la distance → fais demi-tour calmement. Ce n''est pas fuir, c''est gérer intelligemment.

CE QUI NE MARCHE PAS
• Crier sur ton chien (ça augmente le stress)
• Tirer sur la laisse (ça crée une association négative : laisse tendue = danger)
• Forcer la rencontre (« il faut qu''il s''habitue ») — NON, ça empire tout
• Punir la réaction (le chien apprend à ne plus prévenir, mais la peur reste)

CHRONOLOGIE RÉALISTE
• Semaine 1-2 : tu observes et tu trouves sa distance de confort
• Semaine 3-6 : travail régulier en LAT, progrès visibles
• Mois 2-3 : la distance de confort diminue nettement
• Mois 4-6 : ton chien peut croiser la plupart des chiens calmement

C''est un travail de patience. Si la réactivité est forte, n''hésite pas à prendre un cours privé pour être accompagné(e).'),

-- 6. Les bases du renforcement positif
('Les bases du renforcement positif',
 'Comprendre POURQUOI et COMMENT récompenser ton chien efficacement.',
 'article', 'education',
 'LES BASES DU RENFORCEMENT POSITIF

Chez CaniPlus, on travaille exclusivement en renforcement positif. Ce n''est pas juste « être gentil avec son chien » — c''est une méthode basée sur la science du comportement.

LE PRINCIPE
Un comportement qui est suivi d''une conséquence agréable a plus de chances de se reproduire. C''est aussi simple que ça.

Ton chien s''assoit → il reçoit une friandise → il s''assiéra plus souvent.

LES 4 PILIERS

1. LE TIMING
La récompense doit arriver dans les 1-2 secondes après le bon comportement. Sinon, ton chien ne fait pas le lien.
→ Astuce : utilise un marqueur (« Oui ! » ou un clicker) pour « photographier » le bon moment

2. LA VALEUR DE LA RÉCOMPENSE
Toutes les friandises ne se valent pas. Pour un exercice facile, une croquette suffit. Pour un exercice difficile (rappel, ignorer un chat), sors le jambon !
→ Hiérarchie : croquette < biscuit < fromage < viande séchée < jackpot

3. LA FRÉQUENCE
Au début d''un apprentissage : récompense à CHAQUE fois (100%)
Une fois acquis : récompense aléatoire (parfois oui, parfois non)
→ L''aléatoire maintient la motivation (comme une machine à sous !)

4. L''ENVIRONNEMENT
Commence toujours dans un endroit calme (maison, jardin). Puis augmente progressivement la difficulté (jardin → rue calme → parc → centre-ville).

ET LES COMPORTEMENTS INDÉSIRABLES ?
On ne punit pas, mais on ne laisse pas tout faire non plus :
• Ignorer le comportement (s''il cherche l''attention)
• Rediriger vers un comportement souhaité
• Retirer la récompense (tu sautes quand je rentre ? je me retourne et j''attends)
• Gérer l''environnement (poubelle inaccessible = pas de vol)

MYTHES À DÉCONSTRUIRE
• « Mon chien sait qu''il a fait une bêtise, il a l''air coupable » → Non, c''est de la soumission face à ton langage corporel menaçant
• « Il faut être le chef de meute » → La théorie de la dominance est obsolète depuis 20 ans
• « Les friandises c''est du chantage » → Non, c''est un salaire. Tu travailles bien pour de l''argent, non ?

Le renforcement positif, c''est respecter son chien tout en obtenant des résultats. C''est prouvé scientifiquement et c''est la méthode recommandée par les vétérinaires comportementalistes.'),

-- 7. L'anxiété de séparation
('L''anxiété de séparation',
 'Ton chien panique quand tu pars ? Comprendre et aider progressivement.',
 'article', 'comportement',
 'L''ANXIÉTÉ DE SÉPARATION

Ton chien détruit, aboie ou fait ses besoins quand tu t''absentes ? Ce n''est pas de la vengeance — c''est de la détresse. L''anxiété de séparation est un vrai trouble émotionnel.

LES SIGNES
• Aboiements / hurlements prolongés dès que tu pars
• Destruction (portes, cadres, coussins)
• Malpropreté (même si le chien est propre d''habitude)
• Salivation excessive, halètement
• Le chien te suit partout dans la maison (« chien velcro »)

ATTENTION : filme ton chien quand tu pars pour voir ce qu''il fait réellement. Parfois on croit à de l''anxiété alors que c''est de l''ennui (et vice versa).

LES CAUSES POSSIBLES
• Manque de socialisation à la solitude étant chiot
• Changement brutal de routine (télétravail → retour au bureau)
• Déménagement, séparation, arrivée d''un bébé
• Expérience traumatisante en ton absence

LA MÉTHODE : DÉSENSIBILISATION PROGRESSIVE

Étape 1 — Dédramatise les départs
• Ne fais pas de grandes cérémonies d''au revoir (pas de câlins de 5 min)
• Prends tes clés, mets tes chaussures plusieurs fois par jour SANS partir
• Le but : ces « signaux de départ » ne doivent plus déclencher de stress

Étape 2 — Micro-absences
1. Sors de la pièce 5 secondes → reviens calmement
2. Si ton chien reste calme → augmente à 10 sec, 30 sec, 1 min...
3. Si ton chien panique → tu es allé trop vite, reviens à la durée précédente
4. Progresse de quelques secondes/minutes par séance

Étape 3 — Absences réelles
1. Sors de la maison 1 minute → reviens
2. Augmente très progressivement
3. Varie les durées (pas toujours croissant)
4. Laisse un jouet d''occupation (Kong fourré, tapis de léchage)

CE QUI NE MARCHE PAS
• Prendre un deuxième chien (si le problème est l''attachement à TOI, un autre chien ne change rien)
• Punir les dégâts au retour (ton chien ne comprend pas, ça aggrave l''anxiété)
• L''ignorer en rentrant pendant 10 min (un « salut » calme suffit)

QUAND CONSULTER ?
Si ton chien se blesse, hurle pendant des heures ou si le problème ne s''améliore pas après 4-6 semaines de travail régulier, consulte un vétérinaire comportementaliste. Un traitement médicamenteux temporaire peut aider à débloquer la situation.'),

-- 8. Le jeu comme outil éducatif
('Le jeu : ton meilleur outil éducatif',
 'Comment utiliser le jeu pour renforcer ta relation et éduquer efficacement.',
 'article', 'education',
 'LE JEU : TON MEILLEUR OUTIL ÉDUCATIF

Le jeu n''est pas juste un divertissement — c''est un outil puissant d''éducation et de renforcement du lien. Un chien qui joue avec toi est un chien qui t''écoute.

POURQUOI JOUER ?
• Ça renforce la relation (tu deviens la personne la plus fun du monde)
• Ça brûle l''énergie mentale ET physique
• Ça peut servir de récompense (certains chiens préfèrent le jeu aux friandises)
• Ça apprend le contrôle des émotions (excitation → calme → excitation)

LES JEUX ÉDUCATIFS

1. LA RECHERCHE DE FRIANDISES
Fais asseoir ton chien, cache des friandises dans la pièce, et dis « Cherche ! »
→ Travaille le flair, la patience, la confiance en soi
→ Excellent pour les jours de pluie

2. LE « DONNE » ET « PRENDS »
Joue à la corde avec ton chien. Quand tu dis « Donne », arrête de tirer et présente une friandise. Il lâche → « Prends ! » et on reprend.
→ Apprend le contrôle de la mâchoire et le lâcher sur commande

3. LE CACHE-CACHE
Une personne tient le chien, l''autre se cache. Appelle-le → il te cherche → jackpot quand il te trouve !
→ Renforce le rappel de façon ludique

4. LE PARCOURS MAISON
Utilise des chaises, couvertures, coussins pour créer un parcours. Guide ton chien dessus, dessous, autour → friandise à chaque passage.
→ Travaille la confiance et la proprioception

5. LES JOUETS D''OCCUPATION
Kong fourré (fromage frais + croquettes, congelé), tapis de léchage, distributeur de croquettes
→ Parfait pour l''autonomie et le calme

RÈGLES DU JEU
• C''est TOI qui commences et termines le jeu
• Si ton chien s''excite trop (mordille, saute), le jeu s''arrête 10 secondes
• Alterne phases de jeu et micro-exercices (assis, couché, touche)
• Adapte l''intensité à ton chien (un chiot ≠ un adulte athlétique)

COMBIEN DE TEMPS ?
• 2-3 sessions de 10-15 minutes par jour
• 15 minutes de jeu mental fatiguent autant qu''1 heure de marche
• Termine toujours AVANT que ton chien soit épuisé ou qu''il se lasse'),

-- 9. La propreté du chiot
('La propreté du chiot',
 'Méthode complète pour rendre ton chiot propre sans stress ni punition.',
 'article', 'education',
 'LA PROPRETÉ DU CHIOT

La propreté est souvent LA préoccupation n°1 des nouveaux propriétaires. Avec la bonne méthode, la plupart des chiots sont propres entre 4 et 6 mois.

COMPRENDRE LE CHIOT
• Un chiot de 8 semaines ne peut se retenir que 2-3 heures max
• Il a besoin de faire ses besoins : au réveil, après manger, après jouer, après une excitation
• Il ne fait PAS exprès — son sphincter n''est pas encore mature

LA MÉTHODE EN 4 ÉTAPES

Étape 1 — Sortir BEAUCOUP
Sors ton chiot toutes les 1h30-2h (plus souvent au début). À chaque sortie :
→ Va toujours au même endroit
→ Attends patiemment (max 5 min)
→ Dès qu''il fait → récompense IMMÉDIATE (friandise + « Bravo ! »)
→ S''il ne fait pas → rentre et ressors 15 min plus tard

Étape 2 — Anticiper les moments clés
Sors-le systématiquement :
• Au réveil (matin ET siestes)
• 15-20 min après chaque repas
• Après une séance de jeu
• Avant le coucher

Étape 3 — Surveiller à l''intérieur
Quand ton chiot est à l''intérieur :
• Garde-le dans la même pièce que toi
• Observe les signes : il tourne en rond, renifle le sol, s''éloigne → sors-le VITE !
• Si tu ne peux pas surveiller, réduis son espace (pas dans toute la maison)

Étape 4 — Gérer les accidents
Il FERA des accidents, c''est normal. Quand ça arrive :
• Nettoie sans rien dire (pas de punition !)
• Utilise un nettoyant enzymatique (pas de javel, l''odeur d''ammoniaque attire)
• Si tu le surprends en train de faire → interromps calmement et sors-le dehors

CE QUI NE MARCHE PAS
• Mettre le nez dedans (cruel et inutile — il ne comprend pas le lien)
• Punir après coup (même 30 secondes après, c''est trop tard)
• Punir tout court (ça apprend au chiot à se cacher pour faire, pas à se retenir)
• S''énerver (le chiot stresse et ça empire le problème)

LES TAPIS D''ÉDUCATION : OUI OU NON ?
Ils peuvent être utiles au tout début (8-10 semaines) ou en appartement sans accès rapide à l''extérieur. Mais l''objectif reste de les supprimer progressivement pour que le chiot apprenne que « dehors = toilettes ».

PATIENCE !
Certains chiots sont propres à 4 mois, d''autres à 6-7 mois. Les petites races mettent souvent plus longtemps. Chaque accident est une occasion d''apprentissage, pas un échec.'),

-- 10. Les bons réflexes au quotidien
('10 réflexes pour un chien bien dans ses pattes',
 'Les habitudes simples qui font toute la différence au quotidien.',
 'article', 'quotidien',
 'DIX RÉFLEXES POUR UN CHIEN BIEN DANS SES PATTES

Pas besoin d''exercices compliqués : ces 10 habitudes simples, appliquées au quotidien, suffisent à avoir un chien équilibré et heureux.

1. LAISSE-LE RENIFLER
Le nez du chien est son outil principal pour comprendre le monde. En balade, laisse-lui au moins 5-10 minutes de « reniflage libre ». C''est aussi important que la marche elle-même.

2. RESPECTE SON SOMMEIL
Un chien adulte dort 12-14h par jour, un chiot jusqu''à 18h. Ne le réveille pas, ne le dérange pas quand il dort. Un chien qui ne dort pas assez est irritable et excité.

3. DIS « OUI » PLUS QUE « NON »
Au lieu de dire « non ! » quand il fait une bêtise, redirige-le vers ce que tu veux qu''il fasse. « Non, pas le canapé » → « Viens sur ton tapis, bravo ! »

4. UNE ROUTINE STABLE
Les chiens adorent la routine. Repas, balades, jeu et repos aux mêmes heures. Ça les rassure et réduit le stress.

5. DES RENCONTRES DE QUALITÉ
Mieux vaut 2 rencontres calmes avec des chiens compatibles que 10 rencontres chaotiques au parc. La qualité prime sur la quantité.

6. APPRENDS-LUI À NE RIEN FAIRE
On pense souvent qu''il faut « occuper » son chien en permanence. En réalité, savoir se poser calmement est une compétence. Récompense ton chien quand il est couché tranquille à tes pieds.

7. ADAPTE L''EXERCICE À TON CHIEN
Un Border Collie n''a pas les mêmes besoins qu''un Bouledogue. Observe ton chien : s''il est calme et satisfait après la balade, c''est suffisant. S''il est encore surexcité, il a besoin de plus (mental, pas que physique).

8. TOILETTE ET MANIPULATIONS RÉGULIÈRES
Habitue ton chien à être touché partout : pattes, oreilles, gueule, ventre. 2 minutes par jour, avec des friandises. Ça facilite énormément les visites chez le vétérinaire.

9. NE PROJETTE PAS TES ÉMOTIONS
Ton chien n''est pas « têtu » ou « dominant ». S''il ne fait pas ce que tu demandes, c''est qu''il ne comprend pas, qu''il est stressé, ou que la récompense n''est pas suffisante. Cherche le pourquoi avant de t''énerver.

10. PROFITE !
Un chien, c''est 10-15 ans de bonheur. Prends le temps de l''observer, de jouer, de simplement être ensemble. La relation que tu construis aujourd''hui sera le fondement de tout le reste.');
