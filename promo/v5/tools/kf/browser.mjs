// browser.mjs: shared by the scripts. Finds Playwright (this folder, the film folder, or a global install),
// launches Chrome with the flags a frame-exact capture needs, and knows where the film is served (FILM_URL).
import { createRequire } from 'module';
import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join, extname } from 'path';
function loadPlaywright() {
  const bases = [process.cwd() + '/', import.meta.url];
  try { bases.push(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() + '/'); } catch {}
  for (const b of bases) { try { return createRequire(b)('playwright'); } catch {} }
  console.error('Playwright not found. In the film folder run: npm install playwright (and npx playwright install chromium if Google Chrome is not installed).');
  process.exit(2);
}
export const { chromium } = loadPlaywright();
// --run-all-compositor-stages-before-draw: without it, big 3D layers are captured half rastered
// V4: under WSL2, Chrome otherwise falls back to llvmpipe (CPU raster). Mesa's d3d12 driver plus the WSL
// libraries put ANGLE on the real GPU (about 3x faster per captured sample on an RTX 5060 Ti). The GPU process
// needs its sandbox off to open /dev/dxg. KF_GPU=0 forces the CPU path.
const WSL_GPU = existsSync('/dev/dxg') && existsSync('/usr/lib/wsl/lib') && process.env.KF_GPU !== '0';
export async function launch() {
  const args = ['--run-all-compositor-stages-before-draw', '--disable-checker-imaging', '--ignore-gpu-blocklist', '--enable-gpu'];
  if (process.platform === 'darwin') args.push('--use-angle=metal');
  if (WSL_GPU) args.push('--use-gl=angle', '--use-angle=gl-egl', '--disable-gpu-sandbox');
  const env = WSL_GPU ? { ...process.env, GALLIUM_DRIVER: 'd3d12', LD_LIBRARY_PATH: ['/usr/lib/wsl/lib', process.env.LD_LIBRARY_PATH].filter(Boolean).join(':') } : process.env;
  try { return await chromium.launch({ channel: 'chrome', args, env }); } catch { return await chromium.launch({ args, env }); }
}
export const FILM_URL = (process.env.FILM_URL || 'http://127.0.0.1:5671/').replace(/\/?$/, '/');
// headless Chrome keeps about 90 px of window chrome: a 1920x1080 viewport would paint only ~990 px of the stage
export async function openFilm(b, dsf = 1, render = true) {
  const pg = await b.newPage({ viewport: { width: 1920, height: 1300 }, deviceScaleFactor: +dsf });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGE ' + e.message));
  pg.on('console', m => { if (m.type() === 'error' && !/favicon|404/.test(m.text())) errs.push('CONSOLE ' + m.text()); });
  // V5: with FILM_DIR set, every request under FILM_URL is answered from disk inside Playwright instead of over
  // loopback TCP. On this WSL2 machine about a third of parallel loopback HTTP responses stalled ~3.1 s (curl
  // reproduces it), and a V5 frame requests up to a dozen JPEGs at once.
  if (process.env.FILM_DIR) {
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.css': 'text/css' };
    await pg.route(FILM_URL + '**', route => {
      const p = join(process.env.FILM_DIR, decodeURIComponent(new URL(route.request().url()).pathname));
      if (!existsSync(p)) return route.fulfill({ status: 404, body: '' });
      return route.fulfill({ status: 200, body: readFileSync(p), contentType: types[extname(p)] || 'application/octet-stream' });
    });
  }
  await pg.goto(FILM_URL + 'index.html' + (render ? '?render=1' : ''));
  await pg.waitForFunction(() => window.__ready, null, { timeout: 120000 }).catch(e => errs.push('TIMEOUT ' + e.message));
  return { pg, errs };
}
