// src/screens/AdminScreen.jsx
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const ADMIN_FN = 'admin-query';

function callAdmin(action, admin_password, payload = null) {
  return supabase.functions.invoke(ADMIN_FN, {
    body: { action, admin_password, payload },
  });
}

// ─── Couleurs ────────────────────────────────────────────────────────────────
const C = {
  bg: '#f4f6f8', card: '#fff', dark: '#1F1F20', blue: '#2BABE1',
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

// ─── Écran login admin ───────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pwd, setPwd] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const { data, error: fnError } = await callAdmin('list_members', pwd);
    if (fnError || data?.error) {
      setError('Mot de passe incorrect');
      setLoading(false);
    } else {
      onLogin(pwd);
    }
  };

  return (
    <div style={{ minHeight: '100dvh', background: C.dark, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 20, padding: 32, width: '100%', maxWidth: 380, boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 40, color: C.dark }}>CaniPlus</div>
          <div style={{ fontSize: 14, color: C.gray, marginTop: 4 }}>Administration</div>
        </div>
        <form onSubmit={handleLogin}>
          <input
            type="password"
            placeholder="Mot de passe admin"
            value={pwd}
            onChange={e => setPwd(e.target.value)}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${error ? C.red : '#e5e7eb'}`, fontSize: 15, outline: 'none', marginBottom: 12, boxSizing: 'border-box' }}
            autoFocus
          />
          {error && <div style={{ color: C.red, fontSize: 13, marginBottom: 10, textAlign: 'center' }}>⚠️ {error}</div>}
          <button
            type="submit"
            disabled={loading || !pwd}
            style={{ width: '100%', background: loading ? '#9ca3af' : C.blue, color: '#fff', border: 'none', borderRadius: 12, padding: '13px', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
          >
            {loading ? 'Vérification…' : 'Accéder'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Onglet Membres ──────────────────────────────────────────────────────────
function MembresTab({ pwd }) {
  const [members, setMembers] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [search, setSearch] = useState('');
  // Planification cours privé
  const [lessonTarget, setLessonTarget] = useState(null); // membre sélectionné
  const [lessonDate, setLessonDate] = useState('');
  const [lessonTime, setLessonTime] = useState('');
  const [lessonNotes, setLessonNotes] = useState('');
  const [lessonSaving, setLessonSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, s] = await Promise.all([
      callAdmin('list_members', pwd),
      callAdmin('list_subscriptions', pwd),
    ]);
    if (m.data?.members) setMembers(m.data.members);
    if (s.data?.subscriptions) setSubscriptions(s.data.subscriptions);
    setLoading(false);
  }, [pwd]);

  useEffect(() => { load(); }, [load]);

  const getCotisation = (userId) => {
    const year = new Date().getFullYear();
    return subscriptions.find(s => s.user_id === userId && s.type === 'cotisation_annuelle' && s.year === year);
  };

  const getLesson = (userId) =>
    subscriptions.find(s => s.user_id === userId && s.type === 'lecon_privee');

  const isPremium = (member) => member.premium_until && new Date(member.premium_until) > new Date();

  const togglePremium = async (member) => {
    setActionLoading(member.id + '_premium');
    const premium_until = isPremium(member) ? null : new Date(Date.now() + 365 * 86400000).toISOString();
    await callAdmin('set_premium', pwd, { user_id: member.id, premium_until });
    await load();
    setActionLoading(null);
  };

  const toggleCotisation = async (member) => {
    setActionLoading(member.id + '_cotisation');
    const coti = getCotisation(member.id);
    const newStatus = coti?.status === 'paid' ? 'pending' : 'paid';
    await callAdmin('set_cotisation', pwd, { user_id: member.id, status: newStatus });
    await load();
    setActionLoading(null);
  };

  const openLessonModal = (member) => {
    const existing = getLesson(member.id);
    if (existing?.lesson_date) {
      const d = new Date(existing.lesson_date);
      setLessonDate(d.toISOString().slice(0, 10));
      setLessonTime(d.toTimeString().slice(0, 5));
      setLessonNotes(existing.lesson_notes ?? '');
    } else {
      setLessonDate('');
      setLessonTime('09:00');
      setLessonNotes('');
    }
    setLessonTarget(member);
  };

  const handleSaveLesson = async () => {
    if (!lessonDate || !lessonTime) return;
    setLessonSaving(true);
    const lesson_date = new Date(`${lessonDate}T${lessonTime}:00`).toISOString();
    await callAdmin('set_lesson_date', pwd, {
      user_id: lessonTarget.id,
      lesson_date,
      lesson_notes: lessonNotes || null,
    });
    await load();
    setLessonSaving(false);
    setLessonTarget(null);
  };

  const fmtLesson = (iso) => new Date(iso).toLocaleDateString('fr-CH', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  const filtered = members.filter(m =>
    m.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    m.email?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <input
        placeholder="🔍 Rechercher un membre…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 16, boxSizing: 'border-box', outline: 'none' }}
      />
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 12 }}>{filtered.length} membre{filtered.length > 1 ? 's' : ''}</div>

      {filtered.map(member => {
        const coti = getCotisation(member.id);
        const premium = isPremium(member);
        const lesson = getLesson(member.id);
        return (
          <div key={member.id} style={{ background: C.card, borderRadius: 14, padding: 14, marginBottom: 10, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ width: 40, height: 40, background: C.grayBg, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>🙋‍♀️</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{member.full_name}</div>
                <div style={{ fontSize: 12, color: C.gray, marginTop: 1 }}>{member.email}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  <Badge color={coti?.status === 'paid' ? C.green : C.orange} bg={coti?.status === 'paid' ? C.greenBg : C.orangeBg}>
                    {coti?.status === 'paid' ? 'Cotisation ✓' : 'Cotisation en attente'}
                  </Badge>
                  {premium && <Badge color="#92400e" bg="#fef3c7">Premium ✨</Badge>}
                  {lesson?.lesson_date && <Badge color={C.blue} bg="#e0f4fd">🎯 {fmtLesson(lesson.lesson_date)}</Badge>}
                </div>
              </div>
            </div>
            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => toggleCotisation(member)}
                disabled={!!actionLoading}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: coti?.status === 'paid' ? C.redBg : C.greenBg,
                  color: coti?.status === 'paid' ? C.red : C.green,
                  opacity: actionLoading === member.id + '_cotisation' ? 0.6 : 1,
                }}
              >
                {actionLoading === member.id + '_cotisation' ? '…' : coti?.status === 'paid' ? '✗ Annuler cotisation' : '✓ Valider cotisation'}
              </button>
              <button
                onClick={() => togglePremium(member)}
                disabled={!!actionLoading}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: premium ? C.redBg : C.orangeBg,
                  color: premium ? C.red : C.orange,
                  opacity: actionLoading === member.id + '_premium' ? 0.6 : 1,
                }}
              >
                {actionLoading === member.id + '_premium' ? '…' : premium ? '✗ Retirer premium' : '✨ Activer premium'}
              </button>
              <button
                onClick={() => openLessonModal(member)}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                  background: '#e0f4fd', color: C.blue,
                }}
              >
                📅 {lesson?.lesson_date ? 'Modifier cours' : 'Planifier cours'}
              </button>
            </div>
          </div>
        );
      })}

      {/* Modal planification cours privé */}
      {lessonTarget && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: '#fff', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, padding: 24 }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: C.dark, marginBottom: 4 }}>📅 Cours privé</div>
            <div style={{ fontSize: 13, color: C.gray, marginBottom: 20 }}>{lessonTarget.full_name}</div>

            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Date</label>
            <input
              type="date"
              value={lessonDate}
              onChange={e => setLessonDate(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
            />

            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Heure</label>
            <input
              type="time"
              value={lessonTime}
              onChange={e => setLessonTime(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 12, boxSizing: 'border-box', outline: 'none' }}
            />

            <label style={{ fontSize: 12, color: C.gray, display: 'block', marginBottom: 4 }}>Notes (optionnel)</label>
            <input
              placeholder="Ex: terrain B, apporter la laisse…"
              value={lessonNotes}
              onChange={e => setLessonNotes(e.target.value)}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1.5px solid #e5e7eb', fontSize: 14, marginBottom: 20, boxSizing: 'border-box', outline: 'none' }}
            />

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setLessonTarget(null)}
                style={{ flex: 1, padding: '11px', borderRadius: 10, border: 'none', background: C.grayBg, color: C.gray, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={handleSaveLesson}
                disabled={lessonSaving || !lessonDate || !lessonTime}
                style={{ flex: 2, padding: '11px', borderRadius: 10, border: 'none', background: lessonSaving ? '#9ca3af' : C.blue, color: '#fff', fontSize: 14, fontWeight: 700, cursor: lessonSaving ? 'not-allowed' : 'pointer' }}
              >
                {lessonSaving ? 'Enregistrement…' : '✓ Confirmer le cours'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Onglet Paiements ────────────────────────────────────────────────────────
function PaiementsTab({ pwd }) {
  const [subscriptions, setSubscriptions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callAdmin('list_subscriptions', pwd).then(({ data }) => {
      if (data?.subscriptions) setSubscriptions(data.subscriptions);
      setLoading(false);
    });
  }, [pwd]);

  const typeLabel = { cotisation_annuelle: 'Cotisation', lecon_privee: 'Leçon privée', premium_mensuel: 'Premium' };
  const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtAmount = { cotisation_annuelle: 'CHF 150', lecon_privee: 'CHF 60', premium_mensuel: 'CHF 10/mois' };

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  const paid = subscriptions.filter(s => s.status === 'paid');
  const pending = subscriptions.filter(s => s.status !== 'paid');

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, background: C.greenBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.green }}>{paid.length}</div>
          <div style={{ fontSize: 12, color: C.green }}>Paiements confirmés</div>
        </div>
        <div style={{ flex: 1, background: C.orangeBg, borderRadius: 12, padding: '12px 16px' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: C.orange }}>{pending.length}</div>
          <div style={{ fontSize: 12, color: C.orange }}>En attente</div>
        </div>
      </div>
      {subscriptions.map(sub => (
        <div key={sub.id} style={{ background: C.card, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 36, height: 36, background: sub.status === 'paid' ? C.greenBg : C.orangeBg, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {sub.status === 'paid' ? '✅' : '⏳'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>{typeLabel[sub.type] ?? sub.type}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.user_email ?? '—'} · {fmtDate(sub.created_at)}</div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: sub.status === 'paid' ? C.green : C.orange }}>{fmtAmount[sub.type] ?? '—'}</div>
            <div style={{ fontSize: 11, color: C.gray }}>{sub.status === 'paid' ? 'Payé' : 'En attente'}</div>
          </div>
        </div>
      ))}
      {subscriptions.length === 0 && <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucun paiement</div>}
    </div>
  );
}

// ─── Onglet Chiens ───────────────────────────────────────────────────────────
function ChiensTab({ pwd }) {
  const [dogs, setDogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    callAdmin('list_dogs', pwd).then(({ data }) => {
      if (data?.dogs) setDogs(data.dogs);
      setLoading(false);
    });
  }, [pwd]);

  if (loading) return <div style={{ padding: 32, textAlign: 'center', color: C.gray }}>Chargement…</div>;

  return (
    <div>
      <div style={{ fontSize: 12, color: C.gray, marginBottom: 12 }}>{dogs.length} chien{dogs.length > 1 ? 's' : ''} enregistré{dogs.length > 1 ? 's' : ''}</div>
      {dogs.map(dog => (
        <div key={dog.id} style={{ background: C.card, borderRadius: 12, padding: '12px 14px', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, boxShadow: '0 1px 6px rgba(0,0,0,0.06)' }}>
          <div style={{ width: 44, height: 44, background: '#fef3c7', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🐕</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.dark }}>{dog.name}</div>
            <div style={{ fontSize: 12, color: C.gray }}>{dog.breed ?? 'Race non renseignée'}{dog.sex ? ` · ${dog.sex}` : ''}</div>
            <div style={{ fontSize: 11, color: C.gray, marginTop: 2 }}>
              Propriétaire : {dog.profiles?.full_name ?? '—'}
            </div>
          </div>
          <Badge color={dog.vaccinated ? C.green : C.orange} bg={dog.vaccinated ? C.greenBg : C.orangeBg}>
            {dog.vaccinated ? 'Vacciné ✓' : 'À vérifier'}
          </Badge>
        </div>
      ))}
      {dogs.length === 0 && <div style={{ textAlign: 'center', color: C.gray, padding: 32 }}>Aucun chien enregistré</div>}
    </div>
  );
}

// ─── App principale ──────────────────────────────────────────────────────────
export default function AdminScreen() {
  const [pwd, setPwd] = useState(() => sessionStorage.getItem('admin_pwd') ?? null);
  const [tab, setTab] = useState('membres');

  const handleLogin = (password) => {
    sessionStorage.setItem('admin_pwd', password);
    setPwd(password);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('admin_pwd');
    setPwd(null);
  };

  if (!pwd) return <AdminLogin onLogin={handleLogin} />;

  const tabs = [
    { id: 'membres', label: '👥 Membres' },
    { id: 'paiements', label: '💳 Paiements' },
    { id: 'chiens', label: '🐕 Chiens' },
  ];

  return (
    <div style={{ minHeight: '100dvh', background: C.bg }}>
      {/* Header */}
      <div style={{ background: C.dark, padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 10 }}>
        <div>
          <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff' }}>CaniPlus</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: -2 }}>Administration</div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }}
        >
          Déconnexion
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0 16px' }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1, padding: '12px 6px', background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: tab === t.id ? 800 : 500,
              color: tab === t.id ? C.blue : C.gray,
              borderBottom: `3px solid ${tab === t.id ? C.blue : 'transparent'}`,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
        {tab === 'membres' && <MembresTab pwd={pwd} />}
        {tab === 'paiements' && <PaiementsTab pwd={pwd} />}
        {tab === 'chiens' && <ChiensTab pwd={pwd} />}
      </div>
    </div>
  );
}
