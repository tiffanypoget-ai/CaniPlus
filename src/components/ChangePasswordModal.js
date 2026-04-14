// src/components/ChangePasswordModal.js
// Permet à un membre de changer son mot de passe via Supabase Auth

import { useState } from 'react';
import { supabase } from '../lib/supabase';

export default function ChangePasswordModal({ onClose, isRecovery = false }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [success,    setSuccess]    = useState(false);

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const strength = newPwd.length === 0 ? 0 : newPwd.length < 6 ? 1 : newPwd.length < 10 ? 2 : 3;
  const strengthLabel = ['', 'Trop court', 'Correct', 'Fort 💪'][strength];
  const strengthColor = ['', '#ef4444', '#f59e0b', '#16a34a'][strength];

  const handleSubmit = async () => {
    if (newPwd.length < 8) { setError('Le mot de passe doit contenir au moins 8 caractères.'); return; }
    if (newPwd !== confirmPwd) { setError('Les mots de passe ne correspondent pas.'); return; }
    // Vérifier le mot de passe actuel sauf en flux récupération
    if (!isRecovery) {
      if (!currentPwd) { setError('Merci de saisir ton mot de passe actuel.'); return; }
      setLoading(true); setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) { setLoading(false); setError('Session introuvable. Reconnecte-toi.'); return; }
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPwd,
      });
      if (signErr) {
        setLoading(false);
        setError('Mot de passe actuel incorrect.');
        return;
      }
    } else {
      setLoading(true); setError(null);
    }
    const { error: e } = await supabase.auth.updateUser({ password: newPwd });
    setLoading(false);
    if (e) setError('Erreur lors du changement. Reconnecte-toi et réessaie.');
    else setSuccess(true);
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.2s ease' }} />

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderRadius: '24px 24px 0 0', zIndex: 201,
        padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {!success ? (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 22 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>🔒 Changer le mot de passe</div>
              <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#6b7280' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Mot de passe actuel (sauf en flux récupération) */}
              {!isRecovery && (
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Mot de passe actuel</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showCurrent ? 'text' : 'password'}
                      value={currentPwd} onChange={e => { setCurrentPwd(e.target.value); setError(null); }}
                      placeholder="Ton mot de passe actuel"
                      style={{ width: '100%', padding: '13px 48px 13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: '#1F1F20', boxSizing: 'border-box' }}
                    />
                    <button onClick={() => setShowCurrent(!showCurrent)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                      {showCurrent ? '🙈' : '👁️'}
                    </button>
                  </div>
                </div>
              )}

              {/* Nouveau mot de passe */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Nouveau mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPwd} onChange={e => { setNewPwd(e.target.value); setError(null); }}
                    placeholder="Min. 8 caractères"
                    style={{ width: '100%', padding: '13px 48px 13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: '#1F1F20', boxSizing: 'border-box' }}
                  />
                  <button onClick={() => setShowNew(!showNew)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showNew ? '🙈' : '👁️'}
                  </button>
                </div>
                {newPwd.length > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                    {[1,2,3].map(i => (
                      <div key={i} style={{ flex: 1, height: 4, borderRadius: 99, background: i <= strength ? strengthColor : '#e5e7eb', transition: 'background 0.3s' }} />
                    ))}
                    <span style={{ fontSize: 11, fontWeight: 700, color: strengthColor, minWidth: 60 }}>{strengthLabel}</span>
                  </div>
                )}
              </div>

              {/* Confirmer */}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Confirmer le mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPwd} onChange={e => { setConfirmPwd(e.target.value); setError(null); }}
                    placeholder="Répète le mot de passe"
                    style={{ width: '100%', padding: '13px 48px 13px 14px', background: '#f4f6f8', border: `2px solid ${confirmPwd && newPwd !== confirmPwd ? '#fecaca' : '#e5e7eb'}`, borderRadius: 12, fontSize: 15, color: '#1F1F20', boxSizing: 'border-box' }}
                  />
                  <button onClick={() => setShowConfirm(!showConfirm)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 18 }}>
                    {showConfirm ? '🙈' : '👁️'}
                  </button>
                </div>
                {confirmPwd && newPwd !== confirmPwd && (
                  <div style={{ fontSize: 12, color: '#ef4444', marginTop: 4, fontWeight: 600 }}>Les mots de passe ne correspondent pas</div>
                )}
              </div>
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginTop: 14, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>⚠️ {error}</div>
            )}

            <button
              onClick={handleSubmit} disabled={loading}
              style={{
                width: '100%', marginTop: 20,
                background: loading ? '#93c5fd' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
                color: '#fff', border: 'none', borderRadius: 16, padding: '16px',
                fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {loading
                ? <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Mise à jour...</>
                : '🔒 Changer le mot de passe'}
            </button>
          </>
        ) : (
          /* Succès */
          <div style={{ textAlign: 'center', padding: '24px 0 8px' }}>
            <div style={{ width: 72, height: 72, background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20', marginBottom: 8 }}>Mot de passe modifié !</div>
            <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>Ton nouveau mot de passe est actif.</div>
            <button onClick={onClose} style={{ background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px 28px', fontSize: 15, fontWeight: 800, cursor: 'pointer' }}>
              Fermer
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
