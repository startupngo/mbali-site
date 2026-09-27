// Assembles public/*.html from src-pages/*.html + shared header/footer. Run: node scripts/build-pages.js
const fs = require('node:fs'); const path = require('node:path');
const cfg = require('../config');
const src = path.join(__dirname, '..', 'src-pages'); const out = path.join(__dirname, '..', 'public');
const header = fs.readFileSync(path.join(src, '_header.html'), 'utf8');
const footer = fs.readFileSync(path.join(src, '_footer.html'), 'utf8');
const brand = (s) => s.replace(/{{BRAND_UPPER}}/g, cfg.BRAND.toUpperCase()).replace(/{{BRAND}}/g, cfg.BRAND);
for (const f of fs.readdirSync(src)) {
  if (f.startsWith('_') || !f.endsWith('.html')) continue;
  const body = brand(fs.readFileSync(path.join(src, f), 'utf8'));
  const title = (body.match(/<!--\s*title:\s*(.*?)\s*-->/) || [, cfg.BRAND])[1];
  const desc = (body.match(/<!--\s*desc:\s*(.*?)\s*-->/) || [, cfg.TAGLINE])[1];
  const page = brand(header).replace(/{{TITLE}}/g, title).replace(/{{DESC}}/g, desc) + body + brand(footer);
  fs.writeFileSync(path.join(out, f), page);
  console.log('built', f);
}
