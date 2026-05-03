// scripts/stamp-sw.js
// Tampon de version pour le service worker.
//
// Pourquoi : les navigateurs comparent service-worker.js byte-par-byte pour
// détecter une mise à jour. Si on ne touche jamais à ce fichier (ce qui arrive
// souvent — on push surtout du code applicatif), le SW reste "identique" et
// l'événement `updatefound` ne se déclenche pas → le banner UpdateBanner ne
// s'affiche jamais et les users restent sur l'ancienne version cachée.
//
// Solution : à chaque build, on injecte un CACHE_NAME unique basé sur le
// timestamp du build (ou le SHA du commit Vercel si dispo). Ça change le
// fichier byte-par-byte → le navigateur voit la MAJ → install → activate via
// SKIP_WAITING au clic du user.
//
// Lancé automatiquement après `vite build` via le script "build" du package.json.

const { readFileSync, writeFileSync, existsSync } = require('node:fs');
const { resolve } = require('node:path');

const swPath = resolve(__dirname, '..', 'dist', 'service-worker.js');

if (!existsSync(swPath)) {
  console.warn('[stamp-sw] dist/service-worker.js introuvable, on saute.');
  process.exit(0);
}

const stamp =
  (process.env.VERCEL_GIT_COMMIT_SHA && process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)) ||
  Date.now().toString(36);

let src = readFileSync(swPath, 'utf8');
const before = src;

src = src.replace(
  /const CACHE_NAME = '[^']+';/,
  "const CACHE_NAME = 'caniplus-" + stamp + "';"
);

if (src === before) {
  console.warn('[stamp-sw] Aucun CACHE_NAME trouvé, fichier inchangé.');
  process.exit(0);
}

// Préfixer un commentaire avec la date pour rendre la modification évidente
// dans la diff et éviter qu'un linter ne supprime le tampon.
const banner = '// Build: ' + new Date().toISOString() + ' — stamp: ' + stamp + '\n';
src = banner + src;

writeFileSync(swPath, src, 'utf8');
console.log('[stamp-sw] CACHE_NAME → caniplus-' + stamp);
