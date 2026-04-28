// src/components/InstallAppBanner.js
// Bandeau d'invitation a installer la PWA CaniPlus sur le telephone.
// Affiche differemment selon la plateforme :
//   - Android Chrome / Edge : capture l'event `beforeinstallprompt` et le declenche au clic.
//   - Android (autre navigateur ou prompt non capture) : instructions menu Chrome.
//   - iOS Safari : instructions Partage > Ajouter a l'ecran d'accueil.
//   - Deja installe (display-mode: standalone) : ne s'affiche pas.
//   - Desktop : ne s'affiche pas (l'app est mobile first).
// L'utilisateur peut fermer le bandeau, choix memorise en sessionStorage pour la session.

import { useEffect, useState } from 'react';

const DISMISS_KEY = 'caniplus_install_banner_dismissed';

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;
}

function detectPlatform() {
  if (typeof window === 'undefined') return 'unknown';
  const ua = window.navigator.userAgent || '';
  // Android prend la priorite : certains UA contiennent les deux mots (Chrome desktop avec mode mobile, etc.)
  if (/Android/i.test(ua)) return 'android';
  // iOS : iPhone/iPod en UA, et iPad recent qui se fait passer pour Mac (touch + plateforme Mac)
  const isIOSUA = /iPad|iPhone|iPod/.test(ua);
  const isIPadOS13Plus = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (isIOSUA || isIPadOS13Plus) return 'ios';
  return 'desktop';
}

export default function InstallAppBanner() {
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState('unknown');
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  // 'ios' = instructions Safari, 'android' = instructions Chrome, null = pas d'instructions
  const [helpMode, setHelpMode] = useState(null);

  useEffect(() => {
    if (isStandalone()) return;

    // Si on arrive depuis le site vitrine avec ?install=1, on force l'affichage
    // (on ignore le dismiss precedent pour cette session) et on tentera l'install
    // automatiquement des que l'event beforeinstallprompt est capture.
    const params = new URLSearchParams(window.location.search);
    const forceInstall = params.get('install') === '1';
    if (!forceInstall && sessionStorage.getItem(DISMISS_KEY) === '1') return;

    const p = detectPlatform();
    setPlatform(p);
    if (p === 'desktop') return;
    setVisible(true);

    // iOS : pas d'event beforeinstallprompt, on affiche directement les instructions
    if (forceInstall && p === 'ios') {
      setHelpMode('ios');
    }

    // Android Chrome : on capture l'event qui permet de declencher l'install au clic
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Si on est arrive avec ?install=1, on declenche le prompt natif tout de suite
      if (forceInstall) {
        try { e.prompt(); } catch (_) { /* certains navigateurs limitent l'auto-prompt */ }
      }
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  const handleInstall = async () => {
    // iOS : toujours les instructions Safari
    if (platform === 'ios') {
      setHelpMode('ios');
      return;
    }
    // Android avec event capture : prompt natif
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setVisible(false);
      }
      setDeferredPrompt(null);
      return;
    }
    // Android sans event (navigateur autre, ou prompt deja refuse recemment) :
    // on guide l'utilisateur vers le menu Chrome
    setHelpMode('android');
  };

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
    setHelpMode(null);
  };

  if (!visible) return null;

  return (
    <>
      <div style={{
        position: 'relative',
        background: 'linear-gradient(90deg, #2BABE1 0%, #1E8DB8 100%)',
        color: '#FFFFFF',
        padding: '14px 16px 14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        fontSize: 14,
        fontFamily: 'Inter, -apple-system, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      }}>
        <div style={{ flex: 1, lineHeight: 1.4 }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Installe l'app sur ton téléphone</div>
          <div style={{ fontSize: 12, opacity: 0.92 }}>Accès direct depuis ton écran d'accueil, sans passer par le navigateur.</div>
        </div>
        <button
          onClick={handleInstall}
          style={{
            background: '#FFFFFF', color: '#1E8DB8',
            border: 0, borderRadius: 10,
            padding: '10px 16px', fontSize: 13, fontWeight: 600,
            cursor: 'pointer', whiteSpace: 'nowrap',
            fontFamily: 'inherit',
          }}
        >Installer</button>
        <button
          onClick={handleDismiss}
          aria-label="Fermer"
          style={{
            background: 'transparent', color: '#FFFFFF',
            border: 0, fontSize: 22, lineHeight: 1,
            cursor: 'pointer', padding: '0 4px',
            opacity: 0.85,
          }}
        >×</button>
      </div>

      {helpMode === 'ios' && (
        <div style={{
          background: '#F8F5F0',
          color: '#1F1F20',
          padding: '14px 18px',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'Inter, -apple-system, sans-serif',
          borderBottom: '1px solid #E5E7EB',
        }}>
          <strong style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Sur iPhone :</strong>
          1. Touche le bouton Partage <span style={{ display: 'inline-block', padding: '0 6px', borderRadius: 4, background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: 11, verticalAlign: 'middle' }}>↑</span> en bas de Safari.<br />
          2. Choisis « Ajouter à l'écran d'accueil ».<br />
          3. L'app CaniPlus apparaît avec son icône, comme une vraie app.
        </div>
      )}

      {helpMode === 'android' && (
        <div style={{
          background: '#F8F5F0',
          color: '#1F1F20',
          padding: '14px 18px',
          fontSize: 13,
          lineHeight: 1.5,
          fontFamily: 'Inter, -apple-system, sans-serif',
          borderBottom: '1px solid #E5E7EB',
        }}>
          <strong style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Sur Android :</strong>
          1. Touche le menu <span style={{ display: 'inline-block', padding: '0 6px', borderRadius: 4, background: '#FFFFFF', border: '1px solid #E5E7EB', fontSize: 11, fontWeight: 700, verticalAlign: 'middle' }}>⋮</span> en haut à droite de Chrome.<br />
          2. Choisis « Installer l'application » ou « Ajouter à l'écran d'accueil ».<br />
          3. L'app CaniPlus apparaît avec son icône, comme une vraie app.<br /><br />
          <span style={{ fontSize: 12, color: '#6b7280' }}>Si l'option n'apparaît pas, c'est que tu as déjà refusé l'installation récemment. Réessaie dans quelques jours, ou utilise le bouton Installer ci-dessus à un autre moment.</span>
        </div>
      )}
    </>
  );
}
