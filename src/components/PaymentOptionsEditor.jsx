// src/components/PaymentOptionsEditor.jsx
// Éditeur admin pour activer/désactiver le paiement cash et en ligne
// par type de prestation. Lit/écrit dans la table payment_options via admin-query.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const LABELS = {
  lecon_privee:        { name: 'Leçon privée',        desc: 'Cours individuel · 60 CHF + frais de déplacement' },
  cours_theorique:     { name: 'Cours théorique',     desc: 'Cours collectif théorique · 50 CHF' },
  cours_special:       { name: 'Cours spécial',       desc: 'Événements et stages ponctuels' },
  premium:             { name: 'Abonnement premium',  desc: 'Toujours en ligne (Stripe abonnement)' },
  digital_product:     { name: 'Guide de la boutique', desc: 'Toujours en ligne (Stripe one-shot)' },
};

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      style={{
        width: 44, height: 26, borderRadius: 999,
        background: checked ? 'var(--cyan)' : 'var(--border)',
        border: 'none', cursor: disabled ? 'wait' : 'pointer',
        position: 'relative', transition: 'background 0.2s',
        flexShrink: 0, padding: 0,
      }}
      aria-pressed={checked}
    >
      <div style={{
        position: 'absolute', top: 3, left: checked ? 21 : 3,
        width: 20, height: 20, borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </button>
  );
}

export default function PaymentOptionsEditor({ adminPassword }) {
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('payment_options')
        .select('*')
        .order('prestation_type', { ascending: true });
      if (e) throw e;
      setOptions(data ?? []);
    } catch (e) {
      setError(e?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggle = async (prestationType, field, currentValue) => {
    setBusy(prestationType + '_' + field);
    setError(null);
    try {
      const inner = { prestation_type: prestationType };
      inner[field] = !currentValue;
      const { data, error: e } = await supabase.functions.invoke('admin-auth-proxy', {
        body: { target: 'admin-query', action: 'set_payment_option', payload: inner },
      });
      if (e) throw e;
      if (data?.error) throw new Error(data.error);
      setOptions(prev => prev.map(o => o.prestation_type === prestationType ? { ...o, [field]: !currentValue } : o));
    } catch (e) {
      setError(e?.message || 'Erreur de mise à jour.');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div style={{ padding: 16, textAlign: 'center', color: 'var(--gray)' }}>Chargement…</div>;

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>
        Modes de paiement autorisés par prestation
      </div>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 14, lineHeight: 1.5 }}>
        Active ou désactive le choix « en ligne » et « sur place » que les membres voient au moment de payer.
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {options.map(o => {
          const meta = LABELS[o.prestation_type] || { name: o.prestation_type, desc: '' };
          return (
            <div key={o.prestation_type} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto',
              alignItems: 'center', gap: 12, padding: '10px 12px',
              background: '#f9fafb', borderRadius: 10,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: 14 }}>{meta.name}</div>
                <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 1 }}>{meta.desc}</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--gray)', fontWeight: 600 }}>En ligne</div>
                <Toggle
                  checked={o.allow_online}
                  onChange={() => toggle(o.prestation_type, 'allow_online', o.allow_online)}
                  disabled={busy === o.prestation_type + '_allow_online'}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <div style={{ fontSize: 10, color: 'var(--gray)', fontWeight: 600 }}>Sur place</div>
                <Toggle
                  checked={o.allow_cash}
                  onChange={() => toggle(o.prestation_type, 'allow_cash', o.allow_cash)}
                  disabled={busy === o.prestation_type + '_allow_cash'}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
