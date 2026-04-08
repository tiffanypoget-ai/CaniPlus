// src/screens/PlanningScreen.js
import { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { courseTypeConfig } from '../lib/theme';

const FILTERS = [
  { key: 'tous', label: 'Tous' },
  { key: 'collectif', label: 'Collectifs' },
  { key: 'prive', label: 'Privés' },
  { key: 'theorique', label: 'Théoriques' },
];

export default function PlanningScreen() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState([]);
  const [enrolledIds, setEnrolledIds] = useState(new Set());
  const [filter, setFilter] = useState('tous');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;
    const load = async () => {
      const { data: all } = await supabase.from('courses').select('*').gte('date_start', new Date().toISOString()).order('date_start');
      if (all) setCourses(all);
      const { data: enr } = await supabase.from('enrollments').select('course_id').eq('user_id', profile.id).eq('status', 'confirmed');
      if (enr) setEnrolledIds(new Set(enr.map(e => e.course_id)));
      setLoading(false);
    };
    load();
  }, [profile]);

  const filtered = filter === 'tous' ? courses : courses.filter(c => c.type === filter);
  const fmtDate = (iso) => ({ day: new Date(iso).getDate(), month: new Date(iso).toLocaleDateString('fr-CH', { month: 'short' }), weekday: new Date(iso).toLocaleDateString('fr-CH', { weekday: 'long' }) });
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px', flexShrink: 0 }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Planning 📅</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>Vos cours à venir</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: '7px 16px', borderRadius: 999, flexShrink: 0,
              background: filter === f.key ? '#fff' : 'rgba(255,255,255,0.15)',
              color: filter === f.key ? '#1F1F20' : 'rgba(255,255,255,0.7)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none',
              transition: 'background 0.2s',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {/* Liste */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="screen-content">
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Chargement...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🐾</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#6b7280' }}>Aucun cours à venir</div>
          </div>
        ) : filtered.map(course => {
          const cfg = courseTypeConfig[course.type];
          const date = fmtDate(course.date_start);
          const isEnrolled = enrolledIds.has(course.id);
          return (
            <div key={course.id} style={{ background: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, display: 'flex', gap: 14, boxShadow: '0 2px 16px rgba(43,171,225,0.08)' }}>
              {/* Date badge */}
              <div style={{ width: 54, height: 62, borderRadius: 14, background: cfg?.color ?? '#2BABE1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{date.day}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase' }}>{date.month}</span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                  <span>{cfg?.emoji}</span>
                  <span style={{ background: (cfg?.color ?? '#2BABE1') + '20', color: cfg?.color ?? '#2BABE1', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>{cfg?.label}</span>
                  {isEnrolled && <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8 }}>✓ Inscrit</span>}
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20', marginBottom: 4 }}>{course.title}</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>{date.weekday} · {fmtTime(course.date_start)} – {fmtTime(course.date_end)}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>📍 {course.location}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>👤 {course.instructor}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
