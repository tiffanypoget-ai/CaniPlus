// src/screens/AdminScreen.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';
import { usePushNotifications } from '../hooks/usePushNotifications';
import DogNotesSection from '../components/DogNotesSection';

const ADMIN_FN = 'admin-query';
const PUBLISH_FN = 'publish-article-to-github';
const EDITORIAL_FN = 'editorial-bundle-actions';

function callAdmin(action, admin_password, payload = null) {
  return supabase.functions.invoke(ADMIN_FN, {
    body: { action, admin_password, payload },
  });
}

function callPublish(action, admin_password, payload = null) {
  return supabase.functions.invoke(PUBLISH_FN, {
    body: { action, admin_password, payload },
  });
}

function callEditorial(action, admin_password, payload = null) {
  return supabase.functions.invoke(EDITORIAL_FN, {
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
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Icon name="warning" size={14} color={C.red} /> {error}</div>}
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
  const [selectedMember, setSelectedMember] = useState(null); // membre dont on affiche la fiche détaillée
  const [memberDetails, setMemberDetails] = useState(null); // données complètes du membre sélectionné
  const [memberDetailsLoading, setMemberDetailsLoading] = useState(false);
  const [editingNotes, setEditingNotes] = useState(''); // texte des notes admin en cours d'édition
  const [savingNotes, setSavingNotes] = useState(false);

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

  // Charge les détails d'un membre quand on en sélectionne un
  const openMemberDetails = useCallback(async (member) => {
    setSelectedMember(member);
    setMemberDetails(null);
    setMemberDetailsLoading(true);
    const { data } = await callAdmin('get_member_details', pwd, { user_id: member.id });
    if (data) {
      setMemberDetails(data);
      setEditingNotes(data.profile?.admin_notes ?? '');
    }
    setMemberDetailsLoading(false);
  }, [pwd]);

  const closeMemberDetails = () => {
    setSelectedMember(null);
    setMemberDetails(null);
    setEditingNotes('');
  };

  const saveAdminNotes = async () => {
    if (!selectedMember) return;
    setSavingNotes(true);
    await callAdmin('set_admin_notes', pwd, {
      user_id: selectedMember.id,
      admin_notes: editingNotes,
    });
    const { data } = await callAdmin('get_member_details', pwd, { user_id: selectedMember.id });
    if (data) setMemberDetails(data);
    setSavingNotes(false);
  };

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
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Icon name="search" size={16} color={C.gray} style={{ position: 'absolute', left: 10, top: 12, pointerEvents: 'none' }} />
        <input
          placeholder="Rechercher un membre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 12 }}>{filtered.length} membre{filtered.length > 1 ? 's' : ''}</div>

      {filtered.map(member => {
        const coti = getCotisation(member.id);
        const premium = isPremium(member);
        const memberDogs = getMemberDogs(member.id);
        const dogNames = memberDogs.map(d => d.name).filter(Boolean).join(', ');
        const isExternal = member.user_type === 'external';
        const hasAlert = coti?.status !== 'paid' && !isExternal;
        return (
          <button
            key={member.id}
            onClick={() => openMemberDetails(member)}
            style={{
              width: '100%', textAlign: 'left',
              background: C.card, borderRadius: 12, padding: '12px 14px', marginBottom: 8,
              border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 12,
              borderLeft: hasAlert ? `3px solid ${C.orange}` : (premium ? `3px solid #d97706` : '3px solid transparent'),
            }}
          >
            <div style={{ width: 36, height: 36, background: isExternal ? C.grayBg : '#e8f7fd', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="user" size={20} color={isExternal ? C.gray : C.blue} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {member.full_name || '—'}
              </div>
              <div style={{ fontSize: 12, color: C.gray, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <Icon name="dog" size={11} color={C.gray} />
                {dogNames || <span style={{ fontStyle: 'italic' }}>aucun chien</span>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
              {isExternal && <Badge color={C.gray} bg={C.grayBg}>Externe</Badge>}
              {premium && <Badge color="#92400e" bg="#fef3c7">Premium</Badge>}
              {hasAlert && <Badge color={C.orange} bg={C.orangeBg}>Cotisation</Badge>}
            </div>
          </button>
        );
      })}

      {/* ─── Modal : fiche membre détaillée ─────────────────────────────── */}
      {selectedMember && (
        <div onClick={closeMemberDetails} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 12px 50px rgba(0,0,0,0.25)' }}>
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: '18px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 44, height: 44, background: selectedMember.user_type === 'external' ? C.grayBg : '#e8f7fd', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="user" size={24} color={selectedMember.user_type === 'external' ? C.gray : C.blue} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: C.dark, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedMember.full_name}</div>
                  <div style={{ fontSize: 12, color: C.gray, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{selectedMember.email}</div>
                </div>
              </div>
              <button onClick={closeMemberDetails} style={{ background: C.grayBg, border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={16} color={C.gray} />
              </button>
            </div>

            {memberDetailsLoading || !memberDetails ? (
              <div style={{ padding: 40, textAlign: 'center', color: C.gray }}>Chargement…</div>
            ) : (
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                  <Badge color={selectedMember.user_type === 'external' ? C.gray : C.blue} bg={selectedMember.user_type === 'external' ? C.grayBg : '#e8f7fd'}>
                    {selectedMember.user_type === 'external' ? 'Externe (sans cours)' : 'Membre du club'}
                  </Badge>
                  {(() => {
                    const coti = (memberDetails.subscriptions ?? []).find(s => s.type === 'cotisation_annuelle' && s.year === new Date().getFullYear());
                    return (
                      <Badge color={coti?.status === 'paid' ? C.green : C.orange} bg={coti?.status === 'paid' ? C.greenBg : C.orangeBg}>
                        {coti?.status === 'paid' ? 'Cotisation payée' : 'Cotisation en attente'}
                      </Badge>
                    );
                  })()}
                  {memberDetails.profile?.premium_until && new Date(memberDetails.profile.premium_until) > new Date()
                    ? <Badge color="#92400e" bg="#fef3c7">Premium actif</Badge>
                    : <Badge color={C.gray} bg={C.grayBg}>Pas premium</Badge>}
                </div>

                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Cours suivis</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
                  {[
                    { key: 'collectif', label: 'Collectifs', icon: 'users', color: C.blue, total: memberDetails.course_counts?.collectif_total ?? 0, avenir: memberDetails.course_counts?.collectif_avenir ?? 0 },
                    { key: 'theorique', label: 'Théoriques', icon: 'book', color: '#7c3aed', total: memberDetails.course_counts?.theorique_total ?? 0, avenir: memberDetails.course_counts?.theorique_avenir ?? 0 },
                    { key: 'prive', label: 'Privés payés', icon: 'star', color: '#f97316', total: memberDetails.course_counts?.prive_paye_total ?? 0, avenir: memberDetails.course_counts?.prive_avenir ?? 0 },
                    { key: 'autre', label: 'Autres', icon: 'paw', color: C.gray, total: memberDetails.course_counts?.autre_total ?? 0, avenir: memberDetails.course_counts?.autre_avenir ?? 0 },
                  ].map(({ key, label, icon, color, total, avenir }) => (
                    <div key={key} style={{ background: C.grayBg, borderRadius: 10, padding: '10px 12px' }}>
                      <div style={{ fontSize: 11, color: C.gray, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700 }}>
                        <Icon name={icon} size={11} color={color} /> {label}
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, marginTop: 2 }}>
                        {total}
                        {avenir > 0 && <span style={{ fontSize: 11, color: color, fontWeight: 700, marginLeft: 6 }}>+{avenir} à venir</span>}
                      </div>
                    </div>
                  ))}
                </div>

                {memberDetails.dogs && memberDetails.dogs.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                      {memberDetails.dogs.length} chien{memberDetails.dogs.length > 1 ? 's' : ''}
                    </div>
                    <div style={{ marginBottom: 18 }}>
                      {memberDetails.dogs.map(dog => {
                        const dogNotes = (memberDetails.dog_notes_by_dog && memberDetails.dog_notes_by_dog[dog.id]) || [];
                        return (
                        <div key={dog.id} style={{ background: '#fffbeb', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid #fef3c7' }}>
                          {/* Header chien : photo + nom + race + badge vaccin */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            {dog.photo_url ? (
                              <img src={dog.photo_url} alt={dog.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 48, height: 48, borderRadius: 10, background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Icon name="dog" size={24} color="#92400e" />
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 15, fontWeight: 800, color: C.dark }}>{dog.name}</div>
                              <div style={{ fontSize: 12, color: C.gray }}>
                                {dog.breed || 'Race non précisée'}
                                {dog.sex ? ` · ${dog.sex === 'M' ? '♂' : '♀'}` : ''}
                                {dog.birth_year ? ` · né${dog.sex === 'F' ? 'e' : ''} en ${dog.birth_year}` : ''}
                              </div>
                            </div>
                            <Badge color={dog.vaccinated ? C.green : C.orange} bg={dog.vaccinated ? C.greenBg : C.orangeBg}>
                              {dog.vaccinated ? 'Vacciné' : 'À vérifier'}
                            </Badge>
                          </div>

                          {/* Numéro de puce */}
                          {dog.chip_number && (
                            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Icon name="paw" size={11} color="#92400e" />
                              <span><strong style={{ color: '#92400e' }}>Puce :</strong> {dog.chip_number}</span>
                            </div>
                          )}

                          {/* Détail vaccins */}
                          {Array.isArray(dog.vaccines) && dog.vaccines.length > 0 && (
                            <div style={{ marginBottom: 8 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }}>Vaccins</div>
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                {dog.vaccines.filter(v => v.last_date || v.next_due_date).map(v => {
                                  const today = new Date().toISOString().slice(0, 10);
                                  const due = v.next_due_date;
                                  let urg = null;
                                  if (due) {
                                    const days = Math.round((new Date(due) - new Date(today)) / (1000 * 60 * 60 * 24));
                                    if (days < 0) urg = { color: '#dc2626', label: `en retard de ${-days}j` };
                                    else if (days < 30) urg = { color: '#d97706', label: `dans ${days}j` };
                                  }
                                  return (
                                    <div key={v.name} style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <strong style={{ color: '#1F1F20' }}>{v.name} :</strong>
                                      {v.last_date && <span>fait le {new Date(v.last_date).toLocaleDateString('fr-CH')}</span>}
                                      {due && <span>· rappel {new Date(due).toLocaleDateString('fr-CH')}{urg ? ` (${urg.label})` : ''}</span>}
                                      {urg && <span style={{ background: urg.color, color: '#fff', padding: '1px 6px', borderRadius: 6, fontSize: 9, fontWeight: 700 }}>!</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Remarques partagées */}
                          <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px dashed #fde68a' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 }}>
                              Remarques partagées avec {selectedMember.full_name || 'le membre'}
                            </div>
                            <DogNotesSection
                              dogId={dog.id}
                              dogName={dog.name}
                              notes={dogNotes}
                              mode="admin"
                              currentUserName="Tiffany"
                              adminPassword={pwd}
                              onChange={async () => {
                                const { data } = await callAdmin('get_member_details', pwd, { user_id: selectedMember.id });
                                if (data) setMemberDetails(data);
                              }}
                            />
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  </>
                )}

                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Notes admin <span style={{ fontWeight: 500, textTransform: 'none' }}>(privées, non visibles par le membre)</span>
                </div>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  rows={3}
                  placeholder="Santé, comportement, observations…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, color: C.dark, marginBottom: 6, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
                {(editingNotes !== (memberDetails.profile?.admin_notes ?? '')) ? (
                  <button onClick={saveAdminNotes} disabled={savingNotes} style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {savingNotes ? '…' : <><Icon name="check" size={13} /> Enregistrer les notes</>}
                  </button>
                ) : <div style={{ marginBottom: 18 }} />}

                {selectedMember.user_type !== 'external' && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Type de cours préféré</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
                      {[
                        { key: 'group', label: 'Collectifs', icon: 'users' },
                        { key: 'private', label: 'Privés', icon: 'clock' },
                        { key: 'both', label: 'Les deux', icon: 'paw' },
                      ].map(({ key, label, icon }) => {
                        const current = selectedMember.course_type ?? 'group';
                        const isActive = current === key;
                        const isLoading = actionLoading === selectedMember.id + '_coursetype';
                        return (
                          <button
                            key={key}
                            onClick={async () => { if (!isActive) { await handleSetCourseType(selectedMember, key); openMemberDetails({ ...selectedMember, course_type: key }); } }}
                            disabled={isLoading || isActive}
                            style={{
                              flex: 1, padding: '8px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: isActive ? 'default' : 'pointer',
                              background: isActive ? C.blue : C.grayBg, color: isActive ? '#fff' : C.gray,
                              opacity: isLoading ? 0.6 : 1,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}
                          >
                            <Icon name={icon} size={11} /> {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                {memberDetails.subscriptions && memberDetails.subscriptions.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Paiements</div>
                    <div style={{ marginBottom: 18 }}>
                      {memberDetails.subscriptions.slice(0, 8).map(sub => {
                        const typeLabel = { cotisation_annuelle: 'Cotisation', lecon_privee: 'Leçon privée', premium_mensuel: 'Premium', cours_theorique: 'Cours théorique' };
                        const amount = { cotisation_annuelle: '150 CHF', lecon_privee: '60 CHF', premium_mensuel: '10 CHF/mois', cours_theorique: '50 CHF' };
                        return (
                          <div key={sub.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fafafa', borderRadius: 8, marginBottom: 4 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                                {typeLabel[sub.type] ?? sub.type} {sub.year ? `· ${sub.year}` : ''}
                              </div>
                              <div style={{ fontSize: 11, color: C.gray, marginTop: 1 }}>
                                {sub.paid_at ? `Payé le ${new Date(sub.paid_at).toLocaleDateString('fr-CH')}` : 'En attente'}
                                {sub.type === 'lecon_privee' && sub.private_lessons_total ? ` · ${sub.private_lessons_used ?? 0}/${sub.private_lessons_total} utilisée(s)` : ''}
                              </div>
                            </div>
                            <Badge color={sub.status === 'paid' ? C.green : C.orange} bg={sub.status === 'paid' ? C.greenBg : C.orangeBg}>
                              {sub.status === 'paid' ? amount[sub.type] ?? 'Payé' : 'En attente'}
                            </Badge>
                          </div>
                        );
                      })}
                      {memberDetails.subscriptions.length > 8 && (
                        <div style={{ fontSize: 11, color: C.gray, textAlign: 'center', marginTop: 4 }}>
                          +{memberDetails.subscriptions.length - 8} paiement(s) plus ancien(s)
                        </div>
                      )}
                    </div>
                  </>
                )}

                {memberDetails.private_requests && memberDetails.private_requests.length > 0 && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Cours privés / coaching</div>
                    <div style={{ marginBottom: 18 }}>
                      {memberDetails.private_requests.slice(0, 5).map(pr => (
                        <div key={pr.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: '#fff7ed', borderRadius: 8, marginBottom: 4 }}>
                          <Icon name="star" size={14} color="#f97316" />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>
                              {pr.is_remote ? 'Visio' : 'Présentiel'} · {pr.price_chf || 60} CHF
                              {pr.chosen_slot?.date ? ` · ${pr.chosen_slot.date} ${pr.chosen_slot.start ?? ''}` : ''}
                            </div>
                            <div style={{ fontSize: 11, color: C.gray, marginTop: 1 }}>
                              {pr.status === 'confirmed' ? 'Confirmé' : pr.status === 'pending' ? 'En attente' : pr.status === 'cancelled' ? 'Annulé' : pr.status}
                              {' · '}
                              {pr.payment_status === 'paid' ? 'Payé' : pr.payment_status === 'refunded' ? 'Remboursé' : pr.payment_status === 'failed' ? 'Échec' : 'En attente paiement'}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
                  {selectedMember.user_type !== 'external' && (() => {
                    const coti = (memberDetails.subscriptions ?? []).find(s => s.type === 'cotisation_annuelle' && s.year === new Date().getFullYear());
                    const isPaid = coti?.status === 'paid';
                    return (
                      <button
                        onClick={async () => { await toggleCotisation(selectedMember); openMemberDetails(selectedMember); }}
                        disabled={!!actionLoading}
                        style={{ padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: isPaid ? C.redBg : C.greenBg, color: isPaid ? C.red : C.green, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Icon name={isPaid ? 'close' : 'check'} size={13} />
                        {isPaid ? 'Annuler la cotisation' : 'Valider la cotisation'}
                      </button>
                    );
                  })()}
                  {(() => {
                    const isPremiumActive = memberDetails.profile?.premium_until && new Date(memberDetails.profile.premium_until) > new Date();
                    return (
                      <button
                        onClick={async () => { await togglePremium(selectedMember); openMemberDetails(selectedMember); }}
                        disabled={!!actionLoading}
                        style={{ padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: isPremiumActive ? C.redBg : '#fef3c7', color: isPremiumActive ? C.red : '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                      >
                        <Icon name={isPremiumActive ? 'close' : 'sparkle'} size={13} />
                        {isPremiumActive ? 'Retirer le premium' : 'Activer le premium (1 an)'}
                      </button>
                    );
                  })()}
                  <button
                    onClick={() => { closeMemberDetails(); setConfirmDelete({ type: 'member', memberId: selectedMember.id, name: selectedMember.full_name }); }}
                    style={{ padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#fce4e4', color: '#b91c1c', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 }}
                  >
                    <Icon name="trash" size={13} /> Supprimer le compte
                  </button>
                </div>

                <div style={{ fontSize: 10, color: C.gray, textAlign: 'center', marginTop: 8 }}>
                  Compte créé le {memberDetails.profile?.created_at ? new Date(memberDetails.profile.created_at).toLocaleDateString('fr-CH') : '—'}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal cours privé */}
      {lessonTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={18} color={C.dark} /> Cours privé</div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>{lessonTarget.full_name}</div>
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Date</label>
            <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Heure</label>
            <input type="time" value={lessonTime} onChange={e => setLessonTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
            <input placeholder="Ex: terrain B, apporter la laisse…" value={lessonNotes} onChange={e => setLessonNotes(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setLessonTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSaveLesson} disabled={lessonSaving || !lessonDate || !lessonTime} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: lessonSaving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: lessonSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {lessonSaving ? 'Enregistrement…' : <><Icon name="check" size={14} /> Confirmer le cours</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={18} color={C.red} /> Confirmer la suppression</div>
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
          <div style={{ width: 36, height: 36, background: sub.status === 'paid' ? C.greenBg : C.orangeBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={sub.status === 'paid' ? 'checkCircle' : 'clock'} size={20} color={sub.status === 'paid' ? C.green : C.orange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{sub.user_name ?? sub.user_email ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{typeLabel[sub.type] ?? sub.type} · {fmtDate(sub.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sub.status === 'paid' ? C.green : C.orange }}>{fmtAmount[sub.type] ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.status === 'paid' ? 'Payé' : 'En attente'}</div>
            <button
              onClick={() => setConfirmDelete(sub)}
              disabled={!!actionLoading}
              style={{ background: C.redBg, color: C.red, border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === sub.id ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      ))}
      {subscriptions.length === 0 && <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucun paiement</div>}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={18} color={C.red} /> Supprimer ce paiement ?</div>
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
  // Modal de confirmation : { req, originalSlot, startTime, durationMin } ou null
  const [confirmingSlot, setConfirmingSlot] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_requests', pwd);
    const reqs = data?.requests ?? [];
    setRequests(reqs);
    onPendingCount?.(reqs.filter(r => r.status === 'pending').length);
    setLoading(false);
  }, [pwd, onPendingCount]);

  useEffect(() => { load(); }, [load]);

  // Ouvre la modal pour fixer heure exacte + durée dans la plage proposée par le client
  const confirm = (req, slot) => {
    setConfirmingSlot({
      req,
      originalSlot: slot,
      startTime: slot.start || '09:00',
      durationMin: 60,
    });
  };

  // Calcule l'heure de fin à partir de l'heure de début + durée en minutes
  const computeEndTime = (start, durationMin) => {
    const [h, m] = String(start).split(':').map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return start;
    const total = h * 60 + m + Number(durationMin || 0);
    const endH = Math.floor(total / 60) % 24;
    const endM = total % 60;
    return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  };

  // Vérifie si [startTime, startTime+duration] est dans [originalSlot.start, originalSlot.end]
  const isOutOfRange = (originalSlot, startTime, durationMin) => {
    if (!originalSlot?.start || !originalSlot?.end) return false;
    const toMin = (t) => {
      const [h, m] = String(t).split(':').map(Number);
      return h * 60 + (m || 0);
    };
    const oStart = toMin(originalSlot.start);
    const oEnd = toMin(originalSlot.end);
    const sStart = toMin(startTime);
    const sEnd = sStart + Number(durationMin || 0);
    return sStart < oStart || sEnd > oEnd;
  };

  const submitConfirm = async () => {
    if (!confirmingSlot) return;
    const { req, originalSlot, startTime, durationMin } = confirmingSlot;
    const dur = Number(durationMin);
    if (!startTime || !dur || dur <= 0) {
      window.alert('Merci de saisir une heure et une durée valides.');
      return;
    }
    const endTime = computeEndTime(startTime, dur);
    const finalSlot = {
      date: originalSlot.date,
      start: startTime,
      end: endTime,
    };

    const key = req.id + '_confirm';
    setActionLoading(key);
    setConfirmingSlot(null);
    await callAdmin('update_request', pwd, { request_id: req.id, status: 'confirmed', chosen_slot: finalSlot });
    const lessonDate = new Date(`${finalSlot.date}T${finalSlot.start}:00`).toISOString();
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
    const isPaid = req.payment_status === 'paid';
    const amount = Number(req.price_chf || 60);
    const memberName = req.profiles?.full_name ?? 'ce membre';
    const confirmMsg = isPaid
      ? `Annuler ce cours privé déjà payé par ${memberName} ?\n\nLe membre sera remboursé automatiquement de ${amount} CHF via Stripe (sous 5 à 10 jours selon sa banque).`
      : `Annuler le cours privé confirmé de ${memberName} ?`;
    if (!window.confirm(confirmMsg)) return;
    const key = req.id + '_cancel';
    setActionLoading(key);

    // Si le cours est payé, on rembourse AVANT de passer la demande en cancelled
    let refundResult = null;
    if (isPaid) {
      const { data: refundData, error: refundErr } = await supabase.functions.invoke('refund-coaching-request', {
        body: { request_id: req.id, admin_password: pwd },
      });
      if (refundErr || refundData?.error) {
        const msg = refundData?.error || refundErr?.message || 'Erreur inconnue';
        window.alert(`Le remboursement a échoué : ${msg}\n\nL'annulation a été stoppée. Vérifie dans Stripe et réessaie ou rembourse manuellement.`);
        setActionLoading(null);
        return;
      }
      refundResult = refundData;
    }

    await callAdmin('update_request', pwd, { request_id: req.id, status: 'cancelled' });
    await callAdmin('delete_lesson', pwd, { user_id: req.user_id });
    await load();
    setActionLoading(null);

    if (refundResult?.refunded) {
      window.alert(`Cours annulé · ${amount} CHF remboursés au membre via Stripe.`);
    }
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
          ['pending',   'En attente', 'clock', pendingCount],
          ['confirmed', 'Confirmées', 'checkCircle', 0],
          ['cancelled', 'Annulées', 'close', cancelledCount],
          ['rejected',  'Refusées', 'info', 0],
          ['all',       'Tout', 'file', 0],
        ].map(([val, label, icon, count]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: filter === val ? C.dark : C.grayBg, color: filter === val ? '#fff' : C.gray, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Icon name={icon} size={12} color={filter === val ? '#fff' : C.gray} /> {label}{count > 0 && val !== 'all' ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          {filter === 'pending' ? <>Aucune demande en attente <Icon name="star" size={20} color={C.gray} /></> : 'Aucune demande'}
        </div>
      )}

      {filtered.map(req => (
        <div key={req.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : req.status === 'cancelled' ? C.red : '#d1d5db'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, background: C.grayBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="user" size={20} color={C.gray} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{req.profiles?.full_name ?? '—'}</div>
              <div style={{ fontSize: 11, color: C.gray }}>{req.profiles?.email ?? ''} · {new Date(req.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            </div>
            <Badge
              color={req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : req.status === 'cancelled' ? C.red : C.gray}
              bg={req.status === 'pending' ? C.orangeBg : req.status === 'confirmed' ? C.greenBg : req.status === 'cancelled' ? C.redBg : C.grayBg}
            >
              {req.status === 'pending' ? 'En attente' : req.status === 'confirmed' ? 'Confirmé' : req.status === 'cancelled' ? <>Annulé par le membre</> : 'Refusé'}
            </Badge>
          </div>

          {req.admin_notes && (
            <div style={{ background: '#f0f9ff', borderRadius: 8, padding: '8px 10px', marginBottom: 10, fontSize: 13, color: '#0369a1', fontStyle: 'italic', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <Icon name="message" size={14} color="#0369a1" style={{ marginTop: 2, flexShrink: 0 }} /> "{req.admin_notes}"
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            {req.status === 'pending' ? 'Créneaux proposés — cliquez pour confirmer :' : req.status === 'confirmed' ? 'Créneau confirmé :' : 'Créneaux proposés :'}
          </div>

          {req.status === 'confirmed' && req.chosen_slot ? (
            <div>
              <div style={{ background: C.greenBg, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="calendar" size={14} color={C.green} /> {fmtSlot(req.chosen_slot)}
              </div>
              {/* Badge état du paiement */}
              <div style={{
                marginBottom: 8, padding: '8px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700,
                display: 'flex', alignItems: 'center', gap: 6,
                background: req.payment_status === 'paid' ? C.greenBg
                  : req.payment_status === 'refunded' ? C.grayBg
                  : C.orangeBg,
                color: req.payment_status === 'paid' ? C.green
                  : req.payment_status === 'refunded' ? C.gray
                  : C.orange,
              }}>
                <Icon
                  name={req.payment_status === 'paid' ? 'checkCircle' : req.payment_status === 'refunded' ? 'info' : 'clock'}
                  size={12}
                  color={req.payment_status === 'paid' ? C.green : req.payment_status === 'refunded' ? C.gray : C.orange}
                />
                {req.payment_status === 'paid'
                  ? `Payé · ${Number(req.price_chf || 60)} CHF`
                  : req.payment_status === 'refunded'
                  ? 'Remboursé'
                  : `En attente de paiement · ${Number(req.price_chf || 60)} CHF`}
              </div>
              <button onClick={() => cancel(req)} disabled={!!actionLoading} style={{ width: '100%', padding: '9px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_cancel' ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {actionLoading === req.id + '_cancel'
                  ? '…'
                  : req.payment_status === 'paid'
                  ? <><Icon name="close" size={12} /> Annuler &amp; rembourser</>
                  : <><Icon name="close" size={12} /> Annuler ce cours</>}
              </button>
            </div>
          ) : (
            (req.availability_slots ?? []).map((slot, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: C.grayBg, borderRadius: 9, padding: '9px 12px', marginBottom: 6, gap: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.dark, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="calendar" size={13} color={C.dark} /> {fmtSlot(slot)}</span>
                {req.status === 'pending' && (
                  <button onClick={() => confirm(req, slot)} disabled={!!actionLoading} style={{ padding: '6px 14px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_confirm' ? 0.6 : 1, flexShrink: 0, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>
                    {actionLoading === req.id + '_confirm' ? '…' : <><Icon name="check" size={12} /> Confirmer</>}
                  </button>
                )}
              </div>
            ))
          )}

          {req.status === 'pending' && (
            <button onClick={() => reject(req)} disabled={!!actionLoading} style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_reject' ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              {actionLoading === req.id + '_reject' ? '…' : <><Icon name="close" size={12} /> Refuser la demande</>}
            </button>
          )}
        </div>
      ))}

      {/* ─── Modal : fixer l'heure exacte du cours privé ─── */}
      {confirmingSlot && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setConfirmingSlot(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 380, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" size={18} color={C.blue} /> Fixer l'horaire du cours
            </div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 16 }}>
              Plage proposée par <strong>{confirmingSlot.req.profiles?.full_name ?? 'le membre'}</strong> : {fmtSlot(confirmingSlot.originalSlot)}
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Heure de début</label>
            <input
              type="time"
              value={confirmingSlot.startTime}
              onChange={(e) => setConfirmingSlot({ ...confirmingSlot, startTime: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 8, border: `1px solid ${C.grayBg}`, marginBottom: 14, boxSizing: 'border-box' }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Durée (minutes)</label>
            <input
              type="number"
              min="15"
              step="15"
              value={confirmingSlot.durationMin}
              onChange={(e) => setConfirmingSlot({ ...confirmingSlot, durationMin: e.target.value })}
              style={{ width: '100%', padding: '10px 12px', fontSize: 15, borderRadius: 8, border: `1px solid ${C.grayBg}`, marginBottom: 8, boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
              {[30, 45, 60, 90].map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfirmingSlot({ ...confirmingSlot, durationMin: d })}
                  style={{ padding: '5px 10px', fontSize: 12, fontWeight: 600, borderRadius: 6, border: 'none', background: Number(confirmingSlot.durationMin) === d ? C.blue : C.grayBg, color: Number(confirmingSlot.durationMin) === d ? '#fff' : C.gray, cursor: 'pointer' }}
                >
                  {d} min
                </button>
              ))}
            </div>

            <div style={{ background: C.grayBg, borderRadius: 8, padding: '10px 12px', marginBottom: 12, fontSize: 13, color: C.dark }}>
              <strong>Cours fixé :</strong> {confirmingSlot.startTime} → {computeEndTime(confirmingSlot.startTime, confirmingSlot.durationMin)}
            </div>

            {isOutOfRange(confirmingSlot.originalSlot, confirmingSlot.startTime, confirmingSlot.durationMin) && (
              <div style={{ background: C.orangeBg, borderRadius: 8, padding: '8px 12px', marginBottom: 12, fontSize: 12, color: C.orange, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <Icon name="info" size={14} color={C.orange} style={{ marginTop: 2, flexShrink: 0 }} />
                <span>Cette heure dépasse la plage de dispo du membre. Tu peux quand même confirmer mais préviens-le.</span>
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmingSlot(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={submitConfirm} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                <Icon name="check" size={14} /> Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
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
            <button onClick={() => openEdit(item)} style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: '#e0f4fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Icon name="edit" size={12} /> Modifier
            </button>
            <button
              onClick={() => callAdmin('update_news', pwd, { news_id: item.id, published: !item.published }).then(load)}
              style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: item.published ? C.orangeBg : C.greenBg, color: item.published ? C.orange : C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
            >
              <Icon name={item.published ? 'eye' : 'eye'} size={12} /> {item.published ? 'Masquer' : 'Publier'}
            </button>
            <button onClick={() => setConfirmDelete(item)} disabled={!!actionLoading} style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        </div>
      ))}

      {/* Modal éditeur */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24, maxHeight: '90dvh', overflowY: 'auto' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              {editing === 'new' ? <><Icon name="plus" size={18} /> Nouvelle actualité</> : <><Icon name="edit" size={18} /> Modifier</>}
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
                <Icon name="calendar" size={14} color="#0369a1" /> Ajouter un cours au planning des membres
              </label>
              {courseForm.addToPlan && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[{ v: 'collectif', l: 'Collectif', icon: 'users' }, { v: 'theorique', l: 'Théorique', icon: 'book' }].map(({ v, l, icon }) => (
                      <button key={v} type="button" onClick={() => setCourseForm(f => ({ ...f, course_type: v }))}
                        style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: courseForm.course_type === v ? C.blue : C.grayBg, color: courseForm.course_type === v ? '#fff' : C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Icon name={icon} size={12} /> {l}
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
              <button onClick={handleSave} disabled={saving || !form.title.trim()} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {saving ? 'Enregistrement…' : <><Icon name="check" size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmer suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={18} color={C.red} /> Supprimer cette actualité ?</div>
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
  const [form, setForm] = useState({ course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1', notify: false });
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmDeleteNotify, setConfirmDeleteNotify] = useState(false);
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
    if (error) { setLoadError(String(error?.message ?? error)); setLoading(false); return; }
    if (data?.courses) setCourses(data.courses);
    else setCourses([]);
    setLoading(false);
  }, [pwd, showPast]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    const today = new Date();
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    setForm({ course_type: 'collectif', course_date: fmt(today), start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1', notify: false });
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
      notify:      false,
    });
    setEditing(course);
  };

  const handleSave = async () => {
    if (!form.course_date) return;
    setSaving(true);
    const coursePayload = {
      course_type: form.course_type,
      course_date: form.course_date,
      start_time:  form.start_time,
      end_time:    form.end_time,
      notes:       form.notes,
      price:       form.price !== '' ? parseInt(form.price, 10) : 0,
      color:       form.color || TYPE_DEFAULT_COLOR[form.course_type] || '#2BABE1',
      notify:      !!form.notify,
    };
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
    await callAdmin('delete_course', pwd, { course_id: course.id, notify: !!confirmDeleteNotify });
    await load();
    setActionLoading(null);
    setConfirmDelete(null);
    setConfirmDeleteNotify(false);
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
    collectif: { label: 'Collectif', icon: 'users', bg: '#e0f4fd', color: '#2BABE1' },
    theorique: { label: 'Théorique', icon: 'book', bg: '#fef9c3', color: '#eab308' },
    prive:     { label: 'Privé', icon: 'clock', bg: '#fff7ed', color: '#f97316' },
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button onClick={openNew} style={{ flex: 1, background: C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Icon name="plus" size={16} /> Ajouter un cours
        </button>
        <button onClick={() => setShowPast(p => !p)} style={{ padding: '12px 14px', borderRadius: 12, border: 'none', background: showPast ? C.dark : C.grayBg, color: showPast ? '#fff' : C.gray, fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="clock" size={14} color={showPast ? '#fff' : C.gray} /> {showPast ? 'Masquer passés' : 'Voir passés'}
        </button>
      </div>

      {loadError && (
        <div style={{ background: C.redBg, color: C.red, borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <Icon name="warning" size={14} color={C.red} style={{ marginTop: 2, flexShrink: 0 }} /> Erreur : {loadError}
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
          <div style={{ fontSize: 11, fontWeight: 800, color: C.blue, textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px 6px', marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon name="calendar" size={12} color={C.blue} /> {weekLabel}
          </div>
          {weekCourses.map(course => {
            const tc = TYPE_CONFIG[course.course_type] ?? TYPE_CONFIG.collectif;
            const cardColor = course.color || tc.color;
            return (
              <div key={course.id} style={{ background: C.card, borderRadius: 14, padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${cardColor}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ background: cardColor + '22', color: cardColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Icon name={tc.icon} size={11} color={cardColor} /> {tc.label}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.dark }}>{fmtDay(course.course_date)}</span>
                      <span style={{ fontSize: 12, color: C.gray }}>{course.start_time ?? '?'} – {course.end_time ?? '?'}</span>
                    </div>
                    {(course.price > 0 || course.notes) && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4, alignItems: 'center' }}>
                        {course.price > 0 && (
                          <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>CHF {course.price}</span>
                        )}
                        {course.notes && (
                          <span style={{ fontSize: 12, color: '#374151', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="fileText" size={12} color="#374151" /> {course.notes}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button onClick={() => openEdit(course)} style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: '#e0f4fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Icon name="edit" size={12} />
                    </button>
                    <button
                      onClick={() => setConfirmDelete(course)}
                      disabled={!!actionLoading}
                      style={{ padding: '6px 10px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === course.id ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Icon name="trash" size={12} />
                    </button>
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
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              {editing === 'new' ? <><Icon name="plus" size={18} /> Nouveau cours</> : <><Icon name="edit" size={18} /> Modifier le cours</>}
            </div>

            {/* Type */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 6 }}>Type de cours</label>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[{ v: 'collectif', l: 'Collectif', icon: 'users' }, { v: 'theorique', l: 'Théorique', icon: 'book' }].map(({ v, l, icon }) => (
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, course_type: v, color: TYPE_DEFAULT_COLOR[v] ?? '#2BABE1' }))}
                  style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: form.course_type === v ? C.blue : C.grayBg, color: form.course_type === v ? '#fff' : C.gray, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Icon name={icon} size={12} color={form.course_type === v ? '#fff' : C.gray} /> {l}
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
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />

            {/* Notification aux membres */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.dark, cursor: 'pointer', marginBottom: 20, padding: '10px 12px', background: form.notify ? '#eff6ff' : C.grayBg, borderRadius: 10, border: form.notify ? '1.5px solid ' + C.blue : '1.5px solid transparent' }}>
              <input type="checkbox" checked={!!form.notify} onChange={e => setForm(f => ({ ...f, notify: e.target.checked }))} />
              Prévenir les membres avec une notification
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.course_date} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {saving ? 'Enregistrement…' : <><Icon name="check" size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation suppression */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={18} color={C.red} /> Supprimer ce cours ?</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              {TYPE_CONFIG[confirmDelete.course_type]?.label} · {fmtDay(confirmDelete.course_date)} · {confirmDelete.start_time}–{confirmDelete.end_time}
              <br /><span style={{ color: C.red, fontSize: 12 }}>Cette action est irréversible.</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600, color: C.dark, cursor: 'pointer', marginBottom: 16, padding: '8px 10px', background: confirmDeleteNotify ? '#eff6ff' : C.grayBg, borderRadius: 8 }}>
              <input type="checkbox" checked={!!confirmDeleteNotify} onChange={e => setConfirmDeleteNotify(e.target.checked)} />
              Prévenir les membres de l'annulation
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => { setConfirmDelete(null); setConfirmDeleteNotify(false); }} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Blog ─────────────────────────────────────────────────────────────
// Phase 2 : blog public éditable depuis l'admin, visible dans l'app + sur caniplus.ch (SEO)
function BlogTab({ pwd }) {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | { article }
  const [form, setForm] = useState(emptyArticleForm());
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  // Suivi du push GitHub par article : { [article_id]: 'pushing' | 'removing' }
  const [pushingId, setPushingId] = useState(null);

  function emptyArticleForm() {
    return {
      slug: '',
      title: '',
      excerpt: '',
      content: '',
      cover_image_url: '',
      cover_image_alt: '',
      meta_title: '',
      meta_description: '',
      meta_keywords: '',
      category: 'education',
      tags: '',
      read_time_min: 5,
      published: false,
    };
  }

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_articles', pwd);
    if (data?.articles) setArticles(data.articles);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  // Générer un slug à partir du titre
  const slugify = (s) => s
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

  const openNew = () => {
    setForm(emptyArticleForm());
    setEditing('new');
  };

  const openEdit = (article) => {
    setForm({
      slug: article.slug ?? '',
      title: article.title ?? '',
      excerpt: article.excerpt ?? '',
      content: article.content ?? '',
      cover_image_url: article.cover_image_url ?? '',
      cover_image_alt: article.cover_image_alt ?? '',
      meta_title: article.meta_title ?? '',
      meta_description: article.meta_description ?? '',
      meta_keywords: article.meta_keywords ?? '',
      category: article.category ?? 'education',
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      read_time_min: article.read_time_min ?? 5,
      published: !!article.published,
    });
    setEditing(article);
  };

  const handleTitleChange = (newTitle) => {
    setForm(f => {
      // Auto-générer le slug uniquement en création et si slug vide ou lié au précédent titre
      const shouldUpdateSlug = editing === 'new' && (!f.slug || f.slug === slugify(f.title));
      return {
        ...f,
        title: newTitle,
        slug: shouldUpdateSlug ? slugify(newTitle) : f.slug,
      };
    });
  };

  const uploadCover = async (file) => {
    if (!file) return;
    setUploadingCover(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = reader.result.split(',')[1];
      const { data, error } = await callAdmin('upload_article_cover', pwd, {
        base64,
        filename: file.name,
        content_type: file.type,
      });
      if (data?.url) {
        setForm(f => ({ ...f, cover_image_url: data.url }));
      } else {
        alert('Erreur upload image : ' + (data?.error ?? error?.message ?? 'inconnue'));
      }
      setUploadingCover(false);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.slug.trim() || !form.content.trim()) return;
    setSaving(true);
    const payload = {
      slug: form.slug.trim(),
      title: form.title.trim(),
      excerpt: form.excerpt.trim() || null,
      content: form.content,
      cover_image_url: form.cover_image_url.trim() || null,
      cover_image_alt: form.cover_image_alt.trim() || null,
      meta_title: form.meta_title.trim() || null,
      meta_description: form.meta_description.trim() || null,
      meta_keywords: form.meta_keywords.trim() || null,
      category: form.category,
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      read_time_min: parseInt(form.read_time_min, 10) || 5,
      published: form.published,
    };
    let result;
    if (editing === 'new') {
      result = await callAdmin('create_article', pwd, payload);
    } else {
      result = await callAdmin('update_article', pwd, { article_id: editing.id, ...payload });
    }
    if (result?.data?.error) {
      alert('Erreur : ' + result.data.error);
    } else {
      await load();
      setEditing(null);
    }
    setSaving(false);
  };

  const handleDelete = async (article) => {
    await callAdmin('delete_article', pwd, { article_id: article.id });
    await load();
    setConfirmDelete(null);
  };

  const togglePublish = async (article) => {
    await callAdmin('update_article', pwd, {
      article_id: article.id,
      published: !article.published,
    });
    await load();
  };

  const pushToSite = async (article) => {
    if (!article.published) {
      alert("Il faut d'abord publier l'article dans l'app (bouton Publier) avant de le pousser sur caniplus.ch.");
      return;
    }
    setPushingId(article.id);
    const { data, error } = await callPublish('publish', pwd, { article_id: article.id });
    setPushingId(null);
    if (error || data?.error) {
      alert('Erreur publication site : ' + (data?.error ?? error?.message ?? 'inconnue'));
      return;
    }
    await load();
    alert(`Article publié sur ${data?.url ?? 'caniplus.ch'}.\nVercel redéploie automatiquement dans 1-2 minutes.`);
  };

  const removeFromSite = async (article) => {
    if (!window.confirm(`Retirer "${article.title}" de caniplus.ch ?\n(L'article reste dans Supabase, il disparaît juste du site public.)`)) return;
    setPushingId(article.id);
    const { data, error } = await callPublish('unpublish', pwd, { article_id: article.id });
    setPushingId(null);
    if (error || data?.error) {
      alert('Erreur retrait site : ' + (data?.error ?? error?.message ?? 'inconnue'));
      return;
    }
    await load();
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <button
        onClick={openNew}
        style={{ width: '100%', background: C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
      >
        <Icon name="plus" size={14} /> Nouvel article de blog
      </button>

      {articles.length === 0 && (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>
          Aucun article pour l'instant.<br />
          <span style={{ fontSize: 12 }}>Créez votre premier article pour attirer de nouveaux visiteurs via Google.</span>
        </div>
      )}

      {articles.map(article => {
        const statusColor = article.published ? (article.pushed_to_site ? C.green : C.blue) : C.gray;
        const statusBg = article.published ? (article.pushed_to_site ? C.greenBg : '#e0f4fd') : C.grayBg;
        const statusLabel = article.published
          ? (article.pushed_to_site ? 'Publié sur caniplus.ch' : 'Publié dans l\'app')
          : 'Brouillon';
        return (
          <div key={article.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${statusColor}` }}>
            <div style={{ display: 'flex', gap: 12 }}>
              {article.cover_image_url && (
                <img
                  src={article.cover_image_url}
                  alt={article.cover_image_alt ?? ''}
                  style={{ width: 72, height: 72, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis' }}>{article.title}</div>
                    <div style={{ fontSize: 11, color: C.gray, marginTop: 2, fontFamily: 'monospace' }}>/{article.slug}</div>
                  </div>
                  <Badge color={statusColor} bg={statusBg}>{statusLabel}</Badge>
                </div>
                {article.excerpt && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6, marginBottom: 8, lineHeight: 1.4 }}>
                    {article.excerpt.length > 140 ? article.excerpt.slice(0, 140) + '…' : article.excerpt}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11, color: C.gray, marginBottom: 10 }}>
                  <span><Icon name="folder" size={10} /> {article.category}</span>
                  <span>·</span>
                  <span><Icon name="clock" size={10} /> {article.read_time_min} min</span>
                  <span>·</span>
                  <span>{fmtDate(article.published_at ?? article.created_at)}</span>
                  {article.views_count > 0 && <><span>·</span><span><Icon name="eye" size={10} /> {article.views_count} vues</span></>}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => openEdit(article)}
                    style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: '#e0f4fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Icon name="edit" size={12} /> Modifier
                  </button>
                  <button
                    onClick={() => togglePublish(article)}
                    style={{ flex: 1, padding: '7px', borderRadius: 8, border: 'none', background: article.published ? C.orangeBg : C.greenBg, color: article.published ? C.orange : C.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                  >
                    <Icon name="eye" size={12} /> {article.published ? 'Dépublier' : 'Publier'}
                  </button>
                  <button
                    onClick={() => setConfirmDelete(article)}
                    style={{ padding: '7px 10px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    <Icon name="trash" size={12} />
                  </button>
                </div>

                {/* Rangée caniplus.ch — visible uniquement si l'article est publié dans l'app */}
                {article.published && (
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button
                      onClick={() => pushToSite(article)}
                      disabled={pushingId === article.id}
                      style={{
                        flex: 1,
                        padding: '7px',
                        borderRadius: 8,
                        border: 'none',
                        background: article.pushed_to_site ? '#e0f4fd' : C.greenBg,
                        color: article.pushed_to_site ? C.blue : C.green,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: pushingId === article.id ? 'wait' : 'pointer',
                        opacity: pushingId === article.id ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      }}
                    >
                      <Icon name="globe" size={12} />
                      {pushingId === article.id
                        ? 'Publication…'
                        : article.pushed_to_site
                          ? 'Mettre à jour caniplus.ch'
                          : 'Publier sur caniplus.ch'}
                    </button>
                    {article.pushed_to_site && (
                      <button
                        onClick={() => removeFromSite(article)}
                        disabled={pushingId === article.id}
                        title="Retirer l'article de caniplus.ch (il reste en base dans l'app)"
                        style={{
                          padding: '7px 10px',
                          borderRadius: 8,
                          border: 'none',
                          background: C.orangeBg,
                          color: C.orange,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Icon name="close" size={12} />
                      </button>
                    )}
                  </div>
                )}

                {/* Infos de publication site */}
                {article.pushed_to_site && article.pushed_at && (
                  <div style={{ fontSize: 10, color: C.gray, marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="checkCircle" size={10} color={C.green} />
                    En ligne depuis le {fmtDate(article.pushed_at)} ·{' '}
                    <a
                      href={`https://caniplus.ch/blog/${article.slug}.html`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: C.blue, textDecoration: 'none' }}
                    >
                      Voir en ligne ↗
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* ─── Modal éditeur d'article ───────────────────────────────────── */}
      {editing !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ background: '#fff', borderRadius: 20, width: '100%', maxWidth: 720, maxHeight: '95dvh', overflowY: 'auto', padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: C.dark, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 8 }}>
              {editing === 'new'
                ? <><Icon name="plus" size={20} /> Nouvel article</>
                : <><Icon name="edit" size={20} /> Modifier l'article</>}
            </div>

            {/* ── Infos principales ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Titre * <span style={{ color: '#9ca3af', fontWeight: 400 }}>(H1 de l'article)</span></label>
              <input
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Ex : Les bases de la socialisation du chiot"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Slug (URL) *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 10, padding: '8px 12px', border: '1.5px solid #e5e7eb' }}>
                <span style={{ fontSize: 13, color: C.gray, fontFamily: 'monospace' }}>caniplus.ch/blog/</span>
                <input
                  value={form.slug}
                  onChange={e => setForm(f => ({ ...f, slug: slugify(e.target.value) }))}
                  placeholder="socialisation-chiot"
                  style={{ flex: 1, padding: '2px 0', border: 'none', background: 'transparent', fontSize: 13, fontFamily: 'monospace', outline: 'none' }}
                />
                <span style={{ fontSize: 13, color: C.gray, fontFamily: 'monospace' }}>.html</span>
              </div>
              <div style={{ fontSize: 11, color: C.gray, marginTop: 4 }}>Généré automatiquement depuis le titre. Modifiez si besoin.</div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Extrait <span style={{ color: '#9ca3af', fontWeight: 400 }}>(résumé affiché en liste, 150-200 caractères idéal)</span></label>
              <textarea
                value={form.excerpt}
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                placeholder="Un résumé court et accrocheur de l'article…"
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
              />
            </div>

            {/* ── Image de couverture ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Image de couverture</label>
              {form.cover_image_url ? (
                <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
                  <img src={form.cover_image_url} alt={form.cover_image_alt} style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, cover_image_url: '', cover_image_alt: '' }))}
                    style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: 11, cursor: 'pointer' }}
                  >
                    Retirer
                  </button>
                </div>
              ) : (
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24, borderRadius: 10, border: '2px dashed #d1d5db', cursor: uploadingCover ? 'wait' : 'pointer', background: '#f9fafb', color: C.gray, fontSize: 13 }}>
                  {uploadingCover
                    ? <>Upload en cours…</>
                    : <><Icon name="upload" size={14} /> Choisir une image</>}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => uploadCover(e.target.files?.[0])}
                    style={{ display: 'none' }}
                    disabled={uploadingCover}
                  />
                </label>
              )}
              <input
                value={form.cover_image_alt}
                onChange={e => setForm(f => ({ ...f, cover_image_alt: e.target.value }))}
                placeholder="Texte alternatif (SEO + accessibilité)"
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginTop: 8 }}
              />
            </div>

            {/* ── Contenu HTML ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Contenu * <span style={{ color: '#9ca3af', fontWeight: 400 }}>(HTML — balises {'<p>, <h2>, <h3>, <ul>, <strong>, <a>'} autorisées)</span>
              </label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="<p>Premier paragraphe…</p>&#10;<h2>Sous-titre</h2>&#10;<p>Autre paragraphe…</p>"
                rows={14}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'Menlo, Monaco, monospace', lineHeight: 1.5 }}
              />
            </div>

            {/* ── Organisation ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Catégorie</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff' }}
                >
                  <option value="education">Éducation</option>
                  <option value="comportement">Comportement</option>
                  <option value="sante">Santé</option>
                  <option value="conseils">Conseils pratiques</option>
                  <option value="actualites">Actualités</option>
                </select>
              </div>
              <div style={{ width: 130 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Lecture (min)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={form.read_time_min}
                  onChange={e => setForm(f => ({ ...f, read_time_min: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tags <span style={{ color: '#9ca3af', fontWeight: 400 }}>(séparés par des virgules)</span></label>
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="chiot, socialisation, éducation positive"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {/* ── SEO ── */}
            <details style={{ marginBottom: 16, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: C.dark, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="search" size={14} /> SEO (optionnel)
              </summary>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta title <span style={{ color: '#9ca3af' }}>(sinon = titre de l'article, max 60 car.)</span></label>
                <input
                  value={form.meta_title}
                  onChange={e => setForm(f => ({ ...f, meta_title: e.target.value }))}
                  placeholder="Titre dans Google (optionnel)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 10 }}
                />
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta description <span style={{ color: '#9ca3af' }}>(max 155 car.)</span></label>
                <textarea
                  value={form.meta_description}
                  onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))}
                  placeholder="Description affichée dans les résultats Google"
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
                />
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta keywords</label>
                <input
                  value={form.meta_keywords}
                  onChange={e => setForm(f => ({ ...f, meta_keywords: e.target.value }))}
                  placeholder="chiot, socialisation, jura"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </details>

            {/* ── Publication ── */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: C.dark, marginBottom: 20, cursor: 'pointer', padding: 12, background: form.published ? C.greenBg : '#f9fafb', borderRadius: 10 }}>
              <input type="checkbox" checked={form.published} onChange={e => setForm(f => ({ ...f, published: e.target.checked }))} />
              <span style={{ fontWeight: 700 }}>
                {form.published ? 'Publié' : 'Brouillon'}
              </span>
              <span style={{ fontSize: 12, color: C.gray, marginLeft: 'auto' }}>
                {form.published ? 'Visible dans l\'app pour tous' : 'Uniquement visible par vous'}
              </span>
            </label>

            {/* ── Boutons ── */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim() || !form.slug.trim() || !form.content.trim()}
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving || !form.title.trim() || !form.slug.trim() || !form.content.trim() ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
              >
                {saving ? 'Enregistrement…' : <><Icon name="check" size={14} /> Enregistrer</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Confirmer suppression ───────────────────────────────────────── */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Icon name="warning" size={18} color={C.red} /> Supprimer cet article ?
            </div>
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


// ─── Onglet Éditorial (Phase 1 — agent éditorial) ───────────────────────────
function EditorialTab({ pwd }) {
  const [proposals, setProposals] = useState([]);
  const [batchId, setBatchId] = useState(null);
  const [bundles, setBundles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [editingBundleId, setEditingBundleId] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [{ data: pData, error: pErr }, { data: bData, error: bErr }, statsResp] = await Promise.all([
      callAdmin('list_editorial_proposals', pwd),
      callAdmin('list_editorial_bundles', pwd),
      fetch('https://oncbeqnznrqummxmqxbx.supabase.co/functions/v1/editorial-stats', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: pwd }),
      }).then(r => r.json()).catch(() => null),
    ]);
    if (pErr || pData?.error) setError(pData?.error ?? pErr?.message ?? 'Erreur chargement propositions');
    if (bErr || bData?.error) setError(bData?.error ?? bErr?.message ?? 'Erreur chargement bundles');
    setProposals(pData?.proposals ?? []);
    setBatchId(pData?.batch_id ?? null);
    setBundles(bData?.bundles ?? []);
    setStats(statsResp && !statsResp.error ? statsResp : null);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const handleTrigger = async () => {
    if (!confirm('Générer 3 nouvelles propositions de thèmes maintenant ? Cela appelle l\'API Claude (coût ~0.10 CHF).')) return;
    setTriggering(true);
    setError(null);
    const { data, error: fnErr } = await callAdmin('trigger_propose_themes', pwd);
    setTriggering(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de génération');
      return;
    }
    if (data?.skipped) {
      setError(`Déjà ${data.recent_count} propositions cette semaine — choisis-en une ou archive-les avant d'en générer d'autres.`);
    }
    await load();
  };

  const handleChoose = async (bundle_id, theme) => {
    if (!confirm(`Choisir "${theme}" comme thème de la semaine ? Les 2 autres propositions seront archivées.`)) return;
    setChoosing(bundle_id);
    const { data, error: fnErr } = await callAdmin('choose_editorial_theme', pwd, { bundle_id });
    setChoosing(null);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur lors du choix');
      return;
    }
    await load();
  };

  const handleGenerate = async (bundle_id, theme) => {
    if (!confirm(`Générer le bundle complet pour "${theme}" ?\n\nL'agent va produire 5 supports (article blog + ressource premium + carrousel Instagram + post Google Business + notification). Coût ~0.10 CHF, ~30 secondes.`)) return;
    setGenerating(bundle_id);
    setError(null);
    const { data, error: fnErr } = await callEditorial('trigger_generate_bundle', pwd, { bundle_id });
    setGenerating(null);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de génération');
      return;
    }
    await load();
  };

  const statusBadge = (status) => {
    const map = {
      chosen:    { c: C.orange, b: C.orangeBg, label: 'Choisi' },
      drafted:   { c: C.blue,   b: '#dbeafe',  label: 'Brouillon' },
      validated: { c: C.green,  b: C.greenBg,  label: 'Validé' },
      published: { c: '#7c3aed',b: '#ede9fe',  label: 'Publié' },
    };
    const s = map[status] ?? { c: C.gray, b: C.grayBg, label: status };
    return <Badge color={s.c} bg={s.b}>{s.label}</Badge>;
  };

  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' }) : '—';

  // Vue éditeur : si un bundle est sélectionné on affiche l'éditeur en plein écran
  if (editingBundleId) {
    return (
      <BundleEditor
        pwd={pwd}
        bundleId={editingBundleId}
        onClose={() => setEditingBundleId(null)}
        onSaved={async () => { await load(); }}
      />
    );
  }

  return (
    <div>
      {/* Bandeau d'info + bouton de déclenchement manuel */}
      <div style={{ background: '#fff', padding: 18, borderRadius: 12, marginBottom: 20, border: `1px solid #e5e7eb` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="sparkle" size={18} color={C.blue} />
              Agent éditorial CaniPlus
            </div>
            <div style={{ fontSize: 13, color: C.gray, lineHeight: 1.5 }}>
              Chaque lundi à 6h, l'agent te propose 3 thèmes. Choisis-en un et le bundle complet (article blog + ressource premium + carrousel Insta + post Google Business + notification) sera généré automatiquement.
            </div>
          </div>
          <button
            onClick={handleTrigger}
            disabled={triggering}
            style={{ background: triggering ? '#9ca3af' : C.blue, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: triggering ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
          >
            {triggering ? 'Génération…' : 'Générer maintenant'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: 12, borderRadius: 10, marginBottom: 16, fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" size={14} color={C.red} />
          {error}
        </div>
      )}

      {/* Section : propositions en attente de choix */}
      <div style={{ marginBottom: 28 }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Propositions de la semaine
        </h3>
        {loading ? (
          <div style={{ color: C.gray, fontSize: 13 }}>Chargement…</div>
        ) : proposals.length === 0 ? (
          <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px dashed #d1d5db', textAlign: 'center', color: C.gray, fontSize: 13 }}>
            Aucune proposition en attente. Clique sur « Générer maintenant » pour en créer 3.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {proposals.map((p, i) => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid #e5e7eb`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 8, letterSpacing: 0.5 }}>
                  PROPOSITION {i + 1}
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 8, lineHeight: 1.3 }}>
                  {p.theme}
                </div>
                <div style={{ fontSize: 13, color: C.dark, marginBottom: 10, lineHeight: 1.5 }}>
                  {p.theme_description}
                </div>
                <div style={{ fontSize: 12, color: C.gray, marginBottom: 14, fontStyle: 'italic', lineHeight: 1.4 }}>
                  Pourquoi : {p.theme_rationale}
                </div>
                <button
                  onClick={() => handleChoose(p.id, p.theme)}
                  disabled={choosing === p.id || !!choosing}
                  style={{ marginTop: 'auto', background: choosing === p.id ? '#9ca3af' : C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: choosing ? 'not-allowed' : 'pointer' }}
                >
                  {choosing === p.id ? 'Choix en cours…' : 'Choisir ce thème'}
                </button>
              </div>
            ))}
          </div>
        )}
        {batchId && (
          <div style={{ fontSize: 11, color: C.gray, marginTop: 8 }}>
            Lot : {batchId.slice(0, 8)}…
          </div>
        )}
      </div>

      {/* Section : bundles en cours */}
      <div>
        <h3 style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Bundles en cours
        </h3>
        {bundles.length === 0 ? (
          <div style={{ background: '#fff', padding: 16, borderRadius: 12, border: '1px dashed #d1d5db', textAlign: 'center', color: C.gray, fontSize: 13 }}>
            Aucun bundle en cours. Choisis un thème ci-dessus pour démarrer.
          </div>
        ) : (
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid #e5e7eb`, overflow: 'hidden' }}>
            {bundles.map((b, idx) => (
              <div
                key={b.id}
                style={{
                  padding: '14px 16px',
                  borderBottom: idx < bundles.length - 1 ? '1px solid #f3f4f6' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{b.theme}</div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                    Choisi le {fmtDate(b.chosen_at)}
                    {b.drafted_at && ` · Brouillon ${fmtDate(b.drafted_at)}`}
                    {b.validated_at && ` · Validé ${fmtDate(b.validated_at)}`}
                    {b.published_at && ` · Publié ${fmtDate(b.published_at)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusBadge(b.status)}
                  {b.status === 'chosen' && (
                    <button
                      onClick={() => handleGenerate(b.id, b.theme)}
                      disabled={generating === b.id || !!generating}
                      style={{
                        background: generating === b.id ? '#9ca3af' : C.blue,
                        color: '#fff',
                        border: 'none',
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: generating ? 'not-allowed' : 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {generating === b.id ? 'Génération…' : 'Générer le contenu'}
                    </button>
                  )}
                  {(b.status === 'drafted' || b.status === 'validated' || b.status === 'published') && (
                    <button
                      onClick={() => setEditingBundleId(b.id)}
                      style={{
                        background: b.status === 'drafted' ? C.blue : '#fff',
                        color: b.status === 'drafted' ? '#fff' : C.blue,
                        border: b.status === 'drafted' ? 'none' : `1.5px solid ${C.blue}`,
                        borderRadius: 8,
                        padding: '8px 14px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {b.status === 'drafted' ? 'Éditer' : 'Voir'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Performance des bundles publiés (Phase 3) ─────────────────────── */}
      {stats && stats.stats && stats.stats.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Performance des bundles publiés
          </div>

          {/* Totaux */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bundles publiés</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginTop: 4 }}>{stats.totals.total_bundles}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vues articles</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, marginTop: 4 }}>{stats.totals.total_article_views}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vues premium</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{stats.totals.total_resource_views}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid #e5e7eb' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clics push</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.green, marginTop: 4 }}>{stats.totals.total_push_clicks}</div>
            </div>
          </div>

          {/* Tableau par bundle */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) 90px 90px 90px 100px', gap: 8, padding: '10px 14px', fontSize: 11, color: C.gray, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              <div>Bundle</div>
              <div style={{ textAlign: 'right' }}>Vues blog</div>
              <div style={{ textAlign: 'right' }}>Vues prem.</div>
              <div style={{ textAlign: 'right' }}>Clics push</div>
              <div style={{ textAlign: 'right' }}>Publié</div>
            </div>
            {stats.stats.map((s, idx) => (
              <div key={s.bundle_id} style={{
                display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) 90px 90px 90px 100px', gap: 8,
                padding: '12px 14px', fontSize: 13,
                borderBottom: idx < stats.stats.length - 1 ? '1px solid #f3f4f6' : 'none',
                alignItems: 'center',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, color: C.dark, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.theme}</div>
                  {s.article_slug && (
                    <a href={`https://caniplus.ch/blog/${s.article_slug}`} target="_blank" rel="noopener" style={{ fontSize: 11, color: C.blue, textDecoration: 'none' }}>
                      caniplus.ch/blog/{s.article_slug}
                    </a>
                  )}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.blue }}>{s.article_views}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: '#7c3aed' }}>{s.resource_views}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: C.green }}>{s.push_clicks}</div>
                <div style={{ textAlign: 'right', fontSize: 11, color: C.gray }}>{fmtDate(s.published_at)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


// ─── Éditeur de bundle (Phase 2b) ───────────────────────────────────────────
function BundleEditor({ pwd, bundleId, onClose, onSaved }) {
  const [bundle, setBundle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [validating, setValidating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState(null);
  const [activeTab, setActiveTab] = useState('blog');
  const [error, setError] = useState(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error: fnErr } = await callEditorial('get_editorial_bundle', pwd, { bundle_id: bundleId });
      if (!alive) return;
      if (fnErr || data?.error) {
        setError(data?.error ?? fnErr?.message ?? 'Erreur de chargement');
      } else {
        setBundle(data.bundle);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [pwd, bundleId]);

  const readOnly = bundle?.status === 'published';

  const updateField = (section, field, value) => {
    setBundle(b => ({ ...b, [`content_${section}`]: { ...(b[`content_${section}`] ?? {}), [field]: value } }));
    setDirty(true);
  };

  const updateSlide = (idx, field, value) => {
    setBundle(b => {
      const slides = [...((b.content_instagram?.slides) ?? [])];
      slides[idx] = { ...slides[idx], [field]: value };
      return { ...b, content_instagram: { ...(b.content_instagram ?? {}), slides } };
    });
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const payload = {
      bundle_id: bundleId,
      content_blog: bundle.content_blog,
      content_premium: bundle.content_premium,
      content_instagram: bundle.content_instagram,
      content_google_business: bundle.content_google_business,
      content_notification: bundle.content_notification,
    };
    const { data, error: fnErr } = await callEditorial('update_editorial_bundle_content', pwd, payload);
    setSaving(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de sauvegarde');
      return;
    }
    setBundle(data.bundle);
    setDirty(false);
  };

  const handleValidate = async () => {
    if (dirty) {
      if (!confirm('Tu as des modifications non sauvegardées. Sauvegarder avant de valider ?')) return;
      await handleSave();
    }
    if (!confirm('Valider ce bundle ? Il sera prêt à être publié.')) return;
    setValidating(true);
    setError(null);
    const { data, error: fnErr } = await callEditorial('validate_editorial_bundle', pwd, { bundle_id: bundleId });
    setValidating(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de validation');
      return;
    }
    setBundle(data.bundle);
    onSaved && (await onSaved());
  };

  const handlePublish = async () => {
    if (dirty) {
      if (!confirm('Tu as des modifications non sauvegardées. Sauvegarder avant de publier ?')) return;
      await handleSave();
    }
    if (!confirm("Publier ce bundle MAINTENANT ? Cela va :\n- créer l'article sur le site (visible publiquement)\n- créer la ressource premium dans l'app\n- envoyer une notification push aux abonnés")) return;
    setPublishing(true);
    setError(null);
    setPublishResult(null);
    const { data, error: fnErr } = await callEditorial('publish_editorial_bundle', pwd, { bundle_id: bundleId });
    setPublishing(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de publication');
      return;
    }
    setPublishResult(data);
    // Recharge le bundle pour avoir le nouveau statut
    const reload = await callEditorial('get_editorial_bundle', pwd, { bundle_id: bundleId });
    if (reload.data?.bundle) setBundle(reload.data.bundle);
    onSaved && (await onSaved());
  };

  if (loading) return <div style={{ padding: 24, color: C.gray }}>Chargement…</div>;
  if (!bundle) return <div style={{ padding: 24, color: C.red }}>{error ?? 'Bundle introuvable'}</div>;

  const tabs = [
    { id: 'blog',            label: 'Blog' },
    { id: 'premium',         label: 'Premium' },
    { id: 'instagram',       label: 'Instagram' },
    { id: 'google_business', label: 'Google Business' },
    { id: 'notification',    label: 'Notification' },
  ];

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none', resize: 'vertical' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 };
  const fieldWrapStyle = { marginBottom: 14 };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: C.gray, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 6 }}
          >
            ← Retour à la liste
          </button>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.dark, lineHeight: 1.2 }}>{bundle.theme}</div>
          <div style={{ fontSize: 12, color: C.gray, marginTop: 4 }}>
            Statut : {bundle.status} {dirty && <span style={{ color: C.orange, fontWeight: 700 }}>· modifié non sauvegardé</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !dirty}
              style={{ background: dirty && !saving ? C.blue : '#9ca3af', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: (dirty && !saving) ? 'pointer' : 'not-allowed' }}
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          )}
          {bundle.status === 'drafted' && (
            <button
              onClick={handleValidate}
              disabled={validating}
              style={{ background: validating ? '#9ca3af' : C.green, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: validating ? 'not-allowed' : 'pointer' }}
            >
              {validating ? 'Validation…' : 'Valider'}
            </button>
          )}
          {(bundle.status === 'drafted' || bundle.status === 'validated') && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{ background: publishing ? '#9ca3af' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: publishing ? 'not-allowed' : 'pointer' }}
            >
              {publishing ? 'Publication…' : 'Publier maintenant'}
            </button>
          )}
        </div>
      </div>

      {publishResult && publishResult.success && (
        <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: 14, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Publication réussie</div>
          <div style={{ display: 'grid', gap: 4, fontSize: 12 }}>
            {publishResult.log?.article?.slug && (
              <div>
                Article : <a href={`https://caniplus.ch/blog/${publishResult.log.article.slug}`} target="_blank" rel="noopener" style={{ color: '#065f46', textDecoration: 'underline' }}>caniplus.ch/blog/{publishResult.log.article.slug}</a>
              </div>
            )}
            {publishResult.log?.resource?.id && (
              <div>Ressource premium : <span style={{ fontFamily: 'monospace' }}>{publishResult.log.resource.id}</span></div>
            )}
            {publishResult.log?.push && (
              <div>
                Push notifications : {publishResult.log.push.sent} envoyées sur {publishResult.log.push.total_subs} abonnés
                {publishResult.log.push.failed > 0 && ` (${publishResult.log.push.failed} échecs)`}
              </div>
            )}
          </div>
        </div>
      )}

      {bundle.status === 'published' && !publishResult && (
        <div style={{ background: '#eff6ff', color: '#1e40af', border: '1px solid #93c5fd', padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <strong>Bundle publié</strong>
          {bundle.published_at && <span style={{ color: '#6b7280' }}> · {new Date(bundle.published_at).toLocaleString('fr-CH')}</span>}
          {bundle.content_blog?.slug && (
            <span> · <a href={`https://caniplus.ch/blog/${bundle.content_blog.slug}`} target="_blank" rel="noopener" style={{ color: '#1e40af' }}>voir l'article</a></span>
          )}
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <Icon name="warning" size={14} color={C.red} /> {error}
        </div>
      )}

      <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb', marginBottom: 16, overflowX: 'auto' }}>
        {tabs.map(t => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              style={{ flex: '0 0 auto', padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: isActive ? 800 : 500, color: isActive ? C.blue : C.gray, borderBottom: `3px solid ${isActive ? C.blue : 'transparent'}`, whiteSpace: 'nowrap' }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e5e7eb' }}>
        {activeTab === 'blog' && (() => {
          const b = bundle.content_blog ?? {};
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Titre</label>
                <input type="text" value={b.title ?? ''} onChange={e => updateField('blog', 'title', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Slug (URL)</label>
                <input type="text" value={b.slug ?? ''} onChange={e => updateField('blog', 'slug', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Excerpt</label>
                <textarea value={b.excerpt ?? ''} onChange={e => updateField('blog', 'excerpt', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Contenu HTML</label>
                <textarea value={b.content_html ?? ''} onChange={e => updateField('blog', 'content_html', e.target.value)} style={{ ...inputStyle, minHeight: 400, fontFamily: 'monospace', fontSize: 12 }} disabled={readOnly} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div style={fieldWrapStyle}>
                  <label style={labelStyle}>Catégorie</label>
                  <input type="text" value={b.category ?? ''} onChange={e => updateField('blog', 'category', e.target.value)} style={inputStyle} disabled={readOnly} />
                </div>
                <div style={fieldWrapStyle}>
                  <label style={labelStyle}>Temps lecture (min)</label>
                  <input type="number" value={b.read_time_min ?? 5} onChange={e => updateField('blog', 'read_time_min', parseInt(e.target.value, 10) || 5)} style={inputStyle} disabled={readOnly} />
                </div>
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Tags (séparés par virgule)</label>
                <input type="text" value={Array.isArray(b.tags) ? b.tags.join(', ') : ''} onChange={e => updateField('blog', 'tags', e.target.value.split(',').map(t => t.trim()).filter(Boolean))} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Meta title (SEO)</label>
                <input type="text" value={b.meta_title ?? ''} onChange={e => updateField('blog', 'meta_title', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Meta description (SEO)</label>
                <textarea value={b.meta_description ?? ''} onChange={e => updateField('blog', 'meta_description', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Cover image alt</label>
                <input type="text" value={b.cover_image_alt ?? ''} onChange={e => updateField('blog', 'cover_image_alt', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
            </>
          );
        })()}

        {activeTab === 'premium' && (() => {
          const p = bundle.content_premium ?? {};
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Titre</label>
                <input type="text" value={p.title ?? ''} onChange={e => updateField('premium', 'title', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Contenu (markdown)</label>
                <textarea value={p.body_markdown ?? ''} onChange={e => updateField('premium', 'body_markdown', e.target.value)} style={{ ...inputStyle, minHeight: 600, fontFamily: 'monospace', fontSize: 12 }} disabled={readOnly} />
              </div>
            </>
          );
        })()}

        {activeTab === 'instagram' && (() => {
          const ig = bundle.content_instagram ?? {};
          const slides = Array.isArray(ig.slides) ? ig.slides : [];
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Caption</label>
                <textarea value={ig.caption ?? ''} onChange={e => updateField('instagram', 'caption', e.target.value)} style={{ ...inputStyle, minHeight: 140 }} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Hashtags (séparés par espace)</label>
                <input type="text" value={Array.isArray(ig.hashtags) ? ig.hashtags.join(' ') : ''} onChange={e => updateField('instagram', 'hashtags', e.target.value.split(/\s+/).map(t => t.trim()).filter(Boolean))} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={{ ...fieldWrapStyle, marginTop: 20 }}>
                <label style={labelStyle}>Slides ({slides.length})</label>
                {slides.map((s, idx) => (
                  <div key={idx} style={{ background: '#f9fafb', padding: 12, borderRadius: 10, marginBottom: 10, border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, marginBottom: 6 }}>SLIDE {idx + 1}</div>
                    <input type="text" placeholder="Titre" value={s.title ?? ''} onChange={e => updateSlide(idx, 'title', e.target.value)} style={{ ...inputStyle, marginBottom: 6 }} disabled={readOnly} />
                    <textarea placeholder="Body" value={s.body ?? ''} onChange={e => updateSlide(idx, 'body', e.target.value)} style={{ ...inputStyle, minHeight: 60 }} disabled={readOnly} />
                  </div>
                ))}
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(`${ig.caption ?? ''}\n\n${(ig.hashtags ?? []).join(' ')}`)}
                style={{ background: C.dark, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Copier caption + hashtags
              </button>
            </>
          );
        })()}

        {activeTab === 'google_business' && (() => {
          const g = bundle.content_google_business ?? {};
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Titre (max 50 caractères)</label>
                <input type="text" value={g.title ?? ''} onChange={e => updateField('google_business', 'title', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Body (150-200 mots)</label>
                <textarea value={g.body ?? ''} onChange={e => updateField('google_business', 'body', e.target.value)} style={{ ...inputStyle, minHeight: 200 }} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>CTA</label>
                <input type="text" value={g.cta ?? ''} onChange={e => updateField('google_business', 'cta', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(`${g.title ?? ''}\n\n${g.body ?? ''}\n\n${g.cta ?? ''}`)}
                style={{ background: C.dark, color: '#fff', border: 'none', borderRadius: 8, padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Copier le post complet
              </button>
            </>
          );
        })()}

        {activeTab === 'notification' && (() => {
          const n = bundle.content_notification ?? {};
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Titre push</label>
                <input type="text" value={n.title ?? ''} onChange={e => updateField('notification', 'title', e.target.value)} style={inputStyle} disabled={readOnly} />
              </div>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Body push</label>
                <textarea value={n.body ?? ''} onChange={e => updateField('notification', 'body', e.target.value)} style={{ ...inputStyle, minHeight: 100 }} disabled={readOnly} />
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Onglet Notifs ────────────────────────────────────────────────────────────
function NotificationsTab({ pwd }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState('all_members');
  const [userId, setUserId] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [link, setLink] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdmin('list_members', pwd);
    if (data?.members) {
      // Notifs admin : on inclut TOUS les comptes (members + externes)
      // Tiffany veut pouvoir notifier n'importe qui, qu'il soit eleve du club
      // ou simple abonne externe (info generale, message personnel, etc.)
      setMembers(data.members);
    }
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const handleSend = async () => {
    setError(null);
    setResult(null);
    if (!title.trim()) {
      setError('Le titre est obligatoire.');
      return;
    }
    if (target === 'one_user' && !userId) {
      setError('Selectionne un membre destinataire.');
      return;
    }
    setSending(true);
    const payload = {
      target,
      title: title.trim(),
      body: body.trim() || null,
      link: link.trim() || null,
    };
    if (target === 'one_user') payload.user_id = userId;
    const { data, error: fnErr } = await callAdmin('send_manual_notification', pwd, payload);
    setSending(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? "Erreur lors de l'envoi");
      return;
    }
    setResult(data);
    setTitle('');
    setBody('');
    setLink('');
    setUserId('');
    setTarget('all_members');
  };

  const inputStyle = { width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' };
  const labelStyle = { display: 'block', fontSize: 11, fontWeight: 700, color: C.dark, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };

  return (
    <div style={{ maxWidth: 640 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: C.dark, margin: '0 0 6px 0' }}>Notifications</h2>
      <p style={{ fontSize: 13, color: C.gray, margin: '0 0 20px 0' }}>
        Envoie une notification in-app a un membre ou a tous les membres. Apparait dans leur cloche.
      </p>

      {result && (
        <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: 14, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          <strong>Notification envoyee.</strong> {result.inserted} destinataire{result.inserted > 1 ? 's' : ''}.
        </div>
      )}

      {error && (
        <div style={{ background: C.redBg, color: C.red, padding: 12, borderRadius: 10, marginBottom: 14, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Destinataire</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => setTarget('all_members')}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: target === 'all_members' ? C.blue : C.grayBg, color: target === 'all_members' ? '#fff' : C.gray }}
            >
              Tous les membres
            </button>
            <button
              type="button"
              onClick={() => setTarget('one_user')}
              style={{ flex: 1, padding: 10, borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700, background: target === 'one_user' ? C.blue : C.grayBg, color: target === 'one_user' ? '#fff' : C.gray }}
            >
              Un membre
            </button>
          </div>
        </div>

        {target === 'one_user' && (
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Membre</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} style={inputStyle} disabled={loading}>
              <option value="">— Selectionne un membre —</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.full_name ?? m.email ?? m.id}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Titre <span style={{ color: C.red }}>*</span></label>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} maxLength={80} placeholder="Ex: Cours deplace exceptionnellement" />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Message</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, minHeight: 90, resize: 'vertical' }} maxLength={400} placeholder="Details de la notification (optionnel)" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={labelStyle}>Lien (optionnel)</label>
          <input type="text" value={link} onChange={e => setLink(e.target.value)} style={inputStyle} placeholder="Ex: /planning ou https://caniplus.ch/blog/..." />
        </div>

        <button
          onClick={handleSend}
          disabled={sending || !title.trim() || (target === 'one_user' && !userId)}
          style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', background: sending || !title.trim() || (target === 'one_user' && !userId) ? '#9ca3af' : C.blue, color: '#fff' }}
        >
          {sending ? 'Envoi…' : 'Envoyer la notification'}
        </button>
      </div>
    </div>
  );
}

// ─── Banner "Activer les notifications push" ─────────────────────────────────
function AdminPushBanner() {
  const { supported, permission, subscribed, loading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState(null);

  if (permission === 'denied') {
    return (
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', margin: '12px 24px 0', maxWidth: 960, fontSize: 12, color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Icon name="warning" size={14} color="#b91c1c" />
        Les notifications sont bloquées par ton navigateur. Pour les recevoir : autorise CaniPlus dans les paramètres de ton navigateur (icône cadenas dans la barre d'adresse).
      </div>
    );
  }

  if (!supported || subscribed || dismissed) return null;

  const onActivate = async () => {
    setError(null);
    const result = await subscribe();
    if (!result?.ok) {
      setError(result?.error || "Echec inconnu. Ouvre la console (F12) pour voir le détail.");
    }
  };

  return (
    <div style={{
      background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
      color: '#fff', borderRadius: 12, padding: '14px 18px',
      margin: '12px 24px 0', maxWidth: 960,
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      boxShadow: '0 2px 12px rgba(43,171,225,0.25)',
    }}>
      <Icon name="bell" size={22} color="#fff" />
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ fontSize: 14, fontWeight: 800 }}>Active les notifications push</div>
        <div style={{ fontSize: 12, opacity: 0.9, marginTop: 2 }}>
          Recois une alerte sur cet appareil des qu'un membre fait une demande, paye ou annule, meme quand l'app est fermee.
        </div>
        {error && <div style={{ fontSize: 11, marginTop: 4, color: '#fecaca' }}>{error}</div>}
      </div>
      <button
        onClick={onActivate}
        disabled={loading}
        style={{
          padding: '10px 16px', background: '#fff', color: '#1a8bbf',
          border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 800, cursor: 'pointer',
          opacity: loading ? 0.6 : 1, display: 'flex', alignItems: 'center', gap: 6,
        }}
      >
        {loading ? '…' : <><Icon name="check" size={13} color="#1a8bbf" /> Activer</>}
      </button>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Fermer"
        style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, width: 30, height: 30, color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
      >
        <Icon name="close" size={14} color="#fff" />
      </button>
    </div>
  );
}

// ─── Onglet Cours de la semaine ──────────────────────────────────────────────
function CoursSemaineTab({ pwd }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState({ courses: [], attendances: [], dogs: [] });
  const [loading, setLoading] = useState(true);

  const getMonday = (offset = 0) => {
    const today = new Date();
    const day = today.getDay();
    const diffToMonday = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diffToMonday + offset * 7);
    monday.setHours(0, 0, 0, 0);
    return monday;
  };
  // Format date locale (YYYY-MM-DD) — toISOString() convertit en UTC et
  // décale d'un jour si on est en CEST/CET, ce qui faisait sortir un cours
  // du dimanche dans la "semaine du lundi suivant".
  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const monday = getMonday(weekOffset);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: resp } = await callAdmin('list_week_courses', pwd, { week_start: fmtDate(monday) });
    if (resp) setData(resp);
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pwd, weekOffset]);

  useEffect(() => { load(); }, [load]);

  const fmtDay = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    const days = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const months = ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
  };

  const dogsByOwner = {};
  (data.dogs ?? []).forEach(d => {
    if (!dogsByOwner[d.owner_id]) dogsByOwner[d.owner_id] = {};
    dogsByOwner[d.owner_id][d.id] = d.name;
  });

  const attendancesByCourse = {};
  (data.attendances ?? []).forEach(a => {
    if (!attendancesByCourse[a.course_id]) attendancesByCourse[a.course_id] = [];
    attendancesByCourse[a.course_id].push(a);
  });

  const courses = [...(data.courses ?? [])].sort((a, b) => {
    if (a.course_date !== b.course_date) return a.course_date < b.course_date ? -1 : 1;
    return (a.start_time ?? '') < (b.start_time ?? '') ? -1 : 1;
  });

  const coursesByDate = {};
  for (const c of courses) {
    if (!coursesByDate[c.course_date]) coursesByDate[c.course_date] = [];
    coursesByDate[c.course_date].push(c);
  }
  const dates = Object.keys(coursesByDate).sort();

  const monthsShort = ['jan', 'fev', 'mar', 'avr', 'mai', 'juin', 'juil', 'aou', 'sep', 'oct', 'nov', 'dec'];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 10 }}>
        <button onClick={() => setWeekOffset(o => o - 1)} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.dark, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Icon name="arrowLeft" size={14} /> Precedente
        </button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: C.gray, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {weekOffset === 0 ? 'Cette semaine' : weekOffset === 1 ? 'Semaine prochaine' : weekOffset === -1 ? 'Semaine derniere' : `${weekOffset > 0 ? '+' : ''}${weekOffset} semaines`}
          </div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, marginTop: 2 }}>
            {monday.getDate()} {monthsShort[monday.getMonth()]} – {sunday.getDate()} {monthsShort[sunday.getMonth()]}
          </div>
        </div>
        <button onClick={() => setWeekOffset(o => o + 1)} style={{ padding: '8px 12px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.dark, fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
          Suivante <Icon name="arrowRight" size={14} />
        </button>
      </div>

      {weekOffset !== 0 && (
        <button onClick={() => setWeekOffset(0)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: '#e8f7fd', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
          Revenir a cette semaine
        </button>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>
      ) : courses.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 32, textAlign: 'center', color: C.gray, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <Icon name="calendar" size={32} color={C.gray} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>Aucun cours cette semaine</div>
        </div>
      ) : dates.map(date => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>
            {fmtDay(date)}
          </div>
          {coursesByDate[date].map(course => {
            const att = attendancesByCourse[course.id] ?? [];
            const isTheorique = course.course_type === 'theorique';
            // Couleur custom du cours (cours spéciaux/payants) prend le pas
            // sur la couleur par défaut du type de cours.
            const customColor = course.color && course.color.trim() ? course.color.trim() : null;
            const accent = customColor || (isTheorique ? '#7c3aed' : C.blue);
            const accentBg = customColor
              ? customColor + '22'   // 13% opacity (suffix hex alpha)
              : (isTheorique ? '#f3e8ff' : '#e8f7fd');
            const courseTitle = course.is_supplement
              ? (course.supplement_name || 'Cours spécial')
              : (course.title || (isTheorique ? 'Cours théorique' : 'Cours collectif'));
            const isPaid = Number(course.price) > 0;
            return (
              <div
                key={course.id}
                style={{
                  background: C.card, borderRadius: 12, marginBottom: 10,
                  boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden',
                  borderLeft: customColor ? `4px solid ${customColor}` : 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: (att.length > 0 || course.notes) ? '1px solid #f3f4f6' : 'none' }}>
                  <div style={{ width: 44, height: 44, background: accentBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={isTheorique ? 'book' : 'users'} size={22} color={accent} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{courseTitle}</span>
                      {isPaid && (
                        <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
                          {course.price} CHF
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                      {course.start_time ?? '—'}{course.end_time ? ` – ${course.end_time}` : ''}
                      {course.location ? ` · ${course.location}` : ''}
                    </div>
                  </div>
                  <div style={{ background: accentBg, color: accent, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
                    {att.length} {att.length > 1 ? 'inscrits' : 'inscrit'}
                  </div>
                </div>

                {/* Commentaire / notes du cours (cours spéciaux, infos terrain…) */}
                {course.notes && (
                  <div style={{ padding: '8px 14px', borderBottom: att.length > 0 ? '1px solid #f3f4f6' : 'none', background: customColor ? customColor + '0d' : '#fafafa', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Icon name="message" size={14} color={accent} style={{ marginTop: 1, flexShrink: 0 }} />
                    <div style={{ fontSize: 12, color: C.dark, fontStyle: 'italic', lineHeight: 1.4 }}>
                      {course.notes}
                    </div>
                  </div>
                )}

                {att.length > 0 && (
                  <div style={{ padding: '8px 14px 12px' }}>
                    {att.map((a, idx) => {
                      const ownerDogs = dogsByOwner[a.user_id] ?? {};
                      const ownerDogList = Object.entries(ownerDogs); // [[id, name], ...]
                      const dogIds = Array.isArray(a.dog_ids) ? a.dog_ids : [];
                      let dogNames = dogIds.map(id => ownerDogs[id]).filter(Boolean);
                      // Fallback : inscriptions historiques (avant dog_ids) → afficher
                      // le seul chien si le membre n'en a qu'un, sinon "non précisé"
                      let fallback = false;
                      if (dogNames.length === 0 && ownerDogList.length === 1) {
                        dogNames = [ownerDogList[0][1]];
                        fallback = true;
                      }
                      return (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: idx < att.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                          <div style={{ width: 6, height: 6, borderRadius: 99, background: accent, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0, fontSize: 13, color: C.dark, fontWeight: 600 }}>
                            {a.profiles?.full_name || a.profiles?.email || '—'}
                          </div>
                          <div style={{ fontSize: 12, color: C.gray, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="dog" size={12} color={C.gray} />
                            {dogNames.length > 0
                              ? <span>{dogNames.join(', ')}{fallback && <span style={{ fontStyle: 'italic', opacity: 0.7 }}> (auto)</span>}</span>
                              : <span style={{ fontStyle: 'italic' }}>non précisé</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ─── App principale ──────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [pwd, setPwd] = useState(() => sessionStorage.getItem('admin_pwd') ?? null);
  const [tab, setTab] = useState('membres');
  const [demandesBadge, setDemandesBadge] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifs, setNotifs] = useState([]);
  const [notifsUnread, setNotifsUnread] = useState(0);
  const [notifsOpen, setNotifsOpen] = useState(false);

  // Charge les notifs admin (toutes les 60s)
  useEffect(() => {
    if (!pwd) return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await callAdmin('list_admin_notifications', pwd, { limit: 30 });
        if (cancelled) return;
        const data = r?.data ?? r;
        if (data?.notifications) setNotifs(data.notifications);
        if (typeof data?.unread_count === 'number') setNotifsUnread(data.unread_count);
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [pwd]);

  const markNotifRead = async (id) => {
    setNotifs((arr) => arr.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setNotifsUnread((c) => Math.max(0, c - 1));
    try { await callAdmin('mark_admin_notification_read', pwd, { notification_id: id }); } catch (_) {}
  };
  const markAllRead = async () => {
    setNotifs((arr) => arr.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    setNotifsUnread(0);
    try { await callAdmin('mark_admin_notification_read', pwd, { mark_all: true }); } catch (_) {}
  };

  // Passe en mode pleine largeur (désactive max-width 430px du #root)
  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

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
    { id: 'membres',    label: 'Membres', icon: 'users' },
    { id: 'cours',      label: 'Cours semaine', icon: 'calendar' },
    { id: 'paiements',  label: 'Paiements', icon: 'creditCard' },
    { id: 'demandes',   label: `Demandes${demandesBadge > 0 ? ` (${demandesBadge})` : ''}`, icon: 'file' },
    { id: 'planning',   label: 'Planning', icon: 'calendar' },
    { id: 'news',       label: 'News', icon: 'message' },
    { id: 'blog',       label: 'Blog', icon: 'book' },
    { id: 'editorial',  label: 'Éditorial', icon: 'sparkle' },
    { id: 'notifs',     label: 'Notifs', icon: 'bell' },
  ];

  const activeTab = tabs.find(t => t.id === tab) ?? tabs[0];

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      {/* Header avec burger */}
      <div style={{ background: C.dark, padding: '14px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 960, margin: '0 auto', width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
            {/* Bouton burger */}
            <button
              onClick={() => setMenuOpen(true)}
              aria-label="Ouvrir le menu"
              style={{
                background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10,
                width: 40, height: 40, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 4, cursor: 'pointer',
                flexShrink: 0,
              }}
            >
              <span style={{ width: 18, height: 2, background: '#fff', borderRadius: 1 }} />
              <span style={{ width: 18, height: 2, background: '#fff', borderRadius: 1 }} />
              <span style={{ width: 18, height: 2, background: '#fff', borderRadius: 1 }} />
            </button>
            {/* Titre + onglet actif */}
            <div style={{ minWidth: 0, overflow: 'hidden' }}>
              <span style={{ fontFamily: 'Great Vibes, cursive', fontSize: 26, color: '#fff', lineHeight: 1, display: 'block' }}>CaniPlus</span>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'nowrap', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span>Administration</span>
                <span style={{ opacity: 0.5 }}>·</span>
                <span style={{ color: 'rgba(255,255,255,0.85)', fontWeight: 700 }}>{activeTab.label}</span>
              </div>
            </div>
          </div>
          {/* Cloche notifs admin */}
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setNotifsOpen(!notifsOpen)}
              aria-label="Notifications"
              style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 10, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', position: 'relative' }}
            >
              <Icon name="bell" size={18} color="#fff" />
              {notifsUnread > 0 && (
                <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, borderRadius: 9, background: C.orange ?? '#f97316', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px', border: '2px solid ' + C.dark }}>{notifsUnread > 99 ? '99+' : notifsUnread}</span>
              )}
            </button>
            {notifsOpen && (
              <>
                <div onClick={() => setNotifsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 50 }} />
                <div style={{ position: 'fixed', top: 64, right: 8, left: 8, width: 'auto', maxWidth: 380, marginLeft: 'auto', maxHeight: '75dvh', overflow: 'hidden', background: '#fff', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.18)', zIndex: 51, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <strong style={{ fontSize: 14, color: C.dark }}>Notifications</strong>
                    {notifsUnread > 0 && (
                      <button onClick={markAllRead} style={{ background: 'transparent', border: 0, color: C.blue, fontSize: 12, cursor: 'pointer', fontWeight: 600 }}>Tout marquer lu</button>
                    )}
                  </div>
                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {notifs.length === 0 ? (
                      <div style={{ padding: '32px 18px', textAlign: 'center', color: C.gray, fontSize: 13 }}>Aucune notification pour l'instant.</div>
                    ) : notifs.map(n => {
                      const unread = !n.read_at;
                      const colorMap = { payment_received: '#10b981', private_request: '#2BABE1', new_member: '#8b5cf6', premium_canceled: '#ef4444', course_canceled: '#f97316', publish_reminder: '#f59e0b', newsletter_signup: '#0ea5e9' };
                      const dotColor = colorMap[n.kind] || C.blue;
                      return (
                        <div
                          key={n.id}
                          onClick={() => unread && markNotifRead(n.id)}
                          style={{ padding: '12px 16px', borderBottom: '1px solid #f4f6f8', cursor: unread ? 'pointer' : 'default', background: unread ? '#f0f9ff' : '#fff', display: 'flex', gap: 10 }}
                        >
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: dotColor, marginTop: 6, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500, color: C.dark, marginBottom: 2 }}>{n.title}</div>
                            {n.body && <div style={{ fontSize: 12, color: C.gray, lineHeight: 1.4, marginBottom: 4 }}>{n.body}</div>}
                            <div style={{ fontSize: 11, color: '#9ca3af' }}>{new Date(n.created_at).toLocaleString('fr-CH', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleLogout}
            style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, color: 'rgba(255,255,255,0.7)', cursor: 'pointer', flexShrink: 0 }}
          >
            Déconnexion
          </button>
        </div>
      </div>

      {/* Drawer lateral (menu burger) */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setMenuOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, animation: 'fadeIn 0.2s ease' }}
          />
          {/* Panel */}
          <nav
            style={{
              position: 'fixed', top: 0, left: 0, bottom: 0, width: 280, maxWidth: '85vw',
              background: '#fff', zIndex: 101, boxShadow: '4px 0 24px rgba(0,0,0,0.15)',
              display: 'flex', flexDirection: 'column',
              animation: 'slideInLeft 0.25s cubic-bezier(0.32,0.72,0,1)',
            }}
          >
            <div style={{ padding: '22px 22px 18px', borderBottom: '1px solid #e5e7eb', background: C.dark, color: '#fff' }}>
              <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 32, lineHeight: 1 }}>CaniPlus</div>
              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4, letterSpacing: 1 }}>ADMINISTRATION</div>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 0' }}>
              {tabs.map(t => {
                const isActive = tab === t.id;
                const isBadged = t.id === 'demandes' && demandesBadge > 0;
                const activeColor = isBadged ? C.orange : C.blue;
                return (
                  <button
                    key={t.id}
                    onClick={() => { setTab(t.id); setMenuOpen(false); }}
                    style={{
                      width: '100%', padding: '13px 22px',
                      background: isActive ? '#f0f9ff' : 'transparent',
                      border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 14,
                      fontSize: 14, fontWeight: isActive ? 700 : 500,
                      color: isActive ? activeColor : C.dark,
                      borderLeft: `3px solid ${isActive ? activeColor : 'transparent'}`,
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                  >
                    <Icon name={t.icon} size={18} color={isActive ? activeColor : C.gray} />
                    <span style={{ flex: 1 }}>{t.label}</span>
                  </button>
                );
              })}
            </div>
            <div style={{ padding: '14px 22px', borderTop: '1px solid #e5e7eb', fontSize: 11, color: C.gray }}>
              CaniPlus · v1.0
            </div>
          </nav>
          <style>{`@keyframes slideInLeft { from { transform: translateX(-100%) } to { transform: translateX(0) } } @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }`}</style>
        </>
      )}

      {/* Banner activation push */}
      <AdminPushBanner />

      {/* Content */}
      <div style={{ padding: '16px 24px', maxWidth: 960, margin: '0 auto' }}>
        {tab === 'membres'    && <MembresTab pwd={pwd} />}
        {tab === 'cours'      && <CoursSemaineTab pwd={pwd} />}
        {tab === 'paiements'  && <PaiementsTab pwd={pwd} />}
        {tab === 'demandes'   && <DemandesTab pwd={pwd} onPendingCount={setDemandesBadge} />}
        {tab === 'planning'   && <PlanningTab pwd={pwd} />}
        {tab === 'news'       && <NewsTab pwd={pwd} />}
        {tab === 'blog'       && <BlogTab pwd={pwd} />}
        {tab === 'editorial'  && <EditorialTab pwd={pwd} />}
        {tab === 'notifs'     && <NotificationsTab pwd={pwd} />}
      </div>
    </div>
  );
}
