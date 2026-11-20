// Captures the annotated "Using Free draw" screenshots for the About page, on desktop and phone, from a running copy of the lab.
//
//   npm run dev            (in another terminal)
//   npm run guide          (or: node scripts/draw-guide.mjs http://localhost:3000)
//
// Every shot starts from district concept 1 around Brougham. Images go to public/guide/<device>-<shot>.webp.
import { mkdirSync } from 'fs';
import puppeteer from 'puppeteer-core';

const BASE = process.argv[2] ?? 'http://localhost:3000';
const OUT = new URL('../public/guide/', import.meta.url).pathname;
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEVICES = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1.5 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
const BRUSH = 'Green Springs', AREA = '850';   // give planning area 850 (Brougham today) to Green Springs
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

/** Numbered callouts drawn over the page: a teal circle on the target and a label beside it. */
async function annotate(page, marks) {
  const resolved = [];
  for (const mark of marks) {
    let { x, y } = mark;
    if (mark.selector) {
      const box = await page.$eval(mark.selector, element => { const r = element.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; });
      x = box.x + (mark.edge === 'right' ? box.w / 2 - 6 : mark.edge === 'left' ? -box.w / 2 + 6 : 0); y = box.y;
    }
    resolved.push({ ...mark, x, y, cx: x + (mark.ox ?? 0), cy: y + (mark.oy ?? 0) });
  }
  await page.evaluate(items => {
    document.getElementById('guide-marks')?.remove();
    const layer = document.createElement('div');
    layer.id = 'guide-marks';
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99999;font:600 13px/1.3 system-ui,-apple-system,sans-serif';
    for (const item of items) {
      if (item.cx !== item.x || item.cy !== item.y) {   // a short line from the numbered circle to what it points at
        const length = Math.hypot(item.x - item.cx, item.y - item.cy), angle = Math.atan2(item.y - item.cy, item.x - item.cx);
        const line = document.createElement('div');
        line.style.cssText = `position:absolute;left:${item.cx}px;top:${item.cy - 1.5}px;width:${length}px;height:3px;background:#2f7f79;transform-origin:0 50%;
          transform:rotate(${angle}rad);box-shadow:0 0 0 1.5px #fff`;
        layer.appendChild(line);
      }
      const dot = document.createElement('div');
      dot.textContent = item.n;
      dot.style.cssText = `position:absolute;left:${item.cx - 14}px;top:${item.cy - 14}px;width:28px;height:28px;border-radius:50%;background:#2f7f79;color:#fff;
        display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 0 0 3px #fff,0 4px 12px rgba(0,0,0,.3)`;
      layer.appendChild(dot);
      const label = document.createElement('div');
      label.textContent = item.text;
      const toLeft = item.side === 'left' || (item.side !== 'right' && item.cx > innerWidth - 220);
      const below = item.side === 'below', drop = item.drop ?? 22;
      label.style.cssText = `position:absolute;max-width:200px;padding:6px 10px;border-radius:10px;background:#1d2a2b;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.25);
        ${below ? `left:${Math.min(Math.max(8, item.cx - 100), innerWidth - 208)}px;top:${item.cy + drop}px` : toLeft ? `right:${innerWidth - item.cx + 22}px;top:${item.cy - 14}px` : `left:${item.cx + 22}px;top:${item.cy - 14}px`}`;
      layer.appendChild(label);
    }
    document.body.appendChild(layer);
  }, resolved);
}
const clearMarks = page => page.evaluate(() => document.getElementById('guide-marks')?.remove());

async function shoot(page, device, name) {
  await wait(400);
  await page.evaluate(() => {
    const toast = document.querySelector('.toast'); if (toast) toast.style.visibility = 'hidden';   // the callouts say it
    document.querySelectorAll('nextjs-portal').forEach(badge => { badge.style.display = 'none'; });   // the dev server's badge
  });
  await page.screenshot({ path: `${OUT}${device}-${name}.webp`, type: 'webp', quality: 82 });
  await clearMarks(page);
  console.log(`  ${device}-${name}.webp`);
}

/** Page position of a planning area's label. */
const areaPoint = (page, label) => page.evaluate(wanted => {
  const map = window.__lab.map, canvas = map.getCanvas().getBoundingClientRect();
  const feature = map.queryRenderedFeatures({ layers: ['planning-label'] }).find(f => String(f.properties.label).startsWith(wanted));
  if (!feature) return null;
  const point = map.project(feature.geometry.coordinates);
  return { x: canvas.left + point.x, y: canvas.top + point.y };
}, label);

const clickText = (page, selector, text) => page.evaluate((selector, text) => [...document.querySelectorAll(selector)].find(element => element.textContent.trim() === text)?.click(), selector, text);
const chooseTool = (page, label) => clickText(page, '[aria-label="Tool"] button', label);

async function setUp(page, device) {
  const phone = device === 'phone';
  await page.goto(`${BASE}/#mode=draw`, { waitUntil: 'domcontentloaded' });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(phone ? '.mobile-tabs' : '#starting-plan', { timeout: 120000 });
  await wait(4000);
  if (phone) { await page.evaluate(() => document.querySelectorAll('.mobile-tab')[2].click()); await wait(1200); }
  await page.select('#starting-plan', 'dc1'); await wait(3000);
  await page.evaluate(phone => {
    const map = window.__lab.map, brougham = window.__lab.S.schools.find(school => school.level === 'es' && school.name === 'Brougham');
    map.jumpTo({ center: [brougham.lon, brougham.lat + 0.004], zoom: phone ? 13.1 : 13.6, padding: phone ? { top: 180, bottom: 120, left: 0, right: 0 } : { top: 230, left: 400, right: 0, bottom: 0 } });
  }, phone);
  await wait(3000);
  const brush = await page.$eval('#map-brush', (select, name) => [...select.options].find(option => option.textContent === name)?.value, BRUSH);
  await page.select('#map-brush', brush); await wait(400);
}

async function capture(browser, device) {
  const phone = device === 'phone';
  const page = await browser.newPage();
  await page.setViewport(DEVICES[device]);
  const errors = []; page.on('pageerror', error => errors.push(String(error)));
  await setUp(page, device);

  // 1. Start from
  await annotate(page, [{ n: 1, selector: '#starting-plan', edge: phone ? undefined : 'right', side: phone ? 'below' : 'right', text: 'Start from current boundaries or a district concept' }]);
  await shoot(page, device, 'start-from');
  if (phone) { await page.evaluate(() => document.querySelector('.drawer-close')?.click()); await wait(800); }

  // 2. Pick areas
  await chooseTool(page, 'Pick areas'); await wait(600);
  const area = await areaPoint(page, AREA);
  if (!area) throw new Error(`planning area ${AREA} isn't on screen`);
  await page.mouse.move(area.x, area.y); await wait(700);
  await annotate(page, [
    { n: 1, selector: '#map-brush', edge: 'left', ox: 0, side: phone ? 'below' : 'right', drop: 70, text: 'Select the school to give areas to' },
    { n: 2, selector: '[aria-label="Tool"] button:nth-child(2)', oy: phone ? 70 : 60, side: 'right', text: 'Choose Pick areas' },
    { n: 3, x: area.x, y: area.y, ox: 40, oy: -40, text: 'Tap a planning area' },
  ]);
  await shoot(page, device, 'pick-areas-1');
  await page.mouse.click(area.x, area.y); await wait(3500);
  await page.mouse.move(5, 400); await wait(400);
  await annotate(page, [{ n: 4, x: area.x, y: area.y, ox: 40, oy: -40, text: `Now part of ${BRUSH}. The school list updates.` }]);
  await shoot(page, device, 'pick-areas-2');

  // 3. Remove
  await chooseTool(page, 'Remove'); await wait(600);
  await annotate(page, [
    { n: 1, selector: '[aria-label="Tool"] button:nth-child(4)', oy: phone ? 70 : 60, side: 'left', text: 'Choose Remove' },
    { n: 2, x: area.x, y: area.y, ox: 40, oy: -40, text: 'Tap an area you changed to undo just that change' },
  ]);
  await shoot(page, device, 'remove');
  await page.mouse.click(area.x, area.y); await wait(3000);

  // 4. Trace: a line from one boundary to another, across two areas
  await chooseTool(page, 'Trace'); await wait(600);
  const line = await page.evaluate(phone => {
    const map = window.__lab.map, canvas = map.getCanvas().getBoundingClientRect();
    const top = phone ? 280 : 300, bottom = phone ? canvas.height - 260 : canvas.height - 120, left = phone ? 10 : 420;
    let best = null;
    for (let y = top; y < bottom; y += 12) {
      const at = x => map.queryRenderedFeatures([x, y], { layers: ['zone-fill'] })[0]?.properties.school ?? null;
      const edges = []; let previous = at(left);
      for (let x = left + 1; x < canvas.width - 70; x++) { const school = at(x); if (school !== previous) { if (school !== null && previous !== null) edges.push(x); previous = school; } }
      const spaced = edges.filter((x, k) => k === 0 || x - edges[k - 1] > 40);
      // skip rows that run along a boundary: just above and below, the same schools should sit between the crossings
      const steady = spaced.slice(1).every((x, k) => { const mid = (spaced[k] + x) / 2;
        const here = at(mid), above = map.queryRenderedFeatures([mid, y - 18], { layers: ['zone-fill'] })[0]?.properties.school, below = map.queryRenderedFeatures([mid, y + 18], { layers: ['zone-fill'] })[0]?.properties.school;
        return here === above && here === below; });
      const enough = spaced.length >= (phone ? 2 : 3);
      if (enough && steady && (!best || spaced.length > best.edges.length || Math.abs(y - (top + bottom) / 2) < Math.abs(best.y - (top + bottom) / 2))) best = { y, edges: spaced };
    }
    return best && { left: canvas.left, top: canvas.top, ...best };
  }, phone);
  if (!line) throw new Error('no line across two areas found');
  const tap = async x => { await page.mouse.click(line.left + x, line.top + line.y); await wait(800); };
  const start = line.edges[0], end = line.edges[Math.min(2, line.edges.length - 1)], middle = line.edges.length > 2 ? line.edges[1] : end;
  await tap(start); await tap(end);
  await page.mouse.move(2, 2); await wait(600);   // off the map, so no snap ring or preview line shows
  await annotate(page, [
    { n: 1, x: line.left + start, y: line.top + line.y, ox: phone ? 10 : -30, oy: -50, side: phone ? 'right' : 'left', text: 'Start on a boundary line (red dot)' },
    { n: 2, x: line.left + end, y: line.top + line.y, ox: phone ? -10 : 30, oy: 50, side: phone ? 'left' : 'right', text: 'End on another boundary. It can cross several areas.' },
    { n: 3, selector: '.drawbar button:not([data-slot="toggle-group-item"])', side: phone ? 'below' : 'left', text: 'Tap Done' },
  ]);
  await shoot(page, device, 'trace-1');
  await page.evaluate(() => [...document.querySelectorAll('.drawbar button')].find(button => button.textContent.includes('Done'))?.click()); await wait(1500);
  const piece = { x: line.left + (start + middle) / 2, y: line.top + line.y - 30 };
  await annotate(page, [{ n: 4, x: piece.x, y: piece.y, ox: 30, oy: -40, text: `Tap each piece that should go to ${BRUSH}` }]);
  await shoot(page, device, 'trace-2');
  await page.evaluate(() => [...document.querySelectorAll('.drawbar button')].find(button => button.textContent.includes('Done'))?.click()); await wait(600);

  // 5. Follow streets: the blue ring shows the intersection a tap will snap to
  await page.click('[aria-label="Follow streets"]'); await wait(400);
  let ring = null;
  const centerX = line.left + (start + end) / 2, centerY = line.top + line.y;
  for (let step = 0; step < 120 && !ring; step++) {
    const angle = step * 0.7, radius = 6 + step * 2.2;
    const x = centerX + Math.cos(angle) * radius, y = centerY + Math.sin(angle) * radius;
    await page.mouse.move(x, y); await wait(60);
    ring = await page.evaluate(() => {
      const map = window.__lab.map, canvas = map.getCanvas().getBoundingClientRect();
      const feature = map.queryRenderedFeatures({ layers: ['trace-target'] }).find(f => f.properties.edge === 0);
      if (!feature) return null;
      const point = map.project(feature.geometry.coordinates);
      return { x: canvas.left + point.x, y: canvas.top + point.y };
    });
  }
  await annotate(page, [
    { n: 1, selector: '[aria-label="Follow streets"]', oy: 50, side: 'left', text: 'Turn on Follow streets' },
    ...(ring ? [{ n: 2, x: ring.x, y: ring.y, ox: 40, oy: 40, text: 'The blue ring shows the intersection your tap will snap to' }] : []),
  ]);
  await shoot(page, device, 'follow-streets');
  await page.click('[aria-label="Follow streets"]'); await wait(300);

  if (errors.length) console.log('  page errors:', errors);
  await page.close();
}

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
try {
  for (const device of Object.keys(DEVICES)) { console.log(device); await capture(browser, device); }
} finally {
  await browser.close();
}
