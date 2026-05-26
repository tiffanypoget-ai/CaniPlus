// supabase/functions/fetch-scientific-sources/index.ts
// -----------------------------------------------------------------------------
// Récupère 2-5 sources scientifiques pertinentes pour un thème éditorial.
//
// Interroge en parallèle :
//   - Semantic Scholar Graph API (gratuit, 100 req/5min, large couverture)
//   - PubMed E-utilities (gratuit, focus médical/vétérinaire/comportemental)
//
// Fusionne, dédoublonne par DOI/titre, filtre les < 10 ans, retourne 5 max.
//
// Le résultat est passé à Claude (propose-editorial-themes et
// generate-editorial-bundle) qui décide s'il les cite ou pas selon la
// pertinence du thème. Pas obligatoire pour les sujets légers.
//
// Auth : admin_password OU appelé en interne via service role
//        (par les autres edge functions).
//
// Variables d'environnement :
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (auto)
//   ADMIN_PASSWORD
//   PUBMED_API_KEY (optionnel — augmente la limite de 3/s à 10/s)
//   SEMANTIC_SCHOLAR_API_KEY (optionnel — non requis pour la lecture publique)
// -----------------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function ok(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
function fail(message: string, status = 400) { return ok({ error: message }, status); }

// ── Types ──────────────────────────────────────────────────────────────────
type Source = {
  title: string;
  authors: string[];         // ["John Doe", "Jane Smith"]
  year: number | null;
  doi: string | null;
  url: string;
  abstract_excerpt: string | null;
  source: 'semantic_scholar' | 'pubmed';
};

// ── Helpers ────────────────────────────────────────────────────────────────
function truncate(s: string | null | undefined, n: number): string | null {
  if (!s) return null;
  const cleaned = s.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= n) return cleaned;
  return cleaned.slice(0, n - 1).trim() + '…';
}

function normalizeTitle(s: string): string {
  return (s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// Traduction rapide FR → mots-clés EN pour interroger PubMed/Semantic Scholar
// (les bases scientifiques sont en anglais). Approximatif mais suffit pour
// retrouver les concepts comportementaux et vétérinaires.
function buildEnglishQuery(themeFr: string): string {
  const t = themeFr.toLowerCase();
  const dict: Array<[RegExp, string]> = [
    [/marche en laisse|tirer en laisse/,         'loose leash walking dog'],
    [/r[ée]activit[ée]/,                          'dog reactivity behavior'],
    [/peur|anxi[ée]t[ée]|stress/,                 'dog fear anxiety stress'],
    [/agressi/,                                   'dog aggression behavior'],
    [/aboiement/,                                 'dog barking behavior'],
    [/socialisation|chiot/,                       'puppy socialization development'],
    [/rappel|revenir au pied/,                    'dog recall training'],
    [/propret[ée]/,                               'puppy house training'],
    [/morsure|mordille/,                          'dog biting inhibition'],
    [/destruction|mastic/,                        'dog destructive chewing'],
    [/solitude|absence|s[ée]paration/,            'dog separation related behavior'],
    [/alimentation|nourriture|gamelle/,           'dog nutrition feeding behavior'],
    [/chaleur|canicule|[ée]t[ée]/,                'dog heat stress thermoregulation'],
    [/hiver|froid/,                               'dog cold weather welfare'],
    [/jeu|jouer/,                                 'dog play behavior welfare'],
    [/promenade|exercice/,                        'dog exercise welfare'],
    [/v[ée]t[ée]rinaire|sant[ée]/,                'dog veterinary health'],
    [/[ée]ducation|apprentissage|entrainement/,   'dog training learning operant'],
    [/r[ée]compense|renforcement/,                'positive reinforcement dog training'],
    [/communication|langage canin|signaux/,       'dog body language communication'],
    [/cohabit|deux chiens|multi/,                 'multi dog household behavior'],
    [/vieux chien|sen[iy]or/,                     'senior dog cognitive welfare'],
  ];
  for (const [rx, q] of dict) if (rx.test(t)) return q;
  // Fallback générique : on garde quelques mots significatifs + "dog"
  const words = t
    .replace(/[^a-zà-ÿ ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 4 && !['avec', 'pour', 'dans', 'comment', 'quand', 'votre', 'mon'].includes(w))
    .slice(0, 4)
    .join(' ');
  return `${words} dog behavior`.trim();
}

// ── Semantic Scholar ───────────────────────────────────────────────────────
async function fetchSemanticScholar(query: string, limit = 8): Promise<Source[]> {
  const url = new URL('https://api.semanticscholar.org/graph/v1/paper/search');
  url.searchParams.set('query', query);
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('fields', 'title,authors,year,externalIds,abstract,url,openAccessPdf,venue');
  // 10 dernières années pour rester pertinent
  const minYear = new Date().getFullYear() - 10;
  url.searchParams.set('year', `${minYear}-`);

  const apiKey = Deno.env.get('SEMANTIC_SCHOLAR_API_KEY') ?? '';
  const headers: Record<string, string> = { 'User-Agent': 'CaniPlus/1.0 (contact@caniplus.ch)' };
  if (apiKey) headers['x-api-key'] = apiKey;

  try {
    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      console.warn(`[semantic_scholar] HTTP ${res.status} on query="${query}"`);
      return [];
    }
    const data = await res.json();
    const papers = Array.isArray(data?.data) ? data.data : [];
    return papers.map((p: any): Source => {
      const doi = p?.externalIds?.DOI ?? null;
      const semanticId = p?.paperId;
      return {
        title: String(p?.title ?? '').trim(),
        authors: (p?.authors ?? []).map((a: any) => a?.name).filter(Boolean).slice(0, 6),
        year: typeof p?.year === 'number' ? p.year : null,
        doi,
        url: doi
          ? `https://doi.org/${doi}`
          : (p?.openAccessPdf?.url ?? p?.url ?? (semanticId ? `https://www.semanticscholar.org/paper/${semanticId}` : '')),
        abstract_excerpt: truncate(p?.abstract, 400),
        source: 'semantic_scholar',
      };
    }).filter((s: Source) => s.title);
  } catch (e) {
    console.warn(`[semantic_scholar] fetch error: ${(e as Error).message}`);
    return [];
  }
}

// ── PubMed ─────────────────────────────────────────────────────────────────
// Deux étapes :
//   1. ESearch : récupère les PMIDs correspondant à la requête.
//   2. ESummary : récupère les métadonnées des papiers.
async function fetchPubMed(query: string, limit = 8): Promise<Source[]> {
  const apiKey = Deno.env.get('PUBMED_API_KEY') ?? '';
  const minDate = `${new Date().getFullYear() - 10}/01/01`;
  const maxDate = `${new Date().getFullYear()}/12/31`;

  // 1. ESearch
  const searchUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi');
  searchUrl.searchParams.set('db', 'pubmed');
  searchUrl.searchParams.set('term', query);
  searchUrl.searchParams.set('retmode', 'json');
  searchUrl.searchParams.set('retmax', String(limit));
  searchUrl.searchParams.set('sort', 'relevance');
  searchUrl.searchParams.set('datetype', 'pdat');
  searchUrl.searchParams.set('mindate', minDate);
  searchUrl.searchParams.set('maxdate', maxDate);
  if (apiKey) searchUrl.searchParams.set('api_key', apiKey);

  let pmids: string[] = [];
  try {
    const r = await fetch(searchUrl.toString());
    if (!r.ok) {
      console.warn(`[pubmed] esearch HTTP ${r.status} on query="${query}"`);
      return [];
    }
    const d = await r.json();
    pmids = d?.esearchresult?.idlist ?? [];
  } catch (e) {
    console.warn(`[pubmed] esearch error: ${(e as Error).message}`);
    return [];
  }
  if (pmids.length === 0) return [];

  // 2. ESummary
  const summaryUrl = new URL('https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi');
  summaryUrl.searchParams.set('db', 'pubmed');
  summaryUrl.searchParams.set('id', pmids.join(','));
  summaryUrl.searchParams.set('retmode', 'json');
  if (apiKey) summaryUrl.searchParams.set('api_key', apiKey);

  try {
    const r = await fetch(summaryUrl.toString());
    if (!r.ok) {
      console.warn(`[pubmed] esummary HTTP ${r.status}`);
      return [];
    }
    const d = await r.json();
    const results: Source[] = [];
    const items = d?.result ?? {};
    for (const pmid of pmids) {
      const it = items[pmid];
      if (!it) continue;
      const title = String(it?.title ?? '').replace(/\.$/, '').trim();
      if (!title) continue;
      const year = (() => {
        const yr = it?.pubdate ? Number(String(it.pubdate).slice(0, 4)) : null;
        return Number.isFinite(yr ?? NaN) ? yr : null;
      })();
      const authors = (it?.authors ?? []).map((a: any) => a?.name).filter(Boolean).slice(0, 6);
      const articleIds = it?.articleids ?? [];
      const doiEntry = articleIds.find((x: any) => x?.idtype === 'doi');
      const doi = doiEntry?.value ?? null;
      results.push({
        title,
        authors,
        year,
        doi,
        url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        abstract_excerpt: null, // ESummary ne renvoie pas l'abstract complet
        source: 'pubmed',
      });
    }
    return results;
  } catch (e) {
    console.warn(`[pubmed] esummary error: ${(e as Error).message}`);
    return [];
  }
}

// ── Fusion + dédoublonnage ────────────────────────────────────────────────
function mergeAndDedupe(lists: Source[][], maxOut: number): Source[] {
  const seen = new Set<string>();
  const out: Source[] = [];

  // On entrelace les listes pour favoriser la diversité (1 Semantic, 1 PubMed, …)
  const maxLen = Math.max(...lists.map(l => l.length), 0);
  for (let i = 0; i < maxLen; i++) {
    for (const list of lists) {
      const s = list[i];
      if (!s) continue;
      const key = s.doi ? `doi:${s.doi.toLowerCase()}` : `t:${normalizeTitle(s.title)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
      if (out.length >= maxOut) return out;
    }
  }
  return out;
}

// ── Handler ────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({} as any));
    const {
      theme,
      admin_password,
      service_role_call,
      max_results = 5,
      english_query: forcedEnQuery,
    } = body ?? {};

    // Auth : soit admin_password, soit appel interne authentifié
    // (le bearer service_role est vérifié par Supabase Functions en amont).
    const expectedAdmin = Deno.env.get('ADMIN_PASSWORD') ?? '';
    const auth = req.headers.get('authorization') ?? '';
    const isServiceCall = service_role_call === true && auth.startsWith('Bearer ');
    const isAdmin = !!admin_password && admin_password === expectedAdmin;
    if (!isServiceCall && !isAdmin) {
      return fail('Authentification requise.', 401);
    }

    if (!theme || typeof theme !== 'string') {
      return fail('Paramètre `theme` manquant.', 400);
    }
    const cleanMax = Math.min(Math.max(Number(max_results) || 5, 1), 10);

    const enQuery = (typeof forcedEnQuery === 'string' && forcedEnQuery.trim())
      ? forcedEnQuery.trim()
      : buildEnglishQuery(theme);

    const [ss, pm] = await Promise.all([
      fetchSemanticScholar(enQuery, Math.ceil(cleanMax * 1.5)),
      fetchPubMed(enQuery, Math.ceil(cleanMax * 1.5)),
    ]);

    const merged = mergeAndDedupe([ss, pm], cleanMax);

    return ok({
      theme,
      english_query: enQuery,
      total_found: { semantic_scholar: ss.length, pubmed: pm.length },
      sources: merged,
    });

  } catch (e) {
    return fail(`Erreur serveur : ${(e as Error).message}`, 500);
  }
});
