// src/screens/PlanningScreen.jsx
// Planning hebdomadaire collectif + cours privés

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import PrivateCourseRequestModal from '../components/PrivateCourseRequestModal';

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

export default function PlanningScreen() {
  const { profile } = useAuth();
  const courseType  = profile?.course_type ?? 'group';
  const showGroup   = courseType === 'group'   || courseType === 'both';
  const showPrivate = courseType === 'private' || courseType === 'both';

  const [tab, setTab] = useState(showGroup ? 'collectifs' : 'prives');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 20px 0',
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginBottom: 2 }}>Planning 📅</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: showGroup && showPrivate ? 12 : 16 }}>
          {courseType === 'both' ? 'Collectifs & cours privés' : courseType === 'private' ? 'Cours privés' : 'Cours collectifs'}
        </div>

        {/* Tabs — seulement si les deux types */}
        {showGroup && showPrivate && (
          <div style={{ display: 'flex' }}>
            {[
              { key: 'collectifs', label: '👥 Collectifs' },
              { key: 'prives',     label: '🎯 Privés' },
            ].map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{
                flex: 1, padding: '11px 0', background: 'none', border: 'none',
                borderBottom: tab === t.key ? '3px solid #2BABE1' : '3px solid transparent',
                color: tab === t.key ? '#fff' : 'rgba(255,255,255,0.4)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Contenu scrollable ── */}
      <div style={{ flex: 1, overflowY: 'auto', background: '#f4f6f8' }} className="screen-content">
        {tab === 'collectifs' && showGroup  && <CollectifsTab profile={profile} />}
        {tab === 'prives'     && showPrivate && <PrivesTab profile={profile} />}
      </div>
    </div>
  );
}

// ─── Onglet Collectifs ────────────────────────────────────────────────────────

function CollectifsTab({ profile }) {
  const [weekStart,   setWeekStart]   = useState(() => getWeekStart());
  const [courses,     setCourses]     = useState([]);
  const [attendance,  setAttendance]  = useState({});
  const [absences,    setAbsences]    = useState([]);
  const [myAttended,  setMyAttended]  = useState(new Set());
  const [imAbsent,    setImAbsent]    = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [loading,     setLoading]     = useState(true);

  const weekEnd      = addDays(weekStart, 6);
  const weekStartStr = toDateStr(weekStart);
  const weekEndStr   = toDateStr(weekEnd);
  const isCurrentWeek = toDateStr(getWeekStart()) === weekStartStr;

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);

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

    // 1. Présences brutes (sans join pour éviter l'échec silencieux)
    const { data: att } = await supabase
      .from('course_attendance')
      .select('course_id, user_id')
      .in('course_id', ids);

    const attRaw = att ?? [];
    const mySet  = new Set();
    const attMap = {};
    attRaw.forEach(a => {
      if (!attMap[a.course_id]) attMap[a.course_id] = [];
      attMap[a.course_id].push(a);
      if (a.user_id === profile.id) mySet.add(a.course_id);
    });

    // 2. Enrichir avec profils + chiens
    const attUserIds = [...new Set(attRaw.map(a => a.user_id))];
    if (attUserIds.length > 0) {
      const [{ data: profs }, { data: dogs }] = await Promise.all([
        supabase.from('profiles').select('id, full_name').in('id', attUserIds),
        supabase.from('dogs').select('owner_id, name').in('owner_id', attUserIds),
      ]);
      const profMap = {};
      (profs ?? []).forEach(p => { profMap[p.id] = p; });
      const dogMap = {};
      (dogs ?? []).forEach(d => { dogMap[d.owner_id] = d; });
      Object.keys(attMap).forEach(courseId => {
        attMap[courseId] = attMap[courseId].map(a => ({
          ...a,
          profiles: profMap[a.user_id] ?? null,
          dog:      dogMap[a.user_id]  ?? null,
        }));
      });
    }

    setAttendance(attMap);
    setMyAttended(mySet);

    // 3. Absences brutes + enrichissement profils
    const { data: abs } = await supabase
      .from('weekly_absences')
      .select('user_id')
      .eq('week_start', weekStartStr);

    const absRaw     = abs ?? [];
    const absUserIds = [...new Set(absRaw.map(a => a.user_id))];
    let enrichedAbs  = absRaw;
    if (absUserIds.length > 0) {
      const { data: absProfs } = await supabase
        .from('profiles').select('id, full_name').in('id', absUserIds);
      const absProfMap = {};
      (absProfs ?? []).forEach(p => { absProfMap[p.id] = p; });
      enrichedAbs = absRaw.map(a => ({ ...a, profiles: absProfMap[a.user_id] ?? null }));
    }
    setAbsences(enrichedAbs);
    setImAbsent(enrichedAbs.some(a => a.user_id === profile.id));

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

  // Grouper par date
  const coursesByDate = {};
  courses.forEach(c => {
    if (!coursesByDate[c.course_date]) coursesByDate[c.course_date] = [];
    coursesByDate[c.course_date].push(c);
  });

  return (
    <div style={{ padding: '12px 16px 24px' }}>

      {/* ── Sélecteur de semaine ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        background: '#fff', borderRadius: 18, padding: '10px 8px',
        marginBottom: 16, boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
      }}>
        <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={navBtn}>‹</button>
        <div style={{ flex: 1, textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20' }}>
            {fmtWeekLabel(weekStart)}
          </div>
          {isCurrentWeek && (
            <div style={{ fontSize: 11, color: '#2BABE1', fontWeight: 700, marginTop: 1 }}>
              Semaine en cours
            </div>
          )}
        </div>
        <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={navBtn}>›</button>
      </div>

      {/* ── Bannière statut (si semaine courante) ── */}
      {isCurrentWeek && !loading && courses.length > 0 && (
        <div style={{
          borderRadius: 14, padding: '12px 16px', marginBottom: 14,
          background: imAbsent ? '#fee2e2' : myAttended.size > 0 ? '#dcfce7' : '#fff',
          border: `1.5px solid ${imAbsent ? '#fca5a5' : myAttended.size > 0 ? '#86efac' : '#e5e7eb'}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{ fontSize: 24 }}>
            {imAbsent ? '😴' : myAttended.size > 0 ? '✅' : '👋'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20' }}>
              {imAbsent
                ? 'Tu es absent·e cette semaine'
                : myAttended.size > 0
                  ? `Inscrit·e à ${myAttended.size} créneau${myAttended.size > 1 ? 'x' : ''}`
                  : 'Pas encore répondu'}
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 1 }}>
              {imAbsent
                ? 'Touche "Annuler" pour modifier'
                : myAttended.size > 0
                  ? 'Sélectionne un créneau pour modifier'
                  : 'Clique sur un créneau ou déclare ton absence'}
            </div>
          </div>
          {imAbsent && (
            <button onClick={toggleAbsent} disabled={saving} style={{
              padding: '6px 12px', background: '#fff', border: '1.5px solid #fca5a5',
              borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#dc2626',
              flexShrink: 0,
            }}>
              Annuler
            </button>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af' }}>
          <div style={{ fontSize: 28, marginBottom: 8 }}>⏳</div>
          Chargement...
        </div>
      ) : courses.length === 0 ? (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontSize: 44, marginBottom: 12 }}>🏖️</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#374151' }}>Pas de cours cette semaine</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 4 }}>Profite du repos !</div>
        </div>
      ) : (
        <>
          {/* ── Cours par jour ── */}
          {Object.entries(coursesByDate).map(([dateStr, dayCourses]) => {
            const fmt = fmtCourseDate(dateStr);
            return (
              <div key={dateStr} style={{ marginBottom: 20 }}>
                {/* En-tête de journée */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                    background: '#1F1F20', color: '#fff',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, opacity: 0.6, textTransform: 'uppercase' }}>{fmt.short}</div>
                    <div style={{ fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{fmt.num}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#1F1F20' }}>{fmt.day}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{fmt.month}</div>
                  </div>
                </div>

                {/* Cards de cours */}
                {dayCourses.map(course => {
                  const isMine    = myAttended.has(course.id);
                  const attendees = attendance[course.id] ?? [];
                  const isSpecial = course.is_supplement;
                  return (
                    <button
                      key={course.id}
                      onClick={() => !isSpecial && togglePresence(course.id)}
                      disabled={saving || imAbsent || isSpecial}
                      style={{
                        width: '100%', marginBottom: 10, textAlign: 'left',
                        background: '#fff', borderRadius: 16,
                        border: `2px solid ${isSpecial ? '#fde68a' : isMine ? '#2BABE1' : '#f0f0f0'}`,
                        overflow: 'hidden', cursor: isSpecial ? 'default' : 'pointer',
                        boxShadow: isMine ? '0 2px 12px rgba(43,171,225,0.18)' : '0 1px 4px rgba(0,0,0,0.04)',
                        transition: 'border-color 0.15s, box-shadow 0.15s',
                      }}
                    >
                      {/* Ligne principale */}
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '13px 14px',
                        background: isSpecial ? '#fffbeb' : isMine ? '#e8f7fd' : 'transparent',
                      }}>
                        {/* Icône statut */}
                        <div style={{
                          width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                          background: isSpecial ? '#f59e0b' : isMine ? '#2BABE1' : '#f0f2f4',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 19,
                        }}>
                          {isSpecial ? '⭐' : isMine ? '✓' : '🐾'}
                        </div>

                        {/* Texte */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20' }}>
                            {isSpecial ? course.supplement_name : `${course.start_time} – ${course.end_time}`}
                          </div>
                          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 1 }}>
                            {isSpecial
                              ? `Supplément · ${course.start_time}–${course.end_time}`
                              : attendees.length === 0
                                ? 'Aucun inscrit pour le moment'
                                : `${attendees.length} participant${attendees.length > 1 ? 's' : ''}`}
                          </div>
                        </div>

                        {/* Bouton d'action */}
                        {!isSpecial && !imAbsent && (
                          <div style={{
                            padding: '6px 14px', borderRadius: 20, flexShrink: 0,
                            background: isMine ? '#2BABE1' : '#f0f2f4',
                            color: isMine ? '#fff' : '#374151',
                            fontSize: 12, fontWeight: 800,
                          }}>
                            {isMine ? '✓ Je viens' : 'Venir'}
                          </div>
                        )}
                      </div>

                      {/* Participants */}
                      {attendees.length > 0 && (
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
                    </button>
                  );
                })}
              </div>
            );
          })}

          {/* ── Absent·es de la semaine ── */}
          {absences.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Absent·es cette semaine
              </div>
              <div style={{ background: '#fff', borderRadius: 14, padding: '10px 14px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {absences.map(a => (
                  <div key={a.user_id} style={{
                    background: a.user_id === profile.id ? '#fee2e2' : '#f4f6f8',
                    borderRadius: 20, padding: '4px 10px',
                    fontSize: 12, fontWeight: 600,
                    color: a.user_id === profile.id ? '#dc2626' : '#6b7280',
                  }}>
                    😴 {a.profiles?.full_name?.split(' ')[0] ?? '?'}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Bouton absence (si pas encore de statut) ── */}
          {!imAbsent && isCurrentWeek && (
            <button onClick={toggleAbsent} disabled={saving} style={{
              width: '100%', padding: '13px',
              background: '#fff', border: '1.5px solid #fca5a5',
              borderRadius: 14, fontSize: 13, fontWeight: 700,
              cursor: 'pointer', color: '#dc2626',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              😴 Je serai absent·e cette semaine
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Onglet Cours privés ──────────────────────────────────────────────────────

function PrivesTab({ profile }) {
  const [requests,  setRequests]  = useState([]);
  const [loading,   setLoading]   = useState(true);
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
  const pending  = requests.filter(r => ˜�]\�OOH	�[�[���N�ۜ�\�H�\]Y\�˙�[\��O����]\�OOH	��[��[Y	�N��]\��
�]��[O^��Y[�Έ	�L�M��	�_O���ʈ�H
��B��]ۈې�X��^�
HO��]���[�[
�YJ_H�[O^��Y�	�L	I�Y[�Έ	�M	���X��ܛ�[��	�[�X\�YܘYY[�
L�YY�̐�P�LK�XN���I���ܙ\��	ۛۙI��ܙ\��Y]\ΈM���܎�	�ٙ�����۝�^�N�MK�۝�ZY���\��܎�	��[�\���X\��[����N���\�^N�	ٛ^	�[Yے][\Έ	��[�\���\�Y�P�۝[��	��[�\���\�����Y�Έ	�
���ؘJ
�M�K��K��I��_O��8��H[X[�\�[���\���]��B�؝]ۏ�����Y[���
�]��[O^��^[Yێ�	��[�\��Y[�Έ
��܎�	��X�L�Y��_O��\��[Y[�����]���
H��\]Y\�˛[��OOH�
�]��[O^��^[Yێ�	��[�\��Y[����
_O��]��[O^���۝�^�N�

X\��[����N�L�_O�'���]���]��[O^���۝�^�N�MK�۝�ZY��
���܎�	����MLI�_O�]X�[�H[X[�H�\�H[�Y[��]���]��[O^���۝�^�N�L���܎�	��X�L�Y��X\��[���
_O������H\�\�ۚX�[]0�\��\�[���\���]��B��]����]���
H�
����\��Z[�˛[���	���]�\��X�[ۈ]OH��!H��\���ۙ�\�p�\Ȉ][\�^�\��Z[��H�ٚ[O^��ٚ[_HϟB��[�[�˛[���	���]�\��X�[ۈ]OH����[�][�H�][\�^�[�[��H�ٚ[O^��ٚ[_HϟB��\��[���	���]�\��X�[ۈ]OH�[��[0�\Ȉ][\�^�\�H�ٚ[O^��ٚ[_H[[YYϟB�ς�
_B������[�[	��
��]�]P��\��T�\]Y\�[�[�\�\�Y^��ٚ[K�YB�ې���O^�
HO��]���[�[
�[�J_B�۔�]�Y^�
HO���]���[�[
�[�JN��Y

N�_B�ς�
_B��]���
NB���[��[ۈ�]�\��X�[ۊ�]K][\��ٚ[K[[YYJH�]\��
�]��[O^��X\��[����N��_O��]��[O^���۝�^�N�L��۝�ZY��
���܎�[[YY�	��X�L�Y���	����MLI�X\��[����N�L^�[�ٛܛN�	�\\��\�I�]\��X�[�Έ�H_O���]_B��]����][\˛X\
�\HO��ۜ��H�UT��P�S�ܙ\K��]\�N�]\��
�]��^O^ܙ\K�YH�[O^��X��ܛ�[��	�ٙ����ܙ\��Y]\ΈM�Y[�ΈM�X\��[����N�L����Y�Έ	�\
��ؘJ�
JI��X�]N�[[YY��MH�K��ܙ\��	�K�\��Yٌ��	��_O���ʈ�]]
�]H
��B�]��[O^��\�^N�	ٛ^	��\�Y�P�۝[��	��X�KX�]�Y[��[Yے][\Έ	��[�\��X\��[����N�L�_O��]��[O^���۝�^�N�L���܎�	��X�L�Y��_O��[X[�HHۙ]�]J�\K�ܙX]Y�]
K����[Q]T��[��	ٜ�P�	�_B��]���]��[O^��X��ܛ�[��˘����܎�˘��܋��۝�^�N�LK�۝�ZY��
�Y[�Έ	�L	��ܙ\��Y]\Έ��_O���˛X�[B��]����]�����ʈܰ�[�X]H�ۙ�\�p�H
��B�ܙ\K��ۙ�\�YY���	��
�]��[O^��X��ܛ�[��	��N�ٙ	��ܙ\��Y]\ΈL�Y[�Έ	�LM	�X\��[����N�L��۝�^�N�L��۝�ZY��
���܎�	��XN�����_O��<'��Hٛ]�]�]T��
�\K��ۙ�\�YY���
_B��]���
_B���ʈ\�ۚX�[]0�\�
��B��\�\K��ۙ�\�YY���	���\K�]�Z[X�[]W����˛[���	��
�]���]��[O^���۝�^�N�LK�۝�ZY��
���܎�	��X�L�Y��X\��[����N�
�^�[�ٛܛN�	�\\��\�I�]\��X�[�Έ�H_O��\�ۚX�[]0�\������Y\�]���ܙ\K�]�Z[X�[]W���˛X\

��JHO�
�]��^O^�_H�[O^��X��ܛ�[��	�ٍ���	��ܙ\��Y]\ΈLY[�Έ	�L�	���۝�^�N�L���܎�	����MLI�X\��[����N�
�_O��ٛ]�]�]T��
��
_B��]���
J_B��]���
_B��ܙ\K��X�H	��
�]��[O^��X\��[���L�۝�^�N�L���܎�	��M�L�I��۝�ZY��
�_O��<'䭈��ܙ\K��X�_B��]���
_B��ܙ\K�YZ[�ۛ�\�	��
�]��[O^�X\��[���L�X��ܛ�[��	�ٙY������ܙ\��Y]\ΈL�Y[�Έ	�L�	��۝�^�N�L���܎�	��L�I��_O��<'�ܙ\K�YZ[�ۛ�\�B��]���
_B��]���
NJ_B��]���
NB����8� 8� 8� �[\�\�Y��\�8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� 8� ���ۜ��]���H�Y��ZY����ܙ\��Y]\ΈL��X��ܛ�[��	�ٍ���	��ܙ\��	ۛۙI���۝�^�N����\��܎�	��[�\����܎�	����MLI��\�^N�	ٛ^	�[Yے][\Έ	��[�\���\�Y�P�۝[��	��[�\����۝�ZY��
��^��[�Έ�N�
