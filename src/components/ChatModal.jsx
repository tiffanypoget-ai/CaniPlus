// src/components/ChatModal.jsx
// Modale plein écran côté membre : ouverte au click sur le FAB.
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { computeAdminAvailability } from '../lib/chatHelpers';
import ChatThread from './ChatThread';
import ChatComposer from './ChatComposer';
import Icon from './Icons';

export default function ChatModal({ onClose }) {
  const { profile } = useAuth();
  const [conversationId, setConversationId] = useState(null);
  const [adminProfile, setAdminProfile] = useState(null);
  const [loadErr, setLoadErr] = useState(null);

  useEffect(() => {
    if (!profile) return;
    let alive = true;
    (async () => {
      // Récupère ou crée la conversation
      let { data: conv, error } = await supabase
        .from('conversations')
        .select('id')
        .eq('member_id', profile.id)
        .maybeSingle();
      if (error) { setLoadErr(error.message); return; }

      if (!conv) {
        // Crée si pas existante (devrait pas arriver grâce au trigger, mais fallback)
        const { data: newConv, error: insErr } = await supabase
          .from('conversations')
          .insert({ member_id: profile.id })
          .select('id')
          .single();
        if (insErr) { setLoadErr(insErr.message); return; }
        conv = newConv;
      }

      if (!alive) return;
      setConversationId(conv.id);

      // Récupère l'admin (Tiffany) pour son avatar et son statut chat
      const { data: admin } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, admin_chat_status, vacation_until')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (alive && admin) setAdminProfile(admin);
    })();
    return () => { alive = false; };
  }, [profile]);

  // Empêche le scroll body pendant que la modale est ouverte
  useEffect(() => {
    document.body.classList.add('chat-modal-open');
    return () => { document.body.classList.remove('chat-modal-open'); };
  }, []);

  const availability = computeAdminAvailability(adminProfile);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9998,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        animation: 'fadein 0.2s ease',
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 440,
          height: 'min(720px, 100dvh)',
          background: '#fff',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 -4px 32px rgba(0, 0, 0, 0.25)',
          animation: 'slideup 0.25s ease',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
          padding: 'calc(env(safe-area-inset-top, 0px) + 16px) 18px 16px',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexShrink: 0,
        }}>
          <img
            src={adminProfile?.avatar_url || 'https://app.caniplus.ch/icons/icon-192.png'}
            alt="Tiffany"
            style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }}
            onError={(e) => { e.currentTarget.src = 'https://app.caniplus.ch/icons/icon-192.png'; }}
          />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 800, lineHeight: 1.2 }}>Tiffany Cotting</div>
            <div style={{ fontSize: 12, color: availability.available ? '#86efac' : 'rgba(255,255,255,0.6)', marginTop: 2 }}>
              {availability.available ? '● Disponible' : availability.reason === 'vacation' ? '🌴 En congés' : '🌙 Hors heures'}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 36, height: 36, borderRadius: 10,
              background: 'rgba(255,255,255,0.12)', border: 'none', cursor: 'pointer',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Icon name="close" size={16} color="#fff" />
          </button>
        </div>

        {/* Banner statut */}
        {!availability.available && (
          <div style={{
            background: availability.reason === 'vacation' ? '#fef3c7' : '#e0f2fe',
            color: availability.reason === 'vacation' ? '#92400e' : '#075985',
            padding: '10px 16px',
            fontSize: 12,
            lineHeight: 1.5,
            borderBottom: '1px solid #e5e7eb',
            flexShrink: 0,
          }}>
            {availability.label}
          </div>
        )}

        {/* Erreur de chargement */}
        {loadErr && (
          <div style={{ padding: 16, color: '#dc2626', fontSize: 13 }}>
            Erreur : {loadErr}
          </div>
        )}

        {/* Thread */}
        {conversationId ? (
          <ChatThread
            conversationId={conversationId}
            currentUserId={profile.id}
            currentUserRole="member"
            adminAvatarUrl={adminProfile?.avatar_url}
          />
        ) : (
          !loadErr && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>Chargement…</div>
        )}

        {/* Composer */}
        {conversationId && (
          <ChatComposer
            conversationId={conversationId}
            currentUserId={profile.id}
            onSent={() => {/* le realtime ajoute le message */}}
          />
        )}
      </div>

      <style>{`
        @keyframes fadein { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideup { from { transform: translateY(100%) } to { transform: translateY(0) } }
        body.chat-modal-open { overflow: hidden; }
      `}</style>
    </div>
  );
}
