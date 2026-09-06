/**
 * Gerçek tarayıcı kabul testi.
 *
 * Statik harness (tests/qa.mjs) yalnız kaynak metni ve saf matematiği doğrular;
 * bu dosya sahneyi gerçek Chromium'da, gerçek WebGL bağlamında, CDN'den inen
 * gerçek three.js ile açar ve kullanıcının yaptığı şeyleri yapar: bekler,
 * yürür, sürükler, sıfırlar, mod değiştirir. Kanıt: artifacts/campus.png.
 *
 * Kullanım:  node tests/browser.mjs http://127.0.0.1:8080
 * Playwright depo ağacının dışına kurulur; PW_ROOT ya da NODE_PATH ile bulunur.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');

function loadPlaywright() {
  const candidates = [];
  if (process.env.PW_ROOT) candidates.push(join(process.env.PW_ROOT, 'node_modules', 'playwright'));
  if (process.env.NODE_PATH) candidates.push(join(process.env.NODE_PATH, 'playwright'));
  candidates.push('playwright');
  for (const c of candidates) {
    try { return require(c); } catch { /* sıradakini dene */ }
  }
  throw new Error('playwright bulunamadı; PW_ROOT ya da NODE_PATH ayarlayın');
}

const base = process.argv[2] || 'http://127.0.0.1:8080';
const { chromium } = loadPlaywright();

let fails = 0;
const ok = (c, m) => { console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-lcd-text'
  ]
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

try {
  /* ---------- 1. Yükleme ---------- */
  const resp = await page.goto(`${base}/index.html`, { waitUntil: 'load', timeout: 60_000 });
  ok(resp?.status() === 200, `page served: HTTP ${resp?.status()}`);

  // three.js ve OrbitControls gerçekten CDN'den indi mi?
  await page.waitForFunction(() => typeof window.__campus === 'object', null, { timeout: 60_000 });
  ok(true, 'ES module executed: three.js + OrbitControls loaded from CDN');

  ok(pageErrors.length === 0, `no uncaught page errors (${pageErrors.length})${pageErrors[0] ? ' → ' + pageErrors[0] : ''}`);
  ok(consoleErrors.length === 0, `no console errors (${consoleErrors.length})${consoleErrors[0] ? ' → ' + consoleErrors[0] : ''}`);
  ok(failedRequests.length === 0, `no failed requests (${failedRequests.length})${failedRequests[0] ? ' → ' + failedRequests[0] : ''}`);

  /* ---------- 2. WebGL bağlamı ve fallback ---------- */
  const glInfo = await page.evaluate(() => {
    const c = document.getElementById('scene');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    return { has: !!gl, w: c.width, h: c.height };
  });
  ok(glInfo.has, 'canvas holds a live WebGL context');
  ok(glInfo.w > 0 && glInfo.h > 0, `canvas sized ${glInfo.w}×${glInfo.h}`);
  ok(!(await page.locator('#fallback').evaluate(e => e.classList.contains('show'))), 'WebGL fallback screen not shown');

  /* ---------- 3. Loader kalkıyor, döngü dönüyor ---------- */
  await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 30_000 });
  ok(true, 'loader dismissed after first compiled frame');

  const f0 = await page.evaluate(() => window.__campus.frames);
  await sleep(2000);
  const f1 = await page.evaluate(() => window.__campus.frames);
  ok(f1 - f0 > 30, `render loop is live: ${f1 - f0} frames in 2 s (~${Math.round((f1 - f0) / 2)} fps)`);

  /* ---------- 4. Başlangıç kompozisyonu ---------- */
  const start = await page.evaluate(() => ({ ...JSON.parse(JSON.stringify({
    x: window.__campus.x, z: window.__campus.z, yaw: window.__campus.yaw, place: window.__campus.place
  })) }));
  ok(Math.abs(start.z - 118) < 0.001 && Math.abs(start.x) < 0.001, `spawn at the gate (x=${start.x}, z=${start.z})`);
  ok(Math.abs(start.yaw) < 1e-9, `spawn faces the campus, not the exit (yaw=${start.yaw})`);
  ok(start.place === 'Kampüs Kapısı', `HUD names the start zone: ${start.place}`);
  ok((await page.title()).includes('Bursa Uludağ Üniversitesi Kampüs Turu'), 'document title present');
  ok((await page.locator('h1').innerText()).trim() === 'Bursa Uludağ Üniversitesi Kampüs Turu', 'top overlay title rendered');

  /* ---------- 5. Sahne gerçekten çiziliyor mu (piksel kanıtı) ---------- */
  mkdirSync(join(repo, 'artifacts'), { recursive: true });
  const shotA = await page.screenshot({ path: join(repo, 'artifacts', 'campus.png') });
  ok(shotA.length > 20_000, `rendered frame is a complex image (${shotA.length} B PNG, not a flat fill)`);

  /* ---------- 6. Yürüme ---------- */
  await page.locator('#scene').click({ position: { x: 640, y: 700 } });
  await page.keyboard.down('KeyW');
  await sleep(3000);
  await page.keyboard.up('KeyW');
  await sleep(300);
  const afterWalk = await page.evaluate(() => ({ x: window.__campus.x, z: window.__campus.z, place: window.__campus.place }));
  ok(afterWalk.z < start.z - 10, `W walks into the campus: z ${start.z} → ${afterWalk.z.toFixed(1)}`);
  ok(afterWalk.place !== start.place, `zone label followed the walk: ${start.place} → ${afterWalk.place}`);

  const shotB = await page.screenshot();
  ok(Buffer.compare(shotA, shotB) !== 0, 'viewport changed after walking (frame differs from spawn frame)');

  /* ---------- 7. Sürükleyerek bakma ---------- */
  const bearing0 = await page.locator('#bearing').innerText();
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(360, 400, { steps: 14 });
  await page.mouse.up();
  await sleep(300);
  const look = await page.evaluate(() => window.__campus.yaw);
  const bearing1 = await page.locator('#bearing').innerText();
  ok(Math.abs(look) > 0.2, `drag rotated the view (yaw=${look.toFixed(3)} rad)`);
  ok(bearing0 !== bearing1, `compass followed the look: ${bearing0} → ${bearing1}`);

  /* ---------- 8. Sıfırlama ---------- */
  await page.keyboard.press('KeyR');
  await sleep(400);
  const reset = await page.evaluate(() => ({ x: window.__campus.x, z: window.__campus.z, yaw: window.__campus.yaw, place: window.__campus.place }));
  ok(Math.abs(reset.z - 118) < 0.5 && Math.abs(reset.yaw) < 1e-9, `R restores the spawn (z=${reset.z.toFixed(1)}, yaw=${reset.yaw})`);
  ok(reset.place === 'Kampüs Kapısı', 'R restores the HUD zone label');

  /* ---------- 9. Yörünge modu ---------- */
  await page.locator('#btn-orbit').click();
  await sleep(600);
  ok(await page.evaluate(() => window.__campus.orbit), 'orbit camera mode engaged by button');
  ok(await page.locator('#btn-orbit').evaluate(e => e.getAttribute('aria-pressed') === 'true'), 'orbit button reports aria-pressed=true');
  const fOrbit0 = await page.evaluate(() => window.__campus.frames);
  await sleep(1000);
  ok((await page.evaluate(() => window.__campus.frames)) - fOrbit0 > 15, 'render loop still live in orbit mode');
  await page.keyboard.press('KeyO');
  await sleep(400);
  ok(!(await page.evaluate(() => window.__campus.orbit)), 'O toggles back to first-person walking');

  /* ---------- 10. Sonda salt-okunur mu ---------- */
  const probeWritable = await page.evaluate(() => {
    try { window.__campus.z = -9999; } catch { /* frozen: beklenen */ }
    return window.__campus.z === -9999;
  });
  ok(!probeWritable, 'test probe is read-only: it cannot drive the scene');

  /* ---------- 11. Yeniden boyutlandırma ---------- */
  await page.setViewportSize({ width: 820, height: 620 });
  await sleep(700);
  const resized = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return { w: c.width, h: c.height };
  });
  ok(resized.w > 0 && resized.h > 0 && resized.w !== glInfo.w, `resize handled: ${glInfo.w}×${glInfo.h} → ${resized.w}×${resized.h}`);
  ok(pageErrors.length === 0 && consoleErrors.length === 0, 'still no errors after the full interaction pass');

  writeFileSync(join(repo, 'artifacts', 'report.txt'),
    `browser smoke test\nbase=${base}\nfps≈${Math.round((f1 - f0) / 2)}\nspawn=${JSON.stringify(start)}\nafterWalk=${JSON.stringify(afterWalk)}\nfails=${fails}\n`);
} catch (err) {
  ok(false, `harness threw: ${err && err.message}`);
} finally {
  await browser.close();
}

console.log(fails === 0 ? '\nBROWSER RESULT: PASS (0 failures)' : `\nBROWSER RESULT: FAIL (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
