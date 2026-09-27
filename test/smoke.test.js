// Smoke test: starts the server on a temp database, seeds prospects, submits every form, checks the admin API. Run: npm test
'use strict';
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');

const PORT = 3457;
const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'ea-test-')), 'test.sqlite');
const env = { ...process.env, PORT: String(PORT), DATABASE_PATH: dbPath, ADMIN_USER: 'tester', ADMIN_PASSWORD: 'secret123', SMTP_HOST: '', BRAND_NAME: 'Mbali' };
const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env, stdio: ['ignore', 'pipe', 'pipe'] });
const base = `http://localhost:${PORT}`;
const auth = 'Basic ' + Buffer.from('tester:secret123').toString('base64');

async function wait() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/healthz'); if (r.ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
}
const post = (p, body, headers = {}) => fetch(base + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));
const adminGet = (p) => fetch(base + p, { headers: { Authorization: auth } });
const adminPatch = (p, body) => fetch(base + p, { method: 'PATCH', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

(async () => {
  try {
    await wait();
    // pages
    for (const p of ['/', '/trade', '/brands', '/buyers', '/directory', '/contact', '/privacy']) {
      const r = await fetch(base + p); assert.equal(r.status, 200, p);
      assert.match(await r.text(), /MBALI/, p + ' has the brand');
    }
    assert.equal((await fetch(base + '/nope')).status, 404);
    assert.equal((await fetch(base + '/admin')).status, 401, 'admin needs sign-in');
    assert.equal((await adminGet('/admin')).status, 200, 'admin opens with the password');

    // config + seeded prospects
    const cfg = await (await fetch(base + '/api/config')).json();
    assert.equal(cfg.categories.length, 5);
    const seeded = await (await adminGet('/api/admin/prospects')).json();
    assert.ok(seeded.rows.length >= 80, 'prospects seeded from CSV: ' + seeded.rows.length);
    const owino = seeded.rows.find((r) => r.business_name === 'Owino Supermarket');
    assert.ok(owino && owino.priority === 'A' && owino.status === 'not started', 'Owino imported as priority A');

    // trade member happy path
    const ok = await post('/api/members', { business_name: 'Test Grocers', business_type: 'shop', contact_name: 'Test Person', email: 'test@example.com', phone: '020 0000 0000', town: 'Leicester', postcode: 'le5 5tp', interests: ['chilli', 'spices', 'bogus'], spend_band: '£250 – £1,000 a month', buys_now: 'cash and carry', consent: true });
    assert.equal(ok.status, 201); assert.match(ok.body.reference, /^TM-[A-Z2-9]{5}$/);
    // validation
    assert.equal((await post('/api/members', { business_name: 'T', business_type: 'shop', contact_name: 'Test', email: 'a@b.co', consent: true })).body.field, 'business_name');
    assert.equal((await post('/api/members', { business_name: 'Test', business_type: 'spaceship', contact_name: 'Test', email: 'a@b.co', consent: true })).body.field, 'business_type');
    assert.equal((await post('/api/members', { business_name: 'Test', business_type: 'shop', contact_name: 'Test', email: 'nope', consent: true })).body.field, 'email');
    assert.equal((await post('/api/members', { business_name: 'Test', business_type: 'shop', contact_name: 'Test', email: 'a@b.co', consent: false })).body.field, 'consent');
    // honeypot: pretends to succeed, stores nothing
    const bot = await post('/api/members', { business_name: 'Bot', business_type: 'shop', contact_name: 'Bot', email: 'bot@example.com', consent: true, website: 'http://spam' });
    assert.equal(bot.body.reference, 'TM-THANKS');

    // brand application
    const brand = await post('/api/brand-applications', { brand_name: 'Hot Hills', company: 'Hot Hills Ltd', country: 'Rwanda', category: 'Chilli oil or hot sauce', products: 'Chilli oil 20 ml', contact_name: 'Sam', email: 'sam@hothills.rw', phone: '+250…', export_experience: 'Exported once or twice', certifications: 'RSB' });
    assert.equal(brand.status, 201); assert.match(brand.body.reference, /^BR-[A-Z2-9]{5}$/);
    assert.equal((await post('/api/brand-applications', { brand_name: 'X', country: 'Mars', category: 'Tea', contact_name: 'Sam', email: 'a@b.co' })).body.field, 'brand_name');
    assert.equal((await post('/api/brand-applications', { brand_name: 'Xy', country: 'Mars', category: 'Tea', contact_name: 'Sam', email: 'a@b.co' })).body.field, 'country');

    // buyer enquiry + contact + newsletter
    assert.equal((await post('/api/enquiries', { kind: 'buyer', organisation: 'Big Retail', role: 'Buyer', contact_name: 'Ada', email: 'ada@bigretail.co.uk', interest: 'chilli oils', message: 'Hello' })).status, 201);
    assert.equal((await post('/api/enquiries', { kind: 'buyer', contact_name: 'Ada', email: 'ada@bigretail.co.uk', message: 'Hello' })).body.field, 'organisation');
    assert.equal((await post('/api/enquiries', { kind: 'contact', contact_name: 'Jo', email: 'jo@example.com', message: 'Hi there' })).status, 201);
    assert.equal((await post('/api/enquiries', { kind: 'contact', contact_name: 'Jo', email: 'jo@example.com' })).body.field, 'message');
    assert.equal((await post('/api/newsletter', { email: 'fan@example.com', audience: 'brand' })).status, 201);
    assert.equal((await post('/api/newsletter', { email: 'fan@example.com' })).status, 201, 'duplicate email is fine');

    // public stats + directory (empty until a member is stocking + listed)
    const ps = await (await fetch(base + '/api/public-stats')).json();
    assert.equal(ps.members, 1); assert.equal(ps.brands, 1); assert.equal(ps.founding_cap, 50);
    assert.equal((await (await fetch(base + '/api/directory')).json()).members.length, 0);

    // admin API
    assert.equal((await fetch(base + '/api/admin/stats')).status, 401);
    const stats = await (await adminGet('/api/admin/stats')).json();
    assert.equal(stats.stats.members, 1); assert.equal(stats.stats.new_members, 1); assert.equal(stats.stats.brands, 1); assert.equal(stats.stats.enquiries, 2); assert.equal(stats.stats.newsletter, 1);
    const members = await (await adminGet('/api/admin/members')).json();
    assert.equal(members.rows.length, 1); assert.equal(members.rows[0].interests, 'chilli,spices'); assert.equal(members.rows[0].postcode, 'LE5 5TP');
    const mid = members.rows[0].id;
    assert.equal((await adminPatch('/api/admin/members/' + mid, { status: 'stocking', listed: '1', notes: 'First order delivered' })).body.changed, 1);
    assert.equal((await adminPatch('/api/admin/members/' + mid, { status: 'nonsense' })).status, 400);
    const dir = await (await fetch(base + '/api/directory')).json();
    assert.equal(dir.members.length, 1); assert.equal(dir.members[0].business_name, 'Test Grocers'); assert.equal(dir.members[0].town, 'Leicester');
    assert.equal(Object.keys(dir.members[0]).includes('email'), false, 'directory never exposes contact details');

    // prospects: edit, import, convert, export
    assert.equal((await adminPatch('/api/admin/prospects/' + owino.id, { status: 'contacted', owner: 'Tash', next_action: 'Drop samples', next_date: '2026-10-02', admin_notes: 'Spoke to the manager' })).body.changed, 1);
    assert.equal((await adminPatch('/api/admin/prospects/' + owino.id, { priority: 'Z' })).status, 400);
    const csv = 'business_name,business_type,city,priority,phone\n"New Shop, Ltd",shop,Leeds,A,0113 000 0000\nOwino Supermarket,shop,"London (Merton)",A,\n,shop,Nowhere,A,\n';
    const imp = await post('/api/admin/prospects/import', csv, { Authorization: auth, 'Content-Type': 'text/csv' });
    assert.equal(imp.status, 200); assert.equal(imp.body.imported, 2); assert.equal(imp.body.skipped, 1);
    const after = await (await adminGet('/api/admin/prospects')).json();
    assert.equal(after.rows.length, seeded.rows.length + 1, 'upsert: one new row, Owino updated not duplicated');
    const owino2 = after.rows.find((r) => r.business_name === 'Owino Supermarket');
    assert.equal(owino2.status, 'contacted', 'import keeps our outreach status'); assert.equal(owino2.owner, 'Tash');
    const conv = await post('/api/admin/prospects/' + owino.id + '/convert', {}, { Authorization: auth });
    assert.equal(conv.status, 200); assert.match(conv.body.member.reference, /^TM-/); assert.equal(conv.body.member.business_name, 'Owino Supermarket');
    const conv2 = await post('/api/admin/prospects/' + owino.id + '/convert', {}, { Authorization: auth });
    assert.equal(conv2.body.member.id, conv.body.member.id, 'converting twice returns the same member');
    const stats2 = await (await adminGet('/api/admin/stats')).json();
    assert.equal(stats2.stats.members, 2); assert.equal(stats2.stats.prospects_won, 1);
    const exp = await (await adminGet('/api/admin/prospects.csv')).text();
    assert.match(exp, /^id,business_name,business_type/); assert.match(exp, /"New Shop, Ltd"/);

    console.log('✔ smoke test passed: pages, seeded prospects, all forms + validation, honeypot, directory, admin stats/list/patch/import/convert/csv');
    server.kill(); process.exit(0);
  } catch (e) {
    console.error('✘ smoke test failed:', e.message);
    server.kill(); process.exit(1);
  }
})();
