// src/components/PaywallScreen.js
// Affiché à la place du contenu premium si l'utilisateur n'est pas abonné

import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import Icon from './Icons';

const INCLUS = [
  { icon: 'book', text: 'Toutes les fiches pédagogiques' },
  { icon: 'eye', text: 'Vidéos de formation (éducation, comportement…)' },
  { icon: 'fileText', text: 'Documents officiels & attestations' },
  { icon: 'sparkle', text: 'Nouveau contenu ajouté chaque mois' },
];

export default function PaywallScreen({ title = 'Ressources', icon = 'book' }) {
  const { profile } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubscribe = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-checkout', {
        body: {
          type: 'premium_mensuel',
          user_id: profile.id,
          user_email: profile.email,
        },
      });
      if (fnError) throw fnError;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        throw new Error('Lien de paiement non reçu');
      }
    } catch (e) {
      setError('Erreur de connexion. Réessaie dans quelques secondes.');
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header flouté */}
      <div style={{ background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)', padding: 'calc(env(safe-area-inset-top,0px) + 20px) 24px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 800, color: '#fff' }}>
          <Icon name={typeof icon === 'string' && icon.length === 1 ? 'book' : icon} size={24} color="#fff" /> {title}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Contenu exclusif membres premium</div>
      </div>

      {/* Corps */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }} className="screen-content">

        {/* Badge cadenas */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{
            width: 80, height: 80, borderRadius: '50%',
            background: 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
            boxShadow: '0 8px 32px rgba(43,171,225,0.3)',
          }}>
            <Icon name="lock" size={40} color="#fff" />
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#1F1F20', marginBottom: 6 }}>
            Contenu réservé aux membres premium
          </div>
          <div style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.5 }}>
            Accède à tous les documents, vidéos et fiches pédagogiques
            pour seulement CHF 10 par mois.
          </div>
        </div>

        {/* Ce qui est inclus */}
        <div style={{ background: '#f4f6f8', borderRadius: 20, padding: '16px 18px', marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Ce qui est inclus
          </div>
          {INCLUS.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < INCLUS.length - 1 ? 10 : 0 }}>
              <div style={{ width: 36, height: 36, background: '#fff', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <Icon name={item.icon} size={18} color="#2BABE1" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#1F1F20' }}>{item.text}</div>
              <span style={{ marginLeft: 'auto', color: '#16a34a' }}>
                <Icon name="check" size={18} color="#16a34a" />
              </span>
            </div>
          ))}
        </div>

        {/* Prix */}
        <div style={{
          background: 'linear-gradient(135deg, #1F1F20, #2a3a4a)',
          borderRadius: 20, padding: 20, marginBottom: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Abonnement mensuel</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>
              CHF 10<span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>/mois</span>
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>Résiliable à tout moment</div>
          </div>
          <Icon name="paw" size={40} color="#fff" />
        </div>

        {/* Erreur */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#dc2626', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="warning" size={16} color="#dc2626" /> {error}
          </div>
        )}

        {/* Bouton s'abonner */}
        <button
          onClick={handleSubscribe}
          disabled={loading}
          style={{
            width: '100%',
            background: loading ? '#93c5fd' : 'linear-gradient(135deg,#2BABE1,#1a8bbf)',
            color: '#fff', border: 'none', borderRadius: 16, padding: '16px 24px',
            fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: loading ? 'none' : '0 4px 16px rgba(43,171,225,0.35)',
            marginBottom: 12,
          }}
        >
          {loading ? (
            <>
              <div style={{ width: 18, height: 18, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
              Connexion au paiement...
            </>
          ) : (
            <><Icon name="sparkle" size={18} color="#fff" /> S'abonner pour CHF 10/mois</>
          )}
        </button>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 20 }}>
          {[
            { icon: 'lock', text: 'Sécurisé' },
            { icon: 'creditCard', text: 'Carte & TWINT' },
            { icon: 'arrowLeft', text: 'Résiliable' }
          ].map(b => (
            <div key={b.text} style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Icon name={b.icon} size={12} color="#9ca3af" /> {b.text}
            </div>
          ))}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}
