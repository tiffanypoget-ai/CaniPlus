// src/components/DocumentsModal.js
// Affiche les documents disponibles pour les membres premium (PDFs depuis la table resources)

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from './Icons';

const typeConfig = {
  pdf:     { label: 'PDF',     color: '#dc2626', bg: '#fee2e2', icon: 'fileText' },
  xlsx:    { label: 'EXCEL',   color: '#16a34a', bg: '#dcfce7', icon: 'fileText' },
  video:   { label: 'Vidéo',  color: '#7c3aed', bg: '#ede9fe', icon: 'eye' },
  article: { label: 'Article', color: '#2BABE1', bg: '#e8f7fd', icon: 'fileText' },
};

// Documents officiels statiques (servis depuis public/documents/).
// Pour ajouter un doc : passer available: true et fournir le file_url.
const STATIC_DOCS = [
  {
    id: 'reglement_terrain',
    title: 'Règlement du terrain',
    description: 'Règles de conduite et utilisation du terrain de Ballaigues',
    type: 'pdf',
    icon: 'fileText',
    available: true,
    file_url: '/documents/reglement-terrain.pdf',
  },
  {
    id: 'planning_annuel',
    title: 'Planning annuel',
    description: 'Calendrier des cours et événements de l\'année',
    type: 'xlsx',
    icon: 'calendar',
    available: true,
    file_url: '/documents/planning-annuel.xlsx',
  },
];

export default function DocumentsModal({ onClose }) {
  const [resources, setResources] = useState([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    supabase
      .from('resources')
      .select('*')
      .eq('type', 'pdf')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setResources(data);
        setLoading(false);
      });
  }, []);

  const openDoc = (doc) => {
    if (doc.file_url) window.open(doc.file_url, '_blank');
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, animation: 'fadeIn 0.2s ease' }} />

      <div style={{
        position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)',
        width: '100%', maxWidth: 430, background: '#fff',
        borderRadius: '24px 24px 0 0', zIndex: 201,
        padding: '0 20px calc(32px + env(safe-area-inset-bottom,0px))',
        animation: 'slideUp 0.3s cubic-bezier(0.32,0.72,0,1)',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.15)',
        maxHeight: '85dvh', overflowY: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <div style={{ width: 40, height: 4, borderRadius: 99, background: '#e5e7eb' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 20, position: 'sticky', top: 20, background: '#fff', paddingBottom: 8, zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>
            <Icon name="fileText" size={20} color="#1F1F20" /> Mes documents
          </div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#6b7280', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="close" size={18} color="#6b7280" />
          </button>
        </div>

        {/* Documents officiels (statiques) — masqués si aucun */}
        {STATIC_DOCS.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Documents officiels</div>
        )}
        {STATIC_DOCS.map(doc => {
          const cfg = typeConfig[doc.type] || typeConfig.pdf;
          return (
            <div
              key={doc.id}
              onClick={doc.available && doc.file_url ? () => openDoc(doc) : undefined}
              style={{
                background: doc.available ? '#fff' : '#f4f6f8',
                borderRadius: 14, padding: 14,
                display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                opacity: doc.available ? 1 : 0.55,
                cursor: doc.available && doc.file_url ? 'pointer' : 'default',
                boxShadow: doc.available ? '0 2px 12px rgba(43,171,225,0.08)' : 'none',
              }}
            >
              <div style={{ width: 44, height: 44, background: cfg.bg, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name={doc.icon} size={20} color={cfg.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>{doc.title}</div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{doc.description}</div>
              </div>
              {doc.available
                ? <div style={{ background: cfg.bg, color: cfg.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>{cfg.label}</div>
                : <div style={{ background: '#f4f6f8', color: '#9ca3af', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>Bientôt</div>
              }
            </div>
          );
        })}

        {/* Ressources PDF depuis la base */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: 13 }}>Chargement...</div>
        ) : resources.length === 0 && STATIC_DOCS.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <Icon name="file" size={40} color="#9ca3af" />
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20', marginBottom: 4 }}>Aucun document pour l'instant</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
              Les documents seront bientôt disponibles ici.
            </div>
          </div>
        ) : resources.length > 0 ? (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, margin: '20px 0 10px' }}>Ressources PDF</div>
            {resources.map(r => (
              <div
                key={r.id}
                onClick={() => openDoc(r)}
                style={{
                  background: r.file_url ? '#fff' : '#f4f6f8', borderRadius: 14, padding: 14,
                  display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
                  cursor: r.file_url ? 'pointer' : 'default',
                  boxShadow: r.file_url ? '0 2px 12px rgba(43,171,225,0.08)' : 'none',
                  opacity: r.file_url ? 1 : 0.6,
                }}
              >
                <div style={{ width: 44, height: 44, background: '#fee2e2', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Icon name="fileText" size={20} color="#dc2626" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  {r.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.description}</div>}
                </div>
                {r.file_url
                  ? <span style={{ color: '#2BABE1', fontSize: 18 }}>↗</span>
                  : <div style={{ background: '#f4f6f8', color: '#9ca3af', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8, flexShrink: 0 }}>Bientôt</div>
                }
              </div>
            ))}
          </>
        ) : null}

        <div style={{ textAlign: 'center', fontSize: 12, color: '#9ca3af', marginTop: 20, paddingBottom: 4 }}>
          D'autres documents seront ajoutés prochainement
        </div>
      </div>

      <style>{`
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(100%) } to { transform: translateX(-50%) translateY(0) } }
      `}</style>
    </>
  );
}
