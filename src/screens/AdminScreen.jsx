// src/screens/AdminScreen.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_FN = 'admin-query';
const GCAL_ID = '86193b5af60ce2a68d15ff3eaecc04bd07632a9dda09aecce8dd239e3dddb413@group.calendar.google.com';

function callAdmin(action, admin_password, payload = null) {
  return supabase.functions.invoke(ADMIN_FN, {
    body: { action, admin_password, payload },
  });
}

// ─── Couleurs ────────────────────────────────────────────────────────────────
const C = {
  bg: '#f4f6f8', card: '#fff', dark: '#1F1F20', blue: '#2BABE1',
  green: '#16a34a', greenBg: '#dcfce7', red: '#ef4444', redBg: '#fee2e2',
  orange: '#d97706', orangeBg: '#fef3c7', gray: '#6b7280', grayBg: '#f3f4f6',
};

function Badge({ color, bg, children }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
      {children}
    </span>
  );
}

// ─── Écran login admin ───────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { data, error: fnError } = await callAdmin('list_members', pwd);
    if (fnError || data?.error) {
      setError('Mot de passe incorrect');
      setLoading(false);
    } else {
      onLogin(pwd);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 40, color: C.dark }}>CaniPlus</div>
          <div style={{ fontSize: 14, color: C.gray, marginTop: 4 }}>Administration</div>
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Mot de passe admin"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${error ? C.red : '#e5e7eb'}`, fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            autoFocus
          />
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>⚠️ {error}</div>}
          <button
            type="submit"
            disabled={loading || !pwd}
            style={{ width: '100%', background: loading ? '#9ca3af' : C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Vérification…' : 'Accéder'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Onglet Membres ──────────────────────────────────────────────────────────
function MembresTab({ pwd }) {
  const [members, setMembers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedDogs, setExpandedDogs] = useState({});
  const [lessonTarget, setLessonTarget] = useState(null);
  const [lessonDate, setLessonDate] = useState('');
  const [lessonTime, setLessonTime] = useState('');
  const [lessonNotes, setLessonNotes] = useState('');
  const [lessonSaving, setLessonSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'lesson'|'sub', id, memberId }

  const load = useCallback(async () => {
    setLoading(true);
    const [m, s, d] = await Promise.all([
      callAdmin('list_members', pwd),
      callAdmin('list_subscriptions', pwd),
      callAdmin('list_dogs', pwd),
    ]);
    if (m.data?.members) setMembers(m.data.members);
    if (s.data?.subscriptions) setSubscriptions(s.data.subscriptions);
    if (d.data?.dogs) setDogs(d.data.dogs);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const getCotisation = (userId) => {
    const year = new Date().getFullYear();
    return subscriptions.find(s => s.user_id === userId && s.type === 'cotisation_annuelle' && s.year === year);
  };

  const getLesson = (userId) =>
    subscriptions.find(s => s.user_id === userId && s.type === 'lecon_privee');

  const getMemberDogs = (userId) =>
    dogs.filter(d => d.owner_id === userId);

  const isPremium = (member) => member.premium_until && new Date(member.premium_until) > new Date();

  const togglePremium = async (member) => {
    setActionLoading(member.id + '_premium');
    const premium_until = isPremium(member) ? null : new Date(Date.now() + 365 * 86400000).toISOString();
    await callAdmin('set_premium', pwd, { user_id: member.id, premium_until });
    await load();
    setActionLoading(null);
  };

  const toggleCotisation = async (member) => {
    setActionLoading(member.id + '_cotisation');
    const coti = getCotisation(member.id);
    const newStatus = coti?.status === 'paid' ? 'pending' : 'paid';
    await callAdmin('set_cotisation', pwd, { user_id: member.id, status: newStatus });
    await load();
    setActionLoading(null);
  };

  const openLessonModal = (member) => {
    const existing = getLesson(member.id);
    if (existing?.lesson_date) {
      const d = new Date(existing.lesson_date);
      setLessonDate(d.toISOString().slice(0, 10));
      setLessonTime(d.toTimeString().slice(0, 5));
      setLessonNotes(existing.lesson_notes ?? '');
    } else {
      setLessonDate('');
      setLessonTime('09:00');
      setLessonNotes('');
    }
    setLessonTarget(member);
  };

  const handleSaveLesson = async () => {
    if (!lessonDate || !lessonTime) return;
    setLessonSaving(true);
    const lesson_date = new Date(`${lessonDate}T${lessonTime}:00`).toISOString();
    await callAdmin('set_lesson_date', pwd, {
      user_id: lessonTarget.id,
      lesson_date,
      lesson_notes: lessonNotes || null,
    });
    await load();
    setLessonSaving(false);
    setLessonTarget(null);
  };

  const handleDeleteLesson = async (userId) => {
    setActionLoading(userId + '_deletelesson');
    await callAdmin('delete_lesson', pwd, { user_id: userId });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
  };

  const handleDeleteSub = async (subId) => {
    setActionLoading(subId + '_deletesub');
    await callAdmin('delete_subscription', pwd, { subscription_id: subId });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
  };

  const fmtLesson = (iso) => new Date(iso).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const fmtBirth = (year) => year ? `né${year < 2020 ? '' : 'e'} en ${year}` : '';

  const filtered = members.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <input
        placeholder="🔍 Rechercher un membre…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
      />
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 12 }}>{filtered.length} membre{filtered.length > 1 ? 's' : ''}</div>

      {filtered.map(member => {
        const coti = getCotisation(member.id);
        const premium = isPremium(member);
        const lesson = getLesson(member.id);
        const memberDogs = getMemberDogs(member.id);
        const dogsExpanded = expandedDogs[member.id];
        return (
          <div key={member.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            {/* En-tête membre */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: C.grayBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🙋‍♀️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{member.full_name}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 1 }}>{member.email}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Badge color={coti?.status === 'paid' ? C.green : C.orange} bg={coti?.status === 'paid' ? C.greenBg : C.orangeBg}>
                    {coti?.status === 'paid' ? 'Cotisation ✓' : 'Cotisation en attente'}
                  </Badge>
                  {premium && <Badge color="#92400e" bg="#fef3c7">Premium ✨</Badge>}
                  {lesson?.lesson_date && <Badge color={C.blue} bg="#e0f4fd">🎯 {fmtLesson(lesson.lesson_date)}</Badge>}
                </div>
              </div>
            </div>

            {/* Chiens */}
            {memberDogs.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <button
                  onClick={() => setExpandedDogs(p => ({ ...p, [member.id]: !p[member.id] }))}
                  style={{ background: '#fef3c7', border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 700, color: '#92400e', cursor: 'pointer', marginBottom: dogsExpanded ? 8 : 0 }}
                >
                  🐕 {memberDogs.length} chien{memberDogs.length > 1 ? 's' : ''} {dogsExpanded ? '▲' : '▼'}
                </button>
                {dogsExpanded && memberDogs.map(dog => (
                  <div key={dog.id} style={{ background: '#fffbeb', borderRadius: 8, padding: '8px 10px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 16 }}>🐕</span>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: C.dark }}>{dog.name}</span>
                      <span style={{ fontSize: 12, color: C.gray }}>{dog.breed ? ` · ${dog.breed}` : ''}{dog.sex ? ` · ${dog.sex === 'M' ? '♂' : '♀'}` : ''}{dog.birth_year ? ` · ${fmtBirth(dog.birth_year)}` : ''}</span>
                    </div>
                    <Badge color={dog.vaccinated ? C.green : C.orange} bg={dog.vaccinated ? C.greenBg : C.orangeBg}>
                     {dog.vaccinated ? '✓ Vacci©' : 'À vérifier'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => toggleCotisation(member)}
                disabled={!!actionLoading}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: coti?.status === 'paid' ? C.redBg : C.greenBg,
                  color: coti?.status === 'paid' ? C.red : C.green,
                  opacity: actionLoading === member.id + '_cotisation' ? 0.6 : 1,
                  minWidth: 120,
                }}
              >
                {actionLoading === member.id + '_cotisation' ? '…' : coti?.status === 'paid' ? '✗ Annuler cotisation' : '✓ Valider cotisation'}
              </button>
              <button
                onClick={() => togglePremium(member)}
                disabled={!!actionLoading}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: premium ? C.redBg : C.orangeBg,
                  color: premium ? C.red : C.orange,
                  opacity: actionLoading === member.id + '_premium' ? 0.6 : 1,
                  minWidth: 120,
                }}
              >
                {actionLoading === member.id + '_premium' ? '…' : premium ? '✗ Retirer premium' : '✨ Activer premium'}
              </button>
              <button
                onClick={() => openLessonModal(member)}
                style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#e0f4fd', color: C.blue, minWidth: 120 }}
              >
                📅 {lesson?.lesson_date ? 'Modifier cours' : 'Planifier cours'}
              </button>
              {lesson && (
                <button
                  onClick={() => setConfirmDelete({ type: 'lesson', memberId: member.id, name: member.full_name })}
                  disabled={!!actionLoading}
                  style={{ padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: C.redBg, color: C.red }}
                >
                  🗑 Supprimer cours
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Modal cours privé */}
      {lessonTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 4 }}>📅 Cours privé</div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>{lessonTarget.full_name}</div>
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Heure</label>
            <input type="time" value={lessonTime} onChange={e => setLessonTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
            <input placeholder="Ex: terrain B, apporter la laisse…" value={lessonNotes} onChange={e => setLessonNotes(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setLessonTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSaveLesson} disabled={lessonSaving || !lessonDate || !lessonTime} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: lessonSaving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: lessonSaving ? 'not-allowed' : 'pointer' }}>
                {lessonSaving ? 'Enregistrement…' : '✓ Confirmer le cours'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8 }}>⚠️ Confirmer la suppression</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              Supprimer le cours privé de <strong>{confirmDelete.name}</strong> ? Cette action est irréversible.
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button
                onClick={() => confirmDelete.type === 'lesson' ? handleDeleteLesson(confirmDelete.memberId) : handleDeleteSub(confirmDelete.id)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Paiements ────────────────────────────────────────────────────────
function PaiementsTab({ pwd }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_subscriptions', pwd);
    if (data?.subscriptions) setSubscriptions(data.subscriptions);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (subId) => {
    setActionLoading(subId);
    await callAdmin('delete_subscription', pwd, { subscription_id: subId });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
  };

  const typeLabel = { cotisation_annuelle: 'Cotisation annuelle', lecon_privee: 'Leçon privée', premium_mensuel: 'Premium', cours_theorique: 'Cours théorique' };
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtAmount = { cotisation_annuelle: 'CHF 150', lecon_privee: 'CHF 60', premium_mensuel: 'CHF 10/mois', cours_theorique: 'CHF 50' };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  const paid = subscriptions.filter(s => s.status === 'paid');
  const pending = subscriptions.filter(s => s.status !== 'paid');

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: C.greenBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{paid.length}</div>
          <div style={{ fontSize: 12, color: C.green }}>Paiements confirmés</div>
        </div>
        <div style={{ flex: 1, background: C.orangeBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.orange }}>{pending.length}</div>
          <div style={{ fontSize: 12, color: C.orange }}>En attente</div>
        </div>
      </div>
      {subscriptions.map(sub => (
        <div key={sub.id} style={{ background: C.card, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 36, height: 36, background: sub.status === 'paid' ? C.greenBg : C.orangeBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {sub.status === 'paid' ? '✅' : '⏳'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{typeLabel[sub.type] ?? sub.type}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.user_email ?? '—'} · {fmtDate(sub.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sub.status === 'paid' ? C.green : C.orange }}>{fmtAmount[sub.type] ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.status === 'paid' ? 'Payé' : 'En attente'}</div>
            <button
              onClick={() => setConfirmDelete(sub)}
              disabled={!!actionLoading}
              style={{ background: C.redBg, color: C.red, border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === sub.id ? 0.6 : 1 }}
            >
              🗑
            </button>
          </div>
        </div>
      ))}
      {subscriptions.length === 0 && <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucun paiement</div>}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8 }}>⚠️ Supprimer ce paiement ?</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              <strong>{typeLabel[confirmDelete.type] ?? confirmDelete.type}</strong> — {fmtAmount[confirmDelete.type] ?? '—'}<br />
              {fmtDate(confirmDelete.created_at)}<br />
              <span style={{ color: C.red, fontSize: 12 }}>Cette action est irréversible.</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(confirmDelete.id)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Demandes cours privé ─────────────────────────────────────────────
function DemandesTab({ pwd, onPendingCount }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [filter, setFilter] = useState('pending');

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_requests', pwd);
    const reqs = data?.requests ?? [];
    setRequests(reqs);
    onPendingCount?.(reqs.filter(r => r.status === 'pending').length);
    setLoading(false);
  }, [pwd, onPendingCount]);

  useEffect(() => { load(); }, [load]);

  const confirm = async (req, slot) => {
    const key = req.id + '_confirm';
    setActionLoading(key);
    await callAdmin('update_request', pwd, { request_id: req.id, status: 'confirmed', chosen_slot: slot });
    const lessonDate = new Date(`${slot.date}T${slot.start}:00`).toISOString();
    await callAdmin('set_lesson_date', pwd, { user_id: req.user_id, lesson_date: lessonDate, lesson_notes: req.admin_notes || null });
    await load();
    setActionLoading(null);
  };

  const reject = async (req) => {
    const key = req.id + '_reject';
    setActionLoading(key);
    await callAdmin('update_request', pwd, { request_id: req.id, status: 'rejected' });
    await load();
    setActionLoading(null);
  };

  const fmtSlot = (slot) => {
    const d = new Date(slot.date + 'T00:00:00');
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${slot.start}–${slot.end}`;
  };

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const filtered = requests.filter(r => filter === 'all' ? true : r.status === filter);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['pending', `⏳ En attente${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['confirmed', '✅ Confirmées'],
          ['rejected', '✗ Refusées'],
          ['all', 'Tout'],
        ].map(([val, label]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: filter === val ? C.dark : C.grayBg, color: filter === val ? '#fff' : C.gray }}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>
          {filter === 'pending' ? 'Aucune demande en attente 🎉' : 'Aucune demande'}
        </div>
      )}

      {filtered.map(req => (
        <div key={req.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : '#d1d5db'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, background: C.grayBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🙋‍♀️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{req.profiles?.full_name ?? '—'}</div>
              <div style={{ fontSize: 11, color: C.gray }}>{req.profiles?.email ?? ''} · {new Date(req.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
            <Badge color={req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : C.gray} bg={req.status === 'pending' ? C.orangeBg : req.status === 'confirmed' ? C.greenBg : C.grayBg}>
              {req.status === 'pending' ? 'En attente' : req.status === 'confirmed' ? 'Confirmé' : 'Refusé'}
            </Badge>
          </div>

          {req.admin_notes && (
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 13, color: '#0369a1', fontStyle: 'italic' }}>
              💬 "{req.admin_notes}"
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {req.status === 'pending' ? 'Créneaux proposés — cliquez pour confirmer :' : req.status === 'confirmed' ? 'Créneau confirmé :' : 'Créneaux proposés :'}
          </div>

          {req.status === 'confirmed' && req.chosen_slot ? (
            <div style={{ background: C.greenBg, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.green }}>
              📅 {fmtSlot(req.chosen_slot)}
            </div>
          ) : (
            (req.availability_slots ?? []).map((slot, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.grayBg, borderRadius: 9, padding: '9px 12px', marginBottom: 6, gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.dark }}>📅 {fmtSlot(slot)}</span>
                {req.status === 'pending' && (
                  <button onClick={() => confirm(req, slot)} disabled={!!actionLoading} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_confirm' ? 0.6 : 1, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {actionLoading === req.id + '_confirm' ? '…' : '✓ Confirmer'}
                  </button>
                )}
              </div>
            ))
          )}

          {req.status === 'pending' && (
            <button onClick={() => reject(req)} disabled={!!actionLoading} style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_reject' ? 0.6 : 1 }}>
              {actionLoading === req.id + '_reject' ? '…' : '✗ Refuser la demande'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Onglet News ──────────────────────────────────────────────────────────────
function NewsTab({ pwd }) {
  const [newsList, setNewsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | { id, title, content, published }
  const [form, setForm] = useState({ title: '', content: '', published: true });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_news', pwd);
    if (data?.news) setNewsList(data.news);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setForm({ title: '', content: '', published: true });
    setEditing('new');
  };

  const openEdit = (item) => {
    setForm({ title: item.title, content: item.content, published: item.published });
    setEditing(item);
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    if (editing === 'new') {
      await callAdmin('create_news', pwd, form);
    } else {
      await callAdmin('update_news', pwd, { news_id: editing.id, ...form });
    }
    await load();
    setSaving(false);
    setEditing(null);
  };

  const handleDelete = async (item) => {
    setActionLoading(item.id);
    await callAdmin('delete_news', pwd, { news_id: item.id });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
  };

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <button
        onClick={openNew}
        style={{ width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}
      >
        + Nouvelle actualité
      </button>

      {newsList.length === 0 && (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucune actualité publiée</div>
      )}

      {newsList.map(item => (
        <div key={item.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${item.published ? C.blue : '#d1d5db'}` }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 6 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{item.title}</div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>{fmtDate(item.created_at)}</div>
            </div>
            {!item.published && <Badge color={C.gray} bg={C.grayBg}>Brouillon</Badge>}
          </div>
          {item.content && (
            <div style={{ fontSize: 13, color: '#374151', marginBottom: 10, lineHeight: 1.5 }}>
              {item.content.length > 120 ? item.content.slice(0, 120) + '…' : item.content}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => openEdit(item)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: '#e0f4fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              ✏️ Modifier
            </button>
            <button
              onClick={() => callAdmin('update_news', pwd, { news_id: item.id, published: !item.published }).then(load)}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: item.published ? C.orangeBg : C.greenBg, color: item.published ? C.orange : C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              {item.published ? '🙈 Masquer' : '👁 Publier'}
            </button>
            <button onClick={() => setConfirmDelete(item)} disabled={!!actionLoading} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              🗑
            </button>
          </div>
        </div>
      ))}

      {/* Modal éditeur */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 20 }}>
              {editing === 'new' ? '+ Nouvelle actualité' : '✏️ Modifier'}
            </div>
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Titre *</label>
            <input
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="Titre de l'actualité"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
            />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Contenu</label>
            <textarea
              value={form.content}
              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
              placeholder="Texte de l'actualité…"
              rows={5}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.dark, marginBottom: 20, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
              Publier immédiatement
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmer suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8 }}>⚠️ Supprimer cette actualité ?</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              <strong>«{confirmDelete.title}»</strong><br />
              <span style={{ color: C.red, fontSize: 12 }}>Cette action est irréversible.</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Calendrier ────────────────────────────────────────────────────────
function CalendrierTab() {
  const calendarSrc = `https://calendar.google.com/calendar/embed?src=${encodeURIComponent(GCAL_ID)}&ctz=Europe%2FZurich&showTitle=0&showNav=1&showDate=1&showPrint=0&showTabs=0&showCalendars=0&mode=MONTH&hl=fr`;

  const newEventUrl = `https://calendar.google.com/calendar/r/eventedit?src=${encodeURIComponent(GCAL_ID)}`;

  return (
    <div>
      <a
        href={newEventUrl}
        target="_blank"
        rel="noreferrer"
        style={{ display: 'block', width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16, textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}
      >
        + Créer un événement Google Calendar
      </a>
      <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}>
        <iframe
          src={calendarSrc}
          style={{ border: 0, width: '100%', height: 520 }}
          title="Calendrier CaniPlus"
          allowFullScreen
        />
      </div>
      <div style={{ fontSize: 12, color: C.gray, marginTop: 8, textAlign: 'center' }}>
        Pour modifier ou supprimer un événement, ouvrez-le directement dans Google Calendar.
      </div>
    </div>
  );
}

// ─── App principale ──────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [pwd, setPwd] = useState(() => sessionStorage.getItem('admin_pwd') ?? null);
  const [tab, setTab] = useState('membres');
  const [demandesBadge, setDemandesBadge] = useState(0);

  const handleLogin = (password) => {
    sessionStorage.setItem('admin_pwd', password);
    setPwd(password);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_pwd');
    setPwd(null);
  };

  if (!pwd) return <AdminLogin onLogin={handleLogin} />;

  const tabs = [
    { id: 'membres',    label: '👥 Membres' },
    { id: 'paiements',  label: '💳 Paiements' },
    { id: 'demandes',   label: `📋 Demandes${demandesBadge > 0 ? ` (${demandesBadge})` : ''}` },
    { id: 'news',       label: '📣 News' },
    { id: 'calendrier', label: '📅 Calendrier' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      {/* Header */}
      <div style={{ background: C.dark, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff' }}>CaniPlus</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: -2 }}>Administration</div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
        >
          Déconnexion
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e5e7eb', overflowX: 'auto' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: '0 0 auto', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: tab === t.id ? 800 : 500,
              color: tab === t.id ? (t.id === 'demandes' && demandesBadge > 0 ? C.orange : C.blue) : C.gray,
              borderBottom: `3px solid ${tab === t.id ? (t.id === 'demandes' && demandesBadge > 0 ? C.orange : C.blue) : 'transparent'}`,
              whiteSpace: 'nowrap',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
        {tab === 'membres'    && <MembresTab pwd={pwd} />}
        {tab === 'paiements'  && <PaiementsTab pwd={pwd} />}
        {tab === 'demandes'   && <DemandesTab pwd={pwd} onPendingCount={setDemandesBadge} />}
        {tab === 'news'       && <NewsTab pwd={pwd} />}
        {tab === 'calendrier' && <CalendrierTab />}
      </div>
    </div>
  );
}
