// src/components/CoordonneesClubCard.jsx
// Carte « Mes coordonnées » du Profil, pour les inscrits au club.
//
// Reprend les champs demandés à l'inscription (OnboardingScreen, étape 2) pour
// que la personne puisse les corriger elle-même : adresse, téléphone, assurance
// RC privée, droit à l'image, envoi de la facture. Ce sont ces colonnes qui
// alimentent l'export de la liste clients côté admin — d'où le rappel visuel
// quand une info manque, notamment pour les comptes créés avant ce formulaire.

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', background: '#fff', color: '#1F1F20',
};

function Choice({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
      {options.map(opt => {
        const active = value === opt.val;
        return (
          <button
            key={String(opt.val)}
            type="button"
            onClick={() => onChange(opt.val)}
            style={{
              flex: 1, padding: '10px 6px',
              background: active ? 'var(--cyan-light)' : '#fff',
              border: `2px solid ${active ? 'var(--cyan)' : 'var(--border)'}`,
              borderRadius: 12, fontSize: 13, fontWeight: 700,
              color: active ? 'var(--cyan-dark)' : '#374151', cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function Label({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', marginBottom: 4 }}>{children}</div>
  );
}

export default function CoordonneesClubCard({ profile, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    street_address:   profile?.street_address ?? '',
    postal_code:      profile?.postal_code ?? '',
    city:             profile?.city ?? '',
    phone:            profile?.phone ?? '',
    has_rc_insurance: profile?.has_rc_insurance ?? null,
    image_rights:     profile?.image_rights ?? null,
    invoice_method:   profile?.invoice_method ?? '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Comptes créés avant ce formulaire : on signale ce qui manque plutôt que
  // d'afficher une carte vide sans explication.
  const missing = [
    !profile?.street_address && 'adresse',
    !profile?.phone && 'téléphone',
    profile?.has_rc_insurance === null || profile?.has_rc_insurance === undefined ? 'assurance RC' : null,
    profile?.image_rights === null || profile?.image_rights === undefined ? 'droit à l\'image' : null,
    !profile?.invoice_method && 'facture',
  ].filter(Boolean);

  const handleSave = async () => {
    setSaving(true); setError(null);
    const { error: err } = await supabase
      .from('profiles')
      .update({
        street_address:   form.street_address.trim() || null,
        postal_code:      form.postal_code.trim() || null,
        city:             form.city.trim() || null,
        phone:            form.phone.trim() || null,
        has_rc_insurance: form.has_rc_insurance,
        image_rights:     form.image_rights,
        invoice_method:   form.invoice_method || null,
      })
      .eq('id', profile.id);
    setSaving(false);
    if (err) { setError('Impossible d\'enregistrer : ' + err.message); return; }
    setEditing(false);
    onSaved?.();
  };

  const ligne = (label, valeur) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--gray-bg-alt)' }}>
      <span style={{ fontSize: 13, color: 'var(--gray)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valeur ? 'var(--ink)' : 'var(--gray-mid)', textAlign: 'right' }}>
        {valeur || 'À compléter'}
      </span>
    </div>
  );

  const adresse = [profile?.street_address, [profile?.postal_code, profile?.city].filter(Boolean).join(' ')]
    .filter(Boolean).join(', ');

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Mes coordonnées
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            style={{ background: 'var(--cyan-light)', border: 'none', borderRadius: 10, padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--cyan-dark)', cursor: 'pointer' }}
          >
            Modifier
          </button>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 2px 12px rgba(31,31,32,0.06)' }}>
        {!editing ? (
          <>
            {missing.length > 0 && (
              <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: '#92400e', marginBottom: 10, lineHeight: 1.45, display: 'flex', gap: 8 }}>
                <Icon name="warning" size={14} color="#92400e" />
                <span>Il manque : {missing.join(', ')}. Tiffany en a besoin pour ton inscription.</span>
              </div>
            )}
            {ligne('Adresse', adresse)}
            {ligne('Téléphone', profile?.phone)}
            {ligne('Assurance RC privée', profile?.has_rc_insurance == null ? '' : profile.has_rc_insurance ? 'Oui' : 'Non')}
            {ligne('Droit à l\'image', profile?.image_rights == null ? '' : profile.image_rights ? 'Autorisé' : 'Refusé')}
            {ligne('Facture', profile?.invoice_method === 'papier' ? 'Sur papier' : profile?.invoice_method === 'mail' ? 'Par e-mail' : '')}
          </>
        ) : (
          <>
            <Label>Rue et numéro</Label>
            <input value={form.street_address} onChange={e => set('street_address', e.target.value)} placeholder="Chemin des Champs 4" style={{ ...inputStyle, marginBottom: 12 }} />

            <div style={{ display: 'flex', gap: 8 }}>
              <div style={{ width: 110 }}>
                <Label>NPA</Label>
                <input value={form.postal_code} onChange={e => set('postal_code', e.target.value)} placeholder="1338" inputMode="numeric" style={{ ...inputStyle, marginBottom: 12 }} />
              </div>
              <div style={{ flex: 1 }}>
                <Label>Localité</Label>
                <input value={form.city} onChange={e => set('city', e.target.value)} placeholder="Ballaigues" style={{ ...inputStyle, marginBottom: 12 }} />
              </div>
            </div>

            <Label>Téléphone</Label>
            <input type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="079 123 45 67" style={{ ...inputStyle, marginBottom: 12 }} />

            <Label>Assurance responsabilité civile privée</Label>
            <Choice options={[{ val: true, label: 'Oui' }, { val: false, label: 'Non' }]} value={form.has_rc_insurance} onChange={v => set('has_rc_insurance', v)} />

            <Label>Droit à l'image</Label>
            <Choice options={[{ val: true, label: 'J\'autorise' }, { val: false, label: 'Je refuse' }]} value={form.image_rights} onChange={v => set('image_rights', v)} />

            <Label>Envoi de la facture</Label>
            <Choice options={[{ val: 'mail', label: 'Par e-mail' }, { val: 'papier', label: 'Sur papier' }]} value={form.invoice_method} onChange={v => set('invoice_method', v)} />

            {error && (
              <div style={{ background: 'var(--red-light)', color: 'var(--red-dark)', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 600, marginBottom: 10 }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => { setEditing(false); setError(null); }}
                style={{ flex: 1, padding: '12px', background: 'var(--gray-bg)', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'var(--gray)', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ flex: 2, padding: '12px', background: saving ? '#93c5e8' : 'linear-gradient(135deg,var(--cyan),var(--cyan-dark))', border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 800, color: '#fff', cursor: saving ? 'not-allowed' : 'pointer' }}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
