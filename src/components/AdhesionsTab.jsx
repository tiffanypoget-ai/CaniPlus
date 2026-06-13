// src/components/AdhesionsTab.jsx
// Onglet admin « Adhésions » : demandes du formulaire public caniplus.ch/adhesion.
// Liste + détail + Valider / Refuser via l'edge function validate-adhesion.
// Autonome : ne dépend que de supabase et d'Icons (pas d'export depuis AdminScreen).

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const C = {
  card: '#fff', dark: '#1F1F20', blue: '#2BABE1',
  green: '#16a34a', greenBg: '#dcfce7', red: '#ef4444', redBg: '#fee2e2',
  orange: '#d97706', orangeBg: '#fef3c7', gray: '#6b7280', grayBg: '#f3f4f6',
};

function Badge({ color, bg, children }) {
  return (
    <span style={{ background: bg, color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 6 }}>
      {children}
    </span>
  );
}

function callAdhesions(action, _pwd, payload = null) {
  return supabase.functions.invoke('admin-auth-proxy', {
    body: { target: 'validate-adhesion', action, payload },
  });
}

const STATUT = {
  en_attente: { label: 'En attente', color: C.orange, bg: C.orangeBg, border: C.orange },
  validee:    { label: 'Validée',    color: C.green,  bg: C.greenBg,  border: C.green },
  refusee:    { label: 'Refusée',    color: C.red,    bg: C.redBg,    border: '#d1d5db' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AdhesionsTab({ pwd }) {
  const [adhesions, setAdhesions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('en_attente');
  const [openId, setOpenId] = useState(null);
  const [detail, setDetail] = useState(null);          // { adhesion, attestation_url }
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);
  const [refusingId, setRefusingId] = useState(null);  // demande en cours de refus (champ motif ouvert)
  const [motif, setMotif] = useState('');
  const [message, setMessage] = useState(null);        // feedback après action

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await callAdhesions('list', pwd);
    setAdhesions(data?.adhesions ?? []);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (id) => {
    if (openId === id) { setOpenId(null); setDetail(null); return; }
    setOpenId(id);
    setDetail(null);
    setDetailLoading(true);
    const { data } = await callAdhesions('detail', pwd, { adhesion_id: id });
    setDetail(data ?? null);
    setDetailLoading(false);
  };

  const valider = async (a) => {
    if (!window.confirm(`Valider l'adhésion de ${a.prenom} ${a.nom} ?\n\nLe compte app sera créé et l'e-mail d'invitation envoyé.`)) return;
    setActionLoading(a.id);
    setMessage(null);
    const { data, error } = await callAdhesions('validate', pwd, { adhesion_id: a.id, valide_par: 'Tiffany' });
    setActionLoading(null);
    if (error || data?.error) {
      setMessage({ type: 'error', text: `Validation impossible : ${data?.error || error?.message}` });
      return;
    }
    setMessage({ type: 'ok', text: `Adhésion de ${a.prenom} validée. Invitation envoyée à ${a.email}.` });
    setOpenId(null);
    setDetail(null);
    await load();
  };

  const refuser = async (a) => {
    setActionLoading(a.id);
    setMessage(null);
    const { data, error } = await callAdhesions('refuse', pwd, {
      adhesion_id: a.id,
      motif: motif.trim() || null,
      valide_par: 'Tiffany',
    });
    setActionLoading(null);
    setRefusingId(null);
    setMotif('');
    if (error || data?.error) {
      setMessage({ type: 'error', text: `Refus impossible : ${data?.error || error?.message}` });
      return;
    }
    setMessage({ type: 'ok', text: `Demande de ${a.prenom} refusée. E-mail envoyé.` });
    setOpenId(null);
    setDetail(null);
    await load();
  };

  const pendingCount = adhesions.filter((a) => a.statut === 'en_attente').length;
  const filtered = adhesions.filter((a) => (filter === 'all' ? true : a.statut === filter));

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {[
          ['en_attente', 'En attente', pendingCount],
          ['validee', 'Validées', 0],
          ['refusee', 'Refusées', 0],
          ['all', 'Tout', 0],
        ].map(([val, label, count]) => (
          <button key={val} onClick={() => setFilter(val)} style={{ padding: '6px 12px', borderRadius: 20, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: filter === val ? C.dark : C.grayBg, color: filter === val ? '#fff' : C.gray }}>
            {label}{count > 0 ? ` (${count})` : ''}
          </button>
        ))}
      </div>

      {message && (
        <div style={{ background: message.type === 'ok' ? C.greenBg : C.redBg, color: message.type === 'ok' ? C.green : C.red, borderRadius: 10, padding: '10px 14px', marginBottom: 14, fontSize: 13, fontWeight: 600 }}>
          {message.text}
        </div>
      )}

      {filtered.length === 0 && (
        <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>
          {filter === 'en_attente' ? 'Aucune demande en attente' : 'Aucune demande'}
        </div>
      )}

      {filtered.map((a) => {
        const st = STATUT[a.statut] ?? STATUT.en_attente;
        const chiens = a.adhesion_chiens ?? [];
        const rcManquante = !a.attestation_rc_path;
        const isOpen = openId === a.id;
        return (
          <div key={a.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `4px solid ${st.border}` }}>
            <div
              onClick={() => openDetail(a.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            >
              <div style={{ width: 36, height: 36, background: C.grayBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="user" size={20} color={C.gray} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.dark }}>{a.prenom} {a.nom}</div>
                <div style={{ fontSize: 11, color: C.gray }}>
                  {chiens.map((c) => c.nom).join(', ') || 'Aucun chien'} · {fmtDate(a.created_at)}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                {rcManquante && a.statut === 'en_attente' && (
                  <Badge color={C.red} bg={C.redBg}>⚠️ Attestation RC manquante</Badge>
                )}
                <Badge color={st.color} bg={st.bg}>{st.label}</Badge>
              </div>
            </div>

            {isOpen && (
              <div style={{ marginTop: 14, borderTop: `1px solid ${C.grayBg}`, paddingTop: 14 }}>
                {detailLoading && <div style={{ color: C.gray, fontSize: 13 }}>Chargement du détail…</div>}
                {!detailLoading && detail?.adhesion && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginBottom: 12, fontSize: 13, color: C.dark }}>
                      <div><strong>E-mail :</strong> {detail.adhesion.email}</div>
                      <div><strong>Téléphone :</strong> {detail.adhesion.telephone}</div>
                      <div><strong>Adresse :</strong> {detail.adhesion.adresse}, {detail.adhesion.npa_localite}</div>
                      <div><strong>Demande du :</strong> {fmtDate(detail.adhesion.created_at)}</div>
                      <div><strong>Photos/vidéos :</strong> {detail.adhesion.consentement_photos ? 'Accepté' : 'Refusé'}</div>
                      <div><strong>Confidentialité :</strong> acceptée le {fmtDate(detail.adhesion.consentements_horodatage)}</div>
                      {detail.adhesion.statut !== 'en_attente' && (
                        <div><strong>Traitée le :</strong> {fmtDate(detail.adhesion.valide_le)} par {detail.adhesion.valide_par || '—'}</div>
                      )}
                      {detail.adhesion.motif_refus && (
                        <div><strong>Motif du refus :</strong> {detail.adhesion.motif_refus}</div>
                      )}
                    </div>

                    <div style={{ fontSize: 11, fontWeight: 700, color: C.gray, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      Chien{(detail.adhesion.adhesion_chiens ?? []).length > 1 ? 's' : ''}
                    </div>
                    {(detail.adhesion.adhesion_chiens ?? []).map((c) => (
                      <div key={c.id} style={{ background: C.grayBg, borderRadius: 8, padding: '8px 12px', marginBottom: 6, fontSize: 13 }}>
                        <strong>{c.nom}</strong>{c.race ? ` · ${c.race}` : ''}{c.date_naissance ? ` · né(e) le ${fmtDate(c.date_naissance)}` : ''}<br />
                        <span style={{ color: C.gray, fontSize: 12 }}>
                          Amicus {c.numero_amicus} · Vaccins {c.vaccins_a_jour ? 'à jour' : 'PAS à jour'}
                          {c.date_dernier_rappel ? ` (dernier rappel : ${fmtDate(c.date_dernier_rappel)})` : ''}
                        </span>
                      </div>
                    ))}

                    <div style={{ margin: '12px 0' }}>
                      {detail.attestation_url ? (
                        <a href={detail.attestation_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#f0f9ff', color: '#0369a1', padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
                          <Icon name="file" size={14} color="#0369a1" /> Voir l'attestation RC (lien valable 1 h)
                        </a>
                      ) : (
                        <span style={{ color: C.red, fontSize: 13, fontWeight: 600 }}>⚠️ Attestation RC manquante ou illisible — à réclamer avant validation.</span>
                      )}
                    </div>

                    {detail.adhesion.statut === 'en_attente' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {refusingId === a.id && (
                          <input
                            type="text"
                            value={motif}
                            onChange={(e) => setMotif(e.target.value)}
                            placeholder="Motif du refus (facultatif, envoyé par e-mail)"
                            style={{ padding: '10px 12px', borderRadius: 8, border: `1.5px solid ${C.grayBg}`, fontSize: 13, fontFamily: 'inherit' }}
                          />
                        )}
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            onClick={() => valider(a)}
                            disabled={actionLoading === a.id}
                            style={{ flex: 1, minWidth: 140, background: C.green, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === a.id ? 0.6 : 1 }}
                          >
                            {actionLoading === a.id ? '…' : 'Valider'}
                          </button>
                          {refusingId === a.id ? (
                            <>
                              <button
                                onClick={() => refuser(a)}
                                disabled={actionLoading === a.id}
                                style={{ flex: 1, minWidth: 140, background: C.red, color: '#fff', border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: actionLoading === a.id ? 0.6 : 1 }}
                              >
                                Confirmer le refus
                              </button>
                              <button
                                onClick={() => { setRefusingId(null); setMotif(''); }}
                                style={{ background: C.grayBg, color: C.gray, border: 'none', borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                              >
                                Annuler
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => { setRefusingId(a.id); setMotif(''); }}
                              style={{ flex: 1, minWidth: 140, background: '#fff', color: C.red, border: `1.5px solid ${C.red}`, borderRadius: 10, padding: '11px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
                            >
                              Refuser…
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
