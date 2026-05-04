// src/components/ChatFab.jsx
// Bouton flottant qui ouvre le chat. Visible sur tous les écrans connectés.
// Affiche un badge "non lus" en temps réel via Realtime sur conversations.

import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import ChatModal from './ChatModal';
import Icon from './Icons';

export default function ChatFab() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // Charge initial du compteur non lus
  useEffect(() => {
    if (!profile?.id) return;
    let alive = true;

    const load = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('unread_count_member')
        .eq('member_id', profile.id)
        .maybeSingle();
      if (alive) setUnread(data?.unread_count_member ?? 0);
    };
    load();

    // Realtime : update du compteur quand la conversation est touchée
    const channel = supabase
      .channel('chat_fab_' + profile.id)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
        filter: `member_id=eq.${profile.id}`,
      }, (payload) => {
        if (!alive) return;
        setUnread(payload.new?.unread_count_member ?? 0);
      })
      .subscribe();

    // Reload aussi quand on ouvre l'app via ?openChat=1
    const params = new URLSearchParams(window.location.search);
    if (params.get('openChat') === '1') {
      setOpen(true);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    return () => {
      alive = false;
      supabase.removeChannel(channel);
    };
  }, [profile?.id]);

  // Si pas de profil ou si admin, on n'affiche pas le FAB
  if (!profile || profile.role === 'admin') return null;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label={unread > 0 ? `${unread} message(s) non lu(s)` : 'Ouvrir le chat'}
        title="Écrire à Tiffany"
        style={{
          position: 'fixed',
          right: 'calc(env(safe-area-inset-right, 0px) + 18px)',
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', // au-dessus du BottomNav
          zIndex: 1000,
          width: 56, height: 56,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
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
        <Icon name="message" size={26} color="#fff" />
        {unread > 0 && (
          <span style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 22, height: 22,
            padding: '0 6px',
            borderRadius: 11,
            background: '#ef4444',
            color: '#fff',
            fontSize: 11,
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid #fff',
            boxShadow: '0 2px 6px rgba(239, 68, 68, 0.4)',
          }}>
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && <ChatModal onClose={() => setOpen(false)} />}
    </>
  );
}
