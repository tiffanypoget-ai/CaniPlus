// src/screens/MonChienScreen.js
// Onglet "Mon chien" — profils des chiens et suivi des vaccins.
// Section extraite de ProfilScreen lors du passage à la navigation grand
// public (le Profil se recentre sur le compte, premium et les achats).
// Réutilise DogEditModal (photo, race, sexe, naissance, vaccins).
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';
import DogEditModal from '../components/DogEditModal';
import { CLUB_ENABLED } from '../lib/features';

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

  const toVerify = dogs.filter(d => !d.vaccinated);

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 800, color: '#2BABE1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
          <Icon name="paw" size={14} color="#2BABE1" /> Mon chien
        </div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 800 }}>
          {dogs.length > 1 ? 'Mes chiens' : dogs.length === 1 ? dogs[0].name : 'Mon compagnon'}
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 }}>
          Profils, vaccins et infos santé au même endroit.
        </div>
      </div>

      <div style={{ padding: '16px 16px 100px' }}>

        {/* ── Rappel vaccins à vérifier ───────────────────────────── */}
        {!loading && toVerify.length > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#fffbeb,#fef3c7)', border: '1.5px solid #fde68a', borderRadius: 16, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <Icon name="warning" size={22} color="#d97706" />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
                {toVerify.length > 1 ? 'Des vaccins sont à vérifier' : `Vaccins de ${toVerify[0].name} à vérifier`}
              </div>
              <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>
                Ouvre la fiche de ton chien pour mettre à jour son carnet.
              </div>
            </div>
          </div>
        )}

        {/* ── Liste des chiens ────────────────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '4px 0 10px' }}>
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

        {loading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement...</div>
        ) : dogs.length === 0 ? (
          <div
            onClick={() => setDogModal('add')}
            style={{ background: '#f4f6f8', borderRadius: 14, padding: 20, display: 'flex', alignItems: 'center', gap: 12, border: '2px dashed #e5e7eb', cursor: 'pointer' }}
          >
            <Icon name="plus" size={20} color="#6b7280" />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#6b7280' }}>Ajouter mon chien</span>
          </div>
        ) : dogs.map(dog => (
          <div key={dog.id} onClick={() => setDogModal(dog)} style={{ background: '#fff', borderRadius: 18, padding: 14, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)', marginBottom: 8, cursor: 'pointer' }}>
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
                {CLUB_ENABLED && totalCourses > 0 && (
                  <span style={{ background: '#e8f7fd', color: '#2BABE1', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Icon name="paw" size={11} color="#2BABE1" /> {totalCourses} cours suivi{totalCourses > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setDogModal(dog); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, padding: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            ><Icon name="edit" size={18} color="#6b7280" /></button>
          </div>
        ))}

        {/* ── Raccourci fiches santé ──────────────────────────────── */}
        {onNavigate && (
          <div
            onClick={() => onNavigate('fiches')}
            style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(31,31,32,0.08)', marginTop: 16, cursor: 'pointer' }}
          >
            <div style={{ width: 44, height: 44, borderRadius: 12, background: '#e8f7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="heart" size={20} color="#2BABE1" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20' }}>Santé & bien-être</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>Retrouve nos fiches santé, quotidien et éducation.</div>
            </div>
            <Icon name="arrowRight" size={14} color="#9ca3af" />
          </div>
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
