// src/components/ChatThread.jsx
// Liste des messages d'une conversation, avec scroll auto + marquage 'lu'.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import MessageBubble from './MessageBubble';

export default function ChatThread({ conversationId, currentUserId, currentUserRole, adminAvatarUrl }) {
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

  // Charge les messages
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

  // Marque comme lu
  const markRead = async () => {
    if (!conversationId || !currentUserId) return;
    const otherRole = currentUserRole === 'admin' ? 'member' : 'admin';
    // Update read_at sur les messages de l'autre côté non lus
    await supabase
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
      .eq('sender_role', otherRole)
      .is('read_at', null);

    // Reset unread_count côté actuel sur la conversation
    const fieldToReset = currentUserRole === 'admin' ? 'unread_count_admin' : 'unread_count_member';
    await supabase
      .from('conversations')
      .update({ [fieldToReset]: 0 })
      .eq('id', conversationId);
  };

  useEffect(() => {
    load();
  }, [conversationId]); // eslint-disable-line

  // Realtime : écoute les nouveaux messages
  useEffect(() => {
    if (!conversationId) return;
    const channel = supabase
      .channel('chat_thread_' + conversationId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => {
          // Évite duplicatas si déjà inséré par un INSERT direct
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        scrollToBottom();
        // Marque lu si pas mon message
        if (payload.new.sender_id !== currentUserId) markRead();
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'chat_messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [conversationId, currentUserId]); // eslint-disable-line

  // Au montage, marque comme lu après load
  useEffect(() => {
    if (!loading) markRead();
  }, [loading]); // eslint-disable-line

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
        padding: '14px 16px',
        background: '#f8f9fa',
      }}
    >
      {messages.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
          Aucun message pour l'instant.<br />
          Écris ce que tu veux, je te réponds dès que possible.
        </div>
      ) : (
        messages.map(m => (
          <MessageBubble
            key={m.id}
            message={m}
            isOwn={m.sender_id === currentUserId}
            adminAvatarUrl={adminAvatarUrl}
          />
        ))
      )}
      <div ref={bottomRef} />
    </div>
  );
}
