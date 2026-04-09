// src/screens/HomeScreen.js
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { courseTypeConfig } from '../lib/theme';

export default function HomeScreen({ onNavigate }) {
  const { profile } = useAuth();
  const [upcomingCourses, setUpcomingCourses] = useState([]);
  const [dog, setDog] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: enrollments } = await supabase.from('enrollments').select('course_id').eq('user_id', profile.id).not('status', 'eq', 'cancelled');
      if (enrollments?.length) {
        const ids = enrollments.map(e => e.course_id);
        const { data: courses } = await supabase.from('courses').select('*').in('id', ids).gte('date_start', new Date().toISOString()).order('date_start').limit(3);
        if (courses) setUpcomingCourses(courses);
      }
      const { data: dogs } = await supabase.from('dogs').select('*').eq('owner_id', profile.id).limit(1);
      if (dogs?.length) setDog(dogs[0]);
      setLoading(false);
    };
    load();
  }, [profile]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'Membre';
  const nextCourse = upcomingCourses[0];

  const fmtDate = (iso) => new Date(iso).toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  const daysUntil = (iso) => {
    const d = Math.ceil((new Date(iso) - Date.now()) / 86400000);
    return d === 0 ? "Aujourd'hui" : d === 1 ? 'Demain' : `${d} jours`;
  };

  const menuItems = [
    { id: 'planning',   emoji: '📅', title: 'Planning des cours',        sub: `${upcomingCourses.length} à venir`,  dark: true, blue: true },
    { id: 'ressources', emoji: '📚', title: 'Ressources pédagogiques',   sub: 'Fiches & vidéos',                   dark: false, blue: false },
    { id: 'messages',   emoji: '💬', title: 'Contacter CaniPlus',        sub: 'Messagerie directe',                dark: false, blue: false },
    { id: 'profil',     emoji: '💳', title: 'Mon abonnement',            sub: 'Cotisation & leçons',               dark: true,  blue: false },
  ];

  return (
    <div style={{ flex: 1, overflowY: 'auto' }} className="screen-content">
      <div style={{ background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff' }}>CaniPlus</span>
          <button onClick={() => onNavigate('messages')} style={{ width: 40, height: 40, background: 'rgba(255,255,255,0.12)', borderRadius: 12, fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}>🔔</button>
        </div>
        <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, fontWeight: 600 }}>Bonjour,</div>
        <div style={{ color: '#fff', fontSize: 24, fontWeight: 800, marginTop: 2 }}>{firstName} 🐾</div>
        {dog && (
          <div style={{ display: 'inline-flex', alignItems: 'center', background: 'rgba(43,171,225,0.25)', padding: '5px 12px', borderRadius: 20, marginTop: 10 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>🐕 {dog.name} · {dog.breed ?? 'Chien'}</span>
          </div>
        )}
      </div>

      {nextCourse ? (
        <div onClick={() => onNavigate('planning')} style={{ margin: '-16px 16px 0', background: '#fff', borderRadius: 20, padding: 16, display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.12)', position: 'relative', zIndex: 2, cursor: 'pointer' }}>
          <div style={{ width: 50, height: 50, borderRadius: 14, background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>
            {courseTypeConfig[nextCourse.type]?.emoji ?? '📅'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#2BABE1', letterSpacing: 0.5, textTransform: 'uppercase' }}>Prochain cours</div>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nextCourse.title}</div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{fmtDate(nextCourse.date_start)} · {fmtTime(nextCourse.date_start)}</div>
          </div>
          <div style={{ background: '#e8f7fd', color: '#2BABE1', fontSize: 11, fontWeight: 800, padding: '5px 10px', borderRadius: 10, flexShrink: 0 }}>
            {daysUntil(nextCourse.date_start)}
          </div>
        </div>
      ) : (
        <div style={{ margin: '-16px 16px 0', background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 2px 16px rgba(43,171,225,0.12)', zIndex: 2, position: 'relative' }}>
          <div style={{ color: '#6b7280', fontSize: 13 }}>Aucun cours à venir —{' '}
            <span style={{ color: '#2BABE1', fontWeight: 700, cursor: 'pointer' }} onClick={() => onNavigate('planning')}>voir le planning →</span>
          </div>
        </div>
      )}

      <div style={{ padding: '24px 16px 0' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Mon espace</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          {menuItems.map(item => (
            <div key={item.id} onClick={() => onNavigate(item.id)} style={{
              background: item.blue ? '#2BABE1' : item.dark ? '#1F1F20' : '#f4f6f8',
              borderRadius: 18, padding: '18px 16px', cursor: 'pointer', transition: 'transform 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.transform = 'scale(0.98)'}
              onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
            >
              <div style={{ fontSize: 28, marginBottom: 10 }}>{item.emoji}</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: (item.blue || item.dark) ? '#fff' : '#1F1F20', lineHeight: 1.2 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: (item.blue || item.dark) ? 'rgba(255,255,255,0.65)' : '#6b7280', marginTop: 4 }}>{item.sub}</div>
            </div>
          ))}
        </div>
        {upcomingCourses.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Cette semaine</div>
            {upcomingCourses.slice(0, 3).map(course => {
              const cfg = courseTypeConfig[course.type];
              return (
                <div key={course.id} onClick={() => onNavigate('planning')} style={{
                  background: '#f4f6f8', borderRadius: 14, padding: '12px 14px 12px 18px',
                  marginBottom: 8, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
                  borderLeft: `4px solid ${cfg?.color ?? '#2BABE1'}`,
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20' }}>{course.title}</div>
                    <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3 }}>{fmtDate(course.date_start)} · {fmtTime(course.date_start)}</div>
                  </div>
                  <span style={{ fontSize: 18 }}>{cfg?.emoji}</span>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
    }
