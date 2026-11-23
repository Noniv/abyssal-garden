// ============================================================================
// renderer, camera and input
// ============================================================================
const $ = (id) => document.getElementById(id);
const canvas = $('c'), info = $('i'), body = document.body;
// a phone held upright gets the page turned on its side (see template.html)
const rot = matchMedia('(orientation:portrait) and (pointer:coarse)');
// loading bar: each stage glides it to `to` (the share done) over ~`ms` on the compositor, so it moves while this
// thread is busy
let loaded = 0, dead; // dead: the graphics device was lost
const say = (m, to, ms) => {
  if (!dead) $('s').textContent = m;
  const a = $('b').animate({ transform: [`scaleX(${loaded})`, `scaleX(${to})`] }, { duration: ms, fill: 'forwards', easing: 'cubic-bezier(.3,.5,.5,1)' });
  loaded = to;
  // go on once the animation runs: one not started before the thread gets busy stays stuck (timer: hidden tabs)
  return new Promise((r) => { a.ready.then(() => setTimeout(r)); setTimeout(r, document.hidden ? 0 : 1e3); });
};
const fail = (m) => { throw new Error(m, { cause: 1 }); }; // cause marks a message that is shown as it is
if (!navigator.gpu) fail('This scene needs WebGPU. Try a current Chrome or Edge.');
const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
if (!adapter) fail('No WebGPU adapter found.');
$('w').hidden = !!navigator.userAgentData; // only Chromium-based browsers have it
const hasTS = adapter.features.has('timestamp-query');
const device = await adapter.requestDevice({ requiredFeatures: hasTS ? ['timestamp-query'] : [] });
let gpuErrShown = 0;
device.addEventListener('uncapturederror', (e) => { // the first GPU error is also shown on the page, so a black screen explains itself
  console.error('GPU: ' + e.error.message);
  if (gpuErrShown++) return;
  const d = document.createElement('pre'); d.textContent = 'GPU error: ' + e.error.message.slice(0, 1500);
  d.style.cssText = 'position:fixed;left:8px;top:8px;right:60px;max-height:60vh;overflow:auto;margin:0;padding:8px;background:#300c;color:#fcc;font:11px/1.3 monospace;white-space:pre-wrap;z-index:99;pointer-events:none';
  document.body.appendChild(d);
});
// out of memory or a GPU timeout: reload a level lower, or on Low say what happened
device.lost.then((l) => {
  if (l.reason === 'destroyed') return; // the page is closing
  if (LV < 2) { keep('abyssal', LV + 1); location.reload(); }
  dead = body.className = 'l e'; $('s').textContent = 'The graphics device was lost. Reload the page to try again.';
});
const ctx = canvas.getContext('webgpu'), FMT = navigator.gpu.getPreferredCanvasFormat();
const Q = device.queue, HDR = 'rgba16float', DEPTH = 'depth32float';
const TU = GPUTextureUsage, BU = GPUBufferUsage, SS = GPUShaderStage;

const mod = (code) => device.createShaderModule({ code });
const buf = (data, usage) => { const b = device.createBuffer({ size: (data.byteLength + 3) & ~3, usage: usage | BU.COPY_DST }); Q.writeBuffer(b, 0, data.buffer || data, data.byteOffset || 0, data.byteLength); return b; };
const tex = (w, h, format, usage, o = {}) => device.createTexture({ size: [w, h, o.d || 1], format, usage, mipLevelCount: o.mips || 1, sampleCount: o.samples || 1, dimension: o.d ? '3d' : '2d' });

// ---------------------------------------------------------------- static resources
const sRep = device.createSampler({ addressModeU: 'repeat', addressModeV: 'repeat', magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', maxAnisotropy: LV > 1 ? 1 : 8 });
const sClamp = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
const sCmp = device.createSampler({ compare: 'less-equal', magFilter: 'linear', minFilter: 'linear' });
const tShadow = tex(SHADOW, SHADOW, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tDummy = tex(1, 1, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
const tWater = tex(WATER, WATER, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 5 });
const tDetail = tex(1024, 1024, 'rgba8unorm', TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { mips: 11 });
const tVol = tex(NX / 2, NY / 2, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST, { d: NZ / 2 });
const tMap = tex(1024, 1024, 'rgba8unorm', TU.TEXTURE_BINDING | TU.COPY_DST);

const UB = new Float32Array(72), UBS = new Float32Array(72);
const ubo = device.createBuffer({ size: 512, usage: BU.UNIFORM | BU.COPY_DST }), uboS = device.createBuffer({ size: 512, usage: BU.UNIFORM | BU.COPY_DST });
const WT = new Float32Array(4), uboW = device.createBuffer({ size: 16, usage: BU.UNIFORM | BU.COPY_DST });

const VF = SS.VERTEX | SS.FRAGMENT;
const bgl0 = device.createBindGroupLayout({ entries: [
  { binding: 0, visibility: VF, buffer: {} },
  { binding: 1, visibility: VF, sampler: {} }, { binding: 2, visibility: VF, sampler: {} }, { binding: 3, visibility: VF, sampler: { type: 'comparison' } },
  { binding: 4, visibility: VF, texture: { sampleType: 'depth' } },
  { binding: 5, visibility: VF, texture: {} }, { binding: 6, visibility: VF, texture: {} },
  { binding: 7, visibility: VF, texture: { viewDimension: '3d' } }, { binding: 8, visibility: VF, texture: {} }] });
const mkBG0 = (u, sh) => device.createBindGroup({ layout: bgl0, entries: [
  { binding: 0, resource: { buffer: u } }, { binding: 1, resource: sRep }, { binding: 2, resource: sClamp }, { binding: 3, resource: sCmp },
  { binding: 4, resource: sh.createView() }, { binding: 5, resource: tWater.createView() }, { binding: 6, resource: tDetail.createView() },
  { binding: 7, resource: tVol.createView() }, { binding: 8, resource: tMap.createView() }] });
const bg0 = mkBG0(ubo, tShadow), bg0s = mkBG0(uboS, tDummy);
const pl0 = device.createPipelineLayout({ bindGroupLayouts: [bgl0] });

const bglBlit = device.createBindGroupLayout({ entries: [{ binding: 0, visibility: SS.FRAGMENT, texture: {} }, { binding: 1, visibility: SS.FRAGMENT, sampler: {} }] });
const plBlit = device.createPipelineLayout({ bindGroupLayouts: [bglBlit] });
const mBlit = mod(W_BLIT);
const blitPipe = (entry, format, add) => device.createRenderPipeline({ layout: plBlit, vertex: { module: mBlit, entryPoint: 'vs' },
  fragment: { module: mBlit, entryPoint: entry, targets: [{ format, blend: add ? { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } } : undefined }] } });
const pMip8 = blitPipe('fsMip', 'rgba8unorm'), pMip16 = blitPipe('fsMip', HDR), pDown0 = blitPipe('fsDown0', HDR), pDown = blitPipe('fsDown', HDR), pUp = blitPipe('fsUp', HDR, true);
const blitBG = (view) => device.createBindGroup({ layout: bglBlit, entries: [{ binding: 0, resource: view }, { binding: 1, resource: sClamp }] });
const colorAtt = (view, clear) => ({ view, loadOp: clear ? 'clear' : 'load', storeOp: 'store', clearValue: [0, 0, 0, 0] });

// vertex layouts
const A = (shaderLocation, offset, format) => ({ shaderLocation, offset, format });
const vbSolid = { arrayStride: 16, attributes: [A(0, 0, 'float32x3'), A(1, 12, 'snorm8x4')] };
const ibSolid = { arrayStride: 48, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4'), A(4, 32, 'float32x4')] };
const ibLeaf = { arrayStride: 36, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4'), A(2, 32, 'unorm8x4')] };
const ibAnim = { arrayStride: 32, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4')] };
const ibBub = { arrayStride: 32, stepMode: 'instance', attributes: [A(0, 0, 'float32x4'), A(1, 16, 'float32x4')] };
const ibSnow = { arrayStride: 16, stepMode: 'instance', attributes: [A(0, 0, 'float32x4')] };

const scenePipe = (m, vsE, fsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  fragment: { module: m, entryPoint: fsE, targets: [{ format: HDR, blend: o.blend }] },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: !o.blend, depthCompare: 'greater' }, multisample: { count: AA } });
const shadowPipe = (m, vsE, buffers, o = {}) => device.createRenderPipeline({ layout: pl0,
  vertex: { module: m, entryPoint: vsE, buffers, constants: o.constants },
  primitive: { topology: o.strip ? 'triangle-strip' : 'triangle-list', cullMode: o.cull || 'none' },
  depthStencil: { format: DEPTH, depthWriteEnabled: true, depthCompare: 'less', depthBias: 2, depthBiasSlopeScale: 1.5 } });

await say('Compiling shaders…', 0.05, 300);
const mSolid = mod(W_SOLID), mLeaf = mod(W_LEAF), mAnim = mod(W_ANIM), mSurf = mod(W_SURF), mSpr = mod(W_SPR);
const pTerrain = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid], { cull: 'back' });
const pSolid = scenePipe(mSolid, 'vs', 'fs', [vbSolid, ibSolid]);
const pLeaf = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 9 } });
const pLeaf5 = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 5 } });
const pLeafS = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3, FAR: 70 } });
const pLeafF = scenePipe(mLeaf, 'vs', 'fs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });
const pFish = scenePipe(mAnim, 'vsFish', 'fsFish', [vbSolid, ibAnim]);
const pManta = scenePipe(mAnim, 'vsManta', 'fsManta', [vbSolid, ibAnim]);
const pShark = scenePipe(mAnim, 'vsShark', 'fsShark', [vbSolid, ibAnim]);
const ibNurseL = { arrayStride: 64, stepMode: 'instance', attributes: [A(2, 0, 'float32x4'), A(3, 16, 'float32x4'), A(4, 32, 'float32x4'), A(5, 48, 'float32x4')] };
const ibPupBL = { arrayStride: 16, stepMode: 'instance', attributes: [A(4, 0, 'float32x4')] };
const pPup = scenePipe(mAnim, 'vsPup', 'fsPup', [vbSolid, ibAnim, ibPupBL]);
const pNurse = scenePipe(mAnim, 'vsNurse', 'fsNurse', [vbSolid, ibNurseL]);
const pSurf = scenePipe(mSurf, 'vs', 'fs', [], { strip: true, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } }), pBack = scenePipe(mSurf, 'vsB', 'fsB', [], { strip: true });
const pBub = scenePipe(mSpr, 'vsBub', 'fsBub', [ibBub], { strip: true, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } } });
const ADD = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } };
const pSnow = scenePipe(mSpr, 'vsSnow', 'fsSnow', [ibSnow], { strip: true, blend: ADD });
const PREM = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } };
const pPuf = scenePipe(mSpr, 'vsPuff', 'fsPuff', [ibBub], { strip: true, blend: PREM });
const pJelly = scenePipe(mAnim, 'vsJelly', 'fsJelly', [vbSolid, ibAnim], { blend: PREM });
const pGull = scenePipe(mAnim, 'vsGull', 'fsGull', [vbSolid, ibAnim]);
const pGl = scenePipe(mLeaf, 'vsGl', 'fsGl', [ibBub], { strip: true, blend: ADD, constants: { ROWS: 7 } });
const pSolidSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid]), pTerrSh = shadowPipe(mSolid, 'vs', [vbSolid, ibSolid], { cull: 'front' });
const pLeafSh = shadowPipe(mLeaf, 'vs', [ibLeaf], { strip: true, constants: { ROWS: 3 } });

const mWater = mod(W_WATER);
const pWater = device.createRenderPipeline({ layout: 'auto', vertex: { module: mWater, entryPoint: 'vs' }, fragment: { module: mWater, entryPoint: 'fs', targets: [{ format: HDR }] } });
const bgWater = device.createBindGroup({ layout: pWater.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: uboW } }] });
const waterViews = [0, 1, 2, 3, 4].map((m) => tWater.createView({ baseMipLevel: m, mipLevelCount: 1 }));
const waterBG = waterViews.map((v) => blitBG(v));
const waterPass = waterViews.map((v) => ({ colorAttachments: [colorAtt(v, true)] }));

const mRays = mod(W_RAYS), mPost = mod(W_POST), mRB = mod(W_RBLUR);
const pRB = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRB, entryPoint: 'vs' }, fragment: { module: mRB, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pRays = device.createRenderPipeline({ layout: 'auto', vertex: { module: mRays, entryPoint: 'vs' }, fragment: { module: mRays, entryPoint: 'fs', targets: [{ format: HDR }] } });
const pPost = device.createRenderPipeline({ layout: 'auto', vertex: { module: mPost, entryPoint: 'vs' }, fragment: { module: mPost, entryPoint: 'fs', targets: [{ format: FMT }] } });

// ---------------------------------------------------------------- sun + shadow matrix
const SUN = (() => { const v = [0.27, 1, -0.24], l = hypot(...v); return v.map((c) => c / l); })();
{
  const L = SUN, lr = [L[1], -L[0], 0], ll = hypot(...lr); lr[0] /= ll; lr[1] /= ll;
  const lu = [L[1] * lr[2] - L[2] * lr[1], L[2] * lr[0] - L[0] * lr[2], L[0] * lr[1] - L[1] * lr[0]];
  const R = 225, d0 = -175, d1 = 125, m = UBS;
  m[0] = lr[0] / R; m[4] = lr[1] / R; m[8] = lr[2] / R; m[12] = 0;
  m[1] = lu[0] / R; m[5] = lu[1] / R; m[9] = lu[2] / R; m[13] = 0;
  m[2] = -L[0] / (d1 - d0); m[6] = -L[1] / (d1 - d0); m[10] = -L[2] / (d1 - d0); m[14] = d1 / (d1 - d0);
  m[3] = 0; m[7] = 0; m[11] = 0; m[15] = 1;
  for (let i = 0; i < 16; i++) { UBS[16 + i] = m[i]; UB[16 + i] = m[i]; }
  for (let i = 0; i < 3; i++) { UB[48 + i] = UBS[48 + i] = SUN[i]; }
  UBS[32] = 0; UBS[33] = -20; UBS[34] = 0; UBS[35] = 0; UBS[58] = 1;
  Q.writeBuffer(uboS, 0, UBS);
}

// ---------------------------------------------------------------- world generation
await say('Sculpting the seabed…', 0.25, 1200);
// marks a load in progress (quality.js); leaving the page before it ends is not a crash
keep('abyssalLoad', 1);
addEventListener('pagehide', () => keep('abyssalLoad', ''));
// Easter egg: a geyser (a little volcano on the sea floor in shallow water, throwing up big bubbles and, past the surface, spray). It simmers;
// swim over it and it throws you 100 m up, and gravity brings you back
let GEY = false, GX = 0, GZ = 0, GY = 0, fly = 0, gCool = 0, gJet = 0, gAcc = 0, ibGey = null, nGey = 0, gJx = 0, gJz = 0, sbT0 = 0, ibSB = null;
// more easter eggs: the message at the end of the long tunnel, the whale spot, the downdraft in the tunnel's first shaft
const GP = []; // seagull perches (x, top, z, yaw), found on the rocks that stand out of the water
let ibMsg = null, nMsg = 0, WHALE = null, ibVent = null, nVent = 0, trip = null;
const TUN = [];
let D;
{
  const prims = primBuffer();
  const m = mod(W_DENS), p = device.createComputePipeline({ layout: 'auto', compute: { module: m, entryPoint: 'main' } });
  const size = NX * NY * NZ * 4;
  const u = new ArrayBuffer(48), uu = new Uint32Array(u), uf = new Float32Array(u);
  uu[0] = NX; uu[1] = NY; uu[2] = NZ; uf[4] = OX; uf[5] = OY; uf[6] = OZ; uf[7] = VS;
  uu[8] = MESAS.length; uu[9] = ARCHES.length; uu[10] = HOLES.length; uu[11] = CLEARS.length;
  const bu = buf(new Uint8Array(u), BU.UNIFORM), bp = buf(prims, BU.STORAGE);
  const bd = device.createBuffer({ size, usage: BU.STORAGE | BU.COPY_SRC }), br = device.createBuffer({ size, usage: BU.MAP_READ | BU.COPY_DST });
  const bg = device.createBindGroup({ layout: p.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: bu } }, { binding: 1, resource: { buffer: bd } }, { binding: 2, resource: { buffer: bp } }] });
  const e = device.createCommandEncoder(), c = e.beginComputePass();
  c.setPipeline(p); c.setBindGroup(0, bg); c.dispatchWorkgroups(NX / 4, NY / 4, NZ / 4); c.end();
  e.copyBufferToBuffer(bd, 0, br, 0, size);
  Q.submit([e.finish()]);
  await br.mapAsync(GPUMapMode.READ);
  D = new Float32Array(br.getMappedRange().slice(0));
  br.unmap(); br.destroy(); bd.destroy();
  // the walls around the world get a natural crest: its height wanders with noise (smoothly, never a flat plateau), so the
  // ring breaks up into rocky islets and low reefs with gaps of open sea between them
  for (let z = 0; z < NZ; z++) for (let x = 0; x < NX; x++) {
    const wx = OX + x * VS, wz = OZ + z * VS, w = sstep(136, 152, hypot(wx, wz));
    if (!w) continue;
    const cap = -5 + 11 * fbm(wx * 0.035, 5, wz * 0.035, 4) + 2.2 * (fbm(wx * 0.17, 9, wz * 0.17, 3) - 0.5), ro = 140 * sstep(190, 200, hypot(wx, wz) + RINGN(Math.atan2(wz, wx)) + 6 * (fbm(wx * 0.05, 3, wz * 0.05, 3) - 0.5)); // (the ring ends in a circle, not in the square edge of the world)
    for (let y = 0; y < NY; y++) { const i = x + NX * (y + NY * z), c = cap - (OY + y * VS) + (1 - w) * 60 - ro; if (c < D[i]) D[i] = c; }
  }
  // the geyser: the flattest bit of shallow sea (about 3 m deep) gets a small volcano cone with a crater
  const colTop = (wx, wz) => { const ix = round((wx - OX) / VS), iz = round((wz - OZ) / VS); for (let y = NY - 2; y > 0; y--) { const i = ix + NX * (y + NY * iz); if (D[i] > 0) return OY + (y + D[i] / (D[i] - D[i + NX])) * VS; } return -99; };
  // gull perches: the flat tops of rocks standing out of the water, two gulls on each of up to seven of the highest, well apart
  {
    const cand = [];
    for (let r = 0; r < 186; r += 3) for (let a = 0; a < 6.28; a += r > 0 ? 3 / r : 7) {
      const x = r * cos(a), z = r * sin(a), h = colTop(x, z);
      if (h < 1.2 || h > 15) continue;
      let ok = true; for (const [ox, oz] of [[1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) if (abs(colTop(x + ox, z + oz) - h) > 0.6) { ok = false; break; }
      if (ok) cand.push([x, h, z]);
    }
    cand.sort((p, q) => q[1] - p[1] + (Math.random() - 0.5) * 3);
    const sp = []; for (const c of cand) { if (sp.length >= 7) break; if (sp.every((q) => hypot(q[0] - c[0], q[2] - c[2]) > 16)) sp.push(c); }
    for (const q of sp) for (let k = 0; k < 2; k++) { const an = Math.random() * 6.28, x = q[0] + cos(an) * 0.9 * k, z = q[2] + sin(an) * 0.9 * k, h = colTop(x, z); GP.push([x, h > 0.5 ? h : q[1], z, Math.random() * 6.28]); }
  }
  {
    let best = 1e9;
    for (let r = 12; r < 140; r += 4) for (let a = 0; a < 6.28; a += 0.1) {
      const x = r * cos(a), z = r * sin(a), g = colTop(x, z); if (g > -1.4 || g < -7) continue;
      let sc = abs(g + 3) + r * 0.004; for (const [ox, oz] of [[3, 0], [-3, 0], [0, 3], [0, -3]]) { const h = colTop(x + ox, z + oz); sc += abs(h - g) * 0.5 + (h > -0.6 ? 3 : 0); }
      if (sc < best) { best = sc; GEY = true; GX = x; GZ = z; GY = g; }
    }
    if (GEY) {
      const H = 2.2, x0 = round((GX - OX) / VS), z0 = round((GZ - OZ) / VS), n = 9;
      for (let z = z0 - n; z <= z0 + n; z++) for (let x = x0 - n; x <= x0 + n; x++) {
        const rr = hypot(OX + x * VS - GX, OZ + z * VS - GZ); if (rr > 5.2) continue;
        const prof = sstep(4.6, 1.0, rr), ys = GY + H * prof - 0.9 * sstep(1.0, 0.25, rr) * prof;
        for (let y = 0; y < NY; y++) { const i = x + NX * (y + NY * z), dc = ys - (OY + y * VS) - 2.5 * (1 - sstep(0, 0.2, prof)); if (dc > D[i]) D[i] = dc; }
      }
      // big bubbles out of the crater, rising to the surface where they pop (vsBub loops them: xyz + size | phase, speed, height, wobble)
      const nb = 190, gb = new Float32Array(nb * 8), y0 = GY + H - 0.9 + 0.1;
      for (let k = 0; k < nb; k++) {
        const s = pow(Math.random(), 1.6), o = k * 8, an = Math.random() * 6.2832, rd = 0.3 * sqrt(Math.random());
        gb[o] = GX + cos(an) * rd; gb[o + 1] = y0; gb[o + 2] = GZ + sin(an) * rd; gb[o + 3] = 0.2 + 0.6 * s;
        gb[o + 4] = Math.random(); gb[o + 5] = 2.1 - 0.9 * s; gb[o + 6] = -y0 + 0.9; gb[o + 7] = 0.06 + 0.06 * Math.random();
      }
      ibGey = buf(gb, BU.VERTEX); nGey = nb;
    }
  }
  // the whale spot: a quiet, flat, deep bit of sea floor far from the geyser
  {
    let best = 1e9;
    for (let r = 70; r < 128; r += 6) for (let a = 0; a < 6.28; a += 0.12) {
      const x = r * cos(a), z = r * sin(a), g = colTop(x, z); if (g > -42 || g < -48) continue;
      let sc = abs(g + 45) + (GEY ? max(0, 70 - hypot(x - GX, z - GZ)) * 0.1 : 0); for (const [ox, oz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) sc += abs(colTop(x + ox, z + oz) - g) * 0.6;
      if (sc < best) { best = sc; WHALE = [x, g, z]; }
    }
  }
  // a very long tunnel under the sea floor, from one end of the world to the other (a winding bore, about 4.4 m wide, with a few shafts
  // up to open floor so it can be entered)
  {
    const TP = LTP, TY = LTY, TR = LTR;
    const carve = (ax, ay, az, bx, by, bz, r0, wob) => {
      const x0 = floor((min(ax, bx) - r0 - 3 - OX) / VS), x1 = floor((max(ax, bx) + r0 + 3 - OX) / VS), y0 = max(0, floor((min(ay, by) - r0 - 3 - OY) / VS)), y1 = min(NY - 1, floor((max(ay, by) + r0 + 3 - OY) / VS)), z0 = floor((min(az, bz) - r0 - 3 - OZ) / VS), z1 = floor((max(az, bz) + r0 + 3 - OZ) / VS);
      const dx = bx - ax, dy = by - ay, dz = bz - az, ll = dx * dx + dy * dy + dz * dz;
      for (let z = max(1, z0); z <= min(NZ - 2, z1); z++) for (let y = y0; y <= y1; y++) for (let x = max(1, x0); x <= min(NX - 2, x1); x++) {
        const px = OX + x * VS, py = OY + y * VS, pz = OZ + z * VS;
        let h = ((px - ax) * dx + (py - ay) * dy + (pz - az) * dz) / ll; h = h < 0 ? 0 : h > 1 ? 1 : h;
        // a natural passage: the axis wanders, the bore swells and pinches, and the walls are lumpy at three scales (all functions of
        // the world position, so the pieces join seamlessly)
        const cx = ax + dx * h, cy = ay + dy * h, cz = az + dz * h;
        const wx = wob * 9 * sin(cz * 0.11 + cy * 0.23) + wob * 4 * sin(cz * 0.37 - cx * 0.21), wy = wob * 6 * sin(cx * 0.13 + cz * 0.09 + 1.3) + wob * 3 * sin(cx * 0.41 + cz * 0.33);
        const sw = sin(cx * 0.09 + cz * 0.07 + sin(cz * 0.05) * 2) * 0.5 + sin(cx * 0.21 - cz * 0.17 + 2) * 0.3;
        const lump = sin(px * 0.55 + py * 0.8 + sin(pz * 0.7) * 1.5) * 0.5 + sin(pz * 0.63 - py * 0.71 + sin(px * 0.9)) * 0.5, ln2 = sin(px * 1.9 + pz * 1.3 + py * 1.7) * 0.5 + sin(py * 2.3 - px * 1.1 + pz * 0.9) * 0.5, ln3 = sin(px * 0.23 + py * 0.41) * sin(pz * 0.29 + py * 0.19);
        const r = max(r0 * 1.18, r0 * (1.25 + wob * (sw * 1.0 + lump * 1.0 + ln2 * 0.4 + ln3 * 0.6))); // (never narrower than the plain bore: it stays passable)
        const d = hypot(px - cx - wx, (py - cy - wy) * (1 - 0.12 * (0.5 + 0.5 * sin(cz * 0.15 + cx * 0.1 + 1))), pz - cz) - r, i = x + NX * (y + NY * z);
        if (d < D[i]) D[i] = d;
      }
    };
    for (let k = 0; k + 1 < TP.length; k++) {
      const [ax, az] = TP[k], [bx, bz] = TP[k + 1], n = Math.ceil(hypot(bx - ax, bz - az) / 8);
      for (let j = 0; j < n; j++) { const f0 = j / n, f1 = (j + 1) / n; carve(ax + (bx - ax) * f0, TY + 1.2 * sin((k + f0) * 1.7), az + (bz - az) * f0, ax + (bx - ax) * f1, TY + 1.2 * sin((k + f1) * 1.7), az + (bz - az) * f1, TR, 0.17); }
    }
    // shafts: near the start, the middle and the end, at the nearest open sea floor
    for (const k of [0, 3, 7]) {
      let bx = 0, bz = 0, bt = -99, bs = 1e9;
      for (let r = 0; r < 14; r += 2) for (let a = 0; a < 6.28; a += 0.5) { const x = TP[k][0] + r * cos(a), z = TP[k][1] + r * sin(a), g = colTop(x, z); if (g < -47 || g > -36) continue; const s = r + abs(g + 43); if (s < bs) { bs = s; bx = x; bz = z; bt = g; } }
      if (bt > -90 && bs < 1e8) { carve(bx, TY, bz, bx, bt + 3, bz, 3, 0.1); carve(TP[k][0], TY, TP[k][1], bx, TY, bz, TR, 0.17); TUN.push([bx, bt, bz]); }
    }
    TUN.start = TP[0];
    // the far end opens into a round chamber
    const E = TUNNELS.find((t) => t.id === 'E').pts, ep = E[E.length - 1];
    carve(ep[0], ep[1], ep[2], ep[0] + 0.01, ep[1], ep[2], 5, 0.04);
    TUN.end = ep;
    if (TUN.length) { // the first shaft is a downdraft: a curtain of bubbles falling into it
      const [vx0, vt, vz0] = TUN[0], nb = 150, gb = new Float32Array(nb * 8), top = vt + 13;
      for (let k = 0; k < nb; k++) { const o = k * 8, an = Math.random() * 6.2832, rd = k < 90 ? 2.4 + Math.random() * 0.5 : Math.random() * 1.6; gb[o] = vx0 + cos(an) * rd; gb[o + 1] = top; gb[o + 2] = vz0 + sin(an) * rd; gb[o + 3] = 0.14 + 0.2 * Math.random(); gb[o + 4] = Math.random(); gb[o + 5] = -(2.6 + 2 * Math.random()); gb[o + 6] = -(top - TY); gb[o + 7] = 0.04; }
      ibVent = buf(gb, BU.VERTEX); nVent = nb;
    }
  }
  // rock connected to the seabed: each column's unbroken run up from the bottom is, and the rock above a gap
  // (overhangs, specks) is when it touches rock that is. What never connects is a speck of noise floating in
  // the water (surface nets would make it a small box), so it becomes water
  const S = NX * NY, R = new Uint8Array(D.length), O = [1, -1, NX, -NX, S, -S], b = new Uint8Array(NX), L = [];
  for (let i = 0; i < D.length;) { b.fill(1); for (let y = 0; y < NY; y++) for (let x = 0; x < NX; x++, i++) if (D[i] <= 0) b[x] = 0; else if (b[x]) R[i] = 1; else L.push(i); }
  for (let k = 1; k; L.reverse()) { k = 0; for (const i of L) if (!R[i] && O.some((o) => R[i + o])) R[i] = k = 1; }
  for (const i of L) if (!R[i]) D[i] = -D[i];
}
// Distance to the rock for collide(), in 1/127 m (> 0 in rock, clamped to ±1 m), kept only in the 4x4x4-voxel
// bricks near the surface within the camera's reach (~2 MB). CI per brick: 0 all water, 1 all rock, n brick n-2 in CG.
const CO = 52, CN = 102, CI = new Uint16Array(CN * CN * NY / 4);
let CG = new Int8Array(64 * 65534);
{
  let n = 0;
  for (let bz = 0; bz < CN; bz++) for (let by = 1; by < NY / 4; by++) for (let bx = 0; bx < CN; bx++) {
    if (hypot(bx - CN / 2 + 0.5, bz - CN / 2 + 0.5) > 52) continue; // more than 156 m out: never reached
    let lo = 127, hi = -127;
    for (let z = 0; z < 4; z++) for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = CO + bx * 4 + x + NX * (by * 4 + y + NY * (CO + bz * 4 + z)), gz = D[i + NX * NY] - D[i - NX * NY];
      const gx = D[i + 1] - D[i - 1], g = D[i + NX] - D[i - NX], l = sqrt(gx * gx + g * g + gz * gz) / 1.5;
      const q = round(clamp(D[i] / max(l, 0.05), -1, 1) * 127);
      CG[n * 64 + x + 4 * y + 16 * z] = q; if (q < lo) lo = q; if (q > hi) hi = q;
    }
    CI[bx + CN * (by + NY / 4 * bz)] = lo === hi && lo * lo === 16129 ? +(lo > 0) : (n++, n + 1);
  }
  CG = CG.slice(0, n * 64);
}
await say('Carving canyons…', 0.32, 400);
const T = buildTerrain(D);

// preset viewpoints (position, look-at), keys 1-6; the world generator dresses the scene around them
const POSES = [
  [10, 1.3, 7, -9, -31, -10],
  [50, 1.3, 34, 58, -23, 8],
  [-26, 2.2, -100, 0, -9, -108],
  [-55, 1.5, -18, -60, -30, 8],
  [10, 1.2, -62, 6, -22, -90],
  [3, 1.6, 62, 1, -28, 100],
];
// 60 s camera path (position + look-at, Catmull-Rom): the world generator keeps it clear, dev.js flies along it
const FLY = new Float32Array([
  10, -42.2, 7, -9, -31, -10,
  7.5, -41.8, 5.5, -10, -31, -12,
  9, -40.5, 18, 17, -37, 42,
  22, -39.2, 40, 48, -36, 45,
  38, -39.2, 46, 57, -27, 18,
  50, -40.4, 35, 58, -24, 8,
  55, -39, 20, 60, -18, -10,
  58, -34, -12, 40, -26, -60,
  50, -30, -44, 10, -26, -80,
  30, -30, -70, 4, -28, -90,
  12, -38.5, -62, 6, -27, -90,
  -4, -36.5, -70, 0, -14, -100,
  -16, -37, -84, 0, -22, -108,
  -29, -38, -90, -44, -34, -60,
  -41, -38, -70, -56, -34, -40,
  -53, -38, -50, -60, -34, -20,
  -58, -38, -28, -60, -32, 0,
  -57, -38, -10, -60, -30, 16,
  -60, -38, 10, -50, -36, 40,
  -52, -37, 36, -20, -35, 44,
  -22, -38, 43, 4, -38, 52,
  -6, -39.2, 44.5, 4, -37, 70,
  3, -40.6, 53, 3, -35, 84,
  3, -41.5, 62, 1, -30, 100,
  4, -39, 76, 3, -22, 100,
]);
const FLYN = FLY.length / 6, FLYT = 60, LUTN = 1024, flyLUT = new Float32Array(LUTN + 1);
const flyPts = [];
// per-frame float state lives in one preallocated array, so the frame loop allocates no heap numbers
const F = new Float64Array(32), P6 = new Float64Array(6);
const CX = 0, CY = 1, CZ = 2, YAW = 3, PIT = 4, FX = 5, FY = 6, FZ = 7, RX = 8, RZ = 9, UX = 10, UY = 11, UZ = 12, VX = 13, VY = 14, VZ = 15, TIME = 16, FLT = 17, LAST = 18, GPU = 19, HUDT = 20, SPL = 21, MX = 22, MY = 23, MZ = 24;
// aim the camera from P6 = position + look-at point
function aim() {
  const dx = P6[3] - P6[0], dy = P6[4] - P6[1], dz = P6[5] - P6[2];
  F[CX] = P6[0]; F[CY] = P6[1]; F[CZ] = P6[2];
  F[YAW] = atan2(dx, -dz); F[PIT] = atan2(dy, sqrt(dx * dx + dz * dz));
}
const lookAt = (x, y, z, tx, ty, tz) => { P6[0] = x; P6[1] = y; P6[2] = z; P6[3] = tx; P6[4] = ty; P6[5] = tz; aim(); };
// camera spline (Catmull-Rom over position + look-at) at parameter F[SPL]
function flyRaw() {
  const s = F[SPL]; let i = floor(s) | 0; if (i > FLYN - 2) i = FLYN - 2;
  const u = s - i, i0 = (i > 0 ? i - 1 : 0) * 6, i1 = i * 6, i2 = (i + 1) * 6, i3 = (i + 2 < FLYN ? i + 2 : FLYN - 1) * 6;
  for (let o = 0; o < 6; o++) {
    const a = FLY[i0 + o], b = FLY[i1 + o], c = FLY[i2 + o], d = FLY[i3 + o];
    P6[o] = 0.5 * (2 * b + (c - a) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (3 * b - a - 3 * c + d) * u * u * u);
  }
  aim();
}
{ // arc-length table: flyLUT[k] = spline parameter at fraction k/LUTN of the total path length
  const M = 4096, len = new Float32Array(M + 1); let px = 0, py = 0, pz = 0;
  for (let k = 0; k <= M; k++) { F[SPL] = k / M * (FLYN - 1); flyRaw(); if (k) len[k] = len[k - 1] + hypot(F[CX] - px, F[CY] - py, F[CZ] - pz); px = F[CX]; py = F[CY]; pz = F[CZ]; }
  for (let k = 0, j = 0; k <= LUTN; k++) { const d = k / LUTN * len[M]; while (j < M - 1 && len[j + 1] < d) j++; flyLUT[k] = (j + (d - len[j]) / max(len[j + 1] - len[j], 1e-6)) / M * (FLYN - 1); }
}
// camera on the scripted path at time F[FLT]
function flyAt() {
  let s = F[FLT] / FLYT; s = s < 0 ? 0 : s > 1 ? 1 : s; s = s * s * (3 - 2 * s) * 0.25 + s * 0.75;
  s *= LUTN; let k = floor(s) | 0; if (k > LUTN - 1) k = LUTN - 1;
  F[SPL] = flyLUT[k] + (flyLUT[k + 1] - flyLUT[k]) * (s - k); flyRaw();
}
for (let t = 0; t <= FLYT; t += 0.1) { F[FLT] = t; flyAt(); flyPts.push([F[CX], F[CY], F[CZ]]); }
for (const p of POSES) flyPts.push([p[0], -40, p[2]]);

await say('Growing kelp…', 0.73, 2500);
const Wd = makeWorld(D, T, flyPts, POSES);
// extra instances the easter eggs move about: a school of glow fish that gathers in the torch beam, and a shark that comes to visit
const NGF = 28, FISH0 = Wd.fish.length / 8, SHK0 = Wd.sharks.length / 8;
Wd.fish = Float32Array.from([...Wd.fish, ...Array.from({ length: NGF }, (_, k) => [0, -300, 0, 1.7, 0.31 + k * 0.0371 % 0.6, 1.2 + (k % 5) * 0.08, 0.1 + (k % 4) * 0.012, 3.37]).flat()]);
Wd.sharks = Float32Array.from([...Wd.sharks, 0, -300, 0, 7, 0, 0.32, 2.2, 0.41]);
const JELLY0 = Float32Array.from(Wd.jelly);
for (const p of POSES) p[1] += Wd.gy(p[0], p[2]);
D = Wd.gy = T.smp = null; // with gy goes the generator's working memory (about 200 MB)

await say('Building set pieces…', 0.94, 1200);
// mesh ids: 0-3 boulders, 4-6 sponges, 7-8 coral, 9 tube sponge, 10 whale fluke, 11 ship, 12 manta, 13 fish,
// 14-20 rock chunks + pebbles, 21-22 coral LOD, 23-25 far LOD of the large rock chunks, 26 shark, 27 nurse shark, 28-35 floor life: urchin, starfish, shell, sea cucumber, garden eel, table coral, brain coral, anemone
const meshes = [meshChunk(1, 3), meshChunk(7, 3), meshChunk(13, 3), meshChunk(22, 3),
  meshLathe([[0, 0, 0.5], [0.34, 0, 0.6], [0.5, 0.2, 0.85], [0.6, 0.6, 1], [0.55, 0.95, 1], [0.47, 1.08, 1], [0.38, 1.1, 0.9], [0.3, 1.0, 0.45], [0.26, 0.6, 0.15], [0, 0.35, 0.05]], 18, 0.3, 9),
  meshLathe([[0, 0, 0.5], [0.2, 0, 0.6], [0.26, 0.5, 0.85], [0.4, 1.25, 1], [0.4, 1.42, 1], [0.33, 1.48, 0.9], [0.26, 1.38, 0.4], [0.18, 0.8, 0.12], [0, 0.5, 0.05]], 16, 0.35, 8),
  meshLathe([[0, 0, 0.5], [0.5, 0, 0.7], [0.72, 0.18, 1], [0.74, 0.38, 1], [0.62, 0.5, 0.9], [0.48, 0.42, 0.45], [0.4, 0.2, 0.15], [0, 0.14, 0.06]], 18, 0.25, 10),
  meshCoral(0), meshCoral(1), meshTubes()].map((m) => m.build());
meshes.push(meshFluke(), meshShip().build(), meshManta().build(), meshFish().build(),
  meshChunk(3).build(), meshChunk(11).build(), meshChunk(29).build(), meshChunk(5, 3).build(), meshChunk(17, 3).build(), meshChunk(41, 3).build(), meshChunk(9, 1).build(), meshCoral(0, 1).build(), meshCoral(1, 1).build(), meshChunk(5, 2, 1).build(), meshChunk(17, 2, 1).build(), meshChunk(41, 2, 1).build(), meshShark().build(), meshNurse().build(),
  meshUrchin().build(), meshStarfish().build(), meshShell().build(), meshCucumber().build(), meshEel().build(), meshTable().build(), meshBrain().build(), meshAnemone().build(), meshJelly().build(), meshGull().build());
let nV = 0, nI = 0;
for (const m of meshes) { m.v0 = nV; m.i0 = nI; nV += m.nv; nI += m.ib.length; }
const allV = new Uint8Array(nV * 16), allI = new Uint32Array(nI);
for (const m of meshes) { allV.set(new Uint8Array(m.vb), m.v0 * 16); allI.set(m.ib, m.i0); }
const vbMesh = buf(allV, BU.VERTEX), ibMesh = buf(allI, BU.INDEX);
const vbTerrain = buf(new Uint8Array(T.vb), BU.VERTEX), ibTerrain = buf(T.ib, BU.INDEX);
const nSolid = Wd.solids.data.length / 12;
const solidData = new Float32Array((nSolid + 1) * 12); solidData.set(Wd.solids.data); solidData.set([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0], nSolid * 12);
const ibSolids = buf(solidData, BU.VERTEX);
const ibChunk = Wd.chunks.map((c) => buf(c.data, BU.VERTEX)), ibProp = Wd.props.map((c) => buf(c.data, BU.VERTEX));
const ibBig = buf(new Uint8Array(Wd.big.buf), BU.VERTEX), ibBigF = buf(new Uint8Array(Wd.bigF.buf), BU.VERTEX), ibSmall = buf(new Uint8Array(Wd.small.buf), BU.VERTEX);
const ibFish = buf(Wd.fish, BU.VERTEX), ibManta = buf(Wd.mantas, BU.VERTEX), ibShark = buf(Wd.sharks, BU.VERTEX), ibNurse = buf(Wd.nurse, BU.VERTEX), ibPup = device.createBuffer({ size: max(32, Wd.pups.byteLength), usage: BU.VERTEX | BU.COPY_DST }), ibPupB = device.createBuffer({ size: max(16, Wd.pups.byteLength / 2), usage: BU.VERTEX | BU.COPY_DST }), ibBubbles = buf(Wd.bubbles, BU.VERTEX), ibSnowB = buf(Wd.snow, BU.VERTEX), ibJelly = buf(Wd.jelly, BU.VERTEX);
const ibGl = buf(Wd.glints, BU.VERTEX), nGl = Wd.glints.length / 8;
const nFish = Wd.fish.length / 8, nManta = Wd.mantas.length / 8, nShark = Wd.sharks.length / 8, nNurse = Wd.nurse.length / 16, nPup = Wd.pups.length / 8, nBub = Wd.bubbles.length / 8, nSnow = Wd.snow.length / 4, nJelly = Wd.jelly.length / 8;
const MANTA = meshes[12], FISH = meshes[13], SHARK = meshes[26], NURSE = meshes[27], JELLY = meshes[36], GULL = meshes[37];
const NGU = 14, GU = new Float32Array(NGU * 8), ibGull = device.createBuffer({ size: NGU * 32, usage: BU.VERTEX | BU.COPY_DST });
const ibFloorL = Wd.floorL.map((a) => (a.length ? buf(a, BU.VERTEX) : null));
// the map circle: the arena picture from the world generator, with viewpoints 1-6, the player and where they look
const mmBg = document.createElement('canvas'); mmBg.width = mmBg.height = 128; mmBg.getContext('2d').putImageData(new ImageData(Wd.mapImg, 128, 128), 0, 0);
const mm = $('mm'), mx = mm.getContext('2d'); let mapT = 1e9;
// where the sleeping nurse shark groups lie (instances that are within 9 m of each other are one group), for the key-7 tour
const nurseGroups = [];
for (let i = 0; i < Wd.nurse.length; i += 16) {
  const x = Wd.nurse[i], z = Wd.nurse[i + 2], g = nurseGroups.find((q) => hypot(q[0] / q[2] - x, q[1] / q[2] - z) < 9);
  if (g) { g[0] += x; g[1] += z; g[2]++; } else nurseGroups.push([x, z, 1]);
}
mm.width = mm.height = Math.round(150 * min(devicePixelRatio || 1, 2));
// key 7: jump to the next sleeping group of nurse sharks, a few metres off to the side of it, looking at it
let nurseI = 0;
function nurseTour() {
  if (!nurseGroups.length) return;
  const g = nurseGroups[nurseI++ % nurseGroups.length], cx = g[0] / g[2], cz = g[1] / g[2];
  let cy = -43, yaw = 0; for (let o = 0; o < Wd.nurse.length; o += 16) if (hypot(Wd.nurse[o] - cx, Wd.nurse[o + 2] - cz) < 9) { cy = Wd.nurse[o + 1]; yaw = Wd.nurse[o + 3]; break; }
  for (let k = 0; k < 8; k++) {
    const a = yaw + 1.5708 + k * 0.785, px = cx + sin(a) * 7.5, pz = cz + cos(a) * 7.5;
    F[CX] = px; F[CY] = cy + 2.4; F[CZ] = pz; sd(0);
    if (CS[0] < -0.8) { lookAt(px, cy + 2.4, pz, cx, cy, cz); return; }
  }
  lookAt(cx + 7, cy + 4, cz, cx, cy, cz);
}
// key 8: jump to a spot on the path of the next blacktip reef shark (they cruise fast, so you wait for it to come to you), looking at it
let pupI = 0;
function pupTour() {
  const n = PUP.length / 8; if (!n) return;
  const o = (pupI++ % n) * 8, x = PUP[o], y = PUP[o + 1], z = PUP[o + 2], yaw = PUP[o + 3], hx = sin(yaw), hz = cos(yaw);
  for (const [d, side] of [[14, 2.5], [10, 2.5], [14, -2.5], [18, 4], [10, -4], [8, 6], [8, -6]]) {
    const cx = x + hx * d + hz * side, cz = z + hz * d - hx * side, cy = y + 0.4;
    if (sdAt(cx, cy, cz) < -0.9) { lookAt(cx, cy, cz, x, y, z); return; }
  }
  lookAt(x + hz * 7, y + 1, z - hx * 7, x, y, z);
}
function drawMap() {
  const S = mm.width, u = S / 320, px = (F[CX] + 160) * u, pz = (F[CZ] + 160) * u, a = F[YAW];
  mx.clearRect(0, 0, S, S); mx.save(); mx.beginPath(); mx.arc(S / 2, S / 2, S / 2, 0, 6.2832); mx.clip();
  mx.imageSmoothingQuality = 'high'; mx.drawImage(mmBg, 0, 0, S, S);
  mx.font = `${S * 0.06 | 0}px system-ui, sans-serif`; mx.textAlign = 'center'; mx.textBaseline = 'middle';
  POSES.forEach((p, i) => { const x = (p[0] + 160) * u, z = (p[2] + 160) * u; mx.fillStyle = '#03222dcc'; mx.beginPath(); mx.arc(x, z, S * 0.032, 0, 6.2832); mx.fill(); mx.fillStyle = '#e8fbff'; mx.fillText(i + 1, x, z + 0.5); });
  // tunnel mouths: an orange dot with the tunnel's letter at each end (you go in at one and have to find the other)
  for (const t of TUNNELS) if (!t.nomap) for (const e of [t.pts[0], t.pts[t.pts.length - 1]]) {
    const x = (e[0] + 160) * u, z = (e[2] + 160) * u; mx.fillStyle = '#ff9d3c'; mx.strokeStyle = '#03222d'; mx.lineWidth = S * 0.012;
    mx.beginPath(); mx.arc(x, z, S * 0.036, 0, 6.2832); mx.fill(); mx.stroke(); mx.fillStyle = '#03222d'; mx.fillText(t.id, x, z + 0.5);
  }
  mx.translate(px, pz); mx.rotate(a);
  mx.fillStyle = '#ffffff30'; mx.beginPath(); mx.moveTo(0, 0); mx.arc(0, 0, S * 0.17, -1.57 - 0.6, -1.57 + 0.6); mx.closePath(); mx.fill(); // what you look at
  mx.fillStyle = '#ffd34d'; mx.strokeStyle = '#03222d'; mx.lineWidth = S * 0.014; mx.beginPath(); mx.moveTo(0, -S * 0.045); mx.lineTo(S * 0.032, S * 0.032); mx.lineTo(0, S * 0.014); mx.lineTo(-S * 0.032, S * 0.032); mx.closePath(); mx.fill(); mx.stroke();
  mx.restore();
  mx.fillStyle = '#e8fbff'; mx.shadowColor = '#000'; mx.shadowBlur = S * 0.03; mx.font = `600 ${S * 0.07 | 0}px system-ui, sans-serif`; mx.fillText(F[CY] > 0 ? 'surface' : (-F[CY] | 0) + ' m', S / 2, S * 0.9);
}
Q.writeTexture({ texture: tVol }, Wd.volD, { bytesPerRow: NX * 2, rowsPerImage: NY / 2 }, [NX / 2, NY / 2, NZ / 2]);
Q.writeTexture({ texture: tMap }, Wd.gm, { bytesPerRow: 4096 }, [1024, 1024]);

// ---------------------------------------------------------------- one-time bakes: detail texture, shadow map
{
  const m = mod(W_DETAIL), p = device.createRenderPipeline({ layout: 'auto', vertex: { module: m, entryPoint: 'vs' }, fragment: { module: m, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] } });
  const e = device.createCommandEncoder();
  let r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: 0, mipLevelCount: 1 }), true)] });
  r.setPipeline(p); r.draw(3); r.end();
  for (let i = 1; i < 11; i++) {
    r = e.beginRenderPass({ colorAttachments: [colorAtt(tDetail.createView({ baseMipLevel: i, mipLevelCount: 1 }), true)] });
    r.setPipeline(pMip8); r.setBindGroup(0, blitBG(tDetail.createView({ baseMipLevel: i - 1, mipLevelCount: 1 }))); r.draw(3); r.end();
  }
  r = e.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: tShadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } });
  r.setBindGroup(0, bg0s);
  r.setPipeline(pTerrSh);
  r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
  r.drawIndexed(T.ib.length, 1, 0, 0, nSolid);
  r.setPipeline(pSolidSh); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let i = 0; i < 12; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  // small rocks, sponges and corals (~35M triangles) only on High: too much for a phone's driver
  if (!LV) for (let i = 0; i < NCHUNK; i++) { r.setVertexBuffer(1, ibChunk[i]); r.drawIndexed(meshes[14 + i].ib.length, Wd.chunks[i].n, meshes[14 + i].i0, meshes[14 + i].v0, 0); }
  if (!LV) for (let i = 0; i < 6; i++) if (Wd.props[i].n) { r.setVertexBuffer(1, ibProp[i]); r.drawIndexed(meshes[4 + i].ib.length, Wd.props[i].n, meshes[4 + i].i0, meshes[4 + i].v0, 0); }
  r.setPipeline(pLeafSh); r.setVertexBuffer(0, ibBig); r.draw(6, Wd.big.n);
  r.end();
  Q.submit([e.finish()]);
}
// the GPU has its own copies now: let go of the generator's (about 300 MB)
for (const o of [Wd.big, Wd.bigF, Wd.small, ...Wd.chunks, ...Wd.props]) o.buf = o.data = 0;
Wd.glints = Wd.volD = Wd.gm = T.vb = T.ib = T.wp = T.wn = 0;

// ---------------------------------------------------------------- render targets (rebuilt on resize)
// The scene is drawn at `pix` pixels and scaled up to the window. frame() tunes it and the draw distance scale `det`
// for 60 fps; both start where the last visit left them.
const PIXMAX = 2560 * 1440, PIXMIN = LITE ? 12e4 : mob ? 25e4 : 5e5, DETMIN = LITE ? 0.3 : 0.4;
let W = 0, H = 0, DW = 0, DH = 0, pix = +SV[1] || (LITE ? 22e4 : LV > 1 ? 41e4 : mob ? 1280 * 720 : PIXMAX), det = +SV[2] || (LITE ? 0.6 : 1), dynN = 0, dynT = 0, dynG = 0, dynGN = 0, dynBad = 0, dynOk = 0, dynWait = 3;
let passScene, passRays, passBlur, bgBlur, passPost, bgRays, bgPost, bloomPass = [], bloomBG = [], targets = [];
const NB = 6;
function resize() {
  DW = max(2, round(canvas.clientWidth * devicePixelRatio)); DH = max(2, round(canvas.clientHeight * devicePixelRatio));
  const s = min(1, sqrt(pix / (DW * DH)));
  const w = max(2, round(DW * s) & ~1), h = max(2, round(DH * s) & ~1);
  if (w === W && h === H) return;
  dynN = dynG = dynGN = 0; dynT = -300; // let the new size settle before measuring again
  W = w; H = h; canvas.width = W; canvas.height = H;
  ctx.configure({ device, format: FMT, alphaMode: 'opaque' });
  for (const t of targets) t.destroy();
  const tMS = tex(AA > 1 ? W : 1, H, HDR, TU.RENDER_ATTACHMENT, { samples: AA }), tDp = tex(W, H, DEPTH, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING, { samples: AA });
  const tRes = tex(W, H, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING), tRay2 = tex(W / 2, H / 2, HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING);
  targets = [tMS, tDp, tRes, tRay, tRay2];
  const bl = [];
  for (let i = 0; i < NB; i++) { const t = tex(max(1, W >> (i + 1)), max(1, H >> (i + 1)), HDR, TU.RENDER_ATTACHMENT | TU.TEXTURE_BINDING); bl.push(t); targets.push(t); }
  const vDp = tDp.createView(), vRes = tRes.createView(), vRay = tRay.createView(), vRay2 = tRay2.createView(), vBl = bl.map((t) => t.createView());
  // without anti-aliasing (Low) the scene goes straight into the resolve target, and tMS is one unused column
  passScene = { colorAttachments: [{ view: AA > 1 ? tMS.createView() : vRes, resolveTarget: AA > 1 ? vRes : undefined, loadOp: 'clear', storeOp: AA > 1 ? 'discard' : 'store', clearValue: [0, 0, 0, 1] }],
    depthStencilAttachment: { view: vDp, depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'store' } };
  passRays = { colorAttachments: [colorAtt(vRay, true)] };
  passBlur = { colorAttachments: [colorAtt(vRay2, true)] };
  bgBlur = device.createBindGroup({ layout: pRB.getBindGroupLayout(0), entries: [{ binding: 0, resource: vRay }] });
  passPost = { colorAttachments: [{ view: null, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] };
  bgRays = device.createBindGroup({ layout: pRays.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sRep }, { binding: 2, resource: sCmp },
    { binding: 3, resource: tShadow.createView() }, { binding: 4, resource: tWater.createView() }, { binding: 5, resource: vDp }, { binding: 6, resource: tVol.createView() }, { binding: 7, resource: sClamp }] });
  bgPost = device.createBindGroup({ layout: pPost.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: ubo } }, { binding: 1, resource: sClamp }, { binding: 2, resource: vRes },
    { binding: 3, resource: vRay2 }, { binding: 4, resource: vBl[0] }, { binding: 5, resource: vDp }] });
  bloomPass = []; bloomBG = [];
  // down: res -> b0 -> ... -> b5 ; up: b5 -> b4 (additive) ... -> b0
  for (let i = 0; i < NB; i++) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i], true)] }); bloomBG.push(blitBG(i ? vBl[i - 1] : vRes)); }
  for (let i = NB - 1; i > 0; i--) { bloomPass.push({ colorAttachments: [colorAtt(vBl[i - 1], false)] }); bloomBG.push(blitBG(vBl[i])); }
  UB[52] = W; UB[53] = H; UB[54] = 1 / W; UB[55] = 1 / H;
}
resize();
addEventListener('resize', resize);

// ---------------------------------------------------------------- timing (GPU timestamp queries)
let qs, qResolve, qRead = [], tsBegin, tsEnd;
if (hasTS) {
  qs = device.createQuerySet({ type: 'timestamp', count: 2 });
  qResolve = device.createBuffer({ size: 16, usage: BU.QUERY_RESOLVE | BU.COPY_SRC });
  for (let i = 0; i < 6; i++) {
    const b = device.createBuffer({ size: 16, usage: BU.MAP_READ | BU.COPY_DST });
    const o = { b, busy: false, done: null };
    o.done = () => {
      const a = new BigInt64Array(b.getMappedRange());
      const ms = Number(a[1] - a[0]) / 1e6; F[GPU] = ms; b.unmap(); o.busy = false;
      if (dynT > 0 && ms > 0 && ms < 1e3) { dynG += ms; dynGN++; }
    };
    qRead.push(o);
  }
  tsBegin = { querySet: qs, beginningOfPassWriteIndex: 0 }; tsEnd = { querySet: qs, endOfPassWriteIndex: 1 };
}

// ---------------------------------------------------------------- frame
let hud = false;
let kf = 0, kb = 0, kl = 0, kr = 0, ku = 0, kd = 0, ks = 0, ka = 0, lastTap = 0, lastKey = '', mdx = 0, mdy = 0, lkx = 0, lky = 0, l2x = 0, l2y = 0, hN = 0, hMax = 0, hMin = 1e9, hPer = 1e9, hLate = 0, hTot = 0, tId = -1, tN = 0, tx0 = 0, ty0 = 0, tx = 0, ty = 0;
const TANH = 0.6, NEAR = 0.1, EXPO = 0.62, RAYS = 0.54;
const submitList = [null];
const rowOrd = new Uint8Array(CELLS);
// Draws the cells of a cell-sorted buffer that are in view and within [minD, maxD) (scaled by `det`, but not for the
// terrain) as merged runs, nearest rows first.
function drawCells(r, start, lo, hi, mar, indexed, verts, minD, maxD) {
  const cx = F[CX], cy = F[CY], cz = F[CZ], fx = F[FX], fy = F[FY], fz = F[FZ], rx = F[RX], rz = F[RZ], ux = F[UX], uy = F[UY], uz = F[UZ];
  const ds = indexed === 1 ? 1 : det * det;
  const tx = TANH * W / H, hw = CELLW * 0.5, ex = hw + mar, min2 = minD * minD * ds, max2 = maxD * maxD * ds;
  for (let k = 0; k < CELLS; k++) {
    const rw = rowOrd[k], row = rw * CELLS, pz = OZ + (rw + 0.5) * CELLW - cz, hz = max(abs(pz) - hw, 0);
    let run = -1;
    for (let x = 0; x <= CELLS; x++) {
      const c = row + x; let v = false;
      if (x < CELLS) {
        const l = lo[c], h = hi[c];
        if (l <= h) {
          const px = OX + (x + 0.5) * CELLW - cx, py = (l + h) * 0.5 - cy, ey = (h - l) * 0.5 + mar, hx = max(abs(px) - hw, 0), h2 = hx * hx + hz * hz;
          if (h2 < max2 && h2 >= min2) {
            const lim = px * fx + py * fy + pz * fz + ex * abs(fx) + ey * abs(fy) + ex * abs(fz);
            if (lim >= 0 && abs(px * rx + pz * rz) - ex * (abs(rx) + abs(rz)) <= lim * tx) v = abs(px * ux + py * uy + pz * uz) - ex * (abs(ux) + abs(uz)) - ey * abs(uy) <= lim * TANH;
          }
        }
      }
      if (v) { if (run < 0) run = c; } else if (run >= 0) {
        const a = start[run], n = start[c] - a;
        if (n > 0) { if (indexed === 1) r.drawIndexed(n * 6, 1, a * 6, 0, nSolid); else if (indexed) r.drawIndexed(indexed.ib.length, n, indexed.i0, indexed.v0, a); else r.draw(verts, n, 0, a); }
        run = -1;
      }
    }
  }
}
let swimT = 0, mbT = 0, mbYaw = 0, mbPit = 0, wetV = 0, wetT = 0, wasAbove = false, torchV = 0, torchOn = false, torchT = 0;
function render() {
  // camera basis (right vector is horizontal)
  const cx = F[CX], cy = F[CY], cz = F[CZ], tS = F[TIME], dv = cy < -0.3 ? 1 : 0; // a swimmer's head never holds quite still: a slow, tiny sway
  const pitch = F[PIT] + dv * (sin(tS * 0.53) * 0.0032 + sin(tS * 1.31 + 1.) * 0.0012), yaw = F[YAW] + dv * (sin(tS * 0.37 + 2.) * 0.0042 + sin(tS * 0.91) * 0.0015);
  const cp = cos(pitch), fy = sin(pitch), rx = cos(yaw), rz = sin(yaw), fx = cp * rz, fz = -cp * rx;
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  F[FX] = fx; F[FY] = fy; F[FZ] = fz; F[RX] = rx; F[RZ] = rz; F[UX] = ux; F[UY] = uy; F[UZ] = uz;
  const asp = W / H, sx = 1 / (TANH * asp), sy = 1 / TANH, m = UB;
  m[0] = rx * sx; m[4] = 0; m[8] = rz * sx; m[12] = -(rx * cx + rz * cz) * sx;
  m[1] = ux * sy; m[5] = uy * sy; m[9] = uz * sy; m[13] = -(ux * cx + uy * cy + uz * cz) * sy;
  m[2] = 0; m[6] = 0; m[10] = 0; m[14] = NEAR;
  m[3] = fx; m[7] = fy; m[11] = fz; m[15] = -(fx * cx + fy * cy + fz * cz);
  m[32] = cx; m[33] = cy; m[34] = cz; m[35] = F[TIME];
  m[36] = rx; m[37] = 0; m[38] = rz; m[39] = TANH * asp;
  m[40] = ux; m[41] = uy; m[42] = uz; m[43] = TANH;
  m[44] = fx; m[45] = fy; m[46] = fz; m[47] = NEAR;
  const zx = cx - PURPLE[0], zz = cz - PURPLE[1]; let zt = (44 - sqrt(zx * zx + zz * zz)) / 18; zt = zt < 0 ? 0 : zt > 1 ? 1 : zt;
  m[51] = zt * zt * (3 - 2 * zt);
  let ek = (-cy - 8) / 26; ek = ek < 0 ? 0 : ek > 1 ? 1 : ek;
  // the lens after a trip through the surface: +1 just came out (drops, drying), -1 just went in (bubbles), fading to 0
  { const ab = cy > 0, dtw = F[TIME] - wetT; wetT = F[TIME];
    if (ab !== wasAbove) { wetV = ab ? 1 : -1; wasAbove = ab; }
    wetV += (wetV > 0 ? -dtw / 5.5 : dtw / 1.8); if (wetV * (ab ? 1 : -1) < 0) wetV = 0; m[59] = wetV; }
  // the torch: inside a tunnel (dark at the camera) it switches itself on, with a click, and off again on the way out
  { const dkc = tunnelDark(cx, cy, cz), dtt = F[TIME] - torchT; torchT = F[TIME];
    torchV += ((dkc > 0.3 ? 1 : 0) - torchV) * (1 - exp(-dtt * 7));
    if ((torchV > 0.5) !== torchOn) { torchOn = torchV > 0.5; torchClick(torchOn); }
    m[60] = torchV; m[61] = dkc; }
  m[56] = EXPO * (0.6 + 0.4 * ek) * (1 + 0.3 * (cy < 0 ? 0 : cy > 1 ? 1 : cy)); m[57] = RAYS; m[58] = det;
  // motion blur: the swimmer's velocity along the view axes and the turning of the head, scaled by a short shutter time
  { const dtm = F[TIME] - mbT; mbT = F[TIME];
    const vx = F[VX], vy = F[VY], vz = F[VZ], spd = sqrt(vx * vx + vy * vy + vz * vz); let ms = (spd - 3) / 10; ms = ms < 0 ? 0 : ms > 1 ? 1 : ms; const sh = 0.013 * ms;
    let dy = yaw - mbYaw; dy = dy > 3.14 ? dy - 6.2832 : dy < -3.14 ? dy + 6.2832 : dy; const dp = pitch - mbPit; mbYaw = yaw; mbPit = pitch;
    const k = dtm > 1e-4 && dtm < 0.2 ? 1 / dtm : 0; let ry = -dy * k / (TANH * asp) * 0.013, rp = -dp * k / TANH * 0.013;
    ry = ry > 0.03 ? 0.03 : ry < -0.03 ? -0.03 : ry; rp = rp > 0.03 ? 0.03 : rp < -0.03 ? -0.03 : rp; if (menu) { ry = rp = 0; }
    m[64] = (vx * rx + vz * rz) * sh; m[65] = (vx * ux + vy * uy + vz * uz) * sh; m[66] = (vx * fx + vy * fy + vz * fz) * sh; m[67] = spd;
    m[68] = ry; m[69] = rp; m[70] = nightK; m[71] = 0; }
  Q.writeBuffer(ubo, 0, UB);
  WT[0] = F[TIME]; Q.writeBuffer(uboW, 0, WT);

  { let cr = floor((cz - OZ) / CELLW) | 0; cr = cr < 0 ? 0 : cr > CELLS - 1 ? CELLS - 1 : cr; let n = 0; rowOrd[n++] = cr; for (let d = 1; d < CELLS; d++) { if (cr - d >= 0) rowOrd[n++] = cr - d; if (cr + d < CELLS) rowOrd[n++] = cr + d; } }
  const e = device.createCommandEncoder();
  let slot = null;
  if (hasTS) { for (let i = 0; i < qRead.length; i++) if (!qRead[i].busy) { slot = qRead[i]; break; } }
  waterPass[0].timestampWrites = slot ? tsBegin : undefined;
  passPost.timestampWrites = slot ? tsEnd : undefined;
  // animated water texture + mips
  let r = e.beginRenderPass(waterPass[0]); r.setPipeline(pWater); r.setBindGroup(0, bgWater); r.draw(3); r.end();
  for (let i = 1; i < 5; i++) { r = e.beginRenderPass(waterPass[i]); r.setPipeline(pMip16); r.setBindGroup(0, waterBG[i - 1]); r.draw(3); r.end(); }
  // scene
  r = e.beginRenderPass(passScene);
  r.setBindGroup(0, bg0);
  r.setPipeline(pTerrain); r.setVertexBuffer(0, vbTerrain); r.setVertexBuffer(1, ibSolids); r.setIndexBuffer(ibTerrain, 'uint32');
  drawCells(r, T.start, T.lo, T.hi, 1.5, 1, 0, 0, 240);
  r.setPipeline(pSolid); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let i = 0; i < 12; i++) { const g = Wd.solids.ranges[i]; if (g[1]) r.drawIndexed(meshes[i].ib.length, g[1], meshes[i].i0, meshes[i].v0, g[0]); }
  for (let i = 0; i < NCHUNK; i++) {
    const c = Wd.chunks[i], big = i > 2 && i < 6; r.setVertexBuffer(1, ibChunk[i]);
    drawCells(r, c.start, c.lo, c.hi, 3, meshes[14 + i], 0, 0, i > 5 ? 30 : big ? 40 : 96);
    if (big) drawCells(r, c.start, c.lo, c.hi, 3, meshes[20 + i], 0, 40, 150);
  }
  for (let i = 0; i < 6; i++) {
    const lod = i === 3 || i === 4; r.setVertexBuffer(1, ibProp[i]);
    drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[4 + i], 0, 0, lod ? 6 : 110);
    if (lod) drawCells(r, Wd.props[i].start, Wd.props[i].lo, Wd.props[i].hi, 3, meshes[18 + i], 0, 6, 110);
  }
  r.setPipeline(pManta); r.setVertexBuffer(1, ibManta); r.drawIndexed(MANTA.ib.length, nManta, MANTA.i0, MANTA.v0, 0);
  r.setPipeline(pShark); r.setVertexBuffer(1, ibShark); r.drawIndexed(SHARK.ib.length, nShark, SHARK.i0, SHARK.v0, 0);
  r.setPipeline(pGull); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); r.setVertexBuffer(1, ibGull); r.drawIndexed(GULL.ib.length, NGU, GULL.i0, GULL.v0, 0);
  // life on the sea floor and reef forms: same shader and layout as the sponges, drawn once per kind
  r.setPipeline(pSolid); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32');
  for (let k = 0; k < 8; k++) if (ibFloorL[k]) { const me = meshes[28 + k]; r.setVertexBuffer(1, ibFloorL[k]); r.drawIndexed(me.ib.length, Wd.floorL[k].length / 12, me.i0, me.v0, 0); }
  if (nPup) { r.setPipeline(pPup); r.setVertexBuffer(1, ibPup); r.setVertexBuffer(2, ibPupB); r.drawIndexed(SHARK.ib.length, nPup, SHARK.i0, SHARK.v0, 0); }
  r.setPipeline(pNurse); r.setVertexBuffer(1, ibNurse); r.drawIndexed(NURSE.ib.length, nNurse, NURSE.i0, NURSE.v0, 0);
  r.setPipeline(pFish); r.setVertexBuffer(1, ibFish); r.drawIndexed(FISH.ib.length, nFish, FISH.i0, FISH.v0, 0);
  // kelp and plants: 9-row blades up close, 5 rows mid-range, a decimated set far away
  r.setPipeline(pLeaf); r.setVertexBuffer(0, ibBig); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 18, 0, 24);
  r.setPipeline(pLeaf5); drawCells(r, Wd.big.start, Wd.big.lo, Wd.big.hi, 5, false, 10, 24, 58);
  r.setPipeline(pLeafF); r.setVertexBuffer(0, ibBigF); drawCells(r, Wd.bigF.start, Wd.bigF.lo, Wd.bigF.hi, 5, false, 6, 58, 150);
  r.setPipeline(pLeafS); r.setVertexBuffer(0, ibSmall); drawCells(r, Wd.small.start, Wd.small.lo, Wd.small.hi, 1.5, false, 6, 0, 70);
  r.setPipeline(pBack); r.draw(4);
  r.setPipeline(pSurf); r.draw(4);
  r.setPipeline(pBub); r.setVertexBuffer(0, ibBubbles); r.draw(4, nBub);
  if (nGey) { r.setPipeline(pBub); r.setVertexBuffer(0, ibGey); r.draw(4, nGey); }
  if (nVent) { r.setPipeline(pBub); r.setVertexBuffer(0, ibVent); r.draw(4, nVent); }
  if (sbT0) { r.setPipeline(pBub); r.setVertexBuffer(0, ibSB); r.draw(4, 170); }
  r.setPipeline(pGl); r.setVertexBuffer(0, ibGl); r.draw(4, nGl);
  r.setPipeline(pJelly); r.setVertexBuffer(0, vbMesh); r.setIndexBuffer(ibMesh, 'uint32'); r.setVertexBuffer(1, ibJelly); r.drawIndexed(JELLY.ib.length, nJelly, JELLY.i0, JELLY.v0, 0);
  r.setPipeline(pPuf); r.setVertexBuffer(0, ibPuf); r.draw(4, NPUF);
  if (nMsg) { r.setVertexBuffer(0, ibMsg); r.draw(4, nMsg); }
  r.setPipeline(pSnow); r.setVertexBuffer(0, ibSnowB); r.draw(4, nSnow);
  r.end();
  // light shafts
  r = e.beginRenderPass(passRays); r.setPipeline(pRays); r.setBindGroup(0, bgRays); r.draw(3); r.end();
  r = e.beginRenderPass(passBlur); r.setPipeline(pRB); r.setBindGroup(0, bgBlur); r.draw(3); r.end();
  // bloom
  for (let i = 0; i < bloomPass.length; i++) {
    r = e.beginRenderPass(bloomPass[i]); r.setPipeline(i === 0 ? pDown0 : i < NB ? pDown : pUp); r.setBindGroup(0, bloomBG[i]); r.draw(3); r.end();
  }
  // composite
  passPost.colorAttachments[0].view = ctx.getCurrentTexture().createView();
  r = e.beginRenderPass(passPost); r.setPipeline(pPost); r.setBindGroup(0, bgPost); r.draw(3); r.end();
  if (slot) { e.resolveQuerySet(qs, 0, 2, qResolve, 0); e.copyBufferToBuffer(qResolve, 0, slot.b, 0, 16); }
  submitList[0] = e.finish();
  Q.submit(submitList);
  if (slot) { slot.busy = true; slot.b.mapAsync(GPUMapMode.READ).then(slot.done); }
}

// CS[j] = distance to the rock (metres, < 0 in water) at the camera + CE[3j..3j+2]: the camera, then ±0.375 m on
// each axis for the gradient
const CE = new Float64Array([0, 0, 0, .375, 0, 0, -.375, 0, 0, 0, .375, 0, 0, -.375, 0, 0, 0, .375, 0, 0, -.375]), CS = new Float64Array(7);
const cv = (x, y, z) => { const b = CI[(x >> 2) + CN * ((y >> 2) + NY / 4 * (z >> 2))]; return b > 1 ? CG[b * 64 - 128 + (x & 3) + 4 * (y & 3) + 16 * (z & 3)] : b * 254 - 127; };
function sd(j) {
  const x = (F[CX] + CE[j * 3] - OX) / VS - CO, y = (F[CY] + CE[j * 3 + 1] - OY) / VS, z = (F[CZ] + CE[j * 3 + 2] - OZ) / VS - CO;
  const ix = x | 0, iy = y | 0, iz = z | 0, u = x - ix, v = y - iy, a = cv(ix, iy, iz), b = cv(ix, iy + 1, iz), c = cv(ix, iy, iz + 1), d = cv(ix, iy + 1, iz + 1);
  const p = a + (cv(ix + 1, iy, iz) - a) * u, q = b + (cv(ix + 1, iy + 1, iz) - b) * u, r = c + (cv(ix + 1, iy, iz + 1) - c) * u, s = d + (cv(ix + 1, iy + 1, iz + 1) - d) * u;
  const e = p + (q - p) * v; CS[j] = (e + (r + (s - r) * v - e) * (z - iz)) / 127;
}
// Moves the camera by F[MX..MZ] in steps shorter than its radius CR (so it can't pass through thin rock), pushing it
// back out after each step and dropping velocity into the rock, so it slides along.
const CR = 0.5;
// Sharks and manta rays are solid too. Their motion is a formula run on the GPU (vsShark, vsManta), so the same formula runs
// here to find where each one is, and each body is a few ellipsoids in its own frame (centre, half-sizes, in body lengths).
// push the camera out of one body's ellipsoids and drop its velocity into them, so it slides along
function bodyPush(a, manta) {
  const E = manta ? MANTA_E : SHARK_E, t = F[TIME];
  for (let o = 0; o < a.length; o += 8) {
    const sz = a[o + 6]; if (hypot(F[CX] - a[o], F[CZ] - a[o + 2]) > a[o + 3] + sz * 3 + 6) continue; // far from its whole orbit
    bodyPose(a, o, t, manta);
    for (const e of E) {
      const dx = F[CX] - BP[0], dy = F[CY] - BP[1], dz = F[CZ] - BP[2], r = CR / sz;
      const lx = (dx * BP[3] + dy * BP[4] + dz * BP[5]) / sz - e[0], ly = (dx * BP[6] + dy * BP[7] + dz * BP[8]) / sz - e[1], lz = (dx * BP[9] + dy * BP[10] + dz * BP[11]) / sz - e[2];
      const ax = e[3] + r, ay = e[4] + r, az = e[5] + r, ux = lx / ax, uy = ly / ay, uz = lz / az, q = ux * ux + uy * uy + uz * uz;
      if (q >= 1 || q < 1e-9) continue;
      const k = 1 / sqrt(q) - 1, px = ux * k * ax * sz, py = uy * k * ay * sz, pz = uz * k * az * sz; // to the surface, in body axes
      const wx = BP[3] * px + BP[6] * py + BP[9] * pz, wy = BP[4] * px + BP[7] * py + BP[10] * pz, wz = BP[5] * px + BP[8] * py + BP[11] * pz;
      F[CX] += wx; F[CY] += wy; F[CZ] += wz;
      const wl = hypot(wx, wy, wz) || 1, vn = (F[VX] * wx + F[VY] * wy + F[VZ] * wz) / wl;
      if (vn < 0) { F[VX] -= vn * wx / wl; F[VY] -= vn * wy / wl; F[VZ] -= vn * wz / wl; }
    }
  }
}
// Sleeping nurse sharks are solid too: static bodies (yaw and pitch only), each a few ellipsoids in body units
const NURSE_E = [[0, 0, 1.05, .09, .06, .14], [0, 0, .85, .15, .085, .2], [0, 0, .6, .2, .11, .25], [0, 0, .35, .21, .13, .25], [0, 0, .1, .18, .13, .25], [0, 0, -.15, .15, .12, .25], [0, 0, -.4, .125, .1, .25], [0, 0, -.65, .1, .09, .25], [0, 0, -.9, .08, .075, .25], [0, 0, -1.2, .06, .06, .3], [0, 0, -1.5, .05, .05, .3], [0, 0, -1.85, .04, .05, .35], [0, 0, -2.15, .04, .08, .35],
  [.36, -.09, .25, .26, .04, .26], [-.36, -.09, .25, .26, .04, .26], [0, .2, -.3, .03, .2, .3], [0, .15, -.95, .03, .12, .2]];
function nursePush(a) {
  for (let o = 0; o < a.length; o += 16) {
    const sz = a[o + 5]; if (hypot(F[CX] - a[o], F[CZ] - a[o + 2]) > sz * 3 + 3) continue;
    const cy = cos(a[o + 3]), sy = sin(a[o + 3]), cp = cos(a[o + 4]), sp = sin(a[o + 4]);
    const Sx = cy, Sz = -sy, Ux = -sy * sp, Uy = cp, Uz = -cy * sp, Tx = sy * cp, Ty = sp, Tz = cy * cp;
    for (const e of NURSE_E) {
      const dx = F[CX] - a[o], dy = F[CY] - a[o + 1], dz = F[CZ] - a[o + 2], r = CR / sz;
      const lx = (dx * Sx + dz * Sz) / sz - e[0] - bendAt(e[2], a[o + 7]), ly = (dx * Ux + dy * Uy + dz * Uz) / sz - e[1], lz = (dx * Tx + dy * Ty + dz * Tz) / sz - e[2];
      const ax = e[3] + r, ay = e[4] + r, az = e[5] + r, ux = lx / ax, uy = ly / ay, uz = lz / az, q = ux * ux + uy * uy + uz * uz;
      if (q >= 1 || q < 1e-9) continue;
      const k = 1 / sqrt(q) - 1, px = ux * k * ax * sz, py = uy * k * ay * sz, pz = uz * k * az * sz;
      const wx = Sx * px + Ux * py + Tx * pz, wy = Uy * py + Ty * pz, wz = Sz * px + Uz * py + Tz * pz;
      F[CX] += wx; F[CY] += wy; F[CZ] += wz;
      const wl = hypot(wx, wy, wz) || 1, vn = (F[VX] * wx + F[VY] * wy + F[VZ] * wz) / wl;
      if (vn < 0) { F[VX] -= vn * wx / wl; F[VY] -= vn * wy / wl; F[VZ] -= vn * wz / wl; }
    }
  }
}
// Blacktip reef sharks (Wd.pups, 8 floats each: x y z yaw | pitch size tail-phase turn-rate). They swim along the sea
// floor at about twice the speed of the big sharks, always ~1.2 m above the ground, never into rock; every few seconds they
// swerve by up to 30 degrees in an instant, and they swerve at once when rock lies ahead.
const PUP = Wd.pups, PLANT = Wd.plantMap, pupSpeed = Array.from({ length: PUP.length / 8 }, () => 4 + Math.random() * 0.6), pupTimer = pupSpeed.map(() => 1 + Math.random() * 3), pupTarget = pupSpeed.map((_, i) => PUP[i * 8 + 3]), pupCool = pupSpeed.map(() => 0), pupDecide = pupSpeed.map(() => Math.random() * 0.1), pupVy = pupSpeed.map(() => 0);
const sdAt = (x, y, z) => { const cx = F[CX], cy = F[CY], cz = F[CZ]; F[CX] = x; F[CY] = y; F[CZ] = z; sd(0); const v = CS[0]; F[CX] = cx; F[CY] = cy; F[CZ] = cz; return v; };
const plantAt = (x, z) => { const i = floor((x + 160) / 2.5), j = floor((z + 160) / 2.5); return i < 0 || i >= 128 || j < 0 || j >= 128 || PLANT[i + 128 * j] >= PLANT_DENSE; }; // a very densely planted cell
const solidAt = (x, y, z, margin) => sdAt(x, y, z) > -margin || plantAt(x, z); // rock within `margin` metres (the field is clamped to 1 m), or plants
// height of the ground at (x, z): scanned down from y0 + 2.5 in 0.25 m steps, then refined by bisection (no stair-steps)
const groundAt = (x, z, y0) => {
  let prev = y0 + 2.5; if (sdAt(x, prev, z) > 0) return prev;
  for (let y = prev - 0.25; y > y0 - 4; y -= 0.25) {
    if (sdAt(x, y, z) > 0) { let a = prev, b = y; for (let k = 0; k < 5; k++) { const mid = (a + b) / 2; if (sdAt(x, mid, z) > 0) b = mid; else a = mid; } return (a + b) / 2; }
    prev = y;
  }
  return y0 - 4;
};
// top of the rock above (x, z) below y0 (scanned down in 0.5 m steps, then refined), or -99 if there is none
const rockTop = (x, z, y0) => { for (let y = y0; y > -1; y -= 0.5) if (sdAt(x, y, z) > 0) return groundAt(x, z, y - 2.5); return -99; };
const plantDens = (x, z) => { const i = floor((x + 160) / 2.5), j = floor((z + 160) / 2.5); return i < 0 || i >= 128 || j < 0 || j >= 128 ? 255 : PLANT[i + 128 * j]; };
const pupDir = pupSpeed.map(() => (Math.random() < 0.5 ? 1 : -1));
const PUPB = new Float32Array(PUP.length / 2); // per shark: the body's four sideways offsets (see vsPup)
// the path each head has left (points and the distance travelled when each was made), starting as a straight line behind it
const pupHist = pupSpeed.map((_, i) => { const o = i * 8, yaw = PUP[o + 3], h = { x: [], z: [], s: [], dist: 0 }; for (let k = 40; k >= 0; k--) { h.x.push(PUP[o] - sin(yaw) * k * 0.2); h.z.push(PUP[o + 2] - cos(yaw) * k * 0.2); h.s.push(40 * 0.2 - k * 0.2); } h.dist = 8; return h; });
// the same smooth curve through the stations as in latAt (offsets in metres; u in body lengths behind the middle)
const latJS = (u, o) => { if (u <= 0) return 0; if (u >= 1.6) return PUPB[o + 3]; const s = u / 0.4, k = floor(s), t = s - k, v = [0, 0, PUPB[o], PUPB[o + 1], PUPB[o + 2], PUPB[o + 3]], p0 = v[k], p1 = v[k + 1], p2 = v[k + 2], p3 = v[min(k + 3, 5)]; return 0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t * t * t); };
const pupLift = pupSpeed.map(() => 0), pupLog = [], pupCommit = pupSpeed.map(() => 0), pupThru = pupSpeed.map(() => 0), pupStuck = pupSpeed.map(() => 0), pupLong = pupSpeed.map(() => 0), pupHome = Array.from(PUP.subarray ? PUP : PUP);
// is the whole body clear of rock when the middle of the shark is at (bx, by, bz) heading yw? (lat: the trail offsets of the bent body)
const PUP_PTS = [[1.0, 0, 0], [-1.4, 0, 0], [-1.45, 0, 0.35], [0.1, 0.78, -0.4], [0.1, -0.78, -0.4], [-0.5, 0.5, -0.1], [-0.5, -0.5, -0.1]];
const pupBodyClear = (bx, by, bz, yw, sz, i, margin) => {
  const hx = sin(yw), hz = cos(yw), sx = cos(yw), sz2 = -sin(yw);
  for (const [f, s, up] of PUP_PTS) { const lt = i >= 0 && f < 0 ? latJS(-f, i * 4) : 0; if (sdAt(bx + (hx * f + sx * s) * sz + sx * lt, by + up * sz, bz + (hz * f + sz2 * s) * sz + sz2 * lt) > -margin) return false; }
  return true;
};
// how far (m, up to maxD) the shark could swim along heading yw with its whole body clear
const pupRun = (x, y, z, yw, sz, maxD) => { let d = 0; for (; d < maxD; d += 1.2) if (!pupBodyClear(x + sin(yw) * (d + 1.2), y, z + cos(yw) * (d + 1.2), yw, sz, -1, 0.1)) break; return d; };
const wrapA = (a) => Math.atan2(sin(a), cos(a));
function pupStep(dt) {
  for (let i = 0; i < pupSpeed.length; i++) {
    const o = i * 8; let x = PUP[o], y = PUP[o + 1], z = PUP[o + 2], yaw = PUP[o + 3]; const sz = PUP[o + 5], v = pupSpeed[i];
    pupTimer[i] -= dt; pupCool[i] -= dt; pupDecide[i] -= dt; pupThru[i] -= dt; pupCommit[i] -= dt;
    const thru = pupThru[i] > 0, blk = (px, py, pz, mg) => sdAt(px, py, pz) > -mg || (!thru && plantAt(px, pz)); // boxed in earlier: plants are pushed through for a while
    if (pupDecide[i] <= 0 && (pupCommit[i] <= 0 || hypot(x, z) > 128)) { // steering is decided ten times a second, so it never twitches from frame to frame
      pupDecide[i] = 0.1;
      const ahead = (d, off) => { const a = yaw + off; return blk(x + sin(a) * d, y, z + cos(a) * d, 0.6); };
      const out = hypot(x, z) > 122 && x * sin(yaw) + z * cos(yaw) > 0; // heading out of the arena
      const inDense = !thru && plantAt(x, z);
      // a passage too narrow for the body (rock on both sides, within the width of the fins and tail) counts as blocked: turn away before going in
      const hx0 = sin(yaw), hz0 = cos(yaw), sx0 = cos(yaw), sz0 = -sin(yaw), nw = 1.45 * sz;
      const narrow = [2.5, 5, 8].some((d) => blk(x + hx0 * d + sx0 * nw, y, z + hz0 * d + sz0 * nw, 0.5) && blk(x + hx0 * d - sx0 * nw, y, z + hz0 * d - sz0 * nw, 0.5));
      const blocked = ahead(sz * 2.4, 0) || ahead(sz * 4.8, 0) || ahead(sz * 7, 0) || ahead(sz * 2.8, 0.4) || ahead(sz * 2.8, -0.4) || inDense || out || narrow;
      if (blocked && pupCool[i] <= 0) { // swerve 30 degrees towards whichever side is clearer (or back towards the middle) and hold it
        const L = !ahead(sz * 4, 0.5236) + !ahead(sz * 7, 0.5236) + !ahead(sz * 10, 0.5236), R = !ahead(sz * 4, -0.5236) + !ahead(sz * 7, -0.5236) + !ahead(sz * 10, -0.5236);
        let sgn = L === R ? pupDir[i] : L > R ? 1 : -1; // (when both sides are the same, keep the way it was turning: no dithering)
        if (out) sgn = (x * cos(yaw) - z * sin(yaw)) > 0 ? -1 : 1; // (the way that turns it back towards the middle)
        else if (inDense) { // inside a thickly planted cell: head for the thinner side
          const dl = plantDens(x + sin(yaw + 0.5) * 6, z + cos(yaw + 0.5) * 6) + plantDens(x + sin(yaw + 1) * 6, z + cos(yaw + 1) * 6), dr = plantDens(x + sin(yaw - 0.5) * 6, z + cos(yaw - 0.5) * 6) + plantDens(x + sin(yaw - 1) * 6, z + cos(yaw - 1) * 6);
          if (dl !== dr) sgn = dl < dr ? 1 : -1;
        }
        pupDir[i] = sgn; pupTarget[i] = yaw + sgn * 0.5236; pupCool[i] = 0.5; pupTimer[i] = 1.5 + Math.random() * 2;
      } else if (!blocked && pupCool[i] <= 0 && (ahead(sz * 1.6, 1.5708) || ahead(sz * 1.6, -1.5708))) { // rock or plants close at a flank: ease away
        const lb = ahead(sz * 1.6, 1.5708), rb = ahead(sz * 1.6, -1.5708);
        pupTarget[i] = yaw + (lb && !rb ? -1 : rb && !lb ? 1 : (Math.random() < 0.5 ? -1 : 1)) * 0.3; pupCool[i] = 0.6;
      } else if (!blocked && pupTimer[i] <= 0) { // now and then a sudden turn, 10 to 30 degrees either way
        // (towards the emptier side: the sharks roam where the plants are thin)
        const dl = plantDens(x + sin(yaw + 0.6) * 8, z + cos(yaw + 0.6) * 8) + plantDens(x + sin(yaw + 0.3) * 5, z + cos(yaw + 0.3) * 5), dr = plantDens(x + sin(yaw - 0.6) * 8, z + cos(yaw - 0.6) * 8) + plantDens(x + sin(yaw - 0.3) * 5, z + cos(yaw - 0.3) * 5);
        const sg = dl === dr ? (Math.random() < 0.5 ? 1 : -1) : dl < dr ? 1 : -1;
        pupTarget[i] = yaw + sg * (0.17 + Math.random() * 0.35); pupTimer[i] = 2.2 + Math.random() * 4;
      }
    }
    // heading eases towards the target (quick, 30 degrees in about a fifth of a second, but with no corners)
    const dyaw = wrapA(pupTarget[i] - yaw); let step = dyaw * Math.min(1, dt * 9); const lim = 2.6 * dt; step = step < -lim ? -lim : step > lim ? lim : step; yaw += step;
    PUP[o + 7] += (step / dt - PUP[o + 7]) * Math.min(1, dt * 3); // turn rate, smoothed: the body banks gently into the turn
    const nx = x + sin(yaw) * v * dt, nz = z + cos(yaw) * v * dt;
    let moved = false;
    // the whole body must stay clear of rock at the next position: nose, tail, the tail's tip and both pectoral tips
    const bodyOK = (bx, bz) => pupBodyClear(bx, y, bz, yaw, sz, i, 0.12);
    if (sdAt(nx, y, nz) <= -0.35 && bodyOK(nx, nz) && (thru || !plantAt(nx, nz) || plantAt(x, z))) { x = nx; z = nz; moved = true; } else { pupCool[i] = 0; pupDecide[i] = 0; } // (decide again at once; from inside a dense patch it may always move on, out of it)
    if (!moved) y += 0.5 * dt; // not moving: ease upwards out of whatever is holding it
    pupStuck[i] = moved ? 0 : pupStuck[i] + dt; pupLong[i] = moved ? Math.max(0, pupLong[i] - dt * 2) : pupLong[i] + dt;
    if (!moved && pupLong[i] > 0.9 && pupLong[i] < 0.9 + dt * 1.5) pupLog.push([+x.toFixed(1), +y.toFixed(1), +z.toFixed(1), +yaw.toFixed(2), i]); // (where they first get stuck)
    if (pupLong[i] > (hypot(x - F[CX], z - F[CZ]) > 25 ? 2.5 : 5)) { x = pupHome[o]; y = pupHome[o + 1]; z = pupHome[o + 2]; yaw = Math.random() * 6.2832; pupTarget[i] = yaw; pupLong[i] = 0; pupStuck[i] = 0; pupVy[i] = 0; const H0 = pupHist[i]; H0.x.length = H0.z.length = H0.s.length = 0; for (let k = 40; k >= 0; k--) { H0.x.push(x - sin(yaw) * k * 0.2); H0.z.push(z - cos(yaw) * k * 0.2); H0.s.push(8 - k * 0.2); } H0.dist = 8; PUP[o] = x; PUP[o + 2] = z; } // wedged for good: start over from where it began (quickly if out of sight)
    if (pupStuck[i] > 0.35) { // boxed in: take the heading (of 24) along which the whole body could swim furthest, and keep to it
      let best = -1, bestA = yaw;
      pupLift[i] = 1.3; // swim a little higher, out of the clutter near the floor, while getting out
      for (let k = 0; k < 24; k++) { const a = yaw + k * 0.2618, run = pupRun(x, y + 0.7, z, a, sz, 14) - 0.4 * Math.abs(wrapA(a - yaw)); if (run > best) { best = run; bestA = a; } }
      pupTarget[i] = bestA; pupCool[i] = 1; pupCommit[i] = 1.6; pupStuck[i] = 0; pupThru[i] = 2.5;
    }
    // height: a steady cruise about 1 m over the ground, following its overall slope (the mean of the ground over the next 8 m with
    // the highest point counted in), never its small bumps: so no bobbing, only a slow rise and fall with the sea floor
    const gs = [groundAt(x, z, y), groundAt(x + sin(yaw) * 3, z + cos(yaw) * 3, y), groundAt(x + sin(yaw) * 6, z + cos(yaw) * 6, y), groundAt(x + sin(yaw) * 9, z + cos(yaw) * 9, y)].map((q) => Math.min(q, y + 0.9)), // (one ledge or overhang never sends it up in a hurry)
       gmax = max(...gs), gmean = (gs[0] + gs[1] + gs[2] + gs[3]) / 4;
    pupLift[i] = Math.max(0, pupLift[i] - dt * 0.4);
    const want = min(0.4 * gmax + 0.6 * gmean + 1.1 * sz / 1.5 + pupLift[i], -34);
    const vy = max(-1.2, min(2.2, (want - y) * 1.2)); pupVy[i] += (vy - pupVy[i]) * Math.min(1, dt * 1.5); y += pupVy[i] * dt;
    if (sdAt(x, y, z) > -0.15) y += 0.03; // (a gentle nudge up if it ever gets that close to rock)
    const H = pupHist[i], ex = x - PUP[o], ez = z - PUP[o + 2];
    if (ex || ez) { H.dist += hypot(ex, ez); H.x.push(x); H.z.push(z); H.s.push(H.dist); if (H.s.length > 700) { H.x.splice(0, 300); H.z.splice(0, 300); H.s.splice(0, 300); } }
    // the body follows the trail of the head: where the trail was 0.4, 0.8, 1.2, 1.6 body lengths ago, measured sideways from the
    // line the shark now points along
    for (let k = 0; k < 4; k++) {
      const want = H.dist - 0.4 * (k + 1) * sz; let j = H.s.length - 1; while (j > 0 && H.s[j] > want) j--;
      const t = j < H.s.length - 1 ? (want - H.s[j]) / (H.s[j + 1] - H.s[j] || 1) : 0, px = H.x[j] + (H.x[j + 1 < H.s.length ? j + 1 : j] - H.x[j]) * t, pz = H.z[j] + (H.z[j + 1 < H.s.length ? j + 1 : j] - H.z[j]) * t;
      PUPB[i * 4 + k] = 0.9 * ((px - x) * cos(yaw) - (pz - z) * sin(yaw));
    }
    PUP[o] = x; PUP[o + 1] = y; PUP[o + 2] = z; PUP[o + 3] = yaw;
    PUP[o + 4] += (Math.atan2(pupVy[i], v) * 0.6 - PUP[o + 4]) * Math.min(1, dt * 2);
    PUP[o + 6] += dt * (1.6 + v * 0.35); // a slow, even tail beat
  }
  Q.writeBuffer(ibPup, 0, PUP); Q.writeBuffer(ibPupB, 0, PUPB);
}
// the blacktips are solid: the same ellipsoids as the big ones, in their own (yaw, pitch) frame
function pupPush(a) {
  for (let o = 0; o < a.length; o += 8) {
    const sz = a[o + 5]; if (hypot(F[CX] - a[o], F[CZ] - a[o + 2]) > sz * 3 + 3) continue;
    const cy = cos(a[o + 3]), sy = sin(a[o + 3]), cp = cos(a[o + 4]), sp = sin(a[o + 4]);
    const Sx = cy, Sz = -sy, Ux = -sy * sp, Uy = cp, Uz = -cy * sp, Tx = sy * cp, Ty = sp, Tz = cy * cp;
    for (const e of SHARK_E) {
      const dx = F[CX] - a[o], dy = F[CY] - a[o + 1], dz = F[CZ] - a[o + 2], r = CR / sz;
      const lx = (dx * Sx + dz * Sz) / sz - e[0] - latJS(-e[2], (o / 8) * 4) / sz, ly = (dx * Ux + dy * Uy + dz * Uz) / sz - e[1], lz = (dx * Tx + dy * Ty + dz * Tz) / sz - e[2];
      const ax = e[3] + r, ay = e[4] + r, az = e[5] + r, ux = lx / ax, uy = ly / ay, uz = lz / az, q = ux * ux + uy * uy + uz * uz;
      if (q >= 1 || q < 1e-9) continue;
      const k = 1 / sqrt(q) - 1, px = ux * k * ax * sz, py = uy * k * ay * sz, pz = uz * k * az * sz;
      const wx = Sx * px + Ux * py + Tx * pz, wy = Uy * py + Ty * pz, wz = Sz * px + Uz * py + Tz * pz;
      F[CX] += wx; F[CY] += wy; F[CZ] += wz;
      const wl = hypot(wx, wy, wz) || 1, vn = (F[VX] * wx + F[VY] * wy + F[VZ] * wz) / wl;
      if (vn < 0) { F[VX] -= vn * wx / wl; F[VY] -= vn * wy / wl; F[VZ] -= vn * wz / wl; }
    }
  }
}
function collide() {
  const n = floor(sqrt(F[MX] * F[MX] + F[MY] * F[MY] + F[MZ] * F[MZ]) / 0.4) + 1;
  for (let i = 0; i < n; i++) {
    F[CX] += F[MX] / n; F[CY] += F[MY] / n; F[CZ] += F[MZ] / n;
    for (let k = 0; k < 2; k++) {
      sd(0); const s = CS[0] + CR; if (s <= 0) break;
      for (let j = 1; j < 7; j++) sd(j);
      let gx = CS[1] - CS[2], gy = CS[3] - CS[4], gz = CS[5] - CS[6]; const l = sqrt(gx * gx + gy * gy + gz * gz);
      if (l < 0.075) break; // flat: deep in rock
      gx /= l; gy /= l; gz /= l; const vn = F[VX] * gx + F[VY] * gy + F[VZ] * gz;
      F[CX] -= gx * s; F[CY] -= gy * s; F[CZ] -= gz * s;
      if (vn > 0) { F[VX] -= gx * vn; F[VY] -= gy * vn; F[VZ] -= gz * vn; }
    }
    bodyPush(Wd.sharks, 0); bodyPush(Wd.mantas, 1); nursePush(Wd.nurse); pupPush(Wd.pups);
  }
}

// ---------------------------------------------------------------- sand stirred up near the bottom
// Swimming close to the sand pushes the water about, and the sand with it: puffs are born on the ground around the swimmer
// (more the faster and the lower), are dragged back by the wake, then spread, drift with the current and settle.
const NPUF = 1700, PS = new Float32Array(NPUF * 11), PU = new Float32Array(NPUF * 8), ibPuf = device.createBuffer({ size: NPUF * 32, usage: BU.VERTEX | BU.COPY_DST });
let puN = 0, puAcc = 0;
const prn = Math.random;
// white spray (a puff with seed > 1.5): ballistic, dies at the water
function spray(x, y, z, vx, vy, vz, life, s0, s1) {
  const o = puN++ % NPUF * 11;
  PS[o] = x; PS[o + 1] = y; PS[o + 2] = z; PS[o + 3] = vx; PS[o + 4] = vy; PS[o + 5] = vz; PS[o + 6] = 0; PS[o + 7] = life; PS[o + 8] = s0; PS[o + 9] = s1; PS[o + 10] = 2 + prn();
}
const crown = (x, z, n, up, out) => { for (let i = 0; i < n; i++) { const a = prn() * 6.2832, r = out * (0.3 + prn() * 0.7); spray(x + cos(a) * 0.4, 0.05, z + sin(a) * 0.4, cos(a) * r, up * (0.4 + prn() * 0.6), sin(a) * r, 3, 0.2, 0.5 + prn() * 0.3); } };
// ---------------------------------------------------------------- easter eggs
let torchGrace = 0, stillT = 0, torchHold = 0, whCool = 0, whStill = 0, shT = 0, shSeen = 0, jelBloom = false, nightK = 0, fishK = 0;
const JB = [];
function whaleShow() {
    const a = prn() * 6.2832, hx = -cos(a), hz = -sin(a), sx = WHALE[0] + cos(a) * 55, sz = WHALE[2] + sin(a) * 55, y = WHALE[1] + 27;
  for (const [s, sz2, lat] of [[-13, 3.4, 3.5], [-13, 3.4, -3.5], [-10, 2.6, 0], [-5, 5, 0], [1, 7, 0], [7, 6.5, 0], [12, 5, 0], [16, 3.4, 0]]) {
    const o = puN++ % NPUF * 11, px = sx + hx * s - hz * lat, pz = sz + hz * s + hx * lat;
    PS[o] = px; PS[o + 1] = y; PS[o + 2] = pz; PS[o + 3] = hx * 2.6; PS[o + 4] = 0; PS[o + 5] = hz * 2.6; PS[o + 6] = 0; PS[o + 7] = 46; PS[o + 8] = sz2 * 0.8; PS[o + 9] = sz2; PS[o + 10] = 3 + prn() * 0.9;
  }
}
// The geyser's big throw: 400 m up (an S-curve, 9 s), then back down at a speed that the air limits (about 12 s), drifting to a
// landing on the water ~28 m from the geyser
const TRIP_H = 400;
function startTrip() {
  let lx = GX + 28, lz = GZ;
  for (const [rr, deep] of [[28, -7.9], [34, -7.9], [28, -3]]) { let ok = false; for (let k = 0; k < 24 && !ok; k++) { const an = k * 0.2618, x = GX + cos(an) * rr, z = GZ + sin(an) * rr; if (hypot(x, z) < 138 && groundAt(x, z, -4) <= deep) { lx = x; lz = z; ok = true; } } if (ok) break; }
  fly = 2; trip = { ph: 1, t: 0, alt: 0, lx, lz };
  F[VX] *= 0.3; F[VZ] *= 0.3; gJet = 1.4; gJx = GX; gJz = GZ; crown(GX, GZ, 160, 14, 7);
}
// one step of the trip: the camera's new position
function tripStep(dt) {
  const T = 9, tr = trip;
  if (tr.ph === 1) { tr.t += dt; const s = min(tr.t / T, 1); tr.alt = TRIP_H * s * s * (3 - 2 * s); if (s >= 1) { tr.ph = 2; tr.alt = TRIP_H; } return [GX, tr.alt, GZ]; }
  const a = 2 * TRIP_H / (T * T), v = min(sqrt(2 * a * (TRIP_H - tr.alt) + 1), 28 + 0.09 * tr.alt);
  tr.alt -= v * dt; const p = 1 - sqrt(max(tr.alt, 0) / TRIP_H);
  return [GX + (tr.lx - GX) * p, max(tr.alt, 0), GZ + (tr.lz - GZ) * p];
}
// the plunge: a swarm of bubbles from the entry point rising from down to ten metres (vsBub loops them, so they are switched off after one rise)
function splashBubbles(x, z) {
  const n = 170, a = new Float32Array(n * 8), t = F[TIME];
  for (let k = 0; k < n; k++) {
    const o = k * 8, an = prn() * 6.2832, rd = 2.2 * sqrt(prn()), y = -(0.3 + 9.5 * prn() * prn()), sp = 1.4 + 1.8 * prn(), rg = -y + 1.2;
    a[o] = x + cos(an) * rd; a[o + 1] = y; a[o + 2] = z + sin(an) * rd; a[o + 3] = 0.1 + 0.4 * prn() * prn();
    a[o + 4] = ((-t * sp / rg) % 1 + 1) % 1; a[o + 5] = sp; a[o + 6] = rg; a[o + 7] = 0.05 + 0.08 * prn();
  }
  if (!ibSB) ibSB = buf(a, BU.VERTEX); else Q.writeBuffer(ibSB, 0, a);
  sbT0 = t;
}
// seagulls: they rest on the rocks that stand out of the water; come within a few metres and they take off, circle high over the atoll,
// and settle again once you have gone. mode 0 perched, 1 taking off, 2 circling, 3 coming in to land
let gullScare = 10, gullTour = 0, gHold = 0; // (gHold: the V key keeps you from sinking back for a while, so you can look at the gulls)
const gulls = Array.from({ length: NGU }, (_, k) => ({ mode: GP.length && k < min(10, GP.length) ? 0 : 2, k, pi: GP.length && k < min(10, GP.length) ? k : -1, perch: GP.length && k < min(10, GP.length) ? GP[k] : null, pos: [0, 0, 0], yaw: 0, t0: 0, stay: 6 + Math.random() * 14, R: 40 + Math.random() * 70, alt: 12 + Math.random() * 14, dir: Math.random() < 0.5 ? -1 : 1, a0: Math.random() * 6.28, sz: 1.35 + Math.random() * 0.2, sd: Math.random(), fx: 0, fz: 0, st: [0, 0, 0], fly: 0 }));
const gOrbit = (g, t) => { const a = g.a0 + g.dir * 9 / g.R * t; return [g.R * cos(a), g.alt + 2.2 * sin(t * 0.3 + g.sd * 20), g.R * sin(a)]; };
const smooth01 = (x) => { x = x < 0 ? 0 : x > 1 ? 1 : x; return x * x * (3 - 2 * x); };
function gullStep(dt) {
  const t = F[TIME], cx = F[CX], cy = F[CY], cz = F[CZ];
  for (const g of gulls) {
    const pv = g.pos.slice(), P = g.perch;
    if (g.mode === 9) { const o = g.k * 8; GU[o] = g.pos[0]; GU[o + 1] = g.pos[1]; GU[o + 2] = g.pos[2]; GU[o + 3] = g.yaw; GU[o + 4] = g.fly; GU[o + 5] = g.sz; GU[o + 6] = g.sd; continue; } // (a gull held still by the dev hook)
    const dp = P ? hypot(cx - P[0], cy - P[1], cz - P[2]) : 1e9;
    if (g.mode === 0) { g.pos = [P[0], P[1] + 0.43 * g.sz, P[2]]; g.fly = 0; g.yaw = P[3]; if (g.pos[1] > 0 && dp < gullScare) g.mode = 4; }
    if (g.mode === 4) { // startled: away from you and up; the perch is free for anyone else
      const dx = P[0] - cx, dz = P[2] - cz, dl = hypot(dx, dz) || 1; g.fx = dx / dl; g.fz = dz / dl; g.st = g.pos.slice(); g.t0 = t; g.mode = 1;
      g.a0 = atan2(g.st[2], g.st[0]) - g.dir * 9 / g.R * t; g.stay = 6 + Math.random() * 14; g.pi = -1; g.perch = null;
    }
    if (g.mode === 1) {
      const e = t - g.t0, s = smooth01(e / 5), o = gOrbit(g, t), h = smooth01(e / 4);
      const fp = [g.st[0] + g.fx * 7 * e, g.st[1] + (g.alt - g.st[1]) * h, g.st[2] + g.fz * 7 * e];
      g.pos = [fp[0] + (o[0] - fp[0]) * s, fp[1] + (o[1] - fp[1]) * s, fp[2] + (o[2] - fp[2]) * s]; g.fly = smooth01(e / 0.4);
      if (e > 5) { g.mode = 2; g.t0 = t; }
    } else if (g.mode === 2) {
      g.pos = gOrbit(g, t); g.fly = 1;
      if (GP.length && t - g.t0 > g.stay) { // settle on the nearest free perch that is not close to you
        let bi = -1, bd = 1e9;
        GP.forEach((q, i) => { if (hypot(cx - q[0], cy - q[1], cz - q[2]) < gullScare * 1.8 || gulls.some((o) => o !== g && o.pi === i)) return; const d = hypot(q[0] - g.pos[0], q[2] - g.pos[2]); if (d < bd) { bd = d; bi = i; } });
        if (bi >= 0) { g.pi = bi; g.perch = GP[bi]; g.mode = 3; g.t0 = t; } else g.t0 = t - g.stay + 3;
      }
    } else if (g.mode === 3) {
      const e = t - g.t0, s = smooth01(e / 9), o = gOrbit(g, t), tp = [P[0], P[1] + 0.43 * g.sz, P[2]];
      g.pos = [o[0] + (tp[0] - o[0]) * s, o[1] + (tp[1] - o[1]) * Math.pow(s, 0.6), o[2] + (tp[2] - o[2]) * s]; g.fly = 1 - smooth01((s - 0.9) / 0.1);
      if (dp < gullScare * 0.8) { g.mode = 4; }
      else if (e > 9) { g.mode = 0; }
    }
    if (g.mode !== 0 && g.mode !== 4) {
      const vx = g.pos[0] - pv[0], vz = g.pos[2] - pv[2];
      if (hypot(vx, vz) > 1e-4 * max(dt, 0.001) * 60 && dt > 0) { let d = atan2(vx, vz) - g.yaw; d -= 6.2832 * Math.round(d / 6.2832); g.yaw += d * min(1, dt * 5); }
    }
    const o = g.k * 8; GU[o] = g.pos[0]; GU[o + 1] = g.pos[1]; GU[o + 2] = g.pos[2]; GU[o + 3] = g.yaw; GU[o + 4] = g.fly; GU[o + 5] = g.sz; GU[o + 6] = g.sd; GU[o + 7] = 0;
  }
  Q.writeBuffer(ibGull, 0, GU);
}
function eggStep(dt) {
  if (sbT0 && F[TIME] - sbT0 > 11) { sbT0 = 0; Q.writeBuffer(ibSB, 0, new Float32Array(170 * 8)); }
  if (menu) return;
  const cx = F[CX], cy = F[CY], cz = F[CZ], spd = sqrt(F[VX] * F[VX] + F[VY] * F[VY] + F[VZ] * F[VZ]), tt = F[TIME];
  stillT = spd < 1 && cy < -0.8 && !fly ? stillT + dt : 0;
  // the night sky above 60 m: dusk and stars on the way up from the geyser
  nightK = 0.92 * sstep(90, 340, cy); // the sky goes to dusk and stars as you climb
  // the downdraft in the tunnel's first shaft
  if (TUN.length && !fly) {
    const [vx, vt, vz] = TUN[0], dh = hypot(cx - vx, cz - vz);
    if (dh < 3.6 && cy > LTY + 1 && cy < vt + 14) { const k = sstep(3.6, 1.5, dh); F[VY] -= 26 * k * dt; if (F[VY] < -9) F[VY] = -9; F[VX] += (vx - cx) * 1.5 * dt; F[VZ] += (vz - cz) * 1.5 * dt; }
  }
  // whale song: stay by the quiet spot on the deep floor for a few seconds
  whCool -= dt;
  if (WHALE && whCool <= 0 && hypot(cx - WHALE[0], cz - WHALE[2]) < 6 && cy < WHALE[1] + 10) whStill += dt; else whStill = 0;
  if (whStill > 3) {
    whStill = 0; whCool = 120; whaleSong(); whaleShow();
  }
  // glow fish gather in the torch beam after a while in the dark
  torchGrace -= dt; torchHold = torchOn && spd < 4 ? torchHold + dt : torchGrace > 0 ? torchHold : 0;
  fishK += ((torchHold > 8 ? 1 : 0) - fishK) * (1 - exp(-dt * 1.2));
  { const o = FISH0 * 8, tx = cx + sin(F[YAW]) * cos(F[PIT]) * 3.2, ty = cy - sin(F[PIT]) * 3.2 * -1, tz = cz - cos(F[YAW]) * cos(F[PIT]) * 3.2;
    for (let k = 0; k < NGF; k++) { const j = o + k * 8; Wd.fish[j] += ((fishK > 0.05 ? tx : cx) - Wd.fish[j]) * (1 - exp(-dt * (fishK > 0.05 ? 1.6 : 0))); Wd.fish[j + 1] = fishK > 0.05 ? Wd.fish[j + 1] + (ty - Wd.fish[j + 1]) * (1 - exp(-dt * 1.6)) : -300; Wd.fish[j + 2] += (tz - Wd.fish[j + 2]) * (1 - exp(-dt * (fishK > 0.05 ? 1.6 : 0))); }
    if (fishK > 0.05 && Wd.fish[o + 1] < -299) for (let k = 0; k < NGF; k++) { const j = o + k * 8; Wd.fish[j] = cx + (prn() - 0.5) * 30; Wd.fish[j + 1] = cy + (prn() - 0.5) * 6; Wd.fish[j + 2] = cz + (prn() - 0.5) * 30; }
    Q.writeBuffer(ibFish, o * 4, Wd.fish, o, NGF * 8); }
  // a shark comes by if you hang still near the floor for a minute
  { const h = cy < -20 ? -CS[0] : 99; if (shT === 0) { shSeen = stillT > 60 && h < 9 ? shSeen + 1 : 0; if (shSeen > 0) { shT = 0.001; Wd.sharks[SHK0 * 8] = cx; Wd.sharks[SHK0 * 8 + 1] = cy; Wd.sharks[SHK0 * 8 + 2] = cz; Wd.sharks[SHK0 * 8 + 3] = 9; } }
    else { shT += dt; const o = SHK0 * 8, a = Wd.sharks;
      if (shT < 34) { // circles at least 3 m over the highest ground within its orbit
        const R = 9 - 3.5 * sstep(0, 6, shT); let hg = -99; for (let q = 0; q < 8; q++) { const g = groundAt(a[o] + cos(q * 0.7854) * R, a[o + 2] + sin(q * 0.7854) * R, a[o + 1]); if (g > hg) hg = g; }
        const ty = max(F[CY] - 0.5, hg + 3.4);
        a[o] += (F[CX] - a[o]) * (1 - exp(-dt * 0.5)); a[o + 1] += (ty - a[o + 1]) * (1 - exp(-dt * 0.8)); a[o + 2] += (F[CZ] - a[o + 2]) * (1 - exp(-dt * 0.5)); a[o + 3] = R; }
      else if (shT < 70) a[o + 3] += 3 * dt; else { a[o + 1] = -300; shT = 0; }
      Q.writeBuffer(ibShark, o * 4, a, o, 8); } }
  // jellyfish drift in to a slow ring round you when you hang still near the surface
  jelBloom = stillT > 20 && cy > -14 && cy < -0.8 ? true : spd > 1.6 ? false : jelBloom;
  { const nj = 12, st = Wd.jelly; if (JB.length === 0) for (let k = 0; k < nj; k++) JB.push(0);
    for (let k = 0; k < nj; k++) {
      const o = k * 8, kk = st[o + 4], ang = k / nj * 6.2832 + tt * 0.07, rr = 4.2 + (k % 3) * 1.1;
      const off = [sin(tt * 0.05 + kk * 20) * 5 + sin(tt * 0.13 + kk * 7) * 1.5, sin(tt * 0.5 + kk * 9) * 1.4, cos(tt * 0.045 + kk * 13) * 5 + cos(tt * 0.11 + kk * 5)];
      const gx = jelBloom ? cx + cos(ang) * rr - off[0] : JELLY0[o], gy = jelBloom ? cy + 0.6 * sin(k * 2.3) - off[1] : JELLY0[o + 1], gz = jelBloom ? cz + sin(ang) * rr - off[2] : JELLY0[o + 2];
      const dx = gx - st[o], dy = gy - st[o + 1], dz = gz - st[o + 2], dl = hypot(dx, dy, dz) || 1, sp = min(dl, (jelBloom ? 5 : 3) * dt);
      st[o] += dx / dl * sp; st[o + 1] += dy / dl * sp; st[o + 2] += dz / dl * sp;
    }
    Q.writeBuffer(ibJelly, 0, st, 0, nj * 8); }
}
function puffStep(dt) {
  if (GEY && !menu) {
    gAcc += 28 * dt; while (gAcc >= 1) { gAcc -= 1; const a = prn() * 6.2832, r = 0.6 * prn(), tall = prn() < 0.6; // the bubbles pop into a little spray
      spray(GX + cos(a) * r, 0.05, GZ + sin(a) * r, cos(a) * (tall ? 0.7 : 1.6), tall ? 4 + prn() * 4 : 1.5 + prn() * 2, sin(a) * (tall ? 0.7 : 1.6), 4, tall ? 0.25 : 0.6, tall ? 0.8 : 1.1); }
    if (gJet > 0) { gJet -= dt; for (let i = 0, n = 380 * dt; i < n; i++) { const a = prn() * 6.2832, r = 1.1 * prn(); spray(gJx + cos(a) * 0.3, 0.05, gJz + sin(a) * 0.3, cos(a) * r, 18 + prn() * 28, sin(a) * r, 9, 0.25, 0.7); } }
  }
  const sp = sqrt(F[VX] * F[VX] + F[VY] * F[VY] + F[VZ] * F[VZ]);
  let act = (sp - 0.9) / 3; act = act < 0 ? 0 : act > 1 ? 1 : act;
  if (act > 0 && F[CY] < -0.4 && !menu) {
    sd(0); const h = -CS[0];
    if (h < 2.2) {
      for (let j = 1; j < 7; j++) sd(j);
      let gx = CS[1] - CS[2], gy = CS[3] - CS[4], gz = CS[5] - CS[6]; const l = sqrt(gx * gx + gy * gy + gz * gz);
      if (l > 0.075 && -gy / l > 0.35) {
        gx /= l; gy /= l; gz /= l;
        let pr = (2.2 - h) / 1.6; pr = pr > 1 ? 1 : pr;
        puAcc += (28 + 70 * act) * act * pr * dt;
        const gpx = F[CX] + gx * h, gpy = F[CY] + gy * h, gpz = F[CZ] + gz * h;
        const hl = sqrt(F[VX] * F[VX] + F[VZ] * F[VZ]) || 1, dx = F[VX] / hl, dz = F[VZ] / hl;
        while (puAcc >= 1) {
          puAcc -= 1; const o = puN++ % NPUF * 11, a = prn() * 6.2832, rr = 0.2 + 1.5 * sqrt(prn()), ah = prn() * 1.4 - 0.4;
          let x = gpx + cos(a) * rr + dx * ah, z = gpz + sin(a) * rr + dz * ah, y = gpy + 0.1 + prn() * 0.25;
          const d = sdAt(x, y, z); if (d > -0.05) y += d + 0.2; // started inside a slope: lift it clear
          PS[o] = x; PS[o + 1] = y; PS[o + 2] = z;
          const sc = 0.22 + 0.2 * act; // the wake drags it back and spreads it sideways
          PS[o + 3] = -F[VX] * sc * 0.5 + (x - F[CX]) * 0.5 + (prn() - 0.5) * 0.6; PS[o + 4] = 0.12 + prn() * 0.4; PS[o + 5] = -F[VZ] * sc * 0.5 + (z - F[CZ]) * 0.5 + (prn() - 0.5) * 0.6;
          PS[o + 6] = 0; PS[o + 7] = 4 + prn() * 6; PS[o + 8] = 0.14 + prn() * 0.16; PS[o + 9] = 0.7 + prn() * 0.8; PS[o + 10] = prn();
        }
      }
    }
  }
  const tc = F[TIME], dr = exp(-dt * 1.5), cf = 1 - exp(-dt * 0.5);
  for (let i = 0; i < NPUF; i++) {
    const o = i * 11, u = i * 8, life = PS[o + 7];
    if (PS[o + 6] >= life) { PU[u + 3] = 0; continue; }
    const age = PS[o + 6] += dt;
    if (PS[o + 10] >= 3 && PS[o + 10] < 4) { PS[o] += PS[o + 3] * dt; PS[o + 1] += PS[o + 4] * dt; PS[o + 2] += PS[o + 5] * dt; } // (drifting silhouette)
    else if (PS[o + 10] > 1.5) { PS[o + 4] -= 9.81 * dt; PS[o] += PS[o + 3] * dt; PS[o + 1] += PS[o + 4] * dt; PS[o + 2] += PS[o + 5] * dt; if (PS[o + 1] < 0 && PS[o + 4] < 0) { PS[o + 6] = life; PU[u + 3] = 0; continue; } }
    else {
    PS[o + 3] = PS[o + 3] * dr + (0.14 - PS[o + 3] * dr) * cf; PS[o + 4] = PS[o + 4] * dr + (-0.03 - PS[o + 4] * dr) * cf; PS[o + 5] = PS[o + 5] * dr + (0.1 - PS[o + 5] * dr) * cf;
    PS[o] += PS[o + 3] * dt + sin(tc * 0.7 + i) * 0.003; PS[o + 1] += PS[o + 4] * dt; PS[o + 2] += PS[o + 5] * dt + cos(tc * 0.6 + i * 1.7) * 0.003; }
    const f = age / life, s0 = PS[o + 8], s1 = PS[o + 9];
    PU[u] = PS[o]; PU[u + 1] = PS[o + 1]; PU[u + 2] = PS[o + 2]; PU[u + 3] = s0 + (s1 - s0) * (1 - exp(-age * 0.8));
    let fi = age / 0.35; fi = fi > 1 ? 1 : fi; const fo = 1 - f;
    PU[u + 4] = (PS[o + 10] >= 3 && PS[o + 10] < 4 ? 0.9 * min(1, age / 4) * min(1, (life - age) / 4) : 0.62 * fi * fo * fo); PU[u + 5] = PS[o + 10];
  }
  Q.writeBuffer(ibPuf, 0, PU);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dtr = now - F[LAST]; F[LAST] = now;
  let dt = dtr / 1000; if (dt > 0.1) dt = 0.1;
  // Dynamic resolution for 60 fps: every second (0.4 s behind the menu) scale the load by k
  if (dtr < 1e3 && (dynT += dtr) > 0 && (dynN++, dynT > (menu ? 400 : 1000))) {
    const a = dynT / dynN, g = dynGN ? dynG / dynGN : 0; let k = 1;
    // with GPU timing: keep it between 9.8 and 13.6 ms
    if (g) { if (g > 13.6 || g < 9.8) k = 11.7 / g; }
    // without: slow for two periods in a row means fewer pixels, and twice as long before trying to go back up
    else if (a > 17.6) { dynOk = 0; if (++dynBad > 1) { k = 15 / a; dynBad = 0; dynWait = min(dynWait * 2, 60); } }
    // at the display's rate there is no telling if there is room, so try a little more now and then
    else { dynBad = 0; if (a < 12.5) k = 15 / a; else if (++dynOk > dynWait) { k = 1.17; dynOk = 0; } }
    k = k < 0.5 ? 0.5 : k > 1.7 ? 1.7 : k; const top = min(PIXMAX, DW * DH), mid = max(top / 2, PIXMIN), was = pix + det;
    // too slow: pixels down to `mid` first, then draw distance, then the remaining pixels; faster goes back the same way
    if (k < 1 ? pix > mid || det <= DETMIN : pix < mid || det >= 1) {
      const end = k < 1 ? (det > DETMIN ? mid : PIXMIN) : det < 1 ? mid : top;
      pix *= k; if (k < 1 ? pix < end : pix > end) pix = end;
    } else { det *= sqrt(k); det = det < DETMIN ? DETMIN : det > 1 ? 1 : det; }
    if (was !== pix + det) keep('abyssal', [LV, pix < top ? pix | 0 : '', det]); // nothing kept at full resolution
    dynN = dynT = dynG = dynGN = 0; resize();
  }
  F[TIME] += dt;
  pupStep(dt);
  {
    // touch: holding the finger away from where it went down keeps turning, like a joystick
    if (tId >= 0) {
      const tr = 4 / (innerWidth < innerHeight ? innerWidth : innerHeight); let jx = (tx - tx0) * tr, jy = (ty - ty0) * tr;
      jx = jx > 1 ? 1 : jx < -1 ? -1 : jx; jy = jy > 1 ? 1 : jy < -1 ? -1 : jy;
      lkx += jx * 1.5 * dt; lky += jy * dt;
    }
    // mouse look through two cascaded low-pass stages
    const kq = 1 - exp(-dt * 30); lkx += mdx * 0.0022; lky += mdy * 0.0022; mdx = 0; mdy = 0;
    const ax = lkx * kq, ay = lky * kq; lkx -= ax; lky -= ay; l2x += ax; l2y += ay;
    const dyw = l2x * kq, dpt = l2y * kq; l2x -= dyw; l2y -= dpt;
    const yaw = F[YAW] + dyw; let pitch = F[PIT] - dpt; pitch = pitch < -1.55 ? -1.55 : pitch > 1.55 ? 1.55 : pitch;
    const sp = ks || ka || tN > 1 ? 26 : 7, k = 1 - exp(-dt * 4.5), mf = tId >= 0 ? 0.7 : kf - kb, mr = kr - kl, mu = ku - kd, cp = cos(pitch), sy = sin(yaw), cw = cos(yaw);
    // underwater current: one steady flow that pushes you very gently away (~0.18 m/s) while you also bob up and down (about
    // 0.4 m, every 6 s), as if floating. Near the edge of the arena the flow turns back toward the middle.
    const tc = F[TIME], cu = F[CY] < -0.4 ? (F[CY] < -1.5 ? 1 : (-F[CY] - 0.4) / 1.1) : 0, cr = sqrt(F[CX] * F[CX] + F[CZ] * F[CZ]), cw2 = cr > 105 ? (cr > 135 ? 1 : (cr - 105) / 30) : 0, cs = 0.18 * (1 + 0.15 * sin(tc * 0.09));
    const cvx = (0.8 * (1 - cw2) - F[CX] / (cr + 1) * cw2) * cs * cu, cvz = (0.6 * (1 - cw2) - F[CZ] / (cr + 1) * cw2) * cs * cu;
    const cvy = (0.42 * sin(tc * 1.05) + 0.1 * sin(tc * 2.3 + 1)) * cu;
    // setting off: no pause, the thrust builds up gradually over ~1.6 s, to a top speed of 67.5% of what it used to be
    swimT = mf !== 0 || mr !== 0 || mu !== 0 ? swimT + dt : 0; let sr = swimT / 1.6; sr = sr > 1 ? 1 : sr; sr = sr * (2 - sr); const spe = sp * 0.675 * sr;
    const vx = F[VX] + ((sy * cp * mf + cw * mr) * spe + cvx - F[VX]) * k, vy = F[VY] + ((sin(pitch) * mf + mu) * spe + cvy - F[VY]) * k, vz = F[VZ] + ((-cw * cp * mf + sy * mr) * spe + cvz - F[VZ]) * k;
    // out of the water, on top of rock: you walk (eye 1.7 m over the ground, slower, no flying); off a ledge you fall
    if (GEY && !fly) { gCool -= dt; if (gCool <= 0 && F[CY] > GY + 0.3 && F[CY] < 1.4 && hypot(F[CX] - GX, F[CZ] - GZ) < 1.8) startTrip(); }
    const gh = F[CY] > 0 && F[CY] < 14 ? groundAt(F[CX], F[CZ], F[CY] - 2.2) : -99, walk = F[CY] > 0 && gh > 0.15 && F[CY] - gh < 2.6;
    if (fly === 1 && (F[CY] < 0.2 || walk) && F[VY] < 0) { fly = 0; gCool = 4; if (F[CY] < 0.5) crown(F[CX], F[CZ], 200, 12, 8); }
    let wvx = vx, wvy = vy, wvz = vz;
    if (walk) {
      const sw = ks || ka ? 6.5 : 3.6, kw = 1 - exp(-dt * 8), fx = sy * mf + cw * mr, fz = -cw * mf + sy * mr, fl = hypot(fx, fz) || 1, m = fl > 1 ? 1 / fl : 1;
      wvx = F[VX] + (fx * m * sw - F[VX]) * kw; wvz = F[VZ] + (fz * m * sw - F[VZ]) * kw;
      wvy = (gh + 1.7 - F[CY]) * 8; wvy = wvy > 5 ? 5 : wvy < -9 ? -9 : wvy;
    }
    // swimming at the surface into rock that rises out of the water: you haul yourself up it (and over the top, into a walk)
    let climb = false;
    if (!walk && !fly && F[CY] > -0.8 && F[CY] < 15 && mf > 0) {
      const top = rockTop(F[CX] + sy * 1.2, F[CZ] - cw * 1.2, F[CY] + 3);
      if (top > 0.3 && top + 2 > F[CY]) { climb = true; wvy = (top + 1.9 - F[CY]) * 5; wvy = wvy > 4.5 ? 4.5 : wvy < -2 ? -2 : wvy; }
    }
    if (fly === 2) { const p = tripStep(dt); wvx = (p[0] - F[CX]) / dt; wvy = (p[1] - F[CY]) / dt; wvz = (p[2] - F[CZ]) / dt; if (trip.ph === 2 && p[1] <= 0.4) { fly = 0; gCool = 4; crown(p[0], p[2], 700, 24, 15); gJet = 0.7; gJx = p[0]; gJz = p[2]; splashBubbles(p[0], p[2]); trip = null; wvy = -45; wvx = 0; wvz = 0; } }
    else if (fly) { const kf2 = 1 - exp(-dt * 0.9), fx = sy * mf + cw * mr, fz = -cw * mf + sy * mr; wvx = F[VX] + (fx * 5 - F[VX]) * kf2; wvz = F[VZ] + (fz * 5 - F[VZ]) * kf2; wvy = F[VY] - 9.81 * dt; }
    const gr = !walk && !fly && !climb && F[CY] > 0.3 && F[TIME] > gHold ? 14 * dt : 0; // above the water you slowly sink back
    let x = F[CX] + wvx * dt, y = F[CY] + (wvy - gr) * dt, z = F[CZ] + wvz * dt;
    const rad = sqrt(x * x + z * z); if (rad > 150) { x *= 150 / rad; z *= 150 / rad; }
    const ymax = fly ? 4.5e5 : walk || climb ? 18 : 3.4; y = y < -52 ? -52 : y > ymax ? ymax : y;
    F[YAW] = yaw; F[PIT] = pitch; F[VX] = wvx; F[VY] = wvy - gr; F[VZ] = wvz; F[MX] = x - F[CX]; F[MY] = y - F[CY]; F[MZ] = z - F[CZ];
    if (F[CY] < 14) collide(); else { F[CX] += F[MX]; F[CY] += F[MY]; F[CZ] += F[MZ]; } // (above the rock there is nothing to hit)
  }
  eggStep(dt); gullStep(dt);
  puffStep(dt);
  render();
  if ((mapT += dtr) > 50) { mapT = 0; if (!menu && !mm.style.visibility) drawMap(); }
  if (hud) {
    hN++; if (dtr > hMax) hMax = dtr; if (dtr < hMin) hMin = dtr; if (dtr > hPer * 1.5) { hLate++; hTot++; }
    F[HUDT] += dtr / 1000;
    if (F[HUDT] > 0.5) { info.textContent = `${(hN / F[HUDT]).toFixed(0)} fps  ·  worst frame ${hMax.toFixed(1)} ms  ·  late frames ${hLate} (total ${hTot})  ·  GPU ${F[GPU].toFixed(2)} ms  ·  ${W}x${H} (${W * 100 / DW | 0}%)`; F[HUDT] = 0; hPer = hMin; hN = 0; hMax = 0; hMin = 1e9; hLate = 0; }
  }
}

// ---------------------------------------------------------------- input
const key = (e, v) => {
  switch (e.code) {
    case 'KeyW': kf = v; break; case 'KeyS': kb = v; break; case 'KeyA': kl = v; break; case 'KeyD': kr = v; break;
    case 'KeyE': ku = v; break; case 'KeyQ': kd = v; break; case 'ShiftLeft': case 'ShiftRight': ks = v; break;
    // the arrow keys swim too; tapping one twice quickly and holding it on the second tap is a sprint, like Shift
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
      const a = e.code === 'ArrowUp' ? 0 : e.code === 'ArrowDown' ? 1 : e.code === 'ArrowLeft' ? 2 : 3;
      if (a === 0) kf = v; else if (a === 1) kb = v; else if (a === 2) kl = v; else kr = v;
      if (v && !e.repeat) { ka = e.timeStamp - lastTap < 350 && lastKey === e.code ? 1 : 0; lastTap = e.timeStamp; lastKey = e.code; }
      if (!v && lastKey === e.code) ka = 0;
      break;
    }
    default: if (v && !e.repeat) {
      if (e.code === 'KeyH') { hud = !hud; hTot = 0; hPer = 1e9; info.textContent = ''; }
      else if (e.code === 'KeyM') mute();
      else if (e.code === 'KeyN') mm.style.visibility = mm.style.visibility ? '' : 'hidden';
      else if (e.code === 'Escape') ui(true);
      else if (e.code >= 'Digit1' && e.code <= 'Digit6') lookAt(...POSES[e.code.charCodeAt(5) - 49]);
      else if (e.code === 'Digit7') nurseTour();
      else if (e.code === 'Digit8') pupTour();
      else if (e.code === 'KeyT' && TUN.length) { const t = TUN[0]; for (let k = 0; k < 24; k++) { const an = k * 0.2618, cx = t[0] + cos(an) * 8, cz = t[2] + sin(an) * 8, cy = t[1] + 3.5; if (sdAt(cx, cy, cz) < -0.9) { fly = 0; F[VX] = F[VY] = F[VZ] = 0; lookAt(cx, cy, cz, t[0], t[1] - 1, t[2]); break; } } } // the tunnel's first shaft: in front of its mouth
      else if (e.code === 'KeyU' && WHALE) { fly = 0; F[VX] = F[VY] = F[VZ] = 0; whCool = 0; lookAt(WHALE[0], WHALE[1] + 2.5, WHALE[2], WHALE[0] + 5, WHALE[1] + 14, WHALE[2]); } // the whale spot: hold still there
      else if (e.code === 'KeyI') { fly = 0; F[VX] = F[VY] = F[VZ] = 0; torchGrace = 3; torchHold = 8.2; lookAt(-139, -50.4, 20.4, -120, -50.4, 28.6); } // glow fish: the tunnel's start, torch gathering time already counted
      else if (e.code === 'KeyO' && TUN.length) { const t = TUN[0]; fly = 0; F[VX] = F[VY] = F[VZ] = 0; lookAt(t[0], t[1] + 7, t[2] + 0.01, t[0], t[1] - 6, t[2]); } // the downdraft, from above its shaft
      else if (e.code === 'KeyP' && WHALE) { fly = 0; F[VX] = F[VY] = F[VZ] = 0; stillT = 61; shT = 0; lookAt(WHALE[0] + 8, WHALE[1] + 2.5, WHALE[2], WHALE[0], WHALE[1] + 2, WHALE[2]); } // the visiting shark: held still near the floor for a minute already
      else if (e.code === 'KeyV' && GP.length) { // seagulls: on the water 18 m from a perched pair, looking at it (they fly off if you go closer)
        fly = 0; F[VX] = F[VY] = F[VZ] = 0;
        let done = false;
        for (let tries = 0; tries < GP.length && !done; tries++) { const P = GP[(gullTour++ * 2) % GP.length];
        for (const R of [15, 18, 22, 27, 33, 40]) for (let k = 0; k < 24 && !done; k++) {
          const an = k * 0.2618, px = P[0] + cos(an) * R, pz = P[2] + sin(an) * R; let ok = sdAt(px, 2.8, pz) < -0.9 && sdAt(px, 10, pz) < -0.9;
          for (let q = 1; q < 7 && ok; q++) { const f = q / 8; if (sdAt(px + (P[0] - px) * f, 3 + (P[1] + 0.3 - 3) * f, pz + (P[2] - pz) * f) > -0.5) ok = false; }
          if (ok) { F[CX] = px; F[CY] = 2.8; F[CZ] = pz; lookAt(px, 3, pz, P[0], P[1] + 0.3, P[2]); done = true; gHold = F[TIME] + 12; }
        } }
      }
      else if (e.code === 'KeyJ' && GEY) { fly = 0; F[VX] = F[VY] = F[VZ] = 0; stillT = 21; lookAt(GX + 9, -3.5, GZ, GX + 20, -2, GZ); } // jellyfish ring: held still near the surface for 20 s already
      else if (e.code === 'KeyK' && GEY) { F[CX] = GX; F[CY] = 0.5; F[CZ] = GZ; F[VX] = F[VY] = F[VZ] = 0; F[PIT] = -0.9; startTrip(); } // the 400 km throw, from the geyser
      else if (e.code === 'KeyG' && GEY) { for (let k = 0; k < 24; k++) { const an = k * 0.2618, cx = GX + cos(an) * 7, cz = GZ + sin(an) * 7; if (sdAt(cx, GY + 2.7, cz) < -0.9 && groundAt(cx, cz, GY) < GY + 1) { fly = 0; F[VX] = F[VY] = F[VZ] = 0; lookAt(cx, GY + 2.7, cz, GX, GY + 3.2, GZ); break; } } } // the geyser easter egg: stand in front of it
    }
  }
};
// behind the menu only the stats and mute keys work
addEventListener('keydown', (e) => { if (menu && e.code !== 'KeyH' && e.code !== 'KeyM') return; if (e.code.startsWith('Arrow')) e.preventDefault(); sound(); key(e, 1); });
addEventListener('keyup', (e) => key(e, 0));
const release = () => { kf = kb = kl = kr = ku = kd = ks = ka = 0; tId = -1; tN = 0; };
const capture = () => { sound(); const p = canvas.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(() => canvas.requestPointerLock()).catch(() => 0); };
canvas.addEventListener('click', capture);
addEventListener('mousemove', (e) => { if (document.pointerLockElement === canvas) { mdx += e.movementX; mdy += e.movementY; } });
addEventListener('blur', release);
const touch = (e) => {
  e.preventDefault(); sound(); tN = e.touches.length;
  let f = null, first = false; for (let i = 0; i < tN; i++) if (e.touches[i].identifier === tId) f = e.touches[i];
  if (!f) { tId = -1; if (tN) { f = e.touches[0]; tId = f.identifier; first = true; } }
  if (f) {
    // the touch axes turn with the page when it lies on its side
    const x = rot.matches ? f.clientY : f.clientX, y = rot.matches ? -f.clientX : f.clientY, s = 1100 / min(innerWidth, innerHeight);
    if (first) { tx0 = x; ty0 = y; } else { mdx += (x - tx) * s; mdy += (y - ty) * s; } // the view follows the finger at once
    tx = x; ty = y;
  }
};
for (const n of ['touchstart', 'touchmove', 'touchend', 'touchcancel']) canvas.addEventListener(n, touch, { passive: false });

// ---------------------------------------------------------------- menu
// The scene keeps rendering (blurred by CSS) behind the menu. Esc, losing the mouse or the corner button open it.
let menu = true;
const bDive = $('d');
const ui = (m) => {
  if (dead) return;
  menu = m; body.className = m ? 'm' : document.pointerLockElement ? 'g p' : 'g';
  // focus the dive button so Enter works (delayed: it can't take focus while still hidden)
  if (m) { release(); setTimeout(() => menu && bDive.focus(), 100); } else document.activeElement.blur();
};
const go = () => {
  sound(); ui(false); bDive.textContent = 'Resume';
  // phones: go fullscreen and ask for landscape; where that is refused the CSS rotation still applies
  if (mob) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation.lock('landscape')).catch(() => 0);
  if (!mob) capture();
};
bDive.onclick = go; $('o').onclick = () => ui(true);
// detail buttons: the current level is lit, the others reload the page with theirs
$('q').querySelectorAll('button').forEach((b, i) => { if (i === 2 - LV) b.className = 'on'; else b.onclick = () => { keep('abyssal', 2 - i); location.reload(); }; });
document.addEventListener('pointerlockchange', () => ui(!document.pointerLockElement));

// draw the first frame and wait for the GPU to finish it (pipelines get compiled on first use) before the reveal
lookAt(...POSES[0]);
await say('Letting the light in…', 1, 400);
render(); await Q.onSubmittedWorkDone();
setTimeout(keep, 15e3, 'abyssalLoad', ''); // the load counts as survived after 15 s of frames
ui(true);
requestAnimationFrame((t) => { F[LAST] = t; requestAnimationFrame(frame); });
