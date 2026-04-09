// src/screens/OnboardingScreen.jsx
// Ãcran affichÃ© Ã  la premiÃ¨re connexion pour choisir le type de cours

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const OPTIONS = [
  {
    key: 'group',
    emoji: 'ð¥',
    title: 'Cours collectifs',
    desc: 'Tu rejoins les cours de groupe selon le planning annuel.',
  },
  {
    key: 'private',
    emoji: 'ð¯',
    title: 'Cours privÃ©s',
    desc: 'Tu prends des cours individuels Ã  des crÃ©neaux dÃ©finis avec le moniteur.',
  },
  {
    key: 'both',
    emoji: 'ð¾',
    title: 'Les deux',
    desc: 'Tu participes aux cours collectifs ET aux sÃ©ances privÃ©es.',
  },
];

export default function OnboardingScreen({ userId, onDone }) {
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    if (!selected) return;
    setLoading(true);
    await supabase
      .from('profiles')
      .update({ course_type: selected, onboarding_done: true })
      .eq('id', userId);
    setLoading(false);
    onDone();
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100dvh',
      background: 'linear-gradient(160deg, #1F1F20 0%, #1a3a4a 100%)',
      padding: 'calc(env(safe-area-inset-top,0px) + 32px) 24px calc(env(safe-area-inset-bottom,0px) + 32px)',
    }}>
      {/* Logo */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 48, marginBottom: 8 }}>ð</div>
        <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 42, color: '#fff', lineHeight: 1 }}>CaniPlus</div>
      </div>

      {/* Titre */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 8 }}>
          Bienvenue ! ð
        </div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
          Tu viens au club pour quels types de cours ?
        </div>
      </div>

      {/* Choix */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {OPTIONS.map(opt => {
          const isSelected = selected === opt.key;
          return (
            <button
              key={opt.key}
              onClick={() => setSelected(opt.key)}
              style={{
                background: isSelected
                  ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)'
                  : 'rgba(255,255,255,0.08)',
                border: isSelected ? '2px solid #2BABE1' : '2px solid rgba(255,255,255,0.15)',
                borderRadius: 18,
                padding: '18px 20px',
                display: 'flex',
                alignItems: 'center',
                gap: 16,
                cursor: 'pointer',
                transition: 'all 0.2s',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{
                width: 52, height: 52, borderRadius: 14, flexShrink: 0,
                background: isSelected ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 26,
              }}>
                {opt.emoji}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4 }}>
                  {opt.title}
                </div>
                <div style={{ fontSize: 13, color: isSelected ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>
                  {opt.desc}
                </div>
              </div>
              {isSelected && (
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ color: '#2BABE1', fontSize: 14 }}>â</span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Bouton confirmer */}
      <button
        onClick={handleConfirm}
        disabled={!selected || loading}
        style={{
          marginTop: 24,
          width: '100%', padding: '17px',
          background: selected
            ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)'
            : 'rgba(255,255,255,0.1)',
          border: 'none', borderRadius: 16,
          color: selected ? '#fff' : 'rgba(255,255,255,0.3)',
          fontSize: 16, fontWeight: 800,
          cursor: selected ? 'pointer' : 'not-allowed',
          transition: 'all 0.2s',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}
      >
        {loading ? (
          <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Enregistrement...</>
        ) : (
          'Commencer â'
        )}
      </button>

      <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
        Tu pourras modifier ton choix dans ton profil
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
