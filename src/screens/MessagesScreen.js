// src/screens/MessagesScreen.js
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

export default function MessagesScreen() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMsg, setNewMsg] = useState('');
  const [adminId, setAdminId] = useState(null);
  const [adminName, setAdminName] = useState(null);
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);

  const load = async () => {
    if (!profile) return;
    const { data: admin } = await supabase.from('profiles').select('id, full_name').eq('role', 'admin').limit(1).single();
    if (admin) {
      setAdminId(admin.id);
      setAdminName(admin.full_name ?? null);
      const { data: msgs } = await supabase.from('messages').select('*')
        .or(`sender_id.eq.${profile.id},receiver_id.eq.${profile.id}`)
        .order('created_at');
      if (msgs) setMessages(msgs);
      await supabase.from('messages').update({ is_read: true }).eq('receiver_id', profile.id).eq('is_read', false);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase.channel('messages-pwa')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, load)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [profile]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (e) => {
    e.preventDefault();
    if (!newMsg.trim() || !adminId) return;
    setSending(true);
    await supabase.from('messages').insert({ sender_id: profile.id, receiver_id: adminId, content: newMsg.trim() });
    setNewMsg('');
    setSending(false);
  };

  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  const fmtDay = (iso) => new Date(iso).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });

  let lastDay = '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, background: 'rgba(43,171,225,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            <Icon name="paw" size={22} color="#2BABE1" />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#fff' }}>CaniPlus</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{adminName ?? 'CaniPlus'} · Éducatrice</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
              <Icon name="message" size={48} color="#d1d5db" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>Démarrez la conversation avec CaniPlus</div>
          </div>
        )}
        {messages.map((msg) => {
          const isMe = msg.sender_id === profile?.id;
          const day = fmtDay(msg.created_at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={msg.id}>
              {showDay && (
                <div style={{ textAlign: 'center', margin: '16px 0' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', background: '#f4f6f8', padding: '4px 12px', borderRadius: 999 }}>{day}</span>
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: isMe ? 'flex-end' : 'flex-start', marginBottom: 6 }}>
                <div style={{
                  maxWidth: '80%', padding: '11px 14px',
                  background: isMe ? '#2BABE1' : '#f4f6f8',
                  borderRadius: isMe ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                }}>
                  <div style={{ fontSize: 15, color: isMe ? '#fff' : '#1F1F20', lineHeight: 1.4 }}>{msg.content}</div>
                  <div style={{ fontSize: 10, color: isMe ? 'rgba(255,255,255,0.6)' : '#9ca3af', marginTop: 4, textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    {fmtTime(msg.created_at)}
                    {isMe && (msg.is_read ? (
                      <>
                        · Lu <Icon name="check" size={10} color="rgba(255,255,255,0.6)" />
                      </>
                    ) : ' · Envoyé')}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Zone saisie */}
      <form onSubmit={send} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: 16, borderTop: '1px solid #f0f0f0', background: '#fff', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
        <textarea
          value={newMsg}
          onChange={e => setNewMsg(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
          placeholder="Écrire un message..."
          rows={1}
          style={{ flex: 1, background: '#f4f6f8', borderRadius: 18, padding: '12px 16px', fontSize: 15, color: '#1F1F20', resize: 'none', maxHeight: 120, border: 'none', outline: 'none', fontFamily: 'Nunito, sans-serif' }}
        />
        <button type="submit" disabled={!newMsg.trim() || sending} style={{
          width: 48, height: 48, borderRadius: '50%',
          background: newMsg.trim() ? 'linear-gradient(135deg,#2BABE1,#1a8bbf)' : '#e5e7eb',
          border: 'none', cursor: newMsg.trim() ? 'pointer' : 'not-allowed',
          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, transition: 'background 0.2s',
        }}>
          <Icon name="send" size={20} color={newMsg.trim() ? '#fff' : '#9ca3af'} />
        </button>
      </form>
    </div>
  );
}
