import { chromium } from 'playwright';
import { mkdir, rename } from 'node:fs/promises';

const base = process.env.PROMO_APP_URL ?? 'http://127.0.0.1:8787';
const shots = process.argv.slice(2);
const dir = new URL('./media/', import.meta.url);
const width = 1280, height = 720;
const map = await (await fetch(base + '/api/trend-map?hours=168')).json();
const topic = map.nodes.find(n => n.publishers >= 2 && map.edges.some(e => e.source === n.id || e.target === n.id));
if (!topic) throw Error('Collect enough public evidence for a related topic with two publishers.');
await mkdir(dir, {recursive:true});
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args:['--no-sandbox'] });

/** Records normal UI events against the real backend. The large pointer is a capture aid only. */
async function capture(name) {
  const context = await browser.newContext({ viewport:{width,height}, recordVideo:{dir:dir.pathname,size:{width,height}} });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem('trendifest-theme','light'));
  const video = page.video();
  try {
    await page.goto(base + '/app');
    await page.getByRole('button',{name:'Đồ thị xu hướng',exact:true}).waitFor();
    page.setDefaultTimeout(10_000);
    await page.locator('canvas').first().waitFor();
    await page.evaluate(() => {
      const dot = document.createElement('div');
      dot.style.cssText = 'position:fixed;z-index:99999;left:0;top:0;width:19px;height:19px;border-radius:50%;border:2px solid white;background:#4b37ea;box-shadow:0 0 0 1px #3724cf,0 2px 5px #20204077;pointer-events:none;opacity:0';
      document.body.append(dot);
      addEventListener('pointermove', e => { dot.style.opacity=1; dot.style.transform='translate('+ (e.clientX-9)+'px,'+(e.clientY-9)+'px)'; });
      addEventListener('pointerdown', () => dot.animate([{scale:1},{scale:1.75},{scale:1}],{duration:420}));
    });
    /** Allow the viewer to read each actual result before sending the next event. */
    const pause = ms => page.waitForTimeout(ms);
    /** Move visibly before activating the control, including controls in the inspector scroller. */
    async function click(control) {
      const el=control.first();
      await el.scrollIntoViewIfNeeded();
      const b=await el.boundingBox();
      await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:11});
      await pause(230);
      await el.click();
    }
    // Sidebar accessible names include a changing topic count; the title is stable.
    const nav = name => page.getByTitle(name,{exact:true});
    const inspector = page.getByRole('complementary',{name:'Topic inspector'});
    const row = page.getByRole('button',{name:'Xem bằng chứng: '+topic.label,exact:true});
    await page.getByRole('list',{name:'Topics ranked by potential'}).waitFor({state:'attached'});
    if(name==='graph') {
      await pause(1300);
      await page.mouse.move(643,365,{steps:13});
      await page.mouse.down();
      await page.mouse.move(765,403,{steps:25});
      await page.mouse.up();
      await pause(950);
      await page.mouse.wheel(0,-360);
      await pause(1650);
      const candidate=inspector.getByRole('button').filter({hasText:topic.label}).first();
      if(!(await candidate.isVisible())) await click(page.getByRole('button',{name:'Toggle topic inspector'}));
      await click(candidate);
      await inspector.getByText('Related topics',{exact:true}).waitFor();
      await pause(4500);
    } else {
      await pause(650);
      await click(nav('Bảng chủ đề'));
      await row.waitFor();
      await pause(name==='board' ? 1950 : 380);
      await click(row);
      if(name==='board') {
        await pause(4700);
      } else if(name==='evidence') {
        await click(inspector.getByText('Open topic timeline',{exact:true}));
        const timeline=inspector.getByRole('list',{name:'Source-grounded topic timeline'});
        await timeline.waitFor();
        const source=timeline.getByRole('link').first();
        await source.scrollIntoViewIfNeeded();
        await pause(4200);
        const popupPromise = page.waitForEvent('popup');
        await click(source);
        const popup = await popupPromise;
        console.log('Original source opened:', await source.getAttribute('href'));
        await popup.close();
        await pause(1200);
      } else if(name==='watch') {
        await click(inspector.getByRole('button',{name:'Follow topic',exact:true}));
        await page.getByRole('button',{name:'Follow',exact:true}).waitFor();
        await pause(1400);
        await click(page.getByRole('button',{name:'Follow',exact:true}));
        await pause(4500);
      }
    }
  } finally {
    await context.close();
    await rename(await video.path(), new URL(name+'.webm',dir));
  }
}
try {
  console.log('Captured topic:',topic.label);
  const names = shots.length ? shots : ['graph','board','evidence','watch'];
  for (const name of names) if (!['graph','board','evidence','watch'].includes(name)) throw Error('Unknown shot: '+name);
  const results = await Promise.allSettled(names.map(async name => { await capture(name); console.log('Recorded',name); }));
  for (const result of results) if (result.status === 'rejected') throw result.reason;
} finally { await browser.close(); }
