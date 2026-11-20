// Makes the social sharing card (public/og-image.png, 1200x630) and the home-screen icon (src/app/apple-icon.png, 180x180)
// from a running copy of the lab and the favicon (src/app/icon.svg).
//
//   npm run dev            (in another terminal)
//   npm run social         (or: node scripts/social-image.mjs http://localhost:3000)
import { readFileSync } from 'fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const ROOT = new URL('../', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ICON = readFileSync(`${ROOT}src/app/icon.svg`, 'utf8');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** The map alone (concept 1), with the lab's controls hidden, as a data URL. */
async function cleanMap(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/#build=1.1.1.1.1`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.school-row', { timeout: 120000 });
  await page.addStyleTag({ content: '.topbar,.panel,nav.rail,.legend-dock,.maplibregl-control-container,.toast,nextjs-portal{display:none!important} .lab-main{inset:0!important}' });
  await wait(1500);
  await page.evaluate(() => { window.dispatchEvent(new Event('resize')); window.__lab.map.resize(); });
  await wait(1000);
  // the district's southeast, where the boundaries change, on the right side of the card (the text covers the left)
  await page.evaluate(() => window.__lab.map.jumpTo({ center: [-94.818, 38.868], zoom: 11.75 }));
  await wait(4500);
  const shot = await page.screenshot({ type: 'jpeg', quality: 90, encoding: 'base64' });
  await page.close();
  return `data:image/jpeg;base64,${shot}`;
}

const card = (map) => `<!doctype html><html><head><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; overflow: hidden; font-family: -apple-system, "SF Pro Display", "Helvetica Neue", Arial, sans-serif; color: #1d2a2b; }
  .map { position: absolute; inset: 0; background: url(${map}) center / cover; }
  .fade { position: absolute; inset: 0; background: linear-gradient(90deg, #ffffff 0%, rgba(255,255,255,.97) 38%, rgba(255,255,255,.55) 58%, rgba(255,255,255,0) 75%); }
  .text { position: absolute; left: 72px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
  .brand { display: flex; align-items: center; gap: 18px; }
  .brand svg { width: 76px; height: 76px; flex: none; }
  h1 { font-size: 62px; line-height: 1.02; font-weight: 800; letter-spacing: -0.03em; }
  p.tag { font-size: 27px; line-height: 1.32; color: #3d4b4c; max-width: 540px; }
  .chips { display: flex; gap: 10px; flex-wrap: wrap; }
  .chip { padding: 8px 16px; border-radius: 999px; background: #e4f2f1; color: #1f5c57; font-size: 19px; font-weight: 650; }
  .foot { position: absolute; left: 72px; bottom: 40px; font-size: 18px; color: #6a7b7c; }
  .foot b { color: #2f7f79; }
  .bar { position: absolute; left: 0; right: 0; top: 0; height: 10px; background: #2f7f79; }
</style></head><body>
  <div class="map"></div><div class="fade"></div><div class="bar"></div>
  <div class="text">
    <div class="brand">${ICON}<h1>Olathe<br>Boundary Lab</h1></div>
    <p class="tag">See how the proposed elementary and middle school boundary concepts would change each school.</p>
    <div class="chips"><span class="chip">Compare concepts</span><span class="chip">Draw your own</span><span class="chip">Projected capacity</span></div>
  </div>
  <p class="foot"><b>olatheboundarylab.com</b> &nbsp;·&nbsp; Independent project, not affiliated with Olathe Public Schools</p>
</body></html>`;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  const map = await cleanMap(browser);
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.setContent(card(map), { waitUntil: 'load' });
  await page.screenshot({ path: `${ROOT}public/og-image.png`, type: 'png' });
  console.log('public/og-image.png');

  await page.setViewport({ width: 180, height: 180, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:180px;height:180px">${ICON.replace('<svg ', '<svg width="180" height="180" ')}</body></html>`);
  await page.screenshot({ path: `${ROOT}src/app/apple-icon.png`, type: 'png', omitBackground: true });
  console.log('src/app/apple-icon.png');
} finally {
  await browser.close();
}
