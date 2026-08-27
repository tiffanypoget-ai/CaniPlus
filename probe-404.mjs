import { chromium } from 'playwright';
const SP = '/tmp/claude-0/-home-user-CaniPlus/a4a17d42-2a94-551d-bd36-e2253ffd1c97/scratchpad';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let ko = 0;
for (const w of [1440, 390]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 900 } });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message.slice(0, 120)));
  await p.goto('http://localhost:4402/404.html', { waitUntil: 'networkidle' });
  const r = await p.evaluate(() => ({
    titre: document.querySelector('h1')?.textContent.trim(),
    eyebrow: document.querySelector('.eyebrow')?.textContent.trim(),
    liens: [...document.querySelectorAll('.hero-cta-404 a')].map(a => a.textContent.trim() + '→' + a.getAttribute('href')),
    entete: !!document.querySelector('header.nav .nav-inner'),
    piedDePage: !!document.querySelector('footer .footer-grid'),
    robots: document.querySelector('meta[name=robots]')?.content,
    debordement: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }));
  const ok = r.entete && r.piedDePage && r.liens.length === 3 && !r.debordement && !errs.length;
  if (!ok) ko++;
  console.log(`${ok ? 'ok  ' : 'KO  '} ${w}px  entete=${r.entete} pied=${r.piedDePage} liens=${r.liens.length} debordement=${r.debordement}${errs.length ? ' ERREURS ' + errs : ''}`);
  if (w === 1440) { console.log('     h1 :', r.titre); console.log('     liens :', r.liens.join('  ')); console.log('     robots :', r.robots); }
  await p.screenshot({ path: `${SP}/e-404-${w}.png` });
  await ctx.close();
}
console.log(ko === 0 ? '\nTout passe.' : `\n${ko} echec(s).`);
await b.close();
