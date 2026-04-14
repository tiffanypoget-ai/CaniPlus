// src/screens/AdminScreen.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_FN = 'admin-query';

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
  const [confirmDelete, setConfirmDelete] = useState(null); // { type: 'lesson'|'sub'|'member', id, memberId, name }

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

  const handleDeleteMember = async (userId) => {
    setActionLoading(userId + '_deletemember');
    const { data, error } = await callAdmin('delete_member', pwd, { user_id: userId });
    if (error || data?.error) {
      alert('Erreur lors de la suppression : ' + (data?.error || error?.message || 'Erreur inconnue'));
    }
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

  const handleSetCourseType = async (member, course_type) => {
    setActionLoading(member.id + '_coursetype');
    await callAdmin('set_course_type', pwd, { user_id: member.id, course_type });
    await load();
    setActionLoading(null);
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

            {/* Type de cours */}
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: C.gray, fontWeight: 600 }}>Type de cours :</span>
              {[
                { key: 'group', label: '👥 Collectifs' },
                { key: 'private', label: '🎯 Privés' },
                { key: 'both', label: '🐾 Les deux' },
              ].map(({ key, label }) => {
                const current = member.course_type ?? 'group';
                const isActive = current === key;
                const isLoading = actionLoading === member.id + '_coursetype';
                return (
                  <button
                    key={key}
                    onClick={() => !isActive && handleSetCourseType(member, key)}
                    disabled={isLoading || isActive}
                    style={{
                      padding: '4px 10px', borderRadius: 20, border: 'none', fontSize: 11, fontWeight: 700, cursor: isActive ? 'default' : 'pointer',
                      background: isActive ? C.blue : C.grayBg,
                      color: isActive ? '#fff' : C.gray,
                      opacity: isLoading ? 0.6 : 1,
                      transition: 'background 0.15s',
                    }}
                  >
                    {isLoading && isActive ? '…' : label}
                  </button>
                );
              })}
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
                      {dog.vaccinated ? '✓ Vacciné' : 'À vérifier'}
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
                  🗑 Cours privé
                </button>
              )}
              <button
                onClick={() => setConfirmDelete({ type: 'member', memberId: member.id, name: member.full_name })}
                disabled={!!actionLoading}
                style={{ padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#fce4e4', color: '#b91c1c', opacity: actionLoading === member.id + '_deletemember' ? 0.6 : 1 }}
              >
                {actionLoading === member.id + '_deletemember' ? '…' : '🗑 Supprimer compte'}
              </button>
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
              {confirmDelete.type === 'member'
                ? <>Supprimer définitivement le compte de <strong>{confirmDelete.name}</strong> ? Toutes ses données (chiens, paiements, inscriptions) seront effacées. Cette action est irréversible.</>
                : <>Supprimer le cours privé de <strong>{confirmDelete.name}</strong> ? Cette action est irréversible.</>
              }
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button
                onClick={() => {
                  if (confirmDelete.type === 'lesson') handleDeleteLesson(confirmDelete.memberId);
                  else if (confirmDelete.type === 'member') handleDeleteMember(confirmDelete.memberId);
                  else handleDeleteSub(confirmDelete.id);
                }}
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

  const cancel = async (req) => {
    if (!window.confirm(`Annuler le cours privé confirmé de ${req.profiles?.full_name ?? 'ce membre'} ?`)) return;
    const key = req.id + '_cancel';
    setActionLoading(key);
    await callAdmin('update_request', pwd, { request_id: req.id, status: 'cancelled' });
    await callAdmin('delete_lesson', pwd, { user_id: req.user_id });
    await load();
    setActionLoading(null);
  };

  const fmtSlot = (slot) => {
    const d = new Date(slot.date + 'T00:00:00');
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const months = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'aoû', 'sep', 'oct', 'nov', 'déc'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]} · ${slot.start}–${slot.end}`;
  };

  const pendingCount  = requests.filter(r => r.status === 'pending').length;
  const cancelledCount = requests.filter(r => r.status === 'cancelled').length;
  const filtered = requests.filter(r => filter === 'all' ? true : r.status === filter);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['pending',   `⏳ En attente${pendingCount > 0 ? ` (${pendingCount})` : ''}`],
          ['confirmed', '✅ Confirmées'],
          ['cancelled', `🚫 Annulées${cancelledCount > 0 ? ` (${cancelledCount})` : ''}`],
          ['rejected',  '✗ Refusées'],
          ['all',       'Tout'],
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
        <div key={req.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : req.status === 'cancelled' ? C.red : '#d1d5db'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, background: C.grayBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🙋‍♀️</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{req.profiles?.full_name ?? '—'}</div>
              <div style={{ fontSize: 11, color: C.gray }}>{req.profiles?.email ?? ''} · {new Date(req.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
            <Badge
              color={req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : req.status === 'cancelled' ? C.red : C.gray}
              bg={req.status === 'pending' ? C.orangeBg : req.status === 'confirmed' ? C.greenBg : req.status === 'cancelled' ? C.redBg : C.grayBg}
            >
              {req.status === 'pending' ? 'En attente' : req.status === 'confirmed' ? 'Confirmé' : req.status === 'cancelled' ? '🚫 Annulé par le membre' : 'Refusé'}
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
            <div>
              <div style={{ background: C.greenBg, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8 }}>
                📅 {fmtSlot(req.chosen_slot)}
              </div>
              <button onClick={() => cancel(req)} disabled={!!actionLoading} style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_cancel' ? 0.6 : 1 }}>
                {actionLoading === req.id + '_cancel' ? '…' : '✗ Annuler ce cours'}
              </button>
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
  const [courseForm, setCourseForm] = useState({ addToPlan: false, course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00' });
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
    setCourseForm({ addToPlan: false, course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00' });
    setEditing('new');
  };

  const openEdit = (item) => {
    setForm({ title: item.title, content: item.content, published: item.published });
    setCourseForm({ addToPlan: false, course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00' });
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
    // Ajouter au planning si coché
    if (courseForm.addToPlan && courseForm.course_date) {
      await callAdmin('create_course', pwd, {
        course_type: courseForm.course_type,
        course_date: courseForm.course_date,
        start_time: courseForm.start_time,
        end_time: courseForm.end_time,
      });
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
            {/* Case "Ajouter au planning" */}
            <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '12px 14px', marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: '#0369a1', cursor: 'pointer', marginBottom: courseForm.addToPlan ? 12 : 0 }}>
                <input type="checkbox" checked={courseForm.addToPlan} onChange={e => setCourseForm(f => ({ ...f, addToPlan: e.target.checked }))} />
                📅 Ajouter un cours au planning des membres
              </label>
              {courseForm.addToPlan && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 'collectif', l: '👥 Collectif' }, { v: 'theorique', l: '📖 Théorique' }].map(({ v, l }) => (
                      <button key={v} type="button" onClick={() => setCourseForm(f => ({ ...f, course_type: v }))}
                        style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: courseForm.course_type === v ? C.blue : C.grayBg, color: courseForm.course_type === v ? '#fff' : C.gray }}>
                        {l}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={courseForm.course_date} onChange={e => setCourseForm(f => ({ ...f, course_date: e.target.value }))}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #bae6fd', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 3 }}>Début</div>
                      <input type="time" value={courseForm.start_time} onChange={e => setCourseForm(f => ({ ...f, start_time: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #bae6fd', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: C.gray, marginBottom: 3 }}>Fin</div>
                      <input type="time" value={courseForm.end_time} onChange={e => setCourseForm(f => ({ ...f, end_time: e.target.value }))}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1.5px solid #bae6fd', fontSize: 13, boxSizing: 'border-box', outline: 'none' }} />
                    </div>
                  </div>
                </div>
              )}
            </div>

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



// ─── Onglet Planning ─────────────────────────────────────────────────────────
function PlanningTab({ pwd }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | { course object }
  const COLORS = ['#2BABE1','#eab308','#f97316','#16a34a','#8b5cf6','#ec4899'];
  const TYPE_DEFAULT_COLOR = { collectif: '#2BABE1', theorique: '#eab308', prive: '#f97316' };
  const [form, setForm] = useState({ course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1' });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [actionLoading, setActionLoading] = useState(null);
  const [showPast, setShowPast] = useState(false);

  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  const [loadError, setLoadError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const today = fmt(new Date());
    const payload = showPast ? {} : { from_date: today };
    const { data, error } = await callAdmin('list_courses', pwd, payload);
    console.log('[PlanningTab] list_courses →', { payload, data, error });
    if (error) { setLoadError(String(error?.message ?? error)); setLoading(false); return; }
    if (data?.courses) setCourses(data.courses);
    else setCourses([]);
    setLoading(false);
  }, [pwd, showPast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({ course_type: 'collectif', course_date: fmt(today), start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1' });
    setEditing('new');
  };

  const openEdit = (course) => {
    const ct = course.course_type ?? 'collectif';
    setForm({
      course_type: ct,
      course_date: course.course_date ?? '',
      start_time:  course.start_time ?? '09:00',
      end_time:    course.end_time ?? '10:00',
      notes:       course.notes ?? '',
      price:       course.price ? String(course.price) : '',
      color:       course.color ?? TYPE_DEFAULT_COLOR[ct] ?? '#2BABE1',
    });
    setEditing(course);
  };

  const handleSave = async () => {
    if (!form.course_date) return;
    setSaving(true);
    const coursePayload = { ...form, price: form.price !== '' ? parseInt(form.price, 10) : 0, color: form.color || TYPE_DEFAULT_COLOR[form.course_type] || '#2BABE1' };
    if (editing === 'new') {
      await callAdmin('create_course', pwd, coursePayload);
    } else {
      await callAdmin('update_course', pwd, { course_id: editing.id, ...coursePayload });
    }
    await load();
    setSaving(false);
    setEditing(null);
  };

  const handleDelete = async (course) => {
    setActionLoading(course.id);
    await callAdmin('delete_course', pwd, { course_id: course.id });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
  };

  const DAYS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
  const MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

  const fmtDay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  };

  // Grouper par semaine
  const getWeekKey = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const mon = new Date(d); mon.setDate(d.getDate() + diff);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return `${mon.getDate()} – ${sun.getDate()} ${MONTHS_FULL[sun.getMonth()]} ${sun.getFullYear()}`;
  };

  const grouped = courses.reduce((acc, c) => {
    const key = getWeekKey(c.course_date);
    if (!acc[key]) acc[key] = [];
    acc[key].push(c);
    return acc;
  }, {});

  const TYPE_CONFIG = {
    collectif: { label: '👥 Collectif',  bg: '#e0f4fd', color: '#2BABE1' },
    theorique: { label: '📖 Théorique', bg: '#fef9c3', color: '#eab308' },
    prive:     { label: '🎯 Privé',      bg: '#fff7ed', color: '#f97316' },
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={openNew} style={{ flex: 1, background: C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          + Ajouter un cours
        </button>
        <button onClick={() => setShowPast(p => !p)} style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: showPast ? C.dark : C.grayBg, color: showPast ? '#fff' : C.gray, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
          {showPast ? '← Masquer passés' : '🕐 Voir passés'}
        </button>
      </div>

      {loadError && (
        <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13 }}>
          ⚠️ Erreur : {loadError}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>
          Aucun cours à venir
          {!showPast && <div style={{ marginTop: 8, fontSize: 12 }}><button onClick={() => setShowPast(true)} style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', textDecoration: 'underline', fontSize: 12 }}>Voir aussi les cours passés</button></div>}
        </div>
      ) : Object.entries(grouped).map(([weekLabel, weekCourses]) => (
        <div key={weekLabel}>
          <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px 6px', marginTop: 4 }}>
            📅 {weekLabel}
          </div>
          {weekCourses.map(course => {
            const tc = TYPE_CONFIG[course.course_type] ?? TYPE_CONFIG.collectif;
            const cardColor = course.color || tc.color;
            return (
              <div key={course.id} style={{ background: C.card, borderRadius: 14, padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${cardColor}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ background: cardColor + '22', color: cardColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>{tc.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{fmtDay(course.course_date)}</span>
                      <span style={{ fontSize: 12, color: C.gray }}>{course.start_time ?? '?'} – {course.end_time ?? '?'}</span>
                    </div>
                    {(course.price > 0 || course.notes) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                        {course.price > 0 && (
                          <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>CHF {course.price}</span>
                        )}
                        {course.notes && (
                          <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic' }}>📝 {course.notes}</span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(course)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#e0f4fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>✏️</button>
                    <button
                      onClick={() => setConfirmDelete(course)}
                      disabled={!!actionLoading}
                      style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === course.id ? 0.6 : 1 }}
                    >🗑</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Modal ajout/modification */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 20 }}>
              {editing === 'new' ? '+ Nouveau cours' : '✏️ Modifier le cours'}
            </div>

            {/* Type */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 6 }}>Type de cours</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ v: 'collectif', l: '👥 Collectif' }, { v: 'theorique', l: '📖 Théorique' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, course_type: v, color: TYPE_DEFAULT_COLOR[v] ?? '#2BABE1' }))}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: form.course_type === v ? C.blue : C.grayBg, color: form.course_type === v ? '#fff' : C.gray }}>
                  {l}
                </button>
              ))}
            </div>

            {/* Date */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Date *</label>
            <input type="date" value={form.course_date} onChange={e => setForm(f => ({ ...f, course_date: e.target.value }))}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />

            {/* Heures */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Début</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Fin</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>

            {/* Prix */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Montant à payer (CHF) — laisser vide si gratuit</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>CHF</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0"
                style={{ width: 100, padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                {[20, 50, 60, 75].map(v => (
                  <button key={v} type="button" onClick={() => setForm(f => ({ ...f, price: String(v) }))}
                    style={{ padding: '5px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: form.price === String(v) ? C.blue : C.grayBg, color: form.price === String(v) ? '#fff' : C.gray }}>
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Couleur */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 8 }}>Couleur du cours</label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              {COLORS.map(c => (
                <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                  style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.color === c ? '3px solid #1F1F20' : '3px solid transparent', cursor: 'pointer', flexShrink: 0, boxShadow: form.color === c ? '0 0 0 2px #fff inset' : 'none', transition: 'all 0.15s' }} />
              ))}
            </div>

            {/* Notes / description */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes / description (visible par les membres)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ex: Apporter une laisse courte · Terrain B · Tenue de pluie recommandée…"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.course_date} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Enregistrement…' : '✓ Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8 }}>⚠️ Supprimer ce cours ?</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              {TYPE_CONFIG[confirmDelete.course_type]?.label} · {fmtDay(confirmDelete.course_date)} · {confirmDelete.start_time}–{confirmDelete.end_time}
              <br /><span style={{ color: C.red, fontSize: 12 }}>Cette action est irréversible.</span>
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
    { id: 'planning',   label: '📅 Planning' },
    { id: 'news',       label: '📣 News' },
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
        {tab === 'planning'   && <PlanningTab pwd={pwd} />}
        {tab === 'news'       && <NewsTab pwd={pwd} />}
      </div>
    </div>
  );
}
