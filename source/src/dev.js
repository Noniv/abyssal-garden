// ============================================================================
// development tools: only in dev.html (npm run build:dev), never in index.html
// ============================================================================
//   F    fly the camera along the scripted path (FLY in main.js), one minute through the whole world
//   B    the same flight as a benchmark: the resolution stays fixed, every frame is timed, the result is shown at the end
//   F, B or 1-6 during a flight stop it
{
  const LOGN = 1 << 16, logFrame = new Float32Array(LOGN), logGpu = new Float32Array(LOGN), logAt = new Float32Array(LOGN);
  let flying = false, bench = false, last = 0, nFrame = 0, nGpu = 0;
  const stop = () => { flying = bench = false; dynT = 0; };
  const report = () => {
    const st = (a, n) => { const s = Array.from(a.subarray(0, n)).sort((x, y) => x - y); let sum = 0; for (const v of s) sum += v; return { n, avg: sum / n, p99: s[min(n - 1, floor(n * 0.99))], max: s[n - 1] }; };
    const fm = (o) => `avg ${o.avg.toFixed(2)}  p99 ${o.p99.toFixed(2)}  max ${o.max.toFixed(2)} ms`;
    const f = st(logFrame, nFrame), gp = nGpu ? st(logGpu, nGpu) : null;
    info.textContent = `Fly-through ${W}x${H}, ${f.n} frames\nframe  ${fm(f)}\nGPU    ${gp ? fm(gp) : 'timestamp-query unavailable'}`;
    // the same numbers for scripts: window.dev.result and one console line
    const over = (a, n) => { let c = 0; for (let i = 0; i < n; i++) if (a[i] > 16.7) c++; return c; };
    f.over16_7 = over(logFrame, nFrame); if (gp) gp.over16_7 = over(logGpu, nGpu);
    // where the slow frames were: [flight seconds, frame ms, GPU ms reported that frame]
    const slow = []; for (let i = 0; i < nFrame && slow.length < 200; i++) if (logFrame[i] > 16.7 || logGpu[i] > 16.7) slow.push([+logAt[i].toFixed(2), +logFrame[i].toFixed(1), +logGpu[i].toFixed(1)]);
    dev.result = { width: W, height: H, detail: LV, drawDistanceScale: det, frame: f, gpu: gp, slow };
    console.log('BENCH ' + JSON.stringify(dev.result));
  };
  // Scripted control (URL parameters or window.dev from the console / an automation driver):
  //   ?pose=3&time=20   still at viewpoint 3 with the scene clock held at 20 s
  //   ?fly=12.5         still at 12.5 s into the flight (clock held at the same value unless &time= is given)
  //   ?bench=1          run the benchmark flight 3 s after loading
  // Any of them pins the resolution to its maximum (2560x1440 in a window that size) and the draw distance to full.
  let pinned = false, fixT = -1;
  const pin = () => { pinned = true; hud = false; info.textContent = ''; pix = PIXMAX; det = 1; resize(); ui(false); $('o').style.display = 'none'; };
  const startFlight = (b) => { flying = true; bench = b; fixT = -1; F[FLT] = 0; last = F[LAST]; nFrame = nGpu = 0; if (b) { hud = false; info.textContent = ''; dynT = -Infinity; } };
  const dev = window.dev = {
    result: null,
    pose(n, t) { pin(); stop(); lookAt(...POSES[n - 1]); F[VX] = F[VY] = F[VZ] = 0; if (t >= 0) fixT = t; },
    fly(ft, t) { pin(); stop(); F[FLT] = ft; flyAt(); F[VX] = F[VY] = F[VZ] = 0; fixT = t >= 0 ? t : ft; },
    // camera at (x, y, z) looking at (tx, ty, tz), scene clock held at t if given
    look(x, y, z, tx, ty, tz, t) { pin(); stop(); lookAt(x, y, z, tx, ty, tz); F[VX] = F[VY] = F[VZ] = 0; if (t >= 0) fixT = t; },
    terrain: [T.nv, T.start[T.start.length - 1]], FLY, at(t) { F[FLT] = t; flyAt(); return [F[SPL], F[CX], F[CY], F[CZ], F[YAW], F[PIT]]; }, balls: Wd.BALLS, spots: Wd.SPOTS, anemones: Wd.ANEM, fishRanges: Wd.fishR, fish: Wd.fish,
    bench() { pin(); dev.result = null; startFlight(true); },
    flight() { pin(); startFlight(false); }, get flying() { return flying; },
    get gpu() { return F[GPU]; },
    get size() { return W + 'x' + H; },
  };
  // frame() moves the free camera and then calls render(): step in between and put the camera on the path instead
  const draw = render;
  render = () => {
    if (pinned) { dynT = -Infinity; if (fixT >= 0) F[TIME] = fixT; }
    if (flying) {
      const dtr = F[LAST] - last; last = F[LAST];
      F[FLT] += min(dtr / 1000, 0.1); flyAt();
      if (bench && nFrame < LOGN) { logAt[nFrame] = F[FLT]; logFrame[nFrame++] = dtr; if (F[GPU] > 0) logGpu[nGpu++] = F[GPU]; }
      if (F[FLT] >= FLYT) { if (bench) report(); stop(); }
    }
    draw();
  };
  addEventListener('keydown', (e) => {
    if (menu || e.repeat) return;
    if (e.code === 'KeyF' || e.code === 'KeyB') {
      if (flying) stop();
      // a benchmark hides the stats line and holds the resolution: dynT at -Infinity keeps frame() from tuning it
      else startFlight(e.code === 'KeyB');
    } else if (/Digit[1-6]/.test(e.code)) stop();
  });
  const qp = new URLSearchParams(location.search), num = (k) => qp.has(k) ? +qp.get(k) : -1;
  if (qp.has('pose')) dev.pose(num('pose'), num('time'));
  else if (qp.has('fly')) dev.fly(num('fly'), num('time'));
  else if (qp.has('bench')) { pin(); setTimeout(dev.bench, 3000); }
}
