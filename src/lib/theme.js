// src/lib/theme.js
export const Colors = {
  blue: '#2BABE1',
  blueDark: '#1a8bbf',
  blueLight: '#e8f7fd',
  dark: '#1F1F20',
  darkMid: '#2a3a4a',
  gray: '#6b7280',
  grayLight: '#f4f6f8',
  white: '#ffffff',
  green: '#22c55e',
  greenLight: '#dcfce7',
  greenDark: '#16a34a',
  orange: '#f59e0b',
  orangeLight: '#fef3c7',
  orangeDark: '#d97706',
  red: '#ef4444',
  border: '#e5e7eb',
};

export const categoryConfig = {
  education:       { label: 'Éducation',      icon: 'dog',     color: '#2BABE1', bg: '#e8f7fd' }, // cyan (marque)
  sante:           { label: 'Santé',          icon: 'heart',   color: '#16a34a', bg: '#dcfce7' }, // vert
  comportement:    { label: 'Comportement',   icon: 'sparkle', color: '#7c3aed', bg: '#f5f3ff' }, // violet
  securite:        { label: 'Sécurité',       icon: 'warning', color: '#ea580c', bg: '#ffedd5' }, // orange
  quotidien:       { label: 'Quotidien',      icon: 'clock',   color: '#1d4ed8', bg: '#dbeafe' }, // bleu
  sociabilisation: { label: 'Sociabilisation', icon: 'users',  color: '#db2777', bg: '#fce7f3' }, // rose
  'bien-etre':     { label: 'Bien-être',      icon: 'paw',     color: '#ca8a04', bg: '#fef9c3' }, // ambre
};

export const courseTypeConfig = {
  collectif:  { label: 'Collectif',  color: Colors.blue,   icon: 'users' },
  prive:      { label: 'Privé',      color: Colors.green,  icon: 'star' },
  theorique:  { label: 'Théorique',  color: Colors.orange, icon: 'book' },
  evenement:  { label: 'Événement',  color: '#7c3aed',     icon: 'trophy' },
};
