// src/components/MessagerieTab.jsx
// Onglet Messagerie côté admin : liste des conversations + vue détail.
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import ChatThread from './ChatThread';
import ChatComposer from './ChatComposer';
import Icon from './Icons';

const SUPA_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';

export default function MessagerieTab({ pwd }) {
  const { profile } = useAuth();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [showVacationModal, setShowVacationModal] = useState(false);
  const [adminProfile, setAdminProfile] = useState(null);

  const loadConversations = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('conversations')
      .select('id, member_id, last_message_at, last_message_preview, last_message_sender, unread_count_admin, archived_admin')
      .order('last_message_at', { ascending: false });
    if (!showArchived) query = query.eq('archived_admin', false);
    const { data: convs } = await query;

    // Fetch des profils membres séparément (pas de jointure FK définie)
    const memberIds = [...new Set((convs ?? []).map(c => c.member_id))];
    let profilesMap = {};
    if (memberIds.length > 0) {
      const { data: profs } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url')
        .in('id', memberIds);
      for (const p of (profs ?? [])) profilesMap[p.id] = p;
    }
    const enriched = (convs ?? []).map(c => ({
      ...c,
      member: profilesMap[c.member_id] ?? null,
    }));
    setConversations(enriched);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // Recharge l'admin profile pour afficher le statut vacances
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, admin_chat_status, vacation_until')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (data) setAdminProfile(data);
    })();
  }, []);

  // Realtime sur conversations
  useEffect(() => {
    const channel = supabase
      .channel('messagerie_admin')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' },
        () => { loadConversations(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [loadConversations]);

  const archiveConv = async (convId) => {
    await supabase.from('conversations').update({ archived_admin: true }).eq('id', convId);
    if (activeConvId === convId) setActiveConvId(null);
    loadConversations();
  };
  const unarchiveConv = async (convId) => {
    await supabase.from('conversations').update({ archived_admin: false }).eq('id', convId);
    loadConversations();
  };

  const setVacation = async (status, vacationUntil) => {
    const r = await fetch(SUPA_URL + '/functions/v1/set-admin-chat-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_password: pwd, status, vacation_until: vacationUntil }),
    });
    const j = await r.json();
    if (j?.error) { alert('Erreur : ' + j.error); return; }
    setAdminProfile(prev => ({ ...prev, admin_chat_status: status, vacation_until: vacationUntil ?? null }));
    setShowVacationModal(false);
  };

  const activeConv = conversations.find(c => c.id === activeConvId);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now - d;
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffMs / 86400000);
    if (diffH < 1) return Math.max(1, Math.floor(diffMs / 60000)) + ' min';
    if (diffH < 24) return diffH + 'h';
    if (diffD < 7) return diffD + 'j';
    return d.toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '70dvh', minHeight: 500 }}>

      {/* Header avec toggle vacances + filtre archivés */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Statut chat</div>
          <button
            onClick={() => setShowVacationModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              background: adminProfile?.admin_chat_status === 'vacation' ? '#fef3c7' : '#dcfce7',
              color: adminProfile?.admin_chat_status === 'vacation' ? '#92400e' : '#166534',
              border: '1px solid', borderColor: adminProfile?.admin_chat_status === 'vacation' ? '#fde68a' : '#86efac',
              borderRadius: 12, padding: '6px 12px',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}
          >
            {adminProfile?.admin_chat_status === 'vacation'
              ? '🌴 En congés' + (adminProfile.vacation_until ? ' jusqu\'au ' + new Date(adminProfile.vacation_until).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' }) : '')
              : '● Disponible'}
            <span style={{ fontSize: 11, opacity: 0.7 }}>· modifier</span>
          </button>
        </div>
        <button
          onClick={() => setShowArchived(s => !s)}
          style={{
            background: showArchived ? '#1F1F20' : '#f1f3f5',
            color: showArchived ? '#fff' : '#1F1F20',
            border: 'none', borderRadius: 10, padding: '8px 12px',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {showArchived ? 'Masquer archivées' : 'Voir archivées'}
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flex: 1, minHeight: 0 }}>

        {/* Liste des conversations */}
        <div style={{
          width: activeConvId ? 0 : '100%',
          maxWidth: activeConvId ? 0 : 360,
          flex: activeConvId ? '0 0 0' : '1 1 360px',
          overflow: 'hidden',
          background: '#fff', borderRadius: 14,
          boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
          display: 'flex', flexDirection: 'column',
          transition: 'all 0.2s',
        }} className="msg-list">
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', fontSize: 13, fontWeight: 800 }}>
            Conversations {conversations.length > 0 ? `(${conversations.length})` : ''}
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement…</div>
            ) : conversations.length === 0 ? (
              <div style={{ padding: 30, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Aucune conversation</div>
            ) : conversations.map(c => (
              <button
                key={c.id}
                onClick={() => setActiveConvId(c.id)}
                style={{
                  width: '100%', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '12px 14px', border: 'none', cursor: 'pointer',
                  background: activeConvId === c.id ? '#e8f7fd' : 'transparent',
                  borderBottom: '1px solid #f3f4f6',
                  position: 'relative',
                }}
              >
                <img
                  src={c.member?.avatar_url || 'https://app.caniplus.ch/icons/icon-192.png'}
                  alt=""
                  style={{ width: 38, height: 38, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: '#e5e7eb' }}
                  onError={(e) => { e.currentTarget.src = 'https://app.caniplus.ch/icons/icon-192.png'; }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: c.unread_count_admin > 0 ? 800 : 700, color: '#1F1F20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {c.member?.full_name || c.member?.email || 'Membre'}
                    </div>
                    <div style={{ fontSize: 10, color: '#9ca3af', flexShrink: 0 }}>{fmtDate(c.last_message_at)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: c.unread_count_admin > 0 ? '#1F1F20' : '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: c.unread_count_admin > 0 ? 600 : 400 }}>
                    {c.last_message_sender === 'admin' && <span style={{ color: '#9ca3af' }}>Toi : </span>}
                    {c.last_message_preview || '(pas de message)'}
                  </div>
                </div>
                {c.unread_count_admin > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff',
                    fontSize: 11, fontWeight: 800,
                    minWidth: 20, height: 20,
                    borderRadius: 10, padding: '0 6px',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>{c.unread_count_admin}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Vue détail */}
        {activeConv && (
          <div style={{
            flex: 1, minWidth: 0,
            background: '#fff', borderRadius: 14,
            boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
          }}>
            {/* Header conv */}
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
              <button onClick={() => setActiveConvId(null)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Icon name="arrowLeft" size={18} color="#1F1F20" />
              </button>
              <img
                src={activeConv.member?.avatar_url || 'https://app.caniplus.ch/icons/icon-192.png'}
                alt=""
                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', background: '#e5e7eb' }}
                onError={(e) => { e.currentTarget.src = 'https://app.caniplus.ch/icons/icon-192.png'; }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeConv.member?.full_name || activeConv.member?.email || 'Membre'}
                </div>
                {activeConv.member?.email && (
                  <div style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {activeConv.member.email}
                  </div>
                )}
              </div>
              {activeConv.archived_admin ? (
                <button onClick={() => unarchiveConv(activeConv.id)}
                  style={{ background: '#f1f3f5', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Désarchiver
                </button>
              ) : (
                <button onClick={() => archiveConv(activeConv.id)}
                  title="Archiver cette conversation"
                  style={{ background: '#f1f3f5', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Archiver
                </button>
              )}
            </div>
            {/* Thread */}
            <ChatThread
              conversationId={activeConv.id}
              currentUserId={profile?.id}
              currentUserRole="admin"
              memberAvatarUrl={activeConv.member?.avatar_url}
            />
            {/* Composer */}
            <ChatComposer
              conversationId={activeConv.id}
              currentUserId={profile?.id}
              onSent={() => loadConversations()}
            />
          </div>
        )}
      </div>

      {/* Modale vacances */}
      {showVacationModal && (
        <VacationModal
          current={adminProfile}
          onSave={setVacation}
          onClose={() => setShowVacationModal(false)}
        />
      )}

      <style>{`
        @media (max-width: 768px) {
          .msg-list { display: ${activeConvId ? 'none' : 'flex'} !important; }
        }
      `}</style>
    </div>
  );
}

function VacationModal({ current, onSave, onClose }) {
  const [status, setStatus] = useState(current?.admin_chat_status ?? 'available');
  const [until, setUntil] = useState(current?.vacation_until ? current.vacation_until.substring(0, 10) : '');

  const handleSave = () => {
    if (status === 'vacation' && !until) {
      if (!confirm('Aucune date de retour. Le banner indiquera juste "en congés". Continuer ?')) return;
    }
    onSave(status, status === 'vacation' && until ? until + 'T00:00:00Z' : null);
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 380 }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>Mode vacances</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 18 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: status === 'available' ? '#dcfce7' : '#f8f9fa', borderRadius: 10, cursor: 'pointer' }}>
            <input type="radio" checked={status === 'available'} onChange={() => setStatus('available')} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>● Disponible</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: status === 'vacation' ? '#fef3c7' : '#f8f9fa', borderRadius: 10, cursor: 'pointer' }}>
            <input type="radio" checked={status === 'vacation'} onChange={() => setStatus('vacation')} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>🌴 En congés</span>
          </label>
        </div>
        {status === 'vacation' && (
          <div style={{ marginBottom: 18 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Date de retour (optionnel)</label>
            <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 14 }} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: '#f1f3f5', color: '#6b7280', fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
          <button onClick={handleSave} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
