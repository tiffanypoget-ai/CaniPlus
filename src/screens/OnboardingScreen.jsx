// src/screens/OnboardingScreen.jsx
// Écran affiché à la première connexion :
// Étape 1 — type de cours
// Étape 2 — profil chien obligatoire (au moins 1)

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

const COURSE_OPTIONS = [
  { key: 'group',   icon: 'users', title: 'Cours collectifs',   desc: 'Planning annuel avec le groupe' },
  { key: 'private', icon: 'star', title: 'Cours privés',       desc: 'Séances individuelles avec Tiffany' },
  { key: 'both',    icon: 'paw', title: 'Les deux',           desc: 'Collectifs + séances privées' },
];

const SEX_OPTIONS = [
  { key: 'M', label: '♂ Mâle' },
  { key: 'F', label: '♀ Femelle' },
];

function Step1({ selected, setSelected, onNext }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', margin: 0 }}>Bienvenue !</h2>
        <Icon name="wave" size={24} color="#2BABE1" />
      </div>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 24, lineHeight: 1.5 }}>
        Pour quels types de cours venez-vous au club ?
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        {COURSE_OPTIONS.map(opt => {
          const isSelected = selected === opt.key;
          return (
            <button key={opt.key} onClick={() => setSelected(opt.key)} style={{
              display: 'flex', alignItems: 'center', gap: 16, padding: '16px 18px',
              background: isSelected ? '#e8f7fd' : '#f8f9fb',
              border: `2px solid ${isSelected ? '#2BABE1' : '#e5e7eb'}`,
              borderRadius: 18, cursor: 'pointer', textAlign: 'left', width: '100%',
              transition: 'border-color 0.15s, background 0.15s',
            }}>
              <div style={{ width: 50, height: 50, borderRadius: 14, flexShrink: 0, background: isSelected ? 'rgba(43,171,225,0.15)' : '#fff', border: `1.5px solid ${isSelected ? 'rgba(43,171,225,0.3)' : '#e5e7eb'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>
                <Icon name={opt.icon} size={24} color={isSelected ? '#2BABE1' : '#6b7280'} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: isSelected ? '#1a8bbf' : '#1F1F20', marginBottom: 2 }}>{opt.title}</div>
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.4 }}>{opt.desc}</div>
              </div>
              <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, border: `2px solid ${isSelected ? '#2BABE1' : '#d1d5db'}`, background: isSelected ? '#2BABE1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
                {isSelected && <Icon name="check" size={14} color="#fff" />}
              </div>
            </button>
          );
        })}
      </div>

      <button onClick={onNext} disabled={!selected} style={{
        marginTop: 24, width: '100%', padding: '17px',
        background: selected ? 'linear-gradient(135deg, #2BABE1, #1a8bbf)' : '#e5e7eb',
        border: 'none', borderRadius: 16,
        color: selected ? '#fff' : '#9ca3af',
        fontSize: 16, fontWeight: 800, cursor: selected ? 'pointer' : 'not-allowed',
        boxShadow: selected ? '0 8px 24px rgba(43,171,225,0.35)' : 'none',
      }}>
        Suivant →
      </button>
      <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#9ca3af' }}>Étape 1 sur 2</p>
    </div>
  );
}

function DogCard({ dog, index, onChange, onRemove, canRemove }) {
  const currentYear = new Date().getFullYear();
  return (
    <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 16, padding: '16px', marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icon name="dog" size={16} color="#92400e" />
          Chien {index + 1}
        </div>
        {canRemove && (
          <button onClick={onRemove} style={{ background: '#fee2e2', border: 'none', borderRadius: 8, padding: '4px 10px', fontSize: 12, color: '#ef4444', fontWeight: 700, cursor: 'pointer' }}>
            Supprimer
          </button>
        )}
      </div>

      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Nom *</label>
      <input
        value={dog.name}
        onChange={e => onChange({ ...dog, name: e.target.value })}
        placeholder="Ex: Max, Luna…"
        style={{ width: '100%', padding: '11px 13px', background: '#fff', border: `2px solid ${!dog.name ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 12, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' }}
      />

      <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Race *</label>
      <input
        value={dog.breed}
        onChange={e => onChange({ ...dog, breed: e.target.value })}
        placeholder="Ex: Berger allemand, Labrador…"
        style={{ width: '100%', padding: '11px 13px', background: '#fff', border: `2px solid ${!dog.breed ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 12, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', outline: 'none' }}
      />

      <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Année de naissance *</label>
          <input
            type="number"
            value={dog.birth_year}
            onChange={e => onChange({ ...dog, birth_year: e.target.value })}
            placeholder={String(currentYear - 3)}
            min={currentYear - 30}
            max={currentYear}
            style={{ width: '100%', padding: '11px 13px', background: '#fff', border: `2px solid ${!dog.birth_year ? '#fca5a5' : '#e5e7eb'}`, borderRadius: 12, fontSize: 14, boxSizing: 'border-box', outline: 'none' }}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', display: 'block', marginBottom: 4 }}>Sexe *</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {SEX_OPTIONS.map(s => (
              <button
                key={s.key}
                onClick={() => onChange({ ...dog, sex: s.key })}
                style={{
                  flex: 1, padding: '11px 6px', background: dog.sex === s.key ? '#e8f7fd' : '#fff',
                  border: `2px solid ${dog.sex === s.key ? '#2BABE1' : !dog.sex ? '#fca5a5' : '#e5e7eb'}`,
                  borderRadius: 12, fontSize: 13, fontWeight: 700,
                  color: dog.sex === s.key ? '#1a8bbf' : '#374151', cursor: 'pointer',
                }}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Step2({ userId, onDone, onBack, courseType }) {
  const [dogs, setDogs] = useState([{ name: '', breed: '', birth_year: '', sex: '' }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateDog = (i, val) => setDogs(ds => ds.map((d, idx) => idx === i ? val : d));
  const removeDog = (i) => setDogs(ds => ds.filter((_, idx) => idx !== i));
  const addDog = () => setDogs(ds => [...ds, { name: '', breed: '', birth_year: '', sex: '' }]);

  const allValid = dogs.length > 0 && dogs.every(d => d.name.trim() && d.breed.trim() && d.birth_year && d.sex);

  const handleConfirm = async () => {
    if (!allValid) { setError('Merci de remplir tous les champs pour chaque chien.'); return; }
    setLoading(true); setError('');
    try {
      // Enregistrer type de cours + onboarding_done
      await supabase.from('profiles').update({ course_type: courseType, onboarding_done: true }).eq('id', userId);
      // Enregistrer les chiens
      await supabase.from('dogs').insert(dogs.map(d => ({
        owner_id: userId,
        name: d.name.trim(),
        breed: d.breed.trim(),
        birth_year: parseInt(d.birth_year, 10),
        sex: d.sex,
        vaccinated: false,
      })));
      onDone();
    } catch (e) {
      setError('Une erreur est survenue. Veuillez réessayer.');
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1F1F20', margin: 0 }}>Votre chien</h2>
        <Icon name="dog" size={24} color="#f59e0b" />
      </div>
      <p style={{ fontSize: 14, color: '#6b7280', marginBottom: 20, lineHeight: 1.5 }}>
        Ajoutez le profil de votre/vos chien(s). Ces informations sont nécessaires pour l'inscription aux cours.
      </p>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {dogs.map((dog, i) => (
          <DogCard
            key={i}
            index={i}
            dog={dog}
            onChange={val => updateDog(i, val)}
            onRemove={() => removeDog(i)}
            canRemove={dogs.length > 1}
          />
        ))}

        <button onClick={addDog} style={{ width: '100%', padding: '12px', background: '#f4f6f8', border: '2px dashed #d1d5db', borderRadius: 14, fontSize: 14, fontWeight: 700, color: '#6b7280', cursor: 'pointer', marginBottom: 8 }}>
          + Ajouter un autre chien
        </button>
      </div>

      {error && (
        <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: 10, fontSize: 13, fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Icon name="warning" size={16} color="#dc2626" />
          {error}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={onBack} style={{ flex: 1, padding: '14px', background: '#f4f6f8', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700, color: '#6b7280', cursor: 'pointer' }}>
          ← Retour
        </button>
        <button onClick={handleConfirm} disabled={!allValid || loading} style={{
          flex: 2, padding: '14px',
          background: !allValid ? '#e5e7eb' : loading ? '#93c5e8' : 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
          border: 'none', borderRadius: 14,
          color: !allValid ? '#9ca3af' : '#fff',
          fontSize: 15, fontWeight: 800,
          cursor: !allValid || loading ? 'not-allowed' : 'pointer',
          boxShadow: allValid ? '0 8px 24px rgba(43,171,225,0.35)' : 'none',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          {loading ? (
            <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Enregistrement...</>
          ) : (
            'Commencer →'
          )}
        </button>
      </div>
      <p style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: '#9ca3af' }}>Étape 2 sur 2</p>
    </div>
  );
}

export default function OnboardingScreen({ userId, onDone }) {
  const [step, setStep] = useState(1);
  const [courseType, setCourseType] = useState(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(160deg, #1F1F20 0%, #2a3a4a 55%, #2BABE1 100%)',
        padding: 'calc(env(safe-area-inset-top, 0px) + 40px) 32px 44px',
        position: 'relative', overflow: 'hidden', flexShrink: 0,
      }}>
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'rgba(43,171,225,0.12)', top: -70, right: -70 }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 54, color: '#fff', lineHeight: 1.1 }}>CaniPlus</div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600, marginTop: 4, letterSpacing: 0.5 }}>Votre espace club canin</div>
        </div>
        <div style={{ position: 'absolute', bottom: -8, right: 24, fontSize: 90, opacity: 0.08, display: 'flex' }}>
          <Icon name="paw" size={90} color="rgba(0,0,0,0.08)" />
        </div>
      </div>

      {/* Carte blanche */}
      <div style={{
        flex: 1, background: '#fff',
        borderRadius: '28px 28px 0 0', marginTop: -20,
        padding: '32px 24px calc(env(safe-area-inset-bottom,0px) + 20px)',
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>
        {step === 1 ? (
          <Step1
            selected={courseType}
            setSelected={setCourseType}
            onNext={() => setStep(2)}
          />
        ) : (
          <Step2
            userId={userId}
            courseType={courseType}
            onDone={onDone}
            onBack={() => setStep(1)}
          />
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
