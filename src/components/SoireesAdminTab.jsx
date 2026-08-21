// src/components/SoireesAdminTab.jsx
// Admin — gestion des « soirées CaniPlus » (webinaires payants, prestation RI).
// Une soirée = une ligne digital_products (category='soiree') + une ligne
// webinar_access (lien Zoom et replay, jamais lisibles publiquement). Tout
// passe en accès direct Supabase sous les policies admin existantes
// (digital_products_admin_all, webinar_access_admin_all,
// user_purchases_admin_all, storage digital_products_admin_upload).
//
// Après la soirée : coller le lien de partage cloud Zoom + son code, vérifier
// la date d'expiration (pré-remplie à J+7) puis « Envoyer le replay » —
// l'edge function soiree-emails prévient tous les inscrits payés.
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

// TIMESTAMPTZ ISO ↔ <input type="date">. L'expiration du replay tombe en fin
// de journée : la cliente garde l'accès pendant tout le dernier jour.
function isoToDateInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function dateInputToIso(v) {
  if (!v) return null;
  const d = new Date(`${v}T23:59:59`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// Les 7 jours de replay inclus dans le prix, comptés depuis la soirée.
function defautExpiration(eventDateIso) {
  if (!eventDateIso) return '';
  const d = new Date(eventDateIso);
  d.setDate(d.getDate() + 7);
  return isoToDateInput(d.toISOString());
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
  event_cancelled: false,
  zoom_url: '',
  zoom_meeting_id: '',
  replay_url: '',
  replay_code: '',
  replay_expires_on: '',
  file_path: null,
};

export default function SoireesAdminTab() {
  const [soirees, setSoirees] = useState([]);
  const [accessMap, setAccessMap] = useState({});   // product_id → ligne webinar_access (zoom + replay)
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);           // null = liste, objet = édition/création
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [inscritsFor, setInscritsFor] = useState(null); // soirée dont on affiche les inscrits
  const [inscrits, setInscrits] = useState([]);
  const [inscritsLoading, setInscritsLoading] = useState(false);
  const [countMap, setCountMap] = useState({});     // product_id → nb d'inscrits payés
  const [replaySending, setReplaySending] = useState(null); // product_id en cours d'envoi
  const [replayMsg, setReplayMsg] = useState(null);
  const [copied, setCopied] = useState(false);

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

      // Compteur d'inscrits payés par soirée : une seule requête pour toute la
      // liste, comptée côté client (le volume par soirée reste modeste).
      const { data: achats } = await supabase
        .from('user_purchases')
        .select('product_id')
        .eq('status', 'paid')
        .in('product_id', data.map(s => s.id));
      const counts = {};
      (achats ?? []).forEach(a => { counts[a.product_id] = (counts[a.product_id] ?? 0) + 1; });
      setCountMap(counts);
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
      event_cancelled: !!s.event_cancelled,
      zoom_url: acc.zoom_url ?? '',
      zoom_meeting_id: acc.zoom_meeting_id ?? '',
      replay_url: acc.replay_url ?? '',
      replay_code: acc.replay_code ?? '',
      replay_expires_on: isoToDateInput(acc.replay_expires_at) || defautExpiration(s.event_date),
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
        event_cancelled: form.event_cancelled,
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
          zoom_meeting_id: form.zoom_meeting_id.trim() || null,
          replay_url: form.replay_url.trim() || null,
          replay_code: form.replay_code.trim() || null,
          replay_expires_at: dateInputToIso(form.replay_expires_on),
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

  // ── Envoyer le replay aux inscrits payés ──────────────────────────────
  // soiree-emails journalise chaque destinataire : un second clic ne renvoie
  // rien à ceux qui ont déjà reçu l'email, seulement aux nouveaux inscrits.
  const sendReplay = async (s) => {
    const acc = accessMap[s.id] ?? {};
    if (!acc.replay_url) {
      setReplayMsg({ id: s.id, type: 'error', text: "Renseigne d'abord le lien du replay dans « Modifier »." });
      return;
    }
    const nb = countMap[s.id] ?? 0;
    if (!window.confirm(`Envoyer le lien du replay aux ${nb} inscrit·e·s payé·e·s de « ${s.title} » ?`)) return;

    setReplaySending(s.id);
    setReplayMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('soiree-emails', {
        body: { action: 'replay', product_id: s.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setReplayMsg({
        id: s.id, type: 'ok',
        text: data.sent === 0
          ? 'Personne de nouveau à prévenir : tous les inscrits ont déjà reçu le replay.'
          : `Replay envoyé à ${data.sent} inscrit·e·s.`,
      });
    } catch (err) {
      setReplayMsg({ id: s.id, type: 'error', text: 'Envoi impossible : ' + (err?.message ?? err) });
    } finally {
      setReplaySending(null);
    }
  };

  // ── Liste des inscrits : copie et export ──────────────────────────────
  // Le presse-papier sert à pointer la salle d'attente Zoom, le CSV à garder
  // une trace. Même format que la liste clients du club (« ; » + BOM UTF-8),
  // pour qu'Excel en français l'ouvre directement en colonnes.
  const lignesInscrits = () => inscrits.map(p => ({
    Prenom: (p.profile?.full_name ?? '').trim().split(/\s+/)[0] ?? '',
    Nom: (p.profile?.full_name ?? '').trim().split(/\s+/).slice(1).join(' '),
    'Nom complet': p.profile?.full_name ?? '',
    Email: p.profile?.email ?? p.guest_email ?? '',
    Statut: 'Payé',
    'Payé le': fmtDateTime(p.paid_at),
    'Montant CHF': p.amount_chf != null ? Number(p.amount_chf).toFixed(2) : '',
    'Code promo': p.promo_code ?? '',
  }));

  const copierInscrits = async () => {
    const rows = lignesInscrits();
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const texte = [headers.join('\t'), ...rows.map(r => headers.map(h => r[h]).join('\t'))].join('\n');
    try {
      await navigator.clipboard.writeText(texte);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (_) {
      setError('Copie impossible depuis ce navigateur — utilise le CSV.');
    }
  };

  const exporterInscrits = () => {
    const rows = lignesInscrits();
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const cell = (v) => {
      const t = v === null || v === undefined ? '' : String(v);
      return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const csv = '\ufeff' + [headers.join(';'), ...rows.map(r => headers.map(h => cell(r[h])).join(';'))].join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inscrits-${slugify(inscritsFor?.title ?? 'soiree')}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
            <input value={form.zoom_url} onChange={e => setForm(f => ({ ...f, zoom_url: e.target.value }))} style={inputStyle} placeholder="https://us06web.zoom.us/j/…?pwd=…" />
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
              Colle le lien complet avec le <code>?pwd=</code> : les participantes n'ont alors pas de code à saisir.
            </div>

            <label style={labelStyle}>Identifiant de réunion Zoom</label>
            <input value={form.zoom_meeting_id} onChange={e => setForm(f => ({ ...f, zoom_meeting_id: e.target.value }))} style={inputStyle} placeholder="88395098054" />

            <div style={{ background: '#f8f5f0', borderRadius: 12, padding: '14px 16px', marginTop: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20' }}>Replay — à remplir après la soirée</div>
              <div style={{ fontSize: 11.5, color: '#6b7280', marginTop: 3, lineHeight: 1.5 }}>
                Lien de partage cloud Zoom de l'enregistrement, et son code d'accès.
                Une fois enregistré, le bouton « Envoyer le replay » prévient les inscrits.
              </div>

              <label style={labelStyle}>Lien du replay</label>
              <input value={form.replay_url} onChange={e => setForm(f => ({ ...f, replay_url: e.target.value }))} style={inputStyle} placeholder="https://us06web.zoom.us/rec/share/…" />

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={labelStyle}>Code d'accès du replay</label>
                  <input value={form.replay_code} onChange={e => setForm(f => ({ ...f, replay_code: e.target.value }))} style={inputStyle} placeholder="Ab3#xY9z" />
                </div>
                <div style={{ flex: '1 1 180px' }}>
                  <label style={labelStyle}>Disponible jusqu'au</label>
                  <input type="date" value={form.replay_expires_on} onChange={e => setForm(f => ({ ...f, replay_expires_on: e.target.value }))} style={inputStyle} />
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>
                    Pré-rempli à J+7. Passé cette date, le replay disparaît de l'app —
                    pense à supprimer l'enregistrement côté Zoom.
                  </div>
                </div>
              </div>
            </div>

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

          {/* Une soirée annulée reste publiée : les inscrites doivent voir
              l'information. L'app bloque les nouvelles inscriptions et les
              rappels automatiques ne partent plus. */}
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, cursor: 'pointer', fontSize: 14, fontWeight: 700 }}>
            <input type="checkbox" checked={form.event_cancelled} onChange={e => setForm(f => ({ ...f, event_cancelled: e.target.checked }))} style={{ marginTop: 3 }} />
            <span>
              Soirée annulée
              <div style={{ fontWeight: 500, fontSize: 11.5, color: '#6b7280', marginTop: 2 }}>
                Affiche l'annulation dans l'app, coupe les inscriptions et les rappels.
                Les remboursements restent à faire à la main dans Stripe.
              </div>
            </span>
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
          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
            {inscrits.length} inscrit·e·s payé·e·s · {inscritsFor.event_date ? fmtDateTime(inscritsFor.event_date) : 'date à définir'}
          </div>

          {inscrits.length > 0 && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button
                onClick={copierInscrits}
                style={{ flex: '1 1 160px', background: copied ? '#dcfce7' : '#e8f7fd', color: copied ? '#16a34a' : '#1a8bbf', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                {copied ? 'Copié !' : 'Copier la liste'}
              </button>
              <button
                onClick={exporterInscrits}
                style={{ flex: '1 1 160px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
              >
                Exporter en CSV
              </button>
            </div>
          )}

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
                  <div style={{ fontSize: 11, color: '#6b7280', wordBreak: 'break-word' }}>
                    {p.profile?.email ?? p.guest_email ?? ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>
                    Payé le {fmtDateTime(p.paid_at)}
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
          const nbInscrits = countMap[s.id] ?? 0;
          const msg = replayMsg?.id === s.id ? replayMsg : null;
          return (
            <div key={s.id} style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800 }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                    {s.event_date ? fmtDateTime(s.event_date) : 'Date à définir'} · CHF {Number(s.price_chf).toFixed(0)}
                    {' · '}
                    <strong style={{ color: nbInscrits > 0 ? '#16a34a' : '#9ca3af' }}>
                      {nbInscrits} inscrit{nbInscrits > 1 ? 's' : ''}
                    </strong>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                    {s.event_cancelled && (
                      <span style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 8 }}>
                        Annulée
                      </span>
                    )}
                    <span style={{ background: s.is_published ? '#dcfce7' : '#fef3c7', color: s.is_published ? '#16a34a' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {s.is_published ? 'Publiée' : 'Brouillon'}
                    </span>
                    <span style={{ background: acc.zoom_url ? '#e8f7fd' : '#fef3c7', color: acc.zoom_url ? '#1a8bbf' : '#d97706', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {acc.zoom_url ? 'Zoom ✓' : 'Zoom manquant'}
                    </span>
                    {s.file_path && (
                      <span style={{ background: '#e8f7fd', color: '#1a8bbf', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                        PDF ✓
                      </span>
                    )}
                    <span style={{ background: acc.replay_url ? '#e8f7fd' : '#f3f4f6', color: acc.replay_url ? '#1a8bbf' : '#9ca3af', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>
                      {acc.replay_url
                        ? (acc.replay_expires_at ? `Replay ✓ jusqu'au ${new Date(acc.replay_expires_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}` : 'Replay ✓')
                        : 'Replay à venir'}
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

              {/* Envoi du replay — proposé dès qu'un lien de replay existe */}
              {acc.replay_url && (
                <button
                  onClick={() => sendReplay(s)}
                  disabled={replaySending === s.id || nbInscrits === 0}
                  style={{
                    width: '100%', marginTop: 8, background: nbInscrits === 0 ? '#f3f4f6' : '#1F1F20',
                    color: nbInscrits === 0 ? '#9ca3af' : '#fff', border: 'none', borderRadius: 10,
                    padding: '9px 12px', fontSize: 12, fontWeight: 800,
                    cursor: (replaySending === s.id || nbInscrits === 0) ? 'default' : 'pointer',
                  }}
                >
                  {replaySending === s.id
                    ? 'Envoi en cours…'
                    : nbInscrits === 0
                      ? 'Aucun inscrit à prévenir'
                      : `Envoyer le replay aux ${nbInscrits} inscrit${nbInscrits > 1 ? 's' : ''}`}
                </button>
              )}

              {msg && (
                <div style={{
                  marginTop: 8, borderRadius: 10, padding: '9px 12px', fontSize: 12, fontWeight: 600,
                  background: msg.type === 'ok' ? '#dcfce7' : '#fee2e2',
                  color: msg.type === 'ok' ? '#16a34a' : '#dc2626',
                }}>{msg.text}</div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
