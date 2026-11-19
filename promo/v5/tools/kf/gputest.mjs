import { chromium } from 'playwright';
const flags = JSON.parse(process.argv[2]);
const b = await chromium.launch({ args: ['--run-all-compositor-stages-before-draw', '--disable-checker-imaging', ...flags] });
const pg = await b.newPage({ viewport: { width: 1920, height: 1300 } });
await pg.goto(process.env.FILM_URL + 'index.html?render=1'); await pg.waitForFunction(() => window.__ready, null, { timeout: 120000 });
console.log('renderer', await pg.evaluate(() => { const g = document.createElement('canvas').getContext('webgl'); if (!g) return 'no webgl'; const e = g.getExtension('WEBGL_debug_renderer_info'); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : g.getParameter(g.RENDERER); }));
const cdp = await pg.context().newCDPSession(pg);
const t0 = Date.now();
for (let i = 0; i < 20; i++) { await pg.evaluate(t => new Promise(r => { Promise.resolve(window.__seek(t)).then(() => requestAnimationFrame(() => r())); }), 20.3 + i / 60); await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 95, optimizeForSpeed: true, clip: { x: 0, y: 0, width: 1920, height: 1080, scale: 1 } }); }
console.log('ms/sample', (Date.now() - t0) / 20);
await b.close();