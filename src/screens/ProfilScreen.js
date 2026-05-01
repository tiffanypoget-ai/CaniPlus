// src/screens/ProfilScreen.js
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PaiementModal from '../components/PaiementModal';
import ResiliationModal from '../components/ResiliationModal';
import DogEditModal from '../components/DogEditModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import DocumentsModal from '../components/DocumentsModal';
import { usePremium } from '../hooks/usePremium';
import { usePushNotifications } from '../hooks/usePushNotifications';
import Icon from '../components/Icons';

export default function ProfilScreen() {
  const { profile, signOut, refreshProfile } = useAuth();

  const { isPremium, statusLabel: premiumLabel } = usePremium();
  const [dogs, setDogs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [nextPrivate, setNextPrivate] = useState(null);         // prochain cours privé
  const [privateRequest, setPrivateRequest] = useState(null);   // demande cours privé en cours
  const [selectedSub, setSelectedSub] = useState(null);         // subscription à payer
  const [resiliationTarget, setResiliationTarget] = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState(null);
  const [dogModal, setDogModal] = useState(null);               // null | 'add' | dog object
  const [cotisationLoading,    setCotisationLoading]    = useState(false);
  const [privateLessonLoading, setPrivateLessonLoading] = useState(false);
  const [payments,             setPayments]             = useState([]);
  const [totalCourses,         setTotalCourses]         = useState(0);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  // Le toggle notifs est piloté par le vrai état d'abonnement push (table
  // push_subscriptions côté serveur), PAS par un flag localStorage qui
  // mentait. usePushNotifications gère permission + subscribe + POST.
  const push = usePushNotifications();
  const fileInputRef = useRef(null);

  const loadData = async () => {
    if (!profile) return;
    // Chiens
    supabase.from('dogs').select('*').eq('owner_id', profile.id)
      .then(({ data }) => { if (data) setDogs(data); });
    // Abonnements
    supabase.from('subscriptions').select('*').eq('user_id', profile.id)
      .then(({ data }) => { if (data) setSubscriptions(data); });
    // Paiements (historique)
    supabase.from('payments').select('*').eq('user_id', profile.id)
      .order('created_at', { ascending: false }).limit(10)
      .then(({ data }) => { if (data) setPayments(data); });
    // Nombre total de cours suivis (présences)
    supabase.from('course_attendance').select('id', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .then(({ count }) => { if (count != null) setTotalCourses(count); });
    // Demande de cours privé en cours
    supabase.from('private_course_requests').select('*')
      .eq('user_id', profile.id)
      .in('status', ['pending', 'confirmed'])
      .order('created_at', { ascending: false }).limit(1)
      .then(({ data }) => { if (data?.length) setPrivateRequest(data[0]); else setPrivateRequest(null); });
    // Prochain cours privé inscrit
    supabase.from('enrollments').select('course_id')
      .eq('user_id', profile.id).not('status', 'eq', 'cancelled')
      .then(async ({ data: enrollments }) => {
        if (!enrollments?.length) return;
        const ids = enrollments.map(e => e.course_id);
        const { data: courses } = await supabase.from('courses').select('*')
          .in('id', ids).eq('type', 'prive')
          .gte('date_start', new Date().toISOString())
          .order('date_start').limit(1);
        if (courses?.length) setNextPrivate(courses[0]);
      });
  };

  useEffect(() => {
    loadData();
    setAvatarUrl(profile?.avatar_url ?? null);
  }, [profile]);

  // ── Helpers ────────────────────────────────────────────────────────
  const memberSince = profile?.member_since
    ? new Date(profile.member_since).getFullYear()
    : new Date().getFullYear();

  const cotisation    = subscriptions.find(s => s.type === 'cotisation_annuelle');
  const privateLesson = subscriptions.find(s => s.type === 'lecon_privee');
  const remaining     = privateLesson
    ? (privateLesson.private_lessons_total ?? 0) - (privateLesson.private_lessons_used ?? 0)
    : 0;

  const premiumCancelAt      = profile?.premium_cancel_at ? new Date(profile.premium_cancel_at) : null;
  const isPremiumCancelling  = !!(premiumCancelAt && isPremium);
  const cotisationCancelled  = cotisation?.renew_cancelled === true;

  const currentYear = new Date().getFullYear();
  const courseType  = profile?.course_type ?? 'group';

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const fmtTime = (iso) => iso
    ? new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' })
    : null;

  // Fallback si valid_until est null : 31 décembre de l'année en cours (ou de l'année de la cotisation)
  const cotisationValidUntil = cotisation?.valid_until
    ? fmtDate(cotisation.valid_until)
    : `31 décembre ${cotisation?.year ?? currentYear}`;

  // ── Cotisation ─────────────────────────────────────────────────────
  const handlePayCotisation = async () => {
    if (cotisationLoading) return;
    setCotisationLoading(true);
    try {
      let sub = cotisation;
      if (!sub) {
        // Créer une subscription pending si elle n'existe pas encore
        const { data } = await supabase.from('subscriptions').insert({
          user_id: profile.id,
          type: 'cotisation_annuelle',
          status: 'pending',
          year: currentYear,
        }).select().single();
        sub = data;
        await loadData();
      }
      if (sub) setSelectedSub(sub);
    } finally {
      setCotisationLoading(false);
    }
  };

  // ── Leçon privée ──────────────────────────────────────────────────
  const handlePayPrivateLesson = async () => {
    if (privateLessonLoading) return;
    // Le paiement n'est possible que si la subscription existe ET a un lesson_date (confirmé par admin)
    if (!privateLesson || !privateLesson.lesson_date) return;
    setPrivateLessonLoading(true);
    try {
      setSelectedSub(privateLesson);
    } finally {
      setPrivateLessonLoading(false);
    }
  };

  // ── Type de cours ──────────────────────────────────────────────────
  const handleCourseTypeChange = async (newType) => {
    if (!profile) return;
    await supabase.from('profiles').update({ course_type: newType }).eq('id', profile.id);
    if (refreshProfile) refreshProfile();
  };

  // ── Avatar upload ──────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    setAvatarLoading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData?.publicUrl + '?t=' + Date.now(); // cache bust
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', profile.id);
      setAvatarUrl(publicUrl);
    } catch (err) {
      console.error('Avatar upload error:', err);
    } finally {
      setAvatarLoading(false);
    }
  };

  // ── Notifications toggle ───────────────────────────────────────────
  // Le vrai abonnement web push (qui crée la ligne dans push_subscriptions
  // côté serveur, condition pour recevoir les notifs envoyées par l'agent
  // éditorial). On utilise le hook usePushNotifications qui :
  //   1. Demande la permission navigateur si nécessaire
  //   2. S'abonne via PushManager.subscribe() avec la VAPID key
  //   3. POST la subscription à l'edge function save-push-subscription
  const handleToggleNotif = async () => {
    if (push.loading) return;
    if (push.subscribed) {
      await push.unsubscribe();
    } else {
      const ok = await push.subscribe();
      if (!ok && push.permission === 'denied') {
        alert(
          'Les notifications sont bloquées dans ton navigateur. ' +
          'Pour les réactiver : ouvre les paramètres du site (l\'icône à gauche de l\'adresse) ' +
          'puis autorise les notifications.'
        );
      }
    }
  };

  // ── Premium ────────────────────────────────────────────────────────
  const handleSubscribePremium = async () => {
    setPremiumLoading(true);
    setPremiumError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: { type: 'premium_mensuel', user_id: profile.id, user_email: profile.email },
      });
      if (fnError) throw fnError;
      if (data?.url) window.location.href = data.url;
      else throw new Error('Lien de paiement non reçu');
    } catch (e) {
      setPremiumError('Erreur. Réessaie dans quelques secondes.');
      setPremiumLoading(false);
    }
  };

  const handleSignOut = () => {
    if (window.confirm('Voulez-vous vraiment vous déconnecter ?')) signOut();
  };

  const handlePaymentSuccess = async () => {
    setSelectedSub(null);
    await loadData();
    await refreshProfile();
  };

  const handleResiliationSuccess = async () => {
    setResiliationTarget(null);
    await loadData();
    await refreshProfile();
  };

  // ── Row component ──────────────────────────────────────────────────
  const Row = ({ icon, title, sub, badge, badgeColor, badgeBg, onClick, danger, payable, rightEl }) => (
    <div
      onClick={onClick}
      style={{
        background: '#f4f6f8', borderRadius: 14, padding: 14,
        display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
        cursor: onClick ? 'pointer' : 'default',
        border: payable ? '2px solid #fde68a' : '2px solid transparent',
        transition: 'border-color 0.2s',
      }}
    >
      <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#ef4444' : '#1F1F20' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub}</div>}
      </div>
      {rightEl}
      {badge && <div style={{ background: badgeBg, color: badgeColor, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, flexShrink: 0 }}>{badge}</div>}
      {payable && <div style={{ background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 10, flexShrink: 0, boxShadow: '0 2px 8px rgba(43,171,225,0.3)' }}>Payer →</div>}
      {onClick && !badge && !danger && !payable && !rightEl && <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>}
    </div>
  );

  // ── Toggle switch ──────────────────────────────────────────────────
  const Toggle = ({ on }) => (
    <div style={{
      width: 44, height: 24, borderRadius: 99,
      background: on ? '#2BABE1' : '#d1d5db',
      position: 'relative', transition: 'background 0.25s', flexShrink: 0,
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? 22 : 2,
        width: 20, height: 20, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
        transition: 'left 0.25s',
      }} />
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">

      {/* ── Header / Avatar ─────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 32px', textAlign: 'center' }}>
        {/* Avatar cliquable */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{ position: 'relative', width: 86, height: 86, margin: '0 auto 12px', cursor: 'pointer' }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="avatar"
              onError={() => setAvatarUrl(null)}
              style={{ width: 86, height: 86, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.2)' }}
            />
          ) : (
            <div style={{ width: 86, height: 86, background: 'rgba(43,171,225,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, border: '3px solid rgba(255,255,255,0.2)' }}>
              <Icon name="user" size={36} color="rgba(43,171,225,0.7)" />
            </div>
          )}
          {/* Badge caméra */}
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 26, height: 26, background: '#2BABE1', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            border: '2px solid #1F1F20',
          }}>
            {avatarLoading ? '…' : <Icon name="mail" size={13} color="#1F1F20" />}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />

        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{profile?.full_name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{profile?.email}</div>
      </div>

      <div style={{ padding: '0 16px 100px' }}>

        {/* ── Chiens ──────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Mes chiens</div>
            {dogs.length > 0 && (
              <button
                onClick={() => setDogModal('add')}
                style={{ background: '#e8f7fd', color: '#2BABE1', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                + Ajouter
              </button>
            )}
          </div>

          {dogs.length === 0 ? (
            <div
              onClick={() => setDogModal('add')}
              style={{ background: '#f4f6f8', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 12, border: '2px dashed #e5e7eb', cursor: 'pointer' }}
            >
              <Icon name="plus" size={20} color="#6b7280" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Ajouter un chien</span>
            </div>
          ) : dogs.map(dog => (
            <div key={dog.id} style={{ background: '#fff', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, overflow: 'hidden' }}>
                {dog.photo_url
                  ? <img src={dog.photo_url} alt={dog.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <Icon name="dog" size={28} color="#fbbf24" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {dog.breed ?? 'Race non renseignée'}
                  {dog.sex ? ` · ${dog.sex === 'M' ? 'Mâle' : dog.sex === 'F' ? 'Femelle' : dog.sex}` : ''}
                  {dog.birth_date ? ` · ${new Date(dog.birth_date + 'T00:00:00').toLocaleDateString('fr-CH')}` : dog.birth_year ? ` · né en ${dog.birth_year}` : ''}
                  {dog.reproductive_status ? ` · ${dog.reproductive_status}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: dog.vaccinated ? '#dcfce7' : '#fef3c7', color: dog.vaccinated ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                    {dog.vaccinated ? 'Vacciné ✓' : 'Vaccin à vérifier'}
                  </span>
                  {totalCourses > 0 && (
                    <span style={{ background: '#e8f7fd', color: '#2BABE1', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Icon name="paw" size={11} color="#2BABE1" /> {totalCourses} cours suivi{totalCourses > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setDogModal(dog)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              ><Icon name="edit" size={18} color="#6b7280" /></button>
            </div>
          ))}
        </div>

        {/* ── Type de cours (lecture seule) — pas pertinent pour les externes ── */}
        {profile?.user_type !== 'external' && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>Type de cours</div>
            {(() => {
              const opt = [
                { key: 'group',   iconName: 'users', label: 'Cours collectifs', desc: 'Cours en groupe chaque semaine' },
                { key: 'private', iconName: 'target', label: 'Cours privés',     desc: 'Séances individuelles personnalisées' },
                { key: 'both',    iconName: 'paw', label: 'Les deux',         desc: 'Cours collectifs + cours privés' },
              ].find(o => o.key === courseType) ?? { iconName: 'users', label: 'Cours collectifs', desc: 'Cours en groupe' };
              return (
                <div style={{ background: '#e8f7fd', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, border: '2px solid #2BABE1' }}>
                  <Icon name={opt.iconName === 'target' ? 'check' : opt.iconName} size={28} color="#2BABE1" />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#2BABE1' }}>{opt.label}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{opt.desc}</div>
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>Géré par l'admin</div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Prochain cours privé ─────────────────────────────────── */}
        {nextPrivate && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Prochain cours privé</div>
            <div style={{ background: 'linear-gradient(135deg,#e8f7fd,#f0faff)', borderRadius: 16, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, border: '1px solid rgba(43,171,225,0.2)' }}>
              <div style={{ width: 46, height: 46, background: '#2BABE1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}><Icon name="check" size={22} color="#fff" /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextPrivate.title}</div>
                <div style={{ fontSize: 12, color: '#2BABE1', fontWeight: 600, marginTop: 2 }}>
                  {fmtDate(nextPrivate.date_start)} · {fmtTime(nextPrivate.date_start)}
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── Cotisation annuelle ──────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Mon abonnement</div>

        {/* Cotisation : uniquement pour les membres cours collectifs (pas les externes) */}
        {profile?.user_type !== 'external' && (profile?.course_type ?? 'group') !== 'private' && (
          <>
            {cotisationCancelled && cotisation?.status === 'paid' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="close" size={20} color="#ef4444" />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#7f1d1d' }}>
                  Non-renouvellement confirmé. Ta cotisation reste valide jusqu'au {cotisationValidUntil}.
                </div>
              </div>
            )}

            <Row
              icon={<Icon name="creditCard" size={18} color="#2BABE1" />}
              title="Cotisation annuelle"
              sub={cotisation?.status === 'paid'
                ? `Valable jusqu'au ${cotisationValidUntil}${cotisationCancelled ? ' · Ne sera pas renouvelée' : ''}`
                : dogs.length > 1
                  ? `À régler · CHF ${150 * dogs.length} (${dogs.length} chiens × CHF 150)`
                  : `À régler · CHF 150`}
              badge={cotisation?.status === 'paid'
                ? (cotisationCancelled ? 'Non renouvelée' : 'Payée ✓')
                : undefined}
              badgeColor={cotisationCancelled ? '#d97706' : '#16a34a'}
              badgeBg={cotisationCancelled ? '#fef3c7' : '#dcfce7'}
              payable={cotisation?.status !== 'paid'}
              onClick={cotisation?.status !== 'paid' ? handlePayCotisation : undefined}
            />

            {cotisation?.status === 'paid' && !cotisationCancelled && (
              <button
                onClick={() => setResiliationTarget({ type: 'cotisation_annuelle', accessUntil: cotisation.valid_until })}
                style={{
                  background: 'none', border: '1px solid #fecaca', borderRadius: 12,
                  padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#ef4444',
                  cursor: 'pointer', width: '100%', marginBottom: 16, marginTop: -4,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Icon name="close" size={12} color="#ef4444" /> Ne pas renouveler la cotisation l'année prochaine
              </button>
            )}
          </>
        )}

        {(courseType === 'private' || courseType === 'both' || privateRequest || (privateLesson && (privateLesson.status === 'paid' || !!privateLesson.lesson_date))) && (
          <>
            {/* Demande envoyée, en attente de confirmation par l'admin */}
            {privateRequest?.status === 'pending' && (!privateLesson || privateLesson.status !== 'paid') && (
              <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', border: '1px solid #bae6fd', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <Icon name="clock" size={20} color="#0284c7" />
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0c4a6e' }}>Ta demande de leçon privée est en attente de confirmation.</div>
              </div>
            )}
            {/* Admin a confirmé → en attente de paiement */}
            {privateLesson && privateLesson.status !== 'paid' && !!privateLesson.lesson_date && (() => {
              const lessonTime = new Date(privateLesson.lesson_date);
              const hoursLeft = (lessonTime - new Date()) / (1000 * 60 * 60);
              const isUrgent = hoursLeft > 0 && hoursLeft < 24;
              const isPast = hoursLeft <= 0;
              return isPast ? (
                <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="close" size={20} color="#dc2626" />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#991b1b' }}>Le cours n'a pas été payé à temps et n'a pas pu être maintenu.</div>
                </div>
              ) : isUrgent ? (
                <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="warning" size={20} color="#dc2626" />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>Ton cours est dans moins de 24h ! Paye maintenant pour confirmer ta place.</div>
                </div>
              ) : (
                <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="warning" size={20} color="#d97706" />
                  <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>Ta leçon privée est confirmée ! Paye au moins 24h avant le rendez-vous.</div>
                </div>
              );
            })()}
            <Row
              icon={<Icon name="check" size={18} color="#2BABE1" />}
              title="Leçons privées"
              sub={privateLesson?.status === 'paid'
                ? `${privateLesson.private_lessons_used ?? 0} utilisée(s) sur ${privateLesson.private_lessons_total ?? 0}`
                : (privateLesson?.lesson_date ? `À régler · CHF 60`
                  : (privateRequest?.status === 'pending' ? `En attente de confirmation`
                    : `Aucune demande en cours`))}
              badge={privateLesson?.status === 'paid' ? `${remaining} restante${remaining > 1 ? 's' : ''}` : undefined}
              badgeColor="#d97706" badgeBg="#fef3c7"
              payable={privateLesson && privateLesson.status !== 'paid' && !!privateLesson.lesson_date}
              onClick={(privateLesson && privateLesson.status !== 'paid' && !!privateLesson.lesson_date) ? handlePayPrivateLesson : undefined}
            />
          </>
        )}

        {/* ── Abonnement premium ──────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Accès premium</div>

        {isPremium ? (
          <div style={{ background: 'linear-gradient(135deg,#1F1F20,#2a3a4a)', borderRadius: 18, padding: 16, marginBottom: isPremiumCancelling ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isPremiumCancelling ? 0 : 14 }}>
              <div style={{ width: 42, height: 42, background: isPremiumCancelling ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                <Icon name={isPremiumCancelling ? 'clock' : 'sparkle'} size={22} color={isPremiumCancelling ? '#ef4444' : '#f59e0b'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>
                  {isPremiumCancelling ? 'Résiliation programmée' : 'Premium actif'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                  {isPremiumCancelling
                    ? `Actif jusqu'au ${fmtDate(premiumCancelAt)} · Pas de renouvellement`
                    : `${premiumLabel} · CHF 10/mois`}
                </div>
              </div>
              <div style={{ background: isPremiumCancelling ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: isPremiumCancelling ? '#fca5a5' : '#4ade80', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                {isPremiumCancelling ? <><Icon name="clock" size={12} color="#fca5a5" /> En cours</> : <><Icon name="check" size={12} color="#4ade80" /> Actif</>}
              </div>
            </div>
            {!isPremiumCancelling && (
              <button
                onClick={() => setResiliationTarget({ type: 'premium_mensuel', accessUntil: profile?.premium_until })}
                style={{
                  width: '100%', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 12, padding: '10px 16px', fontSize: 13, fontWeight: 700, color: '#fca5a5',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  marginTop: 14,
                }}
              >
                <Icon name="close" size={13} color="#fca5a5" /> Résilier l'abonnement
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'linear-gradient(135deg,#1F1F20,#2a3a4a)', borderRadius: 18, padding: 16, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, background: 'rgba(43,171,225,0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}><Icon name="lock" size={22} color="#2BABE1" /></div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Contenu premium</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Ressources · Documents · Vidéos</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>10<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>CHF/mois</span></div>
            </div>
            {premiumError && (
              <div style={{ background: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#fca5a5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="warning" size={12} color="#fca5a5" /> {premiumError}</div>
            )}
            <button
              onClick={handleSubscribePremium}
              disabled={premiumLoading}
              style={{
                width: '100%', background: premiumLoading ? 'rgba(43,171,225,0.3)' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
                color: '#fff', border: 'none', borderRadius: 12, padding: '12px 18px',
                fontSize: 14, fontWeight: 800, cursor: premiumLoading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {premiumLoading
                ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Connexion...</>
                : <><Icon name="sparkle" size={14} color="#fff" /> S'abonner pour CHF 10/mois</>}
            </button>
          </div>
        )}

        {/* ── Historique paiements ────────────────────────────────── */}
        {payments.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Historique des paiements</div>
            {payments.map(p => (
              <div key={p.id} style={{ background: '#f4f6f8', borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                <div style={{ width: 36, height: 36, background: '#dcfce7', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}><Icon name="check" size={16} color="#16a34a" /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20' }}>
                    {p.description ?? (p.type === 'cotisation_annuelle' ? 'Cotisation annuelle' : p.type === 'lecon_privee' ? 'Leçon privée' : p.type === 'premium_mensuel' ? 'Premium mensuel' : 'Paiement')}
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                    {new Date(p.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                {p.amount && (
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#16a34a', flexShrink: 0 }}>
                    CHF {(p.amount / 100).toFixed(0)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* ── Mon compte ──────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mon compte</div>

        {/* Notifications avec toggle (état réel d'abonnement push) */}
        {push.supported && (
          <div
            onClick={handleToggleNotif}
            style={{ background: '#f4f6f8', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, cursor: push.loading ? 'wait' : 'pointer', opacity: push.loading ? 0.6 : 1 }}
          >
            <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}><Icon name="bell" size={18} color="#6b7280" /></div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Notifications</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {push.permission === 'denied'
                  ? 'Bloquées par le navigateur (à débloquer dans les paramètres du site)'
                  : push.subscribed
                    ? 'Tu reçois les news du club et les rappels'
                    : 'Active pour recevoir les news et rappels'}
              </div>
            </div>
            <Toggle on={push.subscribed} />
          </div>
        )}

        {/* Documents — accessibles a tous (reglement terrain, planning annuel) */}
        <div
          onClick={() => setShowDocuments(true)}
          style={{
            background: '#f4f6f8',
            borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
            cursor: 'pointer',
            border: '2px solid transparent',
          }}
        >
          <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            <Icon name="fileText" size={18} color="#2BABE1" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Documents</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>Règlement du terrain, planning annuel</div>
          </div>
          <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>
        </div>

        <Row icon={<Icon name="lock" size={18} color="#2BABE1" />} title="Changer le mot de passe" sub="Sécurité du compte" onClick={() => setShowChangePwd(true)} />

        {/* Acces au panel admin — visible uniquement pour les comptes role=admin */}
        {profile?.role === 'admin' && (
          <Row
            icon={<Icon name="settings" size={18} color="#2BABE1" />}
            title="Panel admin"
            sub="Membres, paiements, demandes"
            onClick={() => { window.location.href = '/admin'; }}
          />
        )}

        <Row icon={<Icon name="logout" size={18} color="#ef4444" />} title="Se déconnecter" danger onClick={handleSignOut} />

        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 24 }}>CaniPlus App v1.0 · Ballaigues</div>
      </div>

      {/* ── Modals ──────────────────────────────────────────────────── */}

      {selectedSub && (
        <PaiementModal
          subscription={selectedSub}
          onClose={() => setSelectedSub(null)}
          onSuccess={handlePaymentSuccess}
          dogsCount={dogs.length}
        />
      )}

      {resiliationTarget && (
        <ResiliationModal
          type={resiliationTarget.type}
          accessUntil={resiliationTarget.accessUntil}
          onClose={() => setResiliationTarget(null)}
          onSuccess={handleResiliationSuccess}
        />
      )}

      {dogModal && (
        <DogEditModal
          dog={dogModal === 'add' ? null : dogModal}
          onClose={() => setDogModal(null)}
          onSaved={() => { setDogModal(null); loadData(); }}
        />
      )}

      {showChangePwd && (
        <ChangePasswordModal onClose={() => setShowChangePwd(false)} />
      )}

      {showDocuments && (
        <DocumentsModal onClose={() => setShowDocuments(false)} />
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
