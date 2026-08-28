// src/screens/AdminScreen.jsx
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { cotisationPrix } from '../lib/tarifs';
import Icon from '../components/Icons';
import CashPaymentsList from '../components/CashPaymentsList';
import PaymentOptionsEditor from '../components/PaymentOptionsEditor';
import MessagerieTab from '../components/MessagerieTab';
import AdhesionsTab from '../components/AdhesionsTab';
import SoireesAdminTab from '../components/SoireesAdminTab';
import DefisAdminTab from '../components/DefisAdminTab';
import { CLUB_ENABLED, DEFIS_ENABLED } from '../lib/features';
import { downloadClubList } from '../lib/exportClubList';
import { usePushNotifications } from '../hooks/usePushNotifications';
import DogNotesSection from '../components/DogNotesSection';
import {
  BlogPreview, PremiumPreview, InstagramPreview,
  GoogleBusinessPreview, FacebookPreview, NotificationPreview, ImagesBar,
} from '../components/BundlePreview';

const ADMIN_FN = 'admin-query';
const PUBLISH_FN = 'publish-article-to-github';
const EDITORIAL_FN = 'editorial-bundle-actions';

function callAdmin(action, _pwd, payload = null) {
  return supabase.functions.invoke('admin-auth-proxy', {
    body: { target: 'admin-query', action, payload },
  });
}

function callPublish(action, _pwd, payload = null) {
  return supabase.functions.invoke('admin-auth-proxy', {
    body: { target: 'publish-article-to-github', action, payload },
  });
}

function callEditorial(action, _pwd, payload = null) {
  return supabase.functions.invoke('admin-auth-proxy', {
    body: { target: 'editorial-bundle-actions', action, payload },
  });
}

// Fonctions images du pipeline éditorial (format plat côté edge function) :
// generate-editorial-cover et render-instagram-slides.
function callImageFn(target, payload) {
  return supabase.functions.invoke('admin-auth-proxy', {
    body: { target, payload },
  });
}

// Un bundle est « complet en images » s'il a sa couverture ET ses slides.
// Sert aux avertissements non bloquants avant programmation ou publication.
// Accepte les deux formes de bundle manipulées ici : l'objet complet de
// l'éditeur (content_*) et la ligne allégée de la liste (horodatages seuls).
function missingImagesLabel(bundle) {
  if (!bundle) return null;
  const slides = bundle.content_instagram?.image_urls;
  const hasCover = !!bundle.content_blog?.cover_image_url || !!bundle.image_generated_at;
  const hasSlides = (Array.isArray(slides) && slides.length > 0) || !!bundle.slides_rendered_at;
  if (hasCover && hasSlides) return null;
  if (!hasCover && !hasSlides) return 'ni couverture ni slides Instagram';
  return hasCover ? 'pas de slides Instagram' : 'pas d’image de couverture';
}

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
function MembresTab({ pwd }) {
  const [members, setMembers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  const [memberCat, setMemberCat] = useState('tous');
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
  const [lastSeenById, setLastSeenById] = useState({}); // user_id → last_seen_at
  const [exportInfo, setExportInfo] = useState(null);   // retour du dernier export
  const [renewalSaving, setRenewalSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, s, d, seen] = await Promise.all([
      callAdmin('list_members', pwd),
      callAdmin('list_subscriptions', pwd),
      callAdmin('list_dogs', pwd),
      // Dernière ouverture de l'app (profiles.last_seen_at, mis à jour par
      // l'app à chaque ouverture) — lu en direct sous la policy admin.
      supabase.from('profiles').select('id, last_seen_at'),
    ]);
    if (m.data?.members) setMembers(m.data.members);
    if (s.data?.subscriptions) setSubscriptions(s.data.subscriptions);
    if (d.data?.dogs) setDogs(d.data.dogs);
    if (seen.data) setLastSeenById(Object.fromEntries(seen.data.map(p => [p.id, p.last_seen_at])));
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

  // « Présent l'année prochaine » : passe par la fonction SQL dédiée, les
  // policies de profiles n'autorisant l'UPDATE que sur sa propre ligne.
  const saveRenewal = async (value) => {
    if (!selectedMember) return;
    setRenewalSaving(true);
    const { error } = await supabase.rpc('set_renewal_next_year', {
      target_user_id: selectedMember.id,
      value,
    });
    if (!error) {
      const { data } = await callAdmin('get_member_details', pwd, { user_id: selectedMember.id });
      if (data) setMemberDetails(data);
      // Garde la liste (et donc l'export) en phase sans tout recharger.
      setMembers(ms => ms.map(m => m.id === selectedMember.id ? { ...m, renewal_next_year: value } : m));
    }
    setRenewalSaving(false);
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

  // ── Présence : dernière ouverture de l'app ──
  const ONLINE_WINDOW_MIN = 5;
  const isOnline = (userId) => {
    const iso = lastSeenById[userId];
    return !!iso && (Date.now() - new Date(iso).getTime()) < ONLINE_WINDOW_MIN * 60000;
  };
  const fmtLastSeen = (userId) => {
    const iso = lastSeenById[userId];
    if (!iso) return 'Jamais vu·e';
    const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
    if (mins < ONLINE_WINDOW_MIN) return 'En ligne';
    if (mins < 60) return `Vu·e il y a ${mins} min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `Vu·e il y a ${h} h`;
    const d = Math.floor(h / 24);
    if (d === 1) return 'Vu·e hier';
    if (d < 7) return `Vu·e il y a ${d} jours`;
    return `Vu·e le ${new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  };
  const onlineCount = members.filter(m => isOnline(m.id)).length;

  // ── Onglets de classement ──
  const isExt = (m) => m.user_type === 'external';
  const cotiPending = (m) => !isExt(m) && getCotisation(m.id)?.status !== 'paid';
  const counts = {
    tous: members.length,
    club: members.filter(m => !isExt(m)).length,
    externes: members.filter(isExt).length,
    cotisation: members.filter(cotiPending).length,
  };
  const matchesCat = (m) =>
    memberCat === 'club' ? !isExt(m)
    : memberCat === 'externes' ? isExt(m)
    : memberCat === 'cotisation' ? cotiPending(m)
    : true;

  const filtered = members.filter(m =>
    matchesCat(m) && (
      m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      m.email?.toLowerCase().includes(search.toLowerCase())
    )
  );

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {[
          ['tous', 'Tous'],
          ['club', 'Club'],
          ['externes', 'Externes'],
          // Cotisation : notion club — masquée depuis le passage grand public
          ...(CLUB_ENABLED ? [['cotisation', 'Cotisation en attente']] : []),
        ].map(([id, label]) => (
          <button key={id} onClick={() => setMemberCat(id)} style={{
            border: 'none', borderRadius: 999, padding: '7px 14px', cursor: 'pointer',
            fontWeight: 700, fontSize: 12.5,
            background: memberCat === id ? C.dark : C.card,
            color: memberCat === id
              ? '#fff'
              : (id === 'cotisation' && counts.cotisation > 0 ? C.orange : C.gray),
            boxShadow: memberCat === id ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            {label} ({counts[id]})
          </button>
        ))}
      </div>
      <div style={{ position: 'relative', marginBottom: 16 }}>
        <Icon name="search" size={16} color={C.gray} style={{ position: 'absolute', left: 10, top: 12, pointerEvents: 'none' }} />
        <input
          placeholder="Rechercher un membre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
        />
      </div>
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
        <span>{filtered.length} membre{filtered.length > 1 ? 's' : ''}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: onlineCount > 0 ? C.green : C.gray, fontWeight: 700 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: onlineCount > 0 ? C.green : '#d1d5db', display: 'inline-block' }} />
          {onlineCount} en ligne
        </span>
      </div>

      {/* Export de la liste clients du club — mêmes colonnes que le fichier
          Excel tenu à la main, plus assurance RC et état des vaccins. */}
      {CLUB_ENABLED && (
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => {
              const n = downloadClubList(members, dogs, subscriptions);
              setExportInfo(n > 0
                ? `${n} ligne${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''}.`
                : 'Aucun inscrit au club à exporter.');
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: C.dark, color: '#fff', border: 'none', borderRadius: 12,
              padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
            }}
          >
            <Icon name="download" size={15} color="#fff" /> Exporter la liste clients
          </button>
          <div style={{ fontSize: 11, color: C.gray, marginTop: 6, lineHeight: 1.5 }}>
            {exportInfo
              ? exportInfo
              : 'Fichier .csv, une ligne par chien, à ouvrir directement dans Excel.'}
          </div>
        </div>
      )}

      {filtered.map(member => {
        const coti = getCotisation(member.id);
        const premium = isPremium(member);
        const memberDogs = getMemberDogs(member.id);
        const dogNames = memberDogs.map(d => d.name).filter(Boolean).join(', ');
        const isExternal = member.user_type === 'external';
        const hasAlert = CLUB_ENABLED && coti?.status !== 'paid' && !isExternal;
        const online = isOnline(member.id);
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
            <div style={{ width: 36, height: 36, background: isExternal ? C.grayBg : 'var(--cyan-light)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
              <div style={{ fontSize: 11, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5, color: online ? C.green : 'var(--gray-mid)', fontWeight: online ? 700 : 500 }}>
                <span style={{ width: 6, height: 6, borderRadius: 99, background: online ? C.green : '#d1d5db', display: 'inline-block', flexShrink: 0 }} />
                {fmtLastSeen(member.id)}
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
            <div style={{ position: 'sticky', top: 0, background: '#fff', padding: '18px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, zIndex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                <div style={{ width: 44, height: 44, background: selectedMember.user_type === 'external' ? C.grayBg : 'var(--cyan-light)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                  {CLUB_ENABLED && (() => {
                    const coti = (memberDetails.subscriptions ?? []).find(s => s.type === 'cotisation_annuelle' && s.year === new Date().getFullYear());
                    return (
                      <Badge color={coti?.status === 'paid' ? C.green : C.orange} bg={coti?.status === 'paid' ? C.greenBg : C.orangeBg}>
                        {coti?.status === 'paid' ? 'Cotisation payée' : 'Cotisation en attente'}
                      </Badge>
                    );
                  })()}
                  <Badge color={isOnline(selectedMember.id) ? C.green : C.gray} bg={isOnline(selectedMember.id) ? C.greenBg : C.grayBg}>
                    {fmtLastSeen(selectedMember.id)}
                  </Badge>
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
                        <div key={dog.id} style={{ background: '#fffbeb', borderRadius: 12, padding: '12px 14px', marginBottom: 10, border: '1px solid var(--orange-light)' }}>
                          {/* Header chien : photo + nom + race + badge vaccin */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                            {dog.photo_url ? (
                              <img src={dog.photo_url} alt={dog.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 48, height: 48, borderRadius: 10, background: 'var(--orange-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                            <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                                    <div key={v.name} style={{ fontSize: 11, color: 'var(--gray)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                      <strong style={{ color: 'var(--ink)' }}>{v.name} :</strong>
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

                <MemberFichesSection memberId={selectedMember.id} memberName={selectedMember.full_name || 'ce membre'} />

                <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Notes admin <span style={{ fontWeight: 500, textTransform: 'none' }}>(privées, non visibles par le membre)</span>
                </div>
                <textarea
                  value={editingNotes}
                  onChange={(e) => setEditingNotes(e.target.value)}
                  rows={3}
                  placeholder="Santé, comportement, observations…"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: C.dark, marginBottom: 6, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                />
                {(editingNotes !== (memberDetails.profile?.admin_notes ?? '')) ? (
                  <button onClick={saveAdminNotes} disabled={savingNotes} style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {savingNotes ? '…' : <><Icon name="check" size={13} /> Enregistrer les notes</>}
                  </button>
                ) : <div style={{ marginBottom: 18 }} />}

                {/* Présent l'année prochaine — colonne de la liste clients que
                    seule l'admin renseigne (RPC set_renewal_next_year). */}
                {CLUB_ENABLED && selectedMember.user_type !== 'external' && (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Présent l'année prochaine</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
                      {[
                        { val: true, label: 'Oui' },
                        { val: false, label: 'Non' },
                        { val: null, label: 'Pas encore su' },
                      ].map(({ val, label }) => {
                        const current = memberDetails.profile?.renewal_next_year ?? null;
                        const active = current === val;
                        return (
                          <button
                            key={String(val)}
                            onClick={() => saveRenewal(val)}
                            disabled={renewalSaving}
                            style={{
                              flex: 1, padding: '8px 6px', borderRadius: 9,
                              border: `1.5px solid ${active ? C.blue : 'var(--border)'}`,
                              background: active ? 'var(--cyan-light)' : '#fff',
                              color: active ? C.blue : C.gray,
                              fontSize: 12.5, fontWeight: 700,
                              cursor: renewalSaving ? 'wait' : 'pointer',
                            }}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

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
                        // Cotisation : montant selon la date du paiement (150 avant le 30 juin 2026, 75 après)
                        const amount = { cotisation_annuelle: `${cotisationPrix(sub.paid_at || undefined)} CHF`, lecon_privee: '60 CHF', premium_mensuel: '10 CHF/mois', cours_theorique: '50 CHF' };
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
                        style={{ padding: '10px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: isPremiumActive ? C.redBg : 'var(--orange-light)', color: isPremiumActive ? C.red : '#92400e', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
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
            <input type="date" value={lessonDate} onChange={e => setLessonDate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Heure</label>
            <input type="time" value={lessonTime} onChange={e => setLessonTime(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
            <input placeholder="Ex: terrain B, apporter la laisse…" value={lessonNotes} onChange={e => setLessonNotes(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setLessonTarget(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSaveLesson} disabled={lessonSaving || !lessonDate || !lessonTime} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: lessonSaving ? 'var(--gray-mid)' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: lessonSaving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
  // Montant affiché par type. Cotisation : selon la date du paiement (150 avant le 30 juin 2026, 75 après).
  // Leçon privée : montant réel (durée × 60 CHF + déplacement) au lieu du 60 codé en dur.
  const fmtAmount = (s) => {
    if (!s) return '—';
    if (s.type === 'cotisation_annuelle') return `CHF ${cotisationPrix(s.paid_at || undefined)}`;
    if (s.type === 'lecon_privee') {
      const dur = Number(s.duration_hours) || 1;
      const travel = Number(s.travel_extra_chf) || 0;
      return `CHF ${Math.round(dur * 60 + travel)}`;
    }
    return { premium_mensuel: 'CHF 10/mois', cours_theorique: 'CHF 50' }[s.type] ?? '—';
  };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  // Filtre : on garde uniquement les vraies transactions Stripe (avec
  // stripe_session_id non-null) ET les paiements echoues (status=failed)
  // pour qu'on voie les refus. Les validations manuelles (paid sans
  // stripe_session_id) ne sont pas affichees ici.
  const stripeOnly = subscriptions.filter(s => !!s.stripe_session_id || s.status === 'failed');
  const paid = stripeOnly.filter(s => s.status === 'paid');
  const pending = stripeOnly.filter(s => s.status === 'pending');
  const failed = stripeOnly.filter(s => s.status === 'failed');

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: C.greenBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{paid.length}</div>
          <div style={{ fontSize: 12, color: C.green }}>Confirmés</div>
        </div>
        <div style={{ flex: 1, background: C.orangeBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.orange }}>{pending.length}</div>
          <div style={{ fontSize: 12, color: C.orange }}>En attente</div>
        </div>
        <div style={{ flex: 1, background: C.redBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.red }}>{failed.length}</div>
          <div style={{ fontSize: 12, color: C.red }}>Refusés</div>
        </div>
      </div>
      {stripeOnly.map(sub => (
        <div key={sub.id} style={{ background: C.card, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 36, height: 36, background: sub.status === 'paid' ? C.greenBg : sub.status === 'failed' ? C.redBg : C.orangeBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name={sub.status === 'paid' ? 'checkCircle' : sub.status === 'failed' ? 'warning' : 'clock'} size={20} color={sub.status === 'paid' ? C.green : sub.status === 'failed' ? C.red : C.orange} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{sub.user_name ?? sub.user_email ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{typeLabel[sub.type] ?? sub.type} · {fmtDate(sub.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sub.status === 'paid' ? C.green : sub.status === 'failed' ? C.red : C.orange }}>{fmtAmount(sub)}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.status === 'paid' ? 'Payé' : sub.status === 'failed' ? 'Refusé' : 'En attente'}</div>
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
      {stripeOnly.length === 0 && <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucune transaction Stripe</div>}

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 360 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={18} color={C.red} /> Supprimer ce paiement ?</div>
            <div style={{ fontSize: 14, color: C.gray, marginBottom: 20 }}>
              <strong>{typeLabel[confirmDelete.type] ?? confirmDelete.type}</strong> · {fmtAmount(confirmDelete)}<br />
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
  // Modal de déplacement d'un cours confirmé OU de proposition d'un autre
  // créneau sur une demande en attente (propose: true) :
  // { req, date, startTime, durationMin, propose } ou null
  const [rescheduling, setRescheduling] = useState(null);
  // Modal de refus d'une demande : { req, message } ou null
  const [rejecting, setRejecting] = useState(null);

  // Une demande vient soit d'un membre, soit de quelqu'un qui a réservé depuis
  // le site sans compte. Le membre porte ses coordonnées dans profiles ; l'autre
  // les porte sur la demande elle-même (guest_*). Sans ce repli, la carte
  // affichait « — » et Tiffany n'avait ni le nom ni de quoi recontacter la
  // personne.
  const demandeur = (req) => ({
    nom: req?.profiles?.full_name || req?.guest_name || '—',
    email: req?.profiles?.email || req?.guest_email || '',
    tel: req?.guest_phone || '',
    chien: req?.dog_name || '',
    sansCompte: !req?.user_id,
  });

  // Numéro au format wa.me : chiffres seuls, indicatif compris. Le 00 se retire
  // en premier, sinon « 0041… » devient « 41041… » et le lien n'ouvre rien.
  const lienWhatsApp = (brut) => {
    const n = String(brut || '').replace(/[^\d+]/g, '').replace(/^\+/, '').replace(/^00/, '');
    if (!n) return null;
    const inter = n.startsWith('41') ? n : n.startsWith('0') ? '41' + n.slice(1) : n;
    return 'https://wa.me/' + inter;
  };

  const saveReschedule = async () => {
    if (!rescheduling?.req || !rescheduling.date || !rescheduling.startTime) return;
    setActionLoading(rescheduling.req.id);
    const end = (() => {
      const [h, m] = String(rescheduling.startTime).split(':').map(Number);
      const total = h * 60 + (m || 0) + Number(rescheduling.durationMin || 60);
      return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
    })();
    // status 'confirmed' renvoyé exprès : déclenche la notification au membre
    // (in-app + push) avec le nouveau créneau.
    const { data: r1, error: e1 } = await callAdmin('update_request', pwd, {
      request_id: rescheduling.req.id,
      status: 'confirmed',
      chosen_slot: { date: rescheduling.date, start: rescheduling.startTime, end },
    });
    // Aligne la subscription lecon_privee (date affichée + flux de paiement),
    // comme le fait la confirmation classique.
    const lessonDate = new Date(`${rescheduling.date}T${rescheduling.startTime}:00`).toISOString();
    const { data: r2, error: e2 } = await callAdmin('set_lesson_date', pwd, {
      user_id: rescheduling.req.user_id,
      lesson_date: lessonDate,
      lesson_notes: rescheduling.req.admin_notes || null,
    });
    // Synchronise la durée choisie (et le prix recalculé) sur la demande
    const dh = Math.round((Number(rescheduling.durationMin || 60) / 60) * 100) / 100;
    const { data: r3, error: e3 } = dh > 0 && dh <= 6
      ? await callAdmin('update_request_duration', pwd, { request_id: rescheduling.req.id, duration_hours: dh })
      : { data: null, error: null };
    const failure = e1?.message || r1?.error || e2?.message || r2?.error || e3?.message || r3?.error;
    if (failure) alert('Erreur lors de l’enregistrement du créneau : ' + failure);
    setRescheduling(null);
    setActionLoading(null);
    load();
  };

  const submitReject = async () => {
    if (!rejecting?.req) return;
    const key = rejecting.req.id + '_reject';
    setActionLoading(key);
    // reject_request (admin-auth-proxy) : passe la demande en refusée, nettoie
    // la subscription en attente, et prévient le membre (notif in-app + push),
    // avec le message/alternative de Tiffany s'il y en a un.
    const { data, error } = await callAdmin('reject_request', pwd, {
      request_id: rejecting.req.id,
      message: (rejecting.message || '').trim() || undefined,
    });
    const failure = error?.message || data?.error;
    if (failure) alert('Erreur lors du refus : ' + failure);
    else setRejecting(null);
    setActionLoading(null);
    load();
  };

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
    const { data: r1, error: e1 } = await callAdmin('update_request', pwd, { request_id: req.id, status: 'confirmed', chosen_slot: finalSlot });
    const lessonDate = new Date(`${finalSlot.date}T${finalSlot.start}:00`).toISOString();
    // set_lesson_date écrit la date sur l'abonnement « leçon privée » du membre.
    // Quelqu'un qui a réservé depuis le site n'a ni compte ni abonnement :
    // l'appeler renvoyait « user_id manquant », et Tiffany voyait une erreur
    // alors que la confirmation, elle, avait bien eu lieu.
    const { data: r2, error: e2 } = req.user_id
      ? await callAdmin('set_lesson_date', pwd, { user_id: req.user_id, lesson_date: lessonDate, lesson_notes: req.admin_notes || null })
      : { data: null, error: null };
    // Synchronise la durée choisie (et le prix recalculé) sur la demande
    const dh = Math.round((Number(dur) / 60) * 100) / 100;
    const { data: r3, error: e3 } = dh > 0 && dh <= 6
      ? await callAdmin('update_request_duration', pwd, { request_id: req.id, duration_hours: dh })
      : { data: null, error: null };
    const failure = e1?.message || r1?.error || e2?.message || r2?.error || e3?.message || r3?.error;
    if (failure) alert('Erreur lors de la confirmation : ' + failure);
    await load();
    setActionLoading(null);
  };

  // Ouvre la modal de refus (message optionnel envoyé au membre)
  const reject = (req) => setRejecting({ req, message: '' });

  const updateDuration = async (req, dh) => {
    const key = req.id + '_duration';
    setActionLoading(key);
    try {
      await callAdmin('update_request_duration', pwd, { request_id: req.id, duration_hours: dh });
      await load();
    } catch (e) {
      alert('Erreur : ' + (e?.message || e));
    } finally {
      setActionLoading(null);
    }
  };

  const cancel = async (req) => {
    const isPaid = req.payment_status === 'paid';
    const amount = Number(req.price_chf || 60);
    const memberName = demandeur(req).nom !== '—' ? demandeur(req).nom : 'cette personne';
    const confirmMsg = isPaid
      ? `Annuler ce cours privé déjà payé par ${memberName} ?\n\nLe membre sera remboursé automatiquement de ${amount} CHF via Stripe (sous 5 à 10 jours selon sa banque).`
      : `Annuler le cours privé confirmé de ${memberName} ?`;
    if (!window.confirm(confirmMsg)) return;
    const key = req.id + '_cancel';
    setActionLoading(key);

    // Si le cours est payé, on rembourse AVANT de passer la demande en cancelled
    let refundResult = null;
    if (isPaid) {
      const { data: refundData, error: refundErr } = await supabase.functions.invoke('admin-auth-proxy', {
        body: { target: 'refund-coaching-request', action: 'refund', payload: { request_id: req.id, initiated_by: 'admin' } },
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
    // Annule uniquement les leçons EN ATTENTE du membre — delete_lesson (legacy)
    // supprimait toutes ses subscriptions lecon_privee, forfaits payés compris.
    await callAdmin('cancel_pending_lessons', pwd, { user_id: req.user_id });
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

  const [archivingId, setArchivingId] = useState(null);
  const [archiveConfirm, setArchiveConfirm] = useState(null);

  const handleArchive = async (reqId) => {
    // 2-clicks au lieu de window.confirm (bloque dans certaines PWA)
    if (archiveConfirm !== reqId) {
      setArchiveConfirm(reqId);
      setTimeout(() => setArchiveConfirm(prev => prev === reqId ? null : prev), 4000);
      return;
    }
    setArchivingId(reqId);
    try {
      const { error } = await callAdmin('archive_request', pwd, { request_id: reqId });
      if (error) { alert('Erreur : ' + (error.message ?? error)); return; }
      await load();
    } catch (e) {
      alert('Erreur : ' + (e?.message ?? e));
    } finally {
      setArchivingId(null);
      setArchiveConfirm(null);
    }
  };
  const cancelledCount = requests.filter(r => r.status === 'cancelled').length;
  // Un cours confirmé dont la date est passée n'est plus "actif" : il part
  // dans la section repliée "Cours passés" en bas, pour garder la liste propre.
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const isPast = (r) => r.status === 'confirmed' && r.chosen_slot?.date && r.chosen_slot.date < todayLocal;
  const matchesFilter = (r) => filter === 'all' ? true : r.status === filter;
  const filtered = requests.filter(r => matchesFilter(r) && !isPast(r));
  const pastRequests = requests.filter(r => matchesFilter(r) && isPast(r))
    .sort((a, b) => String(b.chosen_slot?.date).localeCompare(String(a.chosen_slot?.date)));
  const [showPast, setShowPast] = useState(false);

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
        <div key={req.id} style={{ position: 'relative', background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${req.status === 'pending' ? C.orange : req.status === 'confirmed' ? C.green : req.status === 'cancelled' ? C.red : '#d1d5db'}` }}>
          {(req.status === 'cancelled' || req.status === 'rejected') && (
            <button
              onClick={(e) => { e.stopPropagation(); handleArchive(req.id); }}
              disabled={archivingId === req.id}
              title={archiveConfirm === req.id ? 'Re-cliquer pour confirmer' : 'Masquer de la liste'}
              style={{
                position: 'absolute', top: 8, right: 8,
                height: 26,
                width: archiveConfirm === req.id ? 'auto' : 26,
                padding: archiveConfirm === req.id ? '0 10px' : 0,
                background: archiveConfirm === req.id ? C.red : C.grayBg,
                color: archiveConfirm === req.id ? '#fff' : C.gray,
                border: 'none', borderRadius: 8, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 700, gap: 4,
                opacity: archivingId === req.id ? 0.6 : 1,
              }}
            >
              {archivingId === req.id ? '…' : archiveConfirm === req.id ? <>Confirmer <Icon name="close" size={10} /></> : <Icon name="close" size={12} />}
            </button>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ width: 36, height: 36, background: C.grayBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="user" size={20} color={C.gray} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>
                {demandeur(req).nom}
                {demandeur(req).sansCompte && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: C.blue, background: '#e8f7fd', borderRadius: 5, padding: '1px 5px', verticalAlign: 'middle' }}>
                    sans compte
                  </span>
                )}
              </div>
              {demandeur(req).chien && (
                <div style={{ fontSize: 12, color: C.dark, fontWeight: 600 }}>
                  <Icon name="paw" size={12} color={C.gray} style={{ verticalAlign: '-1px', marginRight: 4 }} />
                  {demandeur(req).chien}
                </div>
              )}
              <div style={{ fontSize: 11, color: C.gray, wordBreak: 'break-word' }}>
                {demandeur(req).email}{demandeur(req).email ? ' · ' : ''}
                {new Date(req.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
              {demandeur(req).tel && (
                <div style={{ fontSize: 11, marginTop: 3 }}>
                  <a href={lienWhatsApp(demandeur(req).tel)} target="_blank" rel="noopener noreferrer"
                     style={{ color: C.green, fontWeight: 700, textDecoration: 'none' }}>
                    {demandeur(req).tel} · WhatsApp
                  </a>
                </div>
              )}
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
            {req.status === 'pending' ? 'Créneaux proposés, cliquez pour confirmer :' : req.status === 'confirmed' ? 'Créneau confirmé :' : 'Créneaux proposés :'}
          </div>

          {req.status === 'confirmed' && req.chosen_slot ? (
            <div>
              <div style={{ background: C.greenBg, borderRadius: 8, padding: '10px 14px', fontSize: 13, fontWeight: 700, color: C.green, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="calendar" size={14} color={C.green} /> {fmtSlot(req.chosen_slot)}
                <button
                  onClick={() => setRescheduling({
                    req,
                    date: req.chosen_slot?.date ?? '',
                    startTime: req.chosen_slot?.start ?? '09:00',
                    durationMin: (() => {
                      const s = req.chosen_slot || {};
                      if (s.start && s.end) {
                        const [sh, sm] = String(s.start).split(':').map(Number);
                        const [eh, em] = String(s.end).split(':').map(Number);
                        const d = (eh * 60 + (em || 0)) - (sh * 60 + (sm || 0));
                        if (d > 0) return d;
                      }
                      return 60;
                    })(),
                  })}
                  style={{ marginLeft: 'auto', background: '#fff', border: `1.5px solid ${C.green}`, color: C.green, borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }}
                >
                  Déplacer
                </button>
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
              {/* Modifier la durée — uniquement tant que pas encore payé */}
              {req.payment_status !== 'paid' && req.payment_status !== 'refunded' && (() => {
                const slot = req.chosen_slot || {};
                let curDh = 1;
                if (slot.start && slot.end) {
                  const [h1, m1] = String(slot.start).split(':').map(Number);
                  const [h2, m2] = String(slot.end).split(':').map(Number);
                  const mins = (h2 * 60 + (m2 || 0)) - (h1 * 60 + (m1 || 0));
                  if (mins > 0) curDh = mins / 60;
                }
                return (
                  <div style={{ marginBottom: 8, padding: '8px 12px', background: C.grayBg, borderRadius: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, marginBottom: 6 }}>Durée de la séance</div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[1, 1.5, 2].map(dh => (
                        <button
                          key={dh}
                          onClick={() => updateDuration(req, dh)}
                          disabled={!!actionLoading || curDh === dh}
                          style={{
                            flex: 1, padding: '7px', borderRadius: 8, border: 'none',
                            background: curDh === dh ? C.blue : '#fff',
                            color: curDh === dh ? '#fff' : C.dark,
                            fontSize: 12, fontWeight: 700,
                            cursor: actionLoading || curDh === dh ? 'default' : 'pointer',
                            opacity: actionLoading === req.id + '_duration' ? 0.6 : 1,
                          }}>
                          {dh === 1 ? '1 h' : dh === 1.5 ? '1 h 30' : '2 h'}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
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
            <>
              {/* Aucune dispo du membre ne convient : proposer un autre créneau
                  (confirme le nouveau créneau et notifie le membre). */}
              <button
                onClick={() => setRescheduling({ req, date: '', startTime: '10:00', durationMin: 60, propose: true })}
                disabled={!!actionLoading}
                style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, border: 'none', background: C.orangeBg, color: C.orange, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
              >
                <Icon name="calendar" size={12} /> Proposer un autre créneau
              </button>
              <button onClick={() => reject(req)} disabled={!!actionLoading} style={{ width: '100%', marginTop: 8, padding: '9px', borderRadius: 8, border: 'none', background: C.redBg, color: C.red, fontSize: 12, fontWeight: 700, cursor: actionLoading ? 'not-allowed' : 'pointer', opacity: actionLoading === req.id + '_reject' ? 0.6 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                {actionLoading === req.id + '_reject' ? '…' : <><Icon name="close" size={12} /> Refuser la demande</>}
              </button>
            </>
          )}
        </div>
      ))}

      {/* ─── Cours passés : repliés pour garder la liste propre ─── */}
      {pastRequests.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <button onClick={() => setShowPast(v => !v)} style={{
            width: '100%', background: C.card, border: 'none', borderRadius: 12,
            padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
            fontSize: 14, fontWeight: 700, color: C.gray,
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="clock" size={15} color={C.gray} /> Cours passés ({pastRequests.length})
            </span>
            <Icon name={showPast ? 'chevronDown' : 'chevronRight'} size={15} color={C.gray} />
          </button>
          {showPast && pastRequests.map(req => (
            <div key={req.id} style={{ background: C.card, borderRadius: 12, padding: '12px 16px', marginTop: 8, opacity: 0.75, display: 'flex', alignItems: 'center', gap: 12, borderLeft: `4px solid #d1d5db` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{demandeur(req).nom !== '—' ? demandeur(req).nom : (demandeur(req).email || 'Demande')}</div>
                <div style={{ fontSize: 12.5, color: C.gray, marginTop: 2 }}>{fmtSlot(req.chosen_slot)}</div>
              </div>
              <Badge
                color={req.payment_status === 'paid' || req.payment_status === 'cash_paid' ? C.green : C.orange}
                bg={req.payment_status === 'paid' || req.payment_status === 'cash_paid' ? C.greenBg : C.orangeBg}
              >
                {req.payment_status === 'paid' || req.payment_status === 'cash_paid' ? `Payé · ${Number(req.price_chf || 60)} CHF` : 'Non payé'}
              </Badge>
            </div>
          ))}
        </div>
      )}

      {/* ─── Modal : fixer l'heure exacte du cours privé ─── */}
      {confirmingSlot && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }} onClick={() => setConfirmingSlot(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 380, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.2)' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.dark, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="calendar" size={18} color={C.blue} /> Fixer l'horaire du cours
            </div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 16 }}>
              Plage proposée par <strong>{demandeur(confirmingSlot.req).nom !== '—' ? demandeur(confirmingSlot.req).nom : 'la personne'}</strong> : {fmtSlot(confirmingSlot.originalSlot)}
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

      {/* Modal Déplacer un cours confirmé (rdv déplacé, imprévu…) */}
      {rescheduling && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRescheduling(null)}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
              {rescheduling.propose ? 'Proposer un autre créneau' : 'Déplacer le cours'}
            </div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 16 }}>
              {demandeur(rescheduling.req).nom !== '—' ? demandeur(rescheduling.req).nom : (demandeur(rescheduling.req).email || 'Demande')} · {rescheduling.propose
                ? 'le créneau sera confirmé et le membre notifié (il pourra t’écrire si ça ne lui va pas).'
                : 'le membre sera notifié du nouveau créneau.'}
            </div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: C.gray, marginBottom: 12 }}>
              Nouvelle date
              <input type="date" value={rescheduling.date}
                onChange={(e) => setRescheduling(r => ({ ...r, date: e.target.value }))}
                style={{ display: 'block', width: '100%', marginTop: 5, padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 15 }} />
            </label>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <label style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: C.gray }}>
                Heure
                <input type="time" value={rescheduling.startTime}
                  onChange={(e) => setRescheduling(r => ({ ...r, startTime: e.target.value }))}
                  style={{ display: 'block', width: '100%', marginTop: 5, padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 15 }} />
              </label>
              <label style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: C.gray }}>
                Durée
                <select value={rescheduling.durationMin}
                  onChange={(e) => setRescheduling(r => ({ ...r, durationMin: Number(e.target.value) }))}
                  style={{ display: 'block', width: '100%', marginTop: 5, padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 15, background: '#fff' }}>
                  <option value={30}>30 min</option>
                  <option value={45}>45 min</option>
                  <option value={60}>1 h</option>
                  <option value={90}>1 h 30</option>
                  <option value={120}>2 h</option>
                </select>
              </label>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRescheduling(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={saveReschedule} disabled={actionLoading === rescheduling.req.id || !rescheduling.date || !rescheduling.startTime}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.green, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (actionLoading === rescheduling.req.id || !rescheduling.date) ? 0.6 : 1 }}>
                {rescheduling.propose ? 'Proposer + notifier' : 'Déplacer + notifier'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal : refuser une demande (avec message optionnel au membre) ─── */}
      {rejecting && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setRejecting(null)}>
          <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: '100%', maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="close" size={16} color={C.red} /> Refuser la demande
            </div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 14 }}>
              {demandeur(rejecting.req).nom !== '—' ? demandeur(rejecting.req).nom : (demandeur(rejecting.req).email || 'La personne')} recevra une notification
              (dans l'app + push). Tu peux ajouter un message, par exemple pour proposer une alternative.
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Message pour le membre (optionnel)
            </label>
            <textarea
              value={rejecting.message}
              onChange={(e) => setRejecting(r => ({ ...r, message: e.target.value }))}
              rows={3}
              placeholder="Ex. : je ne suis pas disponible sur ces créneaux, mais je peux te proposer mardi 21 à 14h : refais une demande ou écris-moi dans le chat !"
              style={{ width: '100%', padding: '11px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', marginBottom: 14, fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setRejecting(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={submitReject} disabled={actionLoading === rejecting.req.id + '_reject'}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.red, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === rejecting.req.id + '_reject' ? 0.6 : 1 }}>
                Refuser + notifier
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet News ──────────────────────────────────────────────────────────────
function PlanningTab({ pwd }) {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | { course object }
  const COLORS = ['#2BABE1','#eab308','#f97316','#16a34a','#8b5cf6','#ec4899'];
  const TYPE_DEFAULT_COLOR = { collectif: '#2BABE1', theorique: '#eab308', prive: '#f97316' };
  const [form, setForm] = useState({ course_type: 'collectif', course_date: '', start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1', notify: false, allow_cash: false });
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
    setForm({ course_type: 'collectif', course_date: fmt(today), start_time: '09:00', end_time: '10:00', notes: '', price: '', color: '#2BABE1', notify: false, allow_cash: false });
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
      allow_cash:  !!course.allow_cash,
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
      allow_cash:  !!form.allow_cash,
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
                          <span style={{ background: 'var(--green-light)', color: 'var(--green-dark)', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 6 }}>CHF {course.price}</span>
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
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }} />

            {/* Heures */}
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Début</label>
                <input type="time" value={form.start_time} onChange={e => setForm(f => ({ ...f, start_time: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Fin</label>
                <input type="time" value={form.end_time} onChange={e => setForm(f => ({ ...f, end_time: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }} />
              </div>
            </div>

            {/* Prix */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Montant à payer (CHF) · laisser vide si gratuit</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>CHF</span>
              <input
                type="number"
                min="0"
                step="1"
                value={form.price}
                onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                placeholder="0"
                style={{ width: 100, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
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
                  style={{ width: 32, height: 32, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--ink)' : '3px solid transparent', cursor: 'pointer', flexShrink: 0, boxShadow: form.color === c ? '0 0 0 2px #fff inset' : 'none', transition: 'all 0.15s' }} />
              ))}
            </div>

            {/* Notes / description */}
            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes / description (visible par les membres)</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Ex: Apporter une laisse courte · Terrain B · Tenue de pluie recommandée…"
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
            />

            {/* Paiement sur place — uniquement pour cours payants */}
            {Number(form.price) > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.dark, cursor: 'pointer', marginBottom: 12, padding: '10px 12px', background: form.allow_cash ? 'var(--orange-light)' : C.grayBg, borderRadius: 10, border: form.allow_cash ? '1.5px solid #f59e0b' : '1.5px solid transparent' }}>
                <input type="checkbox" checked={!!form.allow_cash} onChange={e => setForm(f => ({ ...f, allow_cash: e.target.checked }))} />
                Autoriser le paiement sur place (cash, carte, TWINT)
              </label>
            )}

            {/* Notification aux membres */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, color: C.dark, cursor: 'pointer', marginBottom: 20, padding: '10px 12px', background: form.notify ? '#eff6ff' : C.grayBg, borderRadius: 10, border: form.notify ? '1.5px solid ' + C.blue : '1.5px solid transparent' }}>
              <input type="checkbox" checked={!!form.notify} onChange={e => setForm(f => ({ ...f, notify: e.target.checked }))} />
              Prévenir les membres avec une notification
            </label>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setEditing(null)} style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleSave} disabled={saving || !form.course_date} style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: saving ? 'var(--gray-mid)' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
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
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 6, marginBottom: 8, lineHeight: 1.4 }}>
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
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Titre * <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(H1 de l'article)</span></label>
              <input
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="Ex : Les bases de la socialisation du chiot"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Slug (URL) *</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f9fafb', borderRadius: 10, padding: '8px 12px', border: '1.5px solid var(--border)' }}>
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
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Extrait <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(résumé affiché en liste, 150-200 caractères idéal)</span></label>
              <textarea
                value={form.excerpt}
                onChange={e => setForm(f => ({ ...f, excerpt: e.target.value }))}
                placeholder="Un résumé court et accrocheur de l'article…"
                rows={2}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
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
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginTop: 8 }}
              />
            </div>

            {/* ── Contenu HTML ── */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>
                Contenu * <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(HTML : balises {'<p>, <h2>, <h3>, <ul>, <strong>, <a>'} autorisées)</span>
              </label>
              <textarea
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="<p>Premier paragraphe…</p>&#10;<h2>Sous-titre</h2>&#10;<p>Autre paragraphe…</p>"
                rows={14}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'Menlo, Monaco, monospace', lineHeight: 1.5 }}
              />
            </div>

            {/* ── Organisation ── */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Catégorie</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none', background: '#fff' }}
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
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
                />
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4, fontWeight: 600 }}>Tags <span style={{ color: 'var(--gray-mid)', fontWeight: 400 }}>(séparés par des virgules)</span></label>
              <input
                value={form.tags}
                onChange={e => setForm(f => ({ ...f, tags: e.target.value }))}
                placeholder="chiot, socialisation, éducation positive"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
              />
            </div>

            {/* ── SEO ── */}
            <details style={{ marginBottom: 16, background: '#f9fafb', borderRadius: 10, padding: 12 }}>
              <summary style={{ fontSize: 13, fontWeight: 700, color: C.dark, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="search" size={14} /> SEO (optionnel)
              </summary>
              <div style={{ marginTop: 12 }}>
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta title <span style={{ color: 'var(--gray-mid)' }}>(sinon = titre de l'article, max 60 car.)</span></label>
                <input
                  value={form.meta_title}
                  onChange={e => setForm(f => ({ ...f, meta_title: e.target.value }))}
                  placeholder="Titre dans Google (optionnel)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none', marginBottom: 10 }}
                />
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta description <span style={{ color: 'var(--gray-mid)' }}>(max 155 car.)</span></label>
                <textarea
                  value={form.meta_description}
                  onChange={e => setForm(f => ({ ...f, meta_description: e.target.value }))}
                  placeholder="Description affichée dans les résultats Google"
                  rows={2}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none', resize: 'vertical', fontFamily: 'inherit', marginBottom: 10 }}
                />
                <label style={{ fontSize: 11, color: C.gray, display: 'block', marginBottom: 4 }}>Meta keywords</label>
                <input
                  value={form.meta_keywords}
                  onChange={e => setForm(f => ({ ...f, meta_keywords: e.target.value }))}
                  placeholder="chiot, socialisation, jura"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid var(--border)', fontSize: 13, boxSizing: 'border-box', outline: 'none' }}
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
                style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: saving || !form.title.trim() || !form.slug.trim() || !form.content.trim() ? 'var(--gray-mid)' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
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
  const [scheduled, setScheduled] = useState([]);
  const [sourcesCounts, setSourcesCounts] = useState({}); // { [bundle_id]: nb_sources }
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [choosing, setChoosing] = useState(null);
  const [generating, setGenerating] = useState(null);
  const [scheduling, setScheduling] = useState(null);   // bundle_id en cours de programmation
  const [rerolling, setRerolling] = useState(null);     // bundle_id en cours de re-roll
  const [editingBundleId, setEditingBundleId] = useState(null);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState(null);
  // Saisie de la date par bundle : { [bundle_id]: 'YYYY-MM-DDTHH:mm' }
  const [scheduleDrafts, setScheduleDrafts] = useState({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    // On utilise editorial-proposals-list (mini-fn dédiée) pour récupérer
    // les propositions + bundles AVEC le champ category, sans avoir à
    // redéployer le gros admin-query.
    const [
      propListResp,
      { data: sData, error: sErr },
      { data: cData, error: cErr },
      { data: catData },
      statsResp,
    ] = await Promise.all([
      supabase.functions.invoke('admin-auth-proxy', {
        body: { target: 'editorial-proposals-list', action: 'list', payload: null },
      }).then(r => r.data ?? { error: r.error?.message }).catch((e) => ({ error: e.message })),
      callEditorial('list_scheduled_bundles', pwd),
      callEditorial('count_bundle_sources', pwd),
      supabase.functions.invoke('admin-auth-proxy', {
        body: { target: 'editorial-stats', action: 'stats', payload: null },
      }).then(r => r.data ?? null).catch(() => null),
    ]);
    if (propListResp?.error) setError(propListResp.error);
    if (sErr || sData?.error) setError(sData?.error ?? sErr?.message ?? 'Erreur chargement bundles programmés');
    setProposals(propListResp?.proposals ?? []);
    setBatchId(propListResp?.batch_id ?? null);
    setBundles(propListResp?.bundles ?? []);
    setScheduled(sData?.scheduled ?? []);
    setSourcesCounts(cData?.counts ?? {});
    setCategoryStats(catData && !catData.error ? catData : null);
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
      setError(`Déjà ${data.recent_count} propositions cette semaine : choisis-en une ou archive-les avant d'en générer d'autres.`);
    }
    await load();
  };

  const handleChoose = async (bundle_id, theme) => {
    if (!confirm(`Choisir "${theme}" comme thème de la semaine ?\n\nLes 2 autres propositions seront archivées et l'agent va générer automatiquement le bundle complet (article blog + ressource premium + carrousel Insta + post Google Business + notification). Compte ~30 secondes, coût ~0.10 CHF.`)) return;
    setChoosing(bundle_id);
    setError(null);

    // Étape 1 : passer le bundle en 'chosen'
    const { data, error: fnErr } = await callAdmin('choose_editorial_theme', pwd, { bundle_id });
    if (fnErr || data?.error) {
      setChoosing(null);
      setError(data?.error ?? fnErr?.message ?? 'Erreur lors du choix');
      return;
    }

    // Étape 2 : enchaîner immédiatement avec la génération du contenu.
    // Sans ce chaînage, le bundle restait coincé en 'chosen' et l'utilisateur
    // devait cliquer un 2e bouton — qui n'était pas toujours visible.
    setGenerating(bundle_id);
    const { data: genData, error: genErr } = await callEditorial('trigger_generate_bundle', pwd, { bundle_id });
    setChoosing(null);
    setGenerating(null);
    if (genErr || genData?.error) {
      setError(`Le thème "${theme}" est bien choisi, mais la génération du contenu a échoué : ${genData?.error ?? genErr?.message ?? 'erreur inconnue'}. Tu peux relancer la génération depuis la liste des bundles en cours.`);
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
  // Régénère UNE proposition
  const handleReroll = async (bundle_id) => {
    if (!confirm(`Régénérer cette proposition ? L'IA va proposer un nouveau thème (coût ~0.03 CHF).`)) return;
    setRerolling(bundle_id);
    setError(null);
    const { data, error: fnErr } = await callEditorial('reroll_proposal', pwd, {
      bundle_id,
    });
    setRerolling(null);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur lors du re-roll');
      return;
    }
    await load();
  };


  // Programmer la publication d'un bundle pour une date future
  const handleSchedule = async (bundle_id, theme) => {
    const draft = scheduleDrafts[bundle_id];
    if (!draft) {
      setError('Choisis une date avant de programmer la publication.');
      return;
    }
    // L'input datetime-local renvoie 'YYYY-MM-DDTHH:mm' en heure LOCALE.
    // On le passe à Date() qui interprète bien comme heure locale, puis
    // on convertit en ISO UTC pour l'API.
    const when = new Date(draft);
    if (isNaN(when.getTime())) {
      setError('Date invalide.');
      return;
    }
    // Avertissement non bloquant si le bundle part sans ses images.
    const target = bundles.find(b => b.id === bundle_id);
    const missing = target ? missingImagesLabel(target) : null;
    if (missing && !confirm(`"${theme}" a ${missing}.\n\nLa publication automatique fonctionnera quand même : l'article partira avec l'image générique et le carrousel Instagram sera sauté.\n\nProgrammer malgré tout ?`)) return;

    const niceLocal = when.toLocaleString('fr-CH', { dateStyle: 'full', timeStyle: 'short' });
    if (!confirm(`Programmer la publication de "${theme}" pour le ${niceLocal} ?\n\nLe bundle sera publié automatiquement (article + ressource + push) à cette date.`)) return;

    setScheduling(bundle_id);
    setError(null);
    const { data, error: fnErr } = await callEditorial('schedule_editorial_bundle', pwd, {
      bundle_id,
      scheduled_for: when.toISOString(),
    });
    setScheduling(null);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de programmation');
      return;
    }
    setScheduleDrafts(d => { const n = { ...d }; delete n[bundle_id]; return n; });
    await load();
  };

  // Annuler une programmation
  const handleUnschedule = async (bundle_id, theme) => {
    if (!confirm(`Annuler la programmation de "${theme}" ? Le bundle reviendra en brouillon validé.`)) return;
    setScheduling(bundle_id);
    setError(null);
    const { data, error: fnErr } = await callEditorial('unschedule_editorial_bundle', pwd, { bundle_id });
    setScheduling(null);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur lors du retrait');
      return;
    }
    await load();
  };

  // Valeur min pour le datetime-local : maintenant + 30 minutes (en heure locale)
  const minScheduleLocal = (() => {
    const d = new Date(Date.now() + 30 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();

  const statusBadge = (status) => {
    const map = {
      chosen:    { c: C.orange, b: C.orangeBg, label: 'Choisi' },
      drafted:   { c: C.blue,   b: '#dbeafe',  label: 'Brouillon' },
      validated: { c: C.green,  b: C.greenBg,  label: 'Validé' },
      scheduled: { c: '#0891b2',b: '#cffafe',  label: 'Programmé' },
      published: { c: '#7c3aed',b: '#ede9fe',  label: 'Publié' },
    };
    const s = map[status] ?? { c: C.gray, b: C.grayBg, label: status };
    return <Badge color={s.c} bg={s.b}>{s.label}</Badge>;
  };

  const fmtDateTimeLong = (iso) => iso ? new Date(iso).toLocaleString('fr-CH', { dateStyle: 'long', timeStyle: 'short' }) : '—';

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
      <div style={{ background: '#fff', padding: 18, borderRadius: 12, marginBottom: 20, border: `1px solid var(--border)` }}>
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
            style={{ background: triggering ? 'var(--gray-mid)' : C.blue, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: triggering ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
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
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: 16, border: `1px solid var(--border)`, display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                  <div style={{ fontSize: 11, color: C.blue, fontWeight: 700, letterSpacing: 0.5 }}>
                    PROPOSITION {i + 1}
                  </div>
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
                  disabled={choosing === p.id || !!choosing || rerolling === p.id}
                  style={{ background: choosing === p.id ? '#9ca3af' : C.blue, color: '#fff', border: 'none', borderRadius: 8, padding: '10px', fontSize: 13, fontWeight: 700, cursor: choosing ? 'not-allowed' : 'pointer', marginBottom: 8 }}
                >
                  {choosing === p.id ? 'Choix en cours…' : 'Choisir ce thème'}
                </button>
                <div style={{ marginTop: 'auto', position: 'relative' }}>
                  <button
                    onClick={() => handleReroll(p.id)}
                    disabled={!!choosing || rerolling === p.id}
                    style={{
                      width: '100%', background: 'transparent', color: C.gray,
                      border: '1px dashed #d1d5db', borderRadius: 8, padding: '8px',
                      fontSize: 12, fontWeight: 600,
                      cursor: rerolling === p.id ? 'wait' : 'pointer',
                    }}
                  >
                    {rerolling === p.id ? 'Re-génération…' : 'Régénérer cette proposition'}
                  </button>
                </div>
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
          <div style={{ background: '#fff', borderRadius: 12, border: `1px solid var(--border)`, overflow: 'hidden' }}>
            {bundles.map((b, idx) => (
              <div
                key={b.id}
                style={{
                  padding: '14px 16px',
                  borderBottom: idx < bundles.length - 1 ? '1px solid var(--gray-bg-alt)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{b.theme}</div>
                  </div>
                  <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                    Choisi le {fmtDate(b.chosen_at)}
                    {b.drafted_at && ` · Brouillon ${fmtDate(b.drafted_at)}`}
                    {b.validated_at && ` · Validé ${fmtDate(b.validated_at)}`}
                    {b.published_at && ` · Publié ${fmtDate(b.published_at)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusBadge(b.status)}
                  {sourcesCounts[b.id] > 0 && (
                    <span
                      title={`${sourcesCounts[b.id]} source${sourcesCounts[b.id] > 1 ? 's' : ''} scientifique${sourcesCounts[b.id] > 1 ? 's' : ''} citée${sourcesCounts[b.id] > 1 ? 's' : ''} dans cet article`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: '#f3e8ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        borderRadius: 999,
                        padding: '3px 9px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'help',
                      }}
                    >
                      <Icon name="book" size={11} color="#7c3aed" />
                      {sourcesCounts[b.id]}
                    </span>
                  )}
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
                  {/* 'scheduled' inclus : un bundle programmé doit rester
                      relisible jusqu'à sa publication, images comprises. */}
                  {(b.status === 'drafted' || b.status === 'validated' || b.status === 'scheduled' || b.status === 'published') && (
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

                {/* Sélecteur de date — apparait sur drafted / validated */}
                {(b.status === 'drafted' || b.status === 'validated') && (
                  <div style={{
                    flexBasis: '100%',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    background: '#f9fafb',
                    padding: '10px 12px',
                    borderRadius: 8,
                    marginTop: 4,
                  }}>
                    <div style={{ fontSize: 11, color: C.gray, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Programmer la publi
                    </div>
                    <input
                      type="datetime-local"
                      min={minScheduleLocal}
                      value={scheduleDrafts[b.id] ?? ''}
                      onChange={(e) => setScheduleDrafts(d => ({ ...d, [b.id]: e.target.value }))}
                      style={{
                        fontSize: 13,
                        padding: '6px 10px',
                        borderRadius: 6,
                        border: '1px solid #d1d5db',
                        background: '#fff',
                      }}
                    />
                    <button
                      onClick={() => handleSchedule(b.id, b.theme)}
                      disabled={!scheduleDrafts[b.id] || scheduling === b.id}
                      style={{
                        background: (!scheduleDrafts[b.id] || scheduling === b.id) ? '#9ca3af' : '#0891b2',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        padding: '7px 12px',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: scheduling === b.id ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {scheduling === b.id ? 'Programmation…' : 'Programmer'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Publications à venir (bundles scheduled) ───────────────────── */}
      {scheduled.length > 0 && (
        <div style={{ marginTop: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: C.dark, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={14} color="#0891b2" />
            Publications à venir ({scheduled.length})
          </h3>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            {scheduled.map((s, idx) => (
              <div
                key={s.id}
                style={{
                  padding: '14px 16px',
                  borderBottom: idx < scheduled.length - 1 ? '1px solid var(--gray-bg-alt)' : 'none',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: 12,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: 200 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{s.theme}</div>
                  <div style={{ fontSize: 12, color: '#0891b2', marginTop: 4, fontWeight: 600 }}>
                    Publication prévue : {fmtDateTimeLong(s.scheduled_for)}
                  </div>
                  {s.blog_title && (
                    <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                      Article : {s.blog_title}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {statusBadge('scheduled')}
                  {sourcesCounts[s.id] > 0 && (
                    <span
                      title={`${sourcesCounts[s.id]} source${sourcesCounts[s.id] > 1 ? 's' : ''} scientifique${sourcesCounts[s.id] > 1 ? 's' : ''} citée${sourcesCounts[s.id] > 1 ? 's' : ''}`}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        background: '#f3e8ff',
                        color: '#7c3aed',
                        border: '1px solid #ddd6fe',
                        borderRadius: 999,
                        padding: '3px 9px',
                        fontSize: 11,
                        fontWeight: 700,
                        cursor: 'help',
                      }}
                    >
                      <Icon name="book" size={11} color="#7c3aed" />
                      {sourcesCounts[s.id]}
                    </span>
                  )}
                  <button
                    onClick={() => setEditingBundleId(s.id)}
                    style={{
                      background: '#fff',
                      color: C.blue,
                      border: `1.5px solid ${C.blue}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Voir
                  </button>
                  <button
                    onClick={() => handleUnschedule(s.id, s.theme)}
                    disabled={scheduling === s.id}
                    style={{
                      background: '#fff',
                      color: C.red,
                      border: `1.5px solid ${C.red}`,
                      borderRadius: 8,
                      padding: '8px 14px',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: scheduling === s.id ? 'not-allowed' : 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {scheduling === s.id ? '…' : 'Déprogrammer'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Performance des bundles publiés (Phase 3) ─────────────────────── */}
      {stats && stats.stats && stats.stats.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
            Performance des bundles publiés
          </div>

          {/* Totaux */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Bundles publiés</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.dark, marginTop: 4 }}>{stats.totals.total_bundles}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vues articles</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.blue, marginTop: 4 }}>{stats.totals.total_article_views}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Vues premium</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>{stats.totals.total_resource_views}</div>
            </div>
            <div style={{ background: '#fff', padding: 14, borderRadius: 10, border: '1px solid var(--border)' }}>
              <div style={{ fontSize: 11, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5 }}>Clics push</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.green, marginTop: 4 }}>{stats.totals.total_push_clicks}</div>
            </div>
          </div>

          {/* Tableau par bundle */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,2.2fr) 90px 90px 90px 100px', gap: 8, padding: '10px 14px', fontSize: 11, color: C.gray, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, background: '#f9fafb', borderBottom: '1px solid var(--border)' }}>
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
                borderBottom: idx < stats.stats.length - 1 ? '1px solid var(--gray-bg-alt)' : 'none',
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
  // L'aperçu rendu est la vue par défaut : Tiffany relit ce que le public
  // verra, pas du HTML brut. Le code source reste sous « Éditer ».
  const [viewMode, setViewMode] = useState('preview');
  const [regeneratingCover, setRegeneratingCover] = useState(false);
  const [rerenderingSlides, setRerenderingSlides] = useState(false);
  const [imageNotice, setImageNotice] = useState(null);
  // Texte des slides au dernier rendu : sert à savoir si les PNG sont périmés
  // après une correction de Tiffany.
  const [renderedSlidesKey, setRenderedSlidesKey] = useState(null);

  const slidesKeyOf = (b) => JSON.stringify(
    (b?.content_instagram?.slides ?? []).map(s => [s?.title ?? '', s?.body ?? '']),
  );

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
        setRenderedSlidesKey(slidesKeyOf(data.bundle));
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [pwd, bundleId]);

  const reloadBundle = async () => {
    const { data } = await callEditorial('get_editorial_bundle', pwd, { bundle_id: bundleId });
    if (data?.bundle) {
      setBundle(data.bundle);
      return data.bundle;
    }
    return null;
  };

  // Régénération manuelle de la couverture : nouvelle race (la rotation exclut
  // les 10 dernières) et nouvelle scène. Un appel Gemini, à la demande.
  const handleRegenerateCover = async () => {
    if (!confirm('Régénérer la couverture ? Une nouvelle race et une nouvelle scène seront tirées, et l’image actuelle sera remplacée.')) return;
    setRegeneratingCover(true);
    setError(null);
    setImageNotice(null);
    const { data, error: fnErr } = await callImageFn('generate-editorial-cover', { bundle_id: bundleId });
    setRegeneratingCover(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Échec de la génération de la couverture');
      return;
    }
    await reloadBundle();
    setImageNotice(`Nouvelle couverture générée${data?.cover_breed ? ` (${data.cover_breed})` : ''}.`);
  };

  // Re-rendu des PNG de slides après correction du texte.
  const handleRerenderSlides = async (silent = false) => {
    setRerenderingSlides(true);
    if (!silent) { setError(null); setImageNotice(null); }
    const { data, error: fnErr } = await callImageFn('render-instagram-slides', { bundle_id: bundleId });
    setRerenderingSlides(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Échec du rendu des slides');
      return false;
    }
    const fresh = await reloadBundle();
    setRenderedSlidesKey(slidesKeyOf(fresh));
    setImageNotice(`${data?.count ?? 0} slides rendues.`);
    return true;
  };

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
      content_facebook: bundle.content_facebook,
    };
    const { data, error: fnErr } = await callEditorial('update_editorial_bundle_content', pwd, payload);
    setSaving(false);
    if (fnErr || data?.error) {
      setError(data?.error ?? fnErr?.message ?? 'Erreur de sauvegarde');
      return;
    }
    setBundle(data.bundle);
    setDirty(false);

    // Si le texte des slides a bougé depuis le dernier rendu, les PNG publiés
    // ne correspondraient plus au contenu validé : on les re-rend tout de suite.
    const savedKey = slidesKeyOf(data.bundle);
    const alreadyRendered = Array.isArray(data.bundle?.content_instagram?.image_urls)
      && data.bundle.content_instagram.image_urls.length > 0;
    if (alreadyRendered && renderedSlidesKey !== null && savedKey !== renderedSlidesKey) {
      setImageNotice('Texte des slides modifié, re-rendu des images en cours…');
      await handleRerenderSlides(true);
    } else {
      setRenderedSlidesKey(savedKey);
    }
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
    // Avertissement non bloquant : sans images, la publication marche quand
    // même (og:image générique, Instagram sauté proprement).
    const missing = missingImagesLabel(bundle);
    if (missing && !confirm(`Ce bundle a ${missing}.\n\nTu peux publier quand même : l'article partira avec l'image générique et le carrousel Instagram sera sauté.\n\nPublier malgré tout ?`)) return;
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
    // Facebook n'a pas de contenu propre : le post est composé à la
    // publication depuis Google Business (ou la caption Instagram) + le lien
    // de l'article. Onglet d'aperçu seulement, rien à éditer ici.
    { id: 'facebook',        label: 'Facebook' },
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
              style={{ background: dirty && !saving ? C.blue : 'var(--gray-mid)', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: (dirty && !saving) ? 'pointer' : 'not-allowed' }}
            >
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
          )}
          {bundle.status === 'drafted' && (
            <button
              onClick={handleValidate}
              disabled={validating}
              style={{ background: validating ? 'var(--gray-mid)' : C.green, color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: validating ? 'not-allowed' : 'pointer' }}
            >
              {validating ? 'Validation…' : 'Valider'}
            </button>
          )}
          {(bundle.status === 'drafted' || bundle.status === 'validated') && (
            <button
              onClick={handlePublish}
              disabled={publishing}
              style={{ background: publishing ? 'var(--gray-mid)' : '#7c3aed', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 13, fontWeight: 700, cursor: publishing ? 'not-allowed' : 'pointer' }}
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
          {bundle.published_at && <span style={{ color: 'var(--gray)' }}> · {new Date(bundle.published_at).toLocaleString('fr-CH')}</span>}
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

      {imageNotice && (
        <div style={{ background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', padding: 10, borderRadius: 10, marginBottom: 14, fontSize: 12.5 }}>
          {imageNotice}
        </div>
      )}

      <ImagesBar
        bundle={bundle}
        readOnly={readOnly}
        regeneratingCover={regeneratingCover}
        rerenderingSlides={rerenderingSlides}
        onRegenerateCover={handleRegenerateCover}
        onRerenderSlides={() => handleRerenderSlides(false)}
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid var(--border)', marginBottom: 16, overflowX: 'auto' }}>
        <div style={{ display: 'flex', flex: 1 }}>
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
        {/* Aperçu rendu par défaut ; le code source reste accessible ici. */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--gray-bg-alt)', borderRadius: 9, padding: 3, flexShrink: 0, marginBottom: 6 }}>
          {[['preview', 'Aperçu'], ['edit', 'Éditer']].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setViewMode(id)}
              style={{
                border: 'none', borderRadius: 7, padding: '6px 13px', fontSize: 12, cursor: 'pointer',
                fontWeight: viewMode === id ? 800 : 600,
                background: viewMode === id ? '#fff' : 'transparent',
                color: viewMode === id ? C.dark : C.gray,
                boxShadow: viewMode === id ? '0 1px 3px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid var(--border)' }}>
        {viewMode === 'preview' && (() => {
          switch (activeTab) {
            case 'blog':
              return <BlogPreview blog={bundle.content_blog} />;
            case 'premium':
              return <PremiumPreview premium={bundle.content_premium} />;
            case 'instagram':
              return <InstagramPreview insta={bundle.content_instagram} />;
            case 'google_business':
              return (
                <GoogleBusinessPreview
                  gbp={bundle.content_google_business}
                  coverUrl={bundle.content_blog?.cover_image_url}
                  articleSlug={bundle.content_blog?.slug}
                />
              );
            case 'facebook':
              return <FacebookPreview bundle={bundle} />;
            default:
              return <NotificationPreview notif={bundle.content_notification} />;
          }
        })()}

        {viewMode === 'edit' && activeTab === 'blog' && (() => {
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
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Scène de la photo de couverture</label>
                <textarea
                  value={b.image_prompt ?? ''}
                  onChange={e => updateField('blog', 'image_prompt', e.target.value)}
                  style={{ ...inputStyle, minHeight: 70 }}
                  disabled={readOnly}
                  placeholder="Ce qui se passe sur la photo, sans mentionner de race : la race est tirée automatiquement pour changer à chaque article."
                />
                <div style={{ fontSize: 11, color: C.gray, marginTop: 4, lineHeight: 1.5 }}>
                  Sert au bouton « Régénérer la couverture ». La race, le décor et la saison sont ajoutés par le code.
                </div>
              </div>
              {bundle.image_generation_prompt && (
                <div style={fieldWrapStyle}>
                  <label style={labelStyle}>Prompt image réellement utilisé</label>
                  <div style={{ fontSize: 12, color: C.gray, background: '#f9fafb', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px', lineHeight: 1.55 }}>
                    {bundle.image_generation_prompt}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {viewMode === 'edit' && activeTab === 'premium' && (() => {
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

        {viewMode === 'edit' && activeTab === 'instagram' && (() => {
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
                  <div key={idx} style={{ background: '#f9fafb', padding: 12, borderRadius: 10, marginBottom: 10, border: '1px solid var(--border)' }}>
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

        {viewMode === 'edit' && activeTab === 'google_business' && (() => {
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

        {viewMode === 'edit' && activeTab === 'facebook' && (() => {
          const f = bundle.content_facebook ?? {};
          const msg = f.message ?? '';
          const firstLine = msg.split('\n')[0] ?? '';
          return (
            <>
              <div style={fieldWrapStyle}>
                <label style={labelStyle}>Texte du post Facebook</label>
                <textarea
                  value={msg}
                  onChange={e => updateField('facebook', 'message', e.target.value)}
                  style={{ ...inputStyle, minHeight: 200 }}
                  disabled={readOnly}
                  placeholder="Laisse vide pour reprendre le texte Google Business. Sinon : une accroche courte sur la première ligne, puis des paragraphes séparés par une ligne vide."
                />
                <div style={{ fontSize: 11, color: C.gray, marginTop: 6, lineHeight: 1.6 }}>
                  {msg
                    ? <>
                        {msg.length} caractères, première ligne {firstLine.length}.
                        {firstLine.length > 120 && (
                          <span style={{ color: C.orange, fontWeight: 700 }}> Facebook coupe vers 120 : raccourcis l'accroche.</span>
                        )}
                      </>
                    : <>Vide : Facebook recevra le texte Google Business, écrit pour le référencement local.</>}
                  <br />
                  Pas de lien dans le texte, la carte de lien est ajoutée automatiquement. Pas de hashtags sur Facebook.
                </div>
              </div>
            </>
          );
        })()}

        {viewMode === 'edit' && activeTab === 'notification' && (() => {
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

      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
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
              <option value="">Selectionne un membre</option>
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
          style={{ width: '100%', padding: 14, borderRadius: 10, border: 'none', fontSize: 14, fontWeight: 800, cursor: sending ? 'not-allowed' : 'pointer', background: sending || !title.trim() || (target === 'one_user' && !userId) ? 'var(--gray-mid)' : C.blue, color: '#fff' }}
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
      background: 'linear-gradient(135deg, var(--cyan), var(--cyan-dark))',
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
          padding: '10px 16px', background: '#fff', color: 'var(--cyan-dark)',
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
  const [privates, setPrivates] = useState([]); // cours privés confirmés de la semaine
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
    const weekStart = fmtDate(monday);
    const weekEnd = fmtDate(sunday);
    const [{ data: resp }, { data: pcrs }] = await Promise.all([
      callAdmin('list_week_courses', pwd, { week_start: weekStart }),
      // Cours privés confirmés de la semaine — lus en direct (policy admin)
      supabase.from('private_course_requests')
        .select('id, user_id, chosen_slot, payment_status, payment_mode, price_chf, profiles:user_id(full_name, email)')
        .eq('status', 'confirmed'),
    ]);
    if (resp) setData(resp);
    setPrivates((pcrs ?? []).filter(r => {
      const d = r.chosen_slot?.date;
      return d && d >= weekStart && d <= weekEnd;
    }));
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
  // Cours privés confirmés, groupés par date de créneau
  const privatesByDate = {};
  for (const p of privates) {
    const d = p.chosen_slot?.date;
    if (!d) continue;
    if (!privatesByDate[d]) privatesByDate[d] = [];
    privatesByDate[d].push(p);
  }
  const dates = [...new Set([...Object.keys(coursesByDate), ...Object.keys(privatesByDate)])].sort();

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
        <button onClick={() => setWeekOffset(0)} style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: 'var(--cyan-light)', color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}>
          Revenir a cette semaine
        </button>
      )}

      {loading ? (
        <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>
      ) : dates.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 32, textAlign: 'center', color: C.gray, boxShadow: '0 1px 6px rgba(0,0,0,0.05)' }}>
          <Icon name="calendar" size={32} color={C.gray} style={{ marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 700 }}>Aucun cours cette semaine</div>
        </div>
      ) : dates.map(date => (
        <div key={date} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: C.dark, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingLeft: 4 }}>
            {fmtDay(date)}
          </div>

          {/* ── Cours privés confirmés du jour ── */}
          {(privatesByDate[date] ?? []).map(p => {
            const slot = p.chosen_slot ?? {};
            const paid = p.payment_status === 'paid' || p.payment_status === 'cash_paid';
            const isCash = p.payment_mode === 'cash';
            return (
              <div key={`pr-${p.id}`} style={{ background: C.card, borderRadius: 12, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: '4px solid #f97316' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                  <div style={{ width: 44, height: 44, background: '#fff7ed', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name="dog" size={22} color="#f97316" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.dark }}>
                      Cours privé · {p.profiles?.full_name ?? p.profiles?.email ?? 'Membre'}
                    </div>
                    <div style={{ fontSize: 12, color: C.gray, marginTop: 2 }}>
                      {slot.start ?? '—'}{slot.end ? ` – ${slot.end}` : ''}
                      {p.price_chf ? ` · ${Number(p.price_chf).toFixed(0)} CHF` : ''}
                    </div>
                  </div>
                  <div style={{ background: paid ? C.greenBg : C.orangeBg, color: paid ? C.green : C.orange, padding: '4px 10px', borderRadius: 99, fontSize: 12, fontWeight: 800 }}>
                    {paid ? 'Payé' : isCash ? 'Cash sur place' : 'À payer'}
                  </div>
                </div>
              </div>
            );
          })}

          {(coursesByDate[date] ?? []).map(course => {
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: (att.length > 0 || course.notes) ? '1px solid var(--gray-bg-alt)' : 'none' }}>
                  <div style={{ width: 44, height: 44, background: accentBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon name={isTheorique ? 'book' : 'users'} size={22} color={accent} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: C.dark, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span>{courseTitle}</span>
                      {isPaid && (
                        <span style={{ background: 'var(--orange-light)', color: '#92400e', padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 800 }}>
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
                  <div style={{ padding: '8px 14px', borderBottom: att.length > 0 ? '1px solid var(--gray-bg-alt)' : 'none', background: customColor ? customColor + '0d' : '#fafafa', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
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
// ─────────────────────────────────────────────────────────────────────────────
// ACCUEIL — vue d'ensemble à l'ouverture : tout ce qui demande ton attention.
// ─────────────────────────────────────────────────────────────────────────────
function AccueilTab({ go }) {
  const [loading, setLoading] = useState(true);
  const [pendingReqs, setPendingReqs] = useState([]);
  const [cashCount, setCashCount] = useState(0);
  const [adhesionsCount, setAdhesionsCount] = useState(0);
  const [todayCourses, setTodayCourses] = useState([]);
  const [attCount, setAttCount] = useState({});

  const todayStr = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const mondayStr = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [reqs, cash, adh, week] = await Promise.all([
        callAdmin('list_requests', null).catch(() => null),
        callAdmin('list_cash_pending', null).catch(() => null),
        supabase.functions.invoke('admin-auth-proxy', { body: { target: 'validate-adhesion', action: 'list', payload: null } }).catch(() => null),
        callAdmin('list_week_courses', null, { week_start: mondayStr() }).catch(() => null),
      ]);
      if (cancelled) return;
      const rq = reqs?.data?.requests ?? [];
      setPendingReqs(rq.filter(r => r.status === 'pending'));
      setCashCount((cash?.data?.items ?? []).length);
      // Adhésions = fonctionnalité club : compteur neutralisé quand le flag est désactivé
      setAdhesionsCount(CLUB_ENABLED ? (adh?.data?.adhesions ?? []).filter(a => a.statut === 'en_attente').length : 0);
      const courses = week?.data?.courses ?? [];
      const atts = week?.data?.attendances ?? [];
      const t = todayStr();
      setTodayCourses(courses.filter(c => c.course_date === t));
      const counts = {};
      for (const a of atts) counts[a.course_id] = (counts[a.course_id] || 0) + 1;
      setAttCount(counts);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const Tile = ({ icon, count, label, color, bg, onClick, hideZero }) => {
    if (hideZero && !count) return null;
    return (
      <button onClick={onClick} style={{
        background: C.card, border: 'none', borderRadius: 16, padding: '18px 16px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)', cursor: 'pointer', textAlign: 'left',
        borderLeft: `5px solid ${count > 0 ? color : '#d1d5db'}`, width: '100%',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: count > 0 ? bg : C.grayBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Icon name={icon} size={21} color={count > 0 ? color : C.gray} /></div>
        <div>
          <div style={{ fontSize: 24, fontWeight: 800, color: count > 0 ? color : C.gray, lineHeight: 1 }}>{count}</div>
          <div style={{ fontSize: 13, color: C.gray, fontWeight: 600, marginTop: 3 }}>{label}</div>
        </div>
      </button>
    );
  };

  const heure = (t) => String(t ?? '').slice(0, 5);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  const rien = pendingReqs.length === 0 && cashCount === 0 && adhesionsCount === 0;

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Tile icon="dog" count={pendingReqs.length} label={`Demande${pendingReqs.length > 1 ? 's' : ''} de cours privé en attente`} color={C.orange} bg={C.orangeBg} onClick={() => go('prives')} />
        <Tile icon="creditCard" count={cashCount} label="À encaisser à la séance" color={C.blue} bg="#dbeafe" onClick={() => go('paiements', 'cash')} />
        {CLUB_ENABLED && <Tile icon="fileText" count={adhesionsCount} label={`Adhésion${adhesionsCount > 1 ? 's' : ''} à valider`} color="#8b5cf6" bg="#ede9fe" onClick={() => go('membres', 'adhesions')} />}
      </div>

      {rien && (
        <div style={{ background: C.greenBg, color: C.green, borderRadius: 14, padding: '14px 18px', fontWeight: 700, fontSize: 14.5 }}>
          Rien en attente, tout est à jour.
        </div>
      )}

      <div style={{ background: C.card, borderRadius: 16, padding: 18, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="calendar" size={16} color="#1F1F20" /> Aujourd'hui</div>
        {todayCourses.length === 0 && <div style={{ color: C.gray, fontSize: 14 }}>Pas de cours aujourd'hui.</div>}
        {todayCourses.map((c) => (
          <button key={c.id} onClick={() => go('cours')} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%', textAlign: 'left',
            background: 'none', border: 'none', borderBottom: '1px solid #f0f0f0',
            padding: '10px 0', cursor: 'pointer',
          }}>
            <div style={{ width: 10, height: 38, borderRadius: 5, background: c.color || C.blue, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14.5 }}>{c.supplement_name || c.title || (c.course_type === 'theorique' ? 'Cours théorique' : 'Cours collectif')}</div>
              <div style={{ fontSize: 12.5, color: C.gray }}>{heure(c.start_time)}{c.end_time ? `–${heure(c.end_time)}` : ''}</div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.blue }}>{attCount[c.id] || 0} inscrit{(attCount[c.id] || 0) > 1 ? 's' : ''}</div>
          </button>
        ))}
      </div>

      <a href="https://admin.caniplus.ch" target="_blank" rel="noreferrer" style={{
        display: 'block', textAlign: 'center', background: C.card, borderRadius: 14, padding: '13px 16px',
        boxShadow: '0 1px 6px rgba(0,0,0,0.06)', color: C.blue, fontWeight: 700, fontSize: 14, textDecoration: 'none',
      }}>
        Compta & factures → admin.caniplus.ch
      </a>
    </div>
  );
}

// ─── Fiches données à un membre ──────────────────────────────────────────────
// Attribution d'une ressource existante à une personne (table
// member_resources) : choisir une fiche du catalogue, ajouter un mot
// facultatif, attribuer. Le membre la retrouve dans « Mes fiches » de son
// espace, même sans premium. Lit et écrit en direct via les policies RLS de
// la migration fiches_membres_2026_08_28 : tant qu'elle n'est pas appliquée,
// la section le dit et reste inerte.
function MemberFichesSection({ memberId, memberName }) {
  const [rows, setRows] = useState(null);
  const [catalogue, setCatalogue] = useState([]);
  const [choix, setChoix] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [pdfTitle, setPdfTitle] = useState('');
  const [pdfNote, setPdfNote] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    const [{ data: mr, error: e1 }, { data: res }] = await Promise.all([
      supabase.from('member_resources')
        .select('id, note, assigned_at, read_at, resource:resource_id (id, title, personnelle, storage_path)')
        .eq('user_id', memberId)
        .order('assigned_at', { ascending: false }),
      supabase.from('resources').select('id, title, personnelle').order('title'),
    ]);
    if (e1) {
      setError('Migration fiches_membres_2026_08_28 pas encore appliquée : ' + e1.message);
      setRows([]);
      return;
    }
    setRows(mr ?? []);
    // Les documents personnels ne sont pas proposes dans le selecteur : ils
    // appartiennent deja a quelqu'un.
    setCatalogue((res ?? []).filter(r => !r.personnelle));
  }, [memberId]);

  useEffect(() => { load(); }, [load]);

  const attribuer = async () => {
    if (!choix || saving) return;
    setSaving(true);
    setError(null);
    const { data: { session } } = await supabase.auth.getSession();
    const { error: err } = await supabase.from('member_resources').insert({
      user_id: memberId,
      resource_id: choix,
      assigned_by: session?.user?.id ?? null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (err) {
      setError(err.code === '23505'
        ? 'Cette fiche est déjà attribuée à ' + memberName + '.'
        : 'Attribution refusée : ' + err.message);
      return;
    }
    setChoix('');
    setNote('');
    load();
  };

  // Retire l'attribution. Pour un document personnel, depose pour cette
  // personne uniquement, on supprime aussi la ressource et le fichier :
  // rien d'autre ne les reference.
  const retirer = async (row) => {
    const { error: err } = await supabase.from('member_resources').delete().eq('id', row.id);
    if (err) { setError('Retrait refusé : ' + err.message); return; }
    if (row.resource?.personnelle) {
      await supabase.from('resources').delete().eq('id', row.resource.id);
      if (row.resource.storage_path) {
        await supabase.storage.from('fiches-personnelles').remove([row.resource.storage_path]);
      }
    }
    load();
  };

  // Depose un PDF personnel : fichier dans le bucket prive, ressource marquee
  // personnelle (jamais dans le catalogue premium), attribution immediate.
  const deposer = async () => {
    if (!pdfFile || uploading) return;
    if (pdfFile.type !== 'application/pdf' && !pdfFile.name.toLowerCase().endsWith('.pdf')) {
      setError('Seuls les PDF sont acceptés ici.');
      return;
    }
    if (pdfFile.size > 25 * 1024 * 1024) {
      setError('Le fichier dépasse 25 Mo. Allège le PDF et réessaie.');
      return;
    }
    setUploading(true);
    setError(null);
    const path = 'perso/' + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())) + '.pdf';
    const { error: upErr } = await supabase.storage.from('fiches-personnelles')
      .upload(path, pdfFile, { contentType: 'application/pdf' });
    if (upErr) {
      setUploading(false);
      setError('Envoi du fichier refusé : ' + upErr.message);
      return;
    }
    const titre = pdfTitle.trim() || pdfFile.name.replace(/\.pdf$/i, '');
    const { data: res, error: resErr } = await supabase.from('resources')
      .insert({ title: titre, type: 'pdf', category: 'perso', personnelle: true, storage_path: path })
      .select('id').single();
    if (resErr || !res) {
      await supabase.storage.from('fiches-personnelles').remove([path]);
      setUploading(false);
      setError('Enregistrement refusé : ' + (resErr?.message ?? 'erreur inconnue'));
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    const { error: mrErr } = await supabase.from('member_resources').insert({
      user_id: memberId,
      resource_id: res.id,
      assigned_by: session?.user?.id ?? null,
      note: pdfNote.trim() || null,
    });
    setUploading(false);
    if (mrErr) { setError('Attribution refusée : ' + mrErr.message); return; }
    setPdfFile(null); setPdfTitle(''); setPdfNote('');
    if (fileRef.current) fileRef.current.value = '';
    load();
  };

  return (
    <>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Fiches données <span style={{ fontWeight: 500, textTransform: 'none' }}>(visibles dans son espace, même sans premium)</span>
      </div>
      {error && (
        <div style={{ background: C.orangeBg, color: C.orange, borderRadius: 10, padding: '8px 12px', fontSize: 12, marginBottom: 10 }}>{error}</div>
      )}
      {rows === null ? (
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Chargement…</div>
      ) : rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: C.gray, marginBottom: 12 }}>Aucune fiche donnée pour l'instant.</div>
      ) : (
        <div style={{ marginBottom: 12 }}>
          {rows.map(r => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, background: '#fff', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', marginBottom: 6 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{r.resource?.title ?? 'Fiche supprimée'}</div>
                <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
                  Donnée le {new Date(r.assigned_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  {' · '}
                  {r.read_at ? 'ouverte le ' + new Date(r.read_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' }) : 'pas encore ouverte'}
                </div>
                {r.note && <div style={{ fontSize: 12, color: C.gray, fontStyle: 'italic', marginTop: 3 }}>« {r.note} »</div>}
              </div>
              <button onClick={() => retirer(r)} title="Retirer cette fiche"
                style={{ background: '#f1f3f5', border: 'none', borderRadius: 8, padding: '5px 9px', fontSize: 11, fontWeight: 700, color: C.gray, cursor: 'pointer', flexShrink: 0 }}>
                Retirer
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'grid', gap: 6, marginBottom: 18 }}>
        <select value={choix} onChange={(e) => setChoix(e.target.value)}
          style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: C.dark, fontFamily: 'inherit', background: '#fff' }}>
          <option value="">Choisir une fiche à donner…</option>
          {catalogue.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {choix && (
          <input type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300}
            placeholder="Un mot pour accompagner la fiche (facultatif)"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        )}
        {choix && (
          <button onClick={attribuer} disabled={saving}
            style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {saving ? '…' : <><Icon name="plus" size={13} /> Donner cette fiche à {memberName}</>}
          </button>
        )}
      </div>

      {/* Dépôt d'un PDF personnel : hors catalogue, visible par ce membre
          seulement, stocké dans le bucket privé fiches-personnelles. */}
      <div style={{ display: 'grid', gap: 6, marginBottom: 18, paddingTop: 12, borderTop: '1px dashed var(--border)' }}>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.gray }}>
          Ou dépose ton propre PDF, visible par {memberName} uniquement
        </div>
        <input ref={fileRef} type="file" accept="application/pdf,.pdf"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setPdfFile(f);
            if (f) setPdfTitle(f.name.replace(/\.pdf$/i, ''));
          }}
          style={{ fontSize: 12.5, color: C.gray }} />
        {pdfFile && (
          <input type="text" value={pdfTitle} onChange={(e) => setPdfTitle(e.target.value)} maxLength={120}
            placeholder="Titre du document"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        )}
        {pdfFile && (
          <input type="text" value={pdfNote} onChange={(e) => setPdfNote(e.target.value)} maxLength={300}
            placeholder="Un mot pour accompagner le document (facultatif)"
            style={{ width: '100%', padding: '9px 10px', borderRadius: 10, border: '1.5px solid var(--border)', fontSize: 13, color: C.dark, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        )}
        {pdfFile && (
          <button onClick={deposer} disabled={uploading}
            style={{ width: '100%', padding: '8px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontSize: 13, fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {uploading ? 'Envoi du fichier…' : <><Icon name="upload" size={13} /> Déposer pour {memberName}</>}
          </button>
        )}
      </div>
    </>
  );
}

// ─── Onglet Présences ────────────────────────────────────────────────────────
// Pointage des présences aux cours collectifs, pensé pour l'usage réel :
// Tiffany recopie une fois par semaine, depuis son téléphone, les messages
// WhatsApp envoyés par les éducatrices après chaque cours. Elle saisit donc
// plusieurs cours d'affilée en changeant de date entre deux : pas de bouton
// « enregistrer », chaque case écrit tout de suite, et changer de cours ne
// perd rien.
// C'est le seul onglet ouvert au rôle educatrice : il ne passe PAS par
// admin-auth-proxy (réservé au rôle admin) mais lit et écrit en direct via
// les policies RLS (lecture profiles/dogs/group_courses, écriture
// course_attendance par is_educatrice()).
function PresencesTab() {
  const [meId, setMeId] = useState(null);
  const [selectedDate, setSelectedDate] = useState('');   // YYYY-MM-DD
  const [weekCourses, setWeekCourses] = useState([]);     // cours des 7 derniers jours, pour les pastilles
  const [pointedCourseIds, setPointedCourseIds] = useState(new Set()); // cours avec au moins 1 ligne
  const [dayCourses, setDayCourses] = useState([]);
  const [courseId, setCourseId] = useState(null);
  const [members, setMembers] = useState([]);
  const [dogsByOwner, setDogsByOwner] = useState({});
  const [attendance, setAttendance] = useState({});       // user_id → ligne course_attendance
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingCourse, setLoadingCourse] = useState(false);
  const [savingIds, setSavingIds] = useState({});         // user_id → écriture en cours
  const [error, setError] = useState(null);

  // Date locale YYYY-MM-DD, pas de toISOString qui décale d'un jour en CET/CEST
  const fmtDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // Chargement initial : session, membres, chiens, cours récents.
  // Ouvre par défaut le cours passé le plus récent, pas aujourd'hui à vide.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const today = fmtDate(new Date());
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      const [{ data: { session } }, { data: profs }, { data: dogs }, { data: lastCourse }, { data: recent }] = await Promise.all([
        supabase.auth.getSession(),
        supabase.from('profiles').select('id, full_name, role, user_type').eq('user_type', 'member'),
        supabase.from('dogs').select('id, owner_id'),
        supabase.from('group_courses').select('course_date').lte('course_date', today)
          .order('course_date', { ascending: false }).limit(1).maybeSingle(),
        supabase.from('group_courses').select('id, course_date, start_time, end_time, course_type, title')
          .gte('course_date', fmtDate(weekAgo)).lte('course_date', today)
          .order('course_date', { ascending: false }),
      ]);
      if (cancelled) return;
      setMeId(session?.user?.id ?? null);
      const membres = (profs ?? [])
        .filter(p => p.role !== 'admin' && p.role !== 'educatrice')
        .sort((a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? '', 'fr'));
      setMembers(membres);
      const byOwner = {};
      for (const d of (dogs ?? [])) (byOwner[d.owner_id] = byOwner[d.owner_id] ?? []).push(d.id);
      setDogsByOwner(byOwner);
      setWeekCourses(recent ?? []);
      if ((recent ?? []).length > 0) {
        const { data: pointed } = await supabase.from('course_attendance')
          .select('course_id').in('course_id', recent.map(c => c.id));
        if (cancelled) return;
        setPointedCourseIds(new Set((pointed ?? []).map(r => r.course_id)));
      }
      setSelectedDate(lastCourse?.course_date ?? today);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  // À chaque changement de date : les cours du jour, puis le pointage existant.
  useEffect(() => {
    if (!selectedDate) return;
    let cancelled = false;
    (async () => {
      setLoadingCourse(true);
      const { data: courses } = await supabase.from('group_courses')
        .select('id, course_date, start_time, end_time, course_type, title, color')
        .eq('course_date', selectedDate).order('start_time');
      if (cancelled) return;
      setDayCourses(courses ?? []);
      setCourseId((courses ?? [])[0]?.id ?? null);
      setLoadingCourse(false);
    })();
    return () => { cancelled = true; };
  }, [selectedDate]);

  // Ce qui est déjà pointé apparaît coché au chargement : on peut corriger
  // une semaine plus tard sans rien casser.
  useEffect(() => {
    if (!courseId) { setAttendance({}); return; }
    let cancelled = false;
    (async () => {
      const { data: rows } = await supabase.from('course_attendance')
        .select('id, user_id, present, dog_ids').eq('course_id', courseId);
      if (cancelled) return;
      const map = {};
      for (const r of (rows ?? [])) map[r.user_id] = r;
      setAttendance(map);
    })();
    return () => { cancelled = true; };
  }, [courseId]);

  // Cocher écrit tout de suite : present, present_marked_at, present_marked_by,
  // et les chiens du membre si la ligne se crée. Décocher passe present à false
  // sans supprimer la ligne : on garde qui a pointé quoi, et quand.
  const toggle = async (member) => {
    if (!courseId || savingIds[member.id]) return;
    const row = attendance[member.id];
    const next = !(row?.present);
    setSavingIds(s => ({ ...s, [member.id]: true }));
    setError(null);
    const payload = {
      course_id: courseId,
      user_id: member.id,
      present: next,
      present_marked_at: new Date().toISOString(),
      present_marked_by: meId,
      ...(row ? {} : { dog_ids: dogsByOwner[member.id] ?? [] }),
    };
    const { data, error: err } = await supabase.from('course_attendance')
      .upsert(payload, { onConflict: 'course_id,user_id' })
      .select('id, user_id, present, dog_ids').maybeSingle();
    setSavingIds(s => ({ ...s, [member.id]: false }));
    if (err) { setError('Écriture refusée : ' + err.message); return; }
    setAttendance(a => ({ ...a, [member.id]: data ?? { ...row, ...payload } }));
    if (next) setPointedCourseIds(prev => new Set(prev).add(courseId));
  };

  const presentCount = members.filter(m => attendance[m.id]?.present).length;
  const needle = search.trim().toLowerCase();
  const shown = needle
    ? members.filter(m => (m.full_name ?? '').toLowerCase().includes(needle))
    : members;
  // Dates de la semaine écoulée sans aucun pointage → pastille discrète
  const dayLabel = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' });
  const datesRecents = [...new Set(weekCourses.map(c => c.course_date))];
  const dateSansPointage = (d) => weekCourses.filter(c => c.course_date === d).every(c => !pointedCourseIds.has(c.id));

  if (loading) return <div style={{ padding: 30, textAlign: 'center', color: C.gray, fontSize: 13.5 }}>Chargement…</div>;

  return (
    <div style={{ display: 'grid', gap: 14 }}>

      {/* Sélecteur de date + cours récents avec pastille sur ce qui reste à saisir */}
      <div style={{ background: C.card, borderRadius: 14, padding: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <label htmlFor="presence-date" style={{ fontSize: 13, fontWeight: 700 }}>Date du cours</label>
          <input
            id="presence-date" type="date" value={selectedDate}
            onChange={(e) => e.target.value && setSelectedDate(e.target.value)}
            style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' }}
          />
        </div>
        {datesRecents.length > 0 && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            {datesRecents.map(d => (
              <button key={d} onClick={() => setSelectedDate(d)} style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
                fontSize: 12.5, fontWeight: 700,
                background: selectedDate === d ? C.dark : C.grayBg,
                color: selectedDate === d ? '#fff' : C.gray,
              }}>
                {dayLabel(d)}
                {dateSansPointage(d) && (
                  <span title="Aucun pointage saisi" style={{ width: 7, height: 7, borderRadius: 999, background: C.orange, display: 'inline-block' }} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Cours de la date choisie ; s'il y en a plusieurs, on choisit */}
      {loadingCourse ? (
        <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13.5 }}>Chargement…</div>
      ) : dayCourses.length === 0 ? (
        <div style={{ background: C.card, borderRadius: 14, padding: 20, textAlign: 'center', color: C.gray, fontSize: 13.5 }}>
          Aucun cours à cette date.
        </div>
      ) : (
        <>
          {dayCourses.length > 1 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {dayCourses.map(c => (
                <button key={c.id} onClick={() => setCourseId(c.id)} style={{
                  border: 'none', borderRadius: 999, padding: '8px 14px', cursor: 'pointer',
                  fontWeight: 700, fontSize: 13,
                  background: courseId === c.id ? C.dark : C.card,
                  color: courseId === c.id ? '#fff' : C.gray,
                  boxShadow: courseId === c.id ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  {c.start_time} · {c.title || c.course_type}
                </button>
              ))}
            </div>
          )}
          {dayCourses.length === 1 && (
            <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gray }}>
              {dayCourses[0].start_time} à {dayCourses[0].end_time} · {dayCourses[0].title || dayCourses[0].course_type}
            </div>
          )}

          {/* Compteur, recherche, liste : une ligne, un nom, une case large */}
          <div style={{ background: C.card, borderRadius: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid #eef0f2', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 14 }}>{presentCount} présent{presentCount > 1 ? 's' : ''} sur {members.length} membres</strong>
              <input
                type="search" placeholder="Chercher un membre…" value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ flex: 1, minWidth: 160, border: '1px solid #e5e7eb', borderRadius: 10, padding: '8px 10px', fontSize: 14, fontFamily: 'inherit' }}
              />
            </div>
            {error && (
              <div style={{ padding: '10px 14px', fontSize: 13, color: C.red, background: C.redBg }}>{error}</div>
            )}
            {shown.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: C.gray, fontSize: 13.5 }}>Aucun membre trouvé.</div>
            ) : shown.map(m => {
              const checked = !!attendance[m.id]?.present;
              return (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '13px 14px', borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                  background: checked ? '#f0fdf4' : 'transparent',
                  opacity: savingIds[m.id] ? 0.6 : 1,
                }}>
                  <input
                    type="checkbox" checked={checked} onChange={() => toggle(m)}
                    disabled={!!savingIds[m.id]}
                    style={{ width: 24, height: 24, accentColor: C.green, cursor: 'pointer', flexShrink: 0 }}
                  />
                  <span style={{ fontSize: 14.5, fontWeight: checked ? 700 : 500 }}>{m.full_name || '(sans nom)'}</span>
                </label>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// Pills de sous-navigation à l'intérieur d'une section fusionnée
function SubTabs({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
      {options.map(([id, label, badge]) => (
        <button key={id} onClick={() => onChange(id)} style={{
          border: 'none', borderRadius: 999, padding: '8px 16px', cursor: 'pointer',
          fontWeight: 700, fontSize: 13.5,
          background: value === id ? C.dark : C.card,
          color: value === id ? '#fff' : C.gray,
          boxShadow: value === id ? 'none' : '0 1px 4px rgba(0,0,0,0.06)',
        }}>
          {label}{badge > 0 ? ` (${badge})` : ''}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN — connexion par compte (role admin), navigation latérale, 7 sections.
// ─────────────────────────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [authState, setAuthState] = useState('loading'); // loading | no_session | not_admin | ok
  const [role, setRole] = useState(null); // 'admin' | 'educatrice' une fois la session vérifiée
  const [tab, setTab] = useState('accueil');
  const [subTab, setSubTab] = useState({});
  const [demandesBadge, setDemandesBadge] = useState(0);
  const [adhesionsBadge, setAdhesionsBadge] = useState(0);
  const [notifs, setNotifs] = useState([]);
  const [notifsUnread, setNotifsUnread] = useState(0);
  const [notifsOpen, setNotifsOpen] = useState(false);

  // Vérifie la session + le rôle admin du compte (plus de mot de passe séparé)
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (cancelled) return;
        if (!session) { setAuthState('no_session'); return; }
        const { data: prof } = await supabase.from('profiles').select('role').eq('id', session.user.id).maybeSingle();
        if (cancelled) return;
        setRole(prof?.role ?? null);
        // Le rôle educatrice n'ouvre QUE le pointage des présences : il
        // arrive directement sur cet onglet, la navigation ne montre rien
        // d'autre, et le proxy admin refuse de toute façon ce rôle (403).
        if (prof?.role === 'educatrice') setTab('presences');
        setAuthState(prof?.role === 'admin' || prof?.role === 'educatrice' ? 'ok' : 'not_admin');
      } catch (_e) {
        if (!cancelled) setAuthState('no_session');
      }
    };
    check();
    // ⚠️ setTimeout obligatoire : exécuter des requêtes async directement dans le
    // callback onAuthStateChange provoque un deadlock connu de supabase-js v2.
    const { data: sub } = supabase.auth.onAuthStateChange(() => { setTimeout(check, 0); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, []);

  // Notifs admin (cloche) + badge adhésions, toutes les 60s. Admin seulement,
  // le proxy admin-auth-proxy refuse le rôle educatrice.
  useEffect(() => {
    if (authState !== 'ok' || role !== 'admin') return;
    let cancelled = false;
    const load = async () => {
      try {
        const r = await callAdmin('list_admin_notifications', null, { limit: 30 });
        if (cancelled) return;
        const data = r?.data ?? r;
        if (data?.notifications) setNotifs(data.notifications);
        if (typeof data?.unread_count === 'number') setNotifsUnread(data.unread_count);
      } catch (_) {}
      try {
        const a = await supabase.functions.invoke('admin-auth-proxy', { body: { target: 'validate-adhesion', action: 'list', payload: null } });
        if (cancelled) return;
        setAdhesionsBadge(CLUB_ENABLED ? (a?.data?.adhesions ?? []).filter(x => x.statut === 'en_attente').length : 0);
      } catch (_) {}
    };
    load();
    const t = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, [authState, role]);

  const markNotifRead = async (id) => {
    setNotifs((arr) => arr.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n));
    setNotifsUnread((c) => Math.max(0, c - 1));
    try { await callAdmin('mark_admin_notification_read', null, { notification_id: id }); } catch (_) {}
  };
  const markAllRead = async () => {
    setNotifs((arr) => arr.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }));
    setNotifsUnread(0);
    try { await callAdmin('mark_admin_notification_read', null, { mark_all: true }); } catch (_) {}
  };

  // Pleine largeur (désactive max-width 430px du #root)
  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  const go = (t, s) => {
    setTab(t);
    if (s) setSubTab((m) => ({ ...m, [t]: s }));
  };

  // ── États de connexion ──
  if (authState === 'loading') {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.gray }}>Chargement…</div>;
  }
  if (authState === 'no_session' || authState === 'not_admin') {
    return (
      <div style={{ minHeight: '100dvh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400, textAlign: 'center' }}>
          <div style={{ marginBottom: 12 }}><Icon name="lock" size={36} color="#2BABE1" /></div>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>Espace administration</div>
          <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.6, marginBottom: 20 }}>
            {authState === 'no_session'
              ? 'Connecte-toi avec ton compte CaniPlus habituel pour accéder à l\u2019administration.'
              : 'Ce compte n\u2019a pas les droits d\u2019administration. Connecte-toi avec le compte admin.'}
          </p>
          <a href="/" style={{ display: 'inline-block', background: C.blue, color: '#fff', borderRadius: 12, padding: '12px 26px', fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>
            {authState === 'no_session' ? 'Se connecter' : 'Changer de compte'}
          </a>
        </div>
      </div>
    );
  }

  // Le rôle educatrice ne voit que le pointage des présences : ni membres,
  // ni paiements, ni adhésions, ni le reste.
  const sections = role === 'educatrice' ? [
    { id: 'presences',  label: 'Présences',    icon: 'check' },
  ] : [
    { id: 'accueil',    label: 'Accueil',      icon: 'home' },
    { id: 'membres',    label: 'Membres',      icon: 'users', badge: adhesionsBadge },
    { id: 'cours',      label: 'Cours',        icon: 'calendar' },
    { id: 'presences',  label: 'Présences',    icon: 'check' },
    { id: 'prives',     label: 'Cours privés', icon: 'dog', badge: demandesBadge },
    { id: 'paiements',  label: 'Paiements',    icon: 'creditCard' },
    { id: 'contenu',    label: 'Contenu',      icon: 'edit' },
    { id: 'messagerie', label: 'Messagerie',   icon: 'message' },
  ];
  const sectionTitle = sections.find(s => s.id === tab)?.label ?? '';
  const st = (t, def) => subTab[t] ?? def;

  const NAV_W = 86;

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      {/* ── Navigation latérale gauche ── */}
      <nav style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: NAV_W, zIndex: 40,
        background: C.dark, display: 'flex', flexDirection: 'column', alignItems: 'center',
        padding: '14px 0 12px', gap: 2, overflowY: 'auto',
      }}>
        <div style={{ color: '#fff', fontWeight: 900, fontSize: 16, marginBottom: 12, textAlign: 'center', lineHeight: 1.1 }}>
          C+<div style={{ fontSize: 8.5, fontWeight: 700, color: 'rgba(255,255,255,0.55)', letterSpacing: 1 }}>ADMIN</div>
        </div>
        {sections.map((s) => (
          <button key={s.id} onClick={() => setTab(s.id)} style={{
            position: 'relative', width: NAV_W - 14, border: 'none', cursor: 'pointer',
            background: tab === s.id ? 'rgba(255,255,255,0.12)' : 'transparent',
            borderRadius: 12, padding: '9px 0 7px', display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 3,
            color: tab === s.id ? '#fff' : 'rgba(255,255,255,0.55)',
            borderLeft: `3px solid ${tab === s.id ? C.blue : 'transparent'}`,
          }}>
            <Icon name={s.icon} size={19} color={tab === s.id ? '#fff' : 'rgba(255,255,255,0.55)'} />
            <span style={{ fontSize: 9.5, fontWeight: 800 }}>{s.label}</span>
            {s.badge > 0 && (
              <span style={{ position: 'absolute', top: 4, right: 8, background: C.red, color: '#fff', fontSize: 9.5, fontWeight: 800, borderRadius: 999, minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{s.badge}</span>
            )}
          </button>
        ))}
        <button onClick={() => supabase.auth.signOut()} style={{
          marginTop: 'auto', background: 'none', border: 'none', cursor: 'pointer',
          color: 'rgba(255,255,255,0.55)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '8px 0',
        }}>
          <Icon name="logout" size={18} color="rgba(255,255,255,0.55)" />
          <span style={{ fontSize: 9.5, fontWeight: 800 }}>Quitter</span>
        </button>
      </nav>

      {/* ── Barre du haut : titre + cloche ── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 30, background: C.bg, marginLeft: NAV_W, padding: '14px 18px 8px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 19, fontWeight: 900 }}>{sectionTitle}</div>
          {role === 'admin' && <div style={{ position: 'relative' }}>
            <button onClick={() => setNotifsOpen(o => !o)} aria-label="Notifications" style={{
              background: C.card, border: 'none', borderRadius: 12, width: 40, height: 40,
              cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', position: 'relative',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Icon name="bell" size={18} color="#1F1F20" />
              {notifsUnread > 0 && (
                <span style={{ position: 'absolute', top: -4, right: -4, background: C.red, color: '#fff', fontSize: 10, fontWeight: 800, borderRadius: 999, minWidth: 17, height: 17, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{notifsUnread}</span>
              )}
            </button>
            {notifsOpen && (
              <div style={{ position: 'absolute', right: 0, top: 48, width: 'min(360px, 84vw)', maxHeight: 420, overflowY: 'auto', background: C.card, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', zIndex: 50, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 8px 10px' }}>
                  <strong style={{ fontSize: 14 }}>Notifications</strong>
                  {notifsUnread > 0 && <button onClick={markAllRead} style={{ background: 'none', border: 'none', color: C.blue, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Tout marquer lu</button>}
                </div>
                {notifs.length === 0 && <div style={{ padding: 16, color: C.gray, fontSize: 13.5, textAlign: 'center' }}>Aucune notification</div>}
                {notifs.map((n) => (
                  <button key={n.id} onClick={() => !n.read_at && markNotifRead(n.id)} style={{
                    display: 'block', width: '100%', textAlign: 'left', background: n.read_at ? 'transparent' : '#eff8fd',
                    border: 'none', borderRadius: 10, padding: '9px 10px', cursor: 'pointer', marginBottom: 2,
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: n.read_at ? 600 : 800 }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: 12.5, color: C.gray, marginTop: 2 }}>{n.body}</div>}
                    <div style={{ fontSize: 11, color: 'var(--gray-mid)', marginTop: 3 }}>{new Date(n.created_at).toLocaleString('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
                  </button>
                ))}
              </div>
            )}
          </div>}
        </div>
      </div>

      {/* ── Contenu ── */}
      {/* Chaque section admin est aussi conditionnée au rôle : une educatrice
          ne rend QUE l'onglet Présences, même si tab prenait une autre valeur. */}
      <div style={{ marginLeft: NAV_W, padding: '8px 18px 60px' }}>
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          {role === 'admin' && <AdminPushBanner />}

          {tab === 'presences' && <PresencesTab />}

          {role === 'admin' && tab === 'accueil' && <AccueilTab go={go} />}

          {role === 'admin' && tab === 'membres' && (
            <>
              {/* Sous-onglet Adhésions (demandes d'adhésion au club) : masqué quand le flag club est désactivé */}
              <SubTabs value={st('membres', 'liste')} onChange={(v) => setSubTab(m => ({ ...m, membres: v }))}
                options={CLUB_ENABLED ? [['liste', 'Membres'], ['adhesions', 'Adhésions', adhesionsBadge]] : [['liste', 'Membres']]} />
              {(st('membres', 'liste') === 'liste' || !CLUB_ENABLED) ? <MembresTab pwd={null} /> : <AdhesionsTab pwd={null} />}
            </>
          )}

          {/* « Gérer le planning » (cours collectifs du club) retiré de la nav
              à la demande de Tiffany — le composant PlanningTab reste dans le
              code si le club revient un jour. */}
          {role === 'admin' && tab === 'cours' && <CoursSemaineTab pwd={null} />}

          {role === 'admin' && tab === 'prives' && <DemandesTab pwd={null} onPendingCount={setDemandesBadge} />}

          {role === 'admin' && tab === 'paiements' && (
            <>
              <SubTabs value={st('paiements', 'cash')} onChange={(v) => setSubTab(m => ({ ...m, paiements: v }))}
                options={[['cash', 'À encaisser'], ['historique', 'Historique']]} />
              {st('paiements', 'cash') === 'cash'
                ? <div style={{ display: 'grid', gap: 16 }}><CashPaymentsList pwd={null} /><PaymentOptionsEditor pwd={null} /></div>
                : <PaiementsTab pwd={null} />}
            </>
          )}

          {role === 'admin' && tab === 'contenu' && (
            <>
              {/* Sous-onglet Défis masqué quand les défis sont fermés (DEFIS_ENABLED) */}
              <SubTabs value={st('contenu', 'editorial')} onChange={(v) => setSubTab(m => ({ ...m, contenu: v }))}
                options={[['editorial', 'Éditorial'], ['blog', 'Blog'], ['soirees', 'Soirées'], ...(DEFIS_ENABLED ? [['defis', 'Défis']] : [])]} />
              {st('contenu', 'editorial') === 'editorial' ? <EditorialTab pwd={null} />
                : st('contenu', 'editorial') === 'soirees' ? <SoireesAdminTab />
                : st('contenu', 'editorial') === 'defis' ? (DEFIS_ENABLED ? <DefisAdminTab /> : <EditorialTab pwd={null} />)
                : <BlogTab pwd={null} />}
            </>
          )}

          {role === 'admin' && tab === 'messagerie' && <MessagerieTab pwd={null} />}
        </div>
      </div>
    </div>
  );
}
