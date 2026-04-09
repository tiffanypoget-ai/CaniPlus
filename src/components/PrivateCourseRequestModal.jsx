// src/components/PrivateCourseRequestModal.jsx
// Modal pour proposer des disponibilitÃ©s pour un cours privÃ©

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const TIMES = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '12:00','13:00','14:00','14:30','15:00','15:30','16:00','16:30',
  '17:00','17:30','18:00','18:30','19:00','19:30','20:00',
];

function today() {
  return new Date().toISOString().split('T')[0];
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const days = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
  const months = ['jan','fÃ©v','mar','avr','mai','jun','jul','aoÃ»','sep','oct','nov','dÃ©c'];
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

const emptySlot = () => ({ date: '', start: '09:30', end: '10:30' });

export default function PrivateCourseRequestModal({ userId, onClose, onSaved }) {
  const [slots, setSlots] = useState([emptySlot(), emptySlot()]);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const updateSlot = (i, field, val) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: val } : s));
    setError(null);
  };

  const addSlot = () => {
    if (slots.length < 4) setSlots(prev => [...prev, emptySlot()]);
  };

  const removeSlot = (i) => {
    if (slots.length > 1) setSlots(prev => prev.filter((_, idx) => idx !== i));
  };

  const handleSubmit = async () => {
    const filled = slots.filter(s => s.date && s.start && s.end);
    if (filled.length === 0) {
      setError('Indique au moins une disponibilitÃ©.');
      return;
    }
    // VÃ©rifier que end > start
    for (const s of filled) {
      if (s.start >= s.end) {
        setError('L\'heure de fin doit Ãªtre aprÃ¨s l\'heure de dÃ©but.');
        return;
      }
    }
    setLoading(true);
    const { error: err } = await supabase
      .from('private_course_requests')
      .insert({
        user_id: userId,
        availability_slots: filled,
        status: 'pending',
        admin_notes: notes || null,
      });
    setLoading(false);
    if (err) { setError('Erreur lors de l\'envoi. RÃ©essaie.'); return; }
    onSaved();
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
        maxHeight: '90dvh', overflowY: 'auto',
      }}>
        {/* PoignÃ©e */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {/* Titre */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>ð¯ Cours privÃ©</div>
          <button onClick={onClose} style={{
            background: '#f4f6f8', border: 'none', borderRadius: 10,
            width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#6b7280',
          }}>â</button>
        </div>

        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 }}>
          Propose jusqu'Ã  4 crÃ©neaux oÃ¹ tu es disponible. Le moniteur confirmera l'un d'eux.
        </div>

        {/* CrÃ©neaux */}
        {slots.map((slot, i) => (
          <div key={i} style={{
            background: '#f4f6f8', borderRadius: 16, padding: 14,
            marginBottom: 10, position: 'relative',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                DisponibilitÃ© {i + 1}
              </div>
              {slots.length > 1 && (
                <button onClick={() => removeSlot(i)} style={{
                  background: 'none', border: 'none', color: '#9ca3af',
                  fontSize: 16, cursor: 'pointer', padding: '2px 6px',
                }}>â</button>
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
                  DÃ©but
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

        {/* Ajouter crÃ©neau */}
        {slots.length < 4 && (
          <button onClick={addSlot} style={{
            width: '100%', padding: '12px', background: 'none',
            border: '2px dashed #d1d5db', borderRadius: 14,
            color: '#6b7280', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', marginBottom: 16,
          }}>
            + Ajouter une disponibilitÃ©
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
            placeholder="PrÃ©cise ce que tu souhaites travaillerâ¦"
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
            color: '#dc2626', fontWeight: 600,
          }}>
            â ï¸ {error}
          </div>
        )}

        {/* Bouton envoyer */}
        <button onClick={handleSubmit} disabled={loading} style={{
          width: '100%', padding: '16px',
          background: loading ? '#93c5fd' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
          color: '#fff', border: 'none', borderRadius: 16,
          fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? (
            <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Envoi...</>
          ) : (
            'ð¨ Envoyer ma demande'
          )}
        </button>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
