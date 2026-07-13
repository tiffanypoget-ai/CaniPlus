// src/components/SoireesAdminTab.jsx
// Admin — gestion des « soirées CaniPlus » (webinaires payants, prestation RI).
// Une soirée = une ligne digital_products (category='soiree') + une ligne
// webinar_access (lien Zoom + identifiant replay Bunny, jamais lisible
// publiquement). Tout passe en accès direct Supabase sous les policies admin
// existantes (digital_products_admin_all, webinar_access_admin_all,
// user_purchases_admin_all, storage digital_products_admin_upload).
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

// TIMESTAMPTZ ISO ↔ valeur d'un <input type="datetime-local"> (heure locale)
function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(v) {
  return v ? new Date(v).toISOString() : null;
}

const EMPTY_FORM = {
  id: null,
  title: '',
  subtitle: '',
  long_description: '',
  event_date_local: '',
  event_duration_min: '',
  price_chf: '',
  cover_image_url: '',
  is_published: false,
  zoom_url: '',
  bunny_video_id: '',
  file_path: null,
};

export default function SoireesAdminTab() {
  const [soirees, setSoirees] = useState([]);
  const [accessMap, setAccessMap] = useState({});   // product_id → { zoom_url, bunny_video_id }
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);           // null = liste, objet = édition/création
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [inscritsFor, setInscritsFor] = useState(null); // soirée dont on affiche les inscrits
  const [inscrits, setInscrits] = useState([]);
  const [inscritsLoading, setInscritsLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('digital_products')
      .select('*')
      .eq('category', 'soiree')
      .order('event_date', { ascending: false, nullsFirst: true });
    setSoirees(data ?? []);
    if (data?.length) {
      const { data: acc } = await supabase
        .from('webinar_access')
        .select('*')
        .in('product_id', data.map(s => s.id));
      const map = {};
      (acc ?? []).forEach(a => { map[a.product_id] = a; });
      setAccessMap(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Ouvrir le formulaire ──────────────────────────────────────────────
  const openCreate = () => { setError(null); setForm({ ...EMPTY_FORM }); };
  const openEdit = (s) => {
    setError(null);
    const acc = accessMap[s.id] ?? {};
    setForm({
      id: s.id,
      title: s.title ?? '',
      subtitle: s.subtitle ?? '',
      long_description: s.long_description ?? '',
      event_date_local: isoToLocalInput(s.event_date),
      event_duration_min: s.event_duration_min ?? '',
      price_chf: s.price_chf ?? '',
      cover_image_url: s.cover_image_url ?? '',
      is_published: !!s.is_published,
      zoom_url: acc.zoom_url ?? '',
      bunny_video_id: acc.bunny_video_id ?? '',
      file_path: s.file_path ?? null,
    });
  };

  // ── Upload du PDF de support (bucket privé digital-products) ──────────
  const handlePdfUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    setUploadingPdf(true);
    setError(null);
    try {
      const slug = form.id
        ? (soirees.find(s => s.id === form.id)?.slug ?? slugify(form.title))
        : slugify(form.title || 'soiree');
      const path = `soirees/${slug}-support-${Date.now()}.pdf`;
      const { error: upErr } = await supabase.storage
        .from('digital-products')
        .upload(path, file, { upsert: true, contentType: 'application/pdf' });
      if (upErr) throw upErr;
      setForm(f => ({ ...f, file_path: path }));
    } catch (err) {
      setError('Upload du PDF impossible : ' + (err?.message ?? err));
    } finally {
      setUploadingPdf(false);
    }
  };

  // ── Enregistrer ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.title.trim()) { setError('Le titre est obligatoire.'); return; }
    if (!form.price_chf || Number(form.price_chf) <= 0) { setError('Indique un prix en CHF.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        long_description: form.long_description.trim() || null,
        description: form.subtitle.trim() || form.title.trim(),
        event_date: localInputToIso(form.event_date_local),
        event_duration_min: form.event_duration_min ? Number(form.event_duration_min) : null,
        price_chf: Number(form.price_chf),
        cover_image_url: form.cover_image_url.trim() || null,
        is_published: form.is_published,
        category: 'soiree',
        file_path: form.file_path,
      };

      let productId = form.id;
      if (productId) {
        const { error: updErr } = await supabase
          .from('digital_products').update(payload).eq('id', productId);
        if (updErr) throw updErr;
      } else {
        const { data: created, error: insErr } = await supabase
          .from('digital_products')
          .insert({ ...payload, slug: `soiree-${slugify(form.title)}` })
          .select('id')
          .single();
        if (insErr) throw insErr;
        productId = created.id;
      }

      // Secrets d'accès (Zoom + replay) — table séparée non publique
      const { error: accErr } = await supabase
        .from('webinar_access')
        .upsert({
          product_id: productId,
          zoom_url: form.zoom_url.trim() || null,
          bunny_video_id: form.bunny_video_id.trim() || null,
        });
      if (accErr) throw accErr;

      setForm(null);
      await load();
    } catch (err) {
      setError('Erreur : ' + (err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (s) => {
    await supabase.from('digital_products').update({ is_published: !s.is_published }).eq('id', s.id);
    await load();
  };

  // ── Inscrits d'une soirée ─────────────────────────────────────────────
  const showInscrits = async (s) => {
    setInscritsFor(s);
    setInscrits([]);
    setInscritsLoading(true);
    const { data } = await supabase
      .from('user_purchases')
      .select('id, paid_at, amount_chf, promo_code, guest_email, profile:profiles(full_name, email)')
      .eq('product_id', s.id)
      .eq('status', 'paid')
      .order('paid_at', { ascending: true });
    setInscrits(data ?? []);
    setInscritsLoading(false);
  };

  const fmtDateTime = (iso) => iso
    ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  // ════════════════ Formulaire création / édition ════════════════
  if (form) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button
          onClick={() => setForm(null)}
          style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
        ><Icon name="arrowLeft" size={13} /> Retour aux soirées</button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>
            {form.id ? 'Modifier la soirée' : 'Nouvelle soirée'}
          </div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Le lien Zoom, le PDF et le replay ne sont visibles que par les personnes inscrites.
          </div>

          <label style={labelStyle}>Titre *</label>
          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inputStyle} placeholder="Comprendre la réactivité" />

          <label style={labelStyle}>Sous-titre</label>
          <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} style={inputStyle} placeholder="Pourquoi ton chien aboie sur les autres, et comment l'aider" />

          <label style={labelStyle}>Description (affichée sur la page de la soirée)</label>
          <textarea value={form.long_description} onChange={e => setForm(f => ({ ...f, long_description: e.target.value }))} rows={5} style={{ ...inputStyle, resize: 'vertical' }} />

          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ flex: 2 }}>
              <label style={labelStyle}>Date et heure</label>
              <input type="datetime-local" value={form.event_date_local} onChange={e => setForm(f => ({ ...f, event_date_local: e.target.value }))} style={inputStyle} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Durée (min)</label>
              <input type="number" value={form.event_duration_min} onChange={e => setForm(f => ({ ...f, event_duration_min: e.target.value }))} style={inputStyle} placeholder="90" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Prix (CHF) *</label>
              <input type="number" step="0.5" value={form.price_chf} onChange={e => setForm(f => ({ ...f, price_chf: e.target.value }))} style={inputStyle} placeholder="25" />
            </div>
          </div>

          <label style={labelStyle}>Image de couverture (URL, optionnel)</label>
          <input value={form.cover_image_url} onChange={e => setForm(f => ({ ...f, cover_image_url: e.target.value }))} style={inputStyle} placeholder="https://…" />

          <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 18, paddingTop: 6 }}>
            <label style={labelStyle}>Lien Zoom de la séance (réservé aux inscrits)</label>
            <input value={form.zoom_url} onChange={e => setForm(f => ({ ...f, zoom_url: e.target.value }))} style={inputStyle} placeholder="https://zoom.us/j/…" />

            <label style={labelStyle}>Replay Bunny (à remplir après la soirée)</label>
            <input value={form.bunny_video_id} onChange={e => setForm(f => ({ ...f, bunny_video_id: e.target.value }))} style={inputStyle} placeholder="idLibrairie/idVideo (ou URL d'embed complète)" />

            <label style={labelStyle}>PDF de support (réservé aux inscrits)</label>
            {form.file_path && (
              <div style={{ fontSize: 12, color: '#16a34a', fontWeight: 600, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="check" size={13} color="#16a34a" /> {form.file_path.split('/').pop()}
              </div>
            )}
            <input type="file" accept="application/pdf" onChange={handlePdfUpload} disabled={uploadingPdf} style={{ fontSize: 13 }} />
            {uploadingPdf && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Upload en cours…</div>}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" checked={form.is_published} onChange={e => setForm(f => ({ ...f, is_published: e.target.checked }))} />
            Publiée (visible dans l'app)
          </label>

          {error && (
            <div style={{ background: '#fee2e2', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#dc2626', fontWeight: 600, marginTop: 14 }}>{error}</div>
          )}

          <button
            onClick={handleSave}
            disabled={saving || uploadingPdf}
            style={{ width: '100%', marginTop: 16, background: saving ? '#9ca3af' : '#2BABE1', color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 800, cursor: saving ? 'wait' : 'pointer' }}
          >
            {saving ? 'Enregistrement…' : form.id ? 'Enregistrer les modifications' : 'Créer la soirée'}
          </button>
        </div>
      </div>
    );
  }

  // ════════════════ Liste des inscrits ════════════════
  if (inscritsFor) {
    return (
      <div style={{ maxWidth: 640 }}>
        <button
          onClick={() => setInscritsFor(null)}
          style={{ background: '#f3f4f6', border: 'none', borderRadius: 10, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 14 }}
        ><Icon name="arrowLeft" size={13} /> Retour aux soirées</button>

        <div style={{ background: '#fff', borderRadius: 16, padding: 20, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: 17, fontWeight: 800 }}>{inscritsFor.title}</div>
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 14 }}>
            {inscrits.length} inscrit·e·s · {inscritsFor.event_date ? fmtDateTime(inscritsFor.event_date) : 'date à définir'}
          </div>

          {inscritsLoading ? (
            <div style={{ color: '#9ca3af', fontSize: 13, padding: '12px 0' }}>Chargement…</div>
          ) : inscrits.length === 0 ? (
            <div style={{ color: '#6b7280', fontSize: 13, padding: '12px 0' }}>Personne d'inscrit pour l'instant.</div>
          ) : (
            inscrits.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #f3f4f6' }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e8f7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="user" size={15} color="#2BABE1" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{p.profile?.full_name ?? p.guest_email ?? 'Invité'}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    {p.profile?.email ?? p.guest_email ?? ''} · payé le {fmtDateTime(p.paid_at)}
                    {p.promo_code ? ` · code ${p.promo_code}` : ''}
                  </div>
                </div>
                {p.amount_chf != null && (
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#16a34a', flexShrink: 0 }}>CHF {Number(p.amount_chf).toFixed(0)}</div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    );
  }

  // ════════════════ Liste des soirées ════════════════
  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>Les soirées CaniPlus</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Webinaires payants — les codes promo se créent dans le dashboard Stripe (un par soirée).</div>
        </div>
        <button
          onClick={openCreate}
          style={{ background: '#2BABE1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        ><Icon name="plus" size={14} color="#fff" /> Nouvelle soirée</button>
      </div>

      {loading ? (
        <div style={{ color: '#9ca3af', fontSize: 13, padding: '16px 0' }}>Chargement…</div>
      ) : soirees.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 24, textAlign: 'center', color: '#6b7280', fontSize: 13 }}>
          Aucune soirée pour l'instant. Crée la première !
        </div>
      ) : (
        soirees.map(s => {
          const acc = accessMap[s.id] ?? {};
          return (
            <div key={s.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {s.event_date ? fmtDateTime(s.event_date) : 'Date à définir'} · CHF {Number(s.price_chf).toFixed(0)}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    <span style={{ background: s.is_published ? '#dcfce7' : '#fef3c7', color: s.is_published ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.is_published ? 'Publiée' : 'Brouillon'}
                    </span>
                    <span style={{ background: acc.zoom_url ? '#e8f7fd' : '#f3f4f6', color: acc.zoom_url ? '#1a8bbf' : '#9ca3af', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {acc.zoom_url ? 'Zoom ✓' : 'Zoom manquant'}
                    </span>
                    <span style={{ background: s.file_path ? '#e8f7fd' : '#f3f4f6', color: s.file_path ? '#1a8bbf' : '#9ca3af', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.file_path ? 'PDF ✓' : 'PDF manquant'}
                    </span>
                    <span style={{ background: acc.bunny_video_id ? '#e8f7fd' : '#f3f4f6', color: acc.bunny_video_id ? '#1a8bbf' : '#9ca3af', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {acc.bunny_video_id ? 'Replay ✓' : 'Replay à venir'}
                    </span>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                <button onClick={() => openEdit(s)} style={{ flex: 1, background: '#e8f7fd', color: '#1a8bbf', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Modifier</button>
                <button onClick={() => showInscrits(s)} style={{ flex: 1, background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Inscrits</button>
                <button onClick={() => togglePublish(s)} style={{ flex: 1, background: s.is_published ? '#fef3c7' : '#dcfce7', color: s.is_published ? '#d97706' : '#16a34a', border: 'none', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  {s.is_published ? 'Dépublier' : 'Publier'}
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
