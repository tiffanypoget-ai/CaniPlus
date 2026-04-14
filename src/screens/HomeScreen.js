// src/screens/HomeScreen.js
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

function toDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekBounds() {
  const today = new Date();
  const day = today.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday: toDateStr(monday), sunday: toDateStr(sunday) };
}

const DAYS_SHORT  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAYS_FULL   = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR   = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

const COURSE_COLORS = {
  collectif: '#2BABE1',
  theorique: '#eab308',
  prive:     '#f97316',
};

const COURSE_TYPE_LABELS = {
  collectif: 'Cours collectif',
  theorique: 'Cours théorique',
  prive:     'Cours privé',
};

export default function HomeScreen({ onNavigate }) {
  const { profile } = useAuth();
  const [weekCourses,     setWeekCourses]     = useState([]);
  const [upcomingEvents,  setUpcomingEvents]  = useState([]);
  const [subscriptions,   setSubscriptions]   = useState([]);
  const [dog,             setDog]             = useState(null);
  const [loading,         setLoading]         = useState(true);
  const [latestNews,      setLatestNews]      = useState([]);
  const [attendedIds,     setAttendedIds]     = useState(new Set());
  const [togglingId,      setTogglingId]      = useState(null);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { monday, sunday } = getWeekBounds();
      const today = toDateStr(new Date());

      const [coursesRes, privateRes, eventsRes, subsRes, dogsRes, newsRes] = await Promise.all([
        // Cours de la semaine
        supabase.from('group_courses').select('*')
          .gte('course_date', monday).lte('course_date', sunday)
          .order('course_date').order('start_time'),
        // Cours privés confirmés
        supabase.from('private_course_requests').select('*')
          .eq('user_id', profile.id).eq('status', 'confirmed')
          .not('chosen_slot', 'is', null),
        // Prochains événements théoriques (hors semaine courante)
        supabase.from('group_courses').select('*')
          .eq('course_type', 'theorique')
          .gt('course_date', sunday)
          .order('course_date').order('start_time')
          .limit(4),
        // Abonnements du membre
        supabase.from('subscriptions').select('*')
          .eq('user_id', profile.id)
          .order('created_at', { ascending: false }),
        // Chien
        supabase.from('dogs').select('*').eq('owner_id', profile.id).limit(1),
        // News
        supabase.from('news').select('id,title,created_at').eq('published', true)
          .order('created_at', { ascending: false }).limit(4),
      ]);

      const groupCourses = coursesRes.data ?? [];

      // Badge "Je viens" pour les cours collectifs
      let attendedSet = new Set();
      if (groupCourses.length) {
        const ids = groupCourses.map(c => c.id);
        const { data: att } = await supabase
          .from('course_attendance').select('course_id')
          .eq('user_id', profile.id).in('course_id', ids);
        attendedSet = new Set((att ?? []).map(a => a.course_id));
      }
      setAttendedIds(attendedSet);

      // Cours privés confirmés dans la semaine
      const confirmedPrivate = (privateRes.data ?? []).filter(r => {
        const d = r.chosen_slot?.date ?? '';
        return d >= monday && d <= sunday;
      });

      // Filtre collectifs selon type de cours du membre
      const courseType = profile.course_type ?? 'group';
      const showCollectif = courseType !== 'private';

      const unified = [
        ...(showCollectif ? groupCourses : groupCourses.filter(c => c.course_type === 'theorique')).map(c => ({
          key: `gc-${c.id}`,
          gcId: c.id,
          date: c.course_date,
          time: c.start_time ?? '00:00',
          type: c.course_type === 'theorique' ? 'theorique' : 'collectif',
          title: c.is_supplement ? (c.supplement_name ?? 'Supplément') : `${c.start_time} – ${c.end_time}`,
          isMine: attendedSet.has(c.id),
          canToggle: true,
          notes: c.notes ?? null,
          price: c.price ?? 0,
        })),
        ...confirmedPrivate.map(r => {
          const lessonSub = (subsRes.data ?? []).find(s => s.type === 'lecon_privee');
          const isPaid = lessonSub?.status === 'paid';
          return {
            key: `pr-${r.id}`,
            date: r.chosen_slot.date,
            time: r.chosen_slot.start ?? '00:00',
            type: 'prive',
            title: `${r.chosen_slot.start} – ${r.chosen_slot.end}`,
            isMine: true,
            isPaid,
          };
        }),
      ].sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? -1 : 1;
        return a.time < b.time ? -1 : 1;
      });

      setWeekCourses(unified);
      setUpcomingEvents(eventsRes.data ?? []);
      setSubscriptions(subsRes.data ?? []);
      if (dogsRes.data?.length) setDog(dogsRes.data[0]);
      if (newsRes.data) setLatestNews(newsRes.data);
      setLoading(false);
    };
    load();
  }, [profile]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Membre';
  const courseType = profile?.course_type ?? 'group';

  // ── Toggle présence depuis l'accueil ──────────────────────────────
  const toggleAttendance = async (course) => {
    if (!course.canToggle || !course.gcId || togglingId === course.gcId) return;
    const isMine = attendedIds.has(course.gcId);
    setTogglingId(course.gcId);
    if (isMine) {
      await supabase.from('course_attendance')
        .delete().eq('user_id', profile.id).eq('course_id', course.gcId);
      setAttendedIds(prev => { const s = new Set(prev); s.delete(course.gcId); return s; });
    } else {
      await supabase.from('course_attendance')
        .upsert({ user_id: profile.id, course_id: course.gcId });
      setAttendedIds(prev => new Set([...prev, course.gcId]));
    }
    // Met à jour weekCourses localement
    setWeekCourses(prev => prev.map(c =>
      c.gcId === course.gcId ? { ...c, isMine: !isMine } : c
    ));
    setTogglingId(null);
  };

  const fmtDateShort = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return { short: DAYS_SHORT[d.getDay()], num: d.getDate(), month: MONTHS_FR[d.getMonth()] };
  };

  const isToday = (dateStr) => dateStr === toDateStr(new Date());
  const isPast  = (dateStr) => dateStr < toDateStr(new Date());

  const fmtEventDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  };

  const { monday, sunday } = getWeekBounds();
  const mondayDate = new Date(monday + 'T00:00:00');
  const sundayDate = new Date(sunday + 'T00:00:00');
  const weekLabel  = `${mondayDate.getDate()} – ${sundayDate.getDate()} ${MONTHS_FR[sundayDate.getMonth()]}`;

  // ── Paiements ──
  const currentYear   = new Date().getFullYear();
  const cotisation    = subscriptions.find(s => s.type === 'cotisation_annuelle' && s.year === currentYear);
  const privateLesson = subscriptions.find(s => s.type === 'lecon_privee');
  const remaining     = privateLesson
    ? (privateLesson.private_lessons_total ?? 0) - (privateLesson.private_lessons_used ?? 0)
    : 0;

  const showCotisation      = courseType !== 'private';
  const cotisationPending   = showCotisation && cotisation && cotisation.status !== 'paid';
  const lessonPending       = privateLesson && privateLesson.status !== 'paid' && !!privateLesson.lesson_date;
  const privateCoursePending = weekCourses.some(c => c.type === 'prive' && !c.isPaid);
  const hasPending          = cotisationPending || lessonPending || privateCoursePending;

  return (
    <div style={{ flex: 1, overflowY: 'auto' }} className="screen-content">

      {/* ── Header ── */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff' }}>CaniPlus</span>
          <button onClick={() => onNavigate('news')} style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>🔔</button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>Bonjour,</div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginTop: 2 }}>{firstName} 🐾</div>
        {dog && (
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(43,171,225,0.25)', padding: '5px 12px', borderRadius: 20, marginTop: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>🐕 {dog.name} · {dog.breed ?? 'Chien'}</span>
          </div>
        )}
      </div>

      {/* ── Bannière cotisation impayée ── */}
      {!loading && cotisationPending && (
        <div
          onClick={() => onNavigate('profil')}
          style={{
            margin: '12px 16px 0', background: 'linear-gradient(135deg,#fffbeb,#fef3c7)',
            border: '1.5px solid #fde68a', borderRadius: 16,
            padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12,
            cursor: 'pointer', position: 'relative', zIndex: 2,
          }}
        >
          <span style={{ fontSize: 22 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#92400e' }}>
              {cotisationPending && lessonPending ? 'Cotisation + leçon à régler'
               : cotisationPending ? 'Cotisation 2026 à régler'
               : 'Leçon privée à régler'}
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginTop: 1 }}>Appuie ici pour payer →</div>
          </div>
        </div>
      )}

      {/* ── Cours de la semaine ── */}
      <div style={{ margin: `${!loading && hasPending ? '12px' : '16px'} 16px 0`, background: '#fff', borderRadius: 20, boxShadow: '0 2px 16px rgba(43,171,225,0.12)', position: 'relative', zIndex: 2, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px 10px' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#2BABE1', letterSpacing: 0.5, textTransform: 'uppercase' }}>Cette semaine</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#6b7280', marginTop: 1 }}>{weekLabel}</div>
          </div>
          <button onClick={() => onNavigate('planning')} style={{ background: '#e8f7fd', border: 'none', borderRadius: 10, padding: '6px 12px', fontSize: 12, fontWeight: 700, color: '#2BABE1', cursor: 'pointer' }}>
            Voir tout →
          </button>
        </div>

        {loading ? (
          <div style={{ padding: '20px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement...</div>
        ) : weekCourses.length === 0 ? (
          <div style={{ padding: '16px 16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏖️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Pas de cours cette semaine</div>
          </div>
        ) : (
          <div style={{ padding: '0 12px 14px' }}>
            {weekCourses.map((course, idx) => {
              const fmt      = fmtDateShort(course.date);
              const today    = isToday(course.date);
              const past     = isPast(course.date);
              const color    = COURSE_COLORS[course.type] ?? '#2BABE1';
              const isMine   = course.canToggle ? attendedIds.has(course.gcId) : course.isMine;
              const toggling = togglingId === course.gcId;
              return (
                <div key={course.key}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 10px',
                    marginBottom: idx < weekCourses.length - 1 ? 2 : 0,
                    borderRadius: 12,
                    background: today ? '#fafafa' : 'transparent',
                    opacity: past && !today ? 0.45 : 1,
                    borderBottom: idx < weekCourses.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                  {/* Date box — clique vers planning */}
                  <div onClick={() => onNavigate('planning')} style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: today ? color : '#f0f2f4',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: today ? 'rgba(255,255,255,0.75)' : '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{fmt.short}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: today ? '#fff' : '#1F1F20', lineHeight: 1 }}>{fmt.num}</div>
                  </div>
                  {/* Infos cours */}
                  <div onClick={() => onNavigate('planning')} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{course.title}</div>
                    <div style={{ fontSize: 11, color, marginTop: 1, fontWeight: 700 }}>{COURSE_TYPE_LABELS[course.type]}</div>
                    {(course.price > 0 || course.notes) && (
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2, flexWrap: 'nowrap', overflow: 'hidden' }}>
                        {course.price > 0 && <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>CHF {course.price}</span>}
                        {course.notes && <span style={{ fontSize: 11, color: '#6b7280', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>📝 {course.notes}</span>}
                      </div>
                    )}
                  </div>
                  {/* Badge présence (cliquable pour collectifs/théoriques) */}
                  {course.type === 'prive' ? (
                    course.isPaid ? (
                      <div style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>🎯 Confirmé ✓</div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onNavigate('profil'); }}
                        style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0, border: '1.5px solid #fde68a', cursor: 'pointer' }}
                      >💳 Payer</button>
                    )
                  ) :!past ? (
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleAttendance(course); }}
                      disabled={toggling}
                      style={{
                        background: isMine ? '#dcfce7' : '#f4f6f8',
                        color: isMine ? '#16a34a' : '#9ca3af',
                        fontSize: 11, fontWeight: 700,
                        padding: '4px 10px', borderRadius: 20, flexShrink: 0,
                        border: `1.5px solid ${isMine ? '#86efac' : '#e5e7eb'}`,
                        cursor: toggling ? 'wait' : 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      {toggling ? '…' : isMine ? '✓ Je viens' : '+ Je viens'}
                    </button>
                  ) : isMine ? (
                    <div style={{ background: '#f0fdf4', color: '#86efac', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>✓ Présent</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Bandeau News ── */}
      {latestNews.length > 0 && (
        <div style={{ padding: '20px 0 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1 }}>📣 Actualités</div>
            <button onClick={() => onNavigate('news')} style={{ background: 'none', border: 'none', fontSize: 12, fontWeight: 700, color: '#2BABE1', cursor: 'pointer' }}>Tout voir →</button>
          </div>
          <div style={{ display: 'flex', gap: 10, paddingLeft: 16, paddingRight: 16, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
            {latestNews.map((item, i) => {
              const isRecent = (Date.now() - new Date(item.created_at)) < 7 * 86400000;
              return (
                <div key={item.id} onClick={() => onNavigate('news')}
                  style={{
                    flexShrink: 0, background: '#fff', borderRadius: 14, padding: '12px 14px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                    borderLeft: `3px solid ${i === 0 ? '#2BABE1' : '#e5e7eb'}`,
                    minWidth: 200, maxWidth: 240, cursor: 'pointer',
                  }}>
                  {isRecent && i === 0 && (
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#2BABE1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🔔 Nouveau</div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20', lineHeight: 1.35 }}>{item.title}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 5 }}>
                    {new Date(item.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short' })}
                  </div>
                </div>
              );
            })}
            <div style={{ flexShrink: 0, width: 4 }} />
          </div>
        </div>
      )}

      {/* ── Raccourcis ── */}
      {!loading && (
        <div style={{ padding: '24px 16px 0' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Accès rapide</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>

            {/* Mes paiements */}
            <div onClick={() => onNavigate('profil')}
              style={{ background: '#f4f6f8', borderRadius: 18, padding: '18px 16px', cursor: 'pointer', position: 'relative', transition: 'transform 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              {hasPending && (
                <div style={{
                  position: 'absolute', top: 12, right: 12,
                  background: '#ef4444', color: '#fff',
                  fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20,
                }}>● À régler</div>
              )}
              <div style={{ fontSize: 28, marginBottom: 10 }}>💳</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', lineHeight: 1.2 }}>Mes paiements</div>
              <div style={{ fontSize: 11, color: hasPending ? '#ef4444' : '#6b7280', marginTop: 4, fontWeight: hasPending ? 700 : 400 }}>
                {!hasPending ? 'Tout est à jour ✓'
                  : cotisationPending && lessonPending ? 'Cotisation + leçon à régler'
                  : cotisationPending ? 'Cotisation à régler'
                  : 'Leçon privée à régler'}
              </div>
            </div>

            {/* Prochains événements */}
            <div onClick={() => onNavigate('planning')}
              style={{ background: '#f4f6f8', borderRadius: 18, padding: '18px 16px', cursor: 'pointer', transition: 'transform 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>📖</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', lineHeight: 1.2 }}>Événements</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4 }}>
                {upcomingEvents.length > 0
                  ? `${upcomingEvents.length} à venir`
                  : 'Aucun prévu'}
              </div>
            </div>


          </div>
        </div>
      )}
    </div>
  );
}
