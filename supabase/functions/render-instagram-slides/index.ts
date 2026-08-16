// supabase/functions/render-instagram-slides/index.ts
// -----------------------------------------------------------------------------
// Rendu des slides Instagram d'un bundle editorial en images brandees CaniPlus
// (16.08.2026).
//
// Lit content_instagram.slides (tableau { title, body }), rend une image
// 1080x1350 (4:5) par slide a la charte CaniPlus, l'upload dans
// editorial-images/{bundle_id}/slides/ et ecrit les URLs dans l'ordre dans
// content_instagram.image_urls. La publication du carrousel se declenche alors
// toute seule a la publication du bundle (editorial-bundle-actions, max 10
// images).
//
// Appelee :
//   - automatiquement en fin de generate-editorial-bundle, apres la couverture ;
//   - manuellement depuis l'editeur admin (bouton « Re-rendre les slides »),
//     apres une correction de texte.
//
// Input (format plat) : { admin_password | cron_secret, bundle_id }
// Output : { success, image_urls, count, errors }
//
// Pipeline : satori (JSX -> SVG) puis resvg-wasm (SVG -> pixels) puis jpeg-js
// (pixels -> JPEG). Le JPEG est impose par l'API Meta, qui refuse les autres
// formats a la creation d'un media.
//
// Polices : Playfair Display (titres) et Inter (corps), recuperees au runtime
// depuis Google Fonts et gardees en memoire pour la duree de l'instance.
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import satori from 'https://esm.sh/satori@0.10.14';
import { initWasm, Resvg } from 'https://esm.sh/@resvg/resvg-wasm@2.6.2';
import { encode as encodeJpeg } from 'https://esm.sh/jpeg-js@0.4.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format Instagram portrait, le plus haut autorise : occupe le maximum de
// hauteur dans le fil.
const W = 1080;
const H = 1350;

// Charte CaniPlus (site-vitrine/assets/style.css).
const CYAN = '#2babe1';
const BLEU_TEXTE = '#176E94';
const INK = '#1f1f20';
const INK_SOFT = '#3d3d3d';
const SAND = '#f8f5f0';
const CYAN_LIGHT = '#e8f6fc';
const GRAY = '#8b8b8b';

const FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Inter:wght@400;600;700';
const RESVG_WASM_URL = 'https://esm.sh/@resvg/resvg-wasm@2.6.2/index_bg.wasm';
const LOGO_URL = 'https://caniplus.ch/images/logo-email.png';

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// ── Ressources chargees une fois par instance ────────────────────────────────
type SatoriFont = { name: string; data: ArrayBuffer; weight: number; style: 'normal' };

let fontsPromise: Promise<SatoriFont[]> | null = null;
let wasmPromise: Promise<void> | null = null;
let logoPromise: Promise<string | null> | null = null;

async function loadFonts(): Promise<SatoriFont[]> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    // L'API css2 ne renvoie du TTF (le seul format lisible par satori) que si
    // le User-Agent est celui d'un vieux navigateur. Sans ce header on recoit
    // du woff2, illisible ici.
    const res = await fetch(FONTS_CSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) throw new Error(`Google Fonts CSS ${res.status}`);
    const css = await res.text();

    const blocks = css.split('@font-face').slice(1);
    const wanted: Array<{ name: string; weight: number; url: string }> = [];
    for (const block of blocks) {
      const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
      const weight = Number(block.match(/font-weight:\s*(\d+)/)?.[1] ?? '400');
      const url = block.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (family && url) wanted.push({ name: family, weight, url });
    }
    if (wanted.length === 0) throw new Error('aucune police TTF trouvee dans le CSS Google Fonts');

    return await Promise.all(wanted.map(async (f) => {
      const r = await fetch(f.url);
      if (!r.ok) throw new Error(`police ${f.name} ${f.weight} : HTTP ${r.status}`);
      return { name: f.name, data: await r.arrayBuffer(), weight: f.weight, style: 'normal' as const };
    }));
  })();
  return fontsPromise;
}

function ensureWasm(): Promise<void> {
  if (!wasmPromise) {
    wasmPromise = (async () => {
      const r = await fetch(RESVG_WASM_URL);
      if (!r.ok) throw new Error(`resvg wasm : HTTP ${r.status}`);
      await initWasm(await r.arrayBuffer());
    })();
  }
  return wasmPromise;
}

// Logo en data URI : satori ne va pas chercher les images distantes lui-meme.
// Si le site est injoignable, on retombe sur le nom ecrit en Playfair.
async function loadLogo(): Promise<string | null> {
  if (logoPromise) return logoPromise;
  logoPromise = (async () => {
    try {
      const r = await fetch(LOGO_URL);
      if (!r.ok) return null;
      const bytes = new Uint8Array(await r.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) {
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      }
      return `data:image/png;base64,${btoa(bin)}`;
    } catch (_) {
      return null;
    }
  })();
  return logoPromise;
}

// ── Construction d'une slide ─────────────────────────────────────────────────
// Helper minimal facon createElement : satori accepte des objets bruts, pas
// besoin de JSX (donc pas de config de compilation cote edge function).
function h(type: string, style: Record<string, unknown>, children?: unknown): any {
  return { type, props: { style, ...(children === undefined ? {} : { children }) } };
}

// Les titres font au plus 6 mots et les corps 1 a 2 phrases, mais Tiffany peut
// rallonger un texte a la relecture : on retaille pour que ca tienne toujours.
function titleSize(text: string): number {
  const n = text.length;
  if (n > 60) return 46;
  if (n > 42) return 56;
  if (n > 28) return 64;
  return 72;
}
function bodySize(text: string): number {
  const n = text.length;
  if (n > 260) return 26;
  if (n > 180) return 30;
  if (n > 110) return 34;
  return 38;
}

function buildSlide(opts: {
  title: string;
  body: string;
  index: number;   // 1-based
  total: number;
  logo: string | null;
  isFirst: boolean;
  isLast: boolean;
}): any {
  const { title, body, index, total, logo, isFirst, isLast } = opts;
  const background = isFirst || isLast ? CYAN_LIGHT : SAND;

  const header = h('div', { display: 'flex', alignItems: 'center' }, [
    h('div', { width: 46, height: 5, background: CYAN, borderRadius: 3, marginRight: 18 }),
    h('div', {
      fontFamily: 'Inter', fontSize: 24, fontWeight: 600,
      letterSpacing: 7, color: BLEU_TEXTE,
    }, 'CANIPLUS'),
  ]);

  const main: any[] = [
    h('div', {
      fontFamily: 'Playfair Display', fontWeight: 700, fontSize: titleSize(title),
      color: INK, lineHeight: 1.16, letterSpacing: -0.5,
    }, title),
    h('div', { width: 96, height: 6, background: CYAN, borderRadius: 3, marginTop: 30, marginBottom: 30 }),
  ];
  if (body) {
    main.push(h('div', {
      fontFamily: 'Inter', fontWeight: 400, fontSize: bodySize(body),
      color: INK_SOFT, lineHeight: 1.5,
    }, body));
  }
  if (isLast) {
    main.push(h('div', {
      display: 'flex', alignSelf: 'flex-start', marginTop: 44,
      background: CYAN, color: '#ffffff', borderRadius: 999,
      padding: '22px 40px', fontFamily: 'Inter', fontWeight: 700, fontSize: 34,
    }, 'app.caniplus.ch'));
  }

  const footerLeft = logo
    ? { type: 'img', props: { src: logo, width: 208, height: 156 } }
    : h('div', { fontFamily: 'Playfair Display', fontWeight: 700, fontSize: 40, color: INK }, 'CaniPlus');

  const footer = h('div', {
    display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
  }, [
    footerLeft,
    h('div', {
      fontFamily: 'Inter', fontWeight: 600, fontSize: 24, color: GRAY, letterSpacing: 2,
    }, `${String(index).padStart(2, '0')} / ${String(total).padStart(2, '0')}`),
  ]);

  return h('div', {
    display: 'flex', width: W, height: H, background, fontFamily: 'Inter',
  }, [
    // Barre laterale cyan : signature visuelle commune a toutes les slides.
    h('div', { width: 16, height: H, background: CYAN }),
    h('div', {
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      flexGrow: 1, height: H, padding: '76px 76px 64px 64px',
    }, [
      header,
      h('div', { display: 'flex', flexDirection: 'column' }, main),
      footer,
    ]),
  ]);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({} as any));
    const { admin_password, cron_secret, bundle_id } = body ?? {};

    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const expectedCron = Deno.env.get('CRON_SECRET') ?? '';
    const isAdmin = !!admin_password && !!expectedAdmin && admin_password === expectedAdmin;
    const isCron = !!cron_secret && !!expectedCron && cron_secret === expectedCron;
    if (!isAdmin && !isCron) return fail('Authentification requise.', 401);
    if (!bundle_id) return fail('bundle_id manquant.', 400);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    );

    const { data: bundle, error: e1 } = await supabase
      .from('editorial_bundles')
      .select('id, content_instagram')
      .eq('id', bundle_id)
      .single();
    if (e1) throw e1;
    if (!bundle) return fail('Bundle introuvable.', 404);

    const insta = (bundle.content_instagram ?? {}) as Record<string, any>;
    const rawSlides = Array.isArray(insta.slides) ? insta.slides : [];
    // Instagram plafonne un carrousel a 10 images.
    const slides = rawSlides
      .filter((s: any) => s && (s.title || s.body))
      .slice(0, 10);

    if (slides.length === 0) return fail('Aucune slide a rendre (content_instagram.slides vide).', 400);

    const [fonts, , logo] = await Promise.all([loadFonts(), ensureWasm(), loadLogo()]);

    const imageUrls: string[] = [];
    const errors: string[] = [];
    const version = Date.now();

    for (let i = 0; i < slides.length; i++) {
      const s = slides[i];
      try {
        const svg = await satori(
          buildSlide({
            title: String(s.title ?? '').trim(),
            body: String(s.body ?? '').trim(),
            index: i + 1,
            total: slides.length,
            logo,
            isFirst: i === 0,
            isLast: i === slides.length - 1,
          }),
          { width: W, height: H, fonts },
        );

        const rendered = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render();
        // Meta refuse le PNG a la creation d'un media : on encode en JPEG
        // depuis les pixels bruts plutot que de passer par asPng().
        const jpeg = encodeJpeg(
          { data: rendered.pixels, width: rendered.width, height: rendered.height },
          88,
        );
        const bytes = new Uint8Array(jpeg.data);

        const path = `${bundle_id}/slides/slide-${String(i + 1).padStart(2, '0')}.jpg`;
        const { error: upErr } = await supabase.storage
          .from('editorial-images')
          .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
        if (upErr) throw new Error(upErr.message);

        const { data: pub } = supabase.storage.from('editorial-images').getPublicUrl(path);
        // Le chemin est stable (upsert) : le parametre de version evite qu'un
        // CDN serve encore l'ancienne slide apres un re-rendu.
        imageUrls.push(`${pub.publicUrl}?v=${version}`);
      } catch (e) {
        errors.push(`slide ${i + 1}: ${(e as Error).message}`);
      }
    }

    if (imageUrls.length === 0) {
      return ok({ error: `Aucune slide rendue. ${errors.join(' | ')}`, errors }, 500);
    }

    const { error: e2 } = await supabase
      .from('editorial_bundles')
      .update({
        content_instagram: { ...insta, image_urls: imageUrls },
        slides_rendered_at: new Date().toISOString(),
      })
      .eq('id', bundle_id);
    if (e2) throw e2;

    return ok({
      success: true,
      count: imageUrls.length,
      image_urls: imageUrls,
      errors: errors.length ? errors : undefined,
      duration_ms: Date.now() - startedAt,
    });
  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
