// src/App.js
import { useState, useEffect, useRef } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import PlanningScreen from './screens/PlanningScreen';
import RessourcesScreen from './screens/RessourcesScreen';
import NewsScreen from './screens/NewsScreen';
import ProfilScreen from './screens/ProfilScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AdminScreen from './screens/AdminScreen';
import BottomNav from './components/BottomNav';
import ChangePasswordModal from './components/ChangePasswordModal';

// Bannière confirmation de paiement
function PaymentBanner({ status, onDismiss }) {
  if (!status) return null;
  const success = status === 'success';
  return (
    <div style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, zIndex: 300,
      background: success ? '#16a34a' : '#d97706',
      color: '#fff', padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'slideDown 0.3s cubic-bezier(0.32,0.72,0,1)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      <span style={{ fontSize: 24 }}>{success ? '✅' : '⚠️'}</span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>
          {success ? 'Paiement confirmé !' : 'Paiement annulé'}
        </div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>
          {success
            ? 'Ton abonnement est maintenant actif. Merci !'
            : 'Le paiement a été annulé. Tu peux réessayer quand tu veux.'}
        </div>
      </div>
      <button onClick={onDismiss} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, color: '#fff', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
    </div>
  );
}

function AppContent() {
  const { session, loading, profile, refreshProfile, passwordRecovery, setPasswordRecovery } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [paymentStatus, setPaymentStatus] = useState(null);

  // Détecter le retour depuis Stripe
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    if (payment === 'success') {
      setPaymentStatus('success');
      setActiveTab('profil');
      if (refreshProfile) refreshProfile();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (payment === 'cancelled') {
      setPaymentStatus('cancelled');
      setActiveTab('profil');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []); // eslint-disable-line

  useEffect(() => {
    if (paymentStatus) {
      const t = setTimeout(() => setPaymentStatus(null), 5000);
      return () => clearTimeout(t);
    }
  }, [paymentStatus]);

  // Service worker — enregistré une seule fois au montage
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }, []);

  // Splash / chargement
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#1F1F20', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 56, color: '#fff' }}>CaniPlus</div>
        <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#2BABE1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // Réinitialisation mot de passe — montré dès que l'event PASSWORD_RECOVERY est reçu
  if (passwordRecovery && session) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#1F1F20' }}>
        <ChangePasswordModal isRecovery onClose={() => {
          setPasswordRecovery(false);
          window.history.replaceState({}, document.title, window.location.pathname);
        }} />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  // Onboarding si pas encore fait
  if (profile && !profile.onboarding_done) {
    return <OnboardingScreen userId={profile.id} onDone={refreshProfile} />;
  }

  const screens = {
    home:       <HomeScreen onNavigate={setActiveTab} />,
    planning:   <PlanningScreen onNavigate={setActiveTab} />,
    ressources: <RessourcesScreen />,
    news:       <NewsScreen />,
    profil:     <ProfilScreen />,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>
      <PaymentBanner status={paymentStatus} onDismiss={() => setPaymentStatus(null)} />
      <div
        style={{
          flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          paddingTop: paymentStatus ? 'calc(env(safe-area-inset-top,0px) + 72px)' : 0,
          transition: 'padding-top 0.3s',
        }}
        className="fade-in"
      >
        {screens[activeTab]}
      </div>
      <BottomNav active={activeTab} onNavigate={setActiveTab} />
      <style>{`@keyframes slideDown { from { transform: translateX(-50%) translateY(-100%) } to { transform: translateX(-50%) translateY(0) } }`}</style>
    </div>
  );
}

export default function App() {
  // Route admin séparée — accessible via /admin
  if (window.location.pathname === '/admin') {
    return <AdminScreen />;
  }
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
