// src/components/SoireesView.jsx
// « Les soirées CaniPlus » — webinaires payants en direct (Zoom) avec replay.
// Vue plein écran ouverte depuis l'onglet Apprendre (carte Formation de BlogScreen).
//
// - Liste : soirées à venir (titre, date, prix, réservation) et passées
//   (replay pour les inscrits).
// - Détail avant achat : présentation, code promo optionnel, bouton payer
//   (même tunnel Stripe que la boutique : create-product-checkout).
// - Détail après achat : lien Zoom, PDF de support, replay quand dispo (le tout
//   servi par get-webinar-access, réservé aux acheteurs de CETTE soirée).
//
// Rien de sensible ne transite par la liste : digital_products ne contient que
// les informations publiques. Le lien Zoom et le replay vivent dans
// webinar_access, table sans lecture publique, et ne sont demandés qu'après
// vérification de l'achat payé.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from './Icons';

const DAYS_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// La salle Zoom ouvre 15 minutes avant le début, le temps que tout le monde s'installe.
const DOORS_OPEN_MIN = 15;
const DEFAULT_DURATION_MIN = 90;

function fmtHeure(d) {
  return d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

function fmtEventDate(iso) {
  if (!iso) return 'Date à venir';
  const d = new Date(iso);
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} · ${fmtHeure(d)}`;
}

// « 20:00 – 21:30 · salle ouverte dès 19:45 »
function fmtCreneau(iso, durationMin) {
  if (!iso) return null;
  const debut = new Date(iso);
  const fin = new Date(debut.getTime() + (Number(durationMin) || DEFAULT_DURATION_MIN) * 60000);
  const ouverture = new Date(debut.getTime() - DOORS_OPEN_MIN * 60000);
  return `${fmtHeure(debut)} – ${fmtHeure(fin)} · salle ouverte dès ${fmtHeure(ouverture)}`;
}

function fmtDateCourte(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function isUpcoming(soiree) {
  if (!soiree.event_date) return true; // pas encore datée = à venir
  // Une soirée reste "à venir" jusqu'à 3h après son début (le live est en cours)
  return new Date(soiree.event_date).getTime() + 3 * 3600 * 1000 >= Date.now();
}

export default function SoireesView({ onBack, backLabel = 'Apprendre' }) {
  const { user, profile } = useAuth();
  const [soirees, setSoirees] = useState([]);
  const [purchasedIds, setPurchasedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selected, setSelected] = useState(null);         // null = liste, objet = détail
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [buyError, setBuyError] = useState(null);
  const [access, setAccess] = useState(null);              // contenu get-webinar-access
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    // Pas de filtre is_published ici : la RLS ne montre les brouillons qu'aux
    // admins (policy digital_products_admin_all). Tiffany peut ainsi
    // prévisualiser une soirée non publiée directement dans l'app, avec un
    // badge « Brouillon » — les clientes ne voient que les soirées publiées.
    const { data, error } = await supabase
      .from('digital_products')
      .select('*')
      .eq('category', 'soiree')
      .order('event_date', { ascending: true, nullsFirst: false });
    if (error) {
      setLoadError('Erreur de chargement. Réessaie plus tard.');
      setLoading(false);
      return;
    }
    setSoirees(data || []);

    if (user?.id && data?.length) {
      const { data: purch } = await supabase
        .from('user_purchases')
        .select('product_id')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .in('product_id', data.map(s => s.id));
      setPurchasedIds(new Set((purch || []).map(p => p.product_id)));
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isPurchased = (id) => purchasedIds.has(id);

  // ── Accès acheteur (Zoom, PDF, replay) — chargé à l'ouverture du détail ──
  useEffect(() => {
    setAccess(null);
    setAccessError(null);
    if (!selected || !isPurchased(selected.id)) return;
    let alive = true;
    (async () => {
      setAccessLoading(true);
      const { data, error } = await supabase.functions.invoke('get-webinar-access', {
        body: { product_id: selected.id },
      });
      if (!alive) return;
      if (error || data?.error) setAccessError(data?.error || 'Impossible de charger tes accès. Réessaie.');
      else setAccess(data);
      setAccessLoading(false);
    })();
    return () => { alive = false; };
  }, [selected?.id, purchasedIds]); // eslint-disable-line

  // ── Achat ──────────────────────────────────────────────────────────────
  const handleBuy = async (soiree) => {
    if (!user || checkoutLoading) return;
    setCheckoutLoading(true);
    setBuyError(null);
    try {
      const { data, error } = await supabase.functions.invoke('create-product-checkout', {
        body: {
          user_id: user.id,
          user_email: profile?.email ?? user.email,
          product_id: soiree.id,
          promo_code: promoCode.trim() || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) { window.location.href = data.url; return; }
      throw new Error('Lien de paiement non reçu');
    } catch (e) {
      setBuyError(e?.message || 'Erreur. Réessaie dans quelques secondes.');
      setCheckoutLoading(false);
    }
  };

  // ── Styles partagés (repris de BoutiqueScreen) ─────────────────────────
  const cardStyle = {
    background: '#fff', borderRadius: 16, padding: 18,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)', cursor: 'pointer',
    marginBottom: 12,
  };
  const primaryBtnStyle = {
    width: '100%', padding: '13px 20px', border: 'none', borderRadius: 12,
    background: '#2BABE1', color: '#fff', fontSize: 15, fontWeight: 700,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    boxShadow: '0 4px 14px rgba(43,171,225,0.35)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  };

  const upcoming = soirees.filter(isUpcoming);
  const past = soirees.filter(s => !isUpcoming(s)).reverse(); // plus récentes d'abord

  // ════════════════════════ Vue détail ════════════════════════
  if (selected) {
    const s = selected;
    const purchased = isPurchased(s.id);
    const upcomingSoiree = isUpcoming(s);
    // On ne vend ni une soirée annulée, ni une soirée déjà passée.
    const inscriptionOuverte = upcomingSoiree && !s.event_cancelled;
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', background: '#f7fafc' }} className="screen-content">
        <div style={{ padding: 'calc(env(safe-area-inset-top,0px) + 14px) 16px 100px' }}>
          <button
            onClick={() => { setSelected(null); setBuyError(null); setPromoCode(''); setPromoOpen(false); }}
            style={{ background: '#fff', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, color: '#1F1F20', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 14 }}
          >
            <Icon name="arrowLeft" size={14} color="#1F1F20" /> Les soirées
          </button>

          {s.cover_image_url && (
            <img src={s.cover_image_url} alt={s.title} style={{ width: '100%', height: 170, objectFit: 'cover', borderRadius: 16, display: 'block', marginBottom: 14 }} />
          )}

          <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.05)' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#2BABE1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
              <Icon name="star" size={12} color="#2BABE1" /> Soirée CaniPlus
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20', lineHeight: 1.3 }}>{s.title}</div>
            {s.subtitle && <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{s.subtitle}</div>}

            {s.event_cancelled && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, background: '#fee2e2', borderRadius: 12, padding: '12px 14px' }}>
                <Icon name="warning" size={16} color="#dc2626" />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#dc2626', lineHeight: 1.5 }}>
                  Cette soirée est annulée.
                  <div style={{ fontWeight: 500, marginTop: 2 }}>
                    Si tu étais inscrit·e, Tiffany te recontacte pour le remboursement.
                  </div>
                </div>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 12, background: '#e8f7fd', borderRadius: 12, padding: '10px 14px' }}>
              <Icon name="calendar" size={16} color="#1a8bbf" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1a8bbf', textTransform: 'capitalize' }}>
                  {fmtEventDate(s.event_date)}
                </div>
                {fmtCreneau(s.event_date, s.event_duration_min) && (
                  <div style={{ fontSize: 12, color: '#1a8bbf', marginTop: 2 }}>
                    {fmtCreneau(s.event_date, s.event_duration_min)}
                  </div>
                )}
              </div>
            </div>

            {s.bullet_points?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                {s.bullet_points.map((b, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}>
                    <Icon name="check" size={14} color="#16a34a" />
                    <span style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{b}</span>
                  </div>
                ))}
              </div>
            )}

            {(s.long_description || s.description) && (
              <div style={{ fontSize: 14, color: '#4b5563', lineHeight: 1.6, marginTop: 14, whiteSpace: 'pre-wrap' }}>
                {s.long_description || s.description}
              </div>
            )}
          </div>

          {/* ── Bloc achat OU bloc accès ─────────────────────────────── */}
          {!purchased ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#1F1F20' }}>{Number(s.price_chf).toFixed(0)} CHF</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>pour cette soirée</span>
              </div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6, marginBottom: 14 }}>
                Le direct avec Tiffany, et le replay à regarder pendant 7 jours — compris dans le prix.
              </div>

              {/* Code promo (promotion codes Stripe, un par soirée) */}
              {!promoOpen ? (
                <button
                  onClick={() => setPromoOpen(true)}
                  style={{ background: 'none', border: 'none', color: '#2BABE1', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0, marginBottom: 12, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <Icon name="sparkle" size={13} color="#2BABE1" /> J'ai un code promo
                </button>
              ) : (
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Code promo</label>
                  <input
                    value={promoCode}
                    onChange={e => { setPromoCode(e.target.value.toUpperCase()); setBuyError(null); }}
                    placeholder="TONCODE"
                    autoCapitalize="characters"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', letterSpacing: 1, fontWeight: 700 }}
                  />
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>La réduction s'applique sur la page de paiement. Un code ne s'utilise qu'une fois par personne.</div>
                </div>
              )}

              {buyError && (
                <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Icon name="warning" size={14} color="#dc2626" /> {buyError}
                </div>
              )}

              <button
                onClick={() => handleBuy(s)}
                disabled={checkoutLoading || !inscriptionOuverte}
                style={{ ...primaryBtnStyle, opacity: (checkoutLoading || !inscriptionOuverte) ? 0.55 : 1, cursor: inscriptionOuverte ? 'pointer' : 'not-allowed' }}
              >
                {!inscriptionOuverte
                  ? (s.event_cancelled ? 'Soirée annulée' : 'Inscriptions closes')
                  : checkoutLoading
                    ? 'Redirection vers le paiement…'
                    : <>Réserver ma place — {Number(s.price_chf).toFixed(0)} CHF</>}
              </button>
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
                {inscriptionOuverte
                  ? 'Paiement sécurisé par Stripe'
                  : s.event_cancelled
                    ? 'Aucun paiement n\'est possible pour une soirée annulée.'
                    : 'Cette soirée a déjà eu lieu. La prochaine t\'attend dans la liste !'}
              </div>
            </div>
          ) : (
            <div style={{ background: '#fff', borderRadius: 16, padding: 18, boxShadow: '0 2px 12px rgba(0,0,0,0.05)', marginTop: 14 }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: '#dcfce7', color: '#16a34a', fontSize: 13, fontWeight: 800, padding: '6px 12px', borderRadius: 10, marginBottom: 14 }}>
                <Icon name="checkCircle" size={16} color="#16a34a" /> Tu es inscrit·e à cette soirée
              </div>

              {accessLoading && (
                <div style={{ fontSize: 13, color: '#9ca3af', padding: '8px 0' }}>Chargement de tes accès…</div>
              )}
              {accessError && (
                <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>{accessError}</div>
              )}

              {access && (
                <>
                  {/* Lien Zoom — surtout utile avant/pendant le direct */}
                  {access.zoom_url ? (
                    <button
                      onClick={() => window.open(access.zoom_url, '_blank')}
                      style={{ ...primaryBtnStyle, marginBottom: 10 }}
                    >
                      <Icon name="globe" size={16} color="#fff" /> Rejoindre la soirée sur Zoom
                    </button>
                  ) : upcomingSoiree && (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
                      Le lien Zoom sera affiché ici avant la soirée.
                    </div>
                  )}

                  {/* Consignes pratiques — reprises telles quelles dans les emails.
                      Les sous-titres sont une information d'accessibilité : au moins
                      une cliente sourde suit les soirées. */}
                  {upcomingSoiree && !s.event_cancelled && (
                    <div style={{ background: '#f8f5f0', borderRadius: 12, padding: '12px 14px', marginBottom: 10, fontSize: 12.5, color: '#4b5563', lineHeight: 1.7 }}>
                      · Rejoins avec ton prénom et ton nom : une salle d'attente filtre les entrées.<br />
                      · Sous-titres automatiques en français pendant la soirée (bouton <strong>Sous-titres</strong> dans Zoom).<br />
                      · Pas besoin de compte Zoom : le lien suffit, sur ordinateur, tablette ou téléphone.
                    </div>
                  )}

                  {/* Fiche récap — annoncée seulement si elle existe vraiment,
                      et servie à partir de l'heure de début de la soirée. */}
                  {access.pdf_url && (
                    <button
                      onClick={() => window.open(access.pdf_url, '_blank')}
                      style={{ ...primaryBtnStyle, background: '#16a34a', boxShadow: '0 4px 14px rgba(22,163,74,0.35)', marginBottom: 10 }}
                    >
                      <Icon name="download" size={16} color="#fff" /> Télécharger la fiche récap
                    </button>
                  )}

                  {access.pdf_pending && (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280', marginBottom: 10, lineHeight: 1.5 }}>
                      Une fiche récap t'attend ici le soir de la soirée, à garder sous la main.
                    </div>
                  )}

                  {/* Replay — lien de partage cloud Zoom protégé par un code (saison 1),
                      ou lecteur intégré si un jour l'hébergement Bunny prend le relais.
                      Passé la date d'expiration, get-webinar-access ne renvoie plus rien. */}
                  {(access.replay_url || access.replay_embed_url) && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        <Icon name="eye" size={12} color="#6b7280" /> Replay
                      </div>

                      {access.replay_embed_url ? (
                        <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#1F1F20' }}>
                          <iframe
                            src={access.replay_embed_url}
                            title={`Replay — ${s.title}`}
                            loading="lazy"
                            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                            allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                            allowFullScreen
                          />
                        </div>
                      ) : (
                        <>
                          <button
                            onClick={() => window.open(access.replay_url, '_blank')}
                            style={{ ...primaryBtnStyle, background: '#1F1F20', boxShadow: '0 4px 14px rgba(31,31,32,0.25)' }}
                          >
                            <Icon name="eye" size={16} color="#fff" /> Regarder le replay
                          </button>
                          {access.replay_code && (
                            <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '12px 14px', marginTop: 10, textAlign: 'center' }}>
                              <div style={{ fontSize: 10, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Code d'accès</div>
                              <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20', letterSpacing: 2, marginTop: 4, fontFamily: 'monospace', userSelect: 'all', wordBreak: 'break-all' }}>
                                {access.replay_code}
                              </div>
                              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6 }}>Zoom te le demande à l'ouverture du lien.</div>
                            </div>
                          )}
                        </>
                      )}

                      {access.replay_expires_at && (
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 10, textAlign: 'center' }}>
                          Disponible jusqu'au {fmtDateCourte(access.replay_expires_at)}.
                        </div>
                      )}
                    </div>
                  )}

                  {!access.replay_url && !access.replay_embed_url && access.replay_expired && (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                      Les 7 jours de replay sont écoulés, le lien ne fonctionne plus.
                      Une question sur cette soirée ? Écris à info@caniplus.ch.
                    </div>
                  )}

                  {!access.replay_url && !access.replay_embed_url && !access.replay_expired && !upcomingSoiree && (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
                      Le replay arrive ici dans les jours qui viennent, à regarder pendant 7 jours.
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ════════════════════════ Vue liste ════════════════════════
  const soireeCard = (s) => {
    const purchased = isPurchased(s.id);
    const upcomingSoiree = isUpcoming(s);
    // Les soirées passées restent visibles mais en retrait : les inscrites y
    // retrouvent leur replay, les autres voient que la série existe.
    const grisee = !upcomingSoiree || s.event_cancelled;
    return (
      <div key={s.id} style={{ ...cardStyle, opacity: grisee ? 0.72 : 1 }} onClick={() => setSelected(s)}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <div style={{
            width: 54, height: 54, borderRadius: 14, flexShrink: 0,
            background: s.cover_image_url
              ? `#e8f7fd url(${s.cover_image_url}) center/cover no-repeat`
              : 'linear-gradient(135deg, #2BABE1, #0E5A80)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {!s.cover_image_url && <Icon name="star" size={22} color="#ffffff" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15, color: '#1F1F20' }}>{s.title}</div>
            <div style={{ fontSize: 12, color: '#2BABE1', fontWeight: 700, marginTop: 2 }}>{fmtEventDate(s.event_date)}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {s.event_cancelled && (
                <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>
                  Annulée
                </span>
              )}
              {purchased ? (
                <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" size={11} color="#16a34a" /> {upcomingSoiree ? 'Inscrit·e' : 'Replay'}
                </span>
              ) : !s.event_cancelled && (
                <span style={{ background: '#e8f7fd', color: '#1a8bbf', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>
                  {Number(s.price_chf).toFixed(0)} CHF
                </span>
              )}
              {!s.is_published && (
                <span style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                  Brouillon — visible par toi seule
                </span>
              )}
            </div>
          </div>
          <Icon name="chevronRight" size={16} color="#9ca3af" />
        </div>
      </div>
    );
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch', background: '#f7fafc' }} className="screen-content">
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)', padding: 'calc(env(safe-area-inset-top,0px) + 16px) 24px 28px' }}>
        <button
          onClick={onBack}
          style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
        >
          <Icon name="arrowLeft" size={13} color="#fff" /> {backLabel}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#fff' }}>
          <Icon name="star" size={22} color="#fff" />
          Les soirées CaniPlus
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6, lineHeight: 1.5 }}>
          Un thème, un lundi soir par mois, en visio avec Tiffany.<br />
          20h00 – 21h30 · CHF 20 la soirée, replay 7 jours inclus.
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>
        {loading && <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>}
        {loadError && <div style={{ textAlign: 'center', color: '#ef4444', padding: 40 }}>{loadError}</div>}

        {!loading && !loadError && soirees.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280', background: '#fff', borderRadius: 16 }}>
            <Icon name="star" size={40} color="#d1d5db" />
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 12, color: '#4b5563' }}>Les premières soirées arrivent</div>
            <div style={{ fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>Tiffany prépare le programme — reviens bientôt !</div>
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '4px 0 10px' }}>À venir</div>
            {upcoming.map(soireeCard)}
          </>
        )}

        {past.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Soirées passées</div>
            {past.map(soireeCard)}
          </>
        )}
      </div>
    </div>
  );
}
