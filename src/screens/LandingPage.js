// src/screens/LandingPage.js
// Site vitrine CaniPlus — affiché quand le visiteur n'est pas connecté
import { useState, useCallback, useEffect, useRef } from 'react';
import './LandingPage.css';

const SECTIONS = ['accueil', 'approche', 'prestations', 'apropos', 'evenements', 'contact'];

const TEMOIGNAGES = [
  { nom: 'Sophie & Luna', texte: 'Grâce à Tiffany, Luna a complètement changé de comportement en promenade. En quelques séances, elle ne tire plus et reste calme face aux autres chiens. Un vrai miracle !' },
  { nom: 'Marc & Filou', texte: 'Les cours collectifs sont top ! Filou adore y aller et moi aussi. L\'ambiance est bienveillante, on apprend à chaque séance et les progrès sont concrets.' },
  { nom: 'Nadia & Rex', texte: 'Rex était réactif et anxieux, on ne pouvait plus aller nulle part. Après le bilan comportemental et le suivi personnalisé, c\'est un autre chien. Merci CaniPlus !' },
  { nom: 'Pierre & Mila', texte: 'Mila est notre première chienne et on était un peu perdus. Les cours théoriques nous ont donné les bases pour bien l\'éduquer dès le départ. Je recommande à 100%.' },
];

const FAQ_ITEMS = [
  { q: 'À partir de quel âge puis-je inscrire mon chien ?', r: 'Dès 3 mois pour les cours collectifs chiots. Les cours privés sont possibles à tout âge, y compris pour les chiens adultes qui ont besoin de rééducation.' },
  { q: 'Où se déroulent les cours ?', r: 'Les cours collectifs et théoriques ont lieu à Ballaigues (VD). Les cours privés peuvent se faire sur notre terrain, à votre domicile ou dans l\'environnement qui pose problème à votre chien.' },
  { q: 'Mon chien est réactif/agressif, est-ce que vous pouvez m\'aider ?', r: 'Absolument. C\'est notre spécialité. Tiffany est diplômée en comportement et rééducation canine. Un bilan comportemental permet d\'établir un plan adapté à votre situation.' },
  { q: 'Comment fonctionne la cotisation annuelle ?', r: 'La cotisation est de 150 CHF par an et par chien. Elle vous donne accès à un cours collectif par semaine, toute l\'année.' },
  { q: 'Faut-il que mon chien soit vacciné ?', r: 'Oui, la vaccination à jour est recommandée pour la sécurité de tous les chiens du groupe. Nous vous demandons de fournir le carnet de vaccination lors de l\'inscription.' },
  { q: 'Comment réserver un cours privé ?', r: 'Contactez-nous par email ou via l\'espace membre de l\'application. Nous conviendrons ensemble d\'un créneau adapté à votre emploi du temps.' },
];

export default function LandingPage({ onLogin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeSection, setActiveSection] = useState('accueil');
  const [openFaq, setOpenFaq] = useState(null);

  // Passe en mode pleine largeur (désactive max-width 430px du #root)
  useEffect(() => {
    document.body.classList.add('landing-mode');
    return () => document.body.classList.remove('landing-mode');
  }, []);

  // Scroll spy : détecter la section visible
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: '-40% 0px -55% 0px' }
    );
    SECTIONS.forEach(id => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const toggleMenu = useCallback(() => setMenuOpen(o => !o), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Bloque le scroll du body quand le menu mobile est ouvert
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  const scrollTo = (id) => {
    closeMenu();
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="landing">

      {/* ── NAVBAR ── */}
      <header className="lp-nav">
        <div className="lp-nav-inner">
          <a href="#accueil" onClick={() => scrollTo('accueil')} style={{ display: 'flex', alignItems: 'center' }}>
            <img
              src="/images/logo-caniplus.png"
              alt="CaniPlus"
              className="lp-logo-img"
              onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'block'; }}
            />
            <span className="lp-logo-fallback">Cani<span>Plus</span></span>
          </a>

          {/* Desktop nav */}
          <nav className="lp-nav-desktop">
            <ul className="lp-nav-links">
              {SECTIONS.map(id => (
                <li key={id}>
                  <a href={'#' + id} className={activeSection === id ? 'active' : ''} onClick={() => scrollTo(id)}>
                    {id === 'accueil' ? 'Accueil' : id === 'approche' ? 'Approche' : id === 'prestations' ? 'Prestations' : id === 'apropos' ? 'À propos' : id === 'evenements' ? 'Événements' : 'Contact'}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <button className="lp-btn lp-btn-primary" onClick={onLogin}>Espace membre</button>

          <button className={`lp-menu-toggle${menuOpen ? ' open' : ''}`} onClick={toggleMenu} aria-label="Menu">
            <span /><span /><span />
          </button>
        </div>

        {/* Mobile overlay + menu */}
        {menuOpen && <div className="lp-overlay" onClick={closeMenu} />}
        <nav className={`lp-nav-menu${menuOpen ? ' open' : ''}`}>
          <ul className="lp-nav-links">
            <li><a href="#accueil" onClick={() => scrollTo('accueil')}>Accueil</a></li>
            <li><a href="#approche" onClick={() => scrollTo('approche')}>Approche</a></li>
            <li><a href="#prestations" onClick={() => scrollTo('prestations')}>Prestations</a></li>
            <li><a href="#apropos" onClick={() => scrollTo('apropos')}>À propos</a></li>
            <li><a href="#evenements" onClick={() => scrollTo('evenements')}>Événements</a></li>
            <li><a href="#contact" onClick={() => scrollTo('contact')}>Contact</a></li>
          </ul>
        </nav>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero" id="accueil">
        <div className="lp-container lp-hero-grid">
          <div>
            <span className="lp-hero-eyebrow">Éducation canine · Comportement &amp; Rééducation · Ballaigues</span>
            <h1>Une relation <em>harmonieuse</em><br />entre vous et votre chien</h1>
            <p className="lp-lead">
              Éducation canine bienveillante avec une spécialisation en comportement et rééducation.
              Cours privés, collectifs et théoriques au cœur du Canton de Vaud —
              du chiot curieux au chien en difficulté.
            </p>
            <div className="lp-hero-cta">
              <a href="#prestations" className="lp-btn lp-btn-primary" onClick={() => scrollTo('prestations')}>Découvrir nos cours</a>
              <a href="#contact" className="lp-btn lp-btn-outline" onClick={() => scrollTo('contact')}>Prendre contact</a>
            </div>
            <div className="lp-trust-row">
              <div className="lp-trust-item"><div className="dot" />Union Canine Suisse</div>
              <div className="lp-trust-item"><div className="dot" />CANISCIENTA</div>
              <div className="lp-trust-item"><div className="dot" />Canton de Vaud</div>
            </div>
          </div>
          <div className="lp-hero-visual">
            <div className="circle" />
            <div className="photo-placeholder" />
          </div>
        </div>
      </section>

      {/* ── APPROCHE ── */}
      <section className="lp-section lp-approche" id="approche">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Notre philosophie</span>
            <h2>Trois valeurs qui guident chaque séance</h2>
            <p>Chaque duo maître-chien est unique. Notre approche s'adapte à vos besoins, à votre rythme et à la personnalité de votre compagnon.</p>
          </div>
          <div className="lp-pillars">
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <h3>Confiance</h3>
              <p>Nous construisons une relation positive entre vous et votre chien, sans contrainte ni force, en valorisant chaque progrès.</p>
            </div>
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </div>
              <h3>Compréhension</h3>
              <p>Décoder le langage canin pour mieux communiquer. Comprendre le comportement de votre chien, c'est la clé de tout apprentissage durable.</p>
            </div>
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3>Respect du rythme</h3>
              <p>Chaque chien apprend à sa vitesse. Nous adaptons les exercices au tempérament et aux capacités de votre compagnon.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRESTATIONS ── */}
      <section className="lp-section" id="prestations">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Nos prestations</span>
            <h2>Des cours adaptés à chaque duo</h2>
            <p>Du chiot curieux au chien qui a besoin de rééducation, nous proposons un accompagnement sur mesure.</p>
          </div>
          <div className="lp-prestations-grid">

            <div className="lp-prestation">
              <span className="lp-prestation-tag">Comportement &amp; Rééducation</span>
              <h3>Cours privés</h3>
              <p className="lp-desc">Séance individuelle avec une éducatrice spécialisée en comportement canin. Agressivité, réactivité, anxiété, peurs, obéissance : chaque problème a une solution adaptée.</p>
              <ul className="lp-prestation-features">
                <li>Spécialisation comportement &amp; rééducation</li>
                <li>Bilan comportemental inclus</li>
                <li>Lieu adapté à votre situation</li>
                <li>Programme sur mesure</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">60 CHF</span>
                <span className="lp-price-unit">/ heure</span>
              </div>
            </div>

            <div className="lp-prestation">
              <span className="lp-prestation-tag">En groupe</span>
              <h3>Cours collectifs</h3>
              <p className="lp-desc">Pour les chiens et chiots : socialisation, obéissance de base et plaisir d'apprendre ensemble dans un cadre bienveillant à Ballaigues.</p>
              <ul className="lp-prestation-features">
                <li>Chiens et chiots bienvenus</li>
                <li>Groupes à taille humaine</li>
                <li>Socialisation encadrée</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">150 CHF</span>
                <span className="lp-price-unit">/ année / chien</span>
              </div>
            </div>

            <div className="lp-prestation">
              <span className="lp-prestation-tag">Théorique</span>
              <h3>Cours théoriques</h3>
              <p className="lp-desc">Comprendre le comportement canin, la communication, l'éducation positive. Des bases solides pour mieux vivre avec votre chien au quotidien.</p>
              <ul className="lp-prestation-features">
                <li>Formation théorique complète</li>
                <li>Supports de cours inclus</li>
                <li>Questions / réponses personnalisées</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">Sur demande</span>
                <span className="lp-price-unit">selon la durée</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── EQUIPE ── */}
      <section className="lp-section lp-apropos" id="apropos">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Notre équipe</span>
            <h2>Deux éducatrices à vos côtés</h2>
            <p>Passionnées, bienveillantes et diplômées, nous vous accompagnons avec la même philosophie : construire une relation de confiance entre vous et votre chien.</p>
          </div>
          <div className="lp-team-grid">

            <div className="lp-team-card">
              <div className="lp-team-photo tiffany" />
              <div className="lp-team-info">
                <div className="lp-team-name">Tiffany Cotting</div>
                <div className="lp-team-role">Éducatrice canine · Spécialiste comportement &amp; rééducation</div>
                <div className="lp-team-quote">
                  « Passionnée par le bien-être animal, j'accompagne les propriétaires et leurs chiens
                  vers une relation harmonieuse, basée sur la confiance, la compréhension et le respect
                  du rythme de chacun. »
                </div>
                <ul className="lp-team-qualifs">
                  <li>Expert en Comportement &amp; Rééducation canine — CANISCIENTIA (profil 2)</li>
                  <li>Diplôme instructrice canine — Union Canine Suisse (profil 1+)</li>
                  <li>Formatrice Brevet National de Propriétaire de Chien</li>
                  <li>Formations complémentaires (refuge, chien sourd, premiers secours)</li>
                </ul>
              </div>
            </div>

            <div className="lp-team-card">
              <div className="lp-team-photo laetitia" />
              <div className="lp-team-info">
                <div className="lp-team-name">Laetitia Erek</div>
                <div className="lp-team-role">Éducatrice canine</div>
                <div className="lp-team-quote">
                  « Curieuse, dynamique et bienveillante, je suis captivée par l'univers et les
                  comportements canins. Mon plaisir : transmettre cette passion aux propriétaires
                  et construire avec eux une belle complicité avec leur chien. »
                </div>
                <ul className="lp-team-qualifs">
                  <li>Diplôme instructrice canine — Union Canine Suisse (profil 1+)</li>
                  <li>Expérience en animalerie — connaissance approfondie des chiens</li>
                  <li>Approche bienveillante et positive</li>
                  <li>Maman de 3 enfants — sens de l'écoute et de la patience</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── EVENEMENTS ── */}
      <section className="lp-section" id="evenements">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Nos événements</span>
            <h2>Partagez des moments uniques avec votre chien</h2>
            <p>Tout au long de l'année, CaniPlus organise des rendez-vous conviviaux pour renforcer votre complicité et rencontrer d'autres passionnés.</p>
          </div>
          <div className="lp-rallye-cta">
            <div>
              <span className="lp-rallye-date">Événement phare</span>
              <h2>Rallye canin CaniPlus</h2>
              <p>Un parcours ludique et sportif en pleine nature vaudoise pour partager votre complicité avec votre chien. Ouvert à tous les niveaux, dans une ambiance conviviale et bienveillante.</p>
              <a href="#contact" className="lp-btn lp-btn-primary" onClick={() => scrollTo('contact')}>Être informé·e</a>
            </div>
            <div className="lp-rallye-trophy" style={{ fontSize: 120, textAlign: 'center', opacity: 0.9 }} aria-hidden="true">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#2babe1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2h10v-2c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34M18 2H6v7a6 6 0 1012 0V2z"/></svg>
            </div>
          </div>
        </div>
      </section>

      {/* ── TÉMOIGNAGES ── */}
      <section className="lp-section lp-temoignages">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Témoignages</span>
            <h2>Ce que nos membres disent de nous</h2>
            <p>La meilleure preuve de notre approche, ce sont les résultats concrets de nos élèves à quatre pattes.</p>
          </div>
          <div className="lp-temoignages-grid">
            {TEMOIGNAGES.map((t, i) => (
              <div className="lp-temoignage-card" key={i}>
                <div className="lp-temoignage-stars">{'★ ★ ★ ★ ★'}</div>
                <p className="lp-temoignage-texte">{t.texte}</p>
                <div className="lp-temoignage-nom">{t.nom}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="lp-section" id="faq">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Questions fréquentes</span>
            <h2>Tout ce que vous devez savoir</h2>
            <p>Vous avez une question ? Voici les réponses aux demandes les plus courantes.</p>
          </div>
          <div className="lp-faq-list">
            {FAQ_ITEMS.map((item, i) => (
              <div className={'lp-faq-item' + (openFaq === i ? ' open' : '')} key={i}>
                <button className="lp-faq-question" onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                  <span>{item.q}</span>
                  <svg className="lp-faq-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div className="lp-faq-answer">
                  <p>{item.r}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── APP CTA ── */}
      <section className="lp-section lp-app-section">
        <div className="lp-container lp-app-grid">
          <div className="lp-app-content">
            <span className="lp-section-eyebrow">Espace membre</span>
            <h2>Votre app CaniPlus, partout avec vous</h2>
            <p>
              Suivez les progrès de votre chien, gérez vos inscriptions aux cours, accédez
              à vos ressources personnalisées — sur votre ordinateur comme sur votre téléphone.
            </p>
            <ul className="lp-app-features">
              <li>Suivi personnalisé de votre chien</li>
              <li>Inscriptions aux cours en un clic</li>
              <li>Disponible sur ordinateur, tablette et mobile</li>
              <li>Vos données toujours à jour, partout</li>
            </ul>
            <button className="lp-btn lp-btn-primary" onClick={onLogin}>Accéder à mon espace</button>
          </div>
          <div className="lp-app-visual">
            <div className="lp-phone-mockup">CaniPlus</div>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" id="contact">
        <div className="lp-container">
          <div className="lp-footer-grid">
            <div>
              <div className="lp-footer-logo">Cani<span>Plus</span></div>
              <p className="lp-footer-about">
                Éducation canine bienveillante à Ballaigues, Canton de Vaud.
                Accompagnement personnalisé pour tisser une relation harmonieuse
                avec votre chien.
              </p>
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                <li>Ballaigues, VD</li>
                <li><a href="mailto:info@caniplus.ch">info@caniplus.ch</a></li>
              </ul>
            </div>
            <div>
              <h4>Liens rapides</h4>
              <ul>
                <li><a href="#prestations" onClick={() => scrollTo('prestations')}>Prestations</a></li>
                <li><a href="#apropos" onClick={() => scrollTo('apropos')}>À propos</a></li>
                <li><a href="#evenements" onClick={() => scrollTo('evenements')}>Événements</a></li>
                <li><a href="#" onClick={(e) => { e.preventDefault(); onLogin(); }}>Espace membre</a></li>
              </ul>
            </div>
            <div>
              <h4>Suivez-nous</h4>
              <ul>
                <li>
                  <a href="https://www.facebook.com/CaniPlus" target="_blank" rel="noopener noreferrer">
                    Facebook
                  </a>
                </li>
                <li>
                  <a href="https://www.instagram.com/caniplus_ch" target="_blank" rel="noopener noreferrer">
                    Instagram
                  </a>
                </li>
                <li>
                  <a href="https://www.youtube.com/@CaniPlusBallaigues" target="_blank" rel="noopener noreferrer">
                    YouTube
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="lp-footer-bottom">
            © 2026 CaniPlus · Tiffany Cotting · Ballaigues, Suisse · Tous droits réservés
          </div>
        </div>
      </footer>
    </div>
  );
}
