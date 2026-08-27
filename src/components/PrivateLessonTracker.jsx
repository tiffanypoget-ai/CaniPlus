// src/components/PrivateLessonTracker.jsx
// Suivi complet des cours privés, affiché sur l'Accueil (layout grand public) :
// demande en attente, créneau confirmé à payer (avec rappels 48h), paiement
// cash sur place, leçons payées (compteur), et prochain cours au calendrier.
// Même logique que la section « Leçons privées » du Profil — ici en version
// autonome : le composant charge ses propres données et ne rend rien s'il
// n'y a aucun suivi en cours (la carte « Cours privé à domicile » de l'Accueil
// couvre déjà la demande initiale).
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import PaiementModal from './PaiementModal';
import AddToCalendarButton from './AddToCalendarButton';
import { eventFromPrivateCourse } from '../lib/calendar';
import Icon from './Icons';
import { PRIX_HEURE_CHF } from '../lib/tarifs';

export default function PrivateLessonTracker({ style }) {
  const { profile, refreshProfile } = useAuth();
  const [privateLesson, setPrivateLesson] = useState(null);   // subscription lecon_privee
  const [privateRequest, setPrivateRequest] = useState(null); // demande en cours
  const [selectedSub, setSelectedSub] = useState(null);       // paiement en cours
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    if (!profile) return;
    const [subsRes, reqRes] = await Promise.all([
      supabase.from('subscriptions').select('*')
        .eq('user_id', profile.id).eq('type', 'lecon_privee')
        .order('created_at', { ascending: false }).limit(1),
      supabase.from('private_course_requests').select('*')
        .eq('user_id', profile.id)
        .in('status', ['pending', 'confirmed'])
        .order('created_at', { ascending: false }).limit(1),
    ]);
    setPrivateLesson(subsRes.data?.[0] ?? null);
    setPrivateRequest(reqRes.data?.[0] ?? null);
    setLoading(false);
  }, [profile?.id]); // eslint-disable-line

  useEffect(() => { loadData(); }, [loadData]);

  const handlePaymentSuccess = async () => {
    setSelectedSub(null);
    await loadData();
    if (refreshProfile) refreshProfile();
  };

  // Rien à suivre : on ne rend rien (l'Accueil reste léger)
  const hasSomething = privateRequest
    || (privateLesson && (privateLesson.status === 'paid' || !!privateLesson.lesson_date));
  if (loading || !hasSomething) return null;

  const remaining = privateLesson
    ? (privateLesson.private_lessons_total ?? 0) - (privateLesson.private_lessons_used ?? 0)
    : 0;

  // Date du cours déjà passée : le créneau n'est plus tenu, il ne doit plus
  // être payable. Sans ce test, l'app affichait la bannière « le cours n'a pas
  // pu être maintenu » et proposait quand même de le régler juste en dessous.
  const lessonIsPast = !!privateLesson?.lesson_date
    && new Date(privateLesson.lesson_date) <= new Date();

  const payable = privateLesson && privateLesson.status !== 'paid'
    && privateLesson.status !== 'pending_payment' && !!privateLesson.lesson_date
    && !lessonIsPast;

  // Prochain cours confirmé et payé → bouton calendrier
  const upcomingConfirmed = (() => {
    if (privateRequest?.status !== 'confirmed' || privateRequest?.payment_status !== 'paid') return null;
    const slot = privateRequest.chosen_slot;
    if (!slot?.date || !slot?.start) return null;
    const slotEnd = new Date(`${slot.date}T${slot.end || slot.start}:00`);
    return slotEnd >= new Date() ? privateRequest : null;
  })();

  return (
    <div style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 2px 16px rgba(31,31,32,0.08)', border: '1.5px solid #fff7ed', ...style }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#9a3412', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
        <Icon name="paw" size={13} color="#9a3412" /> Ton cours privé
      </div>

      {/* Demande envoyée, en attente de confirmation */}
      {privateRequest?.status === 'pending' && (!privateLesson || privateLesson.status !== 'paid') && (
        <div style={{ background: 'linear-gradient(135deg,#f0f9ff,#e0f2fe)', border: '1px solid #bae6fd', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <Icon name="clock" size={20} color="#0284c7" />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#0c4a6e' }}>Ta demande de leçon privée est en attente de confirmation. Tiffany te répond très vite !</div>
        </div>
      )}

      {/* Créneau confirmé, paiement en attente (avec rappels 48h) */}
      {privateLesson && privateLesson.status !== 'paid' && privateLesson.payment_mode !== 'cash' && !!privateLesson.lesson_date && (() => {
        const lessonTime = new Date(privateLesson.lesson_date);
        const hoursLeft = (lessonTime - new Date()) / (1000 * 60 * 60);
        const isUrgent = hoursLeft > 0 && hoursLeft < 48;
        const isPast = hoursLeft <= 0;
        return isPast ? (
          <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="close" size={20} color="#dc2626" />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#991b1b' }}>Le cours n'a pas été payé à temps et n'a pas pu être maintenu.</div>
          </div>
        ) : isUrgent ? (
          <div style={{ background: 'linear-gradient(135deg,#fef2f2,#fee2e2)', border: '1px solid #fecaca', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="warning" size={20} color="#dc2626" />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: '#991b1b' }}>Ton cours est dans moins de 48h ! Paye vite pour garder ta place, sinon le créneau sera libéré.</div>
          </div>
        ) : (
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1px solid #fde68a', borderRadius: 14, padding: '10px 14px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="warning" size={20} color="#d97706" />
            <div style={{ flex: 1, fontSize: 12, fontWeight: 600, color: '#92400e' }}>Tiffany a validé ton créneau. Paye au moins 48h avant le rendez-vous pour confirmer ton cours.</div>
          </div>
        );
      })()}

      {/* Ligne de statut Leçons privées */}
      <div
        onClick={payable ? () => setSelectedSub(privateLesson) : undefined}
        style={{
          background: '#f4f6f8', borderRadius: 14, padding: 14,
          display: 'flex', alignItems: 'center', gap: 12,
          cursor: payable ? 'pointer' : 'default',
          border: payable ? '2px solid #fde68a' : '2px solid transparent',
        }}
      >
        <div style={{ width: 38, height: 38, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
          <Icon name="check" size={18} color="#2BABE1" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Leçons privées</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            {privateLesson?.status === 'paid'
              ? `${privateLesson.private_lessons_used ?? 0} utilisée(s) sur ${privateLesson.private_lessons_total ?? 0}`
              : (privateLesson?.status === 'pending_payment' && privateLesson?.payment_mode === 'cash'
                ? (() => {
                  const dur = Number(privateLesson?.duration_hours) || 1;
                  const courseAmount = PRIX_HEURE_CHF * dur;
                  const travel = Number(privateLesson?.travel_extra_chf) || 0;
                  const total = Math.round(courseAmount + travel);
                  if (travel > 0) return `Réservée · à payer sur place (${dur}h × ${PRIX_HEURE_CHF} + ${travel} CHF déplacement = ${total} CHF)`;
                  return `Réservée · à payer sur place (${total} CHF)`;
                })()
                : (privateLesson?.lesson_date
                  ? (lessonIsPast
                    ? 'Créneau libéré · fais une nouvelle demande'
                    : 'À régler · clique pour voir le montant exact')
                  : (privateRequest?.status === 'pending' ? 'En attente de confirmation' : 'Aucune demande en cours')))}
          </div>
        </div>
        {privateLesson?.status === 'paid' && (
          <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, flexShrink: 0 }}>
            {remaining} restante{remaining > 1 ? 's' : ''}
          </div>
        )}
        {privateLesson?.status === 'pending_payment' && privateLesson?.payment_mode === 'cash' && (
          <div style={{ background: '#fef3c7', color: '#92400e', fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 8, flexShrink: 0 }}>Cash à la séance</div>
        )}
        {payable && (
          <div style={{ background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', fontSize: 12, fontWeight: 800, padding: '6px 12px', borderRadius: 10, flexShrink: 0, boxShadow: '0 2px 8px rgba(43,171,225,0.3)' }}>Payer →</div>
        )}
      </div>

      {/* Prochain cours confirmé et payé : date + calendrier */}
      {upcomingConfirmed && (
        <div style={{ marginTop: 10 }}>
          <AddToCalendarButton variant="full" event={eventFromPrivateCourse(upcomingConfirmed)} />
        </div>
      )}

      {selectedSub && (
        <PaiementModal
          subscription={selectedSub}
          onClose={() => setSelectedSub(null)}
          onSuccess={handlePaymentSuccess}
          dogsCount={1}
        />
      )}
    </div>
  );
}
