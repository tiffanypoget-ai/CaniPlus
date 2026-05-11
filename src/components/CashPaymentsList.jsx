// src/components/CashPaymentsList.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const TYPE_LABELS = {
  cotisation_annuelle: 'Cotisation annuelle',
  lecon_privee: 'Leçon privée',
  cours_theorique: 'Cours théorique',
  cours_special: 'Cours spécial',
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CashPaymentsList({ adminPassword }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: subs, error: e } = await supabase
        .from('subscriptions')
        .select('id, type, status, payment_mode, created_at, private_lessons_total, year, user_id, postal_code, city, road_km, travel_extra_chf')
        .eq('payment_mode', 'cash')
        .eq('status', 'pending_payment')
        .order('created_at', { ascending: true });
      if (e) throw e;

      const userIds = [...new Set((subs ?? []).map(s => s.user_id).filter(Boolean))];
      let profilesById = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email, postal_code, city')
          .in('id', userIds);
        profilesById = Object.fromEntries((profs ?? []).map(p => [p.id, p]));
      }

      const items = (subs ?? []).map(s => ({ ...s, profile: profilesById[s.user_id] ?? null }));
      setItems(items);
    } catch (e) {
      setError(e?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const markPaid = async (id) => {
    setBusyId(id);
    setError(null);
    try {
      const { data, error: e } = await supabase.functions.invoke('admin-query', {
        body: { action: 'mark_cash_paid', admin_password: adminPassword, subscription_id: id },
      });
      if (e) throw e;
      if (data?.error) throw new Error(data.error);
      setItems(prev => prev.filter(i => i.id !== id));
    } catch (e) {
      setError(e?.message || 'Erreur lors de la mise à jour.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <div style={{ padding: 20, textAlign: 'center', color: '#6b7280' }}>Chargement…</div>;
  if (error) return <div style={{ padding: 16, background: '#fef2f2', color: '#991b1b', borderRadius: 12 }}>{error}</div>;
  if (items.length === 0) {
    return (
      <div style={{ padding: 28, textAlign: 'center', color: '#6b7280', background: '#f8fafc', borderRadius: 14 }}>
        <Icon name="check" size={28} color="#2da156" />
        <div style={{ marginTop: 8, fontWeight: 600 }}>Rien à encaisser.</div>
        <div style={{ fontSize: 13, marginTop: 4 }}>Aucune réservation en attente de paiement sur place.</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {items.map((it) => {
        const label = TYPE_LABELS[it.type] || it.type;
        const userName = it.profile?.full_name || it.profile?.email || '—';
        const subPlace = [it.postal_code, it.city].filter(Boolean).join(' ');
        const profPlace = [it.profile?.postal_code, it.profile?.city].filter(Boolean).join(' ');
        const place = subPlace || profPlace;
        const travelInfo = it.travel_extra_chf ? ' · +' + it.travel_extra_chf + ' CHF déplacement' : '';
        return (
          <div key={it.id} style={{
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14,
            padding: 14, display: 'flex', alignItems: 'flex-start', gap: 12,
          }}>
            <div style={{
              width: 40, height: 40, background: '#fef3c7', color: '#92400e',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Icon name="creditCard" size={20} color="#92400e" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#1F1F20', fontSize: 15 }}>{userName}</div>
              <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>{label}{place ? ' · ' + place : ''}{travelInfo}</div>
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Demande du {fmtDate(it.created_at)}</div>
            </div>
            <button
              onClick={() => markPaid(it.id)}
              disabled={busyId === it.id}
              style={{
                background: busyId === it.id ? '#bfdbfe' : '#2BABE1',
                color: '#fff', border: 'none', borderRadius: 10,
                padding: '8px 14px', fontSize: 13, fontWeight: 700,
                cursor: busyId === it.id ? 'wait' : 'pointer', flexShrink: 0,
              }}
            >
              {busyId === it.id ? '...' : 'Marquer payé'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
