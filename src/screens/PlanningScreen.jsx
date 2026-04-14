// src/screens/PlanningScreen.jsx
// Planning hebdomadaire collectif + cours privés

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PrivateCourseRequestModal from '../components/PrivateCourseRequestModal';
import PaiementModal from '../components/PaiementModal';

// ─── Helpers ────────────────────────────────────────────────────────────────

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0=dim
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// ⚠️ Utilise les composantes locales pour éviter le décalage UTC (ex. UTC+2 en Suisse)
function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DAYS_FULL   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR   = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const MONTHS_FULL = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];

function fmtWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  if (sameMonth) {
    return `${monday.getDate()} – ${sunday.getDate()} ${MONTHS_FULL[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTHS_FR[monday.getMonth()]} – ${sunday.getDate()} ${MONTHS_FR[sunday.getMonth()]} ${monday.getFullYear()}`;
}

function fmtCourseDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day:   DAYS_FULL[d.getDay()],
    date:  d.getDate(),
    month: MONTHS_FULL[d.getMonth()],
    short: DAYS_SHORT[d.getDay()],
    num:   d.getDate(),
  };
}

function fmtPrivateSlot(slot) {
  if (!slot) return '';
  const d = new Date(slot.date + 'T00:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()} · ${slot.start}–${slot.end}`;
}

const STATUS_LABELS = {
  pending:   { label: 'En attente', color: '#d97706', bg: '#fef3c7' },
  confirmed: { label: 'Confirmé ✓', color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'Annulé',     color: '#dc2626', bg: '#fee2e2' },
};

// ─── Composant principal ─────────────────────────────────────────────────────

const GCAL_ID = '86193b5af60ce2a68d15ff3eaecc04bd07632a9dda09aecce8dd239e3dddb413@group.calendar.google.com';

export default function PlanningScreen({ onNavigate }) {
  const { profile } = useAuth();
  const courseType  = profile?.course_type ?? 'group';
  const showGroup   = courseType === 'group'   || courseType === 'both';
  const showPrivate = courseType === 'private' || courseType === 'both';
  const [activeTab, setActiveTab] = useState('calendrier');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 0',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Planning 📅</div>

        {/* ── Onglets ── */}
        {showPrivate && (
          <div style={{ display: 'flex', gap: 0, marginTop: 12 }}>
            {[
              { id: 'calendrier', label: '📅 Calendrier' },
              { id: 'prives',     label: '🎯 Privés' },
            ].map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  flex: 1, padding: '10px 0', background: 'none', border: 'none',
                  color: activeTab === t.id ? '#fff' : 'rgba(255,255,255,0.45)',
                  fontSize: 13, fontWeight: activeTab === t.id ? 800 : 500,
                  borderBottom: `3px solid ${activeTab === t.id ? '#2BABE1' : 'transparent'}`,
                  cursor: 'pointer', transition: 'all 0.2s',
                }}
              >{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenu scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f4f6f8' }} className="screen-content">
        <CalendrierTab
          profile={profile}
          showGroup={showGroup}
          showPrivate={showPrivate}
          activeTab={activeTab}
          onNavigate={onNavigate}
        />
      </div>
    </div>
  );
}


// ─── Onglet Calendrier mensuel (avec inscription cours collectifs intégrée) ───

function CalendrierTab({ profile, showGroup, showPrivate, activeTab, onNavigate }) {
  const now = new Date();
  const [year,               setYear]             = useState(now.getFullYear());
  const [month,              setMonth]            = useState(now.getMonth());
  const [courses,            setCourses]          = useState([]);
  const [privateReqs,        setPrivateReqs]      = useState([]);
  const [allPrivateReqs,     setAllPrivateReqs]   = useState([]);
  const [attendance,         setAttendance]       = useState({});
  const [myAttended,         setMyAttended]       = useState(new Set());
  const [absences,           setAbsences]         = useState([]);
  const [imAbsent,           setImAbsent]         = useState(false);
  const [saving,             setSaving]           = useState(false);
  const [loading,            setLoading]          = useState(true);
  const [selectedDay,        setSelectedDay]      = useState(null);
  const [showPrivateModal,   setShowPrivateModal] = useState(false);
  const [theoriqueSub,       setTheoriqueSub]     = useState(null);
  const [theoriqueAmount,    setTheoriqueAmount]  = useState(50);
  const [cotisationPaid,     setCotisationPaid]   = useState(false);
  const [creatingPay,        setCreatingPay]      = useState(false);
  const [privateCourseSub,   setPrivateCourseSub] = useState(null);
  const [creatingPrivatePay, setCreatingPrivatePay] = useState(false);

  const currentWeekStartStr = toDateStr(getWeekStart());
  const currentWeekEndStr   = toDateStr(addDays(getWeekStart(), 6));

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    const mm    = String(month + 1).padStart(2, '0');
    const first = `${year}-${mm}-01`;
    const last  = `${year}-${mm}-${String(new Date(year, month + 1, 0).getDate()).padStart(2, '0')}`;

    const currentYear = new Date().getFullYear();
    const [{ data: gc }, { data: pr }, { data: abs }, { data: prAll }, { data: cotisData }] = await Promise.all([
      supabase.from('group_courses').select('*')
        .gte('course_date', first).lte('course_date', last)
        .order('course_date').order('start_time'),
      profile
        ? supabase.from('private_course_requests').select('*')
            .eq('user_id', profile.id).eq('status', 'confirmed')
            .not('chosen_slot', 'is', null)
        : Promise.resolve({ data: [] }),
      supabase.from('weekly_absences').select('user_id')
        .eq('week_start', currentWeekStartStr),
      showPrivate && profile
        ? supabase.from('private_course_requests').select('*')
            .eq('user_id', profile.id).order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      profile
        ? supabase.from('subscriptions').select('status')
            .eq('user_id', profile.id)
            .eq('type', 'cotisation_annuelle')
            .eq('status', 'paid')
            .eq('year', currentYear)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const paid = !!cotisData;
    setCotisationPaid(paid);
    setTheoriqueAmount(paid ? 50 : 75);

    const courseList = gc ?? [];
    setCourses(courseList);
    setPrivateReqs((pr ?? []).filter(r => {
      const d = r.chosen_slot?.date ?? '';
      return d >= first && d <= last;
    }));

    if (courseList.length > 0) {
      const ids = courseList.map(c => c.id);
      const { data: att } = await supabase.from('course_attendance')
        .select('course_id, user_id').in('course_id', ids);
      const attRaw = att ?? [];
      const mySet  = new Set();
      const attMap = {};
      attRaw.forEach(a => {
        if (!attMap[a.course_id]) attMap[a.course_id] = [];
        attMap[a.course_id].push(a);
        if (a.user_id === profile.id) mySet.add(a.course_id);
      });
      const uids = [...new Set(attRaw.map(a => a.user_id))];
      if (uids.length > 0) {
        const [{ data: profs }, { data: dogs }] = await Promise.all([
          supabase.from('profiles').select('id, full_name').in('id', uids),
          supabase.from('dogs').select('owner_id, name').in('owner_id', uids),
        ]);
        const pm = {}; (profs ?? []).forEach(p => { pm[p.id] = p; });
        const dm = {}; (dogs  ?? []).forEach(d => { dm[d.owner_id] = d; });
        Object.keys(attMap).forEach(cid => {
          attMap[cid] = attMap[cid].map(a => ({ ...a, profiles: pm[a.user_id] ?? null, dog: dm[a.user_id] ?? null }));
        });
      }
      setAttendance(attMap);
      setMyAttended(mySet);
    } else {
      setAttendance({});
      setMyAttended(new Set());
    }

    const absRaw  = abs ?? [];
    const absUids = [...new Set(absRaw.map(a => a.user_id))];
    let enrichedAbs = absRaw;
    if (absUids.length > 0) {
      const { data: ap } = await supabase.from('profiles').select('id, full_name').in('id', absUids);
      const apm = {}; (ap ?? []).forEach(p => { apm[p.id] = p; });
      enrichedAbs = absRaw.map(a => ({ ...a, profiles: apm[a.user_id] ?? null }));
    }
    setAbsences(enrichedAbs);
    setImAbsent(enrichedAbs.some(a => a.user_id === profile.id));
    setAllPrivateReqs(prAll ?? []);
    setLoading(false);
  }, [profile, year, month, currentWeekStartStr, showPrivate]);

  useEffect(() => { load(); }, [load]);

  const startTheoriquePay = async (course) => {
    if (!profile || creatingPay) return;
    setCreatingPay(true);
    const price = cotisationPaid ? 50 : 75;
    const { data: sub } = await supabase.from('subscriptions').insert({
      user_id: profile.id,
      type: 'cours_theorique',
      status: 'pending',
      year: new Date(course.course_date + 'T00:00:00').getFullYear(),
    }).select().single();
    setTheoriqueSub(sub);
    setTheoriqueAmount(price);
    setCreatingPay(false);
  };

  const isMoreThan24hAway = (chosenSlot) => {
    if (!chosenSlot?.date || !chosenSlot?.start) return false;
    const courseDate = new Date(`${chosenSlot.date}T${chosenSlot.start}:00`);
    return (courseDate - new Date()) > 24 * 60 * 60 * 1000;
  };

  const handlePayPrivate = async (req) => {
    if (!profile || creatingPrivatePay) return;
    setCreatingPrivatePay(true);
    const { data: sub } = await supabase.from('subscriptions').insert({
      user_id: profile.id,
      type: 'lecon_privee',
      status: 'pending',
      year: new Date(req.chosen_slot.date + 'T00:00:00').getFullYear(),
      private_lessons_total: 1,
      private_lessons_used: 0,
    }).select().single();
    if (sub) setPrivateCourseSub(sub);
    setCreatingPrivatePay(false);
  };

  const cancelPrivate = async (req) => {
    if (!window.confirm('Annuler ce cours privé confirmé ?')) return;
    await supabase.from('private_course_requests')
      .update({ status: 'cancelled' })
      .eq('id', req.id)
      .eq('user_id', profile.id);
    load();
  };

  const togglePresence = async (courseId) => {
    if (!profile || saving) return;
    setSaving(true);
    if (myAttended.has(courseId)) {
      await supabase.from('course_attendance').delete()
        .eq('course_id', courseId).eq('user_id', profile.id);
    } else {
      if (imAbsent) {
        await supabase.from('weekly_absences').delete()
          .eq('user_id', profile.id).eq('week_start', currentWeekStartStr);
      }
      await supabase.from('course_attendance').insert({ course_id: courseId, user_id: profile.id });
    }
    setSaving(false);
    load();
  };

  const toggleAbsent = async () => {
    if (!profile || saving) return;
    setSaving(true);
    if (imAbsent) {
      await supabase.from('weekly_absences').delete()
        .eq('user_id', profile.id).eq('week_start', currentWeekStartStr);
    } else {
      const currentWeekIds = courses
        .filter(c => c.course_date >= currentWeekStartStr && c.course_date <= currentWeekEndStr)
        .map(c => c.id);
      if (currentWeekIds.length > 0) {
        await supabase.from('course_attendance').delete()
          .eq('user_id', profile.id).in('course_id', currentWeekIds);
      }
      await supabase.from('weekly_absences').insert({ user_id: profile.id, week_start: currentWeekStartStr });
    }
    setSaving(false);
    load();
  };

  // Pour les membres "privé", on masque les cours collectifs (garde seulement théoriques)
  const visibleCourses = showGroup
    ? courses
    : courses.filter(c => c.course_type === 'theorique');

  const byDate = {};
  visibleCourses.forEach(c => {
    if (!byDate[c.course_date]) byDate[c.course_date] = [];
    byDate[c.course_date].push(c);
  });
  const privateByDate = {};
  privateReqs.forEach(r => {
    const d = r.chosen_slot?.date;
    if (d) { if (!privateByDate[d]) privateByDate[d] = []; privateByDate[d].push(r); }
  });

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  let startDow = new Date(year, month, 1).getDay();
  if (startDow === 0) startDow = 6; else startDow -= 1;

  const todayStr = toDateStr(new Date());

  const prevMonth = () => {
    setSelectedDay(null);
    if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    setSelectedDay(null);
    if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1);
  };

  const selectedCourses = selectedDay ? (byDate[selectedDay] ?? []) : [];
  const selectedPrivate = selectedDay ? (privateByDate[selectedDay] ?? []) : [];
  const isCurrentWeekDay = selectedDay >= currentWeekStartStr && selectedDay <= currentWeekEndStr;

  const cwCourses  = courses.filter(c => c.course_date >= currentWeekStartStr && c.course_date <= currentWeekEndStr);
  const cwAttended = cwCourses.filter(c => myAttended.has(c.id));

  const showCal = !showPrivate || activeTab === 'calendrier';
  const showPrivSection = showPrivate && activeTab === 'prives';

  return (
    <div style={{ padding: '16px 16px 80px' }}>

      {showCal && <>

      {showGroup && cwCourses.length > 0 && !loading && (
        <div style={{
          borderRadius: 14, padding: '12px 16px', marginBottom: 16,
          background: imAbsent ? '#fee2e2' : cwAttended.length > 0 ? '#dcfce7' : '#fff',
          border: `1.5px solid ${imAbsent ? '#fca5a5' : cwAttended.length > 0 ? '#86efac' : '#e5e7eb'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 22 }}>
            {imAbsent ? '😴' : cwAttended.length > 0 ? '✅' : '👋'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20' }}>
              {imAbsent
                ? 'Tu es absent·e cette semaine'
                : cwAttended.length > 0
                  ? `Inscrit·e à ${cwAttended.length} créneau${cwAttended.length > 1 ? 'x' : ''} cette semaine`
                  : 'Pas encore répondu pour cette semaine'}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
              {imAbsent ? 'Appuie sur "Annuler" pour modifier' : 'Clique sur un jour pour t\'inscrire'}
            </div>
          </div>
          {imAbsent && (
            <button onClick={toggleAbsent} disabled={saving} style={{
              padding: '6px 12px', background: '#fff', border: '1.5px solid #fca5a5',
              borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626', flexShrink: 0,
            }}>Annuler</button>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <button onClick={prevMonth} style={navBtn}>‹</button>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20', textTransform: 'capitalize' }}>
          {MONTHS_FULL[month]} {year}
        </div>
        <button onClick={nextMonth} style={navBtn}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 6 }}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', paddingBottom: 4 }}>{d}</div>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>Chargement…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
          {Array.from({ length: startDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const day     = i + 1;
            const mm      = String(month + 1).padStart(2, '0');
            const dd      = String(day).padStart(2, '0');
            const dateStr = `${year}-${mm}-${dd}`;
            const hasCours       = !!byDate[dateStr];
            const hasPrivate     = !!privateByDate[dateStr];
            const hasAny         = hasCours || hasPrivate;
            const isMineDay      = hasCours && (byDate[dateStr] ?? []).some(c => myAttended.has(c.id));
            const hasTheoretical = hasCours && (byDate[dateStr] ?? []).some(c => c.course_type === 'theorique');
            const allTheoretical = hasCours && (byDate[dateStr] ?? []).every(c => c.course_type === 'theorique');
            const isToday        = dateStr === todayStr;
            const isSel          = dateStr === selectedDay;
            return (
              <div
                key={day}
                onClick={() => hasAny && setSelectedDay(isSel ? null : dateStr)}
                style={{
                  aspectRatio: '1', borderRadius: 10,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  cursor: hasAny ? 'pointer' : 'default',
                  background: isSel ? '#2BABE1' : isToday ? '#e8f7fd' : hasAny ? (allTheoretical ? '#fefce8' : '#f0fbff') : 'transparent',
                  border: isToday && !isSel ? '2px solid #2BABE1'
                        : isMineDay && !isSel ? '2px solid #22c55e'
                        : '2px solid transparent',
                  transition: 'background 0.15s',
                }}
              >
                <div style={{
                  fontSize: 14, lineHeight: 1,
                  fontWeight: isSel || isToday ? 800 : hasAny ? 700 : 400,
                  color: isSel ? '#fff' : isToday ? '#2BABE1' : hasAny ? '#1F1F20' : '#bbb',
                }}>
                  {day}
                </div>
                {(hasCours || hasPrivate) && (
                  <div style={{ display: 'flex', gap: 2, marginTop: 3 }}>
                    {hasCours && !allTheoretical && (
                      <div style={{ width: 5, height: 5, borderRadius: '50%',
                        background: isSel ? 'rgba(255,255,255,0.85)' : isMineDay ? '#22c55e' : '#2BABE1' }} />
                    )}
                    {hasTheoretical && (
                      <div style={{ width: 5, height: 5, borderRadius: '50%',
                        background: isSel ? 'rgba(255,255,255,0.85)' : '#eab308' }} />
                    )}
                    {hasPrivate && (
                      <div style={{ width: 5, height: 5, borderRadius: '50%',
                        background: isSel ? 'rgba(255,255,255,0.85)' : '#f97316' }} />
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {selectedDay && (selectedCourses.length > 0 || selectedPrivate.length > 0) && (
        <div style={{ marginTop: 20, background: '#fff', borderRadius: 18, padding: 16, boxShadow: '0 4px 20px rgba(43,171,225,0.12)', border: '1px solid rgba(43,171,225,0.15)' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', marginBottom: 14, textTransform: 'capitalize' }}>
            📅 {new Date(selectedDay + 'T00:00:00').toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>

          {selectedCourses.map((c, idx) => {
            const isMine        = myAttended.has(c.id);
            const attendees     = attendance[c.id] ?? [];
            const isSpecial     = c.is_supplement;
            const isTheoretical = c.course_type === 'theorique';
            return (
              <div key={c.id} style={{
                marginBottom: idx < selectedCourses.length - 1 || selectedPrivate.length > 0 ? 12 : 0,
                border: `2px solid ${isSpecial ? '#fde68a' : isTheoretical ? '#fde68a' : isMine ? '#2BABE1' : '#f0f0f0'}`,
                borderRadius: 14, overflow: 'hidden',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                  background: isSpecial ? '#fffbeb' : isTheoretical ? '#fefce8' : isMine ? '#e8f7fd' : '#fafafa',
                }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                    background: isSpecial ? '#f59e0b' : isTheoretical ? '#eab308' : isMine ? '#2BABE1' : '#e5e7eb',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19,
                  }}>
                    {isSpecial ? '⭐' : isTheoretical ? '📖' : isMine ? '✓' : '🐾'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20' }}>
                      {isSpecial ? c.supplement_name : isTheoretical && c.title ? c.title : `${c.start_time} – ${c.end_time}`}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                      {isSpecial
                        ? `Supplément · ${c.start_time}–${c.end_time}`
                        : isTheoretical
                          ? `📖 Théorique · ${c.start_time}–${c.end_time} · ${attendees.length} participant${attendees.length > 1 ? 's' : ''}`
                          : attendees.length === 0
                            ? 'Aucun inscrit pour le moment'
                            : `${attendees.length} participant${attendees.length > 1 ? 's' : ''}`}
                      {c.location ? ` · 📍 ${c.location}` : ''}
                    </div>
                  </div>
                  {!isSpecial && !imAbsent && !isTheoretical && (
                    cotisationPaid || isMine ? (
                      <button onClick={() => togglePresence(c.id)} disabled={saving} style={{
                        padding: '7px 14px', borderRadius: 20, flexShrink: 0,
                        background: isMine ? '#2BABE1' : '#f0f2f4',
                        color: isMine ? '#fff' : '#374151',
                        fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer',
                      }}>
                        {isMine ? '✓ Je viens' : 'Venir'}
                      </button>
                    ) : (
                      <button
                        onClick={() => onNavigate?.('profil')}
                        style={{
                          padding: '5px 10px', borderRadius: 14, flexShrink: 0,
                          background: '#fef3c7', color: '#d97706',
                          fontSize: 11, fontWeight: 700, textAlign: 'center',
                          border: '1.5px solid #fde68a', cursor: 'pointer',
                        }}
                      >
                        💳 Cotisation<br/>requise
                      </button>
                    )
                  )}
                </div>
                {isTheoretical && (
                  <div style={{ padding: '10px 14px', borderTop: '1px solid #fde68a' }}>
                    {!cotisationPaid && (
                      <div style={{ fontSize: 11, color: '#d97706', fontWeight: 600, marginBottom: 8, textAlign: 'center' }}>
                        Tarif sans cotisation — CHF 50 avec cotisation payée
                      </div>
                    )}
                    <button onClick={() => startTheoriquePay(c)} disabled={creatingPay} style={{
                      width: '100%', padding: '10px',
                      background: 'linear-gradient(135deg, #eab308, #ca8a04)',
                      border: 'none', borderRadius: 10, color: '#fff',
                      fontSize: 13, fontWeight: 800, cursor: creatingPay ? 'not-allowed' : 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      {creatingPay ? '…' : `💳 S'inscrire & payer CHF ${cotisationPaid ? 50 : 75}`}
                    </button>
                  </div>
                )}
                {!isTheoretical && attendees.length > 0 && (
                  <div style={{ padding: '8px 14px 10px', borderTop: '1px solid #f3f4f6', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {attendees.map(a => (
                      <div key={a.user_id} style={{
                        background: a.user_id === profile.id ? '#e8f7fd' : '#f4f6f8',
                        borderRadius: 20, padding: '3px 10px',
                        fontSize: 12, fontWeight: 600,
                        color: a.user_id === profile.id ? '#1a8bbf' : '#374151',
                      }}>
                        🐕 {a.dog?.name ?? '?'} – {a.profiles?.full_name?.split(' ')[0] ?? '?'}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {selectedPrivate.map((r, idx) => (
            <div key={r.id} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 0',
              marginTop: selectedCourses.length > 0 && idx === 0 ? 4 : 0,
              borderTop: selectedCourses.length > 0 && idx === 0 ? '1px solid #f3f4f6' : 'none',
              borderBottom: idx < selectedPrivate.length - 1 ? '1px solid #f3f4f6' : 'none',
            }}>
              <div style={{ width: 42, height: 42, background: '#fff7ed', borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 19, flexShrink: 0 }}>🎯</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20' }}>
                  {r.chosen_slot.start} – {r.chosen_slot.end}
                </div>
                <div style={{ fontSize: 12, color: '#f97316', marginTop: 1, fontWeight: 600 }}>Cours privé confirmé</div>
                {r.admin_notes && <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>💬 {r.admin_notes}</div>}
              </div>
            </div>
          ))}

          {isCurrentWeekDay && showGroup && (
            <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #f3f4f6' }}>
              {absences.length > 0 && (
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Absent·es cette semaine
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {absences.map(a => (
                      <div key={a.user_id} style={{
                        background: a.user_id === profile.id ? '#fee2e2' : '#f4f6f8',
                        borderRadius: 20, padding: '3px 10px', fontSize: 12, fontWeight: 600,
                        color: a.user_id === profile.id ? '#dc2626' : '#6b7280',
                      }}>
                        😴 {a.profiles?.full_name?.split(' ')[0] ?? '?'}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {!imAbsent && (
                <button onClick={toggleAbsent} disabled={saving} style={{
                  width: '100%', padding: '11px', background: '#fff',
                  border: '1.5px solid #fca5a5', borderRadius: 12,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer', color: '#dc2626',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}>
                  😴 Je serai absent·e cette semaine
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, marginTop: 18, padding: '10px 14px', background: '#f4f6f8', borderRadius: 12, flexWrap: 'wrap' }}>
        {showGroup && <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#2BABE1' }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Cours collectif</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#eab308' }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Cours théorique</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, color: '#6b7280' }}>Inscrit·e</span>
          </div>
        </>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Cours privé</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', border: '2px solid #2BABE1', boxSizing: 'border-box' }} />
          <span style={{ fontSize: 11, color: '#6b7280' }}>Aujourd'hui</span>
        </div>
      </div>

      </>}

      {showPrivSection && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>Tes demandes et créneaux confirmés</div>
            <button onClick={() => setShowPrivateModal(true)} style={{
              background: '#2BABE1', color: '#fff', border: 'none',
              borderRadius: 10, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
            }}>+ Demander</button>
          </div>

          {allPrivateReqs.filter(r => r.status !== 'cancelled').length === 0 ? (
            <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Pas encore de cours privé</div>
              <div style={{ fontSize: 12, marginTop: 2 }}>Appuie sur "+ Demander" pour réserver</div>
            </div>
          ) : (
            allPrivateReqs.filter(r => r.status !== 'cancelled').map(r => {
              const s = STATUS_LABELS[r.status];
              return (
                <div key={r.id} style={{
                  background: '#fff', borderRadius: 14, padding: '12px 14px', marginBottom: 8,
                  border: '1.5px solid #f0f0f0',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 40, height: 40, flexShrink: 0, borderRadius: 10, fontSize: 18,
                      background: r.status === 'confirmed' ? '#e8f7fd' : '#fef3c7',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {r.status === 'confirmed' ? '✅' : '⏳'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {r.chosen_slot ? (
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20' }}>
                          {fmtPrivateSlot(r.chosen_slot)}
                        </div>
                      ) : (
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280' }}>
                          {r.availability_slots?.length ?? 0} créneau{(r.availability_slots?.length ?? 0) > 1 ? 'x' : ''} proposé{(r.availability_slots?.length ?? 0) > 1 ? 's' : ''}
                        </div>
                      )}
                      <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                        Demande du {new Date(r.created_at).toLocaleDateString('fr-CH')}
                      </div>
                      {r.admin_notes && (
                        <div style={{ fontSize: 11, color: '#92400e', marginTop: 2 }}>💬 {r.admin_notes}</div>
                      )}
                    </div>
                    <div style={{ background: s.bg, color: s.color, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                      {s.label}
                    </div>
                  </div>
                  {r.status === 'confirmed' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      {isMoreThan24hAway(r.chosen_slot) && (
                        <button
                          onClick={() => handlePayPrivate(r)}
                          disabled={creatingPrivatePay}
                          style={{
                            flex: 1, padding: '8px',
                            background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
                            border: 'none', borderRadius: 10,
                            fontSize: 12, fontWeight: 800, color: '#fff', cursor: 'pointer',
                          }}
                        >
                          {creatingPrivatePay ? '…' : '💳 Payer CHF 60'}
                        </button>
                      )}
                      <button onClick={() => cancelPrivate(r)} style={{
                        flex: 1, padding: '8px',
                        background: '#fee2e2', border: 'none', borderRadius: 10,
                        fontSize: 12, fontWeight: 700, color: '#dc2626', cursor: 'pointer',
                      }}>
                        ✗ Annuler
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {theoriqueSub && (
        <PaiementModal
          subscription={theoriqueSub}
          onClose={() => setTheoriqueSub(null)}
          onSuccess={() => { setTheoriqueSub(null); load(); }}
          overrideAmount={theoriqueAmount}
        />
      )}

      {privateCourseSub && (
        <PaiementModal
          subscription={privateCourseSub}
          onClose={() => setPrivateCourseSub(null)}
          onSuccess={() => { setPrivateCourseSub(null); load(); }}
        />
      )}

      {showPrivateModal && (
        <PrivateCourseRequestModal
          userId={profile?.id}
          onClose={() => setShowPrivateModal(false)}
          onSaved={() => { setShowPrivateModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ─── Styles partagés ─────────────────────────────────────────────────────────

const navBtn = {
  width: 38, height: 38, borderRadius: 10,
  background: '#f4f6f8', border: 'none',
  fontSize: 22, cursor: 'pointer', color: '#374151',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700, flexShrink: 0,
};
