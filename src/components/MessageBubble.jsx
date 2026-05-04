// src/components/MessageBubble.jsx
// Une bulle de message dans le chat (admin ou membre).
import { fmtMessageTime } from '../lib/chatHelpers';

const ADMIN_AVATAR_FALLBACK = 'https://app.caniplus.ch/icons/icon-192.png';

export default function MessageBubble({ message, isOwn, adminAvatarUrl }) {
  const isAdmin = message.sender_role === 'admin';
  const showAvatar = !isOwn && isAdmin;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      justifyContent: isOwn ? 'flex-end' : 'flex-start',
      gap: 8,
      marginBottom: 10,
      alignItems: 'flex-end',
    }}>
      {showAvatar && (
        <img
          src={adminAvatarUrl || ADMIN_AVATAR_FALLBACK}
          alt="Tiffany"
          style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, border: '2px solid #fff', boxShadow: '0 1px 4px rgba(0,0,0,0.15)' }}
          onError={(e) => { e.currentTarget.src = ADMIN_AVATAR_FALLBACK; }}
        />
      )}

      <div style={{ maxWidth: '75%', display: 'flex', flexDirection: 'column', alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        {message.attachment_url && (
          <AttachmentPreview message={message} isOwn={isOwn} />
        )}

        {message.content && (
          <div style={{
            background: isOwn ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#f1f3f5',
            color: isOwn ? '#fff' : '#1F1F20',
            padding: '10px 14px',
            borderRadius: 18,
            borderBottomRightRadius: isOwn ? 6 : 18,
            borderBottomLeftRadius: isOwn ? 18 : 6,
            fontSize: 14,
            lineHeight: 1.45,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: isOwn ? '0 2px 8px rgba(43, 171, 225, 0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            {message.content}
          </div>
        )}

        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 3, padding: '0 6px' }}>
          {fmtMessageTime(message.created_at)}
          {isOwn && message.read_at && (
            <span style={{ color: '#2BABE1', marginLeft: 4 }}>· Vu</span>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentPreview({ message, isOwn }) {
  const url = message.attachment_url;
  const type = message.attachment_type;

  if (type === 'image') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', marginBottom: message.content ? 4 : 0 }}>
        <img
          src={url}
          alt={message.attachment_name || 'image'}
          style={{
            maxWidth: 240,
            maxHeight: 280,
            borderRadius: 14,
            objectFit: 'cover',
            display: 'block',
            background: '#e5e7eb',
          }}
        />
      </a>
    );
  }

  if (type === 'video') {
    return (
      <video
        src={url}
        controls
        style={{
          maxWidth: 240,
          maxHeight: 320,
          borderRadius: 14,
          marginBottom: message.content ? 4 : 0,
          background: '#000',
        }}
      />
    );
  }

  if (type === 'pdf') {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: isOwn ? 'rgba(43, 171, 225, 0.85)' : '#f1f3f5',
        color: isOwn ? '#fff' : '#1F1F20',
        padding: '10px 14px',
        borderRadius: 12,
        fontSize: 13,
        fontWeight: 600,
        textDecoration: 'none',
        marginBottom: message.content ? 4 : 0,
      }}>
        📄 {message.attachment_name || 'document.pdf'}
      </a>
    );
  }

  return null;
}
