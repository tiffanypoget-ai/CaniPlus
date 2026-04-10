// src/screens/HomeScreen.jsx
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
  const day = today.getDay(); // 0=dim
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { monday: toDateStr(monday), sunday: toDateStr(sunday) };
}

const DAYS_FR = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const DAYS_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export default function HomeScreen({ onNavigate }) {
  const { profile } = useAuth();
  const [weekCourses, setWeekCourses] = useState([]);
  const [myAttended, setMyAttended] = useState(new Set());
  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [latestNews, setLatestNews] = useState([]);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { monday, sunday } = getWeekBounds();

      // Tous les cours de la semaine + news + chien en parallèle
      const [coursesRes, dogsRes, newsRes] = await Promise.all([
        supabase.from('group_courses').select('*')
          .gte('course_date', monday).lte('course_date', sunday)
          .order('course_date').order('start_time'),
        supabase.from('dogs').select('*').eq('owner_id', profile.id).limit(1),
        supabase.from('news').select('id,title,created_at').eq('published', true)
          .order('created_at', { ascending: false }).limit(4),
      ]);

      const courses = coursesRes.data ?? [];
      setWeekCourses(courses);

      // Cours auxquels l'utilisateur participe (pour badge "Je viens")
      if (courses.length) {
        const ids = courses.map(c => c.id);
        const { data: att } = await supabase
          .from('course_attendance').select('course_id')
          .eq('user_id', profile.id).in('course_id', ids);
        setMyAttended(new Set((att ?? []).map(a => a.course_id)));
      }

      if (dogsRes.data?.length) setDog(dogsRes.data[0]);
      if (newsRes.data) setLatestNews(newsRes.data);
      setLoading(false);
    };
    load();
  }, [profile]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Membre';

  const fmtDate = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return `${DAYS_FR[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  };

  const fmtDateShort = (dateStr) => {
    const d = new Date(dateStr + 'T00:00:00');
    return { short: DAYS_SHORT[d.getDay()], num: d.getDate(), month: MONTHS_FR[d.getMonth()] };
  };

  const isToday = (dateStr) => dateStr === toDateStr(new Date());
  const isPast = (dateStr) => dateStr < toDateStr(new Date());

  const courseTitle = (c) =>
    c.is_supplement ? (c.supplement_name ?? 'Supplément') : `${c.start_time} – ${c.end_time}`;

  const { monday, sunday } = getWeekBounds();
  const mondayDate = new Date(monday + 'T00:00:00');
  const sundayDate = new Date(sunday + 'T00:00:00');
  const weekLabel = `${mondayDate.getDate()} – ${sundayDate.getDate()} ${MONTHS_FR[sundayDate.getMonth()]}`;

  const menuItems = [
    { id: 'planning',   emoji: '📅', title: 'Planning des cours',       sub: `${weekCourses.length} cours cette semaine`, dark: true,  blue: true  },
    { id: 'ressources', emoji: '📚', title: 'Ressources pédagogiques',  sub: 'Fiches & vidéos',                           dark: false, blue: false },
    { id: 'news',       emoji: '📣', title: 'Actualités du club',        sub: 'News, cours spéciaux…',                     dark: false, blue: false },
    { id: 'profil',     emoji: '💳', title: 'Mon abonnement',            sub: 'Cotisation & leçons',                       dark: true,  blue: false },
  ];

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

      {/* ── Cours de la semaine ── */}
      <div style={{ margin: '-16px 16px 0', background: '#fff', borderRadius: 20, boxShadow: '0 2px 16px rgba(43,171,225,0.12)', position: 'relative', zIndex: 2, overflow: 'hidden' }}>

        {/* Titre section */}
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
          <div style={{ padding: '20px 16px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Chargement...</div>
        ) : weekCourses.length === 0 ? (
          <div style={{ padding: '16px 16px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>🏖️</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Pas de cours cette semaine</div>
          </div>
        ) : (
          <div style={{ padding: '0 12px 14px' }}>
            {weekCourses.map((course, idx) => {
              const fmt = fmtDateShort(course.course_date);
              const isMine = myAttended.has(course.id);
              const today = isToday(course.course_date);
              const past = isPast(course.course_date);
              return (
                <div key={course.id} onClick={() => onNavigate('planning')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 10px',
                    marginBottom: idx < weekCourses.length - 1 ? 2 : 0,
                    borderRadius: 12,
                    background: today ? '#f0fbff' : 'transparent',
                    opacity: past && !today ? 0.45 : 1,
                    cursor: 'pointer',
                    borderBottom: idx < weekCourses.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}>
                  {/* Jour */}
                  <div style={{
                    width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                    background: today ? '#2BABE1' : '#f0f2f4',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: today ? 'rgba(255,255,255,0.75)' : '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{fmt.short}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: today ? '#fff' : '#1F1F20', lineHeight: 1 }}>{fmt.num}</div>
                  </div>

                  {/* Contenu */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {courseTitle(course)}
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>{DAYS_FR[new Date(course.course_date + 'T00:00:00').getDay()]} {fmt.num} {fmt.month}</div>
                  </div>

                  {/* Badge présence */}
                  {isMine ? (
                    <div style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>✓ Je viens</div>
                  ) : today ? (
                    <div style={{ background: '#fef3c7', color: '#d97706', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 20, flexShrink: 0 }}>Aujourd'hui</div>
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
                <div
                  key={item.id}
                  onClick={() => onNavigate('news')}
                  style={{
                    flexShrink: 0, background: '#fff', borderRadius: 14, padding: '12px 14px',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.07)',
                    borderLeft: `3px solid ${i === 0 ? '#2BABE1' : '#e5e7eb'}`,
                    minWidth: 200, maxWidth: 240, cursor: 'pointer',
                  }}
                >
                  {isRecent && i === 0 && (
                    <div style={{ fontSize: 9, fontWeight: 800, color: '#2BABE1', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>🔔 Nouveau</div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1F1F20', lineHeight: 1.35 }}>
                    {item.title}
                  </div>
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

      {/* ── Menu ── */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Mon espace</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {menuItems.map(item => (
            <div key={item.id} onClick={() => onNavigate(item.id)}
              style={{ background: item.blue ? '#2BABE1' : item.dark ? '#1F1F20' : '#f4f6f8', borderRadius: 18, padding: '18px 16px', cursor: 'pointer', transition: 'transform 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{item.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: (item.blue || item.dark) ? '#fff' : '#1F1F20', lineHeight: 1.2 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: (item.blue || item.dark) ? 'rgba(255,255,255,0.65)' : '#6b7280', marginTop: 4 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
