// ===== CaniPlus — Fenêtre de réservation sans compte =====
// Cours privé à domicile et coaching en visio, depuis n'importe quelle page :
//
//   <link rel="stylesheet" href="/assets/booking.css" />
//   <script src="/assets/booking.js" defer></script>
//   <button data-book="domicile" data-book-title="…" data-book-sub="…">Réserver</button>
//
// Le script injecte lui-même le HTML de la fenêtre en fin de <body> (le site
// est statique, sans mécanisme d'include), puis branche tous les boutons
// [data-book] de la page. Sorti de index.html le 28 août 2026, logique
// inchangée.
//
// Fenêtre de réservation : cours privé à domicile et coaching en visio.
// Aucun paiement ici — voir le commentaire du bloc HTML plus haut.
(function () {
  var MODAL_HTML = `
<div class="buy-modal-backdrop" id="bookModal" role="dialog" aria-modal="true" aria-labelledby="bookModalTitle">
  <div class="buy-modal book-modal" tabindex="-1">
    <button type="button" class="buy-modal-close" id="bookModalClose" aria-label="Fermer">×</button>
    <h3 id="bookModalTitle">Réserver un cours privé</h3>
    <p class="buy-modal-sub" id="bookModalSub">Propose trois moments qui t'arrangent.</p>

    <form id="bookModalForm" novalidate>
      <fieldset class="book-slots">
        <legend>Trois moments qui t'arrangent</legend>
        <p class="book-hint">Indique une date et une plage horaire. Tiffany choisira l'un des trois.</p>
        <div id="bookSlotRows"></div>
      </fieldset>

      <div id="bookNpaBlock">
        <label for="bookNpa">Ton code postal</label>
        <input type="text" id="bookNpa" name="postal" inputmode="numeric" maxlength="4"
               pattern="\d{4}" autocomplete="postal-code" placeholder="1400" />
        <p class="book-fee" id="bookFee" role="status" aria-live="polite"></p>
      </div>

      <label for="bookName">Ton nom</label>
      <input type="text" id="bookName" name="name" autocomplete="name" placeholder="Prénom et nom" />

      <label for="bookDog">Le nom de ton chien</label>
      <input type="text" id="bookDog" name="dog" autocomplete="off" maxlength="60" placeholder="Ex. Nala" />

      <label for="bookEmail">Ton adresse email</label>
      <input type="email" id="bookEmail" name="email" autocomplete="email" placeholder="ton@email.ch" />

      <label for="bookPhone">Ton numéro de téléphone</label>
      <input type="tel" id="bookPhone" name="phone" autocomplete="tel" placeholder="079 123 45 67" />

      <label for="bookNotes">Ce sur quoi tu veux travailler <span class="book-optional">(facultatif)</span></label>
      <textarea id="bookNotes" name="notes" rows="3" placeholder="Rappel, laisse, réactivité, arrivée d'un chiot…"></textarea>

      <button type="submit" class="buy-modal-submit" id="bookSubmit">Envoyer ma demande</button>
      <p class="buy-modal-feedback" id="bookFeedback" role="status" aria-live="polite"></p>
      <p class="buy-modal-note"><strong>Tu ne paies rien maintenant.</strong> Le lien de paiement arrive une fois le créneau confirmé avec Tiffany.</p>
    </form>

    <div id="bookDone" class="book-done" hidden>
      <h4>C'est envoyé !</h4>
      <p id="bookDoneText"></p>
      <button type="button" class="buy-modal-submit" id="bookDoneClose">Fermer</button>
    </div>
  </div>
</div>
`;

  function init() {
    if (!document.getElementById('bookModal')) {
      var conteneur = document.createElement('div');
      conteneur.innerHTML = MODAL_HTML;
      while (conteneur.firstChild) document.body.appendChild(conteneur.firstChild);
    }

    var SUPABASE_URL = 'https://oncbeqnznrqummxmqxbx.supabase.co';
    var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uY2JlcW56bnJxdW1teG1xeGJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTY1NDAsImV4cCI6MjA5MTIzMjU0MH0.Z9A88Zv1vlmYAd18Ll2ofAZLrnqoqPkhNJ8pDzceKpk';

    // Mêmes valeurs que src/lib/tarifs.js et que la fonction serveur. Ici elles
    // ne servent qu'à l'aperçu : le montant qui fait foi est recalculé côté
    // serveur, le navigateur n'est pas cru sur parole.
    var PRIX_HEURE = 60, PRIX_KM = 0.75, FRANCHISE_KM = 15, PLAFOND_KM = 50;
    var BALLAIGUES = [46.7329, 6.3922];
    var NB_CRENEAUX = 3;

    var backdrop = document.getElementById('bookModal');
    if (!backdrop) return;
    var form = document.getElementById('bookModalForm');
    var rowsEl = document.getElementById('bookSlotRows');
    var npaBlock = document.getElementById('bookNpaBlock');
    var npaInput = document.getElementById('bookNpa');
    var feeEl = document.getElementById('bookFee');
    var nameEl = document.getElementById('bookName');
    var dogEl = document.getElementById('bookDog');
    var emailEl = document.getElementById('bookEmail');
    var phoneEl = document.getElementById('bookPhone');
    var notesEl = document.getElementById('bookNotes');
    var submitBtn = document.getElementById('bookSubmit');
    var feedback = document.getElementById('bookFeedback');
    var doneEl = document.getElementById('bookDone');
    var doneText = document.getElementById('bookDoneText');
    var headingEl = document.getElementById('bookModalTitle');
    var subEl = document.getElementById('bookModalSub');
    var currentType = 'domicile';
    var opener = null;

    // Heures proposées : de 08:00 à 20:00 par pas de 30 minutes.
    var HEURES = [];
    for (var h = 8; h <= 20; h++) {
      HEURES.push((h < 10 ? '0' : '') + h + ':00');
      if (h < 20) HEURES.push((h < 10 ? '0' : '') + h + ':30');
    }
    function optionsHeures(selection) {
      return HEURES.map(function (t) {
        return '<option value="' + t + '"' + (t === selection ? ' selected' : '') + '>' + t + '</option>';
      }).join('');
    }

    function demain() {
      var d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    function construireCreneaux() {
      var html = '';
      for (var i = 0; i < NB_CRENEAUX; i++) {
        html += '<div class="book-slot">'
             +   '<span class="book-slot-num">' + (i + 1) + '</span>'
             +   '<input type="date" class="book-date" min="' + demain() + '" aria-label="Date du choix ' + (i + 1) + '" />'
             +   '<span class="book-slot-de">de</span>'
             +   '<select class="book-start" aria-label="Heure de début du choix ' + (i + 1) + '">' + optionsHeures('09:00') + '</select>'
             +   '<span class="book-slot-a">à</span>'
             +   '<select class="book-end" aria-label="Heure de fin du choix ' + (i + 1) + '">' + optionsHeures('11:00') + '</select>'
             + '</div>';
      }
      rowsEl.innerHTML = html;
    }

    function creneauxSaisis() {
      return [].slice.call(rowsEl.querySelectorAll('.book-slot')).map(function (row) {
        return {
          date: row.querySelector('.book-date').value,
          start: row.querySelector('.book-start').value,
          end: row.querySelector('.book-end').value,
        };
      }).filter(function (s) { return s.date; });
    }

    // ── Aperçu des frais de déplacement ──────────────────────────────────────
    // Même calcul que la carte de la section « Zone de service » : on géocode
    // le NPA puis on demande la distance routière. C'est un aperçu : le serveur
    // refait le calcul à la réception.
    function frais(km) {
      if (!km || km <= FRANCHISE_KM) return 0;
      if (km > PLAFOND_KM) return null;
      return Math.round((km - FRANCHISE_KM) * PRIX_KM);
    }

    var dernierNpa = '';
    function majFrais() {
      var npa = (npaInput.value || '').trim();
      if (npa === dernierNpa) return;
      dernierNpa = npa;
      if (!/^\d{4}$/.test(npa)) { feeEl.textContent = ''; feeEl.className = 'book-fee'; return; }

      feeEl.textContent = 'Calcul des frais de déplacement…';
      feeEl.className = 'book-fee';

      fetch('https://nominatim.openstreetmap.org/search?format=json&country=switzerland&postalcode='
            + encodeURIComponent(npa) + '&limit=1&addressdetails=1', { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (l) {
          if (!l || !l.length) throw new Error('NPA');
          var a = l[0].address || {};
          var ville = (a.village || a.town || a.city || a.municipality || a.hamlet || a.suburb || npa)
                        .replace(/\s*\([^)]*\)\s*$/, '').trim();
          return fetch('https://router.project-osrm.org/route/v1/driving/'
                       + BALLAIGUES[1] + ',' + BALLAIGUES[0] + ';' + l[0].lon + ',' + l[0].lat
                       + '?overview=false&alternatives=false&steps=false')
            .then(function (r) { return r.json(); })
            .then(function (o) {
              var rt = (o && o.code === 'Ok' && o.routes && o.routes[0]) || null;
              if (!rt) throw new Error('ROUTE');
              return { ville: ville, km: Math.round((rt.distance / 1000) * 10) / 10 };
            });
        })
        .then(function (res) {
          if ((npaInput.value || '').trim() !== npa) return; // saisie changée entre-temps
          var f = frais(res.km);
          if (f === null) {
            feeEl.innerHTML = '<strong>' + npa + ' ' + res.ville + '</strong> · ' + res.km
                            + ' km par la route. Au-delà de 50 km, Tiffany te fait un devis pour le déplacement.';
          } else if (f === 0) {
            feeEl.innerHTML = '<strong>' + npa + ' ' + res.ville + '</strong> · ' + res.km
                            + ' km · déplacement offert. <strong>Total ' + PRIX_HEURE + ' CHF.</strong>';
          } else {
            feeEl.innerHTML = '<strong>' + npa + ' ' + res.ville + '</strong> · ' + res.km
                            + ' km · ' + f + ' CHF de déplacement. <strong>Total ' + (PRIX_HEURE + f) + ' CHF.</strong>';
          }
          feeEl.className = 'book-fee is-ok';
        })
        .catch(function () {
          if ((npaInput.value || '').trim() !== npa) return;
          feeEl.textContent = 'Impossible de calculer les frais pour ce code postal. '
                            + 'Envoie quand même ta demande, Tiffany te dira le montant.';
          feeEl.className = 'book-fee is-warn';
        });
    }

    // ── Ouverture et fermeture ───────────────────────────────────────────────
    function ouvrir(type, titre, sous, btn) {
      currentType = type === 'visio' ? 'visio' : 'domicile';
      opener = btn || null;
      headingEl.textContent = titre || (currentType === 'visio' ? 'Réserver ton coaching' : 'Réserver un cours privé');
      subEl.textContent = sous || 'Propose trois moments qui t\'arrangent.';
      npaBlock.hidden = currentType === 'visio';
      construireCreneaux();
      feeEl.textContent = ''; feeEl.className = 'book-fee'; dernierNpa = '';
      feedback.textContent = ''; feedback.className = 'buy-modal-feedback';
      form.hidden = false; doneEl.hidden = true;
      submitBtn.disabled = false; submitBtn.textContent = 'Envoyer ma demande';
      backdrop.classList.add('is-open');
      document.body.style.overflow = 'hidden';
      // Le focus va sur la boîte, pas sur le premier champ : donner le focus à
      // un champ situé plus bas fait défiler la modale jusqu'à lui, et on
      // arrivait au milieu du formulaire, titre et « tu ne paies rien
      // maintenant » déjà passés. On repart donc du haut.
      var boite = backdrop.querySelector('.book-modal');
      boite.scrollTop = 0;
      boite.focus();
    }

    function fermer() {
      backdrop.classList.remove('is-open');
      document.body.style.overflow = '';
      if (opener && typeof opener.focus === 'function') opener.focus();
      opener = null;
    }

    document.querySelectorAll('[data-book]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        ouvrir(btn.dataset.book, btn.dataset.bookTitle, btn.dataset.bookSub, btn);
      });
    });

    document.getElementById('bookModalClose').addEventListener('click', fermer);
    document.getElementById('bookDoneClose').addEventListener('click', fermer);
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) fermer(); });
    document.addEventListener('keydown', function (e) {
      if (!backdrop.classList.contains('is-open')) return;
      if (e.key === 'Escape') { fermer(); return; }
      if (e.key !== 'Tab') return;
      var f = backdrop.querySelectorAll('button, input, select, textarea, a[href]');
      var visibles = [].slice.call(f).filter(function (el) { return el.offsetParent !== null; });
      if (!visibles.length) return;
      var premier = visibles[0], dernier = visibles[visibles.length - 1];
      if (e.shiftKey && document.activeElement === premier) { e.preventDefault(); dernier.focus(); }
      else if (!e.shiftKey && document.activeElement === dernier) { e.preventDefault(); premier.focus(); }
    });

    npaInput.addEventListener('change', majFrais);
    npaInput.addEventListener('blur', majFrais);

    // ── Envoi ────────────────────────────────────────────────────────────────
    function erreur(msg) {
      feedback.textContent = msg;
      feedback.className = 'buy-modal-feedback is-error';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Envoyer ma demande';
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var creneaux = creneauxSaisis();
      var nom = (nameEl.value || '').trim();
      var chien = (dogEl.value || '').trim();
      var email = (emailEl.value || '').trim();
      var tel = (phoneEl.value || '').trim();
      var npa = (npaInput.value || '').trim();

      if (!creneaux.length) return erreur('Indique au moins une date qui t\'arrange.');
      if (creneaux.some(function (s) { return s.end <= s.start; })) {
        return erreur('Un de tes créneaux se termine avant de commencer.');
      }
      if (nom.length < 2) return erreur('Indique ton nom.');
      if (chien.length < 1) return erreur('Indique le nom de ton chien.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erreur('Vérifie ton adresse email.');
      if (tel.replace(/\D/g, '').length < 9) return erreur('Vérifie ton numéro de téléphone.');
      if (currentType === 'domicile' && !/^\d{4}$/.test(npa)) {
        return erreur('Indique ton code postal suisse à 4 chiffres.');
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi en cours…';
      feedback.textContent = '';
      feedback.className = 'buy-modal-feedback is-info';

      fetch(SUPABASE_URL + '/functions/v1/public-coaching-request', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'apikey': SUPABASE_ANON_KEY,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          type: currentType,
          slots: creneaux,
          name: nom,
          dog_name: chien,
          email: email,
          phone: tel,
          postal_code: currentType === 'domicile' ? npa : null,
          notes: (notesEl.value || '').trim() || null,
        }),
      })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || j.error) {
            return erreur((j && j.error) || 'Impossible d\'envoyer la demande. Réessaie dans quelques instants.');
          }
          var total = j.sur_devis ? 'Le déplacement te sera confirmé sur devis.'
                    : (j.total_chf ? 'Total prévu : ' + j.total_chf + ' CHF.' : '');
          doneText.textContent = 'Tiffany te contacte sur WhatsApp au ' + tel + ' pour fixer le créneau, en général sous 48 heures. '
                               + 'Tu reçois aussi un email de confirmation. ' + total
                               + ' Tu ne paies qu\'une fois la date fixée.';
          form.hidden = true;
          doneEl.hidden = false;
        })
        .catch(function () {
          erreur('Connexion impossible. Réessaie dans quelques instants.');
        });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
