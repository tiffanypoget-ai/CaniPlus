// src/App.js
import { useState, useEffect, useRef } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginScreen from './screens/LoginScreen';
import LandingPage from './screens/LandingPage';
import HomeScreen from './screens/HomeScreen';
import PlanningScreen from './screens/PlanningScreen';
import RessourcesScreen from './screens/RessourcesScreen';
import BlogScreen from './screens/BlogScreen';
import BoutiqueScreen from './screens/BoutiqueScreen';
import ProfilScreen from './screens/ProfilScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import AdminScreen from './screens/AdminScreen';
import BottomNav from './components/BottomNav';
import Sidebar from './components/Sidebar';
import Icon from './components/Icons';
import ChangePasswordModal from './components/ChangePasswordModal';
import PushPermissionModal from './components/PushPermissionModal';
import { usePushNotifications } from './hooks/usePushNotifications';

// Bannière confirmation de paiement
// `status` peut être : 'cancelled', 'success-product', 'success-coaching',
// 'success-cours_collectif', 'success-cours_theorique', 'success-lecon_privee',
// 'success-cotisation_annuelle', 'success-premium_mensuel', ou 'success' (fallback).
function PaymentBanner({ status, onDismiss }) {
  if (!status) return null;
  const success = status !== 'cancelled';

  let title = 'Paiement annulé';
  let subtitle = 'Le paiement a été annulé. Tu peux réessayer quand tu veux.';

  if (status === 'success-product') {
    title = 'Achat confirmé !';
    subtitle = 'Ton guide est disponible dans « Mes achats ». Bonne lecture !';
  } else if (status === 'success-coaching') {
    title = 'Coaching confirmé !';
    subtitle = 'Tiffany te recontacte très vite pour fixer un créneau.';
  } else if (status === 'success-cours_collectif') {
    title = 'Inscription confirmée !';
    subtitle = 'Tu es bien inscrit·e à ton cours collectif. À très vite !';
  } else if (status === 'success-cours_theorique') {
    title = 'Inscription confirmée !';
    subtitle = 'Tu es bien inscrit·e au cours théorique. À très vite !';
  } else if (status === 'success-lecon_privee') {
    title = 'Leçon réservée !';
    subtitle = 'Ta leçon privée est confirmée. Tiffany te confirme l’horaire.';
  } else if (status === 'success-cotisation_annuelle') {
    title = 'Cotisation confirmée !';
    subtitle = 'Ton inscription annuelle est validée. Bienvenue chez CaniPlus !';
  } else if (status === 'success-premium_mensuel') {
    title = 'Bienvenue chez Premium !';
    subtitle = 'Ton abonnement mensuel est actif. Toutes les ressources sont à toi.';
  } else if (success) {
    // Fallback générique : aucun type identifié
    title = 'Paiement confirmé !';
    subtitle = 'Merci, ton paiement a bien été enregistré.';
  }

  return (
    <div className="payment-banner" style={{
      position: 'fixed', top: 0, left: '50%', transform: 'translateX(-50%)',
      width: '100%', maxWidth: 430, zIndex: 300,
      background: success ? '#16a34a' : '#d97706',
      color: '#fff', padding: 'calc(env(safe-area-inset-top,0px) + 12px) 20px 14px',
      display: 'flex', alignItems: 'center', gap: 12,
      animation: 'slideDown 0.3s cubic-bezier(0.32,0.72,0,1)',
      boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
    }}>
      <Icon name={success ? 'checkCircle' : 'warning'} size={24} color="#ffffff" />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>{title}</div>
        <div style={{ fontSize: 12, opacity: 0.85 }}>{subtitle}</div>
      </div>
      <button onClick={onDismiss} aria-label="Fermer" style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 8, width: 30, height: 30, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="close" size={16} color="#ffffff" />
      </button>
    </div>
  );
}

function AppContent() {
  const { session, loading, profile, refreshProfile, passwordRecovery, setPasswordRecovery } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [paymentStatus, setPaymentStatus] = useState(null);
  const [showLogin, setShowLogin] = useState(true); // desktop → LoginScreen direct (le site vitrine est sur caniplus.ch)

  // Détecte si on est en mode desktop (≥ 1024px)
  const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Détecter le retour depuis Stripe
  // L'URL Stripe peut contenir : payment=success|cancelled, purchase=product|coaching,
  // type=cours_collectif|cours_theorique|lecon_privee|cotisation_annuelle|premium_mensuel
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const payment = params.get('payment');
    const purchase = params.get('purchase'); // 'product' (boutique) ou 'coaching'
    const type = params.get('type'); // type de paiement create-checkout
    if (payment === 'success') {
      // Mapping prioritaire : purchase (boutique/coaching) > type (create-checkout) > fallback
      let nextStatus = 'success';
      if (purchase === 'product') nextStatus = 'success-product';
      else if (purchase === 'coaching') nextStatus = 'success-coaching';
      else if (type) nextStatus = `success-${type}`;
      setPaymentStatus(nextStatus);
      // Onglet de retour pertinent selon le type
      const tab = purchase === 'product' ? 'boutique' : 'profil';
      setActiveTab(tab);
      if (refreshProfile) refreshProfile();
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (payment === 'cancelled') {
      setPaymentStatus('cancelled');
      setActiveTab(purchase === 'product' ? 'boutique' : 'profil');
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

  // Notifications push : on affiche d'abord NOTRE soft prompt (PushPermissionModal)
  // qui explique a quoi ca sert. Au clic "Activer", on declenche le prompt natif
  // du navigateur. Au clic "Plus tard", on memorise pour 7 jours et on ne re-affiche
  // pas avant. Si l'utilisateur a deja choisi (granted/denied) ou est deja abonne,
  // on n'affiche rien.
  const pushAuto = usePushNotifications();
  const [showPushModal, setShowPushModal] = useState(false);

  useEffect(() => {
    if (!profile || !profile.onboarding_done) return;
    if (!pushAuto.supported) return;
    if (pushAuto.subscribed) return;
    if (pushAuto.permission === 'denied' || pushAuto.permission === 'granted') return;
    try {
      const flag = `push_soft_prompt_${profile.id}`;
      const lastDismiss = localStorage.getItem(flag);
      // Si fermé il y a moins de 7 jours, on ne re-affiche pas
      if (lastDismiss) {
        const ts = parseInt(lastDismiss, 10);
        if (!isNaN(ts) && Date.now() - ts < 7 * 24 * 60 * 60 * 1000) return;
      }
      // Petit delai pour ne pas afficher le modal avant que l'ecran soit visible
      const t = setTimeout(() => setShowPushModal(true), 2000);
      return () => clearTimeout(t);
    } catch { /* localStorage indispo : on ignore */ }
  }, [profile?.id, profile?.onboarding_done, pushAuto.supported, pushAuto.subscribed, pushAuto.permission]); // eslint-disable-line

  const handlePushAccept = async () => {
    const result = await pushAuto.subscribe();
    setShowPushModal(false);
    // Si l'utilisateur a refuse au prompt natif, on memorise pour 7 jours
    // (sinon on re-afficherait le soft prompt en boucle).
    if (!result?.ok && profile?.id) {
      try { localStorage.setItem(`push_soft_prompt_${profile.id}`, String(Date.now())); } catch {}
    }
  };

  const handlePushDismiss = () => {
    setShowPushModal(false);
    if (profile?.id) {
      try { localStorage.setItem(`push_soft_prompt_${profile.id}`, String(Date.now())); } catch {}
    }
  };

  // Splash / chargement
  if (loading) {
    return (
      <div className="auth-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#1F1F20', flexDirection: 'column', gap: 16 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 56, color: '#fff' }}>CaniPlus</div>
          <div style={{ width: 32, height: 32, border: '3px solid rgba(255,255,255,0.2)', borderTopColor: '#2BABE1', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  // Réinitialisation mot de passe — montré dès que l'event PASSWORD_RECOVERY est reçu
  if (passwordRecovery && session) {
    return (
      <div className="auth-shell">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100dvh', background: '#1F1F20' }}>
          <ChangePasswordModal isRecovery onClose={() => {
            setPasswordRecovery(false);
            window.history.replaceState({}, document.title, window.location.pathname);
          }} />
        </div>
      </div>
    );
  }

  // Pas de session : Landing (desktop) ou Login (mobile)
  if (!session) {
    if (isDesktop && !showLogin) {
      return <LandingPage onLogin={() => setShowLogin(true)} />;
    }
    return (
      <div className="auth-shell">
        <LoginScreen onBack={isDesktop ? () => setShowLogin(false) : undefined} />
      </div>
    );
  }

  // Onboarding si pas encore fait — le flow dépend du user_type (member vs external)
  if (profile && !profile.onboarding_done) {
    return (
      <div className="auth-shell">
        <OnboardingScreen
          userId={profile.id}
          userType={profile.user_type || 'member'}
          onDone={refreshProfile}
        />
      </div>
    );
  }

  // user_type détermine l'accès aux écrans membres-only (planning)
  const userType = profile?.user_type || 'member';
  const memberOnlyTabs = ['planning'];
  // Si un external est sur un onglet membres-only (ex: après changement de user_type), on le renvoie à l'accueil
  // L'ancien onglet 'news' (retiré) est aussi remappé sur 'home' pour ne pas casser
  // les liens existants ou les notifications push qui pointaient vers /news.
  const remappedActiveTab = activeTab === 'news' ? 'home' : activeTab;
  const safeActiveTab = userType === 'external' && memberOnlyTabs.includes(remappedActiveTab) ? 'home' : remappedActiveTab;

  const screens = {
    home:          <HomeScreen onNavigate={setActiveTab} />,
    planning:      <PlanningScreen onNavigate={setActiveTab} />,
    ressources:    <RessourcesScreen />,
    blog:          <BlogScreen />,
    boutique:      <BoutiqueScreen />,
    profil:        <ProfilScreen />,
    notifications: <NotificationsScreen onBack={() => setActiveTab('home')} />,
  };

  return (
    <>
      {/* Sidebar — rendu uniquement en desktop (>=1024px) */}
      {isDesktop && <Sidebar active={safeActiveTab} onNavigate={setActiveTab} userType={userType} />}

      {/* Container principal — pleine hauteur, scroll interne */}
      <div
        className="desktop-main"
        style={{ display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', flex: 1, minWidth: 0 }}
      >
        <PaymentBanner status={paymentStatus} onDismiss={() => setPaymentStatus(null)} />
        <div
          style={{
            flex: 1, minHeight: 0, position: 'relative',
            paddingTop: paymentStatus ? 'calc(env(safe-area-inset-top,0px) + 72px)' : 0,
            transition: 'padding-top 0.3s',
          }}
          className="fade-in"
        >
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column' }}>
            {screens[safeActiveTab]}
          </div>
        </div>
        {/* BottomNav — visible uniquement en mobile (<1024px) via CSS */}
        <BottomNav active={safeActiveTab} onNavigate={setActiveTab} userType={userType} />
      </div>
      <style>{`@keyframes slideDown { from { transform: translateX(-50%) translateY(-100%) } to { transform: translateX(-50%) translateY(0) } }`}</style>

      {/* Soft prompt pour activer les notifications push (s'affiche 2s apres l'arrivee, 1x par 7 jours) */}
      {showPushModal && (
        <PushPermissionModal onAccept={handlePushAccept} onDismiss={handlePushDismiss} />
      )}
    </>
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
