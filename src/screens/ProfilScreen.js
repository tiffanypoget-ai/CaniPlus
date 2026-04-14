// src/screens/ProfilScreen.js
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PaiementModal from '../components/PaiementModal';
import ResiliationModal from '../components/ResiliationModal';
import DogModal from '../components/DogModal';
import ChangePasswordModal from '../components/ChangePasswordModal';
import DocumentsModal from '../components/DocumentsModal';
import { usePremium } from '../hooks/usePremium';

export default function ProfilScreen() {
  const { profile, signOut, refreshProfile } = useAuth();

  const { isPremium, statusLabel: premiumLabel } = usePremium();
  const [dogs, setDogs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [nextPrivate, setNextPrivate] = useState(null);         // prochain cours privé
  const [selectedSub, setSelectedSub] = useState(null);         // subscription à payer
  const [resiliationTarget, setResiliationTarget] = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState(null);
  const [dogModal, setDogModal] = useState(null);               // null | 'add' | dog object
  const [cotisationLoading,    setCotisationLoading]    = useState(false);
  const [privateLessonLoading, setPrivateLessonLoading] = useState(false);
  const [showChangePwd, setShowChangePwd] = useState(false);
  const [showDocuments, setShowDocuments] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(profile?.avatar_url ?? null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [notifEnabled, setNotifEnabled] = useState(() => {
    try { return localStorage.getItem('notif_enabled') !== 'false'; } catch { return true; }
  });
  const fileInputRef = useRef(null);

  const loadData = async () => {
    if (!profile) return;
    // Chiens
    supabase.from('dogs').select('*').eq('owner_id', profile.id)
      .then(({ data }) => { if (data) setDogs(data); });
    // Abonnements
    supabase.from('subscriptions').select('*').eq('user_id', profile.id)
      .then(({ data }) => { if (data) setSubscriptions(data); });
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
    setPrivateLessonLoading(true);
    try {
      let sub = privateLesson;
      if (!sub) {
        const { data } = await supabase.from('subscriptions').insert({
          user_id: profile.id,
          type: 'lecon_privee',
          status: 'pending',
          private_lessons_total: 1,
          private_lessons_used: 0,
        }).select().single();
        sub = data;
        await loadData();
      }
      if (sub) setSelectedSub(sub);
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
  const handleToggleNotif = async () => {
    if (!notifEnabled) {
      // Activer : demander permission navigateur
      if ('Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission();
      }
      localStorage.setItem('notif_enabled', 'true');
      setNotifEnabled(true);
    } else {
      localStorage.setItem('notif_enabled', 'false');
      setNotifEnabled(false);
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
    <div style={{ overflowY: 'auto' }} className="screen-content">

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
              🙋
            </div>
          )}
          {/* Badge caméra */}
          <div style={{
            position: 'absolute', bottom: 0, right: 0,
            width: 26, height: 26, background: '#2BABE1', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13,
            border: '2px solid #1F1F20',
          }}>
            {avatarLoading ? '…' : '📷'}
          </div>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleAvatarChange} style={{ display: 'none' }} />

        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{profile?.full_name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{profile?.email}</div>
        <div style={{ display: 'inline-block', background: 'rgba(43,171,225,0.25)', border: '1px solid rgba(43,171,225,0.35)', color: 'rgba(125,212,245,0.9)', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginTop: 10 }}>
          Membre · depuis {memberSince}
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>

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
              <span style={{ fontSize: 20 }}>➕</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Ajouter un chien</span>
            </div>
          ) : dogs.map(dog => (
            <div key={dog.id} style={{ background: '#fff', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0, overflow: 'hidden' }}>
                {dog.photo_url
                  ? <img src={dog.photo_url} alt={dog.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : '🐕'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                  {dog.breed ?? 'Race non renseignée'}
                  {dog.sex ? ` · ${dog.sex === 'M' ? 'Mâle' : 'Femelle'}` : ''}
                  {dog.birth_year ? ` · né en ${dog.birth_year}` : ''}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: dog.vaccinated ? '#dcfce7' : '#fef3c7', color: dog.vaccinated ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                    {dog.vaccinated ? 'Vacciné ✓' : 'Vaccin à vérifier'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setDogModal(dog)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4 }}
              >✏️</button>
            </div>
          ))}
        </div>

        {/* ── Type de cours ────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>Type de cours</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'group',   emoji: '👥', label: 'Collectifs' },
              { key: 'private', emoji: '🎯', label: 'Privés' },
              { key: 'both',    emoji: '🐾', label: 'Les deux' },
            ].map(opt => {
              const isSelected = (profile?.course_type ?? 'group') === opt.key;
              return (
                <button key={opt.key} onClick={() => handleCourseTypeChange(opt.key)} style={{
                  flex: 1, padding: '12px 4px', borderRadius: 14, border: 'none',
                  background: isSelected ? '#e8f7fd' : '#f4f6f8',
                  color: isSelected ? '#2BABE1' : '#6b7280',
                  fontWeight: 700, fontSize: 12, cursor: 'pointer',
                  outline: isSelected ? '2px solid #2BABE1' : '2px solid transparent',
                  transition: 'all 0.2s',
                }}>
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{opt.emoji}</div>
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Prochain cours privé ─────────────────────────────────── */}
        {nextPrivate && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Prochain cours privé</div>
            <div style={{ background: 'linear-gradient(135deg,#e8f7fd,#f0faff)', borderRadius: 16, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, border: '1px solid rgba(43,171,225,0.2)' }}>
              <div style={{ width: 46, height: 46, background: '#2BABE1', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🎯</div>
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

        {/* Cotisation : uniquement pour les membres cours collectifs */}
        {(profile?.course_type ?? 'group') !== 'private' && (
          <>
            {cotisationCancelled && cotisation?.status === 'paid' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>🚫</span>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#7f1d1d' }}>
                  Non-renouvellement confirmé. Ta cotisation reste valide jusqu'au {cotisationValidUntil}.
                </div>
              </div>
            )}

            <Row
              icon="💳"
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
                🚫 Ne pas renouveler la cotisation l'année prochaine
              </button>
            )}
          </>
        )}

        {(courseType === 'private' || courseType === 'both' || privateLesson) && (
          <>
            {privateLesson && privateLesson.status !== 'paid' && (
              <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>Ta leçon privée est en attente de paiement.</div>
              </div>
            )}
            <Row
              icon="🎯"
              title="Leçons privées"
              sub={privateLesson?.status === 'paid'
                ? `${privateLesson.private_lessons_used ?? 0} utilisée(s) sur ${privateLesson.private_lessons_total ?? 0}`
                : `À régler · CHF 60`}
              badge={privateLesson?.status === 'paid' ? `${remaining} restante${remaining > 1 ? 's' : ''}` : undefined}
              badgeColor="#d97706" badgeBg="#fef3c7"
              payable={!privateLesson || privateLesson.status !== 'paid'}
              onClick={(!privateLesson || privateLesson.status !== 'paid') ? handlePayPrivateLesson : undefined}
            />
          </>
        )}

        {/* ── Abonnement premium ──────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Accès premium</div>

        {isPremium ? (
          <div style={{ background: 'linear-gradient(135deg,#1F1F20,#2a3a4a)', borderRadius: 18, padding: 16, marginBottom: isPremiumCancelling ? 8 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: isPremiumCancelling ? 0 : 14 }}>
              <div style={{ width: 42, height: 42, background: isPremiumCancelling ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
                {isPremiumCancelling ? '⏳' : '✨'}
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
              <div style={{ background: isPremiumCancelling ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)', color: isPremiumCancelling ? '#fca5a5' : '#4ade80', fontSize: 12, fontWeight: 800, padding: '4px 10px', borderRadius: 8 }}>
                {isPremiumCancelling ? 'En cours ⏳' : 'Actif ✓'}
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
                🚫 Résilier l'abonnement
              </button>
            )}
          </div>
        ) : (
          <div style={{ background: 'linear-gradient(135deg,#1F1F20,#2a3a4a)', borderRadius: 18, padding: 16, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 42, height: 42, background: 'rgba(43,171,225,0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔒</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Contenu premium</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>Ressources · Documents · Vidéos</div>
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff' }}>10<span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>CHF/mois</span></div>
            </div>
            {premiumError && (
              <div style={{ background: 'rgba(239,68,68,0.15)', borderRadius: 10, padding: '8px 12px', marginBottom: 10, fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>⚠️ {premiumError}</div>
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
                : <>✨ S'abonner pour CHF 10/mois</>}
            </button>
          </div>
        )}

        {/* ── Mon compte ──────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mon compte</div>

        {/* Notifications avec toggle */}
        <div
          onClick={handleToggleNotif}
          style={{ background: '#f4f6f8', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, cursor: 'pointer' }}
        >
          <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>🔔</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Notifications</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{notifEnabled ? 'Rappels de cours activés' : 'Notifications désactivées'}</div>
          </div>
          <Toggle on={notifEnabled} />
        </div>

        {/* Documents — réservé premium */}
        <div
          onClick={isPremium ? () => setShowDocuments(true) : undefined}
          style={{
            background: isPremium ? '#f4f6f8' : '#fafafa',
            borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
            cursor: isPremium ? 'pointer' : 'default',
            border: isPremium ? '2px solid transparent' : '2px dashed #e5e7eb',
            opacity: isPremium ? 1 : 0.7,
          }}
        >
          <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
            {isPremium ? '📄' : '🔒'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Documents</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{isPremium ? 'Règlement, attestations, programme' : 'Réservé aux membres premium'}</div>
          </div>
          {!isPremium && <div style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 8, flexShrink: 0 }}>Premium</div>}
          {isPremium && <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>}
        </div>

        <Row icon="🔒" title="Changer le mot de passe" sub="Sécurité du compte" onClick={() => setShowChangePwd(true)} />
        <Row icon="🚪" title="Se déconnecter" danger onClick={handleSignOut} />

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
        <DogModal
          dog={dogModal === 'add' ? null : dogModal}
          ownerId={profile?.id}
          onClose={() => setDogModal(null)}
          onSuccess={() => { setDogModal(null); loadData(); }}
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
