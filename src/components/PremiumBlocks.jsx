// src/components/PremiumBlocks.jsx
// Rendu visuel des blocs d'une ressource premium (format texte CaniPlus).
//
// Extrait de RessourcesScreen le 16.08.2026 : utilise a la fois par l'app
// (modale de lecture) et par l'apercu de l'editeur de bundle admin, pour que
// Tiffany relise exactement ce que les membres verront.

import Icon from './Icons';
import { toSentenceCase } from '../lib/premiumContent';

export default function PremiumBlocks({ blocks, accentColor = '#2BABE1', accentBg = '#e8f7fd' }) {
  return (
    <>
      {blocks.map((block, idx) => {
        const prev = blocks[idx - 1];
        const topMargin = (block.type === 'heading' || block.type === 'warning-heading')
          ? (idx === 0 ? 0 : 28)
          : block.type === 'subheading' ? 16
          : 0;

        if (block.type === 'heading') {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: topMargin, marginBottom: 14 }}>
              {block.number ? (
                <div style={{ width: 30, height: 30, borderRadius: 10, background: accentBg, color: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, flexShrink: 0 }}>
                  {block.number}
                </div>
              ) : (
                <div style={{ width: 5, height: 22, borderRadius: 3, background: accentColor, flexShrink: 0 }} />
              )}
              <div style={{ fontSize: 17, fontWeight: 800, color: '#1F1F20', lineHeight: 1.3 }}>
                {toSentenceCase(block.text)}
              </div>
            </div>
          );
        }

        if (block.type === 'subheading') {
          return (
            <div key={idx} style={{ fontSize: 14, fontWeight: 800, color: accentColor, marginTop: topMargin, marginBottom: 8, letterSpacing: 0.2 }}>
              {block.text}
            </div>
          );
        }

        if (block.type === 'tip') {
          return (
            <div key={idx} style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', border: '1px solid #bbf7d0', borderRadius: 16, padding: '14px 16px', marginTop: 18, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon name="sparkle" size={16} color="#16a34a" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#16a34a', marginBottom: 4, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  Astuce CaniPlus
                </div>
                <div style={{ fontSize: 14, color: '#166534', lineHeight: 1.65 }}>
                  {block.text}
                </div>
              </div>
            </div>
          );
        }

        if (block.type === 'warning-heading') {
          return (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 24, marginBottom: 10, padding: '10px 14px', background: '#fff7ed', borderLeft: '4px solid #f59e0b', borderRadius: '0 10px 10px 0' }}>
              <Icon name="warning" size={16} color="#d97706" />
              <div style={{ fontSize: 14, fontWeight: 800, color: '#b45309', letterSpacing: 0.3 }}>
                {toSentenceCase(block.text)}
              </div>
            </div>
          );
        }

        if (block.type === 'warning-text') {
          return (
            <p key={idx} style={{ fontSize: 14.5, lineHeight: 1.75, color: '#78350f', margin: '0 0 10px', paddingLeft: 4 }}>
              {block.text}
            </p>
          );
        }

        if (block.type === 'warning-list') {
          return (
            <div key={idx} style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {block.items.map((item, ii) => (
                <div key={ii} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', paddingLeft: 4 }}>
                  <div style={{ color: '#d97706', fontWeight: 800, flexShrink: 0, marginTop: 1 }}>✕</div>
                  <div style={{ fontSize: 14, color: '#78350f', lineHeight: 1.6 }}>{item}</div>
                </div>
              ))}
            </div>
          );
        }

        if (block.type === 'steps') {
          return (
            <div key={idx} style={{ marginTop: 12, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {block.items.map((step, si) => (
                <div key={si} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fafafa', borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', background: accentColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 800, boxShadow: `0 2px 6px ${accentColor}44` }}>
                    {si + 1}
                  </div>
                  <div style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.65, paddingTop: 4 }}>
                    {step}
                  </div>
                </div>
              ))}
            </div>
          );
        }

        if (block.type === 'bullets') {
          return (
            <div key={idx} style={{ marginTop: 10, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 8, paddingLeft: 2 }}>
              {block.items.map((item, bi) => (
                <div key={bi}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: accentColor, flexShrink: 0, marginTop: 9 }} />
                    <div style={{ fontSize: 14.5, color: '#334155', lineHeight: 1.7, flex: 1 }}>
                      {item.text}
                    </div>
                  </div>
                  {item.subs && item.subs.length > 0 && (
                    <div style={{ marginLeft: 19, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      {item.subs.map((s, si) => (
                        <div key={si} style={{ fontSize: 13.5, color: '#64748b', lineHeight: 1.6, fontStyle: 'italic', paddingLeft: 10, borderLeft: `2px solid ${accentBg}` }}>
                          {s}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        }

        if (block.type === 'arrow') {
          return (
            <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4, marginBottom: 8, paddingLeft: 4 }}>
              <div style={{ color: accentColor, fontWeight: 800, fontSize: 14, flexShrink: 0, lineHeight: 1.6 }}>→</div>
              <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.65, fontStyle: 'italic' }}>
                {block.text}
              </div>
            </div>
          );
        }

        // Paragraph
        return (
          <p key={idx} style={{ fontSize: 15, lineHeight: 1.75, color: '#374151', margin: prev && prev.type === 'paragraph' ? '0 0 14px' : '8px 0 14px' }}>
            {block.text}
          </p>
        );
      })}
    </>
  );
}
