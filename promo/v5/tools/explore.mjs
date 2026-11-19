// explore.mjs: screenshots of the live app's main views at 1920x1080, to plan the V5 app shots.
import { chromium } from 'playwright';
const base = process.env.PROMO_APP_URL ?? 'http://127.0.0.1:8787';
const out = process.argv[2] || '/tmp/v5cap';
const b = await chromium.launch({ args: ['--no-sandbox'] });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await ctx.newPage();
await p.addInitScript(() => localStorage.setItem('trendifest-theme', 'dark'));
await p.goto(base + '/'); await p.waitForTimeout(2500); await p.screenshot({ path: out + '/landing.png' });
await p.goto(base + '/app'); await p.locator('canvas').first().waitFor(); await p.waitForTimeout(4000);
await p.screenshot({ path: out + '/graph.png' });
for (const [n, t] of [['board', 'Bảng chủ đề'], ['watch', 'Theo dõi và cảnh báo'], ['sources', 'Tất cả nguồn đã thu thập']]) {
  await p.getByTitle(t, { exact: true }).first().click(); await p.waitForTimeout(2500); await p.screenshot({ path: out + '/' + n + '.png' });
}
await p.getByTitle('Bảng chủ đề', { exact: true }).first().click(); await p.waitForTimeout(1500);
const row = p.getByRole('button', { name: /^Xem bằng chứng: / }).first();
await row.click(); await p.waitForTimeout(2500); await p.screenshot({ path: out + '/inspector.png' });
await b.close();
