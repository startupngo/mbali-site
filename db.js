// SQLite storage using Node's built-in node:sqlite (Node 22.13+). No native modules to build.
'use strict';
const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DB_PATH = process.env.DATABASE_PATH || path.join(__dirname, 'data', 'sokoni.sqlite');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')";
db.exec(`
CREATE TABLE IF NOT EXISTS members (                 -- trade members (shops, restaurants, caterers, online stores, wholesalers)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,                     -- TM-XXXXX
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL,                        -- shop | restaurant | caterer | online | wholesaler | other
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  town TEXT,
  postcode TEXT,
  interests TEXT,                                     -- comma list of category keys
  spend_band TEXT,
  buys_now TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',                 -- new | contacted | approved | stocking | declined
  listed INTEGER NOT NULL DEFAULT 0,                  -- 1 = show in the public directory (only when stocking)
  notes TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS brand_applications (      -- East African brands that want to enter the UK
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,                     -- BR-XXXXX
  brand_name TEXT NOT NULL,
  company TEXT,
  country TEXT NOT NULL,
  category TEXT NOT NULL,
  products TEXT,
  website TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  export_experience TEXT,
  certifications TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',                 -- new | replied | samples | terms | live | declined
  notes TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS enquiries (               -- supermarket / wholesale buyers and the general contact form
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,                                 -- buyer | contact
  organisation TEXT,
  role TEXT,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  interest TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',                 -- new | replied | meeting | listed | declined
  notes TEXT,
  ip TEXT,
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS newsletter (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  audience TEXT NOT NULL DEFAULT 'trade',             -- trade | brand | customer
  created_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE TABLE IF NOT EXISTS prospects (               -- the outreach database (imported from the spreadsheet / CSV)
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT NOT NULL,
  business_type TEXT NOT NULL DEFAULT 'shop',         -- shop | restaurant | community | wholesaler | other
  segment TEXT,
  cuisine_or_stock TEXT,
  address TEXT,
  city TEXT,
  postcode TEXT,
  website TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,                                         -- research notes (from the import)
  verified TEXT,
  source_url TEXT,
  priority TEXT NOT NULL DEFAULT 'B',                 -- A | B | C
  status TEXT NOT NULL DEFAULT 'not started',         -- not started | contacted | replied | sample sent | member | stocking | declined
  owner TEXT,                                         -- Zak | Tash | Both
  next_action TEXT,
  next_date TEXT,
  admin_notes TEXT,
  member_id INTEGER,                                  -- set when converted to a trade member
  created_at TEXT NOT NULL DEFAULT (${NOW}),
  updated_at TEXT NOT NULL DEFAULT (${NOW})
);
CREATE INDEX IF NOT EXISTS idx_members_created ON members(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_brands_created ON brand_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enq_created ON enquiries(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prospects_city ON prospects(city);
CREATE UNIQUE INDEX IF NOT EXISTS idx_prospects_name_city ON prospects(business_name, city);
`);

const TABLES = {
  members: {
    columns: ['id','reference','business_name','business_type','contact_name','email','phone','website','town','postcode','interests','spend_band','buys_now','message','status','listed','notes','created_at'],
    editable: { status: ['new','contacted','approved','stocking','declined'], listed: ['0','1'], notes: null },
  },
  brand_applications: {
    columns: ['id','reference','brand_name','company','country','category','products','website','contact_name','email','phone','export_experience','certifications','message','status','notes','created_at'],
    editable: { status: ['new','replied','samples','terms','live','declined'], notes: null },
  },
  enquiries: {
    columns: ['id','kind','organisation','role','contact_name','email','interest','message','status','notes','created_at'],
    editable: { status: ['new','replied','meeting','listed','declined'], notes: null },
  },
  newsletter: {
    columns: ['id','email','audience','created_at'],
    editable: {},
  },
  prospects: {
    columns: ['id','business_name','business_type','segment','cuisine_or_stock','address','city','postcode','website','phone','email','notes','verified','source_url','priority','status','owner','next_action','next_date','admin_notes','member_id','created_at','updated_at'],
    editable: { status: ['not started','contacted','replied','sample sent','member','stocking','declined'], priority: ['A','B','C'], owner: ['','Zak','Tash','Both'], next_action: null, next_date: null, admin_notes: null },
  },
};

function insert(table, row) {
  const cols = Object.keys(row);
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`;
  const info = db.prepare(sql).run(...cols.map((c) => (row[c] === undefined ? null : row[c])));
  return Number(info.lastInsertRowid);
}

function list(table, { limit = 2000 } = {}) {
  const t = TABLES[table];
  if (!t) throw new Error('unknown table');
  const order = table === 'prospects' ? 'priority ASC, city ASC, business_name ASC' : 'created_at DESC, id DESC';
  return db.prepare(`SELECT ${t.columns.join(',')} FROM ${table} ORDER BY ${order} LIMIT ?`).all(limit);
}

function get(table, id) {
  const t = TABLES[table];
  if (!t) throw new Error('unknown table');
  return db.prepare(`SELECT ${t.columns.join(',')} FROM ${table} WHERE id = ?`).get(id);
}

function updateEditable(table, id, patch) {
  const t = TABLES[table];
  if (!t) throw new Error('unknown table');
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    if (!(k in t.editable)) continue;
    const allowed = t.editable[k];
    const val = v === undefined || v === null ? null : String(v);
    if (allowed && !allowed.includes(val === null ? '' : val)) throw new Error(`invalid value for ${k}`);
    sets.push(`${k} = ?`);
    vals.push(k === 'listed' ? Number(val) : val);
  }
  if (!sets.length) return 0;
  if (table === 'prospects') sets.push(`updated_at = ${NOW}`);
  vals.push(id);
  return Number(db.prepare(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = ?`).run(...vals).changes);
}

function stats() {
  const m = db.prepare(`SELECT COUNT(*) AS n, SUM(status='new') AS fresh, SUM(status='stocking') AS stocking FROM members`).get();
  const b = db.prepare(`SELECT COUNT(*) AS n, SUM(status='new') AS fresh, SUM(status='live') AS live FROM brand_applications`).get();
  const e = db.prepare(`SELECT COUNT(*) AS n, SUM(status='new') AS fresh FROM enquiries`).get();
  const p = db.prepare(`SELECT COUNT(*) AS n, SUM(status='not started') AS untouched, SUM(status IN ('member','stocking')) AS won FROM prospects`).get();
  const news = db.prepare(`SELECT COUNT(*) AS n FROM newsletter`).get();
  return {
    members: m.n, new_members: m.fresh || 0, stocking: m.stocking || 0,
    brands: b.n, new_brands: b.fresh || 0, live_brands: b.live || 0,
    enquiries: e.n, new_enquiries: e.fresh || 0,
    prospects: p.n, prospects_untouched: p.untouched || 0, prospects_won: p.won || 0,
    newsletter: news.n,
  };
}

function publicStats() {
  const m = db.prepare(`SELECT COUNT(*) AS n FROM members WHERE status != 'declined'`).get();
  const b = db.prepare(`SELECT COUNT(*) AS n FROM brand_applications WHERE status != 'declined'`).get();
  return { members: m.n, brands: b.n };
}

function directory() {
  return db.prepare(`SELECT business_name, business_type, town, postcode, website, interests FROM members WHERE listed = 1 AND status = 'stocking' ORDER BY town, business_name`).all();
}

function referenceExists(ref) {
  return !!(db.prepare('SELECT 1 FROM members WHERE reference = ?').get(ref) || db.prepare('SELECT 1 FROM brand_applications WHERE reference = ?').get(ref));
}

// ---------- prospects: CSV import ----------
function parseCSV(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  const header = (rows.shift() || []).map((h) => h.trim().toLowerCase().replace(/\s+/g, '_'));
  return rows.filter((r) => r.some((v) => v && v.trim())).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] || '').trim()])));
}

const PROSPECT_IMPORT_COLS = ['business_name','business_type','segment','cuisine_or_stock','address','city','postcode','website','phone','email','notes','verified','source_url','priority','status','owner','next_action','next_date','admin_notes'];
const upsertProspect = db.prepare(`INSERT INTO prospects (${PROSPECT_IMPORT_COLS.join(',')}) VALUES (${PROSPECT_IMPORT_COLS.map((c) => '@' + c).join(',')})
  ON CONFLICT(business_name, city) DO UPDATE SET
    segment = excluded.segment, cuisine_or_stock = excluded.cuisine_or_stock, address = excluded.address, postcode = excluded.postcode,
    website = excluded.website, phone = excluded.phone, email = excluded.email, notes = excluded.notes, verified = excluded.verified,
    source_url = excluded.source_url, priority = excluded.priority, updated_at = ${NOW}`);

function importProspects(csvText) {
  const rows = parseCSV(csvText);
  let imported = 0, skipped = 0;
  db.exec('BEGIN');
  try {
    for (const r of rows) {
      if (!r.business_name) { skipped++; continue; }
      const rec = {};
      for (const c of PROSPECT_IMPORT_COLS) rec[c] = r[c] || null;
      rec.business_type = ['shop','restaurant','community','wholesaler','other'].includes(rec.business_type) ? rec.business_type : 'other';
      rec.priority = ['A','B','C'].includes((rec.priority || '').toUpperCase()) ? rec.priority.toUpperCase() : 'B';
      rec.status = TABLES.prospects.editable.status.includes((rec.status || '').toLowerCase()) ? rec.status.toLowerCase() : 'not started';
      rec.city = rec.city || '';
      upsertProspect.run(rec);
      imported++;
    }
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { imported, skipped, total: rows.length };
}

function seedProspectsIfEmpty() {
  const n = db.prepare('SELECT COUNT(*) AS n FROM prospects').get().n;
  if (n > 0 || process.env.SEED_PROSPECTS === '0') return { seeded: 0 };
  const file = path.join(__dirname, 'data', 'seed', 'prospects.csv');
  if (!fs.existsSync(file)) return { seeded: 0 };
  const r = importProspects(fs.readFileSync(file, 'utf8'));
  console.log(`[db] seeded ${r.imported} prospects from data/seed/prospects.csv`);
  return { seeded: r.imported };
}

// Turn a prospect into a trade member (admin action) — copies what we know, marks the prospect as 'member'.
function convertProspect(id, makeReference) {
  const p = get('prospects', id);
  if (!p) return null;
  if (p.member_id) return get('members', p.member_id);
  const memberId = insert('members', {
    reference: makeReference('TM'), business_name: p.business_name,
    business_type: ['shop','restaurant','wholesaler'].includes(p.business_type) ? p.business_type : (p.business_type === 'community' ? 'other' : 'other'),
    contact_name: 'Added from prospects', email: p.email || 'unknown@example.invalid', phone: p.phone || null, website: p.website || null,
    town: p.city || null, postcode: p.postcode || null, interests: null, spend_band: null, buys_now: null,
    message: p.cuisine_or_stock || null, status: 'approved', listed: 0, notes: `Converted from prospect #${p.id}. ${p.admin_notes || ''}`.trim(),
  });
  db.prepare(`UPDATE prospects SET member_id = ?, status = CASE WHEN status IN ('member','stocking') THEN status ELSE 'member' END, updated_at = ${NOW} WHERE id = ?`).run(memberId, id);
  return get('members', memberId);
}

module.exports = { db, TABLES, insert, list, get, updateEditable, stats, publicStats, directory, referenceExists, importProspects, seedProspectsIfEmpty, convertProspect, parseCSV, DB_PATH };
