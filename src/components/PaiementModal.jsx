// src/components/PaiementModal.js
import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const PRICES = {
  cotisation_annuelle: { amount: 150, label: 'Cotisation annuelle', icon: '💳', description: '1 cours de groupe/semaine selon planning · par chien · 12 mois' },
  lecon_privee:        { amount: 60,  label: 'Leçon privée',        icon: '🎯', description: 'Pack de 1 leçon individuelle avec un éducateur' },
};

export default function PaiementModal({ subscription, onClose, onSuccess }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const config = PRICES[subscription?.type] ?? { amount: 0, label: 'Paiement', icon: '💳', description: '' };

  const handlePay = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: {
          type: subscription.type,
          user_id: profile.id,
          user_email: profile.email,
          // subscription_id seulement si la subscription existe déjà en base
          ...(subscription.id ? { subscription_id: subscription.id } : {}),
        },
      });
      if (fnError) throw new Error(fnError.message || JSON.stringify(fnError));
      if (data?.error) throw new Error(data.error);
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Lien de paiement non reçu');
      }
    } catch (e) {
      console.error('Paiement error:', e);
      setError("Erreur : " + (e.message || "Réessaie dans quelques secondes."));
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 200, animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: '#fff', borderRadius: '24px 24px 0 0',
        zIndex: 201, padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>Paiement sécurisé</div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>✕</button>
        </div>

        {/* Ce que tu payers */}
        <div style={{ background: '#f4f6f8', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{ width: 52, height: 52, background: '#e8f7fd', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, flexShrink: 0 }}>
            {config.icon}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20' }}>{config.label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{config.description}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1F1F20', flexShrink: 0 }}>
            CHF {config.amount}
          </div>
        </div>

        {/* Badges sécurité */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 24, justifyContent: 'center', flexWrap: 'wrap' }}>
          {['🔒 Paiement sécurisé', '💳 Carte & TWINT', '✅ Stripe'].map(badge => (
            <div key={badge} style={{ background: '#f4f6f8', color: '#6b7280', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8 }}>
              {badge}
            </div>
          ))}
        </div>

        {/* Erreur */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Bouton payer */}
        <button
          onClick={handlePay}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
            color: '#fff', border: 'none', borderRadius: 16, padding: '16px 24px',
            fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(43,171,225,0.35)',
            transition: 'all 0.2s',
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Connexion au paiement...
            </>
          ) : (
            <>💳 Payer CHF {config.amount}</>
          )}
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
          Tu seras redirigé vers la page de paiement sécurisée Stripe
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
