// src/components/DefisAdminTab.jsx
// Admin — gestion des Défis CaniPlus (mini-programmes gratuits et guidés).
// Un défi = une ligne defis + N lignes defi_jours (contenu de chaque jour).
// Tout passe en accès direct Supabase sous les policies admin (defis_admin_all,
// defi_jours_admin_all, defi_progression_admin_read pour les stats).
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 10,
  border: '1.5px solid #e5e7eb', fontSize: 14, outline: 'none',
  boxSizing: 'border-box', background: '#fff', color: '#1F1F20',
};
const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: 0.8, margin: '12px 0 5px',
};

function slugify(s) {
  return String(s).toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const EMPTY_JOUR = {
  titre: '', objectif: '', exercice: '', astuces: '', conseil: '',
  partage_invite: '', partage_texte: '',
};

const EMPTY_FORM = {
  id: null,
  titre: '',
  pitch: '',
  description: '',
  image_url: '',
  duree_jours: 7,
  statut: 'brouillon',
  recompense_texte: '',
  fin_titre: '',
  fin_texte: '',
  jours: {}, // numéro → contenu du jour
};

export default function DefisAdminTab() {
  const [defis, setDefis] = useState([]);
  const [stats, setStats] = useState({});       // defi_id → { participants, completions, rewards }
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);       // null = liste, objet = édition/création
  const [openDay, setOpenDay] = useState(1);    // jour déplié dans le formulaire
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [error, setError] = useState(null);

  // Upload d'une vraie photo vers le bucket public app-images → URL publique
  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !form) return;
    setUploadingImage(true);
    setError(null);
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `defis/${slugify(form.titre || 'defi')}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('app-images')
        .upload(path, file, { upsert: true, contentType: file.type || 'image/jpeg' });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('app-images').getPublicUrl(path);
      if (!urlData?.publicUrl) throw new Error('URL publique non générée');
      setForm(f => ({ ...f, image_url: urlData.publicUrl }));
    } catch (err) {
      setError('Upload de la photo impossible : ' + (err?.message ?? err));
    } finally {
      setUploadingImage(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('defis')
      .select('*')
      .order('created_at', { ascending: true });
    setDefis(data ?? []);

    // Stats : participants (progressions), complétions, mois offerts activés
    const { data: progs } = await supabase
      .from('defi_progression')
      .select('defi_id, completed_at, reward_claimed_at');
    const s = {};
    (progs ?? []).forEach(p => {
      s[p.defi_id] = s[p.defi_id] ?? { participants: 0, completions: 0, rewards: 0 };
      s[p.defi_id].participants++;
      if (p.completed_at) s[p.defi_id].completions++;
      if (p.reward_claimed_at) s[p.defi_id].rewards++;
    });
    setStats(s);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Ouvrir le formulaire ──────────────────────────────────────────────
  const openCreate = () => { setError(null); setOpenDay(1); setForm({ ...EMPTY_FORM, jours: {} }); };
  const openEdit = async (d) => {
    setError(null);
    setOpenDay(1);
    const { data: jours } = await supabase
      .from('defi_jours')
      .select('*')
      .eq('defi_id', d.id)
      .order('jour', { ascending: true });
    const joursMap = {};
    (jours ?? []).forEach(j => { joursMap[j.jour] = j; });
    setForm({
      id: d.id,
      titre: d.titre ?? '',
      pitch: d.pitch ?? '',
      description: d.description ?? '',
      image_url: d.image_url ?? '',
      duree_jours: d.duree_jours ?? 7,
      statut: d.statut ?? 'brouillon',
      recompense_texte: d.recompense_texte ?? '',
      fin_titre: d.fin_titre ?? '',
      fin_texte: d.fin_texte ?? '',
      jours: joursMap,
    });
  };

  const setJourField = (n, field, value) => {
    setForm(f => ({
      ...f,
      jours: { ...f.jours, [n]: { ...(f.jours[n] ?? { ...EMPTY_JOUR, jour: n }), [field]: value } },
    }));
  };

  // ── Enregistrer ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.titre.trim()) { setError('Le titre est obligatoire.'); return; }
    const duree = Math.min(Math.max(parseInt(form.duree_jours, 10) || 7, 1), 30);
    setSaving(true);
    setError(null);
    try {
      const payload = {
        titre: form.titre.trim(),
        pitch: form.pitch.trim() || null,
        description: form.description.trim() || null,
        image_url: form.image_url.trim() || null,
        duree_jours: duree,
        statut: form.statut,
        recompense_texte: form.recompense_texte.trim() || null,
        fin_titre: form.fin_titre.trim() || null,
        fin_texte: form.fin_texte.trim() || null,
      };

      let defiId = form.id;
      if (defiId) {
        const { error: updErr } = await supabase.from('defis').update(payload).eq('id', defiId);
        if (updErr) throw updErr;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('defis')
          .insert({ ...payload, slug: `defi-${slugify(form.titre)}` })
          .select('id')
          .single();
        if (insErr) throw insErr;
        defiId = created.id;
        // Reporte l'id dans le formulaire tout de suite : si l'enregistrement
        // des jours échoue, un nouvel essai fera un UPDATE au lieu de créer
        // un deuxième défi (ou d'échouer sur le slug unique).
        setForm(f => ({ ...f, id: created.id }));
      }

      // Jours : upsert des jours 1..duree (les jours vides sont quand même
      // créés avec leur titre, pour que le parcours soit complet dans l'app)
      const rows = Array.from({ length: duree }, (_, i) => {
        const n = i + 1;
        const j = form.jours[n] ?? EMPTY_JOUR;
        return {
          defi_id: defiId,
          jour: n,
          titre: (j.titre ?? '').trim() || `Jour ${n}`,
          objectif: (j.objectif ?? '').trim() || null,
          exercice: (j.exercice ?? '').trim() || null,
          astuces: (j.astuces ?? '').trim() || null,
          conseil: (j.conseil ?? '').trim() || null,
          partage_invite: (j.partage_invite ?? '').trim() || null,
          partage_texte: (j.partage_texte ?? '').trim() || null,
        };
      });
      const { error: joursErr } = await supabase
        .from('defi_jours')
        .upsert(rows, { onConflict: 'defi_id,jour' });
      if (joursErr) throw joursErr;

      // Si la durée a été réduite, supprime les jours au-delà — sinon l'app
      // affichait « Jour 8 sur 7 » et un parcours plus long que le défi.
      const { error: delErr } = await supabase
        .from('defi_jours')
        .delete()
        .eq('defi_id', defiId)
        .gt('jour', duree);
      if (delErr) throw delErr;

      setForm(null);
      await load();
    } catch (err) {
      setError('Erreur : ' + (err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const toggleActif = async (d) => {
    const next = d.statut === 'actif' ? 'brouillon' : 'actif';
    await supabase.from('defis').update({ statut: next }).eq('id', d.id);
    await load();
  };

  // ════════════════ Formulaire création / édition ════════════════
  if (form) {
    const duree = Math.min(Math.max(parseInt(form.duree_jours, 10) || 7, 1), 30);
    return (
      <div style={{ maxWidth: 680 }}>
        <button
          onClick={() => setForm(null)}
          style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
        ><Icon name="arrowLeft" size={13} /> Retour aux défis</button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
            {form.id ? 'Modifier le défi' : 'Nouveau défi'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Un défi en brouillon n'est visible que par toi dans l'app (pour valider le rendu avant de l'activer).
          </div>

          <label style={labelStyle}>Titre *</label>
          <input value={form.titre} onChange={e => setForm(f => ({ ...f, titre: e.target.value }))} style={inputStyle} placeholder="Défi Journée Off — apprends à ton chien à se poser, partout" />

          <label style={labelStyle}>Accroche courte (carte de la liste)</label>
          <input value={form.pitch} onChange={e => setForm(f => ({ ...f, pitch: e.target.value }))} style={inputStyle} placeholder="7 jours, 5 à 10 minutes par jour, pour un chien qui sait se poser partout." />

          <label style={labelStyle}>Promesse (écran d'accueil du défi)</label>
          <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Durée (jours)</label>
              <input type="number" min="1" max="30" value={form.duree_jours} onChange={e => setForm(f => ({ ...f, duree_jours: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Statut</label>
              <select value={form.statut} onChange={e => setForm(f => ({ ...f, statut: e.target.value }))} style={inputStyle}>
                <option value="brouillon">Brouillon</option>
                <option value="actif">Actif</option>
                <option value="archive">Archivé</option>
              </select>
            </div>
          </div>

          <label style={labelStyle}>Photo de couverture</label>
          {form.image_url && (
            <img src={form.image_url} alt="Couverture du défi" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12, display: 'block', marginBottom: 8 }} />
          )}
          <input type="file" accept="image/*" onChange={handleImageUpload} disabled={uploadingImage} style={{ fontSize: 13, marginBottom: 6 }} />
          {uploadingImage && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>Upload en cours…</div>}
          <input value={form.image_url} onChange={e => setForm(f => ({ ...f, image_url: e.target.value }))} style={inputStyle} placeholder="…ou colle une URL d'image https://" />

          <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 18, paddingTop: 6 }}>
            <label style={labelStyle}>Texte de la récompense (écran de fin)</label>
            <textarea value={form.recompense_texte} onChange={e => setForm(f => ({ ...f, recompense_texte: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="1 mois de premium offert… Puis 10 CHF/mois, résiliable à tout moment." />

            <label style={labelStyle}>Titre des félicitations</label>
            <input value={form.fin_titre} onChange={e => setForm(f => ({ ...f, fin_titre: e.target.value }))} style={inputStyle} placeholder="Bravo, tu as réussi le défi !" />

            <label style={labelStyle}>Texte des félicitations</label>
            <textarea value={form.fin_texte} onChange={e => setForm(f => ({ ...f, fin_texte: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {/* ── Contenu des jours (accordéon) ── */}
          <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 18, paddingTop: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Contenu des {duree} jours</div>
            {Array.from({ length: duree }, (_, i) => i + 1).map(n => {
              const j = form.jours[n] ?? EMPTY_JOUR;
              const open = openDay === n;
              const filled = !!(j.titre ?? '').trim();
              return (
                <div key={n} style={{ border: '1.5px solid #e5e7eb', borderRadius: 12, marginBottom: 8, overflow: 'hidden' }}>
                  <button
                    onClick={() => setOpenDay(open ? null : n)}
                    style={{ width: '100%', background: open ? '#e8f7fd' : '#f9fafb', border: 'none', padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', textAlign: 'left' }}
                  >
                    <span style={{ width: 26, height: 26, borderRadius: '50%', background: filled ? '#2BABE1' : '#d1d5db', color: '#fff', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</span>
                    <span style={{ flex: 1, fontSize: 13.5, fontWeight: 700, color: filled ? '#1F1F20' : '#9ca3af' }}>
                      {(j.titre ?? '').trim() || `Jour ${n} — à remplir`}
                    </span>
                    <Icon name={open ? 'chevronDown' : 'chevronRight'} size={14} color="#9ca3af" />
                  </button>
                  {open && (
                    <div style={{ padding: '4px 14px 14px' }}>
                      <label style={labelStyle}>Titre du jour</label>
                      <input value={j.titre ?? ''} onChange={e => setJourField(n, 'titre', e.target.value)} style={inputStyle} />
                      <label style={labelStyle}>Objectif</label>
                      <textarea value={j.objectif ?? ''} onChange={e => setJourField(n, 'objectif', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                      <label style={labelStyle}>Exercice</label>
                      <textarea value={j.exercice ?? ''} onChange={e => setJourField(n, 'exercice', e.target.value)} rows={4} style={{ ...inputStyle, resize: 'vertical' }} />
                      <label style={labelStyle}>« Il n'y arrive pas ? » (une astuce par ligne)</label>
                      <textarea value={j.astuces ?? ''} onChange={e => setJourField(n, 'astuces', e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                      <label style={labelStyle}>Conseil en plus (optionnel)</label>
                      <textarea value={j.conseil ?? ''} onChange={e => setJourField(n, 'conseil', e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                      <label style={labelStyle}>Invitation au partage (affichée)</label>
                      <input value={j.partage_invite ?? ''} onChange={e => setJourField(n, 'partage_invite', e.target.value)} style={inputStyle} placeholder="Prends ton chien en photo dans son moment de calme et partage." />
                      <label style={labelStyle}>Texte de partage pré-rempli</label>
                      <input value={j.partage_texte ?? ''} onChange={e => setJourField(n, 'partage_texte', e.target.value)} style={inputStyle} placeholder="Jour 1 du Défi… #DéfiJournéeOff" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, marginTop: 14 }}>{error}</div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            style={{ width: '100%', marginTop: 16, background: saving ? '#9ca3af' : '#2BABE1', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Enregistrement…' : form.id ? 'Enregistrer les modifications' : 'Créer le défi'}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════ Liste des défis ════════════════
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Les Défis CaniPlus</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Mini-programmes gratuits — la récompense de fin est le mois de premium offert (jamais-abonnées uniquement).</div>
        </div>
        <button
          onClick={openCreate}
          style={{ background: '#2BABE1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        ><Icon name="plus" size={14} color="#fff" /> Nouveau défi</button>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>Chargement…</div>
      ) : defis.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Aucun défi pour l'instant. Crée le premier !
        </div>
      ) : (
        defis.map(d => {
          const s = stats[d.id] ?? { participants: 0, completions: 0, rewards: 0 };
          return (
            <div key={d.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{d.titre}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {d.duree_jours} jours · {d.recompense_type === 'premium_trial_30j' ? 'Récompense : 1 mois premium offert' : 'Sans récompense premium'}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: d.statut === 'actif' ? '#dcfce7' : d.statut === 'archive' ? '#f3f4f6' : '#fef3c7', color: d.statut === 'actif' ? '#16a34a' : d.statut === 'archive' ? '#6b7280' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {d.statut === 'actif' ? 'Actif' : d.statut === 'archive' ? 'Archivé' : 'Brouillon'}
                    </span>
                    <span style={{ background: '#e8f7fd', color: '#1a8bbf', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.participants} participant·e·s
                    </span>
                    <span style={{ background: '#e8f7fd', color: '#1a8bbf', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.completions} complétion·s
                    </span>
                    <span style={{ background: '#fff8f1', color: '#E67E22', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.rewards} mois offert·s activé·s
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => openEdit(d)} style={{ flex: 1, background: '#e8f7fd', color: '#1a8bbf', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Modifier</button>
                <button onClick={() => toggleActif(d)} style={{ flex: 1, background: d.statut === 'actif' ? '#fef3c7' : '#dcfce7', color: d.statut === 'actif' ? '#d97706' : '#16a34a', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {d.statut === 'actif' ? 'Désactiver' : 'Activer'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
