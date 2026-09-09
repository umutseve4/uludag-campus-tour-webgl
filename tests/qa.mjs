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

// Çarpışma payını VARSAYMA: blocked()'ın kendisinden ikili aramayla ölç.
const MARGIN = (() => {
  const b = BLOCKERS[0];
  let lo = b.w / 2, hi = b.w / 2 + 10;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (blocked(b.x + mid, b.z)) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2 - b.w / 2;
})();
ok(MARGIN > 0.5 && MARGIN < 1.5, `collision margin measured from blocked() itself: ${MARGIN.toFixed(3)} m`);

// Hangi engelin içindeyiz? Payı YENİDEN YAZMA: ürünün kendi blocked() metnini
// tek elemanlı bir BLOCKERS dizisiyle yeniden bağla. Ölçülen MARGIN kılpayı
// (0.9000000000000021) gerçek 0.9'dan büyük olduğu için, sınırın tam üstündeki
// bir temas noktası komşu kutuya yazılıyordu; bu, üründe değil harness'ta hataydı.
const makeBlocked = eval('((BLOCKERS) => { ' + blockedSrc.replace('function blocked', 'function _b') + ' return _b; })');
const singleBlocked = BLOCKERS.map(b => makeBlocked([b]));
const blockerAt = (x, z) => {
  for (let i = 0; i < singleBlocked.length; i++) if (singleBlocked[i](x, z)) return i;
  return -1;
};
{
  // Atıf ile çarpışma birebir aynı geometriyi görmeli: ayrışırlarsa test yalan söyler.
  let rng = 20260906, mismatch = 0;
  const rnd = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
  for (let k = 0; k < 200000; k++) {
    const x = -150 + rnd() * 300, z = -260 + rnd() * 410;
    if (blocked(x, z) !== (blockerAt(x, z) >= 0)) mismatch++;
  }
  for (const b of BLOCKERS) for (const s of [-1, 1]) for (const e of [0, 1e-12, -1e-12]) {
    const x = b.x + s * (b.w / 2 + MARGIN) + e, z = b.z;
    if (blocked(x, z) !== (blockerAt(x, z) >= 0)) mismatch++;
  }
  ok(mismatch === 0, `contact attribution agrees with blocked() everywhere (200k random + 48 boundary points, ${mismatch} mismatches)`);
}

{
  // makeBlocked bir YENİDEN TÜRETME değil, YENİDEN BAĞLAMA olmalı: ürünün metni
  // birebir korunur, yalnızca fonksiyon adı değişir, BLOCKERS parametreden gelir.
  const renamed = blockedSrc.replace("function blocked", "function _b");
  const ids = [...new Set(blockedSrc.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) || [])];
  const allowed = new Set(["function", "blocked", "x", "z", "for", "const", "b", "of", "BLOCKERS", "if", "Math", "abs", "return", "true", "false", "w", "d"]);
  const stray = ids.filter(t => !allowed.has(t));
  ok(stray.length === 0 && (blockedSrc.match(/BLOCKERS/g) || []).length === 1 &&
     renamed.replace("function _b", "function blocked") === blockedSrc,
     `blocked() is re-bound verbatim, not re-derived: free names are exactly {${ids.join(" ")}}, BLOCKERS occurs once${stray.length ? " — stray: " + stray.join(",") : ""}`);
}

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
ok(worstStep < 0.9, `observed max per-frame step ${worstStep.toFixed(3)} m < ${MARGIN.toFixed(1)} m collision margin (theoretical bound ${(RUN * 0.05).toFixed(3)} m at the dt clamp)`);

// Kasıtlı duvara koşu — ÖRNEKLEME YOK. Serbest uzay, engellerin kendi kenarlarından
// üretilen kesin hücre ayrıştırmasıyla; yüz örtüsü ise kapalı aralıkların birleşimiyle
// analitik olarak hesaplanır. Çözünürlükten bağımsızdır.
//
// Bu testin altı ayrı sürümü sessizce anlamsızlaşmıştı; her biri kalıcı kontrole dönüştü:
//   1) Başlangıç noktası komşu yapının içine düştü → ihlal 0. adımda.
//   2) Koşu hedefe varmadan BAŞKA engele çarpınca "geçemedi" bedavaya geldi.
//   3) "Koridor yok, atla" kaçamağı.
//   4) 41 noktalık örnekleme "kesin geometrik sınıflandırma" gibi sunuldu.
//   5) Ölçülen MARGIN (0.9000000000000021) ürünün literal 0.9'undan genişti → yanlış atıf.
//   6) Aday adımın hedef yüzü gerçekten geçtiği gösterilmiyordu; duvara varıp durmak yetmez.
{
  const EPSN = 1e-9;
  const GX0 = -150, GX1 = 150, GZ0 = CAMPUS_Z[0], GZ1 = CAMPUS_Z[1];
  // Genişletilmiş AABB'ler — ürünün blocked() eşiğiyle birebir aynı yarı-genişlikler.
  const BOX = BLOCKERS.map(b => ({
    x0: b.x - b.w / 2 - MARGIN, x1: b.x + b.w / 2 + MARGIN,
    z0: b.z - b.d / 2 - MARGIN, z1: b.z + b.d / 2 + MARGIN
  }));

  // ---- Kesin hücre ayrıştırması: bütün kutu kenarları + alan sınırları -------------
  const uniq = a => [...new Set(a.map(v => +v.toFixed(9)))].sort((p, q) => p - q);
  const XS = uniq([GX0, GX1, ...BOX.flatMap(b => [b.x0, b.x1])].filter(v => v >= GX0 && v <= GX1));
  const ZS = uniq([GZ0, GZ1, ...BOX.flatMap(b => [b.z0, b.z1])].filter(v => v >= GZ0 && v <= GZ1));
  const NI = XS.length - 1, NJ = ZS.length - 1;
  const cellFree = new Uint8Array(NI * NJ);
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++)
    cellFree[j * NI + i] = blocked((XS[i] + XS[i + 1]) / 2, (ZS[j] + ZS[j + 1]) / 2) ? 0 : 1;
  const locate = (arr, v) => { // v'yi içeren aralığın indeksi
    for (let k = 0; k < arr.length - 1; k++) if (v >= arr[k] && v < arr[k + 1]) return k;
    return -1;
  };
  const flood = (diag) => {
    const seen = new Uint8Array(NI * NJ);
    const si = locate(XS, 0), sj = locate(ZS, 118);
    if (si < 0 || sj < 0 || !cellFree[sj * NI + si]) return null;
    const nb = diag
      ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1]];
    const st = [sj * NI + si]; seen[st[0]] = 1; let n = 0;
    while (st.length) {
      const c = st.pop(), j = (c / NI) | 0, i = c - j * NI; n++;
      for (const [di, dj] of nb) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= NI || nj >= NJ) continue;
        const m = nj * NI + ni;
        if (seen[m] || !cellFree[m]) continue;
        seen[m] = 1; st.push(m);
      }
    }
    return { seen, n };
  };
  const F4 = flood(false), F8 = flood(true);
  let sameSet = !!F4 && !!F8 && F4.n === F8.n;
  if (sameSet) for (let k = 0; k < F4.seen.length; k++) if (F4.seen[k] !== F8.seen[k]) { sameSet = false; break; }
  let freeCells = 0, freeArea = 0, reachArea = 0;
  for (let i = 0; i < NI; i++) for (let j = 0; j < NJ; j++) {
    const k = j * NI + i; if (!cellFree[k]) continue;
    freeCells++; const a = (XS[i + 1] - XS[i]) * (ZS[j + 1] - ZS[j]);
    freeArea += a; if (F4.seen[k]) reachArea += a;
  }
  ok(!!F4 && !blocked(0, 118) && reachArea > 0.999 * freeArea,
     `exact cell decomposition of free space (${NI}x${NJ} = ${NI * NJ} cells from AABB edges, ${freeCells} free): ` +
     `spawn component covers ${reachArea.toFixed(0)} of ${freeArea.toFixed(0)} m2 free area — resolution-independent, not a sampled grid`);
  ok(sameSet,
     `4- and 8-connected flood fills reach the identical cell set (${F4.n} cells) — no classification rests on a corner-only pinch`);
  const reachSeg = (x, z) => { // bir serbest nokta START bileşeninde mi
    const i = locate(XS, x), j = locate(ZS, z);
    return i >= 0 && j >= 0 && !!F4.seen[j * NI + i];
  };

  const EPS = 0.05;
  let rng = 424242;
  const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;

  // Oyunun hareket entegratörünün birebir kopyası; yön birim vektör olarak verilir.
  // hitOwn: reddedilen aday adımın HEDEF gövdenin genişletilmiş kutusuna girdiğini,
  // yani yüzü gerçekten çapraztığını kanıtlar (duvara varıp durmak yetmez).
  const drive = (sx, sz, ux, uz, fast, target) => {
    let x = sx, z = sz, vx = fast * ux * RUN, vz = fast * uz * RUN;
    let hit = -1, worst = 0, breach = false, hitOwn = false, deepest = 0;
    for (let step = 0; step < 4000; step++) {
      const dt = Math.min(0.05, 1 / 240 + rand() * 0.06);   // 4 ms … 50 ms, clamp dahil
      vx += ux * RUN * ACCEL * dt; vz += uz * RUN * ACCEL * dt;
      const damp = Math.max(0, 1 - FRICTION * dt); vx *= damp; vz *= damp;
      const vlen = Math.hypot(vx, vz);
      if (vlen > RUN) { vx = (vx / vlen) * RUN; vz = (vz / vlen) * RUN; }
      worst = Math.max(worst, Math.hypot(vx, vz) * dt);
      const nx = x + vx * dt, nz = z + vz * dt;
      if (!blocked(nx, z)) x = nx;
      else {
        if (hit < 0) hit = blockerAt(nx, z);
        if (target >= 0 && singleBlocked[target](nx, z)) { hitOwn = true; deepest = Math.max(deepest, Math.abs(nx - x)); }
        vx = 0;
      }
      if (!blocked(x, nz)) z = nz;
      else {
        if (hit < 0) hit = blockerAt(x, nz);
        if (target >= 0 && singleBlocked[target](x, nz)) { hitOwn = true; deepest = Math.max(deepest, Math.abs(nz - z)); }
        vz = 0;
      }
      if (blocked(x, z)) { breach = true; break; }
      if (hit >= 0 && Math.hypot(vx, vz) < 0.01) break;
    }
    return { hit, worst, breach, hitOwn, deepest, x, z, free: !blocked(x, z) };
  };

  let tested = 0, covered = 0, disconnected = 0, breaches = 0, diagRuns = 0, diagBreaches = 0;
  let worstVar = 0, noCross = 0, notFree = 0;
  const misattributed = [], classes = [];
  for (let i = 0; i < BLOCKERS.length; i++) {
    const B = BOX[i];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      // Normal ekseni a, yanal eksen l. Yüz düzlemi f; yanal açıklık (lo, hi) —
      // baş-başa gelen bir koşunun bu gövdeye çarptığı yanal konumların TAM kümesi.
      const f = dx ? (dx > 0 ? B.x1 : B.x0) : (dz > 0 ? B.z1 : B.z0);
      const s = dx || dz;
      const lo = dx ? B.z0 : B.x0, hi = dx ? B.z1 : B.x1;
      const n = f + s * EPS;                       // dış ε katmanının normal koordinatı
      // Örtü: n düzleminde diğer gövdelerin kapalı yanal aralıklarının BİRLEŞİMİ.
      const cov = [];
      for (let j = 0; j < BOX.length; j++) {
        if (j === i) continue;
        const O = BOX[j];
        const a0 = dx ? O.x0 : O.z0, a1 = dx ? O.x1 : O.z1;
        if (!(n > a0 && n < a1)) continue;
        cov.push(dx ? [O.z0, O.z1] : [O.x0, O.x1]);
      }
      cov.sort((p, q) => p[0] - q[0]);
      const gaps = [];                              // örtülmeyen açık alt-aralıklar
      let cur = lo;
      for (const [c0, c1] of cov) {
        if (c0 > cur + EPSN) gaps.push([cur, Math.min(c0, hi)]);
        cur = Math.max(cur, c1);
        if (cur >= hi) break;
      }
      if (cur < hi - EPSN) gaps.push([cur, hi]);
      const open = gaps.filter(g => g[1] - g[0] > 1e-6);
      if (open.length === 0) {
        covered++; classes.push(`${i}${dx}${dz}:covered`);
        continue;   // analitik olarak tamamen örtülü: bu yüze hiçbir yanal konumdan ulaşılamaz
      }
      // Her açık aralık serbest ve bağlantılı bir doğru parçasıdır → tek temsilci
      // noktası, aralığın TAMAMININ bileşenini belirler. Bu örnekleme değildir.
      const live = open.filter(g => reachSeg(dx ? n : (g[0] + g[1]) / 2, dx ? (g[0] + g[1]) / 2 : n));
      if (live.length === 0) {
        disconnected++; classes.push(`${i}${dx}${dz}:disconnected(${open.length} open)`);
        continue;
      }
      // Koridor uzunluğu analitik: yanal kenarlara göre parçala, her parçada sabit.
      const cuts = new Set();
      for (const g of live) { cuts.add(g[0]); cuts.add(g[1]); }
      for (const O of BOX) { const e0 = dx ? O.z0 : O.x0, e1 = dx ? O.z1 : O.x1; cuts.add(e0); cuts.add(e1); }
      const cl = [...cuts].sort((p, q) => p - q);
      let best = null;
      for (const g of live) {
        for (let k = 0; k < cl.length - 1; k++) {
          const p0 = Math.max(cl[k], g[0]), p1 = Math.min(cl[k + 1], g[1]);
          if (p1 - p0 <= 1e-6) continue;
          const t = (p0 + p1) / 2;
          let run = s > 0 ? ((dx ? GX1 : GZ1) - f) : (f - (dx ? GX0 : GZ0));
          for (let j = 0; j < BOX.length; j++) {
            if (j === i) continue;
            const O = BOX[j];
            const l0 = dx ? O.z0 : O.x0, l1 = dx ? O.z1 : O.x1;
            if (!(t > l0 && t < l1)) continue;
            const a0 = dx ? O.x0 : O.z0, a1 = dx ? O.x1 : O.z1;
            const d = s > 0 ? a0 - f : f - a1;
            if (d > 0) run = Math.min(run, d);
          }
          run = Math.min(run, 45);
          if (!best || run > best.run) best = { t, run };
        }
      }
      tested++;
      const { t, run } = best;
      const d = Math.max(0.03, run - 0.02);
      const slam = run < 5 ? 1 : 0;   // koridor kısaysa duvara tam hızla yapış
      const sx = dx ? f + s * d : t, sz = dx ? t : f + s * d;
      const r = drive(sx, sz, dx ? -s : 0, dx ? 0 : -s, slam, i);
      worstVar = Math.max(worstVar, r.worst);
      if (r.breach) breaches++;
      if (!r.free) notFree++;
      if (!r.hitOwn) noCross++;
      if (r.hit !== i) misattributed.push(`${i}${dx}${dz}: hit ${r.hit} (runway ${run.toFixed(2)}${slam ? ', slam' : ''})`);
      classes.push(`${i}${dx}${dz}:tested r=${run.toFixed(2)}${slam ? '/slam' : ''}`);
      for (const ang of [0.5, -0.5]) {
        const u = dx ? [-s * Math.cos(ang), Math.sin(ang)] : [Math.sin(ang), -s * Math.cos(ang)];
        const rd = drive(sx, sz, u[0], u[1], slam, -1);
        diagRuns++;
        worstVar = Math.max(worstVar, rd.worst);
        if (rd.breach) diagBreaches++;
      }
    }
  }
  ok(tested + covered + disconnected === BLOCKERS.length * 4 && tested === 30 && covered === 2 && disconnected === 0,
     `every wall face classified analytically, exactly once: ${tested} sprinted + ${covered} fully covered by the closed intervals of other bodies + ${disconnected} disconnected = ${BLOCKERS.length * 4} — ${classes.join(', ')}`);
  ok(misattributed.length === 0 && noCross === 0 && notFree === 0,
     `each sprinted face: the rejected candidate step actually entered the target body (${tested - noCross}/${tested} crossed the face plane), ` +
     `attribution matched (${tested - misattributed.length}/${tested}), final position free (${tested - notFree}/${tested})` +
     `${misattributed.length ? ' — ' + misattributed.join(', ') : ''}`);
  ok(breaches === 0,
     `${tested} head-on variable-timestep sprints never breach a wall (${breaches} breaches, worst step ${worstVar.toFixed(3)} m)`);
  ok(diagBreaches === 0,
     `${diagRuns} diagonal (±0.5 rad) approaches never breach a wall either (${diagBreaches} breaches)`);
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
  const m = readme.match(/\((\d[\d.,]*)\s*bytes\)/);
  const claimed = m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : NaN;
  ok(claimed === realBytes, `README byte claim matches the file (claimed ${claimed}, actual ${realBytes})`);
}
{
  const m = readme.match(/\*\*(\d+)\s*checks/);
  const declared = m ? parseInt(m[1], 10) : NaN;
  // Bu satırın kendisi de bir kontrol: checks henüz artmadı, bu yüzden +1.
  ok(declared === checks + 1, `README check count matches the harness (declared ${declared}, actual ${checks + 1})`);
}

console.log(`\n${checks} checks executed`);
console.log(fails === 0 ? `QA RESULT: PASS (0 failures)` : `QA RESULT: FAIL (${fails} failures)`);
process.exit(fails === 0 ? 0 : 1);
