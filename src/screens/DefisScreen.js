// src/screens/DefisScreen.js
// Onglet « Défis » — mini-programmes gratuits et guidés sur plusieurs jours.
//
// Parcours : liste des défis → écran d'accueil (promesse + « Je commence »)
// → chemin des jours (jours passés cochés, jour courant en avant, suivants
// verrouillés — déblocage quotidien : le jour N+1 s'ouvre le lendemain, heure
// suisse) → écran d'un jour (objectif, exercice, astuces, validation avec
// petite célébration, partage natif optionnel et jamais bloquant) → écran de
// fin avec la récompense : 1 mois de premium offert (via claim-defi-reward,
// réservé aux personnes jamais abonnées), puis 10 CHF/mois résiliable.
//
// Contenu 100 % en base (tables defis / defi_jours / defi_progression) :
// rien n'est codé en dur, plusieurs défis peuvent coexister.
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { usePremium } from '../hooks/usePremium';
import { useCloseOnBack } from '../hooks/useCloseOnBack';
import Icon from '../components/Icons';

import { activateOnKey } from '../lib/a11y';
const BLUE = '#2BABE1';
const BLUE_DARK = '#1a8bbf';
const BEIGE = '#F5E6D3';
const ANTHRACITE = '#2C3E50';
const ORANGE = '#E67E22';

// Jour calendaire suisse (YYYY-MM-DD) — sert au déblocage quotidien
const zurichDay = (d) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });

const ENCOURAGEMENTS = [
  'Bien joué, continue comme ça !',
  'Ton chien peut être fier de toi.',
  'Encore une étape de franchie !',
  'Le calme s’installe, jour après jour.',
  'Superbe régularité, ça paie !',
];

const fmtDate = (d) => new Date(d).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

export default function DefisScreen({ onNavigate }) {
  const { user, profile } = useAuth();
  const { isPremium } = usePremium();

  const [defis, setDefis] = useState([]);
  const [progressions, setProgressions] = useState({}); // defi_id → progression
  const [joursMap, setJoursMap] = useState({});          // defi_id → [jours]
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [selected, setSelected] = useState(null);        // défi ouvert
  const [openJour, setOpenJour] = useState(null);        // numéro du jour ouvert
  const [validating, setValidating] = useState(false);
  const [celebration, setCelebration] = useState(null);  // { jour, allDone }
  const [toast, setToast] = useState(null);

  const [claimStep, setClaimStep] = useState(null);      // null | 'confirm'
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState(null);

  // Bouton retour du téléphone : ferme d'abord le jour ouvert, puis le défi,
  // avant de changer d'onglet (l'ordre d'enregistrement fait la pile).
  useCloseOnBack(!!selected, () => { setSelected(null); setClaimStep(null); setClaimError(null); });
  useCloseOnBack(openJour != null, () => setOpenJour(null));

  // ── Chargement ──────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Pas de filtre statut ici : la RLS montre les défis actifs à tout le
    // monde, les brouillons aux admins, et les défis ARCHIVÉS uniquement aux
    // personnes qui y ont une progression (récompense réclamable même après
    // archivage). Le filtre d'affichage se fait plus bas, progression connue.
    const [{ data, error }, progsRes] = await Promise.all([
      supabase.from('defis').select('*').order('created_at', { ascending: true }),
      user?.id
        ? supabase.from('defi_progression').select('*').eq('user_id', user.id)
        : Promise.resolve({ data: [] }),
    ]);
    if (error) {
      setLoadError('Erreur de chargement. Réessaie plus tard.');
      setLoading(false);
      return;
    }
    const map = {};
    (progsRes.data ?? []).forEach(p => { map[p.defi_id] = p; });
    setProgressions(map);
    // Un défi archivé n'apparaît que si on y a une progression
    setDefis((data ?? []).filter(d => d.statut !== 'archive' || map[d.id]));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  // Jours du défi ouvert (avec petit cache par défi)
  useEffect(() => {
    if (!selected || joursMap[selected.id]) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from('defi_jours')
        .select('*')
        .eq('defi_id', selected.id)
        .order('jour', { ascending: true });
      if (alive) setJoursMap(m => ({ ...m, [selected.id]: data ?? [] }));
    })();
    return () => { alive = false; };
  }, [selected?.id]); // eslint-disable-line

  // Marquage de la récompense : handleClaim note dans localStorage QUEL défi
  // part vers Stripe ; au retour, si le premium est devenu actif, on pose
  // reward_claimed_at sur CE défi uniquement (stats admin + affichage
  // « activée »). Jamais de marquage pour un premium venu d'ailleurs
  // (abonnement payant classique), jamais de cascade sur d'autres défis.
  const PENDING_CLAIM_KEY = 'defi_reward_pending';
  useEffect(() => {
    if (!isPremium || !user?.id) return;
    let pendingId = null;
    try { pendingId = localStorage.getItem(PENDING_CLAIM_KEY); } catch { return; }
    if (!pendingId) return;
    const prog = progressions[pendingId];
    if (!prog) return; // progressions pas encore chargées : on retentera au prochain rendu
    try { localStorage.removeItem(PENDING_CLAIM_KEY); } catch {}
    if (!prog.completed_at || prog.reward_claimed_at) return;
    (async () => {
      const claimedAt = new Date().toISOString();
      await supabase.from('defi_progression')
        .update({ reward_claimed_at: claimedAt })
        .eq('id', prog.id);
      setProgressions(m => ({ ...m, [pendingId]: { ...m[pendingId], reward_claimed_at: claimedAt } }));
    })();
  }, [isPremium, user?.id, progressions]); // eslint-disable-line

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  // La photo choisie ne survit pas au changement de jour ou de défi
  useEffect(() => { clearShareFile(); }, [openJour, selected?.id]); // eslint-disable-line

  // ── Logique de progression ──────────────────────────────────────────────
  const progOf = (defi) => progressions[defi.id] ?? null;
  const completedCount = (prog) => Object.keys(prog?.jours_completes ?? {}).length;

  // 'done' | 'current' (déverrouillé, à faire) | 'tomorrow' (demain) | 'locked'
  const dayState = (defi, n) => {
    const prog = progOf(defi);
    if (!prog) return n === 1 ? 'current' : 'locked';
    const jc = prog.jours_completes ?? {};
    if (jc[n]) return 'done';
    if (n === 1) return 'current';
    const prev = jc[n - 1];
    if (!prev) return 'locked';
    return zurichDay(prev) < zurichDay(new Date()) ? 'current' : 'tomorrow';
  };

  const handleStart = async (defi) => {
    if (!user || progOf(defi) || defi.statut === 'archive') return;
    const { data, error } = await supabase
      .from('defi_progression')
      .insert({ user_id: user.id, defi_id: defi.id })
      .select('*')
      .single();
    if (error || !data) { setToast('Impossible de démarrer. Réessaie.'); return; }
    setProgressions(m => ({ ...m, [defi.id]: data }));
    setOpenJour(1);
  };

  const handleValidate = async (defi, n) => {
    const prog = progOf(defi);
    if (!prog || validating) return;
    setValidating(true);
    const jc = { ...(prog.jours_completes ?? {}), [n]: new Date().toISOString() };
    const allDone = Array.from({ length: defi.duree_jours }, (_, i) => i + 1).every(k => jc[k]);
    const patch = { jours_completes: jc, ...(allDone ? { completed_at: new Date().toISOString() } : {}) };
    const { error } = await supabase.from('defi_progression').update(patch).eq('id', prog.id);
    setValidating(false);
    if (error) { setToast('Erreur, réessaie.'); return; }
    setProgressions(m => ({ ...m, [defi.id]: { ...prog, ...patch } }));
    setCelebration({ jour: n, allDone });
  };

  // ── Partage natif — optionnel, jamais bloquant ──────────────────────────
  const shareFileRef = useRef(null);

  const handleShare = async (text) => {
    if (!text) return 'none';
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return 'shared';
      }
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setToast('Texte copié : colle-le où tu veux !');
        return 'copied';
      }
    } catch { return 'cancelled'; /* partage annulé : on n'insiste pas */ }
    setToast('Partage indisponible sur ce navigateur.');
    return 'none';
  };

  // Partage avec photo (Web Share niveau 2), en DEUX temps : on choisit la
  // photo (aperçu), PUIS on tape « Partager ». Appeler navigator.share()
  // directement à la fermeture du sélecteur de fichier échoue sur mobile
  // (le geste utilisateur est consommé par le sélecteur) — c'est pour ça que
  // seul le texte partait. Le bouton « Partager » fournit un geste frais.
  const [shareFile, setShareFile] = useState(null);       // File choisi
  const [sharePreview, setSharePreview] = useState(null); // URL d'aperçu

  const clearShareFile = () => {
    if (sharePreview) URL.revokeObjectURL(sharePreview);
    setShareFile(null);
    setSharePreview(null);
  };

  const handlePhotoPicked = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (sharePreview) URL.revokeObjectURL(sharePreview);
    setShareFile(file);
    setSharePreview(URL.createObjectURL(file));
  };

  const handleSharePhoto = async (jour) => {
    if (!shareFile) return;
    const text = jour?.partage_texte || '';
    if (!(navigator.canShare && navigator.canShare({ files: [shareFile] }))) {
      // Ce navigateur ne sait pas partager de fichier : texte seul
      // (handleShare affiche lui-même le toast adapté au résultat)
      await handleShare(text);
      return;
    }
    // Beaucoup d'apps (Instagram…) ignorent le texte joint à une image :
    // on le copie d'avance pour pouvoir le coller dans la publication.
    try { await navigator.clipboard?.writeText(text); } catch { /* pas grave */ }
    try {
      await navigator.share({ files: [shareFile], text });
      setToast('Le texte est copié : colle-le dans ta publication !');
      clearShareFile();
    } catch { /* partage annulé : on garde la photo pour réessayer */ }
  };

  const handleCopyShareText = async (text) => {
    if (!text) return;
    try {
      await navigator.clipboard?.writeText(text);
      setToast('Texte copié !');
    } catch { /* clipboard indispo */ }
  };

  // ── Récompense (mois offert) ────────────────────────────────────────────
  // Éligible = n'a JAMAIS été abonné·e premium (vérifié aussi côté serveur).
  const neverPremium = !profile?.premium_until && !profile?.stripe_customer_id;

  const handleClaim = async (defi) => {
    if (claimLoading) return;
    setClaimLoading(true);
    setClaimError(null);
    try {
      const { data, error } = await supabase.functions.invoke('claim-defi-reward', {
        body: { defi_id: defi.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        // Mémorise QUEL défi part vers Stripe : au retour, si le premium est
        // actif, seul ce défi sera marqué reward_claimed_at.
        try { localStorage.setItem(PENDING_CLAIM_KEY, defi.id); } catch {}
        window.location.href = data.url;
        return;
      }
      throw new Error('Lien d’activation non reçu');
    } catch (e) {
      setClaimError(e?.message || 'Erreur. Réessaie dans quelques secondes.');
      setClaimLoading(false);
    }
  };

  // ── Styles partagés ─────────────────────────────────────────────────────
  const cardStyle = {
    background: '#fff', borderRadius: 16, padding: 18,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginBottom: 12,
  };
  const primaryBtnStyle = {
    width: '100%', padding: '14px 20px', border: 'none', borderRadius: 14,
    background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`, color: '#fff',
    fontSize: 15, fontWeight: 800, cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(43,171,225,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };
  const backBtnStyle = {
    background: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px',
    fontSize: 13, fontWeight: 700, color: '#1F1F20', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 6,
    boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 14,
  };
  const screenWrapStyle = {
    flex: 1, minHeight: 0, overflowY: 'scroll',
    WebkitOverflowScrolling: 'touch', background: '#f7fafc',
  };

  // ── Toast + célébration (overlays communs à toutes les vues) ────────────
  const overlays = (
    <>
      {toast && (
        <div style={{ position: 'fixed', bottom: 96, left: '50%', transform: 'translateX(-50%)', background: ANTHRACITE, color: '#fff', fontSize: 13, fontWeight: 700, padding: '10px 18px', borderRadius: 12, zIndex: 400, boxShadow: '0 4px 20px rgba(0,0,0,0.25)', whiteSpace: 'nowrap' }}>
          {toast}
        </div>
      )}

      {celebration && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(31,31,32,0.82)', zIndex: 350, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 24, padding: '32px 24px', maxWidth: 340, width: '100%', textAlign: 'center', animation: 'defiPop 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{
              width: 88, height: 88, borderRadius: '50%', margin: '0 auto 16px',
              background: celebration.allDone
                ? `linear-gradient(135deg, ${ORANGE}, #d35400)`
                : 'linear-gradient(135deg, #16a34a, #15803d)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: celebration.allDone ? '0 8px 32px rgba(230,126,34,0.4)' : '0 8px 32px rgba(22,163,74,0.4)',
              animation: 'defiPop 0.55s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <Icon name={celebration.allDone ? 'trophy' : 'check'} size={44} color="#fff" />
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#1F1F20', marginBottom: 6 }}>
              {celebration.allDone ? 'Défi terminé !' : `Jour ${celebration.jour} validé !`}
            </div>
            <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5, marginBottom: 20 }}>
              {celebration.allDone
                ? 'Tu es allée au bout. Ta récompense t’attend.'
                : ENCOURAGEMENTS[(celebration.jour - 1) % ENCOURAGEMENTS.length]}
            </div>
            <button
              onClick={() => { const done = celebration.allDone; setCelebration(null); setOpenJour(null); if (done) setClaimError(null); }}
              style={{ ...primaryBtnStyle, ...(celebration.allDone ? { background: `linear-gradient(135deg, ${ORANGE}, #d35400)`, boxShadow: '0 4px 14px rgba(230,126,34,0.35)' } : {}) }}
            >
              {celebration.allDone ? 'Découvrir ma récompense' : 'Continuer'}
            </button>
          </div>
          <style>{`@keyframes defiPop { from { transform: scale(0.7); opacity: 0 } to { transform: scale(1); opacity: 1 } }`}</style>
        </div>
      )}
    </>
  );

  // ════════════════════════ Vue jour ════════════════════════
  if (selected && openJour != null) {
    const defi = selected;
    const jours = joursMap[defi.id] ?? [];
    const jour = jours.find(j => j.jour === openJour);
    const state = dayState(defi, openJour);
    const astuces = (jour?.astuces ?? '').split('\n').map(s => s.trim()).filter(Boolean);

    return (
      <div style={screenWrapStyle} className="screen-content">
        <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 100px' }}>
          <button onClick={() => setOpenJour(null)} style={backBtnStyle}>
            <Icon name="arrowLeft" size={14} color="#1F1F20" /> Le parcours
          </button>

          {!jour ? (
            <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>
          ) : (
            <>
              {/* En-tête du jour */}
              <div style={{ ...cardStyle, background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: BLUE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                  <Icon name="trophy" size={12} color={BLUE} /> Jour {jour.jour} sur {defi.duree_jours}
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>{jour.titre}</div>
                {state === 'done' && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(34,197,94,0.2)', color: '#4ade80', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, marginTop: 10 }}>
                    <Icon name="check" size={12} color="#4ade80" /> Jour validé
                  </div>
                )}
              </div>

              {/* Objectif */}
              {jour.objectif && (
                <div style={cardStyle}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: BLUE_DARK, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <Icon name="star" size={12} color={BLUE_DARK} /> L'objectif du jour
                  </div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>{jour.objectif}</div>
                </div>
              )}

              {/* Exercice */}
              {jour.exercice && (
                <div style={cardStyle}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: BLUE_DARK, textTransform: 'uppercase', letterSpacing: 1 }}>
                      <Icon name="paw" size={12} color={BLUE_DARK} /> L'exercice
                    </div>
                    <span style={{ background: '#e8f7fd', color: BLUE_DARK, fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="clock" size={11} color={BLUE_DARK} /> 5 à 10 min
                    </span>
                  </div>
                  <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{jour.exercice}</div>
                </div>
              )}

              {/* Il n'y arrive pas ? */}
              {astuces.length > 0 && (
                <div style={{ ...cardStyle, background: BEIGE }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#a05a1f', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
                    <Icon name="info" size={12} color="#a05a1f" /> Il n'y arrive pas ? (sans dire un mot)
                  </div>
                  {astuces.map((a, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: i < astuces.length - 1 ? 8 : 0 }}>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: ORANGE, marginTop: 7, flexShrink: 0 }} />
                      <div style={{ fontSize: 13.5, color: ANTHRACITE, lineHeight: 1.6 }}>{a}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Conseil */}
              {jour.conseil && (
                <div style={{ ...cardStyle, background: '#e8f7fd', border: `1px solid rgba(43,171,225,0.25)` }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: BLUE_DARK, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <Icon name="sparkle" size={12} color={BLUE_DARK} /> Le conseil en plus
                  </div>
                  <div style={{ fontSize: 13.5, color: ANTHRACITE, lineHeight: 1.6 }}>{jour.conseil}</div>
                </div>
              )}

              {/* Validation */}
              {state === 'done' ? (
                <div style={{ ...cardStyle, textAlign: 'center', background: '#dcfce7' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: '#16a34a', fontSize: 14, fontWeight: 800 }}>
                    <Icon name="checkCircle" size={18} color="#16a34a" /> Exercice validé, bravo !
                  </div>
                </div>
              ) : state === 'current' ? (
                <button onClick={() => handleValidate(defi, jour.jour)} disabled={validating} style={{ ...primaryBtnStyle, opacity: validating ? 0.7 : 1, marginBottom: 12 }}>
                  <Icon name="check" size={18} color="#fff" /> {validating ? 'Validation…' : 'J’ai fait l’exercice'}
                </button>
              ) : (
                <div style={{ ...cardStyle, textAlign: 'center', color: '#6b7280', fontSize: 13, lineHeight: 1.5 }}>
                  <Icon name="lock" size={20} color="#9ca3af" />
                  <div style={{ marginTop: 6 }}>
                    {state === 'tomorrow'
                      ? 'Ce jour s’ouvre demain. Un exercice par jour, c’est le secret du défi.'
                      : 'Valide d’abord les jours précédents pour débloquer celui-ci.'}
                  </div>
                </div>
              )}

              {/* Partage — optionnel, jamais bloquant */}
              {jour.partage_texte && (
                <div style={cardStyle}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                    <Icon name="send" size={12} color="#6b7280" /> Envie de partager ce moment ?
                  </div>
                  <div style={{ fontSize: 12.5, color: '#6b7280', lineHeight: 1.5, marginBottom: 12 }}>
                    {jour.partage_invite || 'Partage ta réussite du jour.'} Totalement optionnel !
                  </div>

                  {/* Texte pré-rempli, copiable en un geste */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f4f6f8', borderRadius: 12, padding: '10px 12px', marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: '#374151', lineHeight: 1.5, fontStyle: 'italic' }}>
                      « {jour.partage_texte} »
                    </div>
                    <button
                      onClick={() => handleCopyShareText(jour.partage_texte)}
                      style={{ background: '#fff', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: 10, padding: '7px 10px', fontSize: 11, fontWeight: 800, cursor: 'pointer', flexShrink: 0 }}
                    >
                      Copier
                    </button>
                  </div>

                  {sharePreview ? (
                    <>
                      {/* Aperçu de la photo choisie, puis partage sur un tap direct */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                        <img src={sharePreview} alt="Photo à partager" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 12, flexShrink: 0 }} />
                        <div style={{ flex: 1, fontSize: 12.5, color: '#374151', lineHeight: 1.5 }}>
                          Ta photo est prête ! Elle sera partagée avec le texte du jour.
                        </div>
                        <button
                          onClick={clearShareFile}
                          aria-label="Retirer la photo"
                          style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                        >
                          <Icon name="close" size={13} color="#6b7280" />
                        </button>
                      </div>
                      <button
                        onClick={() => handleSharePhoto(jour)}
                        style={{ width: '100%', background: `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})`, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 14px rgba(43,171,225,0.35)' }}
                      >
                        <Icon name="send" size={14} color="#fff" /> Partager la photo
                      </button>
                    </>
                  ) : (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => shareFileRef.current?.click()}
                        style={{ flex: 1.4, background: '#e8f7fd', color: BLUE_DARK, border: 'none', borderRadius: 12, padding: '11px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Icon name="upload" size={13} color={BLUE_DARK} /> Choisir une photo
                      </button>
                      <button
                        onClick={() => handleShare(jour.partage_texte)}
                        style={{ flex: 1, background: '#f4f6f8', color: '#374151', border: 'none', borderRadius: 12, padding: '11px 12px', fontSize: 12.5, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Icon name="send" size={13} color="#374151" /> Texte seul
                      </button>
                    </div>
                  )}
                  <input
                    ref={shareFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoPicked}
                    style={{ display: 'none' }}
                  />
                </div>
              )}
            </>
          )}
        </div>
        {overlays}
      </div>
    );
  }

  // ════════════════════════ Vue défi (accueil / parcours / fin) ════════════
  if (selected) {
    const defi = selected;
    const prog = progOf(defi);
    const jours = joursMap[defi.id] ?? [];
    const isCompleted = !!prog?.completed_at;
    const doneCount = completedCount(prog);
    const rewardClaimed = !!prog?.reward_claimed_at;
    const firstChargeDate = new Date(Date.now() + 30 * 86400000);

    return (
      <div style={screenWrapStyle} className="screen-content">
        <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 100px' }}>
          <button onClick={() => { setSelected(null); setClaimStep(null); setClaimError(null); }} style={backBtnStyle}>
            <Icon name="arrowLeft" size={14} color="#1F1F20" /> Les défis
          </button>

          {/* Bandeau du défi */}
          <div style={{
            borderRadius: 20, padding: 22, marginBottom: 14, color: '#fff',
            background: defi.image_url
              ? `linear-gradient(135deg, rgba(31,31,32,0.85), rgba(42,58,74,0.85)), url(${defi.image_url}) center/cover no-repeat`
              : 'linear-gradient(135deg, #1F1F20, #2a3a4a)',
          }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: BLUE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>
              <Icon name="trophy" size={13} color={BLUE} /> Défi CaniPlus · {defi.duree_jours} jours
            </div>
            <div style={{ fontSize: 21, fontWeight: 900, lineHeight: 1.25 }}>{defi.titre}</div>
            {defi.statut !== 'actif' && (
              <span style={{ display: 'inline-block', background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, marginTop: 10 }}>
                {defi.statut === 'archive' ? 'Défi terminé · plus proposé aux nouvelles participantes' : 'Brouillon · visible par toi seule'}
              </span>
            )}
            {prog && !isCompleted && (
              <div style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
                  <span>Ta progression</span><span>{doneCount}/{defi.duree_jours} jours</span>
                </div>
                <div style={{ height: 8, borderRadius: 99, background: 'rgba(255,255,255,0.15)' }}>
                  <div style={{ height: 8, borderRadius: 99, width: `${Math.round((doneCount / defi.duree_jours) * 100)}%`, background: `linear-gradient(90deg, ${BLUE}, #6fd0f5)`, transition: 'width 0.4s' }} />
                </div>
              </div>
            )}
          </div>

          {/* ── Pas encore commencé : promesse + bouton ── */}
          {!prog && (
            <>
              {defi.description && (
                <div style={cardStyle}>
                  <div style={{ fontSize: 14.5, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{defi.description}</div>
                </div>
              )}
              <div style={{ ...cardStyle, display: 'flex', gap: 12, alignItems: 'center', background: BEIGE }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="sparkle" size={20} color={ORANGE} />
                </div>
                <div style={{ fontSize: 13, color: ANTHRACITE, lineHeight: 1.55 }}>
                  <strong>À la clé :</strong> {defi.recompense_texte || 'une belle surprise à la fin du défi.'}
                </div>
              </div>
              <div style={{ ...cardStyle, display: 'flex', gap: 16, justifyContent: 'center' }}>
                {[
                  { icon: 'calendar', text: `${defi.duree_jours} jours` },
                  { icon: 'clock', text: '5-10 min/jour' },
                  { icon: 'heart', text: 'En douceur' },
                ].map(b => (
                  <div key={b.text} style={{ fontSize: 12, color: '#6b7280', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Icon name={b.icon} size={13} color={BLUE_DARK} /> {b.text}
                  </div>
                ))}
              </div>
              {defi.statut === 'archive' ? (
                <div style={{ ...cardStyle, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
                  Ce défi est terminé : il n'accepte plus de nouvelles participantes.
                </div>
              ) : (
                <button onClick={() => handleStart(defi)} style={primaryBtnStyle}>
                  <Icon name="paw" size={17} color="#fff" /> Je commence le défi
                </button>
              )}
            </>
          )}

          {/* ── Défi terminé : félicitations + récompense ── */}
          {prog && isCompleted && (
            <>
              <div style={{ ...cardStyle, textAlign: 'center', padding: '28px 20px' }}>
                <div style={{ width: 84, height: 84, borderRadius: '50%', margin: '0 auto 14px', background: `linear-gradient(135deg, ${ORANGE}, #d35400)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(230,126,34,0.35)' }}>
                  <Icon name="trophy" size={40} color="#fff" />
                </div>
                <div style={{ fontSize: 20, fontWeight: 900, color: '#1F1F20', marginBottom: 8 }}>
                  {defi.fin_titre || 'Bravo, défi réussi !'}
                </div>
                {defi.fin_texte && (
                  <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.65 }}>{defi.fin_texte}</div>
                )}
              </div>

              {/* Récompense */}
              {defi.recompense_type === 'premium_trial_30j' && (
                <div style={{ ...cardStyle, border: `2px solid ${ORANGE}`, background: 'linear-gradient(180deg, #fff8f1, #fff)' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: ORANGE, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                    <Icon name="sparkle" size={13} color={ORANGE} /> Ta récompense
                  </div>
                  <div style={{ fontSize: 17, fontWeight: 900, color: '#1F1F20', marginBottom: 6 }}>1 mois de Premium offert</div>
                  <div style={{ fontSize: 13.5, color: '#4b5563', lineHeight: 1.6, marginBottom: 14 }}>
                    {defi.recompense_texte || 'Toutes les ressources premium, offertes pendant 1 mois. Puis 10 CHF/mois, résiliable à tout moment.'}
                  </div>

                  {rewardClaimed ? (
                    <div style={{ background: '#dcfce7', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="checkCircle" size={18} color="#16a34a" />
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#166534' }}>
                        Ton mois offert est activé. Profite de toutes les ressources !
                      </div>
                    </div>
                  ) : isPremium ? (
                    <div style={{ background: '#e8f7fd', borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Icon name="sparkle" size={18} color={BLUE_DARK} />
                      <div style={{ fontSize: 13, fontWeight: 700, color: '#0c4a6e' }}>
                        Tu profites déjà du premium : le mois offert est réservé aux nouvelles abonnées, mais toutes nos félicitations pour ton défi !
                      </div>
                    </div>
                  ) : !neverPremium ? (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#4b5563', lineHeight: 1.55 }}>
                      Le mois offert est réservé aux personnes qui n'ont jamais été abonnées. Tu peux retrouver le premium quand tu veux depuis ton Profil. Et bravo pour ton défi !
                    </div>
                  ) : claimStep !== 'confirm' ? (
                    <button onClick={() => { setClaimStep('confirm'); setClaimError(null); }} style={{ ...primaryBtnStyle, background: `linear-gradient(135deg, ${ORANGE}, #d35400)`, boxShadow: '0 4px 14px rgba(230,126,34,0.35)' }}>
                      <Icon name="sparkle" size={16} color="#fff" /> Activer mon mois offert
                    </button>
                  ) : (
                    <>
                      {/* Écran de conformité : conditions claires AVANT l'enregistrement de la carte */}
                      <div style={{ background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 14, padding: 16, marginBottom: 12 }}>
                        <div style={{ fontSize: 14, fontWeight: 900, color: '#1F1F20', marginBottom: 10 }}>
                          Gratuit pendant 1 mois, puis 10 CHF/mois, résiliable à tout moment
                        </div>
                        {[
                          { icon: 'creditCard', text: 'Ta carte est enregistrée aujourd’hui, mais rien n’est prélevé pendant 30 jours.' },
                          { icon: 'calendar', text: `Premier prélèvement de 10 CHF le ${fmtDate(firstChargeDate)}, puis chaque mois.` },
                          { icon: 'mail', text: 'On t’envoie un email de rappel 1 semaine avant la fin du mois offert.' },
                          { icon: 'unlock', text: 'Pour annuler avant (ou après) : Profil → Accès premium → Résilier l’abonnement. Aucun frais.' },
                        ].map((l, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: i < 3 ? 10 : 0 }}>
                            <Icon name={l.icon} size={15} color={BLUE_DARK} />
                            <div style={{ fontSize: 12.5, color: '#374151', lineHeight: 1.5, flex: 1 }}>{l.text}</div>
                          </div>
                        ))}
                      </div>
                      {claimError && (
                        <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                          <Icon name="warning" size={14} color="#dc2626" /> {claimError}
                        </div>
                      )}
                      <button onClick={() => handleClaim(defi)} disabled={claimLoading} style={{ ...primaryBtnStyle, background: `linear-gradient(135deg, ${ORANGE}, #d35400)`, boxShadow: '0 4px 14px rgba(230,126,34,0.35)', opacity: claimLoading ? 0.7 : 1, marginBottom: 8 }}>
                        {claimLoading ? 'Redirection vers l’activation…' : 'J’active mon mois offert'}
                      </button>
                      <button onClick={() => setClaimStep(null)} style={{ width: '100%', background: 'none', border: 'none', color: '#6b7280', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 8 }}>
                        Plus tard
                      </button>
                      <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 4 }}>
                        Paiement sécurisé par Stripe
                      </div>
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── Parcours des jours (chemin/étapes) ── */}
          {prog && (
            <div style={{ ...cardStyle, paddingBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>
                {isCompleted ? 'Ton parcours · à refaire quand tu veux' : 'Ton parcours'}
              </div>
              {(jours.length ? jours : Array.from({ length: defi.duree_jours }, (_, i) => ({ jour: i + 1, titre: '…' }))).map((j, idx, arr) => {
                const state = dayState(defi, j.jour);
                // Pas de clic tant que le contenu des jours n'est pas chargé
                // (sinon on ouvre un écran « Chargement… » sans issue).
                const clickable = (state === 'done' || state === 'current') && jours.length > 0;
                const nodeColor = state === 'done' ? '#16a34a' : state === 'current' ? BLUE : '#d1d5db';
                return (
                  <button type="button" key={j.jour} style={{ background: 'none', border: 0, padding: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%',  display: 'flex', gap: 14, cursor: clickable ? 'pointer' : 'default', opacity: state === 'locked' ? 0.55 : 1 }}
                    onClick={() => { if (clickable) setOpenJour(j.jour); }}>
                    {/* Colonne pastille + trait */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 44, flexShrink: 0 }}>
                      <div style={{
                        width: state === 'current' ? 44 : 38, height: state === 'current' ? 44 : 38,
                        borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: state === 'done' ? '#16a34a' : state === 'current' ? `linear-gradient(135deg, ${BLUE}, ${BLUE_DARK})` : '#f3f4f6',
                        boxShadow: state === 'current' ? '0 0 0 5px rgba(43,171,225,0.18), 0 4px 14px rgba(43,171,225,0.35)' : 'none',
                        transition: 'all 0.2s',
                      }}>
                        {state === 'done'
                          ? <Icon name="check" size={17} color="#fff" />
                          : state === 'current'
                            ? <span style={{ color: '#fff', fontWeight: 900, fontSize: 15 }}>{j.jour}</span>
                            : <Icon name="lock" size={14} color="#9ca3af" />}
                      </div>
                      {idx < arr.length - 1 && (
                        <div style={{ width: 3, flex: 1, minHeight: 18, borderRadius: 2, background: state === 'done' ? '#16a34a' : '#e5e7eb', margin: '4px 0' }} />
                      )}
                    </div>
                    {/* Contenu */}
                    <div style={{ flex: 1, minWidth: 0, paddingBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 800, color: nodeColor, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                        Jour {j.jour}
                      </div>
                      <div style={{ fontSize: 14.5, fontWeight: 700, color: state === 'locked' ? '#9ca3af' : '#1F1F20', marginTop: 2, lineHeight: 1.35 }}>
                        {j.titre}
                      </div>
                      {state === 'current' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: '#e8f7fd', color: BLUE_DARK, fontSize: 11.5, fontWeight: 800, padding: '3px 10px', borderRadius: 8 }}>
                          C'est ton jour ! <Icon name="arrowRight" size={11} color={BLUE_DARK} />
                        </div>
                      )}
                      {state === 'tomorrow' && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, background: BEIGE, color: '#a05a1f', fontSize: 11.5, fontWeight: 700, padding: '3px 10px', borderRadius: 8 }}>
                          <Icon name="clock" size={11} color="#a05a1f" /> Reviens demain
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {overlays}
      </div>
    );
  }

  // ════════════════════════ Vue liste ════════════════════════
  return (
    <div style={screenWrapStyle} className="screen-content">
      {/* Header — même dégradé que les autres onglets (Profil, Soirées…) */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 24, fontWeight: 800, color: '#fff' }}>
          <Icon name="trophy" size={24} color={ORANGE} /> Défis
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
          Des mini-programmes gratuits et guidés, quelques minutes par jour.
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>}
        {loadError && <div style={{ textAlign: 'center', color: '#ef4444', padding: 40 }}>{loadError}</div>}

        {!loading && !loadError && defis.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', background: '#fff', borderRadius: 16 }}>
            <Icon name="trophy" size={40} color="#d1d5db" />
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 12, color: '#4b5563' }}>Les premiers défis arrivent</div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Tiffany prépare le programme. Reviens bientôt !</div>
          </div>
        )}

        {defis.map(defi => {
          const prog = progOf(defi);
          const isCompleted = !!prog?.completed_at;
          const doneCount = completedCount(prog);
          return (
            <div
              key={defi.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelected(defi)}
              onKeyDown={activateOnKey(() => setSelected(defi))}
              style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.05)', cursor: 'pointer', marginBottom: 14 }}>
              {/* Visuel */}
              <div style={{
                height: 110, position: 'relative',
                // Couleur de fond derrière l'image : si l'URL ne charge pas,
                // la carte reste habillée au lieu d'un bloc blanc.
                background: defi.image_url
                  ? `#0E5A80 url(${defi.image_url}) center/cover no-repeat`
                  : `linear-gradient(135deg, ${BLUE}, #0E5A80)`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {!defi.image_url && <Icon name="trophy" size={40} color="rgba(255,255,255,0.85)" />}
                <span style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(31,31,32,0.75)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <Icon name="calendar" size={11} color="#fff" /> {defi.duree_jours} jours
                </span>
                {/* Badges empilés en colonne pour ne jamais se chevaucher
                    (un défi en brouillon peut aussi être « Réussi » côté admin) */}
                <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  {isCompleted && (
                    <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="check" size={11} color="#16a34a" /> Réussi
                    </span>
                  )}
                  {defi.statut !== 'actif' && (
                    <span style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8 }}>
                      {defi.statut === 'archive' ? 'Défi terminé' : 'Brouillon · visible par toi seule'}
                    </span>
                  )}
                </div>
              </div>
              {/* Texte + CTA */}
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20', lineHeight: 1.35 }}>{defi.titre}</div>
                {defi.pitch && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4, lineHeight: 1.5 }}>{defi.pitch}</div>}
                {prog && !isCompleted && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ height: 6, borderRadius: 99, background: '#f3f4f6' }}>
                      <div style={{ height: 6, borderRadius: 99, width: `${Math.round((doneCount / defi.duree_jours) * 100)}%`, background: `linear-gradient(90deg, ${BLUE}, #6fd0f5)` }} />
                    </div>
                  </div>
                )}
                <button style={{
                  ...primaryBtnStyle, marginTop: 12, padding: '12px 20px', fontSize: 14,
                  ...(isCompleted ? { background: '#f4f6f8', color: '#374151', boxShadow: 'none' } : {}),
                }}>
                  {isCompleted
                    ? 'Revoir le défi'
                    : prog
                      ? `Continuer · jour ${Math.min(doneCount + 1, defi.duree_jours)} sur ${defi.duree_jours}`
                      : 'Commencer'}
                  <Icon name="arrowRight" size={15} color={isCompleted ? '#374151' : '#fff'} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {overlays}
    </div>
  );
}
