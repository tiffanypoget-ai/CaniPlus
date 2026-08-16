// src/lib/premiumContent.js
// Parsing du format texte CaniPlus utilise par les ressources premium
// (titres ALL CAPS, bullets •, sous-bullets →, ASTUCE, ATTENTION...).
//
// Extrait de RessourcesScreen le 16.08.2026 pour que l'apercu de l'editeur
// admin rende exactement comme l'app : une seule implementation, pas deux
// qui divergent.

// ── Nettoyage markdown inline ───────────────────────────────────────
// Le contenu peut arriver avec des restes de markdown (**gras**, _italic_).
// On les retire ici pour qu'ils ne s'affichent pas en clair dans l'article.
export function stripInlineMarkdown(s) {
  if (!s) return s;
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')   // **gras** → texte
    .replace(/__([^_]+)__/g, '$1')       // __gras__ → texte
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1$2')   // *italic* → texte (sans casser les bullets •)
    .replace(/(^|[\s(])_([^_\n]+)_/g, '$1$2');    // _italic_ → texte
}

// ── Normalisation des bullets (rattrapage si l'agent éditorial génère mal) ──
// Le format CaniPlus officiel est `• item` sur une ligne propre. Mais l'IA
// désobéit ponctuellement et écrit `- item` ou pire colle tout sur une ligne :
//   "Technique : - Fais X. - Pas de savon. - Sèche."
// Cette fonction rattrape les deux cas avant que parseContent ne classe le
// contenu en simple paragraphe (et perde la structure de liste).
export function normalizeBullets(text) {
  if (!text) return text;
  let s = text;

  // Cas 1 : bullets `-` ou `*` en DÉBUT de ligne → on les remplace par `•`.
  // (regex `multiline` pour matcher chaque ligne).
  s = s.replace(/^[\t ]*[-*][\t ]+/gm, '• ');

  // Cas 2 : LISTE INLINÉE — toute la "liste" tient sur une seule ligne, du
  // genre "Intro : - item1 - item2 - item3". On exige un ":" suivi d'au moins
  // DEUX " - " (espace tiret espace) pour éviter les faux positifs (un tiret
  // de ponctuation seul ne déclenche rien).
  s = s.split('\n').map(line => {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) return line;
    const after = line.slice(colonIdx + 1);
    // Match " - " ou début de chaîne suivi de "- " (au moins 2 occurrences)
    const dashCount = (after.match(/(?:^|\s)-\s+/g) || []).length;
    if (dashCount < 2) return line;

    const intro = line.slice(0, colonIdx + 1).trim();
    const items = after.split(/(?:^|\s)-\s+/).map(p => p.trim()).filter(Boolean);
    return [intro, ...items.map(it => `• ${it}`)].join('\n');
  }).join('\n');

  return s;
}

// ── Parseur de contenu d'article ─────────────────────────────────────
// Transforme un texte brut en blocs visuels : heading, subheading,
// paragraph, bullets, steps, arrow-items, tip, warning, separator.
export function parseContent(text) {
  if (!text) return [];
  // Pré-traitement #1 : normaliser les bullets - et * + listes inlinées
  // (corrige les contenus générés avec un format markdown imparfait).
  text = normalizeBullets(text);
  // Pré-traitement #2 : on retire les séparateurs markdown (--- *** ___) qui
  // n'ont aucun rendu visuel utile dans la modale.
  const lines = text.split('\n').filter(raw => {
    const t = raw.trim();
    return !/^(?:-{3,}|\*{3,}|_{3,})$/.test(t);
  });
  const blocks = [];
  let i = 0;

  // Saute la première ligne si c'est le titre en MAJUSCULES (doublon du header)
  if (lines[0] && lines[0].trim() === lines[0].trim().toUpperCase() && lines[0].trim().length > 3) {
    i = 1;
  }
  // Saute aussi la première ligne si c'est un H1 markdown qui reprend le titre.
  if (lines[i] && /^#\s+/.test(lines[i].trim())) {
    i++;
  }

  // Un "heading all caps" : on ignore ce qui est entre parenthèses,
  // ce qui permet à "EXERCICE 2 — LE PING-PONG (à deux personnes)" d'être détecté.
  const isAllCaps = (s) => {
    if (!s || s.length < 5) return false;
    const stripped = s.replace(/\([^)]*\)/g, '').trim();
    if (!stripped || stripped.length < 4) return false;
    // Il faut au moins une vraie lettre, et toutes les lettres doivent être en majuscules
    if (!/[A-ZÉÈÊÀÂÎÏÔÛÙÇ]/.test(stripped)) return false;
    return stripped === stripped.toUpperCase();
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line) { i++; continue; }

    // Markdown heading H1 / H2 / H3 (# / ## / ###) — on les traite comme
    // un vrai heading. Si le texte est un titre numéroté ("1. xxx"), on
    // récupère le numéro pour la même mise en forme que les ALL CAPS numérotés.
    const mdHeading = line.match(/^(#{1,3})\s+(.+?)\s*#*$/);
    if (mdHeading) {
      const level = mdHeading[1].length;
      const cleaned = stripInlineMarkdown(mdHeading[2]);
      if (level >= 2) {
        // H2/H3 → sous-titre coloré
        blocks.push({ type: 'subheading', text: cleaned });
      } else {
        const numMatch = cleaned.match(/^(\d+)\.\s+(.+)$/);
        if (numMatch) {
          blocks.push({ type: 'heading', number: numMatch[1], text: numMatch[2] });
        } else {
          blocks.push({ type: 'heading', text: cleaned });
        }
      }
      i++;
      continue;
    }

    // ASTUCE / TIP
    if (/^ASTUCE/i.test(line)) {
      // Le texte de l'astuce peut continuer sur les lignes suivantes
      const parts = [line.replace(/^ASTUCE\s*(PRO|CANIPLUS)?\s*[:—\-]?\s*/i, '')];
      i++;
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) break;
        if (isAllCaps(next) || next.startsWith('•') || next.startsWith('→') || /^\d+\.\s/.test(next)) break;
        parts.push(next);
        i++;
      }
      blocks.push({ type: 'tip', text: parts.filter(Boolean).join(' ') });
      continue;
    }

    // ATTENTION / WARNING
    if (/^ATTENTION\b/i.test(line) || /^ERREURS?\s+(À|FRÉQUENTES?|COURANTES?)/i.test(line) || /^CE QUI NE MARCHE PAS/i.test(line)) {
      const title = line.replace(/[:—\-]$/, '').trim();
      blocks.push({ type: 'warning-heading', text: title });
      i++;
      // Collecter les lignes jusqu'à prochaine section
      const items = [];
      const paragraphs = [];
      while (i < lines.length) {
        const next = lines[i].trim();
        if (!next) { i++; continue; }
        if (isAllCaps(next)) break;
        if (next.startsWith('•')) {
          items.push(next.replace(/^•\s*/, ''));
          i++;
        } else if (next.startsWith('→')) {
          items.push(next.replace(/^→\s*/, ''));
          i++;
        } else {
          paragraphs.push(next);
          i++;
        }
      }
      if (paragraphs.length) blocks.push({ type: 'warning-text', text: paragraphs.join(' ') });
      if (items.length) blocks.push({ type: 'warning-list', items });
      continue;
    }

    // Heading (ALL CAPS, éventuellement numéroté "N. …")
    // On fusionne l'ancienne branche "heading numéroté" et "ALL CAPS" pour
    // garantir que TOUS les titres numérotés reçoivent la même mise en forme
    // (carré coloré avec le numéro), peu importe s'ils contiennent un tiret,
    // un guillemet ou une apostrophe.
    if (isAllCaps(line) && !line.startsWith('•')) {
      const numMatch = line.match(/^(\d+)\.\s+(.+)$/);
      if (numMatch) {
        blocks.push({ type: 'heading', number: numMatch[1], text: numMatch[2] });
      } else {
        blocks.push({ type: 'heading', text: line });
      }
      i++;
      continue;
    }

    // Sous-titre : ligne se terminant par ":" (et courte, < 80 char)
    if (/:$/.test(line) && line.length < 80 && !line.startsWith('•') && !line.startsWith('→') && !/^\d+\.\s/.test(line)) {
      blocks.push({ type: 'subheading', text: line.replace(/:$/, '') });
      i++;
      continue;
    }

    // Heuristique : ligne courte suivie de flèches "→" → sous-titre
    // (Cas typique : "Marcher lentement / se figer" suivi d'explications en flèches.)
    if (
      line.length < 80 &&
      !line.startsWith('•') &&
      !line.startsWith('→') &&
      !/^\d+\.\s/.test(line) &&
      i + 1 < lines.length &&
      lines[i + 1].trim().startsWith('→')
    ) {
      blocks.push({ type: 'subheading', text: line });
      i++;
      continue;
    }

    // Liste d'étapes numérotées (1. ..., 2. ...)
    if (/^\d+\.\s/.test(line)) {
      const steps = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i].trim())) {
        steps.push(lines[i].trim().replace(/^\d+\.\s*/, ''));
        i++;
      }
      blocks.push({ type: 'steps', items: steps });
      continue;
    }

    // Bullets avec sous-flèches imbriquées
    if (line.startsWith('•')) {
      const items = [];
      while (i < lines.length) {
        const cur = lines[i].trim();
        if (cur.startsWith('•')) {
          items.push({ text: cur.replace(/^•\s*/, ''), subs: [] });
          i++;
        } else if (cur.startsWith('→') && items.length) {
          items[items.length - 1].subs.push(cur.replace(/^→\s*/, ''));
          i++;
        } else {
          break;
        }
      }
      blocks.push({ type: 'bullets', items });
      continue;
    }

    // Ligne "→ ..." seule → sous-note italique du bloc précédent
    if (line.startsWith('→')) {
      blocks.push({ type: 'arrow', text: line.replace(/^→\s*/, '') });
      i++;
      continue;
    }

    // Paragraphe classique (éventuellement multi-lignes regroupées)
    const paragraphLines = [line];
    i++;
    while (i < lines.length) {
      const next = lines[i].trim();
      if (!next) break;
      if (isAllCaps(next)) break;
      if (/^#{1,3}\s+/.test(next)) break; // un titre markdown coupe le paragraphe
      if (next.startsWith('•') || next.startsWith('→') || /^\d+\.\s/.test(next)) break;
      if (/:$/.test(next) && next.length < 80) break;
      paragraphLines.push(next);
      i++;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join(' ') });
  }

  // Post-traitement : on nettoie tous les **gras**, _italic_ etc. qui se
  // baladeraient encore dans les blocs (paragraphes, bullets, étapes, etc.).
  return blocks.map(b => {
    const out = { ...b };
    if (out.text) out.text = stripInlineMarkdown(out.text);
    if (Array.isArray(out.items)) {
      out.items = out.items.map(item => {
        if (typeof item === 'string') return stripInlineMarkdown(item);
        if (item && typeof item === 'object') {
          return {
            ...item,
            text: item.text ? stripInlineMarkdown(item.text) : item.text,
            subs: Array.isArray(item.subs) ? item.subs.map(stripInlineMarkdown) : item.subs,
          };
        }
        return item;
      });
    }
    return out;
  });
}

// Estimation temps de lecture : ~220 mots/minute
export function estimateReadingTime(text) {
  if (!text) return 1;
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

// Sentence Case pour les headings qui arrivent en MAJUSCULES.
// En français on ne capitalise QUE le premier mot — pas chaque mot comme en
// anglais. "POURQUOI LE RAPPEL EST SI DIFFICILE ?" devient "Pourquoi le
// rappel est si difficile ?" (et pas "Pourquoi Le Rappel Est Si Difficile").
// Si le texte contient déjà des minuscules (mixed case), on ne touche à rien.
// EXCEPTION : les parenthèses sont IGNORÉES pour le test de majuscule et
// préservées en l'état dans la sortie. Cela permet de sentence-caser correctement
// des titres comme "EXERCICE 2 — LE PING-PONG (à deux personnes)" →
// "Exercice 2 — le ping-pong (à deux personnes)".
export function toSentenceCase(s) {
  if (!s) return '';
  // Teste la casse en IGNORANT ce qu'il y a entre parenthèses.
  const withoutParens = s.replace(/\([^)]*\)/g, '');
  if (withoutParens !== withoutParens.toUpperCase()) return s;
  // Sentence case : tout en minuscules SAUF ce qui est entre parenthèses
  // (préservé tel quel), puis capitalise la première vraie lettre.
  let result = '';
  let depth = 0;
  for (const ch of s) {
    if (ch === '(') depth++;
    if (depth > 0) {
      result += ch;
    } else {
      result += /\p{L}/u.test(ch) ? ch.toLowerCase() : ch;
    }
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  // Capitaliser la première vraie lettre (hors parenthèses).
  let capitalized = false;
  let out = '';
  depth = 0;
  for (const ch of result) {
    if (ch === '(') depth++;
    if (!capitalized && depth === 0 && /\p{L}/u.test(ch)) {
      out += ch.toUpperCase();
      capitalized = true;
    } else {
      out += ch;
    }
    if (ch === ')') depth = Math.max(0, depth - 1);
  }
  return out;
}
