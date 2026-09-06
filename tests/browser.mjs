/**
 * Gerçek tarayıcı kabul testi.
 *
 * Statik harness (tests/qa.mjs) yalnız kaynak metni ve saf matematiği doğrular;
 * bu dosya sahneyi gerçek Chromium'da, gerçek WebGL bağlamında, CDN'den inen
 * gerçek three.js ile açar ve kullanıcının yaptığı şeyleri yapar: bekler,
 * yürür, sürükler, sıfırlar, mod değiştirir. Kanıt: artifacts/campus.png.
 *
 * CI'da GPU yoktur; three.js SwiftShader üzerinde yazılımla çizer ve kare hızı
 * saniyede birkaç kareye düşer. Bu yüzden test "kaç fps" diye sormaz — kare
 * sayacının ilerlediğini ve girdinin durumu gerçekten değiştirdiğini,
 * gerekiyorsa bekleyerek doğrular. Ölçülen fps rapora bilgi olarak yazılır.
 *
 * Tuvale tıklarken locator.click() KULLANILMAZ: Playwright'ın hit-target
 * denetimi, tuvalin üstündeki HUD/yönerge katmanlarına takılır ve 30 sn bekler.
 * Tuval ham fare olaylarıyla sürülür; katmanların nereyi kapattığı ayrı bir
 * kontrolle raporlanır.
 *
 * Kullanım:  node tests/browser.mjs http://127.0.0.1:8080
 * Playwright depo ağacının dışına kurulur; PW_ROOT ya da NODE_PATH ile bulunur.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
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

/** Bir adım patlarsa tüm kanıtı kaybetme: o adımı FAIL yaz, diğerlerine devam et. */
async function step(label, fn) {
  try { return await fn(); }
  catch (err) { ok(false, `${label} threw: ${err && err.message}`); return null; }
}

/** Yazılım rasterizasyonu yavaş: koşul sağlanana kadar bekle, sonra karar ver. */
async function until(page, fn, { timeout = 45_000, poll = 500 } = {}) {
  const t0 = Date.now();
  for (;;) {
    if (await page.evaluate(fn)) return true;
    if (Date.now() - t0 > timeout) return false;
    await sleep(poll);
  }
}

const browser = await chromium.launch({
  args: [
    '--use-gl=angle',
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--ignore-gpu-blocklist',
    '--disable-lcd-text',
    '--hide-scrollbars',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding'
  ]
});
// Küçük tuval = yazılım rasterizasyonunda çok daha fazla kare; sahne aynı sahne.
const VW = 800, VH = 520;
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => pageErrors.push(String(e)));
page.on('requestfailed', (r) => failedRequests.push(`${r.url()} :: ${r.failure()?.errorText}`));

let fps = 0;
let start = null, afterWalk = null;

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
  await page.waitForFunction(() => document.getElementById('loader').classList.contains('done'), null, { timeout: 60_000 });
  ok(true, 'loader dismissed after first compiled frame');

  const f0 = await page.evaluate(() => window.__campus.frames);
  await sleep(3000);
  const f1 = await page.evaluate(() => window.__campus.frames);
  fps = (f1 - f0) / 3;
  // CI'da GPU yok: eşik "akıcı" değil, "canlı" olmayı ölçer.
  ok(f1 - f0 >= 3, `render loop is live: ${f1 - f0} frames in 3 s (~${fps.toFixed(1)} fps, software raster)`);

  /* ---------- 4. Başlangıç kompozisyonu ---------- */
  start = await page.evaluate(() => ({
    x: window.__campus.x, z: window.__campus.z, yaw: window.__campus.yaw, place: window.__campus.place
  }));
  ok(Math.abs(start.z - 118) < 0.001 && Math.abs(start.x) < 0.001, `spawn at the gate (x=${start.x}, z=${start.z})`);
  ok(Math.abs(start.yaw) < 1e-9, `spawn faces the campus, not the exit (yaw=${start.yaw})`);
  ok(start.place === 'Kampüs Kapısı', `HUD names the start zone: ${start.place}`);
  ok((await page.title()).includes('Bursa Uludağ Üniversitesi Kampüs Turu'), 'document title present');
  ok((await page.locator('h1').innerText()).trim() === 'Bursa Uludağ Üniversitesi Kampüs Turu', 'top overlay title rendered');

  /* ---------- 5. Katmanlar sahnenin ortasını kapatmıyor ---------- */
  const hit = await page.evaluate(([w, h]) => {
    const at = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? (el.id || el.tagName.toLowerCase()) : 'none';
    };
    return { center: at(w / 2, h / 2), low: at(w / 2, h - 60), upper: at(w / 2, h * 0.35) };
  }, [VW, VH]);
  ok(hit.center === 'scene' && hit.upper === 'scene',
     `overlays leave the scene interactive (center=${hit.center}, upper=${hit.upper}, bottom bar=${hit.low})`);

  /* ---------- 6. Sahne gerçekten çiziliyor mu (piksel kanıtı) ---------- */
  mkdirSync(join(repo, 'artifacts'), { recursive: true });
  const shotA = await page.screenshot({ path: join(repo, 'artifacts', 'campus.png') });
  ok(shotA.length > 20_000, `rendered frame is a complex image (${shotA.length} B PNG, not a flat fill)`);

  /* ---------- 7. Yürüme ---------- */
  // Ham fare tıklaması: hit-target denetimi yok, kullanıcı jesti aynı.
  await page.mouse.click(VW / 2, VH / 2);
  await page.evaluate(() => document.getElementById('scene').focus());
  await page.keyboard.down('KeyW');
  // Hedef: en az 18 m ilerlemek (z 118 → ≤100), yani bölge sınırını (110) geçmek.
  const walked = await until(page, () => window.__campus.z <= 100, { timeout: 45_000 });
  await page.keyboard.up('KeyW');
  await sleep(400);
  afterWalk = await page.evaluate(() => ({ x: window.__campus.x, z: window.__campus.z, place: window.__campus.place }));
  ok(walked && afterWalk.z < start.z - 15,
    `W walks into the campus (−Z): z ${start.z} → ${afterWalk.z.toFixed(1)}`);
  ok(Math.abs(afterWalk.x - start.x) < 3, `walk stayed on the road (x=${afterWalk.x.toFixed(2)})`);
  ok(afterWalk.place !== start.place, `zone label followed the walk: ${start.place} → ${afterWalk.place}`);

  const shotB = await page.screenshot();
  ok(Buffer.compare(shotA, shotB) !== 0, 'viewport changed after walking (frame differs from spawn frame)');

  /* ---------- 8. Sürükleyerek bakma ---------- */
  const bearing0 = await page.locator('#bearing').innerText();
  await page.mouse.move(VW / 2, VH / 2);
  await page.mouse.down();
  await page.mouse.move(VW / 2 - 260, VH / 2, { steps: 14 });
  await page.mouse.up();
  await until(page, () => Math.abs(window.__campus.yaw) > 0.2, { timeout: 10_000 });
  const look = await page.evaluate(() => window.__campus.yaw);
  const bearing1 = await page.locator('#bearing').innerText();
  ok(Math.abs(look) > 0.2, `drag rotated the view (yaw=${look.toFixed(3)} rad)`);
  ok(bearing0 !== bearing1, `compass followed the look: ${bearing0} → ${bearing1}`);

  /* ---------- 9. Sıfırlama ---------- */
  await page.keyboard.press('KeyR');
  await until(page, () => Math.abs(window.__campus.z - 118) < 0.5, { timeout: 10_000 });
  const reset = await page.evaluate(() => ({ x: window.__campus.x, z: window.__campus.z, yaw: window.__campus.yaw, place: window.__campus.place }));
  ok(Math.abs(reset.z - 118) < 0.5 && Math.abs(reset.yaw) < 1e-9, `R restores the spawn (z=${reset.z.toFixed(1)}, yaw=${reset.yaw})`);
  ok(reset.place === 'Kampüs Kapısı', 'R restores the HUD zone label');

  /* ---------- 10. Yörünge modu ---------- */
  await step('orbit button click', () => page.locator('#btn-orbit').click({ timeout: 15_000 }));
  const orbitOn = await until(page, () => window.__campus.orbit === true, { timeout: 15_000 });
  ok(orbitOn, 'orbit camera mode engaged by button');
  ok(await page.locator('#btn-orbit').evaluate(e => e.getAttribute('aria-pressed') === 'true'), 'orbit button reports aria-pressed=true');
  const fOrbit0 = await page.evaluate(() => window.__campus.frames);
  const orbitAlive = await until(page, `window.__campus.frames > ${fOrbit0} + 2`, { timeout: 20_000 });
  ok(orbitAlive, 'render loop still live in orbit mode');
  await page.keyboard.press('KeyO');
  const orbitOff = await until(page, () => window.__campus.orbit === false, { timeout: 10_000 });
  ok(orbitOff, 'O toggles back to first-person walking');

  /* ---------- 11. Sonda salt-okunur mu ---------- */
  const probeWritable = await page.evaluate(() => {
    try { window.__campus.z = -9999; } catch { /* frozen: beklenen */ }
    return window.__campus.z === -9999;
  });
  ok(!probeWritable, 'test probe is read-only: it cannot drive the scene');

  /* ---------- 12. Yeniden boyutlandırma ---------- */
  await page.setViewportSize({ width: 620, height: 460 });
  await sleep(1200);
  const resized = await page.evaluate(() => {
    const c = document.getElementById('scene');
    return { w: c.width, h: c.height };
  });
  ok(resized.w > 0 && resized.h > 0 && resized.w !== glInfo.w, `resize handled: ${glInfo.w}×${glInfo.h} → ${resized.w}×${resized.h}`);
  ok(pageErrors.length === 0 && consoleErrors.length === 0, 'still no errors after the full interaction pass');
} catch (err) {
  ok(false, `harness threw: ${err && err.message}`);
} finally {
  try {
    mkdirSync(join(repo, 'artifacts'), { recursive: true });
    writeFileSync(join(repo, 'artifacts', 'report.txt'),
      `browser smoke test\nbase=${base}\nviewport=${VW}x${VH}\nfps≈${fps.toFixed(1)} (software raster)\n` +
      `spawn=${JSON.stringify(start)}\nafterWalk=${JSON.stringify(afterWalk)}\nfails=${fails}\n`);
  } catch { /* rapor yazılamazsa testin sonucunu değiştirme */ }
  await browser.close();
}

console.log(fails === 0 ? '\nBROWSER RESULT: PASS (0 failures)' : `\nBROWSER RESULT: FAIL (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
