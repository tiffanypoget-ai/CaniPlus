// src/components/RallyeAdminTab.jsx
// Admin : suivi des inscriptions au Rallye canin de Ballaigues (club).
//
// Les tables rallye_* n'ont aucune policy : tout passe par l'edge function
// rallye-admin (service role, réservée aux profils admin).
//
// - Compteurs : inscriptions payées, chiens payés, montant encaissé, en attente.
// - Rubans demandés (jaune / bleu) pour préparer le stock, inscriptions
//   payées et en attente confondues (annulées exclues).
// - « Virement reçu » : passe l'inscription en payée et envoie la confirmation.
// - Dès le 13 mars 2027, les virements encore en attente ressortent en rouge :
//   c'est la liste à contrôler avant le rallye.
// - Export CSV : liste d'accueil du jour J.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

// Même instant que FIN_VIREMENT dans supabase/functions/_shared/rallye.ts.
const FIN_VIREMENT = new Date('2027-03-13T00:00:00+01:00');

const STATUTS = {
  en_attente: { label: 'En attente', bg: '#fdf3e3', fg: '#9a5b00' },
  paye: { label: 'Payé', bg: '#e7f3dc', fg: '#2e5a13' },
  annule: { label: 'Annulé', bg: '#f1f1f1', fg: '#6b7280' },
};
const PARCOURS = { '1km': '1 km', '3.7km': '3,7 km', '5.4km': '5,4 km', indecis: 'Pas décidé' };

const card = { background: '#fff', borderRadius: 16, padding: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' };
const btn = (bg, fg = '#fff') => ({
  background: bg, color: fg, border: 'none', borderRadius: 10, padding: '8px 14px',
  fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
});

const fmtDate = (iso) => iso
  ? new Date(iso).toLocaleDateString('fr-CH', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Zurich' })
  : '';
const chf = (n) => `${Number(n || 0).toFixed(0)} CHF`;

// CSV point-virgule + BOM, comme exportClubList : Excel FR l'ouvre en colonnes.
// Une cellule qui commence par = + - @ est préfixée d'une apostrophe pour
// qu'Excel ne l'interprète jamais comme une formule (les noms viennent d'un
// formulaire public).
function toCsv(rows) {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const cell = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.join(';'), ...rows.map(r => headers.map(h => cell(r[h])).join(';'))].join('\r\n');
}

export default function RallyeAdminTab() {
  const [inscriptions, setInscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filtre, setFiltre] = useState('tous');
  const [enCours, setEnCours] = useState(null);

  const appeler = useCallback(async (body) => {
    const { data, error: err } = await supabase.functions.invoke('rallye-admin', { body });
    if (err) {
      // functions.invoke range le corps d'une réponse 4xx dans err.context
      let msg = err.message;
      try { msg = (await err.context.json()).error ?? msg; } catch (_) { /* corps illisible : on garde le message */ }
      throw new Error(msg);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await appeler({ action: 'list' });
      setInscriptions(data.inscriptions ?? []);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, [appeler]);

  useEffect(() => { load(); }, [load]);

  const virementRecu = async (ins) => {
    const ok = window.confirm(`Confirmer la réception du virement de ${ins.prenom} ${ins.nom} (${chf(ins.montant_chf)}, réf. ${ins.reference_scor ?? '—'}) ?\n\nL'inscription passe en payée et un email de confirmation part tout de suite.`);
    if (!ok) return;
    setEnCours(ins.id);
    setError('');
    try {
      await appeler({ action: 'virement_recu', id: ins.id });
      await load();
    } catch (e) {
      setError(e.message);
    }
    setEnCours(null);
  };

  // ── Chiffres ───────────────────────────────────────────────────────────
  const payees = inscriptions.filter(i => i.statut === 'paye');
  const attente = inscriptions.filter(i => i.statut === 'en_attente');
  const actives = inscriptions.filter(i => i.statut !== 'annule');
  const chiensPayes = payees.reduce((n, i) => n + (i.nb_chiens || 0), 0);
  const encaisse = payees.reduce((n, i) => n + Number(i.montant_chf || 0), 0);
  const montantAttente = attente.reduce((n, i) => n + Number(i.montant_chf || 0), 0);
  const rubans = actives.flatMap(i => i.rallye_chiens ?? []).reduce((acc, c) => {
    acc[c.ruban] = (acc[c.ruban] ?? 0) + 1;
    return acc;
  }, {});
  const apresEcheance = new Date() >= FIN_VIREMENT;
  const aControler = (i) => apresEcheance && i.moyen_paiement === 'virement' && i.statut === 'en_attente';
  const nbAControler = inscriptions.filter(aControler).length;

  const visibles = filtre === 'tous' ? inscriptions : inscriptions.filter(i => i.statut === filtre);

  // ── Export liste d'accueil ─────────────────────────────────────────────
  const exporter = () => {
    // Une ligne par chien : l'accueil coche chien par chien et remet le ruban.
    const rows = [...actives]
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'))
      .flatMap(i => (i.rallye_chiens ?? []).map(c => ({
        'N°': i.numero,
        Nom: i.nom,
        Prénom: i.prenom,
        Téléphone: i.telephone,
        Chien: c.nom,
        Race: c.race ?? '',
        Ruban: c.ruban === 'jaune' ? 'Jaune' : 'Bleu',
        Statut: STATUTS[i.statut]?.label ?? i.statut,
        Paiement: i.moyen_paiement === 'twint' ? 'TWINT' : 'Virement',
        'Montant inscription': Number(i.montant_chf),
        Parcours: PARCOURS[i.parcours_prevu] ?? '',
      })));
    const csv = toCsv(rows);
    if (!csv) return;
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rallye-2027-liste-accueil-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const Stat = ({ label, value, sub }) => (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, marginTop: 4 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <Stat label="Inscriptions payées" value={payees.length} />
        <Stat label="Chiens payés" value={chiensPayes} />
        <Stat label="Encaissé" value={chf(encaisse)} />
        <Stat label="En attente" value={attente.length} sub={attente.length ? `${chf(montantAttente)} à recevoir` : null} />
      </div>

      <div style={{ ...card, display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 800 }}>Rubans demandés</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: '#f5c518', border: '1px solid rgba(0,0,0,0.2)' }} />
          Jaune : <strong>{rubans.jaune ?? 0}</strong>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <span aria-hidden="true" style={{ width: 14, height: 14, borderRadius: 7, background: '#2babe1', border: '1px solid rgba(0,0,0,0.2)' }} />
          Bleu : <strong>{rubans.bleu ?? 0}</strong>
        </div>
        <div style={{ fontSize: 12, color: 'var(--gray)' }}>Payées et en attente, hors annulées. Le ruban peut encore changer sur place.</div>
      </div>

      {nbAControler > 0 && (
        <div style={{ ...card, background: '#fdecec', border: '1.5px solid #b91c1c', color: '#7f1414', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ flexShrink: 0, display: 'inline-flex' }}><Icon name="warning" size={18} color="#b91c1c" /></span>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            <strong>{nbAControler} virement{nbAControler > 1 ? 's' : ''} toujours en attente</strong> alors que l'échéance du 12 mars est passée.
            Contrôle le compte PostFinance avant le rallye : ces lignes sont en rouge ci-dessous.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }} role="group" aria-label="Filtrer par statut">
          {[['tous', 'Toutes'], ['en_attente', 'En attente'], ['paye', 'Payées'], ['annule', 'Annulées']].map(([v, l]) => (
            <button key={v} onClick={() => setFiltre(v)} aria-pressed={filtre === v}
              style={btn(filtre === v ? 'var(--ink, #1F1F20)' : 'var(--gray-bg-alt, #f1f1f1)', filtre === v ? '#fff' : '#1F1F20')}>
              {l}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={load} style={btn('var(--gray-bg-alt, #f1f1f1)', '#1F1F20')}>Actualiser</button>
          <button onClick={exporter} disabled={actives.length === 0} style={btn('#176E94')}>
            <Icon name="download" size={14} color="#fff" /> Liste d'accueil (CSV)
          </button>
        </div>
      </div>

      {error && <div style={{ ...card, color: '#b91c1c', fontSize: 13.5 }}>{error}</div>}
      {loading && <div style={{ ...card, color: 'var(--gray)', fontSize: 13.5 }}>Chargement…</div>}
      {!loading && visibles.length === 0 && !error && (
        <div style={{ ...card, color: 'var(--gray)', fontSize: 13.5, textAlign: 'center' }}>Aucune inscription{filtre !== 'tous' ? ' avec ce statut' : ''}.</div>
      )}

      {!loading && visibles.map((i) => {
        const s = STATUTS[i.statut] ?? STATUTS.annule;
        const rouge = aControler(i);
        return (
          <div key={i.id} style={{ ...card, border: rouge ? '1.5px solid #b91c1c' : '1.5px solid transparent', background: rouge ? '#fffafa' : '#fff' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800 }}>{i.prenom} {i.nom} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray)' }}>n° {i.numero}</span></div>
                <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 2 }}>
                  {i.telephone} · {i.email} · {i.npa} {i.localite}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ background: s.bg, color: s.fg, borderRadius: 999, padding: '3px 10px', fontSize: 12, fontWeight: 800 }}>{s.label}</span>
                <div style={{ fontSize: 12.5, color: 'var(--gray)', marginTop: 4 }}>Inscrit le {fmtDate(i.created_at)}</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px', fontSize: 13.5, marginTop: 10 }}>
              <span><strong>{i.nb_chiens}</strong> chien{i.nb_chiens > 1 ? 's' : ''}</span>
              <span><strong>{chf(i.montant_chf)}</strong></span>
              <span>{i.moyen_paiement === 'twint' ? 'TWINT' : 'Virement'}</span>
              {i.reference_scor && <span>Réf. {i.reference_scor}</span>}
              {i.paye_le && <span>Payé le {fmtDate(i.paye_le)}</span>}
              {i.parcours_prevu && <span>Parcours : {PARCOURS[i.parcours_prevu]}</span>}
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
              {(i.rallye_chiens ?? []).map((c, k) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f8f5f0', borderRadius: 999, padding: '4px 10px', fontSize: 12.5 }}>
                  <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: 5, background: c.ruban === 'jaune' ? '#f5c518' : '#2babe1' }} />
                  {c.nom}{c.race ? ` (${c.race})` : ''} · {c.ruban}
                </span>
              ))}
            </div>

            {i.note_admin && <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 8 }}>{i.note_admin}</div>}

            {i.moyen_paiement === 'virement' && i.statut === 'en_attente' && (
              <div style={{ marginTop: 12 }}>
                <button onClick={() => virementRecu(i)} disabled={enCours === i.id} style={btn('#1E7B41')}>
                  <Icon name="check" size={14} color="#fff" /> {enCours === i.id ? 'Envoi…' : 'Virement reçu'}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
