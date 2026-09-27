import asyncio, base64, os, subprocess, time, tempfile, urllib.request
from playwright.async_api import async_playwright

PORT = 3499
env = dict(os.environ, PORT=str(PORT), DATABASE_PATH=os.path.join(tempfile.mkdtemp(), 'shots.sqlite'), ADMIN_USER='zak', ADMIN_PASSWORD='demo-pass', SMTP_HOST='')
srv = subprocess.Popen(['node', 'server.js'], env=env, cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
base = f'http://localhost:{PORT}'
for _ in range(50):
    try:
        urllib.request.urlopen(base + '/healthz'); break
    except Exception:
        time.sleep(0.1)
OUT = '/home/claude/ea-site/shots'
os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        # desktop
        pg = await b.new_page(viewport={'width': 1360, 'height': 900}, device_scale_factor=1.5)
        for name in ['index', 'trade', 'brands', 'buyers', 'directory']:
            await pg.goto(f'{base}/{"" if name == "index" else name}')
            await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'{OUT}/{name}.png', full_page=True)
        # a filled trade form → success panel
        await pg.goto(f'{base}/trade'); await pg.wait_for_timeout(600)
        await pg.fill('#business_name', 'Kenyan Spice Kitchen')
        await pg.select_option('#business_type', 'restaurant')
        await pg.fill('#contact_name', 'Test Owner'); await pg.fill('#email', 'owner@example.com')
        await pg.fill('#town', 'Leicester'); await pg.fill('#postcode', 'LE5 5TP')
        await pg.click('label.tick:has-text("Chilli oils")'); await pg.click('label.tick:has-text("Spice blends")')
        await pg.check('#consent')
        await pg.click('button[type=submit]'); await pg.wait_for_timeout(800)
        await pg.screenshot(path=f'{OUT}/trade-success.png', full_page=False)
        # admin (basic auth)
        ctx = await b.new_context(viewport={'width': 1400, 'height': 900}, device_scale_factor=1.5, http_credentials={'username': 'zak', 'password': 'demo-pass'})
        ad = await ctx.new_page()
        await ad.goto(f'{base}/admin'); await ad.wait_for_timeout(1200)
        await ad.screenshot(path=f'{OUT}/admin-prospects.png', full_page=False)
        await ad.click('button[data-table=members]'); await ad.wait_for_timeout(800)
        await ad.screenshot(path=f'{OUT}/admin-members.png', full_page=False)
        # mobile
        m = await b.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True)
        await m.goto(base); await m.wait_for_timeout(700)
        await m.screenshot(path=f'{OUT}/mobile-home.png', full_page=True)
        await m.goto(f'{base}/trade'); await m.wait_for_timeout(700)
        await m.screenshot(path=f'{OUT}/mobile-trade.png', full_page=False)
        await b.close()

try:
    asyncio.run(main())
finally:
    srv.terminate()
print('done')
