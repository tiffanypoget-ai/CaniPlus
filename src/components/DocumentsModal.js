// src/components/DocumentsModal.js
// Affiche les documents disponibles pour les membres premium (PDFs depuis la table resources)

import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const typeConfig = {
  pdf:     { label: 'PDF',     color: '#dc2626', bg: '#fee2e2', icon: '📄' },
  video:   { label: 'Vidéo',  color: '#7c3aed', bg: '#ede9fe', icon: '🎥' },
  article: { label: 'Article', color: '#2BABE1', bg: '#e8f7fd', icon: '📝' },
};

// Documents officiels statiques — masqués tant qu'ils ne sont pas prêts.
// Pour réactiver : passer available: true et fournir file_url ci-dessous.
const STATIC_DOCS = [];

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
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20' }}>📄 Mes documents</div>
          <button onClick={onClose} style={{ background: '#f4f6f8', border: 'none', borderRadius: 10, width: 34, height: 34, fontSize: 16, cursor: 'pointer', color: '#6b7280' }}>✕</button>
        </div>

        {/* Documents officiels (statiques) — masqués si aucun */}
        {STATIC_DOCS.length > 0 && (
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Documents officiels</div>
        )}
        {STATIC_DOCS.map(doc => (
          <div key={doc.id} style={{
            background: '#f4f6f8', borderRadius: 14, padding: 14,
            display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8,
            opacity: doc.available ? 1 : 0.55,
            cursor: doc.available ? 'pointer' : 'default',
          }}>
            <div style={{ width: 44, height: 44, background: '#fff', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', flexShrink: 0 }}>
              {doc.icon}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20' }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{doc.description}</div>
            </div>
            {doc.available
              ? <div style={{ background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>PDF</div>
              : <div style={{ background: '#f4f6f8', color: '#9ca3af', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>Bientôt</div>
            }
          </div>
        ))}

        {/* Ressources PDF depuis la base */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: '20px 0', color: '#6b7280', fontSize: 13 }}>Chargement...</div>
        ) : resources.length === 0 && STATIC_DOCS.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px 20px' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📂</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#1F1F20', marginBottom: 4 }}>Aucun document pour l'instant</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>
              Tiffany ajoutera bientôt le règlement, l'attestation et les ressources PDF.
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
                <div style={{ width: 44, height: 44, background: '#fee2e2', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>📄</div>
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
