/* Shared front-end behaviour (no framework). */
(function () {
  'use strict';
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var ICONS = { chilli: 'i-flame', spices: 'i-jar', tea: 'i-cup', staples: 'i-bag', drinks: 'i-leaf' };

  // Mobile menu
  var menuBtn = document.querySelector('.menu-btn');
  var nav = document.querySelector('.nav');
  if (menuBtn && nav) {
    menuBtn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Mark current page in the nav
  var here = location.pathname.replace(/\/$/, '') || '/';
  document.querySelectorAll('.nav a').forEach(function (a) {
    var href = a.getAttribute('href').replace(/\/$/, '') || '/';
    if (href === here) a.setAttribute('aria-current', 'page');
  });

  // Options (selects and tick boxes) come from /api/config so the server and the forms always agree.
  var optionTargets = document.querySelectorAll('[data-options]');
  if (optionTargets.length) {
    fetch('/api/config').then(function (r) { return r.json(); }).then(function (cfg) {
      optionTargets.forEach(function (el) {
        var key = el.getAttribute('data-options');
        var list = cfg[key] || [];
        if (el.tagName === 'SELECT') {
          list.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = typeof o === 'string' ? o : o.key; opt.textContent = typeof o === 'string' ? o : o.label;
            el.appendChild(opt);
          });
        } else {
          el.innerHTML = list.map(function (o) {
            return '<label class="tick"><input type="checkbox" name="interests" value="' + esc(o.key) + '"><svg class="ic"><use href="#' + (ICONS[o.key] || 'i-check') + '"/></svg><span>' + esc(o.label) + '</span></label>';
          }).join('');
        }
      });
    }).catch(function () {});
  }

  // Generic JSON form handler: <form data-api="/api/..." data-success="#id">
  function serialize(form) {
    var data = {};
    new FormData(form).forEach(function (v, k) { if (k !== 'interests') data[k] = v; });
    var multi = form.querySelectorAll('input[type=checkbox][name=interests]');
    if (multi.length) data.interests = Array.prototype.filter.call(multi, function (c) { return c.checked; }).map(function (c) { return c.value; });
    form.querySelectorAll('input[type=checkbox]:not([name=interests])').forEach(function (c) { data[c.name] = c.checked; });
    return data;
  }
  function clearErrors(form) {
    form.querySelectorAll('.field.invalid').forEach(function (f) { f.classList.remove('invalid'); });
    form.querySelectorAll('.error').forEach(function (e) { e.textContent = ''; });
    var s = form.querySelector('.form-status'); if (s) { s.textContent = ''; s.style.color = ''; }
  }
  function showError(form, message, field) {
    var target = field && form.querySelector('[name="' + field + '"]');
    if (target) {
      var wrap = target.closest('.field') || target.closest('.check');
      if (wrap) { wrap.classList.add('invalid'); var e = wrap.querySelector('.error'); if (e) e.textContent = message; }
      target.focus();
    } else {
      var s = form.querySelector('.form-status'); if (s) s.textContent = message;
    }
  }
  document.querySelectorAll('form[data-api]').forEach(function (form) {
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      clearErrors(form);
      var btn = form.querySelector('button[type=submit]');
      if (btn) btn.disabled = true;
      fetch(form.getAttribute('data-api'), {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(serialize(form)),
      }).then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); })
        .then(function (res) {
          if (!res.body || !res.body.ok) { showError(form, (res.body && res.body.message) || 'Something went wrong. Please try again.', res.body && res.body.field); return; }
          var successSel = form.getAttribute('data-success');
          var panel = successSel && document.querySelector(successSel);
          if (panel) {
            panel.querySelectorAll('[data-fill]').forEach(function (el) {
              var key = el.getAttribute('data-fill');
              el.textContent = res.body[key] != null ? res.body[key] : '';
            });
            form.hidden = true; panel.hidden = false; panel.setAttribute('tabindex', '-1'); panel.focus();
            panel.scrollIntoView({ block: 'start' });
          } else {
            form.reset();
            var s = form.querySelector('.form-status'); if (s) { s.style.color = 'var(--good)'; s.textContent = 'Thanks — got it. We reply within two working days.'; }
          }
        })
        .catch(function () { showError(form, 'Network problem. Please check your connection and try again.'); })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  });

  // Founding members bar — real counts, shown only when the endpoint answers.
  var founders = document.querySelectorAll('[data-founders], [data-founders-line]');
  if (founders.length) {
    fetch('/api/public-stats').then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      var n = j.members || 0, cap = j.founding_cap || 50;
      founders.forEach(function (box) {
        box.hidden = false;
        var c = box.querySelector('[data-founders-count]'); if (c) c.textContent = Math.min(n, cap);
        var capEl = box.querySelector('[data-founders-cap]'); if (capEl) capEl.textContent = cap;
        var fill = box.querySelector('[data-founders-fill]'); if (fill) fill.style.width = Math.min(100, Math.round(n / cap * 100)) + '%';
        var bar = box.querySelector('[role=progressbar]'); if (bar) { bar.setAttribute('aria-valuenow', Math.min(n, cap)); bar.setAttribute('aria-valuemax', cap); }
      });
    }).catch(function () {});
  }

  // Stockist finder
  var dir = document.querySelector('[data-directory]');
  if (dir) {
    var q = document.querySelector('[data-dir-search]'), typeSel = document.querySelector('[data-dir-type]');
    var members = [];
    var TYPE_LABEL = { shop: 'Shop', restaurant: 'Restaurant / cafe', caterer: 'Caterer / stall', online: 'Online store', wholesaler: 'Wholesaler', other: 'Stockist' };
    function render() {
      var term = (q.value || '').toLowerCase().trim(), t = typeSel.value;
      var rows = members.filter(function (m) {
        if (t && m.business_type !== t) return false;
        if (!term) return true;
        return [m.business_name, m.town, m.postcode].join(' ').toLowerCase().indexOf(term) >= 0;
      });
      if (!members.length) { dir.innerHTML = '<div class="placeholder">Founding members appear here as soon as the first orders ship. <a href="/trade">Be one of them.</a></div>'; return; }
      if (!rows.length) { dir.innerHTML = '<div class="placeholder">No stockists match that yet. Try a wider search.</div>'; return; }
      dir.innerHTML = rows.map(function (m) {
        var site = m.website ? '<a href="' + esc(/^https?:/.test(m.website) ? m.website : 'https://' + m.website.replace(/^@/, 'instagram.com/')) + '" rel="noopener">' + esc(m.website) + '</a>' : '';
        return '<div class="dir-item"><span class="t">' + esc(m.business_name) + '</span><span class="m">' + esc(TYPE_LABEL[m.business_type] || 'Stockist') + (m.town ? ' · ' + esc(m.town) : '') + (m.postcode ? ' ' + esc(m.postcode) : '') + '</span>' + (site ? '<span class="m">' + site + '</span>' : '') + '</div>';
      }).join('');
    }
    fetch('/api/directory').then(function (r) { return r.json(); }).then(function (j) { members = (j && j.members) || []; render(); }).catch(function () { dir.innerHTML = '<div class="placeholder">Could not load the list — please refresh.</div>'; });
    q.addEventListener('input', render); typeSel.addEventListener('change', render);
  }
})();
