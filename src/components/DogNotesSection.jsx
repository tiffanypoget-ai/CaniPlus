// src/components/DogNotesSection.jsx
// Fil de remarques partagées sur un chien (membre + admin).
// Mode 'member' : insert direct via supabase + appel notify-admin pour notif côté Tiffany.
// Mode 'admin'  : appelle admin-query (action=add_dog_note_admin / delete_dog_note_admin).
//
// Props :
//   - dogId      : UUID du chien
//   - dogName    : nom affiché ("Buck") pour les confirmations
//   - notes      : tableau initial [{ id, author_role, author_name, content, created_at, author_id }]
//   - mode       : 'member' | 'admin'
//   - currentUserId : (member only) id de l'utilisateur connecté (pour DELETE policy)
//   - currentUserName : nom snapshot à inscrire dans author_name
//   - adminPassword : (admin only) mot de passe admin pour appeler admin-query
//   - onChange   : callback appelé après ajout/suppression (pour rafraîchir la liste parente)
//
// Pas de "skin" lourd : la section s'intègre dans la modale parent.

import { useState } from 'react';
import { Icon } from './Icons';
import { supabase } from '../supabaseClient';

const SUPA_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';

function formatDate(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' · ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

export default function DogNotesSection({
  dogId,
  dogName,
  notes = [],
  mode = 'member',
  currentUserId,
  currentUserName,
  adminPassword,
  onChange,
}) {
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState(null);

  const handleAdd = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    setError(null);
    try {
      if (mode === 'admin') {
        const r = await fetch(`${SUPA_URL}/functions/v1/admin-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_password: adminPassword,
            action: 'add_dog_note_admin',
            payload: { dog_id: dogId, content, author_name: currentUserName ?? 'Tiffany' },
          }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || 'Erreur ajout remarque');
      } else {
        // Mode membre : insert direct (RLS gère qu'on est bien le owner)
        const { error: insErr } = await supabase
          .from('dog_notes')
          .insert({
            dog_id: dogId,
            author_id: currentUserId,
            author_role: 'owner',
            author_name: currentUserName ?? null,
            content,
          });
        if (insErr) throw insErr;

        // Notif à l'admin (best effort, non bloquante)
        try {
          await fetch(`${SUPA_URL}/functions/v1/notify-admin`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              kind: 'dog_note',
              title: `Nouvelle remarque sur ${dogName}`,
              body: `${currentUserName ?? 'Un membre'} : ${content.slice(0, 140)}`,
              metadata: { dog_id: dogId, link: '/admin' },
              channels: ['in_app', 'push'],
            }),
          });
        } catch { /* ignore */ }
      }
      setDraft('');
      onChange && onChange();
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (note) => {
    if (!window.confirm('Supprimer cette remarque ?')) return;
    setDeletingId(note.id);
    setError(null);
    try {
      if (mode === 'admin') {
        const r = await fetch(`${SUPA_URL}/functions/v1/admin-query`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            admin_password: adminPassword,
            action: 'delete_dog_note_admin',
            payload: { note_id: note.id },
          }),
        });
        const j = await r.json();
        if (!r.ok || j.error) throw new Error(j.error || 'Erreur suppression');
      } else {
        const { error: dErr } = await supabase.from('dog_notes').delete().eq('id', note.id);
        if (dErr) throw dErr;
      }
      onChange && onChange();
    } catch (e) {
      setError(e.message || 'Erreur');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      {/* Liste */}
      {notes.length === 0 ? (
        <div style={{ padding: '12px', background: '#f9fafb', borderRadius: 10, fontSize: 12, color: '#6b7280', textAlign: 'center', marginBottom: 10 }}>
          Aucune remarque pour {dogName} pour le moment.
        </div>
      ) : (
        <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {notes.map(n => {
            const isAdmin = n.author_role === 'admin';
            const canDelete = mode === 'admin' || (mode === 'member' && n.author_role === 'owner' && n.author_id === currentUserId);
            return (
              <div key={n.id} style={{
                background: isAdmin ? '#eff6ff' : '#fefce8',
                border: `1px solid ${isAdmin ? '#dbeafe' : '#fef3c7'}`,
                borderRadius: 10, padding: '10px 12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon name={isAdmin ? 'sparkle' : 'paw'} size={12} color={isAdmin ? '#2563eb' : '#a16207'} />
                  <div style={{ fontSize: 11, fontWeight: 800, color: isAdmin ? '#2563eb' : '#a16207', textTransform: 'uppercase', letterSpacing: 0.3 }}>
                    {n.author_name || (isAdmin ? 'Tiffany' : 'Propriétaire')}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginLeft: 'auto' }}>{formatDate(n.created_at)}</div>
                </div>
                <div style={{ fontSize: 13, color: '#1F1F20', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{n.content}</div>
                {canDelete && (
                  <button
                    onClick={() => handleDelete(n)}
                    disabled={deletingId === n.id}
                    style={{ marginTop: 6, background: 'none', border: 'none', color: '#9ca3af', fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                  >
                    {deletingId === n.id ? 'Suppression…' : 'Supprimer'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Champ d'ajout */}
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={2}
        placeholder={mode === 'admin'
          ? `Note partagée avec le propriétaire (visible par lui)…`
          : `Allergie, comportement, observation pour ${dogName}…`}
        style={{
          width: '100%', padding: '10px 12px', borderRadius: 10,
          border: '1.5px solid #e5e7eb', fontSize: 13, color: '#1F1F20',
          boxSizing: 'border-box', outline: 'none', resize: 'vertical',
          fontFamily: 'inherit', marginBottom: 6,
        }}
      />
      <button
        onClick={handleAdd}
        disabled={saving || !draft.trim()}
        style={{
          width: '100%', padding: '10px',
          borderRadius: 10, border: 'none',
          background: !draft.trim() ? '#e5e7eb' : '#2BABE1',
          color: !draft.trim() ? '#9ca3af' : '#fff',
          fontSize: 13, fontWeight: 700,
          cursor: saving || !draft.trim() ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}
      >
        {saving ? 'Envoi…' : <><Icon name="plus" size={14} color={!draft.trim() ? '#9ca3af' : '#fff'} /> Ajouter une remarque</>}
      </button>

      {error && (
        <div style={{ marginTop: 8, padding: '8px 10px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, fontSize: 12, color: '#dc2626' }}>
          {error}
        </div>
      )}
    </div>
  );
}
