// src/components/ResiliationModal.js
// Modal de confirmation avant résiliation — affiche clairement les conditions (pas de remboursement)

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export default function ResiliationModal({ type, accessUntil, onClose, onSuccess }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const isPremium = type === 'premium_mensuel';

  const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' }) : null;

  const accessLabel = fmtDate(accessUntil);

  const handleConfirm = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isPremium) {
        // Résiliation abonnement Stripe mensuel → via Edge Function
        const { data, error: fnError } = await supabase.functions.invoke('cancel-subscription', {
          body: { user_id: profile.id, type: 'premium_mensuel' },
        });
        if (fnError) throw fnError;
        if (data?.error) throw new Error(data.error);
      } else {
        // Cotisation annuelle → marquée "ne pas renouveler" dans Supabase
        const { error: dbError } = await supabase
          .from('subscriptions')
          .update({ renew_cancelled: true })
          .eq('user_id', profile.id)
          .eq('type', 'cotisation_annuelle')
          .eq('status', 'paid');
        if (dbError) throw dbError;
      }
      onSuccess();
    } catch (e) {
      setError('Erreur lors de la résiliation. Réessaie ou contacte CaniPlus.');
      setLoading(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200, animation: 'fadeIn 0.2s ease' }}
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>
            {isPremium ? 'Résilier l\'abonnement ?' : 'Ne pas renouveler ?'}
          </div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>✕</button>
        </div>

        {/* Icône avertissement */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, margin: '0 auto 12px' }}>
            ⚠️
          </div>
        </div>

        {/* Message principal */}
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 16, padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#dc2626', marginBottom: 6 }}>
            Aucun remboursement
          </div>
          <div style={{ fontSize: 13, color: '#7f1d1d', lineHeight: 1.5 }}>
            {isPremium
              ? 'Le paiement du mois en cours ne sera pas remboursé.'
              : 'La cotisation annuelle déjà payée ne sera pas remboursée.'}
          </div>
        </div>

        {/* Ce qui se passe */}
        <div style={{ background: '#f4f6f8', borderRadius: 16, padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 10 }}>
            Ce qui se passe
          </div>

          {/* Accès jusqu'à */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>✅</span>
            <div style={{ fontSize: 13, color: '#1F1F20', fontWeight: 600, lineHeight: 1.4 }}>
              {isPremium
                ? `Tu conserves l'accès premium ${accessLabel ? `jusqu'au ${accessLabel}` : 'jusqu'à la fin du mois en cours'}.`
                : `Ta cotisation reste valide ${accessLabel ? `jusqu'au ${accessLabel}` : "jusqu'à la fin de l'année en cours"}.`}
            </div>
          </div>

          {/* Pas de renouvellement */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🚫</span>
            <div style={{ fontSize: 13, color: '#1F1F20', fontWeight: 600, lineHeight: 1.4 }}>
              {isPremium
                ? "L'abonnement ne sera pas renouvelé automatiquement le mois prochain."
                : "La cotisation ne sera pas renouvelée automatiquement l'année prochaine."}
            </div>
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Boutons */}
        <button
          onClick={handleConfirm}
          disabled={loading}
          style={{
            width: '100%', background: loading ? '#fca5a5' : '#ef4444',
            color: '#fff', border: 'none', borderRadius: 14, padding: '14px 20px',
            fontSize: 15, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            marginBottom: 10,
          }}
        >
          {loading ? (
            <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Résiliation en cours...</>
          ) : (
            isPremium ? '🚫 Confirmer la résiliation' : '🚫 Confirmer — ne pas renouveler'
          )}
        </button>

        <button
          onClick={onClose}
          style={{ width: '100%', background: '#f4f6f8', color: '#1F1F20', border: 'none', borderRadius: 14, padding: '14px 20px', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}
        >
          Garder mon abonnement
        </button>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
