// src/screens/NotificationsScreen.js
// Écran notifications — accessible via la cloche sur l'accueil

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

const TYPE_CONFIG = {
  cours_confirme:     { icon: 'checkCircle', color: '#22c55e', bg: '#dcfce7', label: 'Cours confirmé' },
  cours_semaine:      { icon: 'calendar',    color: '#2BABE1', bg: '#e8f7fd', label: 'Nouveau cours' },
  nouvelle_actualite: { icon: 'bell',        color: '#8b5cf6', bg: '#ede9fe', label: 'Actualité' },
  info:               { icon: 'info',        color: '#f59e0b', bg: '#fef3c7', label: 'Info' },
  rappel:             { icon: 'clock',       color: '#6b7280', bg: '#f3f4f6', label: 'Rappel' },
};

// Mapping type de notif → tab cible quand metadata.link n'est pas défini.
const TYPE_TO_TAB = {
  cours_confirme:     'planning',
  cours_cree:         'planning',
  cours_modifie:      'planning',
  cours_annule:       'planning',
  cours_semaine:      'planning',
  private_confirmed:  'profil',
  nouvelle_actualite: 'blog',
  admin_manuelle:     'home',
  info:               'home',
  rappel:             'home',
};

// Convertit un link type '/profil', '/planning' etc. en nom de tab.
// Renvoie null si pas reconnu.
function linkToTab(link) {
  if (!link || typeof link !== 'string') return null;
  const m = link.match(/^\/([a-z]+)/i);
  if (!m) return null;
  const tab = m[1].toLowerCase();
  if (['home', 'planning', 'profil', 'blog', 'boutique', 'ressources'].includes(tab)) return tab;
  return null;
}

export default function NotificationsScreen({ onBack, onNavigate }) {
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (!error && data) setNotifications(data);
        setLoading(false);
      });
  }, [profile]);

  // Marquer toutes les non-lues comme lues au montage
  useEffect(() => {
    if (!profile || loading || !notifications.length) return;
    const unreadIds = notifications.filter(n => !n.is_read).map(n => n.id);
    if (unreadIds.length === 0) return;
    supabase
      .from('notifications')
      .update({ is_read: true })
      .in('id', unreadIds)
      .then(() => {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      });
  }, [loading]); // eslint-disable-line

  const fmtDate = (iso) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "À l'instant";
    if (diffMin < 60) return `Il y a ${diffMin} min`;
    if (diffH < 24) return `Il y a ${diffH}h`;
    if (diffD < 7) return `Il y a ${diffD}j`;
    return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
  };

  const deleteNotification = async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    await supabase.from('notifications').delete().eq('id', id);
  };

  // Au clic sur une notif, on navigue vers la cible appropriée.
  // Priorité :
  //   1) metadata.link mappable vers un tab interne → onNavigate(tab)
  //   2) metadata.link = URL externe (http/https) → ouvre dans un nouvel onglet
  //   3) metadata.link = chemin interne non-tab (/blog/x) → window.location
  //   4) mapping type → tab par défaut
  const handleNotifClick = (notif) => {
    const link = notif?.metadata?.link;
    const fromLink = linkToTab(link);
    if (fromLink && onNavigate) { onNavigate(fromLink); return; }
    if (link && typeof link === 'string') {
      const trimmed = link.trim();
      if (/^https?:\/\//i.test(trimmed)) {
        window.open(trimmed, '_blank', 'noopener,noreferrer');
        return;
      }
      if (trimmed.startsWith('/')) {
        window.location.href = trimmed;
        return;
      }
    }
    const fromType = TYPE_TO_TAB[notif?.type];
    if (fromType && onNavigate) onNavigate(fromType);
  };

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <button
            onClick={onBack}
            style={{ width: 36, height: 36, background: 'rgba(255,255,255,0.12)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
          >
            <Icon name="arrowLeft" size={18} color="#fff" />
          </button>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff', marginBottom: 2 }}>CaniPlus</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#fff' }}>
          <Icon name="bell" size={24} color="#fff" />
          Notifications
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>
          {notifications.filter(n => !n.is_read).length > 0
            ? `${notifications.filter(n => !n.is_read).length} nouvelle(s)`
            : 'Toutes lues'}
        </div>
      </div>

      <div style={{ padding: '20px 16px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>
        )}

        {!loading && notifications.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px' }}>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
              <Icon name="bell" size={48} color="#d1d5db" />
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20', marginBottom: 8 }}>Aucune notification</div>
            <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
              Tu recevras ici les confirmations de cours, rappels et nouvelles du club.
            </div>
          </div>
        )}

        {notifications.map((notif) => {
          const config = TYPE_CONFIG[notif.type] || TYPE_CONFIG.info;
          // Cible navigable (utilisé pour le curseur et l'aria) :
          // soit un tab interne, soit un lien externe http(s), soit un chemin /xxx,
          // soit un type qui mappe vers un tab par défaut.
          const rawLink = typeof notif?.metadata?.link === 'string' ? notif.metadata.link.trim() : '';
          const hasUsableLink = !!linkToTab(rawLink) || /^https?:\/\//i.test(rawLink) || rawLink.startsWith('/');
          const navTarget = hasUsableLink || TYPE_TO_TAB[notif?.type];
          return (
            <div
              key={notif.id}
              onClick={() => navTarget && handleNotifClick(notif)}
              role={navTarget ? 'button' : undefined}
              tabIndex={navTarget ? 0 : undefined}
              style={{
                background: '#fff',
                borderRadius: 16,
                padding: '14px 16px',
                marginBottom: 10,
                boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                borderLeft: `4px solid ${!notif.is_read ? config.color : '#e5e7eb'}`,
                display: 'flex',
                gap: 12,
                alignItems: 'flex-start',
                position: 'relative',
                cursor: navTarget ? 'pointer' : 'default',
                transition: 'transform 0.1s, box-shadow 0.2s',
              }}
              onMouseDown={(e) => { if (navTarget) e.currentTarget.style.transform = 'scale(0.99)'; }}
              onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
            >
              {/* Icône type */}
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: config.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name={config.icon} size={18} color={config.color} />
              </div>

              {/* Contenu */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: config.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {config.label}
                  </span>
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>{fmtDate(notif.created_at)}</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20', lineHeight: 1.3, marginBottom: notif.body ? 4 : 0 }}>
                  {notif.title}
                </div>
                {notif.body && (
                  <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                    {notif.body}
                  </div>
                )}
              </div>

              {/* Bouton supprimer */}
              <button
                onClick={(e) => { e.stopPropagation(); deleteNotification(notif.id); }}
                style={{ width: 28, height: 28, background: '#f3f4f6', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', flexShrink: 0 }}
              >
                <Icon name="close" size={12} color="#9ca3af" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
