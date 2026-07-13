// src/components/SoireesView.jsx
// « Les soirées CaniPlus » — webinaires payants en direct (Zoom) avec replay.
// Vue plein écran ouverte depuis l'onglet Apprendre (carte Formation de BlogScreen).
//
// - Liste : soirées à venir (titre, date, prix, réservation) et passées
//   (replay pour les inscrits).
// - Détail avant achat : présentation, code promo optionnel, bouton payer
//   (même tunnel Stripe que la boutique : create-product-checkout).
// - Détail après achat : lien Zoom, PDF de support, replay Bunny quand dispo
//   (le tout servi par get-webinar-access, réservé aux acheteurs de CETTE soirée).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from './Icons';

const DAYS_FULL = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

function fmtEventDate(iso) {
  if (!iso) return 'Date à venir';
  const d = new Date(iso);
  const heure = d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()} · ${heure}`;
}

function isUpcoming(soiree) {
  if (!soiree.event_date) return true; // pas encore datée = à venir
  // Une soirée reste "à venir" jusqu'à 3h après son début (le live est en cours)
  return new Date(soiree.event_date).getTime() + 3 * 3600 * 1000 >= Date.now();
}

export default function SoireesView({ onBack }) {
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
    const { data, error } = await supabase
      .from('digital_products')
      .select('*')
      .eq('is_published', true)
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, background: '#e8f7fd', borderRadius: 12, padding: '10px 14px' }}>
              <Icon name="calendar" size={16} color="#1a8bbf" />
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a8bbf' }}>
                {fmtEventDate(s.event_date)}
                {s.event_duration_min ? ` · ${s.event_duration_min} min` : ''}
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
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 12 }}>
                <span style={{ fontSize: 24, fontWeight: 900, color: '#1F1F20' }}>{Number(s.price_chf).toFixed(0)} CHF</span>
                <span style={{ fontSize: 12, color: '#6b7280' }}>· accès au direct, au PDF et au replay</span>
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

              <button onClick={() => handleBuy(s)} disabled={checkoutLoading} style={{ ...primaryBtnStyle, opacity: checkoutLoading ? 0.7 : 1 }}>
                {checkoutLoading ? 'Redirection vers le paiement…' : <>Réserver ma place — {Number(s.price_chf).toFixed(0)} CHF</>}
              </button>
              <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10 }}>
                Paiement sécurisé par Stripe
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

                  {/* PDF de support */}
                  {access.pdf_url ? (
                    <button
                      onClick={() => window.open(access.pdf_url, '_blank')}
                      style={{ ...primaryBtnStyle, background: '#16a34a', boxShadow: '0 4px 14px rgba(22,163,74,0.35)', marginBottom: 10 }}
                    >
                      <Icon name="download" size={16} color="#fff" /> Télécharger le PDF de support
                    </button>
                  ) : (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280', marginBottom: 10 }}>
                      Le PDF de support arrivera ici {upcomingSoiree ? 'pour la soirée' : 'bientôt'}.
                    </div>
                  )}

                  {/* Replay Bunny */}
                  {access.replay_url ? (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 8 }}>
                        <Icon name="eye" size={12} color="#6b7280" /> Replay
                      </div>
                      <div style={{ position: 'relative', paddingTop: '56.25%', borderRadius: 14, overflow: 'hidden', background: '#1F1F20' }}>
                        <iframe
                          src={access.replay_url}
                          title={`Replay — ${s.title}`}
                          loading="lazy"
                          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 0 }}
                          allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
                          allowFullScreen
                        />
                      </div>
                    </div>
                  ) : !upcomingSoiree && (
                    <div style={{ background: '#f4f6f8', borderRadius: 12, padding: '10px 14px', fontSize: 13, color: '#6b7280' }}>
                      Le replay sera disponible ici quelques jours après la soirée.
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
    return (
      <div key={s.id} style={cardStyle} onClick={() => setSelected(s)}>
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
              {purchased ? (
                <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Icon name="check" size={11} color="#16a34a" /> {upcomingSoiree ? 'Inscrit·e' : 'Replay dispo'}
                </span>
              ) : (
                <span style={{ background: '#e8f7fd', color: '#1a8bbf', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>
                  {Number(s.price_chf).toFixed(0)} CHF
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
          <Icon name="arrowLeft" size={13} color="#fff" /> Apprendre
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#fff' }}>
          <Icon name="star" size={22} color="#fff" />
          Les soirées CaniPlus
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>
          Un thème, un soir, pour mieux comprendre ton chien.
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
