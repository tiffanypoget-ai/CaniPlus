// src/components/PushPermissionModal.js
// Soft prompt avant le prompt natif du navigateur pour les notifications push.
// Pattern : on demande d'abord a l'utilisateur dans NOTRE UI s'il veut les notifs,
// avec le contexte (a quoi ca sert), puis seulement si oui on declenche la
// permission native. Si l'utilisateur dit "Plus tard", la permission reste a
// 'default' et on pourra redemander plus tard. Si on declenche le natif tout
// de suite et qu'il refuse, c'est cuit pour 90 jours minimum (Chrome) ou pour
// toujours (Safari). D'ou ce soft prompt.

import { useState } from 'react';
import Icon from './Icons';

export default function PushPermissionModal({ onAccept, onDismiss }) {
  const [loading, setLoading] = useState(false);

  const handleAccept = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onAccept();
    } finally {
      setLoading(false);
    }
  };

  const benefits = [
    { icon: 'bell',     title: 'Nouveaux articles',       desc: 'Tu reçois une notif dès qu\'un nouveau conseil est publié.' },
    { icon: 'calendar', title: 'Rappels de cours',         desc: 'Un rappel doux la veille de ton cours, pour ne plus l\'oublier.' },
    { icon: 'heart',    title: 'Vaccins de ton chien',     desc: 'Une alerte quand un rappel vaccin approche, pour rien rater.' },
  ];

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 300, animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Bottom sheet */}
      <div
        role="dialog"
        aria-labelledby="push-modal-title"
        style={{
          position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
          width: '100%', maxWidth: 430,
          background: '#fff', borderRadius: '24px 24px 0 0',
          zIndex: 301, padding: '0 24px calc(28px + env(safe-area-inset-bottom,0px))',
          animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
          boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        }}
      >

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 8px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {/* Icone cloche */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14, marginBottom: 18 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18,
            background: 'linear-gradient(135deg, #2BABE1 0%, #1E8DB8 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 6px 20px rgba(43,171,225,0.35)',
          }}>
            <Icon name="bell" size={30} color="#FFFFFF" />
          </div>
        </div>

        {/* Titre + sous-titre */}
        <h2 id="push-modal-title" style={{
          margin: 0, textAlign: 'center',
          fontSize: 22, fontWeight: 800, color: '#1F1F20',
          fontFamily: '"Playfair Display", Georgia, serif',
          letterSpacing: '-0.3px',
        }}>
          Reste au courant
        </h2>
        <p style={{
          margin: '6px 0 22px 0', textAlign: 'center',
          fontSize: 14, color: '#6b7280', lineHeight: 1.5,
        }}>
          Active les notifications pour ne rien rater de ce qui se passe au club et avec ton chien.
        </p>

        {/* Liste des benefices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 22 }}>
          {benefits.map(b => (
            <div key={b.title} style={{
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px 14px', background: '#f8f5f0', borderRadius: 14,
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: '#e8f6fc',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Icon name={b.icon} size={18} color="#1E8DB8" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20', marginBottom: 2 }}>{b.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.4 }}>{b.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Boutons */}
        <button
          onClick={handleAccept}
          disabled={loading}
          style={{
            width: '100%', padding: '15px 20px', marginBottom: 10,
            background: loading ? '#9ca3af' : 'linear-gradient(135deg, #2BABE1 0%, #1E8DB8 100%)',
            color: '#FFFFFF', border: 0, borderRadius: 14,
            fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 4px 14px rgba(43,171,225,0.35)',
            transition: 'transform 0.1s, box-shadow 0.2s',
          }}
        >
          {loading ? 'Activation...' : 'Activer les notifications'}
        </button>
        <button
          onClick={onDismiss}
          disabled={loading}
          style={{
            width: '100%', padding: '13px 20px',
            background: 'transparent',
            color: '#6b7280', border: 0, borderRadius: 14,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Plus tard
        </button>

        {/* Note discrete */}
        <p style={{
          margin: '14px 0 0 0', textAlign: 'center',
          fontSize: 11, color: '#9ca3af', lineHeight: 1.4,
        }}>
          Tu peux désactiver les notifications à tout moment depuis ton profil.
        </p>
      </div>
    </>
  );
}
