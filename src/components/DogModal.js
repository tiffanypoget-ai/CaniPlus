// src/components/DogModal.js
// Modal pour ajouter ou modifier un chien

import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 20 }, (_, i) => CURRENT_YEAR - i);

export default function DogModal({ dog, ownerId, onClose, onSuccess }) {
  const isEdit = !!dog?.id;

  const [name,       setName]       = useState(dog?.name       ?? '');
  const [breed,      setBreed]      = useState(dog?.breed      ?? '');
  const [sex,        setSex]        = useState(dog?.sex        ?? '');
  const [birthYear,  setBirthYear]  = useState(dog?.birth_year ?? '');
  const [vaccinated,    setVaccinated]    = useState(dog?.vaccinated  ?? false);
  const [neutered,      setNeutered]      = useState(dog?.neutered    ?? false);
  const [photoUrl,      setPhotoUrl]      = useState(dog?.photo_url   ?? null);
  const [photoLoading,  setPhotoLoading]  = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [deleting,      setDeleting]      = useState(false);
  const [error,         setError]         = useState(null);
  const photoInputRef = useRef(null);

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      const ext  = file.name.split('.').pop();
      const path = `${ownerId ?? dog?.owner_id}/${dog?.id ?? 'new'}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('dog-photos')
        .upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('dog-photos').getPublicUrl(path);
      setPhotoUrl(urlData?.publicUrl + '?t=' + Date.now());
    } catch (e) {
      setError('Erreur lors du téléchargement de la photo.');
    }
    setPhotoLoading(false);
  };

  const handleDelete = async () => {
    if (!dog?.id) return;
    if (!window.confirm(`Retirer ${dog.name} de ton profil ?\n\nÀ utiliser si ${dog.name} n'est plus à tes côtés (décédé, perdu, donné, ou autre).\n\nSes inscriptions aux cours à venir seront annulées.`)) return;
    setDeleting(true);
    const { error: e } = await supabase.from('dogs').delete().eq('id', dog.id);
    if (e) { setError('Erreur lors de la suppression.'); setDeleting(false); return; }
    onSuccess();
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Le nom du chien est obligatoire.'); return; }
    setLoading(true); setError(null);
    try {
      const payload = {
        name:       name.trim(),
        breed:      breed.trim() || null,
        sex:        sex          || null,
        birth_year: birthYear    || null,
        vaccinated,
        neutered,
        photo_url:  photoUrl     || null,
      };
      if (isEdit) {
        const { error: e } = await supabase.from('dogs').update(payload).eq('id', dog.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('dogs').insert({ ...payload, owner_id: ownerId });
        if (e) throw e;
      }
      onSuccess();
    } catch (e) {
      setError('Erreur lors de la sauvegarde. Réessaie.');
      setLoading(false);
    }
  };

  // Label castration selon le sexe
  const neuteredLabel = sex === 'F' ? 'Stérilisée' : sex === 'M' ? 'Castré' : 'Castré / Stérilisé(e)';
  const neuteredSub   = sex === 'F' ? 'Ne se reproduit pas' : sex === 'M' ? 'Ne se reproduit pas' : 'Ne se reproduit pas';

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.2s ease' }} />

      {/* Bottom sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderRadius: '24px 24px 0 0', zIndex: 201,
        padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
      }}>
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>
            {isEdit ? (
              <><Icon name="edit" size={20} color="#1F1F20" /> Modifier le chien</>
            ) : (
              <><Icon name="dog" size={20} color="#1F1F20" /> Ajouter un chien</>
            )}
          </div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color="#6b7280" />
          </button>
        </div>

        {/* Photo */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 20 }}>
          <input
            ref={photoInputRef} type="file" accept="image/*"
            onChange={handlePhotoChange}
            style={{ display: 'none' }}
          />
          <div
            onClick={() => photoInputRef.current?.click()}
            style={{
              width: 100, height: 100, borderRadius: '50%',
              background: photoUrl ? 'transparent' : '#f4f6f8',
              border: `2.5px dashed ${photoUrl ? '#2BABE1' : '#d1d5db'}`,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', overflow: 'hidden', position: 'relative',
              transition: 'border-color 0.2s',
            }}
          >
            {photoLoading ? (
              <div style={{ width: 28, height: 28, border: '3px solid #e5e7eb', borderTopColor: '#2BABE1', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
            ) : photoUrl ? (
              <img src={photoUrl} alt="chien" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <>
                <Icon name="dog" size={28} color="#6b7280" />
                <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600, marginTop: 4 }}>Ajouter photo</div>
              </>
            )}
          </div>
          {photoUrl && !photoLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); photoInputRef.current?.click(); }}
              style={{ marginTop: 8, background: 'none', border: 'none', fontSize: 12, color: '#2BABE1', fontWeight: 700, cursor: 'pointer' }}
            >
              Changer la photo
            </button>
          )}
        </div>

        {/* Champs */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Nom */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Nom *</label>
            <input
              value={name} onChange={e => setName(e.target.value)}
              placeholder="Ex : Rex"
              style={{ width: '100%', padding: '13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: '#1F1F20', boxSizing: 'border-box' }}
            />
          </div>

          {/* Race */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Race</label>
            <input
              value={breed} onChange={e => setBreed(e.target.value)}
              placeholder="Ex : Border Collie"
              style={{ width: '100%', padding: '13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: '#1F1F20', boxSizing: 'border-box' }}
            />
          </div>

          {/* Sexe + Année naissance */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Sexe</label>
              <select
                value={sex} onChange={e => setSex(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: sex ? '#1F1F20' : '#9ca3af', boxSizing: 'border-box', appearance: 'none' }}
              >
                <option value="">—</option>
                <option value="M">Mâle</option>
                <option value="F">Femelle</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>Né(e) en</label>
              <select
                value={birthYear} onChange={e => setBirthYear(e.target.value ? Number(e.target.value) : '')}
                style={{ width: '100%', padding: '13px 14px', background: '#f4f6f8', border: '2px solid #e5e7eb', borderRadius: 12, fontSize: 15, color: birthYear ? '#1F1F20' : '#9ca3af', boxSizing: 'border-box', appearance: 'none' }}
              >
                <option value="">—</option>
                {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>

          {/* Vacciné */}
          <div
            onClick={() => setVaccinated(!vaccinated)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, background: vaccinated ? '#dcfce7' : '#f4f6f8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', border: `2px solid ${vaccinated ? '#86efac' : 'transparent'}`, transition: 'all 0.2s' }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 6, background: vaccinated ? '#16a34a' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
              {vaccinated && <Icon name="check" size={16} color="#fff" />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>Vacciné{sex === 'F' ? 'e' : ''}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>Carnet de vaccination à jour</div>
            </div>
          </div>

          {/* Castré / Stérilisé */}
          <div
            onClick={() => setNeutered(!neutered)}
            style={{ display: 'flex', alignItems: 'center', gap: 14, background: neutered ? '#eff6ff' : '#f4f6f8', borderRadius: 14, padding: '14px 16px', cursor: 'pointer', border: `2px solid ${neutered ? '#93c5fd' : 'transparent'}`, transition: 'all 0.2s' }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 6, background: neutered ? '#2563eb' : '#e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'background 0.2s' }}>
              {neutered && <Icon name="check" size={16} color="#fff" />}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>{neuteredLabel}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{neuteredSub}</div>
            </div>
          </div>

        </div>

        {/* Erreur */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginTop: 14, fontSize: 13, color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={16} color="#dc2626" /> {error}
          </div>
        )}

        {/* Bouton */}
        <button
          onClick={handleSubmit} disabled={loading}
          style={{
            width: '100%', marginTop: 20,
            background: loading ? '#93c5fd' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
            color: '#fff', border: 'none', borderRadius: 16, padding: '16px',
            fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(43,171,225,0.35)',
          }}
        >
          {loading
            ? <><div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Enregistrement...</>
            : isEdit ? <><Icon name="check" size={18} color="#fff" /> Enregistrer les modifications</> : <><Icon name="dog" size={18} color="#fff" /> Ajouter le chien</>}
        </button>

        {isEdit && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              width: '100%', marginTop: 10,
              background: 'none', border: '1.5px solid #fecaca',
              borderRadius: 16, padding: '13px',
              fontSize: 14, fontWeight: 700,
              color: deleting ? '#fca5a5' : '#ef4444',
              cursor: deleting ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {deleting
              ? <><div style={{ width: 16, height: 16, border: '2px solid rgba(239,68,68,0.3)', borderTopColor: '#ef4444', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Suppression...</>
              : <><Icon name="trash" size={16} color="#ef4444" /> Retirer ce chien</>}
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes spin    { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
