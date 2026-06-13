// src/screens/EducatriceScreen.jsx
// Écran terrain pour les éducatrices (Laeti, Tifanie) — accessible sur /educatrice.
// Philosophie : un écran = une action. Grosses zones tactiles, zéro fioriture.
//   1. Mes cours du jour (navigation par jour)
//   2. Pointage : un tap sur un élève = présent → absent → non pointé
//   3. Un tap sur un chien = fiche remarques (lecture + ajout)
// Aucune donnée de paiement, aucune fonction admin.

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from '../components/Icons';

const C = {
  bg: '#f4f6f8', card: '#fff', dark: '#1F1F20', blue: '#2BABE1',
  green: '#16a34a', greenBg: '#dcfce7', red: '#ef4444', redBg: '#fee2e2',
  orange: '#d97706', orangeBg: '#fef3c7', gray: '#6b7280', grayBg: '#f3f4f6',
};

const toLocalISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const heure = (t) => String(t ?? '').slice(0, 5);

export default function EducatriceScreen() {
  const { profile, loading: authLoading } = useAuth();
  const [day, setDay] = useState(() => toLocalISO(new Date()));
  const [courses, setCourses] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [profilesById, setProfilesById] = useState({});
  const [dogsByOwner, setDogsByOwner] = useState({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [openDog, setOpenDog] = useState(null); // { dog, ownerName }
  const [openPrep, setOpenPrep] = useState(null); // group_course
  const [prepByCourse, setPrepByCourse] = useState({}); // course_id -> prep row

  const isEducatrice = profile?.role === 'educatrice' || profile?.role === 'admin';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: cs } = await supabase
        .from('group_courses')
        .select('id, course_type, course_date, start_time, end_time, notes, color')
        .eq('course_date', day)
        .order('start_time');
      const courseIds = (cs ?? []).map(c => c.id);
      let atts = [];
      if (courseIds.length > 0) {
        const { data } = await supabase
          .from('course_attendance')
          .select('id, course_id, user_id, dog_ids, present')
          .in('course_id', courseIds);
        atts = data ?? [];
      }
      const userIds = [...new Set(atts.map(a => a.user_id).filter(Boolean))];
      let profs = [], dogsData = [];
      if (userIds.length > 0) {
        const [{ data: p }, { data: d }] = await Promise.all([
          supabase.from('profiles').select('id, full_name, email, phone').in('id', userIds),
          supabase.from('dogs').select('id, name, breed, sex, birth_year, photo_url, owner_id').in('owner_id', userIds),
        ]);
        profs = p ?? [];
        dogsData = d ?? [];
      }
      setCourses(cs ?? []);
      setAttendance(atts);
      // Prépas existantes pour les cours du jour (affiche l'état du bouton)
      if (courseIds.length > 0) {
        const { data: preps } = await supabase
          .from('course_prep')
          .select('course_id, objectif, plan, materiel, notes')
          .in('course_id', courseIds);
        setPrepByCourse(Object.fromEntries((preps ?? []).map(p => [p.course_id, p])));
      } else {
        setPrepByCourse({});
      }
      setProfilesById(Object.fromEntries(profs.map(p => [p.id, p])));
      const byOwner = {};
      for (const d of dogsData) {
        if (!byOwner[d.owner_id]) byOwner[d.owner_id] = [];
        byOwner[d.owner_id].push(d);
      }
      setDogsByOwner(byOwner);
    } finally {
      setLoading(false);
    }
  }, [day]);

  useEffect(() => { if (isEducatrice) load(); }, [isEducatrice, load]);

  // Pointage : non pointé → présent → absent → non pointé
  const cycle = async (att) => {
    const next = att.present === null || att.present === undefined ? true : att.present === true ? false : null;
    setBusyId(att.id);
    setAttendance(arr => arr.map(a => a.id === att.id ? { ...a, present: next } : a));
    await supabase
      .from('course_attendance')
      .update({
        present: next,
        present_marked_at: next === null ? null : new Date().toISOString(),
        present_marked_by: next === null ? null : profile.id,
      })
      .eq('id', att.id);
    setBusyId(null);
  };

  const shiftDay = (n) => {
    const d = new Date(day + 'T00:00:00');
    d.setDate(d.getDate() + n);
    setDay(toLocalISO(d));
  };

  const dayLabel = (() => {
    const d = new Date(day + 'T00:00:00');
    const today = toLocalISO(new Date());
    const base = d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
    return day === today ? `Aujourd'hui · ${base}` : base;
  })();

  // ── Gates ──
  if (authLoading) {
    return <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: C.bg, color: C.gray }}>Chargement…</div>;
  }
  if (!profile) {
    return (
      <Gate title="Espace éducatrices" text="Connecte-toi avec ton compte CaniPlus pour accéder au pointage." cta="Se connecter" />
    );
  }
  if (!isEducatrice) {
    return (
      <Gate title="Espace éducatrices" text="Ce compte n'a pas le rôle éducatrice. Demande à Tiffany de l'activer sur ton profil." cta="Retour à l'app" />
    );
  }

  return (
    <div style={{ minHeight: '100dvh', background: C.bg, paddingBottom: 60 }}>
      {/* En-tête */}
      <div style={{ background: C.dark, color: '#fff', padding: '16px 18px 14px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.6)' }}>CANIPLUS · ÉDUCATRICE</div>
            <div style={{ fontSize: 18, fontWeight: 900, marginTop: 2 }}>{profile.full_name?.split(' ')[0] ?? ''}</div>
          </div>
          <a href="/" style={{ color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
            <Icon name="home" size={16} color="rgba(255,255,255,0.7)" /> App
          </a>
        </div>
      </div>

      <div style={{ maxWidth: 680, margin: '0 auto', padding: '14px 14px 0' }}>
        {/* Navigation par jour */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <DayBtn onClick={() => shiftDay(-1)}><Icon name="arrowLeft" size={18} color={C.dark} /></DayBtn>
          <div style={{ flex: 1, textAlign: 'center', background: C.card, borderRadius: 12, padding: '12px 8px', fontWeight: 800, fontSize: 14.5, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', textTransform: 'capitalize' }}>
            {dayLabel}
          </div>
          <DayBtn onClick={() => shiftDay(1)}><Icon name="arrowRight" size={18} color={C.dark} /></DayBtn>
        </div>

        {loading && <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>}

        {!loading && courses.length === 0 && (
          <div style={{ background: C.card, borderRadius: 14, padding: '26px 18px', textAlign: 'center', color: C.gray, fontWeight: 600 }}>
            Pas de cours ce jour-là.
          </div>
        )}

        {!loading && courses.map((c) => {
          const atts = attendance.filter(a => a.course_id === c.id);
          const presents = atts.filter(a => a.present === true).length;
          return (
            <div key={c.id} style={{ background: C.card, borderRadius: 16, padding: 16, marginBottom: 14, boxShadow: '0 1px 6px rgba(0,0,0,0.06)', borderLeft: `5px solid ${c.color || C.blue}` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {c.course_type === 'theorique' ? 'Cours théorique' : 'Cours collectif'}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: C.gray }}>
                  {heure(c.start_time)}{c.end_time ? `–${heure(c.end_time)}` : ''}
                </div>
              </div>
              {c.notes && <div style={{ fontSize: 13, color: C.gray, marginBottom: 8 }}>{c.notes}</div>}
              <div style={{ fontSize: 12.5, fontWeight: 700, color: presents > 0 ? C.green : C.gray, marginBottom: 10 }}>
                {atts.length === 0 ? 'Aucun inscrit' : `${presents}/${atts.length} présent${presents > 1 ? 's' : ''}`}
              </div>

              <button onClick={() => setOpenPrep(c)} style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: prepByCourse[c.id] ? '#e8f7fd' : C.grayBg,
                border: 'none', borderRadius: 12, padding: '11px', cursor: 'pointer',
                fontSize: 13.5, fontWeight: 800, color: prepByCourse[c.id] ? '#1a8bbf' : C.gray, marginBottom: 12,
              }}>
                <Icon name="edit" size={15} color={prepByCourse[c.id] ? '#1a8bbf' : C.gray} />
                {prepByCourse[c.id] ? 'Voir / modifier la prépa' : 'Préparer la séance'}
              </button>

              {atts.map((a) => {
                const p = profilesById[a.user_id];
                const memberDogs = (dogsByOwner[a.user_id] ?? []).filter(d =>
                  !a.dog_ids || a.dog_ids.length === 0 || a.dog_ids.includes(d.id)
                );
                const state = a.present === true ? 'present' : a.present === false ? 'absent' : 'none';
                const stateStyle = state === 'present'
                  ? { bg: C.greenBg, border: C.green, color: C.green, label: 'Présent', icon: 'checkCircle' }
                  : state === 'absent'
                  ? { bg: C.redBg, border: C.red, color: C.red, label: 'Absent', icon: 'close' }
                  : { bg: C.grayBg, border: '#d1d5db', color: C.gray, label: 'Pointer', icon: 'clock' };
                return (
                  <div key={a.id} style={{ borderTop: '1px solid #f0f0f0', padding: '10px 0' }}>
                    <button
                      onClick={() => cycle(a)}
                      disabled={busyId === a.id}
                      style={{
                        width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                        background: stateStyle.bg, border: `2px solid ${stateStyle.border}`,
                        borderRadius: 14, padding: '13px 14px', cursor: 'pointer', textAlign: 'left',
                        opacity: busyId === a.id ? 0.6 : 1,
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 800, fontSize: 15.5, color: C.dark }}>{p?.full_name ?? p?.email ?? 'Membre'}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: stateStyle.color, fontWeight: 800, fontSize: 13.5, flexShrink: 0 }}>
                        <Icon name={stateStyle.icon} size={17} color={stateStyle.color} />
                        {stateStyle.label}
                      </div>
                    </button>
                    {memberDogs.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 7, paddingLeft: 2 }}>
                        {memberDogs.map(d => (
                          <button key={d.id} onClick={() => setOpenDog({ dog: d, ownerName: p?.full_name ?? '' })} style={{
                            display: 'flex', alignItems: 'center', gap: 5, background: '#e8f7fd',
                            border: 'none', borderRadius: 999, padding: '6px 12px', cursor: 'pointer',
                            fontSize: 12.5, fontWeight: 700, color: '#1a8bbf',
                          }}>
                            <Icon name="paw" size={12} color="#1a8bbf" /> {d.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {openPrep && (
        <PrepSheet
          course={openPrep}
          userId={profile.id}
          onClose={() => setOpenPrep(null)}
          onSaved={(prep) => setPrepByCourse(m => ({ ...m, [openPrep.id]: prep }))}
        />
      )}

      {openDog && (
        <DogSheet
          dog={openDog.dog}
          ownerName={openDog.ownerName}
          authorId={profile.id}
          authorName={profile.full_name}
          onClose={() => setOpenDog(null)}
        />
      )}
    </div>
  );
}

function DayBtn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: C.card, border: 'none', borderRadius: 12, width: 46, height: 46,
      cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>{children}</button>
  );
}

function Gate({ title, text, cta }) {
  return (
    <div style={{ minHeight: '100dvh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 400, textAlign: 'center' }}>
        <div style={{ marginBottom: 12 }}><Icon name="paw" size={34} color={C.blue} /></div>
        <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 8 }}>{title}</div>
        <p style={{ fontSize: 14, color: C.gray, lineHeight: 1.6, marginBottom: 20 }}>{text}</p>
        <a href="/" style={{ display: 'inline-block', background: C.blue, color: '#fff', borderRadius: 12, padding: '12px 26px', fontWeight: 800, fontSize: 14.5, textDecoration: 'none' }}>{cta}</a>
      </div>
    </div>
  );
}

// ── Fiche chien : infos + remarques, en bas d'écran ──
function DogSheet({ dog, ownerName, authorId, authorName, onClose }) {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('dog_notes')
      .select('id, author_role, author_name, content, created_at')
      .eq('dog_id', dog.id)
      .order('created_at', { ascending: false });
    setNotes(data ?? []);
    setLoading(false);
  }, [dog.id]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  const addNote = async () => {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    const { error } = await supabase.from('dog_notes').insert({
      dog_id: dog.id,
      author_id: authorId,
      author_role: 'educatrice',
      author_name: authorName ?? 'Éducatrice',
      content,
    });
    if (!error) { setDraft(''); await loadNotes(); }
    setSaving(false);
  };

  const sexLabel = dog.sex === 'male' || dog.sex === 'm' ? 'Mâle' : dog.sex === 'female' || dog.sex === 'f' ? 'Femelle' : null;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 680, maxHeight: '82dvh', overflowY: 'auto', padding: '18px 18px 26px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 42, height: 5, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          {dog.photo_url ? (
            <img src={dog.photo_url} alt={dog.name} style={{ width: 46, height: 46, borderRadius: 14, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 46, height: 46, borderRadius: 14, background: '#e8f7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name="dog" size={24} color={C.blue} />
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{dog.name}</div>
            <div style={{ fontSize: 12.5, color: C.gray }}>
              {[dog.breed, sexLabel, dog.birth_year ? `né·e en ${dog.birth_year}` : null, ownerName ? `· ${ownerName}` : null].filter(Boolean).join(' · ')}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: C.grayBg, border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="close" size={15} color={C.gray} />
          </button>
        </div>

        {/* Ajout rapide */}
        <div style={{ marginTop: 14 }}>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Nouvelle remarque (visible par Tiffany et le·la propriétaire)…"
            rows={2}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: '11px 12px', fontSize: 14.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
          />
          <button onClick={addNote} disabled={saving || !draft.trim()} style={{
            marginTop: 8, width: '100%', background: draft.trim() ? C.blue : C.grayBg,
            color: draft.trim() ? '#fff' : C.gray, border: 'none', borderRadius: 12,
            padding: '12px', fontWeight: 800, fontSize: 14.5, cursor: draft.trim() ? 'pointer' : 'default',
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? '…' : 'Ajouter la remarque'}
          </button>
        </div>

        {/* Historique */}
        <div style={{ marginTop: 16 }}>
          {loading && <div style={{ color: C.gray, fontSize: 13.5, textAlign: 'center', padding: 12 }}>Chargement…</div>}
          {!loading && notes.length === 0 && <div style={{ color: C.gray, fontSize: 13.5, textAlign: 'center', padding: 12 }}>Aucune remarque pour l'instant.</div>}
          {notes.map(n => (
            <div key={n.id} style={{ background: C.grayBg, borderRadius: 12, padding: '10px 13px', marginBottom: 8 }}>
              <div style={{ fontSize: 14, color: C.dark, lineHeight: 1.5 }}>{n.content}</div>
              <div style={{ fontSize: 11.5, color: C.gray, marginTop: 5, fontWeight: 600 }}>
                {n.author_name ?? (n.author_role === 'admin' ? 'Tiffany' : n.author_role === 'educatrice' ? 'Éducatrice' : 'Propriétaire')}
                {' · '}
                {new Date(n.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Lien du dossier Drive des fiches d'exercices (209 fiches Word) ──
// À renseigner avec le lien de partage du dossier « caniplus document de cours fiches ».
const FICHES_DRIVE_URL = '';

// ── Prépa de séance : partagée par toute l'équipe, une par cours ──
function PrepSheet({ course, userId, onClose, onSaved }) {
  const [form, setForm] = useState({ objectif: '', plan: '', materiel: '', notes: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('course_prep')
        .select('objectif, plan, materiel, notes, updated_at')
        .eq('course_id', course.id)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setForm({ objectif: data.objectif ?? '', plan: data.plan ?? '', materiel: data.materiel ?? '', notes: data.notes ?? '' });
        setSavedAt(data.updated_at);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [course.id]);

  const save = async () => {
    setSaving(true);
    const payload = {
      course_id: course.id,
      objectif: form.objectif.trim() || null,
      plan: form.plan.trim() || null,
      materiel: form.materiel.trim() || null,
      notes: form.notes.trim() || null,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    };
    const { error } = await supabase.from('course_prep').upsert(payload, { onConflict: 'course_id' });
    if (!error) {
      setSavedAt(payload.updated_at);
      onSaved?.(payload);
    }
    setSaving(false);
  };

  const heure2 = (t) => String(t ?? '').slice(0, 5);
  const titreCours = course.course_type === 'theorique' ? 'Cours théorique' : 'Cours collectif';

  const Field = ({ label, value, onChange, placeholder, rows }) => (
    <label style={{ display: 'block', marginBottom: 14 }}>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: PC.gray, display: 'block', marginBottom: 5 }}>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, border: '1.5px solid #e5e7eb', padding: '11px 12px', fontSize: 14.5, resize: 'vertical', outline: 'none', fontFamily: 'inherit', lineHeight: 1.5 }}
      />
    </label>
  );

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 680, maxHeight: '88dvh', overflowY: 'auto', padding: '18px 18px 26px' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ width: 42, height: 5, background: '#e5e7eb', borderRadius: 999, margin: '0 auto 14px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <div style={{ width: 46, height: 46, borderRadius: 14, background: '#e8f7fd', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="edit" size={22} color={PC.blue} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 900, fontSize: 17 }}>Préparer la séance</div>
            <div style={{ fontSize: 12.5, color: PC.gray }}>
              {titreCours} · {new Date(course.course_date + 'T00:00:00').toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short' })} · {heure2(course.start_time)}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fermer" style={{ background: PC.grayBg, border: 'none', borderRadius: 10, width: 34, height: 34, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon name="close" size={15} color={PC.gray} />
          </button>
        </div>

        <div style={{ background: PC.orangeBg, borderRadius: 10, padding: '9px 13px', fontSize: 12.5, color: PC.orange, fontWeight: 700, marginBottom: 16 }}>
          Cette prépa est partagée : toute l'équipe la voit et peut la compléter.
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: PC.gray }}>Chargement…</div>
        ) : (
          <>
            <Field label="Objectif de la séance" value={form.objectif} onChange={(v) => setForm(f => ({ ...f, objectif: v }))} placeholder="Ex. : travailler le rappel avec distractions légères" rows={2} />
            <Field label="Déroulé / plan" value={form.plan} onChange={(v) => setForm(f => ({ ...f, plan: v }))} placeholder={"Ex. :\n1. Échauffement en laisse (5 min)\n2. Touch et focus (10 min)\n3. Rappel à 2, puis à 5 m\n4. Retour au calme"} rows={6} />
            <Field label="Matériel à emporter" value={form.materiel} onChange={(v) => setForm(f => ({ ...f, materiel: v }))} placeholder="Ex. : longes 5 m, friandises top niveau, plots, clicker" rows={2} />
            <Field label="Notes libres" value={form.notes} onChange={(v) => setForm(f => ({ ...f, notes: v }))} placeholder="Tout ce qui peut aider : binômes à surveiller, météo, rappels…" rows={3} />

            {/* Accès aux fiches d'exercices */}
            {FICHES_DRIVE_URL ? (
              <a href={FICHES_DRIVE_URL} target="_blank" rel="noreferrer" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: '#e8f7fd', borderRadius: 12, padding: '12px', textDecoration: 'none',
                color: '#1a8bbf', fontWeight: 800, fontSize: 14, marginBottom: 14,
              }}>
                <Icon name="fileText" size={16} color="#1a8bbf" /> Ouvrir les fiches d'exercices
              </a>
            ) : (
              <div style={{ background: PC.grayBg, borderRadius: 12, padding: '12px', textAlign: 'center', color: PC.gray, fontSize: 12.5, fontWeight: 600, marginBottom: 14 }}>
                Lien des fiches d'exercices à venir
              </div>
            )}

            <button onClick={save} disabled={saving} style={{
              width: '100%', background: PC.blue, color: '#fff', border: 'none', borderRadius: 12,
              padding: '13px', fontWeight: 800, fontSize: 15, cursor: 'pointer', opacity: saving ? 0.6 : 1,
            }}>
              {saving ? 'Enregistrement…' : 'Enregistrer la prépa'}
            </button>
            {savedAt && !saving && (
              <div style={{ textAlign: 'center', fontSize: 11.5, color: PC.gray, marginTop: 8 }}>
                Dernière modif. {new Date(savedAt).toLocaleString('fr-CH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const PC = {
  blue: '#2BABE1', green: '#16a34a', red: '#ef4444', orange: '#d97706',
  orangeBg: '#fef3c7', gray: '#6b7280', grayBg: '#f3f4f6', dark: '#1F1F20',
};
