// src/screens/NewsScreen.js
// Onglet Actualités — affiche les news publiées par l'admin

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function NewsScreen() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    supabase
      .from('news')
      .select('*')
      .eq('published', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setNews(data);
        setLoading(false);
      });
  }, []);

  const fmtDate = (iso) =>
    new Date(iso).toLocaleDateString('fr-CH', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div style={{ flex: 1, overflowY: 'auto' }} className="screen-content">
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1F1F20 0%, #2a3a4a 100%)',
        padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 28px',
      }}>
        <div style={{ fontFamily: 'Great Vibes, cursive', fontSize: 28, color: '#fff', marginBottom: 4 }}>CaniPlus</div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff' }}>📣 Actualités</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 }}>Les dernières nouvelles du club</div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginTop: 6 }}>👩‍🏫 Éducatrices : Tiffany Cotting &amp; Laetitia Erek</div>
      </div>

      <div style={{ padding: '20px 16px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>
        )}

        {!loading && news.length === 0 && (
          <div style={{ padding: '8px 0' }}>
            {/* Message de bienvenue */}
            <div style={{ background: 'linear-gradient(135deg,#e8f7fd,#f0faff)', borderRadius: 20, padding: '24px 20px', marginBottom: 16, borderLeft: '4px solid #2BABE1', textAlign: 'center' }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🐾</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1F1F20', marginBottom: 8 }}>Bienvenue chez CaniPlus !</div>
              <div style={{ fontSize: 13, color: '#4b5563', lineHeight: 1.6 }}>
                Ici tu retrouveras les nouvelles du club — annonces, événements, conseils d'éducation et bien plus. Revenez régulièrement !
              </div>
            </div>
            {/* Infos club */}
            <div style={{ background: '#fff', borderRadius: 18, padding: '16px 18px', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 800, color: '#1F1F20', marginBottom: 10 }}>📍 Le club en bref</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>📌</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>Ballaigues, Vaud (Suisse)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>👩‍🏫</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>Éducatrices : Tiffany Cotting et Laetitia Erek</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>🐕</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>Cours collectifs, privés & théoriques</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: 16 }}>✉️</span>
                  <span style={{ fontSize: 13, color: '#374151' }}>tiffany.poget@gmail.com</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {news.map((item, i) => {
          const isNew = i === 0 && (Date.now() - new Date(item.created_at)) < 7 * 86400000;
          const isExpanded = expanded === item.id;
          const needsTruncate = item.content && item.content.length > 200;
          return (
            <div
              key={item.id}
              style={{
                background: '#fff',
                borderRadius: 18,
                padding: '16px 18px',
                marginBottom: 12,
                boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
                borderLeft: `4px solid ${i === 0 ? '#2BABE1' : '#e5e7eb'}`,
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

              {/* Photo */}
              {item.image_url && (
                <img
                  src={item.image_url}
                  alt=""
                  style={{ width: '100%', borderRadius: 12, maxHeight: 220, objectFit: 'cover', marginBottom: 10, display: 'block' }}
                />
              )}

              {/* Contenu */}
              {item.content && (
                <div style={{ fontSize: 14, color: '#374151', lineHeight: 1.6 }}>
                  {needsTruncate && !isExpanded
                    ? item.content.slice(0, 200) + '…'
                    : item.content}
                  {needsTruncate && (
                    <span
                      onClick={() => setExpanded(isExpanded ? null : item.id)}
                      style={{ color: '#2BABE1', fontWeight: 700, cursor: 'pointer', marginLeft: 4, fontSize: 13 }}
                    >
                      {isExpanded ? ' Voir moins' : ' Lire la suite'}
                    </span>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
