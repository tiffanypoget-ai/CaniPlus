// src/components/WhatsAppFab.jsx
// Bouton flottant qui ouvre WhatsApp. Remplace ChatFab tant que la
// messagerie interne est fermée (MESSAGERIE_ENABLED à false) : même
// position, même taille, même style, mais un simple lien, sans badge
// ni Realtime.

import { useAuth } from '../hooks/useAuth';
import { WHATSAPP_URL } from '../lib/contact';
import Icon from './Icons';

export default function WhatsAppFab() {
  const { profile } = useAuth();

  // Même règle d'affichage que ChatFab : pas de profil ou admin, pas de FAB.
  if (!profile || profile.role === 'admin') return null;

  return (
    <a
      href={WHATSAPP_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Écrire sur WhatsApp"
      title="Écrire à Tiffany"
      style={{
        position: 'fixed',
        right: 'calc(env(safe-area-inset-right, 0px) + 18px)',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', // au-dessus du BottomNav
        zIndex: 1000,
        width: 56, height: 56,
        borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dark))',
        border: 'none',
        cursor: 'pointer',
        boxShadow: '0 6px 20px rgba(43, 171, 225, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s',
      }}
      onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.94)'}
      onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
      onTouchStart={(e) => e.currentTarget.style.transform = 'scale(0.94)'}
      onTouchEnd={(e) => e.currentTarget.style.transform = 'scale(1)'}
    >
      <Icon name="whatsapp" size={28} color="#fff" />
    </a>
  );
}
