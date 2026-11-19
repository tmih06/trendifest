// capture.mjs [take ...]: records real use of the running TRENDIFEST app (PROMO_APP_URL, default
// http://127.0.0.1:8787) as frame sequences for the V5 product-tour shots.
//
// Approach: CDP screencast at deviceScaleFactor 2 (a 1280x760 layout delivered as 2560x1520 JPEGs), so the
// film can push in on a panel and stay sharp. Playwright's recordVideo was rejected: it encodes VP8 at a low
// bitrate and its 1280x720 takes went soft when V4 scaled them. Screencast frames arrive only when the page
// repaints, each with a timestamp; resample.py turns them into a fixed 30 fps sequence (holding the last frame).
//
// Every take is read-only against the app's data: it navigates, pans, zooms, hovers, opens panels and
// disclosures, and never submits a watch, merge, split or collection. The pointer is a drawn cursor
// injected into the page (a capture aid only; headless Chrome draws none).
// Output: takes/<name>/NNNNN.jpg plus takes/<name>/times.json ([seconds since the take started, ...]).
import { launch } from './kf/browser.mjs';
import { mkdir, writeFile, rm } from 'node:fs/promises';

const base = process.env.PROMO_APP_URL ?? 'http://127.0.0.1:8787';
const root = new URL('../takes/', import.meta.url).pathname;
const W = 1280, H = 760;

/** Injects a macOS-style arrow cursor that follows pointer events, with a soft ring on press. */
function cursorScript() {
  addEventListener('DOMContentLoaded', () => {
    const c = document.createElement('div');
    c.innerHTML = '<svg width="26" height="34" viewBox="0 0 26 34"><path d="M2 2 L2 27 L8.5 21 L13 31.5 L17.5 29.5 L13 19.5 L22 19.5 Z" fill="#fff" stroke="#000" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.45));transform:translate(-100px,-100px)';
    const ring = document.createElement('div');
    ring.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483646;width:44px;height:44px;margin:-22px 0 0 -22px;border-radius:50%;background:rgba(140,108,255,.35);border:2px solid rgba(190,170,255,.9);pointer-events:none;opacity:0';
    document.body.append(ring, c);
    addEventListener('pointermove', e => { c.style.transform = 'translate(' + (e.clientX - 2) + 'px,' + (e.clientY - 2) + 'px)'; }, true);
    addEventListener('pointerdown', e => {
      ring.style.left = e.clientX + 'px'; ring.style.top = e.clientY + 'px';
      ring.animate([{ opacity: 1, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.5)' }], { duration: 520, easing: 'cubic-bezier(.2,.7,.2,1)' });
    }, true);
  });
}

/** Moves the pointer along an ease-in-out path (Playwright's own steps are linear and read as robotic). */
async function glide(page, from, to, ms = 700) {
  const n = Math.max(2, Math.round(ms / 16));
  for (let i = 1; i <= n; i++) {
    const u = i / n, e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    await page.mouse.move(from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e);
    await page.waitForTimeout(16);
  }
  return to;
}

/** Centre of a locator's box, scrolled into view first. */
async function centre(loc) {
  await loc.scrollIntoViewIfNeeded();
  const b = await loc.boundingBox();
  return [b.x + b.width / 2, b.y + b.height / 2];
}

const nav = (page, title) => page.getByTitle(title, { exact: true }).first();
const inspector = page => page.getByRole('complementary', { name: 'Topic inspector' });
const firstRow = page => page.getByRole('button', { name: /^Xem bằng chứng: / }).first();

// Each take: setup (not recorded) then act (recorded). Pointer state is threaded through as `at`.
const TAKES = {
  // the live event graph: settle, pan by dragging, zoom with the wheel, hover a cluster
  async graph(page, rec) {
    await page.locator('canvas').first().waitFor(); await page.waitForTimeout(3500);
    let at = [900, 600]; await page.mouse.move(...at);
    await rec.start();
    await page.waitForTimeout(500);
    at = await glide(page, at, [560, 380], 900);
    await page.mouse.down(); at = await glide(page, at, [660, 420], 1100); await page.mouse.up();
    await page.waitForTimeout(300);
    for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -90); await page.waitForTimeout(120); }
    await page.waitForTimeout(700);
    at = await glide(page, at, [720, 360], 900);
    await page.waitForTimeout(1500);
  },
  // the ranked topic board, then a topic's evidence in the inspector (reach, new evidence, spread bars)
  async board(page, rec) {
    await nav(page, 'Bảng chủ đề').click(); await firstRow(page).waitFor(); await page.waitForTimeout(1200);
    let at = [640, 500]; await page.mouse.move(...at);
    await rec.start();
    await page.waitForTimeout(400);
    const rows = page.getByRole('button', { name: /^Xem bằng chứng: / });
    at = await glide(page, at, await centre(rows.nth(2)), 700); await page.waitForTimeout(250);
    at = await glide(page, at, await centre(rows.nth(1)), 450); await page.waitForTimeout(250);
    at = await glide(page, at, await centre(rows.nth(0)), 450); await page.waitForTimeout(300);
    await page.mouse.down(); await page.mouse.up(); await rows.nth(0).click();
    await inspector(page).waitFor(); await page.waitForTimeout(1800);
    at = await glide(page, at, [1130, 470], 800);
    for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, 110); await page.waitForTimeout(140); }
    await page.waitForTimeout(1600);
  },
  // source-grounded timeline: every claim links back to the original post or report
  async evidence(page, rec) {
    await nav(page, 'Bảng chủ đề').click(); await firstRow(page).click(); await inspector(page).waitFor(); await page.waitForTimeout(1200);
    const open = inspector(page).getByText('Open topic timeline', { exact: true });
    let at = [900, 400]; await page.mouse.move(...at);
    await rec.start();
    await page.waitForTimeout(300);
    at = await glide(page, at, await centre(open), 900); await page.waitForTimeout(250);
    await open.click();
    const tl = inspector(page).getByRole('list', { name: 'Source-grounded topic timeline' }); await tl.waitFor();
    await page.waitForTimeout(500);
    await tl.scrollIntoViewIfNeeded(); await page.waitForTimeout(600);
    const link = tl.getByRole('link').first();
    at = await glide(page, at, await centre(link), 800);
    await page.waitForTimeout(1800);
  },
  // human-in-the-loop: open the review disclosure (merge / split controls), never submit
  async review(page, rec) {
    await nav(page, 'Bảng chủ đề').click(); await firstRow(page).click(); await inspector(page).waitFor(); await page.waitForTimeout(1200);
    const sum = inspector(page).getByText('Review topic grouping', { exact: true });
    await sum.scrollIntoViewIfNeeded(); await page.waitForTimeout(400);
    let at = [900, 300]; await page.mouse.move(...at);
    await rec.start();
    await page.waitForTimeout(300);
    at = await glide(page, at, await centre(sum), 900); await page.waitForTimeout(250);
    await sum.click(); await page.waitForTimeout(1500);
    for (let i = 0; i < 4; i++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(150); }
    await page.waitForTimeout(1800);
  },
};

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(TAKES);
const b = await launch();
try {
  for (const name of names) {
    if (!TAKES[name]) throw Error('unknown take ' + name);
    const dir = root + name + '/'; await rm(dir, { recursive: true, force: true }); await mkdir(dir, { recursive: true });
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, colorScheme: 'dark' });
    const page = await ctx.newPage();
    await page.addInitScript(() => localStorage.setItem('trendifest-theme', 'dark'));
    await page.addInitScript(cursorScript);
    await page.goto(base + '/app');
    await page.getByRole('list', { name: 'Topics ranked by potential' }).waitFor({ state: 'attached' });
    const cdp = await ctx.newCDPSession(page);
    const times = []; let t0 = null, n = 0; const writes = [];
    cdp.on('Page.screencastFrame', f => {
      cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
      if (t0 == null) t0 = f.metadata.timestamp;
      times.push(+(f.metadata.timestamp - t0).toFixed(4));
      writes.push(writeFile(dir + String(n++).padStart(5, '0') + '.jpg', Buffer.from(f.data, 'base64')));
    });
    const rec = { start: () => cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * 2, maxHeight: H * 2, everyNthFrame: 1 }) };
    await TAKES[name](page, rec);
    await cdp.send('Page.stopScreencast');
    await Promise.all(writes);
    await writeFile(dir + 'times.json', JSON.stringify(times));
    console.log(name, n, 'frames over', times.at(-1)?.toFixed(2), 's');
    await ctx.close();
  }
} finally { await b.close(); }
