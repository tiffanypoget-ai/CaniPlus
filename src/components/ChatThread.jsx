// src/components/ChatThread.jsx
// Liste des messages d'une conversation, avec scroll auto + marquage 'lu'.
// Le markRead se fait via une edge function pour éviter les soucis RLS.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import MessageBubble from './MessageBubble';

export default function ChatThread({ conversationId, currentUserId: explicitUserId, currentUserRole, adminAvatarUrl, memberAvatarUrl }) {
  const { profile } = useAuth();
  // Source de vérité pour le user_id : props si fourni, sinon profile (plus robuste)
  const currentUserId = explicitUserId || profile?.id || null;
  // Le rôle du visualiseur : props si fourni, sinon dérivé du profile.
  // C'est CE rôle qui détermine quel côté est "moi" — plus fiable que comparer
  // sender_id à profile.id (qui peut être stale ou null côté admin).
  const viewerRole = currentUserRole || (profile?.role === 'admin' ? 'admin' : 'member');

  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const bottomRef = useRef(null);
  const containerRef = useRef(null);

  const scrollToBottom = (smooth = true) => {
    setTimeout(() => {
      bottomRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'end' });
    }, 50);
  };

  // Charge initial
  const load = async () => {
    if (!conversationId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });
    if (error) setError(error.message);
    else setMessages(data ?? []);
    setLoading(false);
    scrollToBottom(false);
  };

  // Marquage "lu" via edge function (bypasse RLS, plus fiable)
  const markRead = async () => {
    if (!conversationId || !currentUserId) return;
    try {
      await supabase.functions.invoke('mark-conversation-read', {
        body: { conversation_id: conversationId },
      });
    } catch {
      // Silent fail : pas grave si markRead foire
    }
  };

  useEffect(() => { load(); }, [conversationId]); // eslint-disable-line

  // Realtime
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel('chat_thread_' + conversationId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        scrollToBottom();
        if (payload.new.sender_id !== currentUserId) markRead();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, currentUserId]); // eslint-disable-line

  useEffect(() => {
    if (!loading) markRead();
  }, [loading, conversationId]); // eslint-disable-line

  // Groupe les messages par date pour les séparateurs
  const groupedByDay = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const m of messages) {
      const d = new Date(m.created_at);
      const dayKey = d.toDateString();
      if (dayKey !== lastDate) {
        groups.push({ type: 'date', date: d, key: 'd-' + dayKey });
        lastDate = dayKey;
      }
      groups.push({ type: 'msg', msg: m, key: m.id });
    }
    return groups;
  }, [messages]);

  if (loading && messages.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>Chargement…</div>;
  }
  if (error) {
    return <div style={{ padding: 20, color: '#dc2626', fontSize: 13 }}>Erreur : {error}</div>;
  }

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        overflowY: 'auto',
        WebkitOverflowScrolling: 'touch',
        padding: '14px 12px 6px',
        background: '#f6f7f9',
      }}
    >
      {messages.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          Aucun message pour l'instant.<br />
          Écris ce que tu veux, je te réponds dès que possible.
        </div>
      ) : (
        groupedByDay.map((item, idx) => {
          if (item.type === 'date') {
            return <DateSeparator key={item.key} date={item.date} />;
          }
          const m = item.msg;
          const prev = idx > 0 ? groupedByDay[idx - 1] : null;
          // Si le message précédent est du même sender (et non un séparateur date),
          // on cache l'avatar pour grouper visuellement
          const samePrev = prev && prev.type === 'msg' && prev.msg.sender_id === m.sender_id;
          // isOwn basé sur le rôle du visualiseur, pas sur user_id : plus
          // robuste si profile.id n'est pas chargé côté admin. Pour ce chat
          // membre↔admin il y a 1 seul admin (Tiffany), donc le rôle suffit.
          const isOwn = m.sender_role === viewerRole;
          return (
            <MessageBubble
              key={m.id}
              message={m}
              isOwn={isOwn}
              adminAvatarUrl={adminAvatarUrl}
              memberAvatarUrl={memberAvatarUrl}
              showAvatar={!samePrev}
            />
          );
        })
      )}
      <div ref={bottomRef} />
    </div>
  );
}

function DateSeparator({ date }) {
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  let label;
  if (sameDay) label = "Aujourd'hui";
  else if (isYesterday) label = 'Hier';
  else label = date.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });

  return (
    <div style={{ textAlign: 'center', margin: '12px 0 6px', fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>
      {label}
    </div>
  );
}
