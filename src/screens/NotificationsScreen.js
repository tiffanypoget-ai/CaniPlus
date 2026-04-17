// src/screens/NotificationsScreen.js
// Écran notifications — accessible via la cloche sur l'accueil

import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

const TYPE_CONFIG = {
  cours_confirme:     { icon: 'checkCircle', color: '#22c55e', bg: '#dcfce7', label: 'Cours confirmé' },
  cours_semaine:      { icon: 'calendar',    color: '#2BABE1', bg: '#e8f7fd', label: 'Rappel cours' },
  nouvelle_actualite: { icon: 'bell',        color: '#8b5cf6', bg: '#ede9fe', label: 'Actualité' },
  info:               { icon: 'info',        color: '#f59e0b', bg: '#fef3c7', label: 'Info' },
  rappel:             { icon: 'clock',       color: '#6b7280', bg: '#f3f4f6', label: 'Rappel' },
};

export default function NotificationsScreen({ onBack }) {
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
          return (
            <div
              key={notif.id}
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
              }}
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
                onClick={() => deleteNotification(notif.id)}
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
