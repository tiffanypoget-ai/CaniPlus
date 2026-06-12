// src/components/CashPaymentsList.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const TYPE_LABELS = {
  cotisation_annuelle: 'Cotisation annuelle',
  lecon_privee: 'Leçon privée',
  cours_theorique: 'Cours théorique',
  cours_collectif: 'Cours collectif',
  cours_special: 'Cours spécial',
  coaching_request: 'Cours privé (demande)',
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
      const { data: subs, error: e1 } = await supabase
        .from('subscriptions')
        .select('id, type, status, payment_mode, created_at, private_lessons_total, year, user_id, postal_code, city, road_km, travel_extra_chf, lesson_date, duration_hours')
        .eq('payment_mode', 'cash')
        .eq('status', 'pending_payment')
        .order('created_at', { ascending: true });
      if (e1) throw e1;

      const { data: pcrs, error: e2 } = await supabase
        .from('private_course_requests')
        .select('id, user_id, payment_status, payment_mode, created_at, postal_code, city, road_km, travel_extra_chf, chosen_slot, price_chf')
        .eq('payment_mode', 'cash')
        .eq('payment_status', 'cash_pending')
        .order('created_at', { ascending: true });
      if (e2) throw e2;

      const userIds = [
        ...new Set([
          ...(subs ?? []).map(s => s.user_id).filter(Boolean),
          ...(pcrs ?? []).map(p => p.user_id).filter(Boolean),
        ]),
      ];
      let profilesById = {};
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name, email, postal_code, city')
          .in('id', userIds);
        profilesById = Object.fromEntries((profs ?? []).map(p => [p.id, p]));
      }

      const subItems = (subs ?? []).map(s => ({
        kind: 'subscription',
        id: s.id,
        type: s.type,
        created_at: s.created_at,
        user_id: s.user_id,
        postal_code: s.postal_code,
        city: s.city,
        travel_extra_chf: s.travel_extra_chf,
        lesson_date: s.lesson_date,
        duration_hours: s.duration_hours,
        profile: profilesById[s.user_id] ?? null,
      }));
      const pcrItems = (pcrs ?? []).map(p => ({
        kind: 'pcr',
        id: p.id,
        type: 'coaching_request',
        created_at: p.created_at,
        user_id: p.user_id,
        postal_code: p.postal_code,
        city: p.city,
        travel_extra_chf: p.travel_extra_chf,
        chosen_slot: p.chosen_slot,
        price_chf: p.price_chf,
        profile: profilesById[p.user_id] ?? null,
      }));

      const combined = [...subItems, ...pcrItems].sort((a, b) => {
        const aDate = a.lesson_date || a.chosen_slot?.date || a.created_at;
        const bDate = b.lesson_date || b.chosen_slot?.date || b.created_at;
        return String(aDate).localeCompare(String(bDate));
      });
      setItems(combined);
    } catch (e) {
      setError(e?.message || 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cancelPending = async (it) => {
    if (!window.confirm(`Annuler cette entrée à encaisser (${it.profile?.full_name || it.profile?.email || 'membre'}) ? Elle disparaîtra de la liste sans être marquée payée.`)) return;
    setBusyId(it.id);
    setError(null);
    try {
      const body = it.kind === 'pcr'
        ? { action: 'update_request', admin_password: adminPassword, payload: { request_id: it.id, status: 'cancelled' } }
        : { action: 'cancel_cash_pending', admin_password: adminPassword, payload: { subscription_id: it.id } };
      const { data, error: e } = await supabase.functions.invoke('admin-query', { body });
      if (e) throw e;
      if (data?.error) throw new Error(data.error);
      setItems(prev => prev.filter(i => !(i.kind === it.kind && i.id === it.id)));
    } catch (e) {
      setError(e?.message || 'Erreur lors de l\u2019annulation.');
    } finally {
      setBusyId(null);
    }
  };

  const markPaid = async (it) => {
    setBusyId(it.id);
    setError(null);
    try {
      const action = it.kind === 'pcr' ? 'mark_pcr_cash_paid' : 'mark_cash_paid';
      const body = it.kind === 'pcr'
        ? { action, admin_password: adminPassword, payload: { request_id: it.id } }
        : { action, admin_password: adminPassword, payload: { subscription_id: it.id } };
      const { data, error: e } = await supabase.functions.invoke('admin-query', { body });
      if (e) throw e;
      if (data?.error) throw new Error(data.error);
      setItems(prev => prev.filter(i => !(i.kind === it.kind && i.id === it.id)));
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
        const lessonDate = it.lesson_date || it.chosen_slot?.date;
        const lessonTime = it.chosen_slot?.start ? ' à ' + it.chosen_slot.start : '';
        const priceInfo = it.price_chf ? ` · ${it.price_chf} CHF` : '';
        return (
          <div key={it.kind + '-' + it.id} style={{
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
              <div style={{ fontSize: 13, color: '#4b5563', marginTop: 2 }}>{label}{place ? ' · ' + place : ''}{travelInfo}{priceInfo}</div>
              {lessonDate && (
                <div style={{ fontSize: 12, color: '#1f2937', marginTop: 2 }}>Séance · {fmtDate(lessonDate)}{lessonTime}</div>
              )}
              <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Demande du {fmtDate(it.created_at)}</div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <button
                onClick={() => markPaid(it)}
                disabled={busyId === it.id}
                style={{
                  background: busyId === it.id ? '#bfdbfe' : '#2BABE1',
                  color: '#fff', border: 'none', borderRadius: 10,
                  padding: '8px 14px', fontSize: 13, fontWeight: 700,
                  cursor: busyId === it.id ? 'wait' : 'pointer',
                }}
              >
                {busyId === it.id ? '...' : 'Marquer payé'}
              </button>
              <button
                onClick={() => cancelPending(it)}
                disabled={busyId === it.id}
                style={{
                  background: '#fff', color: '#ef4444', border: '1.5px solid #ef4444',
                  borderRadius: 10, padding: '7px 14px', fontSize: 12.5, fontWeight: 700,
                  cursor: busyId === it.id ? 'wait' : 'pointer',
                }}
              >
                Annuler
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
