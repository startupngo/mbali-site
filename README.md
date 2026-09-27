# East African distribution site (Mbali — mbali.co)

A complete front end + back end for the UK distribution business: free **trade membership** for shops and restaurants, **brand applications** from East African producers, **buyer enquiries** from supermarkets and wholesalers, a public **stockist finder**, a newsletter, and a password-protected **admin** that holds the **prospect database** (86 shops, restaurants and community channels pre-loaded from the research spreadsheet). Plain Node.js — no build step, no frameworks, no native modules.

## What's inside

| Path | What it does |
|---|---|
| `server.js` | Express server: pages, JSON API, admin API (HTTP Basic Auth), rate limiting, honeypot spam trap |
| `db.js` | SQLite via Node's built-in `node:sqlite` — tables are created on first run; prospects are seeded from `data/seed/prospects.csv` |
| `config.js` | The brand name, categories, business types, spend bands, countries — one place to edit |
| `notify.js` | Emails you on every new submission once SMTP is configured; logs to the console otherwise |
| `public/` | The website: `index`, `trade`, `brands`, `buyers`, `directory`, `contact`, `privacy`, `404`, `admin` + CSS/JS/images |
| `src-pages/` + `scripts/build-pages.js` | Page sources with the shared header/footer. Edit here, then run `npm run build` |
| `data/seed/prospects.csv` | The prospect list (same rows as the Excel workbook). Loaded automatically into an empty database |
| `test/smoke.test.js` | End-to-end check of every page, form and admin endpoint (`npm test`) |
| `Dockerfile`, `render.yaml` | Ready-made deploy configs |

## Run it on your computer

```bash
npm install
cp .env.example .env       # then set ADMIN_PASSWORD (and BRAND_NAME if you've chosen a name)
npm run build              # assembles the pages from src-pages/
npm start                  # http://localhost:3000  ·  admin at http://localhost:3000/admin
```

Needs Node 22.13 or newer. `npm test` builds the pages and runs the smoke test on a throwaway database.

## Change the name

The name is a placeholder. Set `BRAND_NAME=YourName` in `.env` (or in `config.js`), run `npm run build`, restart. The header, titles, footer and admin realm all update. The favicon (`public/img/favicon.svg`) and the hero illustration are yours to replace.

## Put it live (about 10 minutes)

The database is a single SQLite file, so the host needs a **persistent disk**.

**Render (simplest)** — push this folder to a GitHub repo, then *New → Blueprint* and point it at the repo. `render.yaml` sets up a Node web service with a 1 GB disk at `/data`. Set `ADMIN_PASSWORD` and `SITE_URL` when prompted. Add your domain under *Settings → Custom Domains*.

**Railway** — *New project → Deploy from GitHub*, add a Volume at `/data`, set the variables from `.env.example` (`DATABASE_PATH=/data/sokoni.sqlite`).

**Fly.io / any Docker host** — `Dockerfile` included; mount a volume at `/data`.

Free tiers spin down when idle; paid starter tiers (~£5–7/month) stay warm.

## Environment variables

| Variable | Notes |
|---|---|
| `BRAND_NAME` | The business name shown everywhere (default `Mbali`) |
| `ADMIN_USER`, `ADMIN_PASSWORD` | Admin login. **Set a strong password before going live.** |
| `DATABASE_PATH` | Where the SQLite file lives — on a host, the persistent disk, e.g. `/data/sokoni.sqlite` |
| `SEED_PROSPECTS` | `0` to skip loading `data/seed/prospects.csv` into an empty database |
| `SITE_URL` | Public URL, used in notification emails |
| `NOTIFY_TO`, `SMTP_*` | Optional email notifications (Resend, Postmark, Brevo, Gmail app password…) |
| `PORT` | Set by most hosts automatically |

## The API (what the forms call)

| Method + path | Body | Result |
|---|---|---|
| `GET /api/config` | — | brand, categories, business types, spend bands, countries (the forms build their options from this) |
| `GET /api/public-stats` | — | `members`, `brands` counts + `founding_cap` for the founding-members bar — no personal data |
| `GET /api/directory` | — | stockists shown in the finder: only members with status `stocking` **and** `listed = 1`; name, type, town, postcode, website only |
| `POST /api/members` | `business_name, business_type, contact_name, email, phone?, website_url?, town?, postcode?, interests[]?, spend_band?, buys_now?, message?, consent` | `{reference: "TM-XXXXX"}` |
| `POST /api/brand-applications` | `brand_name, company?, country, category, products?, website_url?, contact_name, email, phone?, export_experience?, certifications?, message?` | `{reference: "BR-XXXXX"}` |
| `POST /api/enquiries` | `kind: buyer|contact, organisation (buyer), role?, contact_name, email, interest?, message` | `{id}` |
| `POST /api/newsletter` | `email, audience?` | `{ok}` |
| `GET /api/admin/stats` · `GET /api/admin/:table` · `PATCH /api/admin/:table/:id` · `GET /api/admin/:table.csv` | Basic Auth | `:table` is `prospects`, `members`, `brand_applications`, `enquiries` or `newsletter` |
| `POST /api/admin/prospects/import` | CSV text (`Content-Type: text/csv`) | upserts by business name + city; keeps your status/owner/notes on rows that already exist |
| `POST /api/admin/prospects/:id/convert` | — | creates a trade member from a prospect (once) and marks the prospect `member` |

Every public POST has a hidden `website` honeypot field and a limit of 20 submissions per 10 minutes per IP.

## The admin (`/admin`)

- **Prospects to call** — the outreach database. Priority A/B/C, status pipeline (`not started → contacted → replied → sample sent → member → stocking`, or `declined`), owner (Zak / Tash / Both), next action + date, your notes, phone/email/website links, research note and source. Filters by status, priority and type; search; **Import CSV** (the spreadsheet's columns) and **Export CSV**. *Make member* turns a prospect into a trade member record.
- **Trade members** — sign-ups from the site. Set status; set **In finder → Listed** once they are stocking so they appear in the public stockist finder.
- **Brand applications**, **Buyers & contact**, **Newsletter** — statuses and notes; CSV export on every tab.

Changes save the moment you pick a value. Sign out with the button (browsers cache Basic Auth).

## Before launch — checklist

- [ ] Choose the name (`BRAND_NAME`) and replace the favicon
- [ ] Set `ADMIN_PASSWORD` (and change `ADMIN_USER`)
- [ ] Replace the `[bracketed]` placeholders: company name, address, email, council registration line (footer, privacy page), minimum order `[£75]`, van delivery area `[the Midlands]`, press contact
- [ ] Decide the founding-members offer (`FOUNDING_MEMBER_CAP` in `config.js`; wording on the home and trade pages)
- [ ] Register the food business with the council (free, 28 days before trading) and pay the ICO data-protection fee before outreach starts
- [ ] Set up SMTP so you get an email per submission (optional — the admin has everything)
- [ ] Re-verify any prospect marked `directory-only` before you rely on its details

## Changing content

Edit the files in `src-pages/` (the header and footer are `_header.html` and `_footer.html`), then run `npm run build`. Form options live in `config.js`.
