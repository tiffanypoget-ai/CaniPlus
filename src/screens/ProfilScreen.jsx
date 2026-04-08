// src/screens/ProfilScreen.js
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PaiementModal from '../components/PaiementModal';
import ResiliationModal from '../components/ResiliationModal';
import { usePremium } from '../hooks/usePremium';

export default function ProfilScreen() {
  const { profile, signOut, refreshProfile } = useAuth();
  const { isPremium, statusLabel: premiumLabel } = usePremium();
  const [dogs, setDogs] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [selectedSub, setSelectedSub] = useState(null);       // subscription à payer
  const [resiliationTarget, setResiliationTarget] = useState(null); // { type, accessUntil }
  const [premiumLoading, setPremiumLoading] = useState(false);
  const [premiumError, setPremiumError] = useState(null);

  const loadData = async () => {
    if (!profile) return;
    supabase.from('dogs').select('*').eq('owner_id', profile.id).then(({ data }) => { if (data) setDogs(data); });
    supabase.from('subscriptions').select('*').eq('user_id', profile.id).then(({ data }) => { if (data) setSubscriptions(data); });
  };

  useEffect(() => { loadData(); }, [profile]);

  const memberSince = profile?.member_since ? new Date(profile.member_since).getFullYear() : new Date().getFullYear();
  const cotisation   = subscriptions.find(s => s.type === 'cotisation_annuelle');
  const privateLesson = subscriptions.find(s => s.type === 'lecon_privee');
  const remaining    = privateLesson ? privateLesson.private_lessons_total - privateLesson.private_lessons_used : 0;

  // Premium : résiliation en cours ?
  const premiumCancelAt = profile?.premium_cancel_at ? new Date(profile.premium_cancel_at) : null;
  const isPremiumCancelling = premiumCancelAt && isPremium; // payé mais fin programmée

  // Cotisation : résiliation (ne pas renouveler) demandée ?
  const cotisationCancelled = cotisation?.renew_cancelled === true;

  const fmtDate = (iso) => iso
    ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' })
    : null;

  const handleSignOut = () => {
    if (window.confirm('Voulez-vous vraiment vous déconnecter ?')) signOut();
  };

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

  return (
    <div style={{ overflowY: 'auto' }} className="screen-content">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 32px', textAlign: 'center' }}>
        <div style={{ width: 86, height: 86, background: 'rgba(43,171,225,0.3)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, margin: '0 auto 12px', border: '3px solid rgba(255,255,255,0.2)' }}>🙋‍♀️</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>{profile?.full_name}</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{profile?.email}</div>
        <div style={{ display: 'inline-block', background: 'rgba(43,171,225,0.25)', border: '1px solid rgba(43,171,225,0.35)', color: 'rgba(125,212,245,0.9)', fontSize: 12, fontWeight: 700, padding: '4px 14px', borderRadius: 20, marginTop: 10 }}>
          Membre · depuis {memberSince}
        </div>
      </div>

      <div style={{ padding: '0 16px 16px' }}>

        {/* ── Chiens ──────────────────────────────────────────────────── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mes chiens</div>
          {dogs.length === 0 ? (
            <div style={{ background: '#f4f6f8', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 12, border: '2px dashed #e5e7eb', cursor: 'pointer' }}>
              <span style={{ fontSize: 20 }}>➕</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Ajouter un chien</span>
            </div>
          ) : dogs.map(dog => (
            <div key={dog.id} style={{ background: '#fff', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 8 }}>
              <div style={{ width: 56, height: 56, background: '#fef3c7', borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, flexShrink: 0 }}>🐕</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog.name}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{dog.breed ?? 'Race non renseignée'}{dog.sex ? ` · ${dog.sex}` : ''}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <span style={{ background: dog.vaccinated ? '#dcfce7' : '#fef3c7', color: dog.vaccinated ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                    {dog.vaccinated ? 'Vacciné ✓' : 'Vaccin à vérifier'}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 18, cursor: 'pointer' }}>✏️</span>
            </div>
          ))}
        </div>

        {/* ── Cotisation annuelle ─────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Mon abonnement</div>

        {cotisation && cotisation.status !== 'paid' && (
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>
              Ta cotisation est en attente de paiement. Clique sur "Payer →" pour la régler en ligne.
            </div>
          </div>
        )}

        {/* Cotisation payée + résiliation programmée */}
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

        {/* Bouton résilier cotisation (visible si payée et pas encore annulée) */}
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

        {/* ── Abonnement premium ─────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Accès premium</div>

        {isPremium ? (
          <div style={{ background: 'linear-gradient(135deg,#1F1F20,#2a3a4a)', borderRadius: 18, padding: 16, marginBottom: isPremiumCancelling ? 8 : 0 }}>
            {/* Statut */}
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

            {/* Bouton résilier (seulement si pas déjà en cours de résiliation) */}
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
          /* Premium non actif → bouton s'abonner */
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

        {/* ── Compte ───────────────────────────────────────────────────── */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Mon compte</div>
        <Row icon="🔔" title="Notifications" sub="Rappels de cours activés" onClick={() => {}} />
        {/* Documents : accessible uniquement aux membres premium */}
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
    </div>
  );
}
