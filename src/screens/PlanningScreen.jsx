// src/screens/PlanningScreen.jsx
// Planning hebdomadaire collectif + cours privÃ©s

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PrivateCourseRequestModal from '../components/PrivateCourseRequestModal';

// âââ Helpers ââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

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

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

const DAYS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const DAYS_FULL = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS_FR = ['jan', 'fÃ©v', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoÃ»', 'sep', 'oct', 'nov', 'dÃ©c'];
const MONTHS_FULL = ['janvier','fÃ©vrier','mars','avril','mai','juin','juillet','aoÃ»t','septembre','octobre','novembre','dÃ©cembre'];

function fmtWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const sameMonth = monday.getMonth() === sunday.getMonth();
  if (sameMonth) {
    return `${monday.getDate()} â ${sunday.getDate()} ${MONTHS_FR[monday.getMonth()]} ${monday.getFullYear()}`;
  }
  return `${monday.getDate()} ${MONTHS_FR[monday.getMonth()]} â ${sunday.getDate()} ${MONTHS_FR[sunday.getMonth()]} ${monday.getFullYear()}`;
}

function fmtCourseDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`;
}

function fmtPrivateSlot(slot) {
  if (!slot) return '';
  const d = new Date(slot.date + 'T00:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()} Â· ${slot.start}â${slot.end}`;
}

const STATUS_LABELS = {
  pending:   { label: 'En attente', color: '#f59e0b', bg: '#fef3c7' },
  confirmed: { label: 'ConfirmÃ© â', color: '#16a34a', bg: '#dcfce7' },
  cancelled: { label: 'AnnulÃ©',     color: '#dc2626', bg: '#fee2e2' },
};

// âââ Composant principal âââââââââââââââââââââââââââââââââââââââââââââââââââââ

export default function PlanningScreen() {
  const { profile } = useAuth();
  const courseType = profile?.course_type ?? 'group';
  const showGroup   = courseType === 'group'   || courseType === 'both';
  const showPrivate = courseType === 'private' || courseType === 'both';

  const [tab, setTab] = useState(showGroup ? 'collectifs' : 'prives');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 0',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', marginBottom: 4 }}>Planning ð</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 16 }}>
          {courseType === 'both' ? 'Cours collectifs & privÃ©s' : courseType === 'private' ? 'Cours privÃ©s' : 'Cours collectifs'}
        </div>
        {/* Tabs */}
        {showGroup && showPrivate && (
          <div style={{ display: 'flex', gap: 4, paddingBottom: 0 }}>
            {[
              { key: 'collectifs', label: 'ð¥ Collectifs' },
              { key: 'prives',     label: 'ð¯ PrivÃ©s' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                padding: '10px 18px', background: 'none', border: 'none',
                borderBottom: tab === t.key ? '3px solid #2BABE1' : '3px solid transparent',
                color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.5)',
                fontSize: 14, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s',
              }}>{t.label}</button>
            ))}
          </div>
        )}
      </div>

      {/* Contenu */}
      <div style={{ flex: 1, overflowY: 'auto' }} className="screen-content">
        {tab === 'collectifs' && showGroup && <CollectifsTab profile={profile} />}
        {tab === 'prives'     && showPrivate && <PrivesTab profile={profile} />}
      </div>
    </div>
  );
}

// âââ Onglet Collectifs ââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function CollectifsTab({ profile }) {
  const [weekStart, setWeekStart] = useState(() => getWeekStart());
  const [courses,     setCourses]     = useState([]);
  const [attendance,  setAttendance]  = useState({}); // courseId â [{ user_id, profiles }]
  const [absences,    setAbsences]    = useState([]); // [{ user_id, profiles }]
  const [myAttended,  setMyAttended]  = useState(new Set()); // courseIds I'm attending
  const [imAbsent,    setImAbsent]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);

  const weekEnd   = addDays(weekStart, 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr   = toDateStr(weekEnd);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

    // Cours de la semaine
    const { data: gc } = await supabase
      .from('group_courses')
      .select('*')
      .gte('course_date', weekStartStr)
      .lte('course_date', weekEndStr)
      .order('course_date')
      .order('start_time');
    const courseList = gc ?? [];
    setCourses(courseList);

    if (courseList.length === 0) { setLoading(false); return; }

    const ids = courseList.map(c => c.id);

    // PrÃ©sences (avec infos profil)
    const { data: att } = await supabase
      .from('course_attendance')
      .select('course_id, user_id, profiles(first_name, dog_name)')
      .in('course_id', ids);

    const attMap = {};
    const mySet  = new Set();
    (att ?? []).forEach(a => {
      if (!attMap[a.course_id]) attMap[a.course_id] = [];
      attMap[a.course_id].push(a);
      if (a.user_id === profile.id) mySet.add(a.course_id);
    });
    setAttendance(attMap);
    setMyAttended(mySet);

    // Absences de la semaine
    const { data: abs } = await supabase
      .from('weekly_absences')
      .select('user_id, profiles(first_name, dog_name)')
      .eq('week_start', weekStartStr);
    setAbsences(abs ?? []);
    setImAbsent((abs ?? []).some(a => a.user_id === profile.id));

    setLoading(false);
  }, [profile, weekStartStr, weekEndStr]);

  useEffect(() => { load(); }, [load]);

  const togglePresence = async (courseId) => {
    if (!profile || saving) return;
    setSaving(true);
    if (myAttended.has(courseId)) {
      await supabase.from('course_attendance')
        .delete().eq('course_id', courseId).eq('user_id', profile.id);
    } else {
      // Si j'Ã©tais absent, retirer l'absence
      if (imAbsent) {
        await supabase.from('weekly_absences')
          .delete().eq('user_id', profile.id).eq('week_start', weekStartStr);
      }
      await supabase.from('course_attendance')
        .insert({ course_id: courseId, user_id: profile.id });
    }
    setSaving(false);
    load();
  };

  const toggleAbsent = async () => {
    if (!profile || saving) return;
    setSaving(true);
    if (imAbsent) {
      await supabase.from('weekly_absences')
        .delete().eq('user_id', profile.id).eq('week_start', weekStartStr);
    } else {
      // Retirer toutes mes prÃ©sences de la semaine
      const ids = courses.map(c => c.id);
      if (ids.length > 0) {
        await supabase.from('course_attendance')
          .delete().eq('user_id', profile.id).in('course_id', ids);
      }
      await supabase.from('weekly_absences')
        .insert({ user_id: profile.id, week_start: weekStartStr });
    }
    setSaving(false);
    load();
  };

  // Grouper les cours par date
  const coursesByDate = {};
  courses.forEach(c => {
    if (!coursesByDate[c.course_date]) coursesByDate[c.course_date] = [];
    coursesByDate[c.course_date].push(c);
  });

  return (
    <div style={{ padding: 16 }}>
      {/* Navigation semaine */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#fff', borderRadius: 16, padding: '12px 16px',
        marginBottom: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
      }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtn}>â¹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20' }}>
            {fmtWeekLabel(weekStart)}
          </div>
          {toDateStr(getWeekStart()) === weekStartStr && (
            <div style={{ fontSize: 11, color: '#2BABE1', fontWeight: 700 }}>Cette semaine</div>
          )}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtn}>âº</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#6b7280' }}>Chargement...</div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>ðï¸</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>Pas de cours cette semaine</div>
        </div>
      ) : (
        <>
          {/* Cours par date */}
          {Object.entries(coursesByDate).map(([dateStr, dayCourses]) => (
            <div key={dateStr} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20', marginBottom: 10, textTransform: 'capitalize' }}>
                ð {fmtCourseDate(dateStr)}
              </div>
              {dayCourses.map(course => {
                const isMine     = myAttended.has(course.id);
                const attendees  = attendance[course.id] ?? [];
                const isSpecial  = course.is_supplement;
                return (
                  <div key={course.id} style={{
                    background: '#fff', borderRadius: 16, marginBottom: 10,
                    boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                    border: isMine ? '2px solid #2BABE1' : '2px solid transparent',
                    overflow: 'hidden',
                  }}>
                    {/* En-tÃªte du crÃ©neau */}
                    <button
                      onClick={() => !isSpecial && togglePresence(course.id)}
                      disabled={saving || imAbsent || isSpecial}
                      style={{
                        width: '100%', padding: '14px 16px',
                        background: isSpecial ? '#fef3c7' : isMine ? '#e8f7fd' : '#f9fafb',
                        border: 'none', cursor: isSpecial ? 'default' : 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                        background: isSpecial ? '#f59e0b' : isMine ? '#2BABE1' : '#e5e7eb',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 20,
                      }}>
                        {isSpecial ? 'â­' : isMine ? 'â' : 'ð¾'}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: '#1F1F20' }}>
                          {isSpecial ? course.supplement_name : `${course.start_time} â ${course.end_time}`}
                        </div>
                        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                          {isSpecial
                            ? `Cours en supplÃ©ment Â· ${course.start_time}â${course.end_time}`
                            : attendees.length === 0
                              ? 'Personne inscritÂ·e pour le moment'
                              : `${attendees.length} participant${attendees.length > 1 ? 's' : ''}`}
                        </div>
                      </div>
                      {!isSpecial && !imAbsent && (
                        <div style={{
                          padding: '5px 12px', borderRadius: 20,
                          background: isMine ? '#2BABE1' : '#e5e7eb',
                          color: isMine ? '#fff' : '#6b7280',
                          fontSize: 12, fontWeight: 700, flexShrink: 0,
                        }}>
                          {isMine ? 'Je viens â' : 'Venir'}
                        </div>
                      )}
                    </button>

                    {/* Liste des participants */}
                    {attendees.length > 0 && (
                      <div style={{ padding: '8px 16px 12px', borderTop: '1px solid #f3f4f6' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {attendees.map(a => (
                            <div key={a.user_id} style={{
                              background: a.user_id === profile.id ? '#e8f7fd' : '#f4f6f8',
                              borderRadius: 20, padding: '4px 10px',
                              fontSize: 12, fontWeight: 600,
                              color: a.user_id === profile.id ? '#2BABE1' : '#374151',
                              display: 'flex', alignItems: 'center', gap: 4,
                            }}>
                              ð {a.profiles?.dog_name ?? '?'} â {a.profiles?.first_name ?? '?'}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Absents de la semaine */}
          {absences.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#6b7280', marginBottom: 10 }}>
                â AbsentÂ·es cette semaine
              </div>
              <div style={{ background: '#fff', borderRadius: 16, padding: '12px 16px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {absences.map(a => (
                    <div key={a.user_id} style={{
                      background: a.user_id === profile.id ? '#fee2e2' : '#f4f6f8',
                      borderRadius: 20, padding: '4px 10px',
                      fontSize: 12, fontWeight: 600,
                      color: a.user_id === profile.id ? '#dc2626' : '#6b7280',
                    }}>
                      ð {a.profiles?.dog_name ?? '?'} â {a.profiles?.first_name ?? '?'}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mon statut pour la semaine */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 16,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 8,
          }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20', marginBottom: 12 }}>
              Ma prÃ©sence cette semaine
            </div>
            {imAbsent ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: 14, color: '#dc2626', fontWeight: 700 }}>
                  â Tu es marquÃ©Â·e absentÂ·e
                </div>
                <button onClick={toggleAbsent} disabled={saving} style={{
                  padding: '8px 14px', background: '#f4f6f8', border: 'none',
                  borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151',
                }}>
                  Annuler
                </button>
              </div>
            ) : myAttended.size > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ flex: 1, fontSize: 14, color: '#16a34a', fontWeight: 700 }}>
                  â Tu es inscritÂ·e Ã  {myAttended.size} crÃ©neau{myAttended.size > 1 ? 'x' : ''}
                </div>
                <button onClick={toggleAbsent} disabled={saving} style={{
                  padding: '8px 14px', background: '#fee2e2', border: 'none',
                  borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626',
                }}>
                  AbsentÂ·e
                </button>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
                  Tu n'as pas encore indiquÃ© ta prÃ©sence. SÃ©lectionne un crÃ©neau ci-dessus ouâ¦
                </div>
                <button onClick={toggleAbsent} disabled={saving} style={{
                  width: '100%', padding: '13px', background: '#fee2e2', border: 'none',
                  borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#dc2626',
                }}>
                  â Je suis absentÂ·e cette semaine
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// âââ Onglet Cours privÃ©s ââââââââââââââââââââââââââââââââââââââââââââââââââââââ

function PrivesTab({ profile }) {
  const [requests, setRequests]  = useState([]);
  const [loading, setLoading]    = useState(true);
  const [showModal, setShowModal] = useState(false);

  const load = async () => {
    if (!profile) return;
    setLoading(true);
    const { data } = await supabase
      .from('private_course_requests')
      .select('*')
      .eq('user_id', profile.id)
      .order('created_at', { ascending: false });
    setRequests(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [profile]);

  const upcoming = requests.filter(r => r.status === 'confirmed');
  const pending  = requests.filter(r => r.status === 'pending');
  const past     = requests.filter(r => r.status === 'cancelled');

  return (
    <div style={{ padding: 16 }}>
      {/* Bouton demander */}
      <button onClick={() => setShowModal(true)} style={{
        width: '100%', padding: '15px',
        background: 'linear-gradient(135deg, #2BABE1, #1a8bbf)',
        border: 'none', borderRadius: 16, color: '#fff',
        fontSize: 15, fontWeight: 800, cursor: 'pointer',
        marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      }}>
        â Demander un cours privÃ©
      </button>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Chargement...</div>
      ) : requests.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>ð¯</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6b7280' }}>Aucune demande pour le moment</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 6 }}>
            Propose tes disponibilitÃ©s pour un cours privÃ©
          </div>
        </div>
      ) : (
        <>
          {upcoming.length > 0 && (
            <Section title="â Cours confirmÃ©s" items={upcoming} profile={profile} />
          )}
          {pending.length > 0 && (
            <Section title="â³ En attente de confirmation" items={pending} profile={profile} />
          )}
          {past.length > 0 && (
            <Section title="AnnulÃ©s" items={past} profile={profile} dimmed />
          )}
        </>
      )}

      {showModal && (
        <PrivateCourseRequestModal
          userId={profile.id}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

function Section({ title, items, profile, dimmed }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: dimmed ? '#9ca3af' : '#1F1F20', marginBottom: 10 }}>
        {title}
      </div>
      {items.map(req => {
        const s = STATUS_LABELS[req.status];
        return (
          <div key={req.id} style={{
            background: '#fff', borderRadius: 16, padding: 16, marginBottom: 10,
            boxShadow: '0 2px 12px rgba(0,0,0,0.06)', opacity: dimmed ? 0.6 : 1,
          }}>
            {/* Statut */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ fontSize: 12, color: '#6b7280' }}>
                Demande du {new Date(req.created_at).toLocaleDateString('fr-CH')}
              </div>
              <div style={{
                background: s.bg, color: s.color,
                fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              }}>
                {s.label}
              </div>
            </div>

            {/* CrÃ©neau confirmÃ© */}
            {req.confirmed_slot && (
              <div style={{
                background: '#e8f7fd', borderRadius: 12, padding: '10px 14px', marginBottom: 10,
                fontSize: 13, fontWeight: 700, color: '#1F1F20',
              }}>
                ð {fmtPrivateSlot(req.confirmed_slot)}
              </div>
            )}

            {/* DisponibilitÃ©s proposÃ©es */}
            {!req.confirmed_slot && req.availability_slots?.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  DisponibilitÃ©s proposÃ©es
                </div>
                {req.availability_slots.map((slot, i) => (
                  <div key={i} style={{
                    background: '#f4f6f8', borderRadius: 10, padding: '8px 12px',
                    fontSize: 13, color: '#374151', marginBottom: 4,
                  }}>
                    {fmtPrivateSlot(slot)}
                  </div>
                ))}
              </div>
            )}

            {/* Prix */}
            {req.price && (
              <div style={{ marginTop: 10, fontSize: 13, color: '#16a34a', fontWeight: 700 }}>
                ð¶ CHF {req.price}
              </div>
            )}

            {/* Notes admin */}
            {req.admin_notes && (
              <div style={{
                marginTop: 10, background: '#fef3c7', borderRadius: 10,
                padding: '8px 12px', fontSize: 13, color: '#92400e',
              }}>
                ð¬ {req.admin_notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// âââ Styles âââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââââ

const navBtn = {
  width: 38, height: 38, borderRadius: 10, background: '#f4f6f8',
  border: 'none', fontSize: 22, cursor: 'pointer', color: '#374151',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontWeight: 700,
};
