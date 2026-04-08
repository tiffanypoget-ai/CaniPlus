// src/screens/LoginScreen.js
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [passFocused, setPassFocused] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) { setError('Merci de remplir tous les champs.'); return; }
    setLoading(true); setError('');
    const { error } = await signIn(email.trim().toLowerCase(), password);
    setLoading(false);
    if (error) setError('E-mail ou mot de passe incorrect.');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header gradient */}
      <div style={{
        background: 'linear-gradient(160deg, #1F1F20 0%, #2a3a4a 55%, #2BABE1 100%)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 60px) 32px 56px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', width: 280, height: 280, borderRadius: '50%', background: 'rgba(43,171,225,0.12)', top: -80, right: -80 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 58, color: '#fff', lineHeight: 1.1 }}>CaniPlus</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>Votre espace club canin</div>
        </div>
        <div style={{ position: 'absolute', bottom: -10, right: 24, fontSize: 100, opacity: 0.08 }}>🐾</div>
      </div>

      {/* Formulaire */}
      <div style={{
        flex: 1, background: '#fff',
        borderRadius: '28px 28px 0 0', marginTop: -20,
        padding: '36px 28px 40px',
      }} className="fade-up">
        <h2 style={{ fontSize: 24, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>Bon retour ! 👋</h2>
        <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 28 }}>Connectez-vous à votre espace membre</p>

        <form onSubmit={handleLogin}>
          {/* Email */}
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>
              Adresse e-mail
            </label>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="votre@email.com"
              style={{
                width: '100%', padding: '14px 16px',
                background: emailFocused ? '#e8f7fd' : '#f4f6f8',
                border: `2px solid ${emailFocused ? '#2BABE1' : '#e5e7eb'}`,
                borderRadius: 14, fontSize: 15, color: '#1F1F20',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            />
          </div>

          {/* Mot de passe */}
          <div style={{ marginBottom: 6 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#1F1F20', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 7 }}>
              Mot de passe
            </label>
            <input
              type="password" value={password}
              onChange={e => setPassword(e.target.value)}
              onFocus={() => setPassFocused(true)}
              onBlur={() => setPassFocused(false)}
              placeholder="••••••••"
              style={{
                width: '100%', padding: '14px 16px',
                background: passFocused ? '#e8f7fd' : '#f4f6f8',
                border: `2px solid ${passFocused ? '#2BABE1' : '#e5e7eb'}`,
                borderRadius: 14, fontSize: 15, color: '#1F1F20',
                transition: 'border-color 0.2s, background 0.2s',
              }}
            />
          </div>

          <div style={{ textAlign: 'right', marginBottom: 24 }}>
            <span style={{ fontSize: 13, color: '#2BABE1', fontWeight: 700, cursor: 'pointer' }}>Mot de passe oublié ?</span>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 600 }}>
              ⚠️ {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            width: '100%', padding: '17px',
            background: loading ? '#93c5e8' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
            color: '#fff', borderRadius: 16,
            fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            boxShadow: '0 8px 24px rgba(43,171,225,0.35)',
            transition: 'opacity 0.2s',
          }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 13, color: '#6b7280', marginTop: 20 }}>
          Pas encore membre ?{' '}
          <span style={{ color: '#2BABE1', fontWeight: 700 }}>Contactez CaniPlus</span>
        </p>
      </div>
    </div>
  );
}
