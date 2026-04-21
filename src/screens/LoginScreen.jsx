// src/screens/LoginScreen.jsx
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

function useIsDesktop(breakpoint = 600) {
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth > breakpoint);
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth > breakpoint);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);
  return isDesktop;
}

export default function LoginScreen({ onBack }) {
  const isDesktop = useIsDesktop();
  const { signIn, signUp } = useAuth();
  const [tab, setTab] = useState('login'); // 'login' | 'register'

  // Type d'inscription : null tant que l'utilisateur n'a pas choisi, puis 'member' ou 'external'
  const [registerType, setRegisterType] = useState(null);

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
      redirectTo: `${window.location.origin}/reset-password`,
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
    if (!registerType) {
      setError('Merci de choisir un type de compte.'); return;
    }
    setLoading(true); setError(''); setSuccess('');
    const { error } = await signUp(regEmail.trim().toLowerCase(), regPassword, regName.trim(), registerType);
    setLoading(false);
    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (msg.includes('already registered') || msg.includes('already exists') || msg.includes('user already')) {
        setError('Un compte existe déjà avec cet e-mail.');
      } else if (msg.includes('rate') || msg.includes('limit')) {
        setError('Trop de tentatives. Attends quelques minutes et réessaie.');
      } else if (msg.includes('invalid') && msg.includes('email')) {
        setError("L'adresse e-mail n'est pas valide.");
      } else if (msg.includes('password')) {
        setError('Mot de passe refusé par le serveur. Utilise au moins 8 caractères.');
      } else {
        setError(`Erreur : ${error.message}`);
      }
    } else {
      setSuccess('Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse.');
      setRegName(''); setRegEmail(''); setRegPassword(''); setRegConfirm('');
    }
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100dvh',
      background: 'linear-gradient(160deg, #e8f7fd 0%, #ffffff 40%, #f8f5f0 100%)',
    }}>
      {/* Bouton retour vers le site (desktop uniquement) */}
      {onBack && (
        <a href="https://caniplus.ch" style={{
          position: 'absolute', top: 'calc(env(safe-area-inset-top, 0px) + 16px)', left: 20, zIndex: 10,
          background: 'rgba(43,171,225,0.1)', border: 'none', borderRadius: 999,
          padding: '8px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
          color: '#2BABE1', fontWeight: 600, fontSize: 14, fontFamily: 'Inter, sans-serif',
          textDecoration: 'none',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          Retour au site
        </a>
      )}

      {/* Container centré — max 440px sur desktop, full-width sur mobile */}
      <div style={{
        width: '100%', maxWidth: 440,
        margin: '0 auto',
        borderRadius: isDesktop ? 24 : 0,
        boxShadow: isDesktop ? '0 12px 48px rgba(0,0,0,0.12)' : 'none',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        minHeight: isDesktop ? 'auto' : '100dvh',
      }}>
        {/* Header clair */}
        <div style={{
          background: 'linear-gradient(160deg, #e8f7fd 0%, #ffffff 60%, #f8f5f0 100%)',
          padding: 'calc(env(safe-area-inset-top, 0px) + 52px) 32px 44px',
          position: 'relative', overflow: 'hidden',
          borderBottom: '1px solid #e8f7fd',
        }}>
          <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'rgba(43,171,225,0.08)', top: -80, right: -80, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'rgba(43,171,225,0.06)', bottom: -40, left: 20, pointerEvents: 'none' }} />
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center' }}>
            <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 62, color: '#1F1F20', lineHeight: 1 }}>CaniPlus</div>
            <div style={{ color: '#2BABE1', fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', marginTop: 6 }}>Espace membre</div>
          </div>
        </div>

        {/* Card */}
        <div style={{
          flex: 1, background: '#fff',
          padding: '28px 28px 40px',
        }} className="fade-up">

        {/* Onglets */}
        <div style={{ display: 'flex', background: '#f4f6f8', borderRadius: 14, padding: 4, marginBottom: 28 }}>
          {[['login', 'Se connecter'], ['register', 'Créer un compte']].map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setError(''); setSuccess(''); setRegisterType(null); }}
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
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>Bon retour !</h2>
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
              {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 600 }}><Icon name="warning" size={16} color="#dc2626" /> {error}</div>}
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
            {/* Étape 1 : choix du type de compte */}
            {!registerType && !success && (
              <>
                <h2 style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}>
                  Rejoindre CaniPlus <Icon name="paw" size={22} color="#2BABE1" />
                </h2>
                <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20 }}>
                  Quel type de compte veux-tu créer ?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {/* Option MEMBRE */}
                  <button
                    type="button"
                    onClick={() => setRegisterType('member')}
                    style={{
                      textAlign: 'left', padding: '18px 18px 20px',
                      background: '#fff', border: '2px solid #e5e7eb',
                      borderRadius: 16, cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex', gap: 14, alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2BABE1'; e.currentTarget.style.background = '#f0faff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
                  >
                    <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="paw" size={22} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', marginBottom: 4 }}>
                        Je suis élève du club
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
                        Tu prends des cours avec CaniPlus à Ballaigues : accès complet au planning, cotisation et ressources.
                      </div>
                    </div>
                  </button>

                  {/* Option EXTERNE */}
                  <button
                    type="button"
                    onClick={() => setRegisterType('external')}
                    style={{
                      textAlign: 'left', padding: '18px 18px 20px',
                      background: '#fff', border: '2px solid #e5e7eb',
                      borderRadius: 16, cursor: 'pointer',
                      transition: 'all 0.2s',
                      display: 'flex', gap: 14, alignItems: 'flex-start',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = '#2BABE1'; e.currentTarget.style.background = '#f0faff'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
                  >
                    <div style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #f8c86b, #e0a64a)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="book" size={22} color="#fff" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', marginBottom: 4 }}>
                        Je veux juste du contenu & coaching
                      </div>
                      <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.45 }}>
                        Accès aux guides, articles, ressources premium et coaching à distance — où que tu sois en Suisse.
                      </div>
                    </div>
                  </button>
                </div>
              </>
            )}

            {/* Étape 2 : formulaire une fois le type choisi */}
            {registerType && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => { setRegisterType(null); setError(''); }}
                    aria-label="Retour"
                    style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#1F1F20" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                  </button>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: '#1F1F20' }}>
                      {registerType === 'member' ? 'Compte élève du club' : 'Compte CaniPlus'}
                    </div>
                    <div style={{ fontSize: 12, color: '#2BABE1', fontWeight: 600 }}>
                      {registerType === 'member' ? 'Accès cours + ressources' : 'Contenu + coaching à distance'}
                    </div>
                  </div>
                </div>
              </>
            )}

            {success ? (
              <div style={{ background: '#d1fae5', color: '#065f46', padding: '20px', borderRadius: 16, fontSize: 15, fontWeight: 600, textAlign: 'center', lineHeight: 1.5 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
                  <Icon name="checkCircle" size={20} color="#065f46" /> {success}
                </div>
                <div style={{ marginTop: 16 }}>
                  <button onClick={() => { setTab('login'); setSuccess(''); setError(''); }}
                    style={{ background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)', color: '#fff', padding: '12px 28px', borderRadius: 14, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                    Se connecter
                  </button>
                </div>
              </div>
            ) : registerType ? (
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
                {error && <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 14, marginBottom: 16, fontWeight: 600 }}><Icon name="warning" size={16} color="#dc2626" /> {error}</div>}
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
            ) : null}
          </>
        )}
      </div>
      </div>{/* fin container centré */}

      {/* ─── MODALE MOT DE PASSE OUBLIÉ ─── */}
      {showResetModal && (
        <div
          onClick={closeResetModal}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: isDesktop ? 'center' : 'flex-end', justifyContent: 'center' }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: isDesktop ? 24 : '24px 24px 0 0', width: '100%', maxWidth: 480, padding: '28px 28px 40px' }}
          >
            {resetSuccess ? (
              <div style={{ textAlign: 'center', padding: '12px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                  <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#e8f7fd', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Icon name="mailOpen" size={36} color="#2BABE1" />
                  </div>
                </div>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 800, color: '#1F1F20', marginBottom: 6 }}><Icon name="key" size={20} color="#2BABE1" /> Mot de passe oublié</div>
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14, fontWeight: 600 }}>
                      <Icon name="warning" size={14} color="#dc2626" /> {resetError}
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
