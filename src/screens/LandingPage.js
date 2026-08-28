// src/screens/LandingPage.js
// Page d'accueil publique de l'app, affichée au visiteur non connecté.
//
// Volontairement réduite à un hero. Cette page était une copie de la page
// d'accueil de caniplus.ch, et elle divergeait à chaque changement de contenu :
// tarifs, FAQ, descriptions des prestations, et jusqu'à des témoignages
// inventés là où le site montre de vrais avis Google. Deux vitrines à tenir à
// jour dans deux langages (HTML statique d'un côté, JSX de l'autre), pour une
// page qui ne sert qu'aux visiteurs non connectés arrivant sur app.caniplus.ch.
//
// Le site fait ce travail, en mieux et avec le référencement. Ici on présente
// la promesse et on envoie vers l'un ou l'autre : le site, ou l'espace membre.
//
// ⚠️ Ne pas réintroduire de contenu marketing ici (tarifs, prestations, FAQ,
// témoignages). Toute nouveauté se fait sur site-vitrine/, qui est la source.

import { useEffect } from 'react';
import { CLUB_ENABLED } from '../lib/features';
import './LandingPage.css';

const SITE_URL = 'https://caniplus.ch';

export default function LandingPage({ onLogin }) {
  // Passe en mode pleine largeur (désactive le max-width 430px du #root)
  useEffect(() => {
    document.body.classList.add('landing-mode');
    return () => document.body.classList.remove('landing-mode');
  }, []);

  return (
    <div className="landing landing-compact">

      {/* ── BARRE ── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a href={SITE_URL} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/images/logo-caniplus.png"
              alt="CaniPlus"
              className="lp-logo-img"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
            />
            <span className="lp-logo-fallback">Cani<span>Plus</span></span>
          </a>

          <button className="lp-btn lp-btn-primary" onClick={onLogin}>Mon espace</button>
        </div>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero">
        <div className="lp-container lp-hero-grid">
          <div>
            <span className="lp-hero-eyebrow">Éducation canine · Comportement &amp; Rééducation · Ballaigues</span>
            <h1>Une relation <em>harmonieuse</em><br />entre toi et ton chien</h1>
            <p className="lp-lead">
              {CLUB_ENABLED
                ? <>Éducation canine bienveillante avec une spécialisation en comportement et rééducation.
                  Cours privés, collectifs et théoriques au cœur du Canton de Vaud,
                  du chiot curieux au chien en difficulté.</>
                : <>Éducation canine bienveillante avec une spécialisation en comportement et rééducation.
                  Cours privés à domicile, coaching et contenus en ligne,
                  du chiot curieux au chien en difficulté.</>}
            </p>
            <div className="lp-hero-cta">
              <a href={SITE_URL} target="_blank" rel="noopener noreferrer" className="lp-btn lp-btn-primary">
                Voir tout sur caniplus.ch
              </a>
              <button className="lp-btn lp-btn-outline" onClick={onLogin}>Mon espace</button>
            </div>
            <p className="lp-hero-note">
              Les cours, les tarifs, les Soirées CaniPlus et le blog sont sur le site.
              Ton suivi, tes fiches et tes rendez-vous sont dans ton espace.
            </p>
            <div className="lp-trust-row">
              <div className="lp-trust-item"><div className="dot" />Union Canine Suisse</div>
              <div className="lp-trust-item"><div className="dot" />CANISCIENTA</div>
              <div className="lp-trust-item"><div className="dot" />Canton de Vaud</div>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div className="circle" aria-hidden="true" />
            <div className="photo-placeholder">
              <img
                src="/images/photo-rencontre-chiens.jpg"
                alt="Présentation en douceur entre un grand chien adulte et un chiot en laisse, lors d'un cours CaniPlus à Ballaigues"
                width="1200"
                height="1200"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── PIED DE PAGE ── */}
      <footer className="lp-footer">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-footer-logo">Cani<span>Plus</span></div>
              <p className="lp-footer-about">
                Éducation canine bienveillante à Ballaigues, Canton de Vaud.
                Accompagnement personnalisé pour tisser une relation harmonieuse
                avec ton chien.
              </p>
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                <li><a href="mailto:info@caniplus.ch">info@caniplus.ch</a></li>
                <li><a href="https://wa.me/41791238939" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
                <li><a href="https://www.instagram.com/caniplus_ch" target="_blank" rel="noopener noreferrer">Instagram</a></li>
              </ul>
            </div>
            <div>
              <h4>Le site</h4>
              <ul>
                <li><a href={SITE_URL} target="_blank" rel="noopener noreferrer">Cours et tarifs</a></li>
                <li><a href={`${SITE_URL}/legal/mentions-legales`} target="_blank" rel="noopener noreferrer">Mentions légales</a></li>
                <li><a href={`${SITE_URL}/legal/politique-confidentialite`} target="_blank" rel="noopener noreferrer">Confidentialité</a></li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            © 2026 CaniPlus · Tiffany Cotting · Ballaigues, Canton de Vaud
          </div>
        </div>
      </footer>
    </div>
  );
}
