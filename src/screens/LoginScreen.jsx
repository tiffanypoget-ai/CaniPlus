// src/screens/LoginScreen.jsx
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

export default function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  // Login fields
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');

  // Register fields
  const [regName, setRegName]         = useState('');
  const [regEmail, setRegEmail]       = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm]   = useState('');

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  // Mot de passe oublié
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail]         = useState('');
  const [resetLoading, setResetLoading]     = useState(false);
  const [resetError, setResetError]         = useState('');
  const [resetSuccess, setResetSuccess]     = useState(false);

  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetEmail.trim()) { setResetError('Merci de saisir ton adresse e-mail.'); return; }
    setResetLoading(true); setResetError('');
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim().toLowerCase(), {
      redirectTo: 'https://cani-plus.vercel.app/reset-password',
    });
    setResetLoading(false);
    if (error) {
      setResetError("Une erreur s'est produite. Vérifie l'adresse e-mail.");
    } else {
      setResetSuccess(true);
    }
  };

  const closeResetModal = () => {
    setShowResetModal(false);
    setResetEmail('');
    setResetError('');
    setResetSuccess(false);
  };

  const inputStyle = (focused) => ({
    width: '100%', padding: '14px 16px',
    background: focused ? '#e8f7fd' : '#f4f6f8',
    border: `2px solid ${focused ? '#2BABE1' : '#e5e7eb'}`,
    borderRadius: 14, fontSize: 15, color: '#1F1F20',
    transition: 'border-color 0.2s, background 0.2s',
    boxSizing: 'border-box',
  });

  const [focused, setFocused] = useState({});
  const onFocus = (k) => setFocused(f => ({ ...f, [k]: true }));
  const onBlur  = (k) => setFocused(f => ({ ...f, [k]: false }));

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Merci de remplir tous les champs.'); return; }
    setLoading(true); setError('');
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) setError('E-mail ou mot de passe incorrect.');
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!regName.trim() || !regEmail.trim() || !regPassword || !regConfirm) {
      setError('Merci de remplir tous les champs.'); return;
    }
    if (regPassword.length < 8) {
      setError('Le mot de passe doit faire au moins 8 caractères.'); return;
    }
    if (regPassword !== regConfirm) {
      setError('Les mots de passe ne correspondent pas.'); return;
    }
    setLoading(true); setError(''); setSuccess('');
    const { error } = await signUp(regEmail.trim().toLowerCase(), regPassword, regName.trim());
    setLoading(false);
    if (error) {
      setError(error.message === 'User already registered'
        ? 'Un compte existe déjà avec cet e-mail.'
        : "Une erreur s'est produite. Réessaie.");
    } else {
      setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.');
      setRegName(''); setRegEmail(''); setRegPassword(''); setRegConfirm('');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #1F1F20 0%, #2a3a4a 55%, #2BABE1 100%)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 52px) 32px 48px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'rgba(43,171,225,0.12)', top: -80, right: -80 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 58, color: '#fff', lineHeight: 1.1 }}>CaniPlus</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>Votre espace club canin</div>
        </div>
        <div style={{ position: 'absolute', bottom: -10, right: 24, fontSize: 100, opacity: 0.08 }}>🐾</div>
      </div>

      {/* Card */}
      <div style={{
        flex: 1, background: '#fff',
        borderRadius: '28px 28px 0 0', marginTop: -20,
        padding: '28px 28px 40px',
      }} className="fade-up">

        {/* Onglets */}
        <div style={{ display: 'flex', background: '#f4f6f8', borderRadius: 14, padding: 4, marginBottom: 28 }}>
          {[['login', 'Se connecter'], ['register', 'Créer un compte']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setError(''); setSuccess(''); }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 11, fontSize: 14, fontWeight: 700,
                background: tab === key ? '#fff' : 'transparent',
                color: tab === key ? '#1F1F20' : '#9ca3af',
                boxShadow: tab === key ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.2s', cursor: 'pointer',
              }}>
              {label}
            </button>
          ))}
        </div>

        {/* ─── CONNEXION ─── */}
        {tab === 'login' && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>Bon retour ! 👋</h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>Connectez-vous à votre espace membre</p>
            <form onSubmit={handleLogin}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Adresse e-mail</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)}
                  onFocus={() => onFocus('email')} onBlur={() => onBlur('email')}
                  placeholder="votre@email.com" style={inputStyle(focused.email)} />
              </div>
              <div style={{ marginBottom: 6 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Mot de passe</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  onFocus={() => onFocus('pass')} onBlur={() => onBlur('pass')}
                  placeholder="••••••••" style={inputStyle(focused.pass)} />
              </div>
              <div style={{ textAlign: 'right', marginBottom: 22 }}>
                <span
                  onClick={() => { setShowResetModal(true); setResetEmail(email); }}
                  style={{ fontSize: 13, color: '#2BABE1', fontWeight: 700, cursor: 'pointer' }}
                >
                  Mot de passe oublié ?
                </span>
              </div>
              {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 600 }}>⚠️ {error}</div>}
              <button type="submit" disabled={loading} style={{
                width: '100%', padding: '17px',
                background: loading ? '#93c5e8' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
                color: '#fff', borderRadius: 16, fontSize: 16, fontWeight: 800,
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 8px 24px rgba(43,171,225,0.35)',
              }}>
                {loading ? 'Connexion...' : 'Se connecter'}
              </button>
            </form>
          </>
        )}

        {/* ─── INSCRIPTION ─── */}
        {tab === 'register' && (
          <>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>Rejoindre CaniPlus 🐶</h2>
            <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>Créez votre espace membre gratuit</p>
            {success ? (
              <div style={{ background: '#d1fae5', color: '#065f46', padding: '20px', borderRadius: 16, fontSize: 15, fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
                 ✅ {success}
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => { setTab('login'); setSuccess(''); setError(''); }}
                    style={{ background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)', color: '#fff', padding: '12px 28px', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Se connecter
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleRegister}>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Prénom et nom</label>
                  <input type="text" value={regName} onChange={e => setRegName(e.target.value)}
                    onFocus={() => onFocus('name')} onBlur={() => onBlur('name')}
                    placeholder="Marie Dupont" style={inputStyle(focused.name)} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Adresse e-mail</label>
                  <input type="email" value={regEmail} onChange={e => setRegEmail(e.target.value)}
                    onFocus={() => onFocus('remail')} onBlur={() => onBlur('remail')}
                    placeholder="votre@email.com" style={inputStyle(focused.remail)} />
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Mot de passe</label>
                  <input type="password" value={regPassword} onChange={e => setRegPassword(e.target.value)}
                    onFocus={() => onFocus('rpass')} onBlur={() => onBlur('rpass')}
                    placeholder="8 caractères minimum" style={inputStyle(focused.rpass)} />
                </div>
                <div style={{ marginBottom: 22 }}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Confirmer le mot de passe</label>
                  <input type="password" value={regConfirm} onChange={e => setRegConfirm(e.target.value)}
                    onFocus={() => onFocus('rconfirm')} onBlur={() => onBlur('rconfirm')}
                    placeholder="••••••••" style={inputStyle(focused.rconfirm)} />
                </div>
                {error && <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 600 }}>⚠️ {error}</div>}
                <button type="submit" disabled={loading} style={{
                  width: '100%', padding: '17px',
                  background: loading ? '#93c5e8' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
                  color: '#fff', borderRadius: 16, fontSize: 16, fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  boxShadow: '0 8px 24px rgba(43,171,225,0.35)',
                }}>
                  {loading ? 'Création...' : 'Créer mon compte'}
                </button>
              </form>
            )}
          </>
        )}
      </div>

      {/* ─── MODALE MOT DE PASSE OUBLIÉ ─── */}
      {showResetModal && (
        <div
          onClick={closeResetModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: '24px 24px 0 0', width: '100%', maxWidth: 480, padding: '28px 28px 40px' }}
          >
            {resetSuccess ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>📬</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1F1F20', marginBottom: 8 }}>E-mail envoyé !</div>
                <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5, marginBottom: 24 }}>
                  Vérifie ta boîte mail et clique sur le lien pour réinitialiser ton mot de passe.<br />
                  <span style={{ fontSize: 12, color: '#9ca3af' }}>Pense à vérifier les spams.</span>
                </div>
                <button
                  onClick={closeResetModal}
                  style={{ width: '100%', padding: '14px', background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)', color: '#fff', borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer', border: 'none' }}
                >
                  Fermer
                </button>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>🔑 Mot de passe oublié</div>
                <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 22 }}>
                  Saisis ton adresse e-mail et nous t'enverrons un lien pour créer un nouveau mot de passe.
                </div>
                <form onSubmit={handleResetPassword}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>Adresse e-mail</label>
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={e => setResetEmail(e.target.value)}
                    placeholder="votre@email.com"
                    autoFocus
                    style={{
                      width: '100%', padding: '14px 16px',
                      background: '#f4f6f8', border: '2px solid #e5e7eb',
                      borderRadius: 14, fontSize: 15, color: '#1F1F20',
                      boxSizing: 'border-box', marginBottom: 16, outline: 'none',
                    }}
                  />
                  {resetError && (
                    <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                      ⚠️ {resetError}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button
                      type="button"
                      onClick={closeResetModal}
                      style={{ flex: 1, padding: '13px', borderRadius: 12, border: 'none', background: '#f4f6f8', color: '#6b7280', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={resetLoading}
                      style={{
                        flex: 2, padding: '13px',
                        background: resetLoading ? '#93c5e8' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
                        color: '#fff', borderRadius: 12, fontSize: 14, fontWeight: 700,
                        cursor: resetLoading ? 'not-allowed' : 'pointer', border: 'none',
                        boxShadow: '0 4px 16px rgba(43,171,225,0.3)',
                      }}
                    >
                      {resetLoading ? 'Envoi…' : 'Envoyer le lien'}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
