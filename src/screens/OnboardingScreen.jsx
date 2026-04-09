// src/screens/OnboardingScreen.jsx
// Écran affiché à la première connexion pour choisir le type de cours

import { useState } from 'react';
import { supabase } from '../lib/supabase';

const OPTIONS = [
  {
    key: 'group',
    emoji: '👥',
    title: 'Cours collectifs',
    desc: 'Planning annuel avec le groupe',
  },
  {
    key: 'private',
    emoji: '🎯',
    title: 'Cours privés',
    desc: 'Séances individuelles avec le moniteur',
  },
  {
    key: 'both',
    emoji: '🐾',
    title: 'Les deux',
    desc: 'Collectifs + séances privées',
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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* ── Header sombre ── */}
      <div style={{
        background: 'linear-gradient(160deg, #1F1F20 0%, #2a3a4a 55%, #2BABE1 100%)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 52px) 32px 52px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* Cercle décoratif */}
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'rgba(43,171,225,0.12)', top: -70, right: -70 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 54, color: '#fff', lineHeight: 1.1 }}>CaniPlus</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>Votre espace club canin</div>
        </div>
        {/* Patte décorative */}
        <div style={{ position: 'absolute', bottom: -8, right: 24, fontSize: 90, opacity: 0.08 }}>🐾</div>
      </div>

      {/* ── Carte blanche ── */}
      <div style={{
        flex: 1, background: '#fff',
        borderRadius: '28px 28px 0 0', marginTop: -20,
        padding: '32px 24px calc(env(safe-area-inset-bottom,0px) + 28px)',
        display: 'flex', flexDirection: 'column',
      }}>

        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', marginBottom: 4 }}>
          Bienvenue ! 👋
        </h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
          Pour quels types de cours venez-vous au club ?
        </p>

        {/* Choix */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
          {OPTIONS.map(opt => {
            const isSelected = selected === opt.key;
            return (
              <button
                key={opt.key}
                onClick={() => setSelected(opt.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '16px 18px',
                  background: isSelected ? '#e8f7fd' : '#f8f9fb',
                  border: `2px solid ${isSelected ? '#2BABE1' : '#e5e7eb'}`,
                  borderRadius: 18,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'border-color 0.15s, background 0.15s',
                }}
              >
                {/* Icône */}
                <div style={{
                  width: 50, height: 50, borderRadius: 14, flexShrink: 0,
                  background: isSelected ? 'rgba(43,171,225,0.15)' : '#fff',
                  border: `1.5px solid ${isSelected ? 'rgba(43,171,225,0.3)' : '#e5e7eb'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24,
                }}>
                  {opt.emoji}
                </div>
                {/* Texte */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: isSelected ? '#1a8bbf' : '#1F1F20', marginBottom: 2 }}>
                    {opt.title}
                  </div>
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>
                    {opt.desc}
                  </div>
                </div>
                {/* Check */}
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isSelected ? '#2BABE1' : '#d1d5db'}`,
                  background: isSelected ? '#2BABE1' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s',
                }}>
                  {isSelected && <span style={{ color: '#fff', fontSize: 12, lineHeight: 1 }}>✓</span>}
                </div>
              </button>
            );
          })}
        </div>

        {/* Bouton */}
        <button
          onClick={handleConfirm}
          disabled={!selected || loading}
          style={{
            marginTop: 24, width: '100%', padding: '17px',
            background: selected
              ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)'
              : '#e5e7eb',
            border: 'none', borderRadius: 16,
            color: selected ? '#fff' : '#9ca3af',
            fontSize: 16, fontWeight: 800,
            cursor: selected ? 'pointer' : 'not-allowed',
            boxShadow: selected ? '0 8px 24px rgba(43,171,225,0.35)' : 'none',
            transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Enregistrement...
            </>
          ) : (
            'Commencer →'
          )}
        </button>

        <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#9ca3af' }}>
          Tu pourras modifier ton choix dans ton profil.
        </p>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
