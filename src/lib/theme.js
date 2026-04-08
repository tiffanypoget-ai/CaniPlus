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
  education:    { label: 'Éducation',    emoji: '🐕', color: Colors.blue,    bg: Colors.blueLight },
  sante:        { label: 'Santé',        emoji: '❤️', color: Colors.green,   bg: Colors.greenLight },
  comportement: { label: 'Comportement', emoji: '🧠', color: '#7c3aed',      bg: '#f5f3ff' },
  securite:     { label: 'Sécurité',     emoji: '⚠️', color: Colors.orange,  bg: Colors.orangeLight },
  quotidien:    { label: 'Quotidien',    emoji: '🌿', color: '#0891b2',      bg: '#e0f2fe' },
};

export const courseTypeConfig = {
  collectif:  { label: 'Collectif',  color: Colors.blue,   emoji: '👥' },
  prive:      { label: 'Privé',      color: Colors.green,  emoji: '🎯' },
  theorique:  { label: 'Théorique',  color: Colors.orange, emoji: '📖' },
  evenement:  { label: 'Événement',  color: '#7c3aed',     emoji: '🎉' },
};
