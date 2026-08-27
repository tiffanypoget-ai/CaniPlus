// src/screens/LandingPage.js
// Site vitrine CaniPlus — affiché quand le visiteur n'est pas connecté
import { useState, useCallback, useEffect, useRef } from 'react';
import { cotisationPrix, cotisationDescription } from '../lib/tarifs';
import { CLUB_ENABLED, CLUB_PLANNING_ENABLED } from '../lib/features';
import './LandingPage.css';

// La section Événements (rallye canin, vie du club) n'apparaît que si le
// flag club est actif.
const SECTIONS = CLUB_ENABLED
  ? ['accueil', 'approche', 'prestations', 'apropos', 'evenements', 'contact']
  : ['accueil', 'approche', 'prestations', 'apropos', 'contact'];

// Témoignages mentionnant les cours collectifs/théoriques (offre club) :
// masqués quand le flag club est désactivé.
const TEMOIGNAGES = [
  { nom: 'Sophie & Luna', texte: 'Grâce à Tiffany, Luna a complètement changé de comportement en promenade. En quelques séances, elle ne tire plus et reste calme face aux autres chiens. Un vrai miracle !' },
  ...(CLUB_ENABLED ? [{ nom: 'Marc & Filou', texte: 'Les cours collectifs sont top ! Filou adore y aller et moi aussi. L\'ambiance est bienveillante, on apprend à chaque séance et les progrès sont concrets.' }] : []),
  { nom: 'Nadia & Rex', texte: 'Rex était réactif et anxieux, on ne pouvait plus aller nulle part. Après le bilan comportemental et le suivi personnalisé, c\'est un autre chien. Merci CaniPlus !' },
  ...(CLUB_ENABLED ? [{ nom: 'Pierre & Mila', texte: 'Mila est notre première chienne et on était un peu perdus. Les cours théoriques nous ont donné les bases pour bien l\'éduquer dès le départ. Je recommande à 100%.' }] : []),
];

// FAQ : les questions cours collectifs / lieu des cours / cotisation sont
// propres au club et masquées quand le flag est désactivé.
const FAQ_ITEMS = [
  ...(CLUB_ENABLED ? [
    { q: 'À partir de quel âge puis-je inscrire mon chien ?', r: 'Les cours collectifs sont ouverts à tous les chiens, tous âges et gabarits confondus : les chiots sont les bienvenus dès que leurs vaccins sont à jour. Les cours privés sont possibles à tout âge, y compris pour les chiens adultes qui ont besoin de rééducation.' },
    { q: 'Où se déroulent les cours ?', r: 'Les cours collectifs et théoriques ont lieu à Ballaigues (VD). Les cours privés peuvent se faire sur notre terrain, à ton domicile ou dans l\'environnement qui pose problème à ton chien.', links: [{ label: 'Terrain CaniPlus', url: 'https://www.google.com/maps/place/CaniPlus/@46.7348123,6.3820581,15z' }, { label: 'Lieu des cours', url: 'https://www.google.com/maps/search/46.729372,+6.413648' }] },
  ] : [
    { q: 'À partir de quel âge puis-je commencer avec mon chien ?', r: 'Dès 3 mois ! Les cours privés sont possibles à tout âge, du chiot au chien adulte, y compris pour la rééducation comportementale.' },
    { q: 'Où se déroulent les cours privés ?', r: 'À ton domicile ou dans l\'environnement qui pose problème à ton chien, partout en Suisse romande. Le coaching à distance en visio est aussi possible.' },
  ]),
  { q: 'Mon chien est réactif/agressif, est-ce que tu peux m\'aider ?', r: 'Oui, c\'est ma spécialité : je suis diplômée en comportement et rééducation canine. Un bilan comportemental permet d\'établir un plan adapté à ta situation.' },
  ...(CLUB_ENABLED ? [
    { q: 'Comment fonctionne la cotisation annuelle ?', r: `La cotisation est de ${cotisationDescription()}. Elle te donne accès à un cours collectif par semaine, toute l'année.` },
    { q: 'Faut-il que mon chien soit vacciné ?', r: 'Oui, les vaccins doivent être à jour pour la sécurité de tous les chiens du groupe. Une assurance responsabilité civile privée est également obligatoire en Suisse pour les détenteurs de chiens.' },
  ] : [
    { q: 'Faut-il que mon chien soit vacciné ?', r: 'Une vaccination à jour est recommandée pour sa santé. Dans l\'application, tu peux suivre les vaccins de ton chien et recevoir des rappels.' },
  ]),
  { q: 'Comment réserver un cours privé ?', r: 'Écris-nous par email ou passe par ton espace membre dans l\'application. On fixe ensemble un créneau qui colle à ton emploi du temps.' },
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

          <button className="lp-btn lp-btn-primary" onClick={onLogin}>Mon espace</button>

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
            {CLUB_ENABLED && <li><a href="#evenements" onClick={() => scrollTo('evenements')}>Événements</a></li>}
            <li><a href="#contact" onClick={() => scrollTo('contact')}>Contact</a></li>
          </ul>
        </nav>
      </header>

      {/* ── HERO ── */}
      <section className="lp-hero" id="accueil">
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
            <h2>Ce qui ne change pas, d'une séance à l'autre</h2>
            <p>Un chien anxieux et un chien qui déborde d'énergie n'ont pas besoin du même travail. Ces trois principes-là, en revanche, ne bougent jamais.</p>
          </div>
          <div className="lp-pillars">
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>
              </div>
              <h3>Confiance</h3>
              <p>Nous construisons une relation positive entre toi et ton chien, sans contrainte ni force, en valorisant chaque progrès.</p>
            </div>
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
              </div>
              <h3>Compréhension</h3>
              <p>Décoder le langage canin pour mieux communiquer. Comprendre le comportement de ton chien, c'est la clé de tout apprentissage durable.</p>
            </div>
            <div className="lp-pillar">
              <div className="lp-pillar-icon">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#1e8db8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3>Respect du rythme</h3>
              <p>Un chiot de quatre mois et un chien de refuge qui découvre la laisse n'avancent pas au même rythme. On suit celui de ton chien, pas celui du programme.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRESTATIONS ── */}
      <section className="lp-section" id="prestations">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Nos prestations</span>
            <h2>Des cours selon ce dont ton chien a besoin</h2>
            <p>Du chiot curieux au chien qui a besoin de rééducation, nous proposons un accompagnement sur mesure.</p>
          </div>
          <div className="lp-prestations-grid">

            <div className="lp-prestation">
              <span className="lp-prestation-tag">Comportement &amp; Rééducation</span>
              <h3>Cours privés</h3>
              <p className="lp-desc">Travail de comportement sur le terrain, avec une éducatrice spécialisée. Agressivité, réactivité, anxiété, peurs : on regarde ta situation de près et on construit un plan. Pas une recette.</p>
              <ul className="lp-prestation-features">
                <li>Spécialisation comportement &amp; rééducation</li>
                <li>Bilan comportemental inclus</li>
                <li>Lieu adapté à ta situation</li>
                <li>Programme sur mesure</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">60 CHF</span>
                <span className="lp-price-unit">/ heure</span>
              </div>
            </div>

            {CLUB_ENABLED && (
            <div className="lp-prestation">
              <span className="lp-prestation-tag">En groupe</span>
              <h3>Cours collectifs</h3>
              <p className="lp-desc">Pour les chiens et chiots : socialisation, éducation et plaisir d'apprendre ensemble, sur le terrain de Ballaigues.</p>
              <ul className="lp-prestation-features">
                <li>2 cours d'essai gratuits</li>
                <li>Tous âges et gabarits confondus</li>
                <li>Socialisation encadrée</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">{cotisationPrix()} CHF</span>
                <span className="lp-price-unit">/ année / chien</span>
              </div>
            </div>
            )}

            {CLUB_ENABLED && (
            <div className="lp-prestation">
              <span className="lp-prestation-tag">Théorique</span>
              <h3>Cours théoriques</h3>
              <p className="lp-desc">Comprendre le comportement canin, la communication, l'éducation positive. Des bases solides pour mieux vivre avec ton chien au quotidien.</p>
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
            )}

            {/* Offre en ligne — mise en avant quand les cours du club sont masqués */}
            {!CLUB_ENABLED && (
            <div className="lp-prestation">
              <span className="lp-prestation-tag">En ligne</span>
              <h3>Contenus &amp; coaching</h3>
              <p className="lp-desc">Apprends à ton rythme avec nos articles, fiches pratiques et guides, où que tu sois. Et pour aller plus loin, un coaching personnalisé en visio avec Tiffany.</p>
              <ul className="lp-prestation-features">
                <li>Articles &amp; fiches pratiques</li>
                <li>Guides à télécharger</li>
                <li>Coaching à distance en visio</li>
              </ul>
              <div className="lp-prestation-price">
                <span className="lp-price-amount">Dès 10 CHF</span>
                <span className="lp-price-unit">/ mois</span>
              </div>
            </div>
            )}

          </div>
        </div>
      </section>

      {/* ── EQUIPE ── */}
      <section className="lp-section lp-apropos" id="apropos">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Notre équipe</span>
            <h2>Deux éducatrices à tes côtés</h2>
            <p>Deux parcours différents, la même façon de travailler : construire une relation de confiance entre toi et ton chien.</p>
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
                  <li>Expert en Comportement &amp; Rééducation canine, CANISCIENTA (profil 2)</li>
                  <li>Diplôme instructrice canine, Union Canine Suisse (profil 1+)</li>
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
                  <li>Diplôme instructrice canine, Union Canine Suisse (profil 1+)</li>
                  <li>Expérience en animalerie : connaissance approfondie des chiens</li>
                  <li>Approche bienveillante et positive</li>
                  <li>Maman de 3 enfants : sens de l'écoute et de la patience</li>
                </ul>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* ── EVENEMENTS ── (vie du club : masqué quand le flag club est désactivé) */}
      {CLUB_ENABLED && (
      <section className="lp-section" id="evenements">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Nos événements</span>
            <h2>Partage des moments uniques avec ton chien</h2>
            <p>Tout au long de l'année, CaniPlus organise des rendez-vous conviviaux pour renforcer ta complicité et rencontrer d'autres passionnés.</p>
          </div>
          <div className="lp-rallye-cta">
            <div>
              <span className="lp-rallye-date">Événement phare</span>
              <h2>Rallye canin CaniPlus</h2>
              <p>Un parcours en pleine nature vaudoise, à faire à deux, ton chien et toi. Ouvert à tous les niveaux.</p>
              <a href="#contact" className="lp-btn lp-btn-primary" onClick={() => scrollTo('contact')}>Être informé·e</a>
            </div>
            <div className="lp-rallye-trophy" style={{ fontSize: 120, textAlign: 'center', opacity: 0.9 }} aria-hidden="true">
              <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="#2babe1" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9H4.5a2.5 2.5 0 010-5H6M18 9h1.5a2.5 2.5 0 000-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 19.24 7 20v2h10v-2c0-.76-.85-1.25-2.03-1.79C14.47 17.98 14 17.55 14 17v-2.34M18 2H6v7a6 6 0 1012 0V2z"/></svg>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ── TÉMOIGNAGES ── */}
      <section className="lp-section lp-temoignages">
        <div className="lp-container">
          <div className="lp-section-head">
            <span className="lp-section-eyebrow">Témoignages</span>
            <h2>{CLUB_ENABLED ? 'Ce que nos membres disent de nous' : 'Ce qu\'ils disent de nous'}</h2>
            <p>On peut dire ce qu'on veut de sa propre méthode. Voilà ce qu'en disent les gens qui viennent.</p>
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
            <h2>Tout ce que tu dois savoir</h2>
            <p>Tu as une question ? Voici les réponses aux demandes les plus courantes.</p>
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
                  {item.links && (
                    <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                      {item.links.map((link, j) => (
                        <a key={j} href={link.url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 13, fontWeight: 600, color: '#2babe1',
                          padding: '6px 14px', borderRadius: 999,
                          background: 'rgba(43,171,225,0.1)',
                        }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
                          {link.label}
                        </a>
                      ))}
                    </div>
                  )}
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
            <span className="lp-section-eyebrow">Mon espace</span>
            <h2>Ton app CaniPlus, partout avec toi</h2>
            <p>
              {/* Les inscriptions aux cours ne se font pas dans l'app (WhatsApp) :
                  ce paragraphe ne les promet que si CLUB_PLANNING_ENABLED. */}
              {CLUB_PLANNING_ENABLED
                ? <>Suis les progrès de ton chien, gère tes inscriptions aux cours et retrouve
                  tes ressources personnalisées, sur ton ordinateur comme sur ton téléphone.</>
                : <>Suis les progrès de ton chien et ses vaccins, et retrouve tes articles,
                  fiches et guides, sur ton ordinateur comme sur ton téléphone.</>}
            </p>
            <ul className="lp-app-features">
              <li>Suivi personnalisé de ton chien</li>
              {CLUB_PLANNING_ENABLED ? <li>Inscriptions aux cours en un clic</li> : <li>Fiches pratiques &amp; guides à portée de main</li>}
              <li>Disponible sur ordinateur, tablette et mobile</li>
              <li>Tes données toujours à jour, partout</li>
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
                avec ton chien.
              </p>
            </div>
            <div>
              <h4>Contact</h4>
              <ul>
                <li><a href="mailto:info@caniplus.ch">info@caniplus.ch</a></li>
                <li><a href="https://wa.me/41791238939" target="_blank" rel="noopener noreferrer">WhatsApp</a></li>
              </ul>
            </div>
            <div>
              <h4>Liens rapides</h4>
              <ul>
                <li><a href="#prestations" onClick={() => scrollTo('prestations')}>Prestations</a></li>
                <li><a href="#apropos" onClick={() => scrollTo('apropos')}>À propos</a></li>
                {CLUB_ENABLED && <li><a href="#evenements" onClick={() => scrollTo('evenements')}>Événements</a></li>}
                <li><a href="#" onClick={(e) => { e.preventDefault(); onLogin(); }}>Mon espace</a></li>
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
