'use strict';
// East African distribution site — Express server: static pages, JSON API, admin dashboard with the prospect database.
require('./env');
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const store = require('./db');
const cfg = require('./config');
const { notify } = require('./notify');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_URL = (process.env.SITE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

if (!ADMIN_PASSWORD || ADMIN_PASSWORD === 'change-me-before-launch') {
  console.warn('\n[warn] ADMIN_PASSWORD is not set (or is still the example value). Set it in .env before going live.\n');
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '64kb' }));
app.use(express.urlencoded({ extended: false, limit: '64kb' }));

// ---------- helpers ----------
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clean = (v, max = 500) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bad = (res, message, field) => res.status(400).json({ ok: false, message, field });
const listOf = (v, max = 10) => (Array.isArray(v) ? v : typeof v === 'string' && v ? v.split(',') : []).map((x) => clean(String(x), 40)).filter(Boolean).slice(0, max);

const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip || 'unknown';
  const arr = (hits.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  if (arr.length >= 20) return res.status(429).json({ ok: false, message: 'Too many requests. Please try again in a few minutes.' });
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) hits.clear();
  next();
}
function honeypot(req, res) {
  if (clean(req.body.website)) { res.json({ ok: true, reference: 'TM-THANKS' }); return true; }
  return false;
}
const REF_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function makeReference(prefix) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const bytes = crypto.randomBytes(5);
    let ref = prefix + '-';
    for (let i = 0; i < 5; i++) ref += REF_ALPHABET[bytes[i] % REF_ALPHABET.length];
    if (!store.referenceExists(ref)) return ref;
  }
  return prefix + '-' + Date.now().toString(36).toUpperCase().slice(-5);
}
function basicAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, encoded] = header.split(' ');
  if (scheme === 'Basic' && encoded) {
    const [rawUser, ...rest] = Buffer.from(encoded, 'base64').toString('utf8').split(':');
    const user = rawUser.trim().toLowerCase();
    const pass = rest.join(':').trim();
    const adminUser = ADMIN_USER.trim().toLowerCase();
    const ok = ADMIN_PASSWORD &&
      user.length === adminUser.length && crypto.timingSafeEqual(Buffer.from(user), Buffer.from(adminUser)) &&
      pass.length === ADMIN_PASSWORD.length && crypto.timingSafeEqual(Buffer.from(pass), Buffer.from(ADMIN_PASSWORD));
    if (ok) return next();
  }
  res.set('WWW-Authenticate', `Basic realm="${cfg.BRAND} admin", charset="UTF-8"`);
  res.status(401).send('Admin sign-in required.');
}

// ---------- public API ----------
app.get('/healthz', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json({ ok: true, brand: cfg.BRAND, categories: cfg.CATEGORIES, business_types: cfg.BUSINESS_TYPES, spend_bands: cfg.SPEND_BANDS, countries: cfg.COUNTRIES, brand_categories: cfg.BRAND_CATEGORIES, export_experience: cfg.EXPORT_EXPERIENCE, founding_cap: cfg.FOUNDING_MEMBER_CAP }));
app.get('/api/public-stats', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, ...store.publicStats(), founding_cap: cfg.FOUNDING_MEMBER_CAP }); });
app.get('/api/directory', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ ok: true, members: store.directory() }); });

// Trade member sign-up
app.post('/api/members', rateLimit, async (req, res) => {
  if (honeypot(req, res)) return;
  const b = req.body || {};
  const row = {
    business_name: clean(b.business_name, 120), business_type: clean(b.business_type, 20),
    contact_name: clean(b.contact_name, 120), email: clean(b.email, 200).toLowerCase(),
    phone: clean(b.phone, 40) || null, website: clean(b.website_url, 200) || null,
    town: clean(b.town, 80) || null, postcode: clean(b.postcode, 12).toUpperCase() || null,
    interests: listOf(b.interests).filter((k) => cfg.CATEGORIES.some((c) => c.key === k)).join(',') || null,
    spend_band: clean(b.spend_band, 40) || null, buys_now: clean(b.buys_now, 200) || null,
    message: clean(b.message, 2000) || null, ip: req.ip || null,
  };
  const consent = b.consent === true || b.consent === 'on' || b.consent === 'true' || b.consent === 1;
  if (row.business_name.length < 2) return bad(res, 'Please tell us the business name.', 'business_name');
  if (!cfg.BUSINESS_TYPES.some((t) => t.key === row.business_type)) return bad(res, 'Please choose what kind of business you run.', 'business_type');
  if (row.contact_name.length < 2) return bad(res, 'Please tell us your name.', 'contact_name');
  if (!EMAIL_RE.test(row.email)) return bad(res, 'That email address does not look right.', 'email');
  if (row.spend_band && !cfg.SPEND_BANDS.includes(row.spend_band)) return bad(res, 'Please pick a spend band.', 'spend_band');
  if (!consent) return bad(res, 'Tick the box so we can email you about your membership.', 'consent');
  row.reference = makeReference('TM');
  store.insert('members', row);
  notify(`New trade member request ${row.reference}: ${row.business_name}`, [
    `Reference: ${row.reference}`, `Business: ${row.business_name} (${row.business_type})`, `Contact: ${row.contact_name} <${row.email}> ${row.phone || ''}`,
    `Where: ${row.town || '-'} ${row.postcode || ''}`, `Wants: ${row.interests || '-'} · spend: ${row.spend_band || '-'}`,
    `Buys now: ${row.buys_now || '-'}`, `Message: ${row.message || '-'}`, `Admin: ${SITE_URL}/admin`,
  ]).catch(() => {});
  res.status(201).json({ ok: true, reference: row.reference, business_name: row.business_name });
});

// Brand application (East African producers)
app.post('/api/brand-applications', rateLimit, async (req, res) => {
  if (honeypot(req, res)) return;
  const b = req.body || {};
  const row = {
    brand_name: clean(b.brand_name, 120), company: clean(b.company, 120) || null, country: clean(b.country, 40),
    category: clean(b.category, 60), products: clean(b.products, 1000) || null, website: clean(b.website_url, 200) || null,
    contact_name: clean(b.contact_name, 120), email: clean(b.email, 200).toLowerCase(), phone: clean(b.phone, 40) || null,
    export_experience: clean(b.export_experience, 40) || null, certifications: clean(b.certifications, 300) || null,
    message: clean(b.message, 2000) || null, ip: req.ip || null,
  };
  if (row.brand_name.length < 2) return bad(res, 'Please tell us the brand name.', 'brand_name');
  if (!cfg.COUNTRIES.includes(row.country)) return bad(res, 'Please choose the country you make it in.', 'country');
  if (!cfg.BRAND_CATEGORIES.includes(row.category)) return bad(res, 'Please choose a product category.', 'category');
  if (row.contact_name.length < 2) return bad(res, 'Please tell us your name.', 'contact_name');
  if (!EMAIL_RE.test(row.email)) return bad(res, 'That email address does not look right.', 'email');
  if (row.export_experience && !cfg.EXPORT_EXPERIENCE.includes(row.export_experience)) return bad(res, 'Please pick your export experience.', 'export_experience');
  row.reference = makeReference('BR');
  store.insert('brand_applications', row);
  notify(`New brand application ${row.reference}: ${row.brand_name} (${row.country})`, [
    `Reference: ${row.reference}`, `Brand: ${row.brand_name} · ${row.company || '-'} · ${row.country}`, `Category: ${row.category}`,
    `Products: ${row.products || '-'}`, `Contact: ${row.contact_name} <${row.email}> ${row.phone || ''}`, `Export experience: ${row.export_experience || '-'}`,
    `Certifications: ${row.certifications || '-'}`, `Message: ${row.message || '-'}`, `Admin: ${SITE_URL}/admin`,
  ]).catch(() => {});
  res.status(201).json({ ok: true, reference: row.reference, brand_name: row.brand_name });
});

// Buyer enquiry (supermarkets, wholesalers) and the general contact form
app.post('/api/enquiries', rateLimit, async (req, res) => {
  if (honeypot(req, res)) return;
  const b = req.body || {};
  const row = {
    kind: clean(b.kind, 10) === 'buyer' ? 'buyer' : 'contact',
    organisation: clean(b.organisation, 120) || null, role: clean(b.role, 80) || null,
    contact_name: clean(b.contact_name, 120), email: clean(b.email, 200).toLowerCase(),
    interest: clean(b.interest, 200) || null, message: clean(b.message, 2000) || null, ip: req.ip || null,
  };
  if (row.kind === 'buyer' && !row.organisation) return bad(res, 'Please tell us the retailer or company.', 'organisation');
  if (row.contact_name.length < 2) return bad(res, 'Please tell us your name.', 'contact_name');
  if (!EMAIL_RE.test(row.email)) return bad(res, 'That email address does not look right.', 'email');
  if (!row.message) return bad(res, 'Please write a message.', 'message');
  const id = store.insert('enquiries', row);
  notify(row.kind === 'buyer' ? `New buyer enquiry: ${row.organisation}` : `New contact message from ${row.contact_name}`, [
    `From: ${row.contact_name} <${row.email}> · ${row.organisation || '-'} · ${row.role || '-'}`, `Interest: ${row.interest || '-'}`, `Message: ${row.message}`, `Admin: ${SITE_URL}/admin`,
  ]).catch(() => {});
  res.status(201).json({ ok: true, id });
});

app.post('/api/newsletter', rateLimit, (req, res) => {
  if (honeypot(req, res)) return;
  const email = clean((req.body || {}).email, 200).toLowerCase();
  const audience = ['trade', 'brand', 'customer'].includes(clean((req.body || {}).audience, 10)) ? clean(req.body.audience, 10) : 'trade';
  if (!EMAIL_RE.test(email)) return bad(res, 'That email address does not look right.', 'email');
  try { store.insert('newsletter', { email, audience }); } catch (e) { /* already subscribed */ }
  res.status(201).json({ ok: true });
});

// ---------- admin ----------
const admin = express.Router();
admin.use(basicAuth);
admin.get('/stats', (req, res) => res.json({ ok: true, stats: store.stats() }));
admin.post('/prospects/import', express.text({ type: ['text/csv', 'text/plain'], limit: '5mb' }), (req, res) => {
  const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv) || '';
  if (!csv.trim()) return bad(res, 'Send the CSV text in the request body.');
  try { res.json({ ok: true, ...store.importProspects(csv) }); } catch (e) { bad(res, 'Import failed: ' + e.message); }
});
admin.post('/prospects/:id/convert', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  const member = Number.isInteger(id) ? store.convertProspect(id, makeReference) : null;
  if (!member) return res.status(404).json({ ok: false, message: 'Prospect not found' });
  res.json({ ok: true, member });
});
admin.get('/:table.csv', (req, res) => {
  const table = req.params.table;
  if (!store.TABLES[table]) return res.status(404).json({ ok: false, message: 'Unknown table' });
  const rows = store.list(table, { limit: 20000 });
  const cols = store.TABLES[table].columns;
  const esc = (v) => {
    let s = v === null || v === undefined ? '' : String(v);
    // Neutralise CSV/formula injection: a leading =, +, -, @ (or tab/CR) can be read as a formula by Excel/Sheets.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${cfg.BRAND.toLowerCase()}-${table}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
});
admin.get('/:table', (req, res) => {
  const table = req.params.table;
  if (!store.TABLES[table]) return res.status(404).json({ ok: false, message: 'Unknown table' });
  res.json({ ok: true, rows: store.list(table), editable: store.TABLES[table].editable });
});
admin.patch('/:table/:id', (req, res) => {
  const table = req.params.table;
  const id = Number.parseInt(req.params.id, 10);
  if (!store.TABLES[table] || !Number.isInteger(id)) return res.status(404).json({ ok: false, message: 'Not found' });
  try { res.json({ ok: true, changed: store.updateEditable(table, id, req.body || {}) }); } catch (e) { bad(res, e.message); }
});
app.use('/api/admin', admin);
app.get('/admin', basicAuth, (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
// admin.html also lives under public/, which express.static would otherwise serve at this exact
// path with no sign-in check at all — send it through the gated /admin route instead.
app.get('/admin.html', (req, res) => res.redirect(301, '/admin'));

// ---------- static site ----------
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: '1h' }));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

// Catch-all error handler: never leak stack traces / internal file paths to the client; the JSON
// API stays JSON on errors too (a bad body, an unexpected exception) instead of an HTML error page.
app.use((err, req, res, next) => {
  console.error('[error]', (err && err.stack) || err);
  if (res.headersSent) return next(err);
  const status = Number(err && (err.status || err.statusCode));
  res.status(status >= 400 && status < 600 ? status : 500).json({ ok: false, message: 'Something went wrong. Please try again.' });
});

store.seedProspectsIfEmpty();
app.listen(PORT, () => console.log(`${cfg.BRAND} site running at http://localhost:${PORT}  (database: ${store.DB_PATH})`));
