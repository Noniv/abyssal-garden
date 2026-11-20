// ============================================================================
// audio: procedural underwater ambience (no sample files)
// ============================================================================
// A fixed Web Audio graph, built on the first click / key / touch and driven by a 10 Hz timer, not the frame loop.
// Underwater: no noise at all, only what a diver hears through water: muffled, indistinct low "blop blop" bubbles and distant
// all behind a heavy low-pass and nearly dry (no echo). The diver breathes: a soft inhale, then a burst of bubbles.
// Above the surface they fade away and the air takes over: wind, swell, lapping ripples and the odd gull; crossing the
// surface makes a splash. The sound can be switched on and off from the menu or with M (the choice is remembered).
let torchClick = () => {}; // the torch switch's click, set up with the sound graph
let AC, OUT, muted = (() => { try { return localStorage.abyssalMute === '1'; } catch { return false; } })();
const VOL = 0.78; // master level: about -18.5 LUFS, peaks near -5.5 dBFS
function mkSound(ac) {
  const sr = ac.sampleRate;
  // node of class C with options o, connected to every node / param in `to`; sources start at once
  const N = (C, o, ...to) => { const n = new C(ac, o); for (const d of to) n.connect(d); if (n.start) n.start(); return n; };
  const G = (gain, ...to) => N(GainNode, { gain }, ...to);
  const BQ = (type, frequency, Q, ...to) => N(BiquadFilterNode, { type, frequency, Q }, ...to);
  const lfo = (frequency, depth, to) => N(OscillatorNode, { frequency }, G(depth, to));
  const noise = (secs, f) => { const n = sr * secs | 0, b = new AudioBuffer({ length: n, numberOfChannels: 2, sampleRate: sr }); f(b.getChannelData(0), n); f(b.getChannelData(1), n); return b; };
  // seamless brown noise loop (the end cross-fades into the start)
  const nb = noise(11, (d, n) => { for (let i = 0, b = 0; i < n + 4096; i++) { b = (b + 0.02 * (rnd() * 2 - 1)) / 1.02; if (i < n) d[i] = b * 3.5; else { const k = (i - n) / 4096; d[i - n] = d[i - n] * k + b * 3.5 * (1 - k); } } });
  // reverb impulse: 5 s of noise that fades out and gets darker
  const ir = noise(5, (d, n) => { for (let i = 0, b = 0; i < n; i++) { const t = i / sr; b += (rnd() * 2 - 1 - b) * (0.04 + 0.5 * exp(-t * 2)); d[i] = b * (1 - exp(-t * 30)) * exp(-t * 1.5) * (1 - i / n); } });

  const lim = N(DynamicsCompressorNode, { threshold: -6, knee: 6, ratio: 20, attack: 0.003, release: 0.3 }, ac.destination);
  const out = OUT = G(0, lim), uwF = BQ('lowpass', 520, 0.6, out), uw = G(1, uwF), air = G(0, out), wet = N(ConvolverNode, { buffer: ir }, uw);
  const src = (playbackRate, ...to) => N(AudioBufferSourceNode, { buffer: nb, loop: true, playbackRate }, ...to);
  // pooled voices: oscillator -> envelope -> pan -> dry + reverb
  const pool = (n, send, type, dest = uw, lp = 0) => Array.from({ length: n }, () => { const p = N(StereoPannerNode, {}, dest, G(send, wet)), g = G(0, lp ? BQ('lowpass', lp, 0.7, p) : p); return { p, g, o: N(OscillatorNode, { type }, g) }; });
  const bub = pool(6, 0.03), brt = pool(16, 0.02), hiss = G(0, uw);
  src(1.6, BQ('bandpass', 800, 0.8, hiss)); // the inhale: a short, soft, low breath
  // sounds with a place: the low rumble of the vents and the pressure of a blacktip swimming past, panned to where they are
  const rum = G(0, uw), rumP = N(StereoPannerNode, {}, rum), whoosh = G(0, uw), whP = N(StereoPannerNode, {}, whoosh);
  src(0.5, BQ('lowpass', 150, 0.7, rumP)); src(1.3, BQ('bandpass', 240, 0.8, whP));
  // above the water: wind (louder as you swim faster), a slow swell, small lapping ripples, gulls, and the splash
  const windG = G(0.12, air), swell = G(0.2, air), lap = G(0.05, air), gull = pool(3, 0.5, 'sawtooth', air, 2600), splash = G(0, out);
  src(0.8, BQ('bandpass', 520, 0.55, windG)); lfo(0.05, 0.07, windG.gain); lfo(0.083, 0.05, windG.gain);
  src(0.47, BQ('lowpass', 750, 0.5, swell)); lfo(0.12, 0.17, swell.gain); lfo(0.19, 0.08, swell.gain);
  src(1.37, BQ('highpass', 1800, 0.5, BQ('bandpass', 3600, 0.8, lap))); lfo(0.55, 0.04, lap.gain); lfo(0.83, 0.03, lap.gain);
  src(1.9, BQ('lowpass', 1100, 0.5, splash));
  const tick = G(0, out); src(2.9, BQ('highpass', 2200, 0.7, tick));
  torchClick = (on) => { const t = ac.currentTime + 0.01; tick.gain.cancelScheduledValues(t); tick.gain.setValueAtTime(on ? 0.1 : 0.06, t); tick.gain.setTargetAtTime(0, t + 0.004, 0.012); };
  // one note: pitch glides f0 -> f1 over dur, level rises to vol in att then dies away
  const play = (vs, t, f0, f1, dur, vol, att) => {
    const v = vs.shift(), f = v.o.frequency, g = v.g.gain; vs.push(v);
    v.p.pan.setValueAtTime(rr(-0.7, 0.7), t);
    f.setValueAtTime(f0, t); f.exponentialRampToValueAtTime(f1, t + dur);
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(vol, t + att); g.setTargetAtTime(0, t + att, (dur - att) / 5);
  };
  let lt = ac.currentTime, tB = lt + 1.5, tG = lt + 3, tBr = lt + 2, brP = 4.8, blub = 0, lx = F[CX], ly = F[CY], lz = F[CZ], was = F[CY] > 0;
  out.gain.setTargetAtTime(muted ? 0 : VOL, lt, 1);
  return () => {
    const now = ac.currentTime, t = now + 0.05, dt = now - lt;
    if (dt <= 0) return;
    let v = hypot(F[CX] - lx, F[CY] - ly, F[CZ] - lz) / dt; if (v > 60) v = 0; // ignore jumps to a viewpoint
    lt = now; lx = F[CX]; ly = F[CY]; lz = F[CZ];
    // in the air the underwater world is a faint muffled bed and the sky's sounds come up
    const above = ly > 0.02;
    uw.gain.setTargetAtTime(above ? 0.07 : 1, t, 0.15); air.gain.setTargetAtTime(above ? 1 : 0, t, above ? 0.7 : 0.2);
    { // nearest vent and nearest blacktip: loudness by distance, side by where they are relative to the head
      const vt = Wd.vents; let bd = 1e9, bp = 0;
      for (let i = 0; i < vt.length; i += 3) { const dx = vt[i] - F[CX], dz = vt[i + 2] - F[CZ], d = hypot(dx, vt[i + 1] - F[CY], dz); if (d < bd) { bd = d; bp = (dx * F[RX] + dz * F[RZ]) / (d + 0.1); } }
      const k = max(0, 1 - (bd - 3) / 30);
      rum.gain.setTargetAtTime(above || muted ? 0 : 0.5 * k * k, t, 0.4); rumP.pan.setTargetAtTime(max(-1, min(1, bp)), t, 0.3);
      let wd = 1e9, wp = 0; const pu = Wd.pups;
      for (let i = 0; i < pu.length; i += 8) { const dx = PUP[i] - F[CX], dz = PUP[i + 2] - F[CZ], d = hypot(dx, PUP[i + 1] - F[CY], dz); if (d < wd) { wd = d; wp = (dx * F[RX] + dz * F[RZ]) / (d + 0.1); } }
      const kw = max(0, 1 - (wd - 1.5) / 13);
      whoosh.gain.setTargetAtTime(above ? 0 : 0.35 * kw * kw * kw, t, 0.25); whP.pan.setTargetAtTime(max(-1, min(1, wp)), t, 0.2);
    }
    windG.gain.setTargetAtTime(0.12 + 0.3 * pow(min(v / 26, 1), 1.2), t, 0.4);
    if (above !== was) { // through the surface: a splash and, going in, a few bubbles
      was = above; splash.gain.cancelScheduledValues(t); splash.gain.setValueAtTime(0.13, t); splash.gain.setTargetAtTime(0, t + 0.03, 0.12);
      if (!above) { let tt = t; for (let n = 4; n--;) { const f = rr(380, 1300); play(bub, tt, f, f * rr(1.4, 2.2), 0.05 + 40 / f, rr(0.04, 0.09), 0.006); tt += rr(0.05, 0.14); } }
    }
    if (t > tG) {
      if (above) { // a gull: two to four cries, each a rise and a fall in pitch
        let tt = t; const f = rr(1500, 2000);
        for (let n = 2 + rnd() * 3 | 0; n--;) { play(gull, tt, f * 0.9, f * 1.45, 0.16, 0.05, 0.03); play(gull, tt + 0.15, f * 1.45, f * 0.8, 0.3, 0.05, 0.02); tt += rr(0.4, 0.6); }
        tG = tt + rr(6, 18);
      } else tG = t + rr(2, 6);
    }
    if (t > tB) { // a cluster of 1-5 deaf, low "blops": a soft sine that jumps up in pitch; more of them when you swim
      let tt = t;
      for (let n = 1 + rnd() * rnd() * 5 | 0; n--;) { const f = rr(150, 440); play(bub, tt, f, f * rr(1.5, 2.4), rr(0.1, 0.22), rr(0.12, 0.26), 0.01); tt += rr(0.09, 0.3); }
      if (rnd() < 0.15) play(bub, tt, rr(70, 110), rr(130, 190), 0.4, 0.3, 0.02); // now and then a big, deep one
      tB = tt + rr(0.3, 2.6) / (1 + v / 12);
    }
    // the diver's breathing, one cycle every ~5 s: a soft inhale, then the exhale, a deep blub and a burst of small bubbles
    // that rolls out and thins
    let ph = t - tBr; if (ph > brP) { tBr = t; ph = 0; brP = rr(4.2, 5.6); blub = 0; }
    hiss.gain.setTargetAtTime(ph < 1.3 && !above ? 0.05 : 0, t, ph < 1.3 ? 0.25 : 0.1);
    if (ph > 1.5 && ph < 3.6) {
      if (!blub) { blub = 1; play(brt, t, 120, 260, 0.3, 0.3, 0.02); }
      for (let n = 30 * exp(-(ph - 1.5) * 1.5) * 0.1 + rnd() | 0; n--;) { const f = rr(260, 820); play(brt, t + rnd() * 0.1, f, f * rr(1.3, 2), rr(0.03, 0.08), rr(0.05, 0.12), 0.004); }
    }
  };
}
// called on every click / key / touch: builds the graph once and resumes it when the browser allows
function sound() {
  if (!AC) { AC = new AudioContext({ latencyHint: 'playback' }); setInterval(mkSound(AC), 100); }
  if (AC.state === 'suspended' && !document.hidden) AC.resume();
}
// sound on / off: the two buttons in the menu and the M key, remembered between visits
const sndB = $('u').querySelectorAll('button');
const snd = (m) => {
  muted = m; try { localStorage.abyssalMute = m ? 1 : 0; } catch {}
  sndB.forEach((b, i) => { b.className = (i === 0) === !m ? 'on' : ''; });
  if (OUT) OUT.gain.setTargetAtTime(m ? 0 : VOL, AC.currentTime, 0.08);
};
const mute = () => snd(!muted);
sndB.forEach((b, i) => { b.onclick = () => { sound(); snd(i === 1); }; });
snd(muted);
document.addEventListener('visibilitychange', () => { if (AC) document.hidden ? AC.suspend() : AC.resume(); });
