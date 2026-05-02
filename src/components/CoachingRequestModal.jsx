// src/components/CoachingRequestModal.jsx
// Modal de demande de cours privé / coaching.
// Deux modes :
//   - à domicile (présentiel) : 60 CHF
//   - à distance (visio)      : 50 CHF
//
// Flux (révisé 2026-05-02) :
//   1. L'utilisateur choisit le mode, propose 1 à 4 créneaux, écrit un message optionnel
//   2. Au clic sur "Envoyer ma demande", on insère une ligne private_course_requests
//      (status='pending', payment_status='pending') sans paiement Stripe
//   3. Tiffany reçoit une notif admin et confirme un créneau dans le panel admin
//      (avec heure exacte + durée via la modal de confirmation)
//   4. Une fois confirmé, le client voit un bouton "Payer ce cours" dans son planning
//      qui ouvre une session Stripe via l'edge function pay-coaching-request
//   5. Le webhook stripe-webhook marque payment_status='paid' à confirmation
//
// Avantage : Tiffany peut refuser une demande ou modifier le créneau sans
// avoir à rembourser. Le client ne paie qu'une fois son créneau confirmé.

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const TIMES = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','13:00','14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00','19:30','20:00',
];

const PRICE_IN_PERSON = 60;
const PRICE_REMOTE    = 50;

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const months = ['jan','fév','mar','avr','mai','juin','juil','aoû','sep','oct','nov','déc'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const emptySlot = () => ({ date: '', start: '09:30', end: '10:30' });

export default function CoachingRequestModal({ userId, userEmail, onClose }) {
  const [isRemote, setIsRemote] = useState(false);
  const [slots, setSlots]       = useState([emptySlot(), emptySlot()]);
  const [notes, setNotes]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);

  const price = isRemote ? PRICE_REMOTE : PRICE_IN_PERSON;

  const updateSlot = (i, field, val) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
    setError(null);
  };
  const addSlot    = () => { if (slots.length < 4) setSlots(prev => [...prev, emptySlot()]); };
  const removeSlot = (i) => { if (slots.length > 1) setSlots(prev => prev.filter((_, idx) => idx !== i)); };

  const handleSubmit = async () => {
    const filled = slots.filter(s => s.date && s.start && s.end);
    if (filled.length === 0) { setError('Indique au moins une disponibilité.'); return; }
    for (const s of filled) {
      if (s.start >= s.end) { setError('L\'heure de fin doit être après l\'heure de début.'); return; }
    }

    setLoading(true);
    try {
      // 1. Insérer la demande sans paiement (status pending, payment_status pending)
      const { data: request, error: insErr } = await supabase
        .from('private_course_requests')
        .insert({
          user_id: userId,
          availability_slots: filled,
          status: 'pending',
          admin_notes: notes || null,
          is_remote: isRemote,
          price_chf: price,
          payment_status: 'pending',
        })
        .select('id')
        .single();
      if (insErr) throw insErr;

      // 2. Notif admin : nouvelle demande de cours privé
      try {
        await supabase.functions.invoke('notify-admin', {
          body: {
            kind: 'private_request',
            title: 'Nouvelle demande de cours privé',
            body: `${filled.length} créneau${filled.length > 1 ? 'x' : ''} proposé${filled.length > 1 ? 's' : ''} · ${isRemote ? 'visio' : 'présentiel'} · ${price} CHF${notes ? ' · ' + notes.slice(0, 100) : ''}`,
            metadata: { user_id: userId, request_id: request.id, slots: filled, notes, is_remote: isRemote, price_chf: price },
          },
        });
      } catch (_) { /* notif ne bloque pas la demande */ }

      setLoading(false);
      onClose();
      // Petit feedback : un alert tout simple suffit pour cette version
      window.alert(`Ta demande a bien été envoyée. Tiffany te confirme un créneau et tu pourras payer ${price} CHF directement dans l'app.`);
    } catch (err) {
      setError(err?.message || 'Erreur lors de l\'envoi de ta demande. Réessaie.');
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overlay */}
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
        zIndex: 200, animation: 'fadeIn 0.2s ease',
      }} />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderRadius: '24px 24px 0 0', zIndex: 201,
        padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        maxHeight: '92dvh', overflowY: 'auto',
      }}>
        {/* Poignée */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {/* Titre */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 16 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="star" size={20} color="#2BABE1" /> Coaching personnalisé
          </div>
          <button onClick={onClose} style={{
            background: '#f4f6f8', border: 'none', borderRadius: 10,
            width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}><Icon name="close" size={16} color="#6b7280" /></button>
        </div>

        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 16, lineHeight: 1.5 }}>
          Une séance en tête-à-tête avec Tiffany, adaptée à ton chien et à tes besoins.
        </div>

        {/* Toggle Présentiel / Distance */}
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18,
        }}>
          <button
            onClick={() => setIsRemote(false)}
            style={{
              padding: '14px 12px',
              background: !isRemote ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#f4f6f8',
              color: !isRemote ? '#fff' : '#1F1F20',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>À domicile</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{PRICE_IN_PERSON} CHF</div>
          </button>
          <button
            onClick={() => setIsRemote(true)}
            style={{
              padding: '14px 12px',
              background: isRemote ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#f4f6f8',
              color: isRemote ? '#fff' : '#1F1F20',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
              textAlign: 'left', transition: 'all 0.15s ease',
            }}
          >
            <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 2 }}>À distance (visio)</div>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{PRICE_REMOTE} CHF</div>
          </button>
        </div>

        {/* Description du mode choisi */}
        <div style={{
          background: '#f4f6f8', borderRadius: 12, padding: '12px 14px', marginBottom: 18,
          fontSize: 13, color: '#4b5563', lineHeight: 1.5,
        }}>
          {isRemote ? (
            <>
              <strong style={{ color: '#1F1F20' }}>Visio Zoom ou Meet.</strong> Idéal pour le
              comportement à la maison, la préparation d'une arrivée, le suivi entre séances.
              Le lien te sera envoyé par email après confirmation du créneau.
            </>
          ) : (
            <>
              <strong style={{ color: '#1F1F20' }}>Chez toi ou sur un lieu convenu.</strong> Idéal
              pour la balade, les rencontres, le rappel, la marche en laisse — tout ce qui se
              travaille sur le terrain.
            </>
          )}
        </div>

        <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Propose 1 à 4 créneaux
        </div>

        {/* Créneaux */}
        {slots.map((slot, i) => (
          <div key={i} style={{
            background: '#f4f6f8', borderRadius: 16, padding: 14,
            marginBottom: 10, position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Disponibilité {i + 1}
              </div>
              {slots.length > 1 && (
                <button onClick={() => removeSlot(i)} style={{
                  background: 'none', border: 'none', color: '#9ca3af',
                  cursor: 'pointer', padding: '2px 6px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}><Icon name="close" size={14} color="#9ca3af" /></button>
              )}
            </div>

            {/* Date */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Date
              </label>
              <input
                type="date"
                value={slot.date}
                min={today()}
                onChange={e => updateSlot(i, 'date', e.target.value)}
                style={{
                  width: '100%', padding: '11px 14px', background: '#fff',
                  border: '2px solid #e5e7eb', borderRadius: 12,
                  fontSize: 15, color: '#1F1F20', boxSizing: 'border-box',
                }}
              />
              {slot.date && (
                <div style={{ fontSize: 12, color: '#2BABE1', marginTop: 4, fontWeight: 600 }}>
                  {fmtDate(slot.date)}
                </div>
              )}
            </div>

            {/* Heures */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Début
                </label>
                <select
                  value={slot.start}
                  onChange={e => updateSlot(i, 'start', e.target.value)}
                  style={{
                    width: '100%', padding: '11px 14px', background: '#fff',
                    border: '2px solid #e5e7eb', borderRadius: 12,
                    fontSize: 15, color: '#1F1F20', boxSizing: 'border-box',
                  }}
                >
                  {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Fin
                </label>
                <select
                  value={slot.end}
                  onChange={e => updateSlot(i, 'end', e.target.value)}
                  style={{
                    width: '100%', padding: '11px 14px', background: '#fff',
                    border: '2px solid #e5e7eb', borderRadius: 12,
                    fontSize: 15, color: '#1F1F20', boxSizing: 'border-box',
                  }}
                >
                  {TIMES.filter(t => t > slot.start).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
        ))}

        {/* Ajouter créneau */}
        {slots.length < 4 && (
          <button onClick={addSlot} style={{
            width: '100%', padding: '12px', background: 'none',
            border: '2px dashed #d1d5db', borderRadius: 14,
            color: '#6b7280', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginBottom: 16,
          }}>
            + Ajouter une disponibilité
          </button>
        )}

        {/* Message optionnel */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Message (optionnel)
          </label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Précise ce que tu souhaites travailler…"
            rows={3}
            style={{
              width: '100%', padding: '12px 14px', background: '#f4f6f8',
              border: '2px solid #e5e7eb', borderRadius: 12,
              fontSize: 14, color: '#1F1F20', resize: 'none', boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Erreur */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12,
            padding: '10px 14px', marginBottom: 14, fontSize: 13,
            color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="warning" size={16} color="#dc2626" /> {error}
          </div>
        )}

        {/* Récap tarif + explication paiement après confirmation */}
        <div style={{
          background: '#f4f6f8', borderRadius: 14, padding: '12px 14px', marginBottom: 12,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div style={{ fontSize: 13, color: '#4b5563' }}>Tarif</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0E5A80' }}>{price} CHF</div>
        </div>

        <div style={{
          background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 12,
          padding: '10px 14px', marginBottom: 14, fontSize: 12, color: '#1e40af',
          lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8,
        }}>
          <Icon name="info" size={14} color="#1e40af" style={{ marginTop: 2, flexShrink: 0 }} />
          <span>Tu ne paies <strong>rien maintenant</strong>. Tiffany te confirme un créneau dans les meilleurs délais — c'est seulement à ce moment-là que tu pourras régler {price} CHF directement dans l'app.</span>
        </div>

        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '16px',
          background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
          color: '#fff', border: 'none', borderRadius: 16,
          fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? (
            <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Envoi de la demande…</>
          ) : (
            <><Icon name="mail" size={16} color="#fff" /> Envoyer ma demande</>
          )}
        </button>

        <div style={{ fontSize: 11, color: '#9ca3af', textAlign: 'center', marginTop: 10, lineHeight: 1.4 }}>
          Paiement sécurisé par Stripe (Visa, Mastercard, TWINT) au moment de la confirmation.
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
