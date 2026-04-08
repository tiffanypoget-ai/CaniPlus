// src/screens/ProfilScreen.jsx
import { useEffect, useState, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PaiementModal from '../components/PaiementModal';
import ResiliationModal from '../components/ResiliationModal';
import DogEditModal from '../components/DogEditModal';
import { usePremium } from '../hooks/usePremium';
import { usePushNotifications } from '../hooks/usePushNotifications';

export default function ProfilScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { isPremium, statusLabel: premiumLabel } = usePremium();
  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushLoading, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe } = usePushNotifications();
  const [dogs, setDogs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);
  const [resiliationTarget, setResiliationTarget] = useState(null);
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState(null);

  // ── Profil edition ───────────────────────────────────────────────────────
  const [editingFirstVisit, setEditingFirstVisit] = useState(false);
  const [firstVisitDate, setFirstVisitDate] = useState('');
  const [savingFirstVisit, setSavingFirstVisit] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const avatarRef = useRef();

  // ── Dog modal ────────────────────────────────────────────────────────────
  const [dogModalTarget, setDogModalTarget] = useState(undefined); // undefined=closed, null=new, dog=edit

  const loadData = async () => {
    if (!profile) return;
    supabase.from('dogs').select('*').eq('owner_id', profile.id).then(({ data }) => { if (data) setDogs(data); });
    supabase.from('subscriptions').select('*').eq('user_id', profile.id).then(({ data }) => { if (data) setSubscriptions(data); });
  };

  useEffect(() => {
    loadData();
  }, [profile]);

  useEffect(() => {
    if (profile) {
      setFirstVisitDate(profile.first_visit_date ?? '');
      setAvatarPreview(profile.avatar_url ?? null);
    }
  }, [profile]);

  const memberSince = profile?.member_since
    ? new Date(profile.member_since).getFullYear()
    : new Date().getFullYear();

  const cotisation = subscriptions.filter(s => s.type === 'cotisation_annuelle')
    .sort((a, b) => (a.status === 'paid' ? -1 : 1))[0] ?? null;
  const privateLesson = subscriptions.find(s => s.type === 'lecon_privee');
  const remaining = privateLesson ? privateLesson.private_lessons_total - privateLesson.private_lessons_used : 0;

  const premiumCancelAt = profile?.premium_cancel_at ? new Date(profile.premium_cancel_at) : null;
  const isPremiumCancelling = premiumCancelAt && isPremium;
  const cotisationCancelled = cotisation?.renew_cancelled === true;

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleSignOut = () => {
    if (window.confirm('Voulez-vous vraiment vous déconnecter ?')) signOut();
  };

  // ── Avatar upload ────────────────────────────────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !profile) return;
    setAvatarUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${profile.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = data.publicUrl + '?t=' + Date.now(); // cache-bust
      await supabase.from('profiles').update({ avatar_url: url }).eq('id', profile.id);
      setAvatarPreview(url);
      refreshProfile();
    } catch (e) {
      alert('Erreur upload photo : ' + e.message);
    } finally {
      setAvatarUploading(false);
    }
  };

  // ── First visit date ─────────────────────────────────────────────────────
  const handleSaveFirstVisit = async () => {
    if (!profile) return;
    setSavingFirstVisit(true);
    try {
      await supabase.from('profiles').update({ first_visit_date: firstVisitDate || null }).eq('id', profile.id);
      setEditingFirstVisit(false);
      refreshProfile();
    } catch (e) {
      alert('Erreur sauvegarde : ' + e.message);
    } finally {
      setSavingFirstVisit(false);
    }
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

  const handleDogSaved = () => {
    setDogModalTarget(undefined);
    loadData();
  };

  const Row = ({ icon, title, sub, badge, badgeColor, badgeBg, onClick, danger, payable }) => (
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
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: danger ? '#ef4444' : '#1F1F20' }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{sub}</div>}
      </div>
      {badge && <div style={{ background: badgeBg, color: badgeColor, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, flexShrink: 0 }}>{badge}</div>}
      {payable && <div style={{ background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 10, flexShrink: 0, boxShadow: '0 2px 8px rgba(43,171,225,0.3)' }}>Payer →</div>}
      {onClick && !badge && !danger && !payable && <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>}
    </div>
  );

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

  return (
    <div style={{ overflowY: 'auto' }} className="screen-content">

      {/* ── Header avec avatar ────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 32px', textAlign: 'center' }}>
        {/* Avatar cliquable */}
        <div
          onClick={() => avatarRef.current.click()}
          style={{ width: 86, height: 86, borderRadius: '50%', margin: '0 auto 12px', cursor: 'pointer', position: 'relative', flexShrink: 0 }}
        >
          {avatarPreview
            ? <img src={avatarPreview} alt="avatar" style={{ width: 86, height: 86, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.25)' }} />
            : <div style={{ width: 86, height: 86, background: 'rgba(43,171,225,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, border: '3px solid rgba(255,255,255,0.2)' }}>🙋‍♀️</div>
          }
          <div style={{ position: 'absolute', bottom: 2, right: 2, background: '#2BABE1', borderRadius: '50%', width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, border: '2px solid #1F1F20' }}>
            {avatarUploading ? '⏳' : '📷'}
          </div>
        </div>
        <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleAvatarChange} />

        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{profile?.full_name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{profile?.email}</div>
        <div style={{ display: 'inline-block', background: 'rgba(43,171,225,0.25)', border: '1px solid rgba(43,171,225,0.35)', color: 'rgba(125,212,245,0.9)', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginTop: 10 }}>
          Membre · depuis {memberSince}
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>

        {/* ── Infos personnelles ───────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mon profil</div>

        {/* Date première venue au club */}
        <div style={{ background: '#f4f6f8', borderRadius: 14, padding: 14, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>📅</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Première venue au club</div>
              {!editingFirstVisit ? (
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                  {firstVisitDate ? fmtDate(firstVisitDate) : 'Non renseignée'}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
                  <input
                    type="date"
                    value={firstVisitDate}
                    onChange={e => setFirstVisitDate(e.target.value)}
                    style={{ flex: 1, padding: '6px 10px', borderRadius: 8, border: '1.5px solid #e5e7eb', fontSize: 13, outline: 'none' }}
                  />
                  <button
                    onClick={handleSaveFirstVisit}
                    disabled={savingFirstVisit}
                    style={{ background: '#2BABE1', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {savingFirstVisit ? '…' : 'OK'}
                  </button>
                  <button
                    onClick={() => { setEditingFirstVisit(false); setFirstVisitDate(profile?.first_visit_date ?? ''); }}
                    style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, cursor: 'pointer' }}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
            {!editingFirstVisit && (
              <button
                onClick={() => setEditingFirstVisit(true)}
                style={{ background: '#e5e7eb', border: 'none', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700, color: '#374151', cursor: 'pointer' }}
              >
                ✏️
              </button>
            )}
          </div>
        </div>

        {/* ── Mes chiens ───────────────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mes chiens</div>

        {dogs.map(dog => (
          <div
            key={dog.id}
            onClick={() => setDogModalTarget(dog)}
            style={{ background: '#fff', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 8, cursor: 'pointer' }}
          >
            {/* Photo du chien */}
            <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: 14, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>
              {dog.photo_url
                ? <img src={dog.photo_url} alt={dog.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🐕'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog.name}</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                {dog.breed ?? 'Race non renseignée'}{dog.sex ? ` · ${dog.sex}` : ''}{dog.reproductive_status ? ` · ${dog.reproductive_status}` : ''}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                <span style={{
                  background: dog.vaccinated ? '#dcfce7' : '#fef3c7',
                  color: dog.vaccinated ? '#16a34a' : '#d97706',
                  fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8
                }}>
                  {dog.vaccinated ? '💉 Vacciné ✓' : '⚠️ Vaccin à vérifier'}
                </span>
                {dog.chip_number && (
                  <span style={{ background: '#f0f9ff', color: '#0369a1', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                    🔖 Puce
                  </span>
                )}
              </div>
            </div>
            <span style={{ fontSize: 18, color: '#9ca3af' }}>✏️</span>
          </div>
        ))}

        {/* Bouton ajouter un chien */}
        <div
          onClick={() => setDogModalTarget(null)}
          style={{ background: '#f4f6f8', borderRadius: 14, padding: 16, display: 'flex', alignItems: 'center', gap: 12, border: '2px dashed #d1d5db', cursor: 'pointer', marginBottom: 8 }}
        >
          <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>➕</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Ajouter un chien</span>
        </div>

        {/* ── Cotisation annuelle ─────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 10 }}>Mon abonnement</div>

        {cotisation && cotisation.status !== 'paid' && (
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Ta cotisation est en attente de paiement. Clique sur "Payer →" pour la régler en ligne.
            </div>
          </div>
        )}

        {cotisationCancelled && cotisation?.status === 'paid' && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>🚫</span>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#7f1d1d' }}>
              Non-renouvellement confirmé. Ta cotisation reste valide jusqu'au {fmtDate(cotisation.valid_until)}.
            </div>
          </div>
        )}

        <Row
          icon="💳"
          title="Cotisation annuelle"
          sub={cotisation
            ? cotisation.status === 'paid'
              ? `Valable jusqu'au ${fmtDate(cotisation.valid_until)}${cotisationCancelled ? ' · Ne sera pas renouvelée' : ''}`
              : `À régler · CHF 150`
            : 'CHF 150 · Payer en ligne →'}
          badge={cotisation?.status === 'paid' ? (cotisationCancelled ? 'Non renouvelée' : 'Payée ✓') : undefined}
          badgeColor={cotisationCancelled ? '#d97706' : '#16a34a'}
          badgeBg={cotisationCancelled ? '#fef3c7' : '#dcfce7'}
          payable={!cotisation || cotisation.status !== 'paid'}
          onClick={cotisation?.status !== 'paid'
            ? () => setSelectedSub(cotisation ?? { type: 'cotisation_annuelle' })
            : undefined}
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

        {privateLesson ? (
          <>
            {privateLesson.status !== 'paid' && (
              <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>⚠️</span>
                <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>Ta leçon privée est en attente de paiement.</div>
              </div>
            )}
            <Row
              icon="🎯"
              title="Leçons privées"
              sub={privateLesson.status === 'paid'
                ? `${privateLesson.private_lessons_used} utilisée(s) sur ${privateLesson.private_lessons_total}`
                : `À régler · CHF 60`}
              badge={privateLesson.status === 'paid' ? `${remaining} restante${remaining > 1 ? 's' : ''}` : undefined}
              badgeColor="#d97706" badgeBg="#fef3c7"
              payable={privateLesson.status !== 'paid'}
              onClick={privateLesson.status !== 'paid' ? () => setSelectedSub(privateLesson) : undefined}
            />
          </>
        ) : (
          <Row
            icon="🎯"
            title="Leçon privée"
            sub="CHF 60 · Réserver et payer en ligne →"
            payable
            onClick={() => setSelectedSub({ type: 'lecon_privee' })}
          />
        )}

        {/* ── Abonnement premium ─────────────────────────────────────────── */}
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

        {/* ── Compte ───────────────────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mon compte</div>
        {pushSupported && (
          <div style={{ background: '#f4f6f8', borderRadius: 14, padding: 14, display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>🔔</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Notifications push</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                {pushSubscribed ? 'Activées — rappels vaccins inclus ✓' : 'Recevoir les rappels de vaccins'}
              </div>
            </div>
            <button
              onClick={pushSubscribed ? pushUnsubscribe : pushSubscribe}
              disabled={pushLoading}
              style={{
                background: pushSubscribed ? '#fee2e2' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
                color: pushSubscribed ? '#ef4444' : '#fff',
                border: 'none', borderRadius: 10, padding: '7px 12px',
                fontSize: 12, fontWeight: 700, cursor: pushLoading ? 'not-allowed' : 'pointer', flexShrink: 0,
              }}
            >
              {pushLoading ? '…' : pushSubscribed ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        )}
        <div
          onClick={isPremium ? () => {} : undefined}
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
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{isPremium ? 'Règlement intérieur, attestations' : 'Réservé aux membres premium'}</div>
          </div>
          {!isPremium && <div style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 800, padding: '3px 8px', borderRadius: 8, flexShrink: 0 }}>Premium</div>}
          {isPremium && <span style={{ color: '#9ca3af', fontSize: 18 }}>›</span>}
        </div>
        <Row icon="🔒" title="Changer le mot de passe" sub="Sécurité du compte" onClick={() => {}} />
        <Row icon="🚪" title="Se déconnecter" danger onClick={handleSignOut} />

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 24 }}>CaniPlus App v1.0 · Ballaigues</div>
      </div>

      {/* Modal paiement */}
      {selectedSub && (
        <PaiementModal
          subscription={selectedSub}
          onClose={() => setSelectedSub(null)}
          onSuccess={handlePaymentSuccess}
        />
      )}

      {/* Modal résiliation */}
      {resiliationTarget && (
        <ResiliationModal
          type={resiliationTarget.type}
          accessUntil={resiliationTarget.accessUntil}
          onClose={() => setResiliationTarget(null)}
          onSuccess={handleResiliationSuccess}
        />
      )}

      {/* Modal chien (undefined = fermé, null = nouveau chien, dog object = édition) */}
      {dogModalTarget !== undefined && (
        <DogEditModal
          dog={dogModalTarget}
          onClose={() => setDogModalTarget(undefined)}
          onSaved={handleDogSaved}
        />
      )}
    </div>
  );
}
