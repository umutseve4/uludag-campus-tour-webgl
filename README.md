<h1 align="center">Bursa Uludag University . Campus Tour</h1>

<p align="center">
  A single file 3D experience you walk through <b>on foot</b> across the Gorukle campus.<br>
  You start at the campus gate. The road, the faculty building, the library and Mount Uludag<br>
  on the horizon are all in the same composition from the very first frame.
</p>

<p align="center">
  <a href="https://umutseve4.github.io/uludag-campus-tour-webgl/"><b>Start the tour in the browser</b></a>
  &nbsp;.&nbsp; no install, no download
</p>

<p align="center">
  <img src="https://img.shields.io/badge/local%20dependencies-0-FF4D4F?style=flat-square" alt="Zero local dependencies">
  <img src="https://img.shields.io/badge/trees-~700%20%C2%B7%204%20draw%20calls-FF4D4F?style=flat-square" alt="700 trees, 4 draw calls">
  <img src="https://img.shields.io/badge/wall%20sprints-30%20head--on%20%2B%2060%20diagonal-FF4D4F?style=flat-square" alt="90 wall sprints">
</p>

**Build by Opus 5.**

---

## How to move around

| Input | What it does |
|---|---|
| `W` `A` `S` `D` or the arrow keys | Walk, with acceleration and friction |
| Mouse or finger **drag** | Look around, yaw plus pitch, pitch clamped to -1.05 to 0.95 rad |
| `Shift` | Run, 7.2 m/s rising to a 14 m/s ceiling |
| `R` | Return to the starting point |
| `O` or the **Orbit camera** button | Switch to the OrbitControls mode that watches the campus from outside |

The panel at the top right shows the compass heading and the district you are standing in: Campus Gate, then Shuttle Stop, Faculty Building, Central Library, Pine Grove, Uludag View.

## Running it

If you would rather not install anything, the [live version](https://umutseve4.github.io/uludag-campus-tour-webgl/) is ready. To run it locally:

```bash
python -m http.server 8000   # then http://localhost:8000
```

Opening `index.html` directly works too. One file means one *local* file: three.js is fetched from a CDN at run time, so this does not open offline.

## What is in the scene

| Element | How it is generated |
|---|---|
| The wide campus road | 15 m of asphalt plus a kerb plus a pavement on each side, with 120 instanced lane markings |
| Pine groves | Trunk plus a three layer crown, all `InstancedMesh`, around 700 trees in 4 draw calls |
| The snowy summit of Uludag | 130 by 130 segment terrain, deterministic fBm over 5 octaves, rock to snow vertex colouring by altitude |
| The modern faculty building | Main block with horizontal glass bands, a side wing, a brick core tower, a columned entrance canopy, a flagpole |
| The central library | Podium, vertical glass slots, a glazed atrium entrance, a curved metal roof, a pool in front of it |
| Street lamps | Staggered on both sides of the road at 26 m intervals, with an emissive lamp head |
| Wooden benches | Metal legs plus wooden seat and back slats, at 34 m intervals, with bins |
| The shuttle bus | Runs the road back and forth between -230 and +116 m, its wheels turn with its speed, it changes lane on the return |
| Further texture | The campus gate, two shuttle stops, an amphitheatre terrace, shrubs, flower beds, birds in flight |

Lighting: a directional sun whose **shadow map is carried around the camera**, so shadow resolution is not wasted across a 3 km scene, plus a hemisphere light and a little ambient, ACES filmic tone mapping, distance fog and a gradient sky shader.

## Technical notes

- Three.js **0.169.0** from a CDN through an `importmap`. `OrbitControls` comes from the `examples/jsm` path of the same version.
- A single `index.html` file (41,347 bytes), zero local dependencies, zero build steps, no `node_modules`.
- Performance: instancing for trees, shrubs, flowers and lane markings, a shared material pool, `devicePixelRatio` capped at 2, and rendering stops when the tab goes to the background.
- Accessibility and resilience: with `prefers-reduced-motion` set the scene falls back to a still orbit mode, the canvas is focusable and carries an `aria-label`, `webglcontextlost` is caught, and an explanatory screen appears when WebGL is unavailable.
- Collision is **only** for structures: the faculty blocks, the library body, atrium and pool, and the gate piers are solid. Trees, benches, lamps and the shuttle bus are deliberately passable. The walking corridor is bounded by `x` in `[-150, 150]` and `z` in `[-260, 150]`.

## Verification

There are two independent layers and both run on every push through `.github/workflows/qa.yml`.

```bash
node tests/qa.mjs        # -> QA RESULT: PASS (0 failures)
node tests/browser.mjs   # -> BROWSER RESULT: PASS (0 failures)  (needs Playwright)
```

**1) The static harness.** `tests/qa.mjs`, dependency free: **57 checks, all of them pass.** It pulls the constants, the `BLOCKERS` array and the `blocked()` function out of the **real source text** of `index.html` and runs them in Node.

<details>
<summary>What those 57 checks are</summary>

- the module script parses as a valid ES module;
- the single file contract holds: exactly 2 `<script>` tags, no external `src`, the three.js version pinned;
- the visible `Build by Opus 5.` credit, the full MIT licence text and the title and instruction layer are all in place;
- the instruction layer lists **every key** that is bound in code, 11 key labels;
- the opening composition is preserved: `START.yaw = 0`, so the visitor is born facing the campus;
- the test probe `window.__campus` is frozen and getter only, so tests cannot drive the scene;
- all 8 keyboard codes and the drag to look pointer events are wired;
- the collision margin is not assumed, it is **measured** out of `blocked()` itself by binary search, at 0.9 m;
- **contact attribution and collision see the same geometry:** which wall was hit is decided by re-binding the product's own `blocked()` text to a single obstacle, not by a copy that rewrites the margin. Across 200,000 random points and 48 boundary points the two functions decide identically. That check is not idle: the measured margin was `0.9000000000000021`, a hair wider than the `0.9` literal in the source, and a contact exactly on the boundary was being attributed to the neighbouring building.
- **that re-binding is verified structurally too:** the text of `blocked()` contains no free name other than `BLOCKERS`, and the transformed text is **byte for byte equal** to the original once the name is put back. The test does not re-derive the product logic, it re-binds it.
- **collision coverage:** each of the 8 structure footprints is closed at all 625 sample points, 0 uncovered;
- **the road corridor** is never blocked across 2000 samples, so the bus and the walking line are never obstructed;
- **25 separate randomised 100 second walks** never end inside a building. The largest per frame step observed is **0.188 m** and the theoretical ceiling at the `dt` clamp is **0.700 m**, both under the 0.9 m collision margin;
- **the wall test runs in configuration space and takes NO SAMPLES.** Free space is built as an **exact cell decomposition** from the edges of the obstacles themselves, 17 by 15 cells, each one either wholly full or wholly empty, and that decomposition is independent of any grid resolution. The component containing the starting point covers the **whole** of the free area, 117,557 m2, and 4 neighbour and 8 neighbour connectivity give the identical cell set, so no classification rests on a corner only pinch. For the 32 wall faces of the 8 obstacle boxes, the **union of the closed intervals** of the other bodies is derived analytically. Every uncovered open interval is a free and connected line segment, so a single representative point settles the component of the **entire** interval. The breakdown is **pinned**: **30 sprinted plus 2 fully covered plus 0 disconnected from the start equals 32**. For every sprinted face three things are proved separately: that the rejected candidate step actually **entered the target body**, meaning it really crossed the face rather than merely arriving at the wall and stopping; that the obstacle which stopped it was the **intended** obstacle; and that the position is free once the sprint ends. The runway is analytic too: 45 m on 29 of the 30 faces, 1.20 m on one, where the wall is hit at full speed. Two **diagonal** approaches at plus and minus 0.5 rad are then run against every face: none of the 30 head-on and 60 diagonal sprints passes through a wall.
  Every one of those traps was real. First the starting point fell inside a neighbouring building. Then the risk appeared of a sprint that hits some other wall and passes for free. Then CI showed that 13 faces have no corridor at all along their normal. Then an independent audit said that skipping a face for having no corridor is an assumption, not evidence. Then CI revealed that contact attribution was being done with a hair too wide a margin. Finally the audit said a 41 point sampling cannot be presented as exact geometric classification. All six became permanent checks.
- the shuttle bus stays within [-230.0, +116.0] m and really does travel in both directions;
- the HUD place names resolve correctly at 8 different z positions;
- the **numeric claims** of this README, the file size and the check count, are compared against the file itself.

</details>

**2) Real browser acceptance, `tests/browser.mjs`, Chromium plus WebGL.** CI installs Playwright outside the repository tree, opens the page from a local server and performs real user actions: the load itself, with 0 console errors and 0 failed requests, a live WebGL context, the loader lifting, the render loop advancing, the overlays not covering the middle of the scene, walking with `W` and the district label changing, dragging and the compass turning, `R` returning to the start and **how many frames** the HUD label takes to catch up, orbit mode by `O` and by the button, the probe being unwritable, interaction surviving a narrow viewport, and resizing. There is no GPU on a CI runner, it is SwiftShader, so the tests watch **progress** rather than frame rate. As evidence, the `artifacts/campus.png` screenshot is uploaded to the CI output.

## The limits of this evidence

So as not to overstate it, here is what the tests do **not** cover:

- **Smoothness.** There is no GPU in CI. Any frame rate measured there is the speed of software rasterisation, not a measure of the experience on real hardware.
- **Browser diversity.** Only Linux and Chromium with SwiftShader is verified. Firefox, Safari and WebKit, and mobile GPUs, are out of scope.
- **What is exact and what is empirical.** Face coverage and free space connectivity are now **exact**: the analytic interval union and the cell decomposition derived from the AABB edges are independent of resolution. The footprint grids, the random walks and the wall sprints themselves are still **empirical** evidence. It has not been proved mathematically that no trajectory in continuous space can tunnel. That the per frame step stays below the collision margin is measured, not proved.
- **Architectural accuracy.** The scene is inspired by the Gorukle campus. It is not a surveyed or mapped reproduction, and no test compares the buildings against their real positions.
- **Visual quality.** The screenshot is uploaded as evidence but is not compared against a reference image. Catching a broken composition still needs a human eye.

---

MIT, see `LICENSE`. The code is entirely procedural and contains no third party model, texture or audio file. The scene is a stylised interpretation **inspired by** the Gorukle campus, not a reproduction to scale.
