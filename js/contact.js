(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var form = document.querySelector('form[data-mcp-form="1"]');
    if (!form) return;

    var formBlock = form.closest('.w-form') || form.parentElement;
    var doneEl = formBlock ? formBlock.querySelector('.w-form-done') : null;
    var failEl = formBlock ? formBlock.querySelector('.w-form-fail') : null;
    var submitBtn = form.querySelector('input[type="submit"]');
    var originalValue = submitBtn ? submitBtn.value : 'Trimite';
    var waitValue = submitBtn && submitBtn.getAttribute('data-wait') ? submitBtn.getAttribute('data-wait') : 'Se trimite...';

    function showDone() {
      if (form) form.style.display = 'none';
      if (failEl) failEl.style.display = 'none';
      if (doneEl) doneEl.style.display = 'block';
    }
    function showFail(msg) {
      if (failEl) {
        failEl.style.display = 'block';
        if (msg) {
          var inner = failEl.querySelector('div');
          if (inner) inner.textContent = msg;
        }
      }
    }
    function resetSubmit() {
      if (submitBtn) {
        submitBtn.value = originalValue;
        submitBtn.disabled = false;
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      e.stopPropagation();

      if (failEl) failEl.style.display = 'none';
      if (doneEl) doneEl.style.display = 'none';

      var nume = (form.querySelector('[name="Nume"]') || {}).value || '';
      var telefon = (form.querySelector('[name="Telefon"]') || {}).value || '';
      var email = (form.querySelector('[name="Email"]') || {}).value || '';
      var terms = form.querySelector('[name="Terms"]');
      var termsChecked = !!(terms && terms.checked);

      nume = nume.trim();
      telefon = telefon.trim();
      email = email.trim();

      if (!nume || !telefon || !email) {
        showFail('Completează toate câmpurile, te rog.');
        return;
      }
      if (!termsChecked) {
        showFail('Trebuie să accepți Termenii și Condițiile.');
        return;
      }

      if (submitBtn) {
        submitBtn.value = waitValue;
        submitBtn.disabled = true;
      }

      fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({
          nume: nume,
          telefon: telefon,
          email: email,
          terms_accepted: termsChecked,
          source: 'mariusciprianpop.ro'
        })
      })
        .then(function (res) {
          return res.json().then(function (data) { return { ok: res.ok, data: data }; }).catch(function () { return { ok: res.ok, data: {} }; });
        })
        .then(function (result) {
          resetSubmit();
          if (result.ok) {
            showDone();
          } else {
            var msg = (result.data && result.data.error) ? result.data.error : 'Eroare. Te rog mai încearcă o dată!';
            showFail(msg);
          }
        })
        .catch(function () {
          resetSubmit();
          showFail('Eroare de rețea. Te rog mai încearcă o dată!');
        });
    }, true);
  });
})();
