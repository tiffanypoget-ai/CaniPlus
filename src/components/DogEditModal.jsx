// src/components/DogEditModal.jsx
import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from './Icons';

const VACCINS_DEFAUT = ['Rage', 'CHPL', 'Leptospirose', 'Toux du chenil'];

const VACCINS_LABELS = {
  'Rage':           'Rage',
  'CHPL':           'CHPL / DHPPI',
  'Leptospirose':   'Leptospirose',
  'Toux du chenil': 'Toux du chenil',
};

const VACCINS_INTERVALLES = {
  'Rage':           3,
  'CHPL':           3,
  'Leptospirose':   1,
  'Toux du chenil': 1,
};

function calculerProchainRappel(lastDate, nomVaccin) {
  if (!lastDate) return '';
  const date = new Date(lastDate);
  date.setFullYear(date.getFullYear() + (VACCINS_INTERVALLES[nomVaccin] ?? 1));
  return date.toISOString().slice(0, 10);
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', background: '#fff', color: '#1F1F20',
};

export default function DogEditModal({ dog, onClose, onSaved }) {
  const { profile } = useAuth();
  const fileRef = useRef();

  const [form, setForm] = useState({
    name: dog?.name ?? '',
    breed: dog?.breed ?? '',
    sex: dog?.sex ?? '',
    reproductive_status: dog?.reproductive_status ?? '',
    birth_date: dog?.birth_date ?? '',
    chip_number: dog?.chip_number ?? '',
    vaccines: dog?.vaccines ?? [],
    photo_url: dog?.photo_url ?? null,
  });
  const [photoPreview, setPhotoPreview] = useState(dog?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Photo du chien ────────────────────────────────────────────────────────
  const handlePhotoChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const ext = file.name.split('.').pop();
      const path = `${profile.id}/dog_${dog?.id ?? Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('dog-photos').upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('dog-photos').getPublicUrl(path);
      setForm(f => ({ ...f, photo_url: data.publicUrl }));
      setPhotoPreview(data.publicUrl);
    } catch (e) {
      setError('Erreur upload : ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  // ── Vaccins ───────────────────────────────────────────────────────────────
  const getVaccin = (nom) =>
    form.vaccines.find(v => v.name === nom) ?? { name: nom, last_date: '', next_due_date: '' };

  const setVaccin = (nom, field, val) => {
    setForm(f => {
      const vaccines = [...f.vaccines];
      const idx = vaccines.findIndex(v => v.name === nom);
      const current = vaccines[idx] ?? { name: nom, last_date: '', next_due_date: '' };
      const updated = { ...current, [field]: val };
      if (field === 'last_date' && val && !current.next_due_date) {
        updated.next_due_date = calculerProchainRappel(val, nom);
      }
      if (idx >= 0) vaccines[idx] = updated;
      else vaccines.push(updated);
      return { ...f, vaccines: vaccines.filter(v => v.last_date || v.next_due_date) };
    });
  };

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.name.trim()) { setError('Le prénom est obligatoire'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        name: form.name.trim(),
        breed: form.breed || null,
        sex: form.sex || null,
        reproductive_status: form.reproductive_status || null,
        birth_date: form.birth_date || null,
        chip_number: form.chip_number || null,
        vaccinated: form.vaccines.some(v => v.last_date),
        vaccines: form.vaccines,
        photo_url: form.photo_url || null,
      };
      if (dog?.id) {
        const { error } = await supabase.from('dogs').update(payload).eq('id', dog.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('dogs').insert({ ...payload, owner_id: profile.id });
        if (error) throw error;
      }
      onSaved();
    } catch (e) {
      setError('Erreur : ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 430, maxHeight: '92dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog?.id ? 'Modifier' : 'Ajouter'} un chien</div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="close" size={16} color="#6b7280" /></button>
        </div>

        {/* Body scrollable */}
        <div style={{ overflowY: 'auto', padding: 20, flex: 1, minHeight: 0 }}>

          {/* Photo */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              onClick={() => fileRef.current.click()}
              style={{ width: 90, height: 90, borderRadius: '50%', margin: '0 auto', cursor: 'pointer', overflow: 'hidden', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, border: '3px dashed #fde68a', position: 'relative' }}
            >
              {photoPreview
                ? <img src={photoPreview} alt="chien" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <Icon name="dog" size={40} color="#f59e0b" />}
              <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#2BABE1', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="upload" size={14} color="#fff" /></div>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>
              {uploading ? 'Upload en cours…' : 'Toucher pour changer la photo'}
            </div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>

          {/* Infos */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Informations</div>

          <input placeholder="Prénom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />
          <input placeholder="Race" value={form.breed} onChange={e => setForm(f => ({ ...f, breed: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value, reproductive_status: '' }))} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Sexe</option>
              <option value="Mâle">Mâle</option>
              <option value="Femelle">Femelle</option>
            </select>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Date de naissance</label>
              <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} style={{ ...inputStyle }} />
            </div>
          </div>

          <select
            value={form.reproductive_status}
            onChange={e => setForm(f => ({ ...f, reproductive_status: e.target.value }))}
            style={{ ...inputStyle, marginBottom: 10 }}
          >
            <option value="">État reproducteur</option>
            {form.sex === 'Mâle' || form.sex === '' ? (
              <>
                <option value="Entier">Entier</option>
                <option value="Castré">Castré</option>
                <option value="Castration chimique">Castration chimique</option>
              </>
            ) : null}
            {form.sex === 'Femelle' || form.sex === '' ? (
              <>
                <option value="Entière">Entière</option>
                <option value="Stérilisée">Stérilisée</option>
                <option value="Stérilisation chimique">Stérilisation chimique</option>
              </>
            ) : null}
          </select>

          <input placeholder="Numéro de puce électronique" value={form.chip_number} onChange={e => setForm(f => ({ ...f, chip_number: e.target.value }))} style={{ ...inputStyle, marginBottom: 20 }} />

          {/* Vaccins */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Vaccins & rappels</div>
          <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#0369a1', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <Icon name="sparkle" size={14} color="#0369a1" style={{ marginTop: 2, flexShrink: 0 }} /> <span>Entre la date du dernier vaccin — la date de rappel est calculée automatiquement.</span>
          </div>

          {VACCINS_DEFAUT.map(nom => {
            const v = getVaccin(nom);
            const intervalleAns = VACCINS_INTERVALLES[nom] ?? 1;
            const intervalleLabel = intervalleAns === 1 ? 'rappel annuel' : `rappel tous les ${intervalleAns} ans`;

            let statut = null;
            if (v.next_due_date) {
              const diffDays = Math.round((new Date(v.next_due_date) - new Date()) / 86400000);
              if (diffDays < 0) statut = { label: 'Expiré', color: '#ef4444', bg: '#fee2e2' };
              else if (diffDays <= 30) statut = { label: `Dans ${diffDays}j`, color: '#d97706', bg: '#fef3c7' };
              else statut = { label: 'À jour', color: '#16a34a', bg: '#dcfce7', hasCheck: true };
            }

            return (
              <div key={nom} style={{ background: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20', display: 'flex', alignItems: 'center', gap: 6 }}><Icon name="heart" size={14} color="#ef4444" /> {VACCINS_LABELS[nom] ?? nom}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{intervalleLabel}</span>
                  </div>
                  {statut && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: statut.color, background: statut.bg, padding: '2px 8px', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                      {statut.hasCheck && <Icon name="check" size={12} color={statut.color} />}
                      {statut.label}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Dernier vaccin</label>
                    <input type="date" value={v.last_date} onChange={e => setVaccin(nom, 'last_date', e.target.value)} style={{ ...inputStyle }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Prochain rappel</label>
                    <div style={{ ...inputStyle, background: '#f3f4f6', color: v.next_due_date ? '#1F1F20' : '#9ca3af', display: 'flex', alignItems: 'center', minHeight: 40 }}>
                      {v.next_due_date
                        ? new Date(v.next_due_date).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : 'Automatique'}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {error && <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="warning" size={16} color="#ef4444" /> {error}</div>}

          {/* Bouton sticky */}
          <div style={{ position: 'sticky', bottom: 0, background: '#fff', paddingTop: 10, paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))', marginTop: 8, borderTop: '1px solid #f0f0f0' }}>
            <button
              onClick={handleSave}
              disabled={saving || uploading}
              style={{ width: '100%', background: saving ? '#9ca3af' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              {saving ? 'Enregistrement…' : dog?.id ? <><Icon name="check" size={16} color="#fff" /> Enregistrer les modifications</> : <><Icon name="plus" size={16} color="#fff" /> Ajouter ce chien</>}
            </button>
          </div>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>,
    document.body
  );
}
