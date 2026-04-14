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
      </div>

      <div style={{ padding: '20px 16px 80px' }}>
        {loading && (
          <div style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>Chargement…</div>
        )}

        {!loading && news.length === 0 && (
          <div style={{ textAlign: 'center', padding: 48 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📣</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#1F1F20', marginBottom: 6 }}>Pas encore d'actualité</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>Les nouvelles du club apparaîtront ici.</div>
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
