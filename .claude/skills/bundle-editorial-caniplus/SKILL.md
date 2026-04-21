---
name: bundle-editorial-caniplus
description: Génère un bundle éditorial CaniPlus complet à partir d'un thème. Produit 5 deliverables en un coup — 1 article blog SEO teaser (caniplus.ch/blog), 2 carrousels FB+IG (angles distincts, à publier à quelques jours d'intervalle), 1 fiche ressource premium pour l'app CaniPlus, 1 phrase courte pour la cloche de notification de l'app. Utiliser quand Tiffany dit "nouveau bundle", "nouvel article", "nouveau contenu", "nouveau thème", "fais-moi un bundle sur X", ou équivalent. S'exécute aussi automatiquement chaque lundi 9h via la tâche planifiée caniplus-bundle-editorial-mensuel.
---

# Bundle éditorial CaniPlus

## Contexte

Tiffany produit du contenu éducatif canin pour :
- **Blog public** (caniplus.ch/blog) — SEO, grand public, GRATUIT
- **Réseaux sociaux** (Facebook + Instagram) — 2 carrousels publiés en simultané FB+IG, à quelques jours d'intervalle dans la semaine
- **App CaniPlus** (PWA) — fiches ressources premium pour membres abonnés (10 CHF/mois)
- **App CaniPlus** — cloche de notification (phrase courte pour avertir les membres d'un nouveau contenu)

Cette skill industrialise la production éditoriale : un seul thème → cinq deliverables cohérents, chacun au format attendu par son canal de destination. **Aucune vidéo produite** (Tiffany a abandonné la vidéo le 21 avril 2026).

## Stratégie gratuit / premium — CRITIQUE

Le bundle est construit autour d'un **gap de valeur** entre gratuit et premium. Respecter ce gap est vital — sinon l'article blog cannibalise la ressource premium.

**Gratuit (article blog + carrousels) = LE POURQUOI**
- Diagnostic : pourquoi le chien se comporte ainsi
- Principe fondamental qui sous-tend la méthode
- Les étapes sont *nommées* mais pas détaillées (teaser)
- Les erreurs à éviter (valeur immédiate, utilisable même sans premium)
- Une règle d'or, une phrase choc, un concept clé
- CTA fort vers le premium pour le COMMENT opérationnel

**Premium (ressource app) = LE COMMENT**
- Durées, distances, chiffres précis
- Critères de passage d'une étape à la suivante
- Grille de progression détaillée
- Ordre exact des distractions / difficultés à introduire
- Checklist avant chaque séance
- Troubleshooting opérationnel
- Cas particuliers et variantes

**Test simple pour savoir si le gap est respecté :** quelqu'un qui lit l'article blog doit se dire "ok je comprends ce qu'il faut faire et pourquoi, mais j'ai besoin du protocole détaillé pour passer à l'action". Si après lecture de l'article il peut agir sans le premium, l'article en dit trop.

## Ton et approche commerciale — important

Le blog et les carrousels doivent donner envie du premium SANS être agressifs. Tiffany est une éducatrice bienveillante, pas une vendeuse.

**À éviter absolument :**
- CTA premium répétés dans le corps de l'article (un seul CTA clair à la fin suffit)
- Formulations du type "tu veux vraiment résoudre ton problème ?", "découvre le secret", "méthode exclusive"
- Phrases qui culpabilisent le lecteur ("sans ce protocole tu vas rester bloqué")
- Superlatifs marketing ("LA méthode ultime", "le protocole qui change tout")
- Frustrations artificielles, cliffhangers lourds
- Promesses de transformation rapide

**À faire :**
- Mentionner la ressource premium UNE FOIS, à la fin, en l'intégrant naturellement dans le fil du texte
- Décrire factuellement ce qu'il y a en plus (durées, distances, grille) sans survendre
- Respecter l'intelligence du lecteur : il décide seul s'il veut le premium ou non
- Maintenir le ton chaleureux et pédagogique sur tout l'article — la qualité du contenu gratuit fait le reste
- La leçon privée (60 CHF) est mentionnée comme une alternative de même valeur que le premium, pas comme un fallback

**Test du ton :** quelqu'un qui lit l'article doit se dire "cette éducatrice est bienveillante et compétente, j'ai appris des choses, et je vais aller voir le premium parce que ça a l'air utile" — pas "on m'a teasé, je me sens pris en otage".

## Entrée attendue de Tiffany

Un **thème** (ex : "rappel au parc", "anti-aboiement sonnette", "rencontre avec un autre chien", "voiture sécurité", "premier vétérinaire", "brossage quotidien").

Si le thème est flou, demander à Tiffany de préciser :
- Public cible : chiot, chien adulte, chien réactif ?
- Niveau : débutant, intermédiaire ?
- Angle : problème à résoudre, routine à installer, geste à apprendre ?

Si la skill tourne en mode automatique (scheduled task lundi 9h), exécuter sans demander — choisir un thème pertinent, saisonnier ou en complément des thèmes déjà produits (lire `contenu/README.md`).

## Sortie : 5 fichiers dans un dossier dédié

Tous les fichiers vont dans `contenu/{slug-thème}/` à la racine du repo CaniPlus — le slug utilise des tirets (ex : `rappel-fiable-distractions/`).

```
contenu/
  {slug-thème}/
    article-blog.md             # SEO teaser pour caniplus.ch/blog
    carrousel-fb-ig-1.md        # 1er carrousel — angle émotionnel / problématique
    carrousel-fb-ig-2.md        # 2e carrousel — angle méthode / astuce concrète
    ressource-premium-app.md    # Fiche premium format ÉTAPES (app)
    notification-cloche-app.md  # Phrase courte pour la cloche
```

---

## Deliverable 1 — `article-blog.md`

**Destination :** caniplus.ch/blog
**Audience :** grand public, arrivée via Google
**Longueur :** 700-900 mots (plus court qu'avant — on teasait, on ne donne plus le protocole)
**Ton :** chaleureux, pédagogique, basé sur la science et l'éducation positive — JAMAIS de cage, crate ou parc (hors sécurité ultime)
**Rôle stratégique :** faire comprendre le POURQUOI et donner envie d'accéder au COMMENT via le premium

### Structure imposée (format teaser)

```markdown
---
title: "{{Titre SEO — 50-60 caractères, contient le mot-clé principal}}"
slug: "{{slug-avec-tirets}}"
meta_description: "{{140-155 caractères — promesse claire + CTA implicite}}"
date: {{YYYY-MM-DD}}
author: "Tiffany Cotting"
category: "{{Éducation | Comportement | Santé | Vie quotidienne}}"
tags: [{{3-5 tags}}]
image_hero: "/blog/{{slug}}/hero.jpg"
---

# {{Titre principal, H1}}

{{Accroche émotionnelle — 2-3 phrases. Pose la scène comme si le lecteur nous parlait. Reconnaissance de sa douleur.}}

## Pourquoi ton chien {{comportement}} (la vraie raison)

{{Diagnostic comportemental : ce qui motive vraiment le chien. 200-250 mots. C'EST LA PARTIE LA PLUS LONGUE. On creuse le pourquoi, parce que c'est là que réside la valeur gratuite.}}

## Le principe pour changer ça

{{100-150 mots. Pose le principe fondamental qui sous-tend la méthode (ex : "reconstruire la valeur du rappel", "désensibiliser progressivement", "remplacer le comportement par un comportement incompatible"). Pas la méthode elle-même — le PRINCIPE qui l'explique.}}

## Les {{N}} étapes, en un coup d'œil

{{Liste numérotée SIMPLE. 1 phrase par étape. Surtout PAS de détails opérationnels (pas de durées, pas de distances, pas de critères chiffrés, pas de progression). C'est un TEASER.}}

1. **{{Nom de l'étape 1}}** — {{1 phrase qui résume ce qu'on fait}}
2. **{{Nom de l'étape 2}}** — {{1 phrase}}
3. **{{Nom de l'étape 3}}** — {{1 phrase}}
4. **{{Nom de l'étape 4}}** — {{1 phrase}}
5. **{{Nom de l'étape 5}}** — {{1 phrase}}

{{Phrase de transition vers le premium, du type : "Chaque étape a sa logique, ses critères de passage et ses pièges. Le protocole détaillé — avec les durées, les distances et la grille de progression — est dans l'app CaniPlus pour les membres premium."}}

## La règle d'or

{{Une phrase choc, mémorisable, qui peut être citée en carrousel ou partagée. Vraie valeur gratuite qui reste dans la tête du lecteur.}}

## Les erreurs qui cassent tout

{{3-4 erreurs fréquentes, détaillées. CETTE PARTIE EST DÉTAILLÉE — c'est la vraie valeur immédiate gratuite. Le lecteur peut arrêter de faire l'erreur dès la fin de l'article.}}

- **{{Erreur 1}}** — {{2-3 phrases : pourquoi c'est contre-productif, comment ça sabote tout}}
- **{{Erreur 2}}** — {{2-3 phrases}}
- **{{Erreur 3}}** — {{2-3 phrases}}
- **{{Erreur 4}}** — {{2-3 phrases}}

## Quand demander de l'aide

{{Signes qui doivent alerter + invitation à prendre une leçon privée CaniPlus (60 CHF) ou à contacter un éducateur canin qualifié.}}

## Pour passer à l'action : ressource premium

{{CTA clair et engageant vers le premium. Liste ce qui est en plus dans la ressource premium (durées, distances, grille de progression, carnet de suivi, troubleshooting, check-list pré-séance). 3-4 phrases.}}

👉 [Ouvrir l'app CaniPlus](https://app.caniplus.ch) → section Ressources → "{{Titre fiche premium}}"

Abonnement premium : 10 CHF/mois, sans engagement, résiliable en un clic.

---

*Tiffany Cotting est éducatrice canine à Ballaigues. Elle propose des cours collectifs, des leçons privées et un accompagnement à distance via l'app CaniPlus. Pour en savoir plus : [caniplus.ch](https://caniplus.ch).*
```

### Règles SEO

- Mot-clé principal dans : titre, H1, premier paragraphe, meta_description, slug, au moins un H2
- 2-3 mots-clés secondaires utilisés naturellement dans le corps
- Sous-titres H2/H3 descriptifs (pas de "Introduction", "Conclusion")
- Liens internes vers 1-2 autres articles CaniPlus pertinents si déjà publiés
- Pas de liste d'emojis dans le corps ; emojis sobres uniquement en CTA final

### Règles stratégiques (gap de valeur)

- **Jamais** de détails opérationnels dans les étapes (durées, distances, critères chiffrés, ordre précis) — ça va dans le premium
- **Toujours** développer le POURQUOI, le principe, et les erreurs à éviter — ça reste gratuit
- La liste des étapes est un TEASER : 1 phrase par étape, point
- Le CTA premium doit être explicite sur ce qui est en plus (durées, grille, progression)

---

## Deliverable 2 — `carrousel-fb-ig-1.md`

**Destination :** Instagram (feed + Facebook cross-post)
**Angle :** problématique / accroche émotionnelle / teaser du blog
**Publication suggérée :** début de semaine (lundi ou mardi)
**Master Canva :** "Template CaniPlus réseau sociaux" — design ID `DAHHUrbqonc`
**Format :** 1080×1350 (portrait 4:5)
**Charte :** cyan #2BABE1, ink #1F1F20 ; typos Playfair Display (titres) / Inter (corps) / Great Vibes (signatures)

### Nombre de slides

**8 à 10 slides.** 8 par défaut, 10 si sujet dense.

### Structure des slides

```markdown
# Carrousel 1 — Facebook + Instagram

**Angle : problématique émotionnelle + teaser du blog**
**Publication suggérée : lundi ou mardi**
**Format : 8-10 slides, 1080×1350 (4:5), charte CaniPlus (cyan #2BABE1, ink #1F1F20)**
**Typos : Playfair Display pour les titres, Inter pour le corps, Great Vibes pour les signatures**

---

## Slide 1 — Couverture

**Visuel :** {{Suggestion}}
**Titre :** {{5-8 mots — question forte ou reconnaissance de la douleur}}
**Sous-titre :** {{Courte amplification}}
**Mention :** Swipe →

---

## Slide 2 — L'aveu / la scène

{{Planter la scène émotionnelle — le lecteur doit se dire "c'est moi"}}

---

## Slide 3 — La vraie raison

{{Révéler que ce n'est pas ce qu'il pense (pas l'obéissance, pas la dominance, pas le caractère). Planter le vrai diagnostic.}}

---

## Slide 4 — Déculpabilisation

{{Ce n'est pas de sa faute. Personne ne nous apprend ça. Le problème est structurel.}}

---

## Slide 5 — Les {{N}} étapes (aperçu)

{{Liste des étapes — noms uniquement, pas de détail}}

---

## Slide 6 — La règle d'or

{{Citation marquante, typo Playfair grand format}}

---

## Slide 7 — À éviter

{{3-4 erreurs fréquentes, version condensée}}

---

## Slide 8 — CTA

**Titre :** L'article complet est en ligne
**Sous-texte :** Résumé de ce qu'il y trouvera + teaser du premium
**CTA :** caniplus.ch/blog
**Signature Great Vibes :** Tiffany — CaniPlus
```

### Caption + hashtags (en bas du fichier)

```markdown
## Caption Instagram + Facebook

{{150-250 mots. Reprend l'accroche de la slide 1, développe, invite à swiper, renvoie vers le blog et teasera le premium. Termine par une question ouverte pour engagement.}}

## Hashtags

#caniplus #educationcanine #chien #{{hashtag-thème-1}} #{{hashtag-thème-2}} #chiensuisse #ballaigues #vaudsuisse #romandiecanine #clubcanin #educationpositive #chienheureux #educateurcanin #comportementcanin #{{hashtag-spécifique}}
(15-20 hashtags)
```

---

## Deliverable 3 — `carrousel-fb-ig-2.md`

**Destination :** Instagram + Facebook
**Angle :** DIFFÉRENT du carrousel 1 — méthode concrète / astuce / témoignage / avant-après
**Publication suggérée :** fin de semaine (jeudi ou vendredi)
**Format :** identique carrousel 1 (8-10 slides, 1080×1350, charte cyan)

### Règle d'angle distinct

Les deux carrousels couvrent le même thème mais doivent être publiables à quelques jours d'intervalle sans répétition. Les angles possibles pour le carrousel 2 :
- **Astuce concrète unique** : focus sur UNE technique clé (ex : "charger le signal", "la rupture de mouvement") avec méthode en 3 temps
- **Mythes vs réalité** : 3-4 idées reçues démontées
- **Avant/après** : 2 scénarios opposés (ce qui marche / ce qui ne marche pas)
- **Erreur unique disséquée** : 1 erreur qu'on fait tous, expliquée en profondeur
- **Témoignage reformulé** : une scène vécue par un maître CaniPlus

### Structure des slides

Même structure que carrousel 1 (8 slides standards : accroche → constat → principe → méthode/astuce → exemple → erreur ou avertissement → règle clé → CTA), mais **l'angle doit être clairement différent** — un lecteur qui verrait les deux carrousels ne doit pas avoir l'impression de relire la même chose.

### CTA de la dernière slide

Orienté ressource premium (pas le blog — le blog a été teasé par le carrousel 1).

```
**Titre :** Le protocole complet est dans l'app
**Sous-texte :** {{Ce qu'il y a en plus dans le premium}}
**CTA :** Premium CaniPlus — 10 CHF/mois
app.caniplus.ch
```

---

## Deliverable 4 — `ressource-premium-app.md`

**Destination :** app CaniPlus → Ressources (réservé premium 10 CHF/mois)
**Format :** conventions déjà établies (voir memory `project_caniplus_articles_format.md`)
**Rôle stratégique :** donner LE COMMENT opérationnel que l'article blog a refusé de donner

### Règles spécifiques CaniPlus — IMPORTANT

Ces conventions sont déjà en mémoire et doivent être respectées :
- **Titres en MAJUSCULES** (ex : `LE RAPPEL QUI MARCHE VRAIMENT`)
- **Étapes numérotées** avec `N. TEXTE` (ex : `1. CHARGER LE SIGNAL`)
- Jamais "Jour 1, Jour 2…" — utiliser **ÉTAPE 1, ÉTAPE 2…** (chaque chien progresse à son rythme)
- Bullets avec `•` (puce fine)
- Sous-notes avec `→`
- Blocs `ASTUCE` et `ATTENTION` balisés
- **Sentence case en français** pour les corps (pas de Title Case)
- **Pas d'emojis** dans le contenu de la fiche
- **Jamais cage / crate / parc** (sauf sécurité vitale explicite)

### Contenu obligatoire (le COMMENT que le blog ne donne pas)

La ressource premium DOIT contenir, au minimum :
- Les durées indicatives (ex : "plusieurs jours", "6 à 10 répétitions par session")
- Les distances chiffrées (ex : "3 m → 5 m → 8 m → 10 m")
- Les critères de passage à l'étape suivante (ex : "8 réussites sur 10 avant de passer")
- L'ordre précis des distractions / difficultés à introduire
- Les blocs ASTUCE (conseils qui accélèrent)
- Les blocs ATTENTION (pièges et seuils de sécurité)
- Une checklist avant chaque séance
- Un protocole de troubleshooting (si ça ne fonctionne pas)

### Structure imposée

```markdown
# {{TITRE EN MAJUSCULES}}

**{{SOUS-TITRE DESCRIPTIF}}**

Catégorie : {{Section}}
Niveau : {{Débutant / Intermédiaire / Avancé}}
Durée du protocole : {{X à Y semaines selon le chien}}
Matériel : {{liste courte}}

---

## POURQUOI CE PROTOCOLE

{{2-3 phrases. Pourquoi cette approche, pour qui, avec quelles limites.}}

---

## CE DONT TU AS BESOIN

• {{Item 1}}
→ {{sous-note précision}}

• {{Item 2}}
→ {{sous-note}}

• {{Item 3}}

---

## ÉTAPE 1. {{TITRE ACTION}}

Objectif : {{1 phrase claire}}

**Exercice principal**

1. {{SOUS-EXERCICE 1 EN MAJUSCULES}}
• {{Geste précis}}
• {{Geste précis}}
→ {{Sous-note opérationnelle}}

2. {{SOUS-EXERCICE 2}}
• {{Geste précis}}

**Critères de passage à l'étape 2**

• {{Indicateur observable 1}}
• {{Indicateur observable 2}}

> ASTUCE
> {{Conseil qui accélère les progrès}}

> ATTENTION
> {{Point de vigilance}}

---

## ÉTAPE 2. {{TITRE ACTION}}

{{Même structure}}

---

## ÉTAPE 3, 4, 5…

{{Même structure — autant d'étapes que le protocole le requiert, généralement 4 à 6}}

---

## ENTRETIEN À VIE

{{Comment maintenir l'acquis sur le long terme. 4-6 bullets.}}

---

## ERREURS QUI CASSENT LE PROTOCOLE

• {{Erreur 1}}
→ {{Conséquence}}

• {{Erreur 2}}
→ {{Conséquence}}

---

## QUAND DEMANDER DE L'AIDE

{{Signes qui justifient une leçon privée. Leçon privée CaniPlus : 60 CHF. Prise de rendez-vous depuis l'onglet Profil de l'app.}}

---

## CHECK-LIST AVANT CHAQUE SÉANCE

• {{Item 1}}
• {{Item 2}}
• {{Item 3}}
• {{Item 4}}

---

*Ce protocole a été conçu par Tiffany Cotting, éducatrice canine à Ballaigues (CaniPlus). Il s'appuie sur les principes du conditionnement opérant, du renforcement positif et de la désensibilisation progressive. Aucune méthode coercitive n'est utilisée.*
```

---

## Deliverable 5 — `notification-cloche-app.md`

**Destination :** app CaniPlus → cloche de notification
**Format :** notification push PWA avec version courte (écran verrouillé) + version longue (dans l'app) + e-mail de relance J+3 pour non-premium

### Règles

- **Version courte :** max 90 caractères, accroche directe
- **Version longue :** détaillée, avec liste des bénéfices de la ressource premium
- **E-mail de relance J+3 :** ciblé non-premium, incite à s'abonner
- **Déclenchement recommandé :** lundi fin d'après-midi (17h-18h) — moment où les maîtres pensent à la balade du soir

### Structure

```markdown
# Notification push — App CaniPlus

**Objectif :** annoncer la mise en ligne de la nouvelle ressource "{{Titre}}" dans la section Ressources.
**Cible :** tous les membres de l'app (premium + non-premium).
**Déclenchement :** lundi 17h-18h.

---

## Version courte (écran verrouillé)

**Titre :** {{Nouvelle ressource premium}}
**Corps :** {{Max 90 caractères, accroche directe}}

---

## Version longue (dans l'app)

**Titre :** {{Accroche engageante}}
**Corps :**
{{Résumé du contenu}}

Au programme :
• {{Bénéfice 1}}
• {{Bénéfice 2}}
• {{Bénéfice 3}}

Membres premium : accès immédiat.
Non premium : aperçu gratuit + abonnement 10 CHF/mois sans engagement.

**CTA :** Lire la ressource

---

## E-mail de relance J+3 (non-premium)

**Objet :** {{Accroche courte}}

**Corps :**
{{3-4 paragraphes qui rappellent la valeur de la ressource premium et renvoient vers l'app}}

---

## Paramètres techniques

• Type : notification push native PWA (Supabase + service worker)
• Envoi segmenté : premium / non premium
• Action : ouvrir directement sur la fiche ressource
• Badge : +1 sur l'onglet Ressources jusqu'à lecture
```

---

## Workflow complet — ce que je fais

1. **Thème reçu (ou choisi en mode auto)** → je crée le dossier `contenu/{slug}/`
2. **Je rédige les 5 fichiers** en respectant les formats ci-dessus ET la stratégie gratuit/premium
3. **Je vérifie la cohérence transversale** :
   - Même angle pédagogique dans les 5 deliverables
   - Les étapes sont NOMMÉES dans blog + carrousels, DÉTAILLÉES uniquement dans le premium
   - Les 2 carrousels ont des angles distincts
   - Les canaux renvoient stratégiquement vers blog OU premium selon leur rôle
4. **Je mets à jour `contenu/README.md`** pour ajouter le nouveau thème
5. **Je liste les 5 fichiers** avec liens `computer://` pour que Tiffany les ouvre

## Workflow complet — ce que Tiffany fait après

**Lundi**
- Publier **carrousel 1** sur Instagram + cross-post Facebook
- Publier l'**article blog** sur caniplus.ch/blog
- Pousser la **ressource premium** dans Supabase (table `resources`, `premium = true`)
- Envoyer la **notification push** via le panel admin (17h-18h)

**Jeudi ou vendredi**
- Publier **carrousel 2** sur Instagram + cross-post Facebook
- (Optionnel) Envoyer l'**e-mail de relance** aux non-premium

## Checklist qualité avant de livrer

Avant d'annoncer "bundle prêt", vérifier :

- [ ] Les 5 fichiers existent dans le dossier thème
- [ ] Zéro mention de cage, crate, parc (sauf sécurité vitale explicite)
- [ ] Étapes (pas jours) dans blog, carrousels et ressource premium
- [ ] **Gap gratuit/premium respecté** : article blog teaser (pas de détails opérationnels), premium détaillé (durées, distances, critères)
- [ ] Titre MAJUSCULES et sentence case dans ressource-premium
- [ ] Carrousels : 8-10 slides chacun, angles distincts entre les deux
- [ ] Carrousels : caption + hashtags fournis
- [ ] Notification cloche courte ≤ 90 caractères
- [ ] Carrousel 1 renvoie vers le **blog**, carrousel 2 renvoie vers le **premium**
- [ ] Article blog renvoie clairement vers le premium (CTA explicite)
- [ ] Ton chaleureux, fondé sur l'éducation positive, pas de moralisation
- [ ] Tutoiement systématique
- [ ] Pas de vidéo (pas de script, pas de storyboard, pas de voix-off)
- [ ] `contenu/README.md` mis à jour

## Références Canva utiles

- **Master template** : `DAHHUrbqonc` — "Template CaniPlus réseau sociaux" — 1080×1350 — 100 pages de styles
- edit_url : `https://www.canva.com/d/cGXl7YpQQPvWzJF`
- Polices : Playfair Display (titres), Inter (corps), Great Vibes (signatures)
- Charte : cyan #2BABE1, ink #1F1F20

## Extensions possibles (à activer quand Tiffany le demande)

- **Relance J+30** — regénérer une variante des carrousels pour repousser 1 mois après
- **Newsletter** — extraire une version e-mail du blog
- **Story IG** — 3 slides verticales 1080×1920 à partir des carrousels
- **Vidéo** — ABANDONNÉ — ne pas produire de script, storyboard, voix-off ou guide montage vidéo
