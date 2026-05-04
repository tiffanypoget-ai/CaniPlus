// src/lib/calendar.js
//
// Génération de fichiers iCalendar (.ics) — RFC 5545 — pour ajouter un cours
// CaniPlus dans Apple Calendar, Google Calendar, Outlook, etc.
//
// On génère les heures en TZID=Europe/Zurich (sans VTIMEZONE — les clients
// calendrier majeurs reconnaissent le TZ standard sans définition explicite,
// y compris iOS Apple Calendar, Google Calendar, Outlook).
//
// L'UID est dérivé du type d'event + identifiant en base, donc régénérer un
// .ics pour le même cours met à jour l'event existant au lieu de créer un
// doublon (ex: cours déplacé par l'admin).
//
// Tous les events incluent un VALARM 1h avant.

const TZID = 'Europe/Zurich';
const PRODID = '-//CaniPlus//Planning//FR';
const ALARM_OFFSET_MINUTES = 60;

/**
 * Échappe les caractères spéciaux dans une valeur iCalendar.
 * RFC 5545 §3.3.11 : `\` → `\\`, `,` → `\,`, `;` → `\;`, `\n` → `\n`.
 */
function escapeICS(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

/**
 * Découpe une longue ligne en blocs de 75 octets max (RFC 5545 §3.1).
 * Les lignes suivantes commencent par un espace (line folding).
 */
function foldLine(line) {
  if (line.length <= 75) return line;
  const out = [line.slice(0, 75)];
  let rest = line.slice(75);
  while (rest.length > 74) {
    out.push(' ' + rest.slice(0, 74));
    rest = rest.slice(74);
  }
  if (rest.length) out.push(' ' + rest);
  return out.join('\r\n');
}

/**
 * Convertit "YYYY-MM-DD" + "HH:MM" → "YYYYMMDDTHHMMSS" (format iCal local).
 */
function toICSLocal(dateStr, timeStr) {
  const [y, m, d] = dateStr.split('-');
  const [hh, mm] = (timeStr || '00:00').split(':');
  return `${y}${m}${d}T${(hh || '00').padStart(2, '0')}${(mm || '00').padStart(2, '0')}00`;
}

/**
 * Stamp UTC pour DTSTAMP (timestamp de génération du .ics).
 */
function nowStampUTC() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return (
    now.getUTCFullYear() +
    pad(now.getUTCMonth() + 1) +
    pad(now.getUTCDate()) +
    'T' +
    pad(now.getUTCHours()) +
    pad(now.getUTCMinutes()) +
    pad(now.getUTCSeconds()) +
    'Z'
  );
}

/**
 * Génère le contenu d'un fichier .ics pour un event.
 *
 * @param {Object} event
 * @param {string} event.uid           Identifiant stable (ex: `course-${id}@caniplus.ch`).
 * @param {string} event.title         Titre affiché dans le calendrier.
 * @param {string} event.description   Description (peut contenir des sauts de ligne).
 * @param {string} event.location      Lieu (adresse libre).
 * @param {string} event.date          Date du cours, format "YYYY-MM-DD".
 * @param {string} event.startTime     Heure de début, format "HH:MM".
 * @param {string} event.endTime       Heure de fin, format "HH:MM".
 * @param {string} [event.url]         URL optionnelle (ex: lien vers la fiche du cours).
 * @param {boolean} [event.alarm=true] Inclure un rappel 1h avant.
 * @returns {string} contenu du fichier .ics
 */
export function buildICS(event) {
  const {
    uid,
    title,
    description = '',
    location = '',
    date,
    startTime,
    endTime,
    url,
    alarm = true,
  } = event;

  if (!uid || !title || !date || !startTime || !endTime) {
    throw new Error('buildICS: uid, title, date, startTime, endTime required');
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowStampUTC()}`,
    `DTSTART;TZID=${TZID}:${toICSLocal(date, startTime)}`,
    `DTEND;TZID=${TZID}:${toICSLocal(date, endTime)}`,
    `SUMMARY:${escapeICS(title)}`,
  ];

  if (description) lines.push(`DESCRIPTION:${escapeICS(description)}`);
  if (location) lines.push(`LOCATION:${escapeICS(location)}`);
  if (url) lines.push(`URL:${escapeICS(url)}`);

  if (alarm) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeICS('Rappel : ' + title)}`,
      `TRIGGER:-PT${ALARM_OFFSET_MINUTES}M`,
      'END:VALARM'
    );
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/**
 * Déclenche le téléchargement / l'ouverture d'un fichier .ics dans le navigateur.
 * Sur iPhone Safari, ça ouvre directement Apple Calendar.
 * Sur Android Chrome, ça propose Google Calendar (ou autre app calendrier).
 * Sur desktop, ça ouvre l'app calendrier par défaut ou télécharge le fichier.
 */
export function downloadICS(filename, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Libère le blob un peu plus tard (laisse le temps au browser de lire)
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Génère une URL Google Calendar "render?action=TEMPLATE" — ouvre une page
 * pré-remplie de création d'event Google. Pratique sur desktop pour les
 * utilisateurs Gmail.
 */
export function googleCalendarUrl(event) {
  const { title, description = '', location = '', date, startTime, endTime } = event;

  // Format Google : "YYYYMMDDTHHMMSS" sans tz (heure locale Zurich) +
  // ctz=Europe/Zurich pour préciser le fuseau.
  const start = toICSLocal(date, startTime);
  const end = toICSLocal(date, endTime);

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${start}/${end}`,
    details: description,
    location: location,
    ctz: TZID,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/* ─── Helpers spécifiques CaniPlus ─────────────────────────────── */

const DEFAULT_LOCATION = 'CaniPlus, 1338 Ballaigues';

/**
 * Construit l'event .ics à partir d'un cours collectif (group_courses).
 */
export function eventFromGroupCourse(course, dogName) {
  const isSpecial = !!course.supplement_name;
  const isTheoretical = !!course.title && !course.start_time?.match(/^\d{2}:\d{2}/);
  const titleBase = isSpecial
    ? course.supplement_name
    : course.title
    ? course.title
    : 'Cours collectif CaniPlus';

  const lines = [];
  if (dogName) lines.push(`Avec ${dogName}`);
  if (course.location) lines.push(`Lieu : ${course.location}`);
  if (course.instructor) lines.push(`Éducateur : ${course.instructor}`);
  lines.push('', 'Voir les détails sur https://app.caniplus.ch/planning');

  return {
    uid: `course-${course.id}-${dogName || 'self'}@caniplus.ch`,
    title: titleBase,
    description: lines.join('\n'),
    location: course.location || DEFAULT_LOCATION,
    date: course.course_date,
    startTime: course.start_time,
    endTime: course.end_time,
    url: 'https://app.caniplus.ch/planning',
  };
}

/**
 * Construit l'event .ics à partir d'une ligne de la table `courses`
 * (qui a date_start / date_end en timestamps ISO complets).
 *
 * On extrait les composants date/heure en heure locale Zurich pour respecter
 * le TZID dans le .ics.
 */
export function eventFromCourseRow(course, dogName) {
  if (!course?.date_start) {
    throw new Error('eventFromCourseRow: date_start manquant');
  }

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZID,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const formatLocal = (iso) => {
    const parts = formatter.formatToParts(new Date(iso));
    const m = {};
    parts.forEach(p => { m[p.type] = p.value; });
    return {
      date: `${m.year}-${m.month}-${m.day}`,
      time: `${m.hour === '24' ? '00' : m.hour}:${m.minute}`,
    };
  };

  const start = formatLocal(course.date_start);
  const end = course.date_end
    ? formatLocal(course.date_end)
    : { date: start.date, time: start.time };

  const isPrivate = course.type === 'prive';

  const lines = [];
  if (dogName) lines.push(`Avec ${dogName}`);
  if (course.location) lines.push(`Lieu : ${course.location}`);
  if (course.instructor) lines.push(`Éducateur : ${course.instructor}`);
  lines.push('', `Voir les détails sur https://app.caniplus.ch/${isPrivate ? 'profil' : 'planning'}`);

  return {
    uid: `course-${course.id}@caniplus.ch`,
    title: course.title || (isPrivate ? 'Cours privé CaniPlus' : 'Cours CaniPlus'),
    description: lines.join('\n'),
    location: course.location || DEFAULT_LOCATION,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    url: `https://app.caniplus.ch/${isPrivate ? 'profil' : 'planning'}`,
  };
}

/**
 * Construit l'event .ics à partir d'un cours privé confirmé
 * (private_course_requests avec chosen_slot rempli).
 */
export function eventFromPrivateCourse(request, dogName) {
  if (!request.chosen_slot?.date || !request.chosen_slot?.start) {
    throw new Error('eventFromPrivateCourse: chosen_slot incomplet');
  }

  const lines = [];
  if (dogName) lines.push(`Avec ${dogName}`);
  if (request.admin_notes) lines.push('', 'Notes : ' + request.admin_notes);
  lines.push('', 'Voir les détails sur https://app.caniplus.ch/profil');

  return {
    uid: `private-${request.id}@caniplus.ch`,
    title: 'Cours privé CaniPlus',
    description: lines.join('\n'),
    location: DEFAULT_LOCATION,
    date: request.chosen_slot.date,
    startTime: request.chosen_slot.start,
    endTime: request.chosen_slot.end || request.chosen_slot.start,
    url: 'https://app.caniplus.ch/profil',
  };
}
