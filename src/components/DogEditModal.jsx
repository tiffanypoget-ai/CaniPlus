// src/components/DogEditModal.jsx
import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

const VACCINS_DEFAUT = ['Rage', 'CHPL', 'Leptospirose', 'Toux du chenil'];

// Intervalles de rappel en années par vaccin (selon recommandations vétérinaires)
const VACCINS_INTERVALLES = {
  'Rage':           3,   // rappel tous les 3 ans (vaccins modernes)
  'CHPL':           3,   // Carré/Hépatite/Parvovirose : 3 ans
  'Leptospirose':   1,   // rappel annuel obligatoire
  'Toux du chenil': 1,   // rappel annuel (surtout en club / pension)
};

function calculerProchainRappel(lastDate, nomVaccin) {
  if (!lastDate) return '';
  const date = new Date(lastDate);
  const annees = VACCINS_INTERVALLES[nomVaccin] ?? 1;
  date.setFullYear(date.getFullYear() + annees);
  return date.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', background: '#fff', color: '#1F1F20',
};

export default function DogEditModal({ dog, onClose, onSaved }) {
  const { profile } = useAuth();
  const fileRef = useRef();
  const scanRef = useRef();

  const [form, setForm] = useState({
    name: dog?.name ?? '',
    breed: dog?.breed ?? '',
    sex: dog?.sex ?? '',
    birth_date: dog?.birth_date ?? '',
    chip_number: dog?.chip_number ?? '',
    vaccinated: dog?.vaccinated ?? false,
    vaccines: dog?.vaccines ?? [],
    photo_url: dog?.photo_url ?? null,
  });
  const [photoPreview, setPhotoPreview] = useState(dog?.photo_url ?? null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // ── Scan carnet ───────────────────────────────────────────────────────────
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);   // data URL de l'image scannée
  const [scanResult, setScanResult] = useState(null);     // données extraites à confirmer
  const [scanError, setScanError] = useState(null);

  // ── Gestion photo du chien ────────────────────────────────────────────────
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

  // ── Scan carnet de vaccination ────────────────────────────────────────────
  const handleScanChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setScanning(true);
    setScanError(null);
    setScanResult(null);

    try {
      // Convertir en base64
      const base64 = await fileToBase64(file);
      const mediaType = file.type || 'image/jpeg';

      // Afficher la preview immédiatement
      setScanPreview(URL.createObjectURL(file));

      // Appeler l'Edge Function
      const { data, error: fnErr } = await supabase.functions.invoke('scan-vaccine-booklet', {
        body: { image_base64: base64, media_type: mediaType },
      });

      if (fnErr) throw fnErr;
      if (data?.error) throw new Error(data.error);

      setScanResult(data);
    } catch (e) {
      setScanError('Scan impossible : ' + e.message);
    } finally {
      setScanning(false);
    }
  };

  // Redimensionne et compresse l'image avant envoi (max 1200px, qualité 0.85)
  // Les photos de téléphone font 3-10 MB — trop grandes pour l'API
  const fileToBase64 = (file) => new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 1200;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round((height * MAX) / width); width = MAX; }
        else { width = Math.round((width * MAX) / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve(dataUrl.split(',')[1]); // base64 sans le préfixe
    };
    img.onerror = reject;
    img.src = url;
  });

  // Appliquer les résultats du scan au formulaire
  const applyScanResult = () => {
    setForm(f => {
      const newForm = { ...f };

      // Nom, puce, date de naissance si détectés
      if (scanResult.dog_name && !f.name) newForm.name = scanResult.dog_name;
      if (scanResult.chip_number && !f.chip_number) newForm.chip_number = scanResult.chip_number;
      if (scanResult.birth_date && !f.birth_date) newForm.birth_date = scanResult.birth_date;

      // Vaccins : fusionner avec les données existantes
      const vaccines = [...f.vaccines];
      for (const scannedVaccin of (scanResult.vaccines ?? [])) {
        if (!scannedVaccin.last_date && !scannedVaccin.next_due_date) continue;
        const idx = vaccines.findIndex(v => v.name === scannedVaccin.name);
        const entry = {
          name: scannedVaccin.name,
          last_date: scannedVaccin.last_date ?? '',
          next_due_date: scannedVaccin.next_due_date
            ?? calculerProchainRappel(scannedVaccin.last_date, scannedVaccin.name),
        };
        if (idx >= 0) vaccines[idx] = entry;
        else vaccines.push(entry);
      }
      newForm.vaccines = vaccines.filter(v => v.last_date || v.next_due_date);
      return newForm;
    });
    setScanResult(null);
    setScanPreview(null);
  };

  // ── Gestion vaccins (saisie manuelle) ─────────────────────────────────────
  const getVaccin = (nom) => form.vaccines.find(v => v.name === nom) ?? { name: nom, last_date: '', next_due_date: '' };

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

  // ── Rendu de l'écran de confirmation scan ─────────────────────────────────
  if (scanResult) {
    const hasVaccines = (scanResult.vaccines ?? []).some(v => v.last_date);
    const confidenceColor = { high: '#16a34a', medium: '#d97706', low: '#ef4444' }[scanResult.confidence] ?? '#6b7280';
    const confidenceLabel = { high: '✓ Bonne lisibilité', medium: '~ Lisibilité moyenne', low: '⚠ Peu lisible' }[scanResult.confidence] ?? '';

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 430, maxHeight: '92dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* Header */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>📋 Résultat du scan</div>
            <button onClick={() => { setScanResult(null); setScanPreview(null); }} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
          </div>

          <div style={{ overflowY: 'auto', padding: 20, flex: 1, minHeight: 0 }}>

            {/* Preview image + confiance */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
              {scanPreview && (
                <img src={scanPreview} alt="scan" style={{ width: 70, height: 70, objectFit: 'cover', borderRadius: 12, border: '2px solid #e5e7eb', flexShrink: 0 }} />
              )}
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20', marginBottom: 4 }}>
                  Données extraites automatiquement
                </div>
                <span style={{ fontSize: 11, fontWeight: 700, color: confidenceColor, background: confidenceColor + '20', padding: '3px 10px', borderRadius: 8 }}>
                  {confidenceLabel}
                </span>
              </div>
            </div>

            {/* Données générales détectées */}
            {(scanResult.dog_name || scanResult.chip_number || scanResult.birth_date) && (
              <div style={{ background: '#f0f9ff', borderRadius: 12, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#0369a1', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Infos du chien</div>
                {scanResult.dog_name && <div style={{ fontSize: 13, color: '#1F1F20', marginBottom: 4 }}>🐕 Nom : <strong>{scanResult.dog_name}</strong></div>}
                {scanResult.chip_number && <div style={{ fontSize: 13, color: '#1F1F20', marginBottom: 4 }}>🔖 Puce : <strong>{scanResult.chip_number}</strong></div>}
                {scanResult.birth_date && <div style={{ fontSize: 13, color: '#1F1F20' }}>🎂 Naissance : <strong>{fmtDate(scanResult.birth_date)}</strong></div>}
              </div>
            )}

            {/* Vaccins détectés */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Vaccins détectés</div>

            {!hasVaccines && (
              <div style={{ background: '#fef3c7', borderRadius: 12, padding: 14, fontSize: 13, color: '#92400e' }}>
                ⚠️ Aucune date de vaccin n'a pu être lue. Essaie avec une meilleure photo (bonne lumière, bien à plat).
              </div>
            )}

            {(scanResult.vaccines ?? []).map((v, i) => {
              const nextAuto = v.next_due_date ?? calculerProchainRappel(v.last_date, v.name);
              if (!v.last_date && !v.next_due_date) return null;
              return (
                <div key={i} style={{ background: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20', marginBottom: 6 }}>💉 {v.name}</div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
                    <div>
                      <div style={{ color: '#9ca3af', marginBottom: 2 }}>Dernier vaccin</div>
                      <div style={{ fontWeight: 700, color: '#1F1F20' }}>{fmtDate(v.last_date)}</div>
                    </div>
                    <div>
                      <div style={{ color: '#9ca3af', marginBottom: 2 }}>Prochain rappel</div>
                      <div style={{ fontWeight: 700, color: '#2BABE1' }}>
                        {fmtDate(nextAuto)}
                        {!v.next_due_date && <span style={{ fontSize: 10, color: '#9ca3af', marginLeft: 4 }}>(calculé)</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            <div style={{ background: '#fafafa', borderRadius: 12, padding: 12, marginTop: 8, fontSize: 12, color: '#6b7280' }}>
              💡 Vérifie les dates avant de confirmer. Tu pourras les modifier manuellement ensuite.
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', gap: 10 }}>
            <button
              onClick={() => { setScanResult(null); setScanPreview(null); }}
              style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 14, padding: '13px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              ↩ Retour
            </button>
            <button
              onClick={applyScanResult}
              disabled={!hasVaccines && !scanResult.dog_name}
              style={{ flex: 2, background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', border: 'none', borderRadius: 14, padding: '13px', fontSize: 14, fontWeight: 800, cursor: 'pointer' }}
            >
              ✓ Appliquer ces données
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Rendu principal ───────────────────────────────────────────────────────
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 430, maxHeight: '92dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20' }}>{dog?.id ? 'Modifier' : 'Ajouter'} un chien</div>
          <button onClick={onClose} style={{ background: '#f3f4f6', border: 'none', borderRadius: 8, width: 32, height: 32, cursor: 'pointer', fontSize: 16 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', padding: 20, flex: 1, minHeight: 0 }}>

          {/* Photo du chien */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <div
              onClick={() => fileRef.current.click()}
              style={{ width: 90, height: 90, borderRadius: '50%', margin: '0 auto', cursor: 'pointer', overflow: 'hidden', background: '#fef3c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, border: '3px dashed #fde68a', position: 'relative' }}
            >
              {photoPreview
                ? <img src={photoPreview} alt="chien" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : '🐕'}
              <div style={{ position: 'absolute', bottom: 0, right: 0, background: '#2BABE1', color: '#fff', borderRadius: '50%', width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>📷</div>
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginTop: 6 }}>{uploading ? 'Upload en cours…' : 'Toucher pour changer la photo'}</div>
            <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handlePhotoChange} />
          </div>

          {/* Infos de base */}
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Informations</div>

          <input placeholder="Prénom *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />
          <input placeholder="Race" value={form.breed} onChange={e => setForm(f => ({ ...f, breed: e.target.value }))} style={{ ...inputStyle, marginBottom: 10 }} />

          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <select value={form.sex} onChange={e => setForm(f => ({ ...f, sex: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
              <option value="">Sexe</option>
              <option value="Mâle">Mâle</option>
              <option value="Femelle">Femelle</option>
            </select>
            <div style={{ flex: 1 }}>
              <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 3 }}>Date de naissance</label>
              <input type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} style={{ ...inputStyle }} />
            </div>
          </div>

          <input placeholder="Numéro de puce électronique" value={form.chip_number} onChange={e => setForm(f => ({ ...f, chip_number: e.target.value }))} style={{ ...inputStyle, marginBottom: 20 }} />

          {/* Vaccins */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>Vaccins & rappels</div>
            <button
              onClick={() => scanRef.current.click()}
              disabled={scanning}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: scanning ? '#f3f4f6' : 'linear-gradient(135deg,#1F1F20,#2a3a4a)',
                color: scanning ? '#9ca3af' : '#fff',
                border: 'none', borderRadius: 10, padding: '7px 12px',
                fontSize: 12, fontWeight: 700, cursor: scanning ? 'not-allowed' : 'pointer',
              }}
            >
              {scanning
                ? <><div style={{ width: 12, height: 12, border: '2px solid #d1d5db', borderTopColor: '#9ca3af', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />Analyse…</>
                : <>📷 Scanner le carnet</>}
            </button>
            <input
              ref={scanRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handleScanChange}
            />
          </div>

          {scanError && (
            <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 12, color: '#ef4444', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              ⚠️ {scanError}
              <button onClick={() => setScanError(null)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginLeft: 'auto', fontSize: 14 }}>✕</button>
            </div>
          )}

          <div style={{ background: '#f0f9ff', borderRadius: 12, padding: '10px 14px', marginBottom: 12, fontSize: 12, color: '#0369a1' }}>
            💡 Scanne la page de ton carnet de vaccination pour remplir automatiquement, ou saisis les dates manuellement ci-dessous.
          </div>

          {VACCINS_DEFAUT.map(nom => {
            const v = getVaccin(nom);
            const intervalleAns = VACCINS_INTERVALLES[nom] ?? 1;
            const intervalleLabel = intervalleAns === 1 ? 'rappel annuel' : `rappel tous les ${intervalleAns} ans`;

            let statut = null;
            if (v.next_due_date) {
              const today = new Date();
              const rappel = new Date(v.next_due_date);
              const diffDays = Math.round((rappel - today) / 86400000);
              if (diffDays < 0) statut = { label: 'Expiré', color: '#ef4444', bg: '#fee2e2' };
              else if (diffDays <= 30) statut = { label: `Dans ${diffDays}j`, color: '#d97706', bg: '#fef3c7' };
              else statut = { label: 'À jour ✓', color: '#16a34a', bg: '#dcfce7' };
            }

            return (
              <div key={nom} style={{ background: '#f9fafb', borderRadius: 12, padding: 14, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20' }}>💉 {nom}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af', marginLeft: 8 }}>{intervalleLabel}</span>
                  </div>
                  {statut && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: statut.color, background: statut.bg, padding: '2px 8px', borderRadius: 8 }}>
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
                    <input type="date" value={v.next_due_date} onChange={e => setVaccin(nom, 'next_due_date', e.target.value)} style={{ ...inputStyle }} />
                  </div>
                </div>
              </div>
            );
          })}

          {error && <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 12 }}>⚠️ {error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid #f0f0f0', flexShrink: 0 }}>
          <button
            onClick={handleSave}
            disabled={saving || uploading}
            style={{ width: '100%', background: saving ? '#9ca3af' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)', color: '#fff', border: 'none', borderRadius: 14, padding: '14px', fontSize: 15, fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer' }}
          >
            {saving ? 'Enregistrement…' : dog?.id ? '✓ Enregistrer les modifications' : '+ Ajouter ce chien'}
          </button>
        </div>

        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );
}
