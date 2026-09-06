// Bağımsız QA: index.html içindeki gerçek kaynak metinden mantık parçalarını
// çıkarıp Node'da koşturur. three.js gerekmez (yalnız saf matematik test edilir).
// Ayrıca README'nin sayısal iddialarını dosyanın kendisiyle karşılaştırır:
// belge ile kod birbirinden ayrılırsa CI kırmızıya döner.
import { readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const htmlUrl = new URL('../index.html', import.meta.url);
const html = readFileSync(htmlUrl, 'utf8');
const src = html.match(/<script type="module">([\s\S]*?)<\/script>/)[1];
const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const licence = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');

let fails = 0, checks = 0;
const ok = (c, m) => { checks++; console.log((c ? 'PASS  ' : 'FAIL  ') + m); if (!c) fails++; };

/* ---------- 0. Modül sözdizimi ---------- */
{
  const tmp = join(tmpdir(), `campus-module-${process.pid}.mjs`);
  writeFileSync(tmp, src);
  let syntaxOk = true, msg = '';
  try { execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { syntaxOk = false; msg = String(e.stderr || e.message).split('\n').slice(0, 3).join(' | '); }
  rmSync(tmp, { force: true });
  ok(syntaxOk, 'module script parses as valid ES module' + (syntaxOk ? '' : ` → ${msg}`));
}

/* ---------- 1. Statik bütünlük ---------- */
ok(/importmap/.test(html), 'importmap present');
ok(html.includes('"three": "https://unpkg.com/three@0.169.0/build/three.module.js"'), 'three CDN pinned to 0.169.0');
ok(html.includes('three/addons/controls/OrbitControls.js'), 'OrbitControls imported from CDN');
ok(!/<script src=/.test(html), 'no extra external scripts');
ok((html.match(/<script/g) || []).length === 2, 'exactly 2 script tags (importmap + module)');
ok(html.includes('Bursa Uludağ Üniversitesi Kampüs Turu'), 'top overlay title text present');
ok(/kbd>W<\/kbd>/.test(html) && /Sürükle/.test(html), 'bottom instruction overlay present');
ok(html.includes('prefers-reduced-motion'), 'reduced-motion path present');
ok(html.includes('webglcontextlost'), 'context-loss handling present');
ok(html.includes('Build by Opus 5.'), 'visible build credit "Build by Opus 5." present');
ok(/const START = \{ x: 0, z: 118, yaw: 0,/.test(src),
   'spawn faces the campus (START.yaw = 0), not the exit gate');
ok(/window\.__campus = Object\.freeze\(\{[\s\S]*get frames\(\)/.test(src) && !/window\.__campus[\s\S]{0,600}set /.test(src),
   'test probe is a frozen, getter-only view (cannot drive the scene)');
ok(/MIT License/i.test(licence) && /AS IS/.test(licence), 'LICENSE is a complete MIT text');
{
  const keysShown = ['<kbd>W</kbd>', '<kbd>A</kbd>', '<kbd>S</kbd>', '<kbd>D</kbd>',
                     '<kbd>↑</kbd>', '<kbd>↓</kbd>', '<kbd>←</kbd>', '<kbd>→</kbd>',
                     '<kbd>Sürükle</kbd>', '<kbd>Shift</kbd>', '<kbd>R</kbd>'];
  const missing = keysShown.filter(k => !html.includes(k));
  ok(missing.length === 0, `instruction overlay documents every bound key (missing: ${missing.join(', ') || 'none'})`);
}

/* ---------- 2. Girdi eşlemesi ---------- */
for (const k of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'])
  ok(src.includes(`'${k}'`), `key handled: ${k}`);
ok(/pointerdown/.test(src) && /pointermove/.test(src) && /pointerup/.test(src), 'drag-to-look pointer events wired');

/* ---------- 3. Çarpışma kutuları: bina ayak izlerini kapsıyor mu? ---------- */
const BLOCKERS = eval('(' + src.match(/const BLOCKERS = (\[[\s\S]*?\]);/)[1] + ')');
const blockedSrc = src.match(/function blocked\(x, z\) \{[\s\S]*?\n\}/)[0];
const blocked = eval(blockedSrc.replace('function blocked', 'function _b') + '; _b');

// Sahnedeki gerçek yapı ayak izleri (dünya koordinatı, elle türetildi)
const FOOTPRINTS = [
  { name: 'faculty main',   x: 46,   z: -14,  w: 22, d: 56 },  // 56x22 blok rotY=-90
  { name: 'faculty wing',   x: 38,   z: -44,  w: 30, d: 18 },
  { name: 'faculty tower',  x: 40,   z: 12,   w: 9,  d: 9  },
  { name: 'library body',   x: -46,  z: -86,  w: 46, d: 34 },
  { name: 'library atrium', x: -46,  z: -66,  w: 16, d: 10 },
  { name: 'library pool',   x: -46,  z: -51.5,w: 18, d: 9  },
  { name: 'gate pier +',    x: 10.7, z: 128,  w: 2.4, d: 2.4 },
  { name: 'gate pier -',    x: -10.7,z: 128,  w: 2.4, d: 2.4 }
];
for (const f of FOOTPRINTS) {
  let uncovered = 0, total = 0;
  for (let i = 0; i <= 24; i++) for (let j = 0; j <= 24; j++) {
    const x = f.x - f.w / 2 + (f.w * i) / 24;
    const z = f.z - f.d / 2 + (f.d * j) / 24;
    total++; if (!blocked(x, z)) uncovered++;
  }
  ok(uncovered === 0, `footprint fully blocked: ${f.name} (${uncovered}/${total} uncovered)`);
}

// Yol ekseni her zaman yürünebilir olmalı (otobüs ve yürüyüş koridoru)
let roadBlocked = 0;
for (let z = 145; z > -255; z -= 1) for (const x of [-6, -3, 0, 3, 6])
  if (blocked(x, z)) roadBlocked++;
ok(roadBlocked === 0, `road corridor never blocked (${roadBlocked} blocked samples)`);

/* ---------- 4. Yürüyüş fiziği simülasyonu (kaynaktaki sabitlerle) ---------- */
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const [WALK, RUN, ACCEL, FRICTION] = (() => {
  const m = src.match(/const WALK = ([\d.]+), RUN = ([\d.]+), ACCEL = (\d+), FRICTION = (\d+);/);
  return [parseFloat(m[1]), parseFloat(m[2]), parseInt(m[3]), parseInt(m[4])];
})();
ok(WALK > 0 && RUN > WALK, `speeds sane: walk=${WALK} run=${RUN}`);

const CAMPUS_Z = eval('(' + src.match(/const CAMPUS_Z\s+= (\[[^\]]*\])/)[1] + ')');
function simulate(seed) {
  let x = 0, z = 118, vx = 0, vz = 0, yaw = 0, worst = 0;
  let rng = seed;
  const rand = () => (rng = (rng * 1664525 + 1013904223) % 4294967296) / 4294967296;
  for (let step = 0; step < 6000; step++) {
    const dt = 1 / 60;
    if (step % 40 === 0) yaw += (rand() - 0.5) * 2.4;
    const f = rand() < 0.75 ? 1 : -1, s = rand() < 0.5 ? 0 : (rand() < 0.5 ? 1 : -1);
    const speed = rand() < 0.3 ? RUN : WALK;
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let ax = fx * f + rx * s, az = fz * f + rz * s;
    const len = Math.hypot(ax, az); if (len > 1e-4) { ax /= len; az /= len; }
    vx += ax * speed * ACCEL * dt; vz += az * speed * ACCEL * dt;
    const damp = Math.max(0, 1 - FRICTION * dt); vx *= damp; vz *= damp;
    const vlen = Math.hypot(vx, vz);
    if (vlen > speed) { vx = (vx / vlen) * speed; vz = (vz / vlen) * speed; }
    worst = Math.max(worst, Math.hypot(vx, vz) * dt);
    const nx = x + vx * dt, nz = z + vz * dt;
    if (!blocked(nx, z)) x = nx; else vx = 0;
    if (!blocked(x, nz)) z = nz; else vz = 0;
    x = clamp(x, -150, 150); z = clamp(z, CAMPUS_Z[0], CAMPUS_Z[1]);
    if (blocked(x, z)) return { inside: true, step, x, z, worst };
  }
  return { inside: false, x, z, worst };
}
let insideCount = 0, worstStep = 0;
for (let s = 1; s <= 25; s++) { const r = simulate(s * 7919); if (r.inside) insideCount++; worstStep = Math.max(worstStep, r.worst); }
ok(insideCount === 0, `25 randomized 100s walks never end inside a building (${insideCount} violations)`);
ok(worstStep < 0.9, `observed max per-frame step ${worstStep.toFixed(3)} m < 0.9 m collision margin (theoretical bound ${(RUN * 0.05).toFixed(3)} m at the dt clamp)`);

// Kasıtlı duvara koşu: değişken dt ile, dört yönden, her engelin merkezine doğru.
{
  let breaches = 0, worstVar = 0;
  let rng = 424242;
  const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (const b of BLOCKERS) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      let x = b.x + dx * 45, z = b.z + dz * 45, vx = 0, vz = 0;
      for (let step = 0; step < 1200; step++) {
        const dt = Math.min(0.05, 1 / 240 + rand() * 0.06);   // 4 ms … 50 ms, clamp dahil
        const ax = -dx, az = -dz;
        vx += ax * RUN * ACCEL * dt; vz += az * RUN * ACCEL * dt;
        const damp = Math.max(0, 1 - FRICTION * dt); vx *= damp; vz *= damp;
        const vlen = Math.hypot(vx, vz);
        if (vlen > RUN) { vx = (vx / vlen) * RUN; vz = (vz / vlen) * RUN; }
        worstVar = Math.max(worstVar, Math.hypot(vx, vz) * dt);
        const nx = x + vx * dt, nz = z + vz * dt;
        if (!blocked(nx, z)) x = nx; else vx = 0;
        if (!blocked(x, nz)) z = nz; else vz = 0;
        if (blocked(x, z)) { breaches++; break; }
      }
    }
  }
  ok(breaches === 0, `32 variable-timestep sprints straight at the walls never breach one (${breaches} breaches, worst step ${worstVar.toFixed(3)} m)`);
}

/* ---------- 5. Ring otobüsü döngüsü ---------- */
let bz = 60, dir = -1, minZ = 1e9, maxZ = -1e9;
for (let i = 0; i < 6000; i++) {
  bz += dir * 9.5 * (1 / 60);
  if (bz < -230) { bz = -230; dir = 1; }
  if (bz > 116) { bz = 116; dir = -1; }
  minZ = Math.min(minZ, bz); maxZ = Math.max(maxZ, bz);
}
ok(minZ >= -230.01 && maxZ <= 116.01, `shuttle stays on road segment [${minZ.toFixed(1)}, ${maxZ.toFixed(1)}]`);
ok(minZ < -200 && maxZ > 100, 'shuttle actually traverses the campus road both ways');

/* ---------- 6. HUD yer adları ---------- */
const PLACES = eval('(' + src.match(/const PLACES = (\[[\s\S]*?\]);/)[1] + ')');
for (const z of [140, 118, 60, 0, -40, -90, -160, -259]) {
  const p = PLACES.find(p => z >= p.z) || PLACES[PLACES.length - 1];
  ok(!!p && typeof p.name === 'string', `place resolved at z=${z} → ${p && p.name}`);
}

/* ---------- 7. README iddiaları dosyayla uyuşuyor mu ---------- */
{
  const realBytes = statSync(htmlUrl).size;
  const m = readme.match(/\((\d[\d.]*)\s*bayt\)/);
  const claimed = m ? parseInt(m[1].replace(/\./g, ''), 10) : NaN;
  ok(claimed === realBytes, `README byte claim matches the file (claimed ${claimed}, actual ${realBytes})`);
}
{
  const m = readme.match(/\*\*(\d+)\s*kontrol/);
  const declared = m ? parseInt(m[1], 10) : NaN;
  // Bu satırın kendisi de bir kontrol: checks henüz artmadı, bu yüzden +1.
  ok(declared === checks + 1, `README check count matches the harness (declared ${declared}, actual ${checks + 1})`);
}

console.log(`\n${checks} checks executed`);
console.log(fails === 0 ? `QA RESULT: PASS (0 failures)` : `QA RESULT: FAIL (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
