/* Admin dashboard — talks to /api/admin/* (HTTP Basic Auth). */
(function () {
  'use strict';
  var table = 'prospects';
  var rows = [], editable = {};
  var when = function (iso) { var d = new Date(iso); return isNaN(d) ? (iso || '') : d.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); };
  var day = function (iso) { if (!iso) return ''; var d = new Date(iso); return isNaN(d) ? iso : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var link = function (v) { if (!v) return ''; var u = /^https?:/.test(v) ? v : 'https://' + String(v).split(' ')[0]; return '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + esc(String(v).replace(/^https?:\/\//, '').slice(0, 40)) + '</a>'; };
  var mail = function (v) { return v ? '<a href="mailto:' + esc(v) + '">' + esc(v) + '</a>' : ''; };
  var tel = function (v) { return v ? '<a href="tel:' + esc(String(v).replace(/[^+\d]/g, '')) + '">' + esc(v) + '</a>' : ''; };
  var pill = function (v) { return '<span class="pill ' + esc(String(v || '').replace(/\s+/g, '-')) + '">' + esc(v) + '</span>'; };

  var COLS = {
    prospects: [['priority', 'Pri'], ['business_name', 'Business'], ['business_type', 'Type'], ['city', 'City'], ['status', 'Status'], ['owner', 'Owner'], ['next_action', 'Next action'], ['next_date', 'By'], ['phone', 'Phone'], ['email', 'Email'], ['website', 'Website'], ['cuisine_or_stock', 'What they stock / cook'], ['admin_notes', 'Our notes'], ['notes', 'Research note'], ['verified', 'Verified'], ['source_url', 'Source'], ['_convert', '']],
    members: [['created_at', 'When'], ['reference', 'Ref'], ['business_name', 'Business'], ['business_type', 'Type'], ['contact_name', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['town', 'Town'], ['postcode', 'Postcode'], ['interests', 'Wants'], ['spend_band', 'Spend'], ['buys_now', 'Buys now'], ['message', 'Message'], ['status', 'Status'], ['listed', 'In finder'], ['notes', 'Notes']],
    brand_applications: [['created_at', 'When'], ['reference', 'Ref'], ['brand_name', 'Brand'], ['company', 'Company'], ['country', 'Country'], ['category', 'Category'], ['products', 'Products'], ['contact_name', 'Contact'], ['email', 'Email'], ['phone', 'Phone'], ['website', 'Site'], ['export_experience', 'Export exp.'], ['certifications', 'Certs'], ['message', 'Message'], ['status', 'Status'], ['notes', 'Notes']],
    enquiries: [['created_at', 'When'], ['kind', 'Kind'], ['organisation', 'Organisation'], ['role', 'Role'], ['contact_name', 'Contact'], ['email', 'Email'], ['interest', 'Interest'], ['message', 'Message'], ['status', 'Status'], ['notes', 'Notes']],
    newsletter: [['created_at', 'When'], ['email', 'Email'], ['audience', 'Audience']],
  };
  var LISTED_LABEL = { '0': 'Hidden', '1': 'Listed' };

  function api(path, opts) {
    return fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts || {})).then(function (r) {
      if (r.status === 401) { document.getElementById('tablewrap').innerHTML = '<div class="empty">Sign-in required. Reload the page.</div>'; throw new Error('unauthorised'); }
      return r.json();
    });
  }

  function loadStats() {
    api('/api/admin/stats').then(function (j) {
      var s = j.stats || {};
      document.getElementById('kpis').innerHTML = [
        ['Prospects to call', s.prospects_untouched, 'hot'], ['Prospects won', s.prospects_won], ['Trade members', s.members], ['New member requests', s.new_members, 'hot'],
        ['Stocking', s.stocking], ['Brand applications', s.brands], ['New brand applications', s.new_brands, 'hot'], ['New enquiries', s.new_enquiries, 'hot'], ['Newsletter', s.newsletter],
      ].map(function (k) { return '<div class="kpi' + (k[2] ? ' ' + k[2] : '') + '"><div class="v">' + esc(k[1] == null ? 0 : k[1]) + '</div><div class="k">' + esc(k[0]) + '</div></div>'; }).join('');
    }).catch(function () {});
  }

  function cell(r, k, v) {
    if (k === '_convert') {
      if (table !== 'prospects') return '<td></td>';
      return '<td>' + (r.member_id ? '<span class="pill member">Member #' + esc(r.member_id) + '</span>' : '<button class="mini" data-convert="' + r.id + '">Make member</button>') + '</td>';
    }
    if (k === 'created_at') return '<td>' + esc(when(v)) + '</td>';
    if (k === 'priority' && editable.priority) return '<td><select data-field="priority" aria-label="Priority">' + editable.priority.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></td>';
    if (k === 'email') return '<td>' + mail(v) + '</td>';
    if (k === 'phone') return '<td>' + tel(v) + '</td>';
    if (k === 'website' || k === 'source_url') return '<td>' + link(v) + '</td>';
    if (k === 'message' || k === 'products' || k === 'cuisine_or_stock' || k === 'notes' && !(k in editable) || k === 'buys_now' || k === 'interest') return '<td class="wrap-cell"><div class="clamp" title="' + esc(v) + '">' + esc(v) + '</div></td>';
    if (k === 'listed' && editable.listed) return '<td><select data-field="listed">' + ['0', '1'].map(function (o) { return '<option value="' + o + '"' + (String(v) === o ? ' selected' : '') + '>' + LISTED_LABEL[o] + '</option>'; }).join('') + '</select><span class="saved" aria-live="polite"></span></td>';
    if (editable[k] && Array.isArray(editable[k])) {
      return '<td><select data-field="' + k + '">' + editable[k].map(function (o) { return '<option value="' + esc(o) + '"' + (o === (v == null ? '' : v) ? ' selected' : '') + '>' + esc(o || '—') + '</option>'; }).join('') + '</select><span class="saved" aria-live="polite"></span></td>';
    }
    if (k === 'next_date' && (k in editable)) return '<td><input type="date" data-field="next_date" value="' + esc(v || '') + '" aria-label="Next date"><span class="saved" aria-live="polite"></span></td>';
    if ((k === 'notes' || k === 'admin_notes' || k === 'next_action') && (k in editable)) return '<td><input class="notes" data-field="' + k + '" value="' + esc(v) + '" placeholder="' + (k === 'next_action' ? 'e.g. call Tuesday' : 'Add a note') + '"><span class="saved" aria-live="polite"></span></td>';
    if (k === 'status' || k === 'kind') return '<td>' + pill(v) + '</td>';
    return '<td>' + esc(v) + '</td>';
  }

  function render() {
    var q = (document.getElementById('search').value || '').toLowerCase().trim();
    var fs = document.getElementById('f-status').value, fp = document.getElementById('f-priority').value, ft = document.getElementById('f-type').value;
    var cols = COLS[table];
    var visible = rows.filter(function (r) {
      if (fs && String(r.status) !== fs) return false;
      if (table === 'prospects' && fp && r.priority !== fp) return false;
      if (table === 'prospects' && ft && r.business_type !== ft) return false;
      return !q || Object.values(r).some(function (v) { return String(v == null ? '' : v).toLowerCase().indexOf(q) >= 0; });
    });
    if (!visible.length) { document.getElementById('tablewrap').innerHTML = '<div class="empty">Nothing here yet.</div>'; return; }
    var html = '<table><thead><tr>' + cols.map(function (c) { return '<th>' + esc(c[1]) + '</th>'; }).join('') + '</tr></thead><tbody>';
    visible.forEach(function (r) { html += '<tr data-id="' + r.id + '">' + cols.map(function (c) { return cell(r, c[0], r[c[0]]); }).join('') + '</tr>'; });
    html += '</tbody></table>';
    document.getElementById('tablewrap').innerHTML = html + '<div class="empty" style="padding:10px">' + visible.length + ' of ' + rows.length + ' rows</div>';
  }

  function fillStatusFilter() {
    var sel = document.getElementById('f-status');
    var opts = (editable.status || []);
    sel.innerHTML = '<option value="">All statuses</option>' + opts.map(function (o) { return '<option value="' + esc(o) + '">' + esc(o) + '</option>'; }).join('');
    document.getElementById('f-priority').hidden = table !== 'prospects';
    document.getElementById('f-type').hidden = table !== 'prospects';
    document.getElementById('importwrap').hidden = table !== 'prospects';
  }

  function load() {
    document.getElementById('export').setAttribute('href', '/api/admin/' + table + '.csv');
    api('/api/admin/' + table).then(function (j) { rows = j.rows || []; editable = j.editable || {}; fillStatusFilter(); render(); }).catch(function () {});
    loadStats();
  }

  document.getElementById('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-table]'); if (!b) return;
    document.querySelectorAll('#tabs button').forEach(function (x) { x.setAttribute('aria-selected', x === b ? 'true' : 'false'); });
    table = b.getAttribute('data-table'); document.getElementById('search').value = ''; load();
  });
  ['search', 'f-status', 'f-priority', 'f-type'].forEach(function (id) { document.getElementById(id).addEventListener('input', render); document.getElementById(id).addEventListener('change', render); });

  function save(tr, field, value, flag) {
    var id = tr.getAttribute('data-id');
    var patch = {}; patch[field] = value;
    api('/api/admin/' + table + '/' + id, { method: 'PATCH', body: JSON.stringify(patch) }).then(function (j) {
      if (flag && flag.classList && flag.classList.contains('saved')) { flag.textContent = j.ok ? 'Saved' : 'Not saved'; setTimeout(function () { flag.textContent = ''; }, 1500); }
      var row = rows.find(function (r) { return String(r.id) === id; }); if (row && j.ok) row[field] = value;
      if (field === 'status' || field === 'listed') loadStats();
    }).catch(function () {});
  }
  document.getElementById('tablewrap').addEventListener('change', function (e) {
    var el = e.target; var field = el.getAttribute('data-field'); if (!field) return;
    save(el.closest('tr'), field, el.value, el.nextElementSibling);
  });
  document.getElementById('tablewrap').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-convert]'); if (!b) return;
    b.disabled = true;
    api('/api/admin/prospects/' + b.getAttribute('data-convert') + '/convert', { method: 'POST' }).then(function (j) {
      if (j.ok) { load(); } else { b.disabled = false; }
    }).catch(function () { b.disabled = false; });
  });

  // CSV import (prospects)
  document.getElementById('csvfile').addEventListener('change', function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var msg = document.getElementById('importmsg'); msg.textContent = 'Importing…';
    f.text().then(function (text) {
      return fetch('/api/admin/prospects/import', { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: text }).then(function (r) { return r.json(); });
    }).then(function (j) {
      msg.textContent = j.ok ? 'Imported ' + j.imported + ' rows' + (j.skipped ? ' (' + j.skipped + ' skipped)' : '') : (j.message || 'Import failed');
      e.target.value = ''; load(); setTimeout(function () { msg.textContent = ''; }, 6000);
    }).catch(function () { msg.textContent = 'Import failed'; });
  });

  document.getElementById('signout').addEventListener('click', function (e) {
    e.preventDefault();
    fetch('/api/admin/stats', { headers: { Authorization: 'Basic ' + btoa('signed-out:signed-out') } }).finally(function () { location.href = '/'; });
  });
  load();
})();
