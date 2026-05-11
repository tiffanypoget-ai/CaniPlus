// src/components/PaiementModal.js
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from './Icons';

const PRICES = {
  cotisation_annuelle: { amount: 150, label: 'Cotisation annuelle',  icon: 'creditCard', description: '1 cours de groupe/semaine selon planning · 12 mois' },
  lecon_privee:        { amount: 60,  label: 'Leçon privée',         icon: 'heart', description: 'Pack de 1 leçon individuelle avec un éducateur' },
  cours_theorique:     { amount: 50,  label: 'Cours théorique',      icon: 'book', description: 'Cours théorique · CaniPlus Ballaigues' },
};

export default function PaiementModal({ subscription, onClose, onSuccess, dogsCount, overrideAmount }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [paymentMode, setPaymentMode] = useState('online');
  const [allowCash, setAllowCash] = useState(false);

  const baseConfig = PRICES[subscription?.type] ?? { amount: 0, label: 'Paiement', icon: 'creditCard', description: '' };
  const isCotisation = subscription?.type === 'cotisation_annuelle';
  const nbChiens = isCotisation && dogsCount > 1 ? dogsCount : 1;
  const totalAmount = overrideAmount
    ? overrideAmount
    : isCotisation ? 150 * nbChiens : baseConfig.amount;
  const config = {
    ...baseConfig,
    amount: totalAmount,
    description: isCotisation && nbChiens > 1
      ? `${nbChiens} chiens × CHF 150 · 1 cours de groupe/semaine · 12 mois`
      : baseConfig.description,
  };

  // Charger les options de paiement (admin peut activer/désactiver le cash par prestation)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!subscription?.type) return;
      try {
        const { data } = await supabase
          .from('payment_options')
          .select('allow_cash')
          .eq('prestation_type', subscription.type)
          .maybeSingle();
        if (mounted && data?.allow_cash) setAllowCash(true);
      } catch (_) { /* fallback : pas de cash si erreur */ }
    })();
    return () => { mounted = false; };
  }, [subscription?.type]);

  const handlePayOnline = async () => {
    setLoading(true);
    setError(null);
    try {
      try {
        await supabase
          .from('subscriptions')
          .update({ payment_mode: 'online' })
          .eq('id', subscription.id);
      } catch (_) {}

      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: {
          subscription_id: subscription.id,
          user_id: profile.id,
          type: subscription.type,
          amount: totalAmount,
          dogs_count: nbChiens,
        },
      });
      if (fnError) throw fnError;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Lien de paiement non reçu');
      }
    } catch (e) {
      setError("Erreur lors de la connexion au paiement. Réessaie dans quelques secondes.");
      setLoading(false);
    }
  };

  const handleReserveCash = async () => {
    setLoading(true);
    setError(null);
    try {
      const { error: updErr } = await supabase
        .from('subscriptions')
        .update({
          status: 'pending_payment',
          payment_mode: 'cash',
        })
        .eq('id', subscription.id);
      if (updErr) throw updErr;

      try {
        await supabase.functions.invoke('notify-admin', {
          body: {
            kind: 'payment_received',
            title: `Réservation à encaisser : ${config.label}`,
            body: `${profile?.full_name || profile?.email} a réservé ${config.label} (${totalAmount} CHF) en paiement sur place.`,
            metadata: {
              subscription_id: subscription.id,
              type: subscription.type,
              amount_chf: totalAmount,
              user_id: profile?.id,
              payment_mode: 'cash',
            },
            channels: ['in_app', 'push'],
          },
        });
      } catch (_) {}

      setLoading(false);
      if (onSuccess) onSuccess({ payment_mode: 'cash' });
      else onClose();
    } catch (e) {
      setError("Erreur lors de la réservation. Réessaie dans quelques secondes.");
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (paymentMode === 'cash') handleReserveCash();
    else handlePayOnline();
  };

  const cashOption = allowCash && !isCotisation;

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 200, animation: 'fadeIn 0.2s ease',
      }} />

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430,
        background: '#fff', borderRadius: '24px 24px 0 0',
        zIndex: 201, padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>

        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>
            {cashOption ? 'Mode de paiement' : 'Paiement sécurisé'}
          </div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
            <Icon name="close" size={18} color="#6b7280" />
          </button>
        </div>

        <div style={{ background: '#f4f6f8', borderRadius: 18, padding: 16, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, background: '#e8f7fd', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={config.icon} size={26} color="#2BABE1" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20' }}>{config.label}</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2, lineHeight: 1.4 }}>{config.description}</div>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1F1F20', flexShrink: 0 }}>
            CHF {config.amount}
          </div>
        </div>

        {cashOption && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
            <button
              onClick={() => setPaymentMode('online')}
              style={{
                padding: '14px 12px', textAlign: 'left',
                background: paymentMode === 'online' ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#f4f6f8',
                color: paymentMode === 'online' ? '#fff' : '#1F1F20',
                border: 'none', borderRadius: 14, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="creditCard" size={14} color={paymentMode === 'online' ? '#fff' : '#2BABE1'} /> En ligne
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Carte ou TWINT, tout de suite</div>
            </button>
            <button
              onClick={() => setPaymentMode('cash')}
              style={{
                padding: '14px 12px', textAlign: 'left',
                background: paymentMode === 'cash' ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#f4f6f8',
                color: paymentMode === 'cash' ? '#fff' : '#1F1F20',
                border: 'none', borderRadius: 14, cursor: 'pointer',
              }}
            >
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="heart" size={14} color={paymentMode === 'cash' ? '#fff' : '#2BABE1'} /> Sur place
              </div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Cash ou TWINT à la séance</div>
            </button>
          </div>
        )}

        {paymentMode === 'cash' ? (
          <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 14px', marginBottom: 16, fontSize: 12, color: '#1e40af', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="info" size={14} color="#1e40af" style={{ marginTop: 2, flexShrink: 0 }} />
            <span>Tu réserves maintenant et tu paies <strong>{config.amount} CHF</strong> sur place à la séance (cash ou TWINT). Tiffany verra ta réservation dans son admin.</span>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, justifyContent: 'center', flexWrap: 'wrap' }}>
            {[
              { icon: 'lock', text: 'Paiement sécurisé' },
              { icon: 'creditCard', text: 'Carte & TWINT' },
              { icon: 'check', text: 'Stripe' }
            ].map(badge => (
              <div key={badge.text} style={{ background: '#f4f6f8', color: '#6b7280', fontSize: 11, fontWeight: 700, padding: '5px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Icon name={badge.icon} size={12} color="#6b7280" /> {badge.text}
              </div>
            ))}
          </div>
        )}

        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={16} color="#dc2626" /> {error}
          </div>
        )}

        <button
          onClick={handleConfirm}
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
              {paymentMode === 'cash' ? 'Réservation...' : 'Connexion au paiement...'}
            </>
          ) : paymentMode === 'cash' ? (
            <><Icon name="check" size={18} color="#fff" /> Réserver — paiement sur place</>
          ) : (
            <><Icon name="creditCard" size={18} color="#fff" /> Payer CHF {config.amount}</>
          )}
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', marginTop: 12 }}>
          {paymentMode === 'cash'
            ? 'Tu pourras voir ta réservation dans ton profil.'
            : 'Tu seras redirigé vers la page de paiement sécurisée Stripe'}
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
