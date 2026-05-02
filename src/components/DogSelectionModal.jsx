// src/components/DogSelectionModal.jsx
// Modal pour sélectionner avec quel(s) chien(s) le membre vient à un cours collectif.
// Sélection multiple possible. Aucun chien coché par défaut → le membre doit
// explicitement valider qui il prend, pour éviter les inscriptions par erreur.

import { useState } from 'react';
import Icon from './Icons';

export default function DogSelectionModal({ dogs, courseLabel, onConfirm, onCancel }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      await onConfirm(selectedIds);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div onClick={onCancel} style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
        zIndex: 9000, animation: 'fadeIn 0.2s ease',
      }} />
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderRadius: '24px 24px 0 0', zIndex: 9001,
        padding: '0 20px calc(28px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        maxHeight: '85dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        <div style={{ marginTop: 8, marginBottom: 6, fontSize: 18, fontWeight: 800, color: '#1F1F20', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="dog" size={20} color="#2BABE1" /> Avec quel chien viens-tu ?
        </div>
        {courseLabel && (
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 16 }}>
            {courseLabel}
          </div>
        )}

        {dogs.length === 0 && (
          <div style={{ background: '#fef3c7', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: '#92400e', marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="warning" size={16} color="#92400e" style={{ marginTop: 2, flexShrink: 0 }} />
            Tu n'as pas encore enregistré de chien. Va dans ton profil pour ajouter ton compagnon avant de t'inscrire.
          </div>
        )}

        {dogs.map(dog => {
          const isSelected = selectedIds.includes(dog.id);
          return (
            <button
              key={dog.id}
              onClick={() => toggle(dog.id)}
              style={{
                width: '100%', padding: '12px 14px', marginBottom: 8,
                background: isSelected ? '#e8f7fd' : '#f4f6f8',
                border: `2px solid ${isSelected ? '#2BABE1' : 'transparent'}`,
                borderRadius: 14, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
            >
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                background: isSelected ? '#2BABE1' : '#fff',
                border: `2px solid ${isSelected ? '#2BABE1' : '#d1d5db'}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && <Icon name="check" size={14} color="#fff" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#1F1F20' }}>{dog.name}</div>
                {(dog.breed || dog.sex || dog.birth_year) && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                    {[dog.breed, dog.sex === 'M' ? '♂' : dog.sex === 'F' ? '♀' : null, dog.birth_year ? `né${dog.sex === 'F' ? 'e' : ''} en ${dog.birth_year}` : null].filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <Icon name="dog" size={18} color={isSelected ? '#2BABE1' : '#9ca3af'} />
            </button>
          );
        })}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button onClick={onCancel} style={{
            flex: 1, padding: '14px', background: '#f4f6f8', border: 'none', borderRadius: 14,
            fontSize: 14, fontWeight: 700, color: '#6b7280', cursor: 'pointer',
          }}>
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.length === 0 || submitting}
            style={{
              flex: 2, padding: '14px',
              background: selectedIds.length === 0
                ? '#cbd5e1'
                : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
              border: 'none', borderRadius: 14,
              fontSize: 14, fontWeight: 800, color: '#fff',
              cursor: selectedIds.length === 0 ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {submitting ? '…' : (
              <><Icon name="check" size={14} color="#fff" /> M'inscrire {selectedIds.length > 0 ? `(${selectedIds.length} chien${selectedIds.length > 1 ? 's' : ''})` : ''}</>
            )}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
      `}</style>
    </>
  );
}
