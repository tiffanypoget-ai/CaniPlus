// src/screens/BoutiqueScreen.js
// Écran Boutique — vente de guides/ebooks PDF à l'unité (Phase 3 ouverture grand public).
// Accessible aux externes ET aux membres (choix produit du 21 avril 2026).
//
// 3 vues :
//   - liste       : grille des produits publiés + onglet "Mes achats"
//   - detail      : page détaillée d'un produit (description, bullets, prix, bouton acheter)
//   - mes-achats  : bibliothèque des produits achetés avec boutons de téléchargement

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from '../components/Icons';

const TAB_SHOP = 'shop';
const TAB_MINE = 'mine';

// Flag global : la boutique est en construction (guides en préparation).
// Passer à `true` pour bloquer la page sur "Bientôt disponible".
//
// 3 mai 2026 : OUVERTURE — webhook stripe-webhook patché (v26) avec
// logs défensifs + fallback select/insert garantissant status='paid'
// même si la métadonnée purchase_id est absente. Voir
// supabase/functions/stripe-webhook/index.ts.
const BOUTIQUE_COMING_SOON = false;

export default function BoutiqueScreen() {
  // Écran "Bientôt disponible" tant que les guides ne sont pas publiés.
  if (BOUTIQUE_COMING_SOON) {
    return <BoutiqueComingSoon />;
  }

  return <BoutiqueActive />;
}

function BoutiqueComingSoon() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#F9FAFB',
      padding: '80px 20px 120px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'flex-start',
      textAlign: 'center',
      fontFamily: 'Inter, -apple-system, sans-serif',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 24,
        padding: '48px 28px',
        maxWidth: 440,
        width: '100%',
        boxShadow: '0 10px 40px rgba(43,171,225,0.12)',
        border: '1px solid #E5E7EB',
      }}>
        <div style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2BABE1 0%, #0E5A80 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px',
          boxShadow: '0 8px 24px rgba(43,171,225,0.3)',
        }}>
          <Icon name="shoppingBag" size={40} color="#fff" />
        </div>

        <h1 style={{
          fontSize: 26,
          fontWeight: 700,
          color: '#1F1F20',
          margin: '0 0 12px',
          letterSpacing: '-0.02em',
        }}>Bientôt disponible</h1>

        <p style={{
          fontSize: 16,
          lineHeight: 1.55,
          color: '#4B5563',
          margin: '0 0 20px',
        }}>
          La boutique CaniPlus arrive très bientôt. Nous préparons des guides
          pratiques pour t'accompagner au quotidien avec ton chien.
        </p>

        <div style={{
          background: '#F0F9FF',
          border: '1px solid #BAE6FD',
          borderRadius: 12,
          padding: '16px 18px',
          textAlign: 'left',
          margin: '0 0 20px',
        }}>
          <div style={{
            fontSize: 13,
            fontWeight: 600,
            color: '#0E5A80',
            marginBottom: 8,
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
          }}>En préparation</div>
          <ul style={{
            margin: 0,
            padding: '0 0 0 18px',
            fontSize: 14,
            color: '#1F2937',
            lineHeight: 1.7,
          }}>
            <li>Accueillir un 2<sup>e</sup> chien à la maison</li>
            <li>Adopter un chien de refuge</li>
            <li>Randonnée & nature en Suisse</li>
          </ul>
        </div>

        <p style={{
          fontSize: 13,
          color: '#6B7280',
          margin: 0,
          lineHeight: 1.5,
        }}>
          Tu seras notifié·e dès la mise en ligne. En attendant, découvre nos
          cours et nos ressources depuis le menu principal.
        </p>
      </div>
    </div>
  );
}

function BoutiqueActive() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState(TAB_SHOP);
  const [products, setProducts] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [downloadLoading, setDownloadLoading] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    // Produits publiés
    const { data: prodData, error: prodErr } = await supabase
      .from('digital_products')
      .select('*')
      .eq('is_published', true)
      .order('display_order', { ascending: true });

    if (prodErr) {
      setLoadError('Erreur de chargement. Réessaie plus tard.');
      setLoading(false);
      return;
    }
    setProducts(prodData || []);

    // Mes achats (payés)
    if (user?.id) {
      const { data: purchData } = await supabase
        .from('user_purchases')
        .select('*, product:digital_products(*)')
        .eq('user_id', user.id)
        .eq('status', 'paid')
        .order('paid_at', { ascending: false });
      setPurchases(purchData || []);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadData(); }, [loadData]);

  const isPurchased = (productId) =>
    purchases.some(p => p.product_id === productId);

  // ─── Acheter un produit (créer session Stripe et rediriger) ────────────────
  const handleBuy = async (product) => {
    if (!user?.id) return;
    setCheckoutLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-product-checkout', {
        body: {
          user_id: user.id,
          user_email: profile?.email ?? user.email,
          product_id: product.id,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.location.href = data.url;
    } catch (err) {
      alert(err.message || "Impossible de démarrer le paiement. Réessaie.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  // ─── Télécharger un produit acheté ─────────────────────────────────────────
  const handleDownload = async (productId) => {
    if (!user?.id) return;
    setDownloadLoading(productId);
    try {
      const { data, error } = await supabase.functions.invoke('get-product-download', {
        body: { user_id: user.id, product_id: productId },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.url) window.open(data.url, '_blank');
    } catch (err) {
      alert(err.message || "Impossible de télécharger. Réessaie.");
    } finally {
      setDownloadLoading(null);
    }
  };

  // ─── Styles communs ────────────────────────────────────────────────────────
  const pageStyle = {
    minHeight: '100%',
    background: '#f7fafc',
    padding: 'calc(env(safe-area-inset-top, 0px) + 24px) 16px calc(96px + env(safe-area-inset-bottom, 0px))',
    fontFamily: 'Inter, sans-serif',
    color: '#1F1F20',
    overflowY: 'auto',
  };

  const cardStyle = {
    background: '#fff',
    borderRadius: 16,
    padding: 18,
    boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
    marginBottom: 14,
    cursor: 'pointer',
    transition: 'transform 0.15s, box-shadow 0.15s',
  };

  const primaryBtnStyle = {
    width: '100%', padding: '14px 20px', border: 'none', borderRadius: 12,
    background: '#2BABE1', color: '#fff', fontWeight: 700, fontSize: 15,
    cursor: 'pointer', fontFamily: 'Inter, sans-serif',
    boxShadow: '0 4px 14px rgba(43,171,225,0.35)',
  };

  // ══════════════════════════════════════════════════════════════════════════
  // Vue détail
  // ══════════════════════════════════════════════════════════════════════════
  if (selectedProduct) {
    const p = selectedProduct;
    const purchased = isPurchased(p.id);
    return (
      <div style={pageStyle}>
        <button
          onClick={() => setSelectedProduct(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'transparent', border: 'none', cursor: 'pointer',
            color: '#2BABE1', fontWeight: 600, fontSize: 14,
            padding: 0, marginBottom: 18, fontFamily: 'Inter, sans-serif',
          }}
        >
          <Icon name="chevronLeft" size={18} color="#2BABE1" /> Retour à la boutique
        </button>

        {p.cover_image_url && (
          <div style={{
            width: '100%', aspectRatio: '16/10', borderRadius: 16,
            background: `#e8f7fd url(${p.cover_image_url}) center/cover no-repeat`,
            marginBottom: 18,
          }} />
        )}

        <h1 style={{
          fontSize: 26, fontWeight: 800, margin: '0 0 6px',
          fontFamily: 'Inter, sans-serif', letterSpacing: -0.5,
        }}>{p.title}</h1>
        {p.subtitle && (
          <p style={{ fontSize: 15, color: '#6b7280', margin: '0 0 16px' }}>{p.subtitle}</p>
        )}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        }}>
          <span style={{
            fontSize: 28, fontWeight: 800, color: '#0E5A80',
          }}>{Number(p.price_chf).toFixed(2)} CHF</span>
          {p.pages_count && (
            <span style={{
              fontSize: 12, color: '#6b7280',
              background: '#eef2f7', padding: '4px 10px', borderRadius: 999,
            }}>{p.pages_count} pages</span>
          )}
        </div>

        {p.bullet_points?.length > 0 && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 18, marginBottom: 18,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
          }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14, color: '#0E5A80' }}>
              Ce que tu trouveras dans ce guide
            </div>
            {p.bullet_points.map((bp, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, marginBottom: 8, fontSize: 14 }}>
                <Icon name="check" size={18} color="#2BABE1" />
                <span>{bp}</span>
              </div>
            ))}
          </div>
        )}

        {p.long_description && (
          <div style={{
            background: '#fff', borderRadius: 14, padding: 18, marginBottom: 22,
            boxShadow: '0 2px 10px rgba(0,0,0,0.04)',
            fontSize: 14, lineHeight: 1.65, whiteSpace: 'pre-wrap',
          }}>{p.long_description}</div>
        )}

        {purchased ? (
          <button
            onClick={() => handleDownload(p.id)}
            disabled={downloadLoading === p.id}
            style={{ ...primaryBtnStyle, background: '#16a34a', boxShadow: '0 4px 14px rgba(22,163,74,0.35)' }}
          >
            {downloadLoading === p.id ? 'Préparation…' : 'Télécharger le PDF'}
          </button>
        ) : (
          <button
            onClick={() => handleBuy(p)}
            disabled={checkoutLoading}
            style={primaryBtnStyle}
          >
            {checkoutLoading ? 'Redirection…' : `Acheter — ${Number(p.price_chf).toFixed(2)} CHF`}
          </button>
        )}
        <p style={{
          fontSize: 12, color: '#6b7280', textAlign: 'center',
          marginTop: 12, lineHeight: 1.5,
        }}>
          Paiement sécurisé par Stripe. PDF accessible immédiatement après l'achat dans « Mes achats ».
        </p>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Vue liste (tabs : boutique / mes achats)
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div style={pageStyle}>
      <h1 style={{
        fontSize: 28, fontWeight: 800, margin: '0 0 4px',
        fontFamily: 'Inter, sans-serif', letterSpacing: -0.5,
      }}>Boutique</h1>
      <p style={{ fontSize: 14, color: '#6b7280', margin: '0 0 20px' }}>
        Des guides pratiques pour progresser à ton rythme.
      </p>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 8, marginBottom: 18,
        background: '#eef2f7', padding: 4, borderRadius: 12,
      }}>
        {[
          { id: TAB_SHOP, label: 'Tous les guides' },
          { id: TAB_MINE, label: `Mes achats${purchases.length ? ` (${purchases.length})` : ''}` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '10px 12px', border: 'none', borderRadius: 8,
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              background: tab === t.id ? '#fff' : 'transparent',
              color: tab === t.id ? '#2BABE1' : '#6b7280',
              boxShadow: tab === t.id ? '0 1px 4px rgba(0,0,0,0.06)' : 'none',
              fontFamily: 'Inter, sans-serif',
            }}
          >{t.label}</button>
        ))}
      </div>

      {loadError && (
        <div style={{
          background: '#fee2e2', color: '#991b1b', padding: 12,
          borderRadius: 10, fontSize: 14, marginBottom: 16,
        }}>{loadError}</div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement…</div>
      ) : tab === TAB_SHOP ? (
        // ─── Grille boutique ─────────────────────────────────────────────────
        products.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>
            Aucun produit disponible pour l'instant.
          </div>
        ) : (
          products.map(p => {
            const purchased = isPurchased(p.id);
            return (
              <div
                key={p.id}
                onClick={() => setSelectedProduct(p)}
                style={cardStyle}
              >
                <div style={{ display: 'flex', gap: 14 }}>
                  <div style={{
                    width: 92, height: 120, borderRadius: 10, flexShrink: 0,
                    background: p.cover_image_url
                      ? `#e8f7fd url(${p.cover_image_url}) center/cover no-repeat`
                      : 'linear-gradient(135deg, #2BABE1, #0E5A80)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff',
                  }}>
                    {!p.cover_image_url && <Icon name="book" size={32} color="#ffffff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontWeight: 700, fontSize: 15, marginBottom: 2,
                      overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>{p.title}</div>
                    {p.subtitle && (
                      <div style={{
                        fontSize: 12, color: '#6b7280', marginBottom: 8,
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                      }}>{p.subtitle}</div>
                    )}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginTop: 8,
                    }}>
                      <span style={{
                        fontSize: 18, fontWeight: 800, color: '#0E5A80',
                      }}>{Number(p.price_chf).toFixed(2)} CHF</span>
                      {purchased ? (
                        <span style={{
                          fontSize: 11, color: '#16a34a', fontWeight: 700,
                          background: '#dcfce7', padding: '4px 10px', borderRadius: 999,
                        }}>Acheté</span>
                      ) : (
                        <span style={{
                          fontSize: 12, color: '#2BABE1', fontWeight: 700,
                        }}>Voir détails →</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )
      ) : (
        // ─── Mes achats ──────────────────────────────────────────────────────
        purchases.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, color: '#6b7280',
            background: '#fff', borderRadius: 14,
          }}>
            <Icon name="book" size={48} color="#d1d5db" />
            <div style={{ fontSize: 15, fontWeight: 600, marginTop: 12, color: '#4b5563' }}>
              Tu n'as encore rien acheté
            </div>
            <div style={{ fontSize: 13, marginTop: 4 }}>
              Parcours la boutique pour découvrir les guides.
            </div>
            <button
              onClick={() => setTab(TAB_SHOP)}
              style={{
                marginTop: 16, padding: '10px 20px', border: 'none', borderRadius: 10,
                background: '#2BABE1', color: '#fff', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'Inter, sans-serif',
              }}
            >Voir les guides</button>
          </div>
        ) : (
          purchases.map(purchase => {
            const p = purchase.product;
            if (!p) return null;
            return (
              <div key={purchase.id} style={cardStyle}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{
                    width: 60, height: 78, borderRadius: 8, flexShrink: 0,
                    background: p.cover_image_url
                      ? `#e8f7fd url(${p.cover_image_url}) center/cover no-repeat`
                      : 'linear-gradient(135deg, #2BABE1, #0E5A80)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {!p.cover_image_url && <Icon name="book" size={22} color="#ffffff" />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{p.title}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>
                      Acheté le {new Date(purchase.paid_at).toLocaleDateString('fr-CH')}
                    </div>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDownload(p.id); }}
                  disabled={downloadLoading === p.id}
                  style={{
                    ...primaryBtnStyle, marginTop: 12,
                    background: '#16a34a',
                    boxShadow: '0 4px 14px rgba(22,163,74,0.35)',
                  }}
                >
                  {downloadLoading === p.id ? 'Préparation…' : 'Télécharger le PDF'}
                </button>
              </div>
            );
          })
        )
      )}
    </div>
  );
}
