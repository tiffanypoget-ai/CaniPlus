// src/components/ChatComposer.jsx
// Zone de saisie + upload pour le chat.
import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { validateAttachment } from '../lib/chatHelpers';
import Icon from './Icons';

export default function ChatComposer({ conversationId, currentUserId, onSent }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const sendText = async () => {
    const content = text.trim();
    if (!content || sending) return;
    setSending(true);
    setError(null);
    try {
      const { error: invErr } = await supabase.functions.invoke('send-chat-message', {
        body: { conversation_id: conversationId, content },
      });
      if (invErr) throw new Error(invErr.message ?? 'Envoi échoué');
      setText('');
      adjustHeight();
      onSent?.();
    } catch (e) {
      setError(e.message ?? 'Erreur réseau');
    } finally {
      setSending(false);
    }
  };

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset pour pouvoir réuploader le même
    if (!file) return;

    const v = validateAttachment(file);
    if (!v.ok) { setError(v.error); return; }

    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
      const path = `${currentUserId}/${conversationId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from('chat-attachments')
        .upload(path, file, { upsert: false, contentType: file.type });
      if (upErr) throw upErr;

      // URL signée (1 an) plutôt qu'URL publique (bucket privé)
      const { data: signed, error: signErr } = await supabase.storage
        .from('chat-attachments')
        .createSignedUrl(path, 60 * 60 * 24 * 365);
      if (signErr) throw signErr;

      const attachUrl = signed?.signedUrl;
      if (!attachUrl) throw new Error('URL signée introuvable');

      const { error: invErr } = await supabase.functions.invoke('send-chat-message', {
        body: {
          conversation_id: conversationId,
          content: text.trim() || null,
          attachment_url: attachUrl,
          attachment_type: v.type,
          attachment_name: file.name,
          attachment_size: file.size,
        },
      });
      if (invErr) throw new Error(invErr.message ?? 'Envoi échoué');

      setText('');
      adjustHeight();
      onSent?.();
    } catch (e) {
      setError(e.message ?? 'Upload échoué');
    } finally {
      setUploading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendText();
    }
  };

  const disabled = sending || uploading;

  return (
    <div style={{
      borderTop: '1px solid #e5e7eb',
      background: '#fff',
      padding: '8px 12px calc(env(safe-area-inset-bottom, 0px) + 8px)',
    }}>
      {error && (
        <div style={{
          background: '#fee2e2', color: '#991b1b',
          padding: '6px 10px', borderRadius: 8,
          fontSize: 12, marginBottom: 6,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <Icon name="warning" size={12} color="#991b1b" /> {error}
          <button onClick={() => setError(null)} style={{ marginLeft: 'auto', background: 'transparent', border: 'none', cursor: 'pointer', color: '#991b1b' }}>×</button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,application/pdf"
          onChange={handleFile}
          style={{ display: 'none' }}
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Joindre photo, vidéo ou PDF"
          style={{
            flexShrink: 0,
            width: 38, height: 38,
            borderRadius: '50%',
            background: '#f1f3f5',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#374151',
            opacity: disabled ? 0.5 : 1,
          }}
        >
          {uploading ? '⏳' : '📎'}
        </button>

        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => { setText(e.target.value); adjustHeight(); }}
          onKeyDown={onKeyDown}
          placeholder="Écris un message…"
          rows={1}
          style={{
            flex: 1,
            resize: 'none',
            border: '1px solid #e5e7eb',
            borderRadius: 18,
            padding: '9px 14px',
            fontFamily: 'inherit',
            fontSize: 14,
            lineHeight: 1.4,
            outline: 'none',
            maxHeight: 120,
            background: '#f8f9fa',
          }}
        />

        <button
          type="button"
          onClick={sendText}
          disabled={disabled || !text.trim()}
          title="Envoyer"
          style={{
            flexShrink: 0,
            width: 38, height: 38,
            borderRadius: '50%',
            background: text.trim() && !disabled ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#d1d5db',
            border: 'none',
            cursor: (disabled || !text.trim()) ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff',
            transition: 'background 0.2s',
            boxShadow: text.trim() && !disabled ? '0 2px 8px rgba(43, 171, 225, 0.4)' : 'none',
          }}
        >
          <span style={{ fontSize: 16 }}>{sending ? '⏳' : '➤'}</span>
        </button>
      </div>
    </div>
  );
}
