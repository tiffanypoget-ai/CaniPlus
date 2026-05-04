// src/components/AddToCalendarButton.jsx
//
// Bouton réutilisable « Ajouter au calendrier ».
//
// - Sur iPhone : un seul tap → ouvre Apple Calendar avec l'event pré-rempli.
// - Sur Android : ouvre Google Calendar / Samsung Calendar / autre app installée.
// - Sur desktop : un menu propose Google Calendar (lien direct) OU télécharge
//   un .ics que l'app calendrier par défaut sait ouvrir.
//
// Inclut un rappel automatique 1h avant.
//
// Usage :
//   <AddToCalendarButton event={eventFromGroupCourse(course, dogName)} />
//   <AddToCalendarButton event={eventFromPrivateCourse(request, dogName)} variant="compact" />

import { useState, useRef, useEffect } from 'react';
import { buildICS, downloadICS, googleCalendarUrl } from '../lib/calendar';
import Icon from './Icons';

function isMobile() {
  if (typeof navigator === 'undefined') return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function AddToCalendarButton({ event, variant = 'full', className }) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Ferme le menu si clic à l'extérieur
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  const handleICS = () => {
    try {
      const ics = buildICS(event);
      const safeName = (event.title || 'caniplus')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      downloadICS(`caniplus-${safeName}-${event.date}.ics`, ics);
      setOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('AddToCalendar ICS error:', err);
    }
  };

  const handleGoogle = () => {
    const url = googleCalendarUrl(event);
    window.open(url, '_blank', 'noopener,noreferrer');
    setOpen(false);
  };

  const handleClick = () => {
    // Sur mobile, on saute le menu : .ics direct (Apple Calendar / Google Calendar
    // selon l'OS, c'est l'OS qui décide quoi ouvrir).
    if (isMobile()) {
      handleICS();
      return;
    }
    setOpen((v) => !v);
  };

  const baseStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'Inter, sans-serif',
    fontWeight: 700,
    transition: 'background 0.2s, transform 0.1s',
  };

  const fullStyle = {
    ...baseStyle,
    width: '100%',
    padding: '11px 14px',
    background: '#e8f7fd',
    color: '#1a8bbf',
    borderRadius: 12,
    fontSize: 13,
  };

  const compactStyle = {
    ...baseStyle,
    padding: '7px 12px',
    background: '#e8f7fd',
    color: '#1a8bbf',
    borderRadius: 999,
    fontSize: 12,
  };

  const buttonStyle = variant === 'compact' ? compactStyle : fullStyle;

  return (
    <div ref={menuRef} style={{ position: 'relative', display: variant === 'compact' ? 'inline-block' : 'block' }} className={className}>
      <button
        type="button"
        onClick={handleClick}
        style={buttonStyle}
        aria-label="Ajouter au calendrier"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Icon name="calendar" size={variant === 'compact' ? 13 : 15} color="#1a8bbf" />
        Ajouter au calendrier
      </button>

      {open && !isMobile() && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 1000,
            background: '#fff',
            border: '1px solid #e5e7eb',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
            padding: 6,
            minWidth: 220,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleGoogle}
            style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: '#1F1F20',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f4f6f8')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 16 }}>📅</span>
            Google Calendar
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleICS}
            style={{
              width: '100%', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 12px', borderRadius: 8,
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: 600, color: '#1F1F20',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = '#f4f6f8')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span style={{ fontSize: 16 }}>📥</span>
            Apple Calendar / Outlook (.ics)
          </button>
        </div>
      )}
    </div>
  );
}
