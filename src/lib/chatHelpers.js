// src/lib/chatHelpers.js
// Utilitaires pour le chat membre ↔ admin

// Heures de disponibilité de Tiffany : lundi-vendredi 8h15-17h00 (Europe/Zurich)
const AVAILABILITY = {
  weekdays: [1, 2, 3, 4, 5], // lundi=1, vendredi=5 (0=dim, 6=sam)
  startHour: 8,
  startMinute: 15,
  endHour: 17,
  endMinute: 0,
};

/**
 * Vérifie si Tiffany est dans ses heures d'ouverture (ne tient pas compte du
 * statut admin_chat_status, juste l'horloge).
 * Calculé en heure locale Zurich.
 */
export function isWithinAvailableHours(date = new Date()) {
  // Convertit en heure Zurich
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const day = dayMap[parts.find(p => p.type === 'weekday').value] ?? 0;
  const hour = parseInt(parts.find(p => p.type === 'hour').value, 10);
  const min = parseInt(parts.find(p => p.type === 'minute').value, 10);

  if (!AVAILABILITY.weekdays.includes(day)) return false;
  const minutes = hour * 60 + min;
  const startMin = AVAILABILITY.startHour * 60 + AVAILABILITY.startMinute;
  const endMin = AVAILABILITY.endHour * 60 + AVAILABILITY.endMinute;
  return minutes >= startMin && minutes < endMin;
}

/**
 * Calcule le statut effectif de l'admin (combinant horaire + vacances).
 * @param {Object} adminProfile - {admin_chat_status, vacation_until}
 * @returns {{ available: boolean, reason: 'on'|'off_hours'|'vacation', label?: string }}
 */
export function computeAdminAvailability(adminProfile) {
  if (adminProfile?.admin_chat_status === 'vacation') {
    const until = adminProfile.vacation_until ? new Date(adminProfile.vacation_until) : null;
    if (!until || until > new Date()) {
      return {
        available: false,
        reason: 'vacation',
        label: until
          ? `Tiffany est en congés jusqu'au ${until.toLocaleDateString('fr-CH', { day: 'numeric', month: 'long' })}. Elle reprend les messages à son retour.`
          : 'Tiffany est en congés. Elle reprend les messages à son retour.',
      };
    }
  }
  if (!isWithinAvailableHours()) {
    return {
      available: false,
      reason: 'off_hours',
      label: 'Tiffany répond entre 8h15 et 17h en semaine. Tu peux écrire — elle te répondra dès son retour.',
    };
  }
  return { available: true, reason: 'on' };
}

/**
 * Formate la date d'un message pour affichage dans la bulle.
 */
export function fmtMessageTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "À l'instant";
  if (diffMin < 60) return `Il y a ${diffMin} min`;

  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) {
    return 'Hier ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
  }
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString('fr-CH', sameYear
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' }
  ) + ' · ' + d.toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Détecte le type d'attachement à partir du MIME ou du nom.
 */
export function detectAttachmentType(file) {
  const mime = file?.type ?? '';
  const name = (file?.name ?? '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  return null;
}

/**
 * Limites de taille par type (en bytes).
 */
export const ATTACHMENT_LIMITS = {
  image: 10 * 1024 * 1024,  // 10 MB
  video: 50 * 1024 * 1024,  // 50 MB
  pdf:   10 * 1024 * 1024,  // 10 MB
};

export function validateAttachment(file) {
  const type = detectAttachmentType(file);
  if (!type) return { ok: false, error: 'Type de fichier non supporté (photo, vidéo ou PDF uniquement).' };
  const limit = ATTACHMENT_LIMITS[type];
  if (file.size > limit) {
    const limitMB = Math.round(limit / 1024 / 1024);
    return { ok: false, error: `Fichier trop gros (max ${limitMB} MB).` };
  }
  return { ok: true, type };
}
