// src/components/MessageBubble.jsx
// Bulle de message style WhatsApp/iMessage moderne.
// "isOwn" = message envoyé par le user actuellement connecté.
import { fmtMessageTime } from '../lib/chatHelpers';

const ADMIN_AVATAR_FALLBACK = 'https://app.caniplus.ch/icons/icon-192.png';

export default function MessageBubble({ message, isOwn, adminAvatarUrl, memberAvatarUrl, showAvatar = true }) {
  const isAdminMsg = message.sender_role === 'admin';
  // Avatar à gauche UNIQUEMENT pour les messages admin reçus côté membre.
  // Côté admin, le membre est déjà identifié dans l'en-tête de la conv, donc
  // pas besoin de répéter son avatar à chaque bulle.
  const renderAvatar = showAvatar && !isOwn && isAdminMsg;
  const otherAvatar = adminAvatarUrl || ADMIN_AVATAR_FALLBACK;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'row',
      justifyContent: isOwn ? 'flex-end' : 'flex-start',
      gap: 8,
      marginBottom: 6,
      alignItems: 'flex-end',
      width: '100%',
    }}>
      {renderAvatar && (
        <img
          src={otherAvatar}
          alt={isAdminMsg ? 'Tiffany' : 'Membre'}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            objectFit: 'cover', flexShrink: 0,
            border: '1px solid #e5e7eb',
          }}
          onError={(e) => { e.currentTarget.src = ADMIN_AVATAR_FALLBACK; }}
        />
      )}
      {/* Spacer 28px pour aligner les bulles admin consécutives (sans avatar
          sur les suivantes). On ne le met que côté membre (isAdminMsg) — côté
          admin les bulles du membre vont jusqu'au bord gauche. */}
      {!renderAvatar && !isOwn && isAdminMsg && <div style={{ width: 28, flexShrink: 0 }} />}

      <div style={{
        maxWidth: '78%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: isOwn ? 'flex-end' : 'flex-start',
      }}>
        {message.attachment_url && (
          <AttachmentPreview message={message} isOwn={isOwn} />
        )}

        {message.content && (
          <div style={{
            background: isOwn
              ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)'
              : '#ffffff',
            color: isOwn ? '#fff' : '#1F1F20',
            padding: '9px 13px',
            borderRadius: 18,
            borderTopRightRadius: isOwn ? 18 : 18,
            borderTopLeftRadius: 18,
            borderBottomRightRadius: isOwn ? 4 : 18,
            borderBottomLeftRadius: isOwn ? 18 : 4,
            fontSize: 14,
            lineHeight: 1.4,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            boxShadow: isOwn
              ? '0 1px 4px rgba(43,171,225,0.25)'
              : '0 1px 2px rgba(0,0,0,0.06)',
            border: isOwn ? 'none' : '1px solid #e5e7eb',
          }}>
            {message.content}
          </div>
        )}

        <div style={{
          fontSize: 10,
          color: '#9ca3af',
          marginTop: 2,
          padding: '0 6px',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}>
          <span>{fmtMessageTime(message.created_at)}</span>
          {isOwn && (
            <span style={{ color: message.read_at ? '#2BABE1' : '#9ca3af', fontSize: 11 }}>
              {message.read_at ? '✓✓' : '✓'}
            </span>
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
            maxWidth: 240, maxHeight: 280,
            borderRadius: 16, objectFit: 'cover',
            display: 'block', background: '#e5e7eb',
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
          maxWidth: 240, maxHeight: 320,
          borderRadius: 16,
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
        background: isOwn ? 'rgba(43,171,225,0.15)' : '#f3f4f6',
        color: isOwn ? '#1a8bbf' : '#1F1F20',
        padding: '10px 14px',
        borderRadius: 14,
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
