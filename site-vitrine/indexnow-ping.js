// Ping IndexNow pour notifier Bing/Yandex de toutes les URLs CaniPlus
// Lancer après chaque déploiement majeur : node indexnow-ping.js
// Lance aussi automatiquement après déploiement Vercel via webhook si configuré

const KEY = '12c64ed67bc7da9cd418df36f87b4e01';
const HOST = 'caniplus.ch';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const URLS = [
  'https://caniplus.ch/',
  'https://caniplus.ch/pages/cours-prive-comportement-chien',
  'https://caniplus.ch/pages/cours-collectif-education-canine',
  'https://caniplus.ch/pages/reeducation-chien-reactif',
  'https://caniplus.ch/pages/cours-theorique-education-canine',
  'https://caniplus.ch/pages/educateur-canin-yverdon',
  'https://caniplus.ch/pages/educateur-canin-vallorbe',
  'https://caniplus.ch/pages/educateur-canin-orbe',
  'https://caniplus.ch/pages/educateur-canin-la-sarraz',
  'https://caniplus.ch/pages/educateur-canin-lausanne',
  'https://caniplus.ch/blog/',
  'https://caniplus.ch/blog/allergies-saisonnieres-chien-signes-soulager',
  'https://caniplus.ch/blog/chien-tire-laisse-autre-chien',
  'https://caniplus.ch/legal/mentions-legales',
  'https://caniplus.ch/legal/politique-confidentialite',
];

const payload = {
  host: HOST,
  key: KEY,
  keyLocation: KEY_LOCATION,
  urlList: URLS,
};

async function ping(endpoint) {
  console.log(`\n→ Ping ${endpoint}`);
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });
    console.log(`  Status: ${res.status} ${res.statusText}`);
    if (res.status >= 200 && res.status < 300) {
      console.log(`  ✓ ${URLS.length} URLs soumises`);
    } else {
      const text = await res.text();
      console.log(`  ✗ Erreur: ${text.slice(0, 200)}`);
    }
  } catch (err) {
    console.log(`  ✗ Échec: ${err.message}`);
  }
}

(async () => {
  console.log(`IndexNow — soumission de ${URLS.length} URLs CaniPlus`);
  // IndexNow se diffuse à tous les moteurs (Bing, Yandex, Naver, Seznam) via api.indexnow.org
  await ping('https://api.indexnow.org/indexnow');
  // Backup direct à Bing
  await ping('https://www.bing.com/indexnow');
  console.log('\nFait. Vérifier les statuts dans Bing Webmaster Tools > IndexNow.');
})();
