// src/screens/NewsScreen.js
// Onglet Actualités — affiche les news publiées par l'admin

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icons';

export default function NewsScreen() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [selectedNews, setSelectedNews] = useState(null);
  const [educators, setEducators] = useState([]);

  useEffect(() => {
    setLoadError(null);
    supabase
      .from('news')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) setLoadError('Erreur de chargement. Réessaie plus tard.');
        else if (data) setNews(data);
        setLoading(false);
      });

    // Récupère dynamiquement les éducatrices (rôle admin) au lieu de hardcoder
    supabase
      .from('profiles')
      .select('full_name')
      .eq('role', 'admin')
      .then(({ data }) => {
        if (data && data.length) setEducators(data.map(d => d.full_name).filter(Boolean));
      });
  }, []);


  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'scroll', WebkitOverflowScrolling: 'touch' }} className="screen-content">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px',
      }}>
        <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff', marginBottom: 4 }}>CaniPlus</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 800, color: '#fff' }}>
          <Icon name="bell" size={24} color="#fff" />
          Actualités
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Les dernières nouvelles du club</div>
      </div>

      <div style={{ padding: '20px 16px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>
        )}

        {loadError && (
          <div style={{ background: '#fee2e2', color: '#dc2626', padding: '12px 16px', borderRadius: 12, fontSize: 13, marginBottom: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={18} color="#dc2626" />
            {loadError}
          </div>
        )}

        {!loading && news.length === 0 && (
          <div style={{ padding: '8px 0' }}>
            {/* Message de bienvenue */}
            <div style={{ background: 'linear-gradient(135deg,#e8f7fd,#f0faff)', borderRadius: 20, padding: '24px 20px', marginBottom: 16, borderLeft: '4px solid #2BABE1', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12, display: 'flex', justifyContent: 'center' }}>
                <Icon name="paw" size={44} color="#2BABE1" />
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1F1F20', marginBottom: 8 }}>Bienvenue chez CaniPlus !</div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                Ici tu retrouveras les nouvelles du club — annonces, événements, conseils d'éducation et bien plus. Revenez régulièrement !
              </div>
            </div>
            {/* Infos club */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Icon name="pin" size={16} color="#1F1F20" />
                Le club en bref
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="pin" size={16} color="#9ca3af" />
                  <span style={{ fontSize: 13, color: '#374151' }}>Ballaigues, Vaud (Suisse)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="users" size={16} color="#9ca3af" />
                  <span style={{ fontSize: 13, color: '#374151' }}>Éducatrices : {educators.length ? educators.join(' et ') : 'Tiffany Cotting et Laetitia Erek'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="dog" size={16} color="#9ca3af" />
                  <span style={{ fontSize: 13, color: '#374151' }}>Cours collectifs, privés & théoriques</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Icon name="mail" size={16} color="#9ca3af" />
                  <span style={{ fontSize: 13, color: '#374151' }}>tiffany.poget@gmail.com</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {news.map((item, i) => {
          const isNew = i === 0 && (Date.now() - new Date(item.created_at)) < 7 * 86400000;
          const preview = item.content && item.content.length > 120 ? item.content.slice(0, 120) + '…' : item.content;
          return (
            <div
              key={item.id}
              onClick={() => setSelectedNews(item)}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: '16px 18px',
                marginBottom: 12,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                borderLeft: `4px solid ${i === 0 ? '#2BABE1' : '#e5e7eb'}`,
                cursor: 'pointer',
                transition: 'transform 0.15s',
              }}
            >
              {/* Badge + date */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                {isNew && (
                  <span style={{ background: '#2BABE1', color: '#fff', fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 20 }}>
                    NOUVEAU
                  </span>
                )}
                <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{fmtDate(item.created_at)}</span>
              </div>

              {/* Titre */}
              <div style={{ fontSize: 16, fontWeight: 800, color: '#1F1F20', marginBottom: 8, lineHeight: 1.3 }}>
                {item.title}
              </div>

              {/* Photo (miniature) */}
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: '100%', borderRadius: 12, maxHeight: 180, objectFit: 'cover', marginBottom: 10, display: 'block' }}
                />
              )}

              {/* Aperçu du contenu */}
              {preview && (
                <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>
                  {preview}
                </div>
              )}

              {/* Indicateur "Lire" */}
              {item.content && item.content.length > 120 && (
                <div style={{ fontSize: 12, color: '#2BABE1', fontWeight: 700, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                  Lire la suite <Icon name="arrowRight" size={12} color="#2BABE1" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Modal détail news ── */}
      {selectedNews && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        }} onClick={() => setSelectedNews(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: '#fff', borderRadius: '24px 24px 0 0',
              width: '100%', maxWidth: 430, maxHeight: '85vh',
              display: 'flex', flexDirection: 'column',
              animation: 'slideUp 0.3s ease',
            }}
          >
            {/* Header modal */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '18px 20px 12px', flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600 }}>{fmtDate(selectedNews.created_at)}</span>
              <button onClick={() => setSelectedNews(null)} style={{ background: '#f3f4f6', border: 'none', borderRadius: 999, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <Icon name="close" size={16} color="#6b7280" />
              </button>
            </div>
            {/* Contenu scrollable */}
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '0 20px 32px' }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1F1F20', lineHeight: 1.3, marginBottom: 16 }}>
                {selectedNews.title}
              </div>
              {selectedNews.image_url && (
                <img
                  src={selectedNews.image_url}
                  alt=""
                  style={{ width: '100%', borderRadius: 14, maxHeight: 280, objectFit: 'cover', marginBottom: 16, display: 'block' }}
                />
              )}
              {selectedNews.content && (
                <div style={{ fontSize: 15, color: '#374151', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {selectedNews.content}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }`}</style>
    </div>
  );
}
