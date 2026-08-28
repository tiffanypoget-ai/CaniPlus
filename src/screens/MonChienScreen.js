// src/screens/MonChienScreen.js
// Écran "Mon chien" — profils des chiens et suivi des vaccins.
// Ouvert depuis le Profil (l'emplacement d'onglet a été repris par les Défis).
// Affiche pour chaque chien : photo, infos (race, sexe, âge, puce)
// et le détail des 4 vaccins avec leur statut (à jour / bientôt / expiré),
// calculé depuis dogs.vaccines (même logique que DogEditModal).
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';
import DogEditModal from '../components/DogEditModal';
import { CLUB_ENABLED } from '../lib/features';

const VACCINS = ['Rage', 'CHPL', 'Leptospirose', 'Toux du chenil'];
const VACCINS_LABELS = {
  'Rage':           'Rage',
  'CHPL':           'CHPL / DHPPI',
  'Leptospirose':   'Leptospirose',
  'Toux du chenil': 'Toux du chenil',
};

// Statut d'un vaccin à partir de sa date de rappel (même logique que DogEditModal)
function vaccinStatus(v) {
  if (!v?.next_due_date) {
    return v?.last_date
      ? { label: 'Rappel à planifier', color: '#d97706', bg: '#fef3c7', level: 1 }
      : { label: 'Non renseigné', color: '#9ca3af', bg: '#f3f4f6', level: 0 };
  }
  const diffDays = Math.round((new Date(v.next_due_date) - new Date()) / 86400000);
  if (diffDays < 0)   return { label: 'Expiré', color: '#ef4444', bg: '#fee2e2', level: 3, due: v.next_due_date };
  if (diffDays <= 30) return { label: `Rappel dans ${diffDays} j`, color: '#d97706', bg: '#fef3c7', level: 2, due: v.next_due_date };
  return { label: 'À jour', color: '#16a34a', bg: '#dcfce7', level: 0, check: true, due: v.next_due_date };
}

// Âge lisible depuis la date de naissance ("2 ans", "8 mois", "3 semaines")
function formatAge(birthDate) {
  if (!birthDate) return null;
  const birth = new Date(birthDate + 'T00:00:00');
  if (isNaN(birth)) return null;
  const days = Math.floor((Date.now() - birth.getTime()) / 86400000);
  if (days < 0) return null;
  if (days < 60) return `${Math.max(1, Math.floor(days / 7))} semaine${days >= 14 ? 's' : ''}`;
  const months = Math.floor(days / 30.44);
  if (months < 24) return `${months} mois`;
  const years = Math.floor(days / 365.25);
  return `${years} an${years > 1 ? 's' : ''}`;
}

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })
  : null;

export default function MonChienScreen({ onNavigate }) {
  const { profile } = useAuth();
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dogModal, setDogModal] = useState(null); // null | 'add' | dog object
  const [totalCourses, setTotalCourses] = useState(0);

  const loadDogs = async () => {
    if (!profile) return;
    const { data } = await supabase.from('dogs').select('*')
      .eq('owner_id', profile.id).order('created_at');
    setDogs(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    loadDogs();
    // Compteur de cours suivis — info club, chargée uniquement si le flag est actif
    if (CLUB_ENABLED && profile) {
      supabase.from('course_attendance').select('id', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .then(({ count }) => { if (count != null) setTotalCourses(count); });
    }
  }, [profile]); // eslint-disable-line

  // Vaccins qui demandent une action (expirés ou rappel < 30 j) sur tous les chiens
  const alerts = dogs.flatMap(dog =>
    VACCINS.map(nom => {
      const v = (dog.vaccines ?? []).find(x => x.name === nom);
      const s = vaccinStatus(v);
      return s.level >= 2 ? { dogName: dog.name, vaccin: VACCINS_LABELS[nom], ...s } : null;
    }).filter(Boolean)
  );

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ background: 'var(--header-grad)', borderBottom: '1px solid var(--border)', padding: 'calc(env(safe-area-inset-top,0px) + 16px) 24px 28px' }}>
        {onNavigate && (
          <button
            onClick={() => onNavigate('profil')}
            style={{ background: '#ffffff', boxShadow: 'var(--sh-pill)', border: 'none', borderRadius: 10, padding: '7px 12px', fontSize: 12, fontWeight: 700, color: 'var(--bleu-texte)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
          >
            <Icon name="arrowLeft" size={13} color="var(--bleu-texte)" /> Profil
          </button>
        )}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: 'var(--bleu-texte)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          <Icon name="paw" size={14} color="var(--bleu-texte)" /> Mon chien
        </div>
        <div style={{ color: 'var(--ink)', fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-title)' }}>
          {dogs.length > 1 ? 'Mes chiens' : dogs.length === 1 ? dogs[0].name : 'Mon compagnon'}
        </div>
        <div style={{ color: 'var(--ink-soft)', fontSize: 13, marginTop: 4 }}>
          Profil, carnet de vaccination et rappels au même endroit.
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* ── Alertes vaccins (expirés ou rappel sous 30 jours) ────── */}
        {!loading && alerts.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,var(--orange-light))', border: '1.5px solid #fde68a', borderRadius: 16, padding: '12px 16px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: alerts.length ? 8 : 0 }}>
              <Icon name="warning" size={20} color="#d97706" />
              <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
                {alerts.length > 1 ? `${alerts.length} vaccins demandent ton attention` : 'Un vaccin demande ton attention'}
              </div>
            </div>
            {alerts.slice(0, 4).map((a, i) => (
              <div key={i} style={{ fontSize: 12, color: '#b45309', marginLeft: 30, marginTop: 2 }}>
                {a.dogName} · {a.vaccin} : {a.label.toLowerCase()}{a.due ? ` (${fmtDate(a.due)})` : ''}
              </div>
            ))}
          </div>
        )}

        {/* ── Cartes chiens ───────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1 }}>Mes chiens</div>
          {dogs.length > 0 && (
            <button
              onClick={() => setDogModal('add')}
              style={{ background: 'var(--cyan-light)', color: 'var(--cyan)', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
            >
              + Ajouter
            </button>
          )}
        </div>

        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--gray-mid)', fontSize: 13 }}>Chargement...</div>
        ) : dogs.length === 0 ? (
          <button type="button"
            onClick={() => setDogModal('add')}
            style={{ font: 'inherit', color: 'inherit', width: '100%',  background: '#fff', borderRadius: 18, padding: '28px 20px', textAlign: 'center', border: '2px dashed var(--border)', cursor: 'pointer', boxShadow: '0 2px 16px rgba(43,171,225,0.06)' }}
          >
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--orange-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <Icon name="dog" size={32} color="#fbbf24" />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Ajoute ton chien</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4, lineHeight: 1.5 }}>
              Photo, race, date de naissance et carnet de vaccination, pour suivre ses rappels et personnaliser tes contenus.
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: 'var(--cyan)', color: '#fff', padding: '10px 18px', borderRadius: 12, fontSize: 13, fontWeight: 800 }}>
              <Icon name="plus" size={14} color="#fff" /> Créer son profil
            </div>
          </button>
        ) : dogs.map(dog => {
          const age = formatAge(dog.birth_date);
          return (
            <div key={dog.id} style={{ background: '#fff', borderRadius: 18, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 14, overflow: 'hidden' }}>

              {/* En-tête chien */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 14px 12px' }}>
                <div style={{ width: 64, height: 64, background: 'var(--orange-light)', borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                  {dog.photo_url
                    ? <img src={dog.photo_url} alt={dog.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <Icon name="dog" size={30} color="#fbbf24" />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>{dog.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
                    {dog.breed ?? 'Race non renseignée'}
                    {dog.sex ? ` · ${dog.sex === 'M' ? 'Mâle' : dog.sex === 'F' ? 'Femelle' : dog.sex}` : ''}
                    {age ? ` · ${age}` : ''}
                    {dog.reproductive_status ? ` · ${dog.reproductive_status}` : ''}
                  </div>
                  {(dog.chip_number || (CLUB_ENABLED && totalCourses > 0)) && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {dog.chip_number && (
                        <span style={{ background: 'var(--gray-bg-alt)', color: 'var(--gray)', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 8 }}>
                          Puce {dog.chip_number}
                        </span>
                      )}
                      {CLUB_ENABLED && totalCourses > 0 && (
                        <span style={{ background: 'var(--cyan-light)', color: 'var(--cyan)', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Icon name="paw" size={11} color="#2BABE1" /> {totalCourses} cours suivi{totalCourses > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setDogModal(dog)}
                  aria-label={`Modifier ${dog.name}`}
                  style={{ background: 'var(--gray-bg)', border: 'none', borderRadius: 10, width: 36, height: 36, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                ><Icon name="edit" size={16} color="#6b7280" /></button>
              </div>

              {/* Carnet de vaccination */}
              <div style={{ borderTop: '1px solid var(--gray-bg-alt)', padding: '10px 14px 14px' }}>
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 0.8, margin: '4px 0 8px' }}>
                  <Icon name="heart" size={12} color="#ef4444" /> Vaccins
                </div>
                {VACCINS.map(nom => {
                  const v = (dog.vaccines ?? []).find(x => x.name === nom);
                  const s = vaccinStatus(v);
                  return (
                    <div key={nom} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid #f9fafb' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{VACCINS_LABELS[nom]}</div>
                        {s.due && (
                          <div style={{ fontSize: 11, color: 'var(--gray-mid)', marginTop: 1 }}>Prochain rappel : {fmtDate(s.due)}</div>
                        )}
                      </div>
                      <span style={{ background: s.bg, color: s.color, fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 10, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {s.check && <Icon name="check" size={11} color={s.color} />}
                        {s.label}
                      </span>
                    </div>
                  );
                })}
                <button
                  onClick={() => setDogModal(dog)}
                  style={{ width: '100%', marginTop: 10, background: 'var(--cyan-light)', color: 'var(--cyan)', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <Icon name="edit" size={13} color="#2BABE1" /> Mettre à jour le carnet
                </button>
              </div>
            </div>
          );
        })}

        {/* ── Raccourcis contenus ─────────────────────────────────── */}
        {onNavigate && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Pour aller plus loin</div>
            <button type="button"
              onClick={() => onNavigate('fiches')}
              style={{ border: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%',  background: '#fff', borderRadius: 18, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(31,31,32,0.08)', cursor: 'pointer', marginBottom: 10 }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: 'var(--cyan-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="heart" size={20} color="#2BABE1" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Santé & bien-être</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>Nos fiches santé, quotidien et éducation.</div>
              </div>
              <Icon name="arrowRight" size={14} color="#9ca3af" />
            </button>
            <button type="button"
              onClick={() => onNavigate('apprendre')}
              style={{ border: 0, font: 'inherit', color: 'inherit', textAlign: 'left', width: '100%',  background: '#fff', borderRadius: 18, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(31,31,32,0.08)', cursor: 'pointer' }}
            >
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="book" size={20} color="#9a3412" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Apprendre</div>
                <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>Articles et conseils gratuits pour progresser ensemble.</div>
              </div>
              <Icon name="arrowRight" size={14} color="#9ca3af" />
            </button>
          </>
        )}
      </div>

      {dogModal && (
        <DogEditModal
          dog={dogModal === 'add' ? null : dogModal}
          onClose={() => setDogModal(null)}
          onSaved={() => { setDogModal(null); loadDogs(); }}
        />
      )}
    </div>
  );
}
