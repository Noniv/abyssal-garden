// ============================================================================
// WGSL sources
// ============================================================================

const W_NOISE = /*wgsl*/`
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn h31(p: vec3f) -> f32 { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
fn h33(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
fn vn(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(mix(h31(i), h31(i + vec3f(1., 0., 0.)), u.x), mix(h31(i + vec3f(0., 1., 0.)), h31(i + vec3f(1., 1., 0.)), u.x), u.y),
             mix(mix(h31(i + vec3f(0., 0., 1.)), h31(i + vec3f(1., 0., 1.)), u.x), mix(h31(i + vec3f(0., 1., 1.)), h31(i + vec3f(1., 1., 1.)), u.x), u.y), u.z);
}
fn fbm(p: vec3f, n: i32) -> f32 {
  var a = .5; var s = 0.; var q = p;
  for (var i = 0; i < n; i++) { s += a * vn(q); q = q * 2.03 + vec3f(17.1, 31.7, 5.3); a *= .5; }
  return s / (1. - 2. * a);
}
fn wor(p: vec3f) -> f32 {
  let i = floor(p); let f = fract(p); var d = 9.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let r = o + h33(i + o) - f; d = min(d, dot(r, r));
  } } }
  return sqrt(d);
}
`;

// ---------------------------------------------------------------- terrain density (compute)
const W_DENS = W_NOISE + /*wgsl*/`
struct U { n: vec4u, o: vec4f, c: vec4u };
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> D: array<f32>;
@group(0) @binding(2) var<storage, read> P: array<vec4f>;
fn smax(a: f32, b: f32, k: f32) -> f32 { let h = max(k - abs(a - b), 0.) / k; return max(a, b) + h * h * k * .25; }
fn smin(a: f32, b: f32, k: f32) -> f32 { return -smax(-a, -b, k); }
fn seg2(p: vec2f, a: vec2f, b: vec2f) -> f32 { let pa = p - a; let ba = b - a; let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.); return length(pa - ba * h); }
fn seg3(p: vec3f, a: vec3f, b: vec3f) -> f32 { let pa = p - a; let ba = b - a; let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0., 1.); return length(pa - ba * h); }
fn dens(p: vec3f) -> f32 {
  let w = vec3f(fbm(p * .04 + 11., 3), fbm(p * .04 + 47., 3), fbm(p * .04 + 83., 3)) - .5;
  let q = p + w * vec3f(15., 6., 15.);
  let g0 = -45.5 + 7. * (fbm(vec3f(q.xz * .011, 3.), 4) - .5) + 1.6 * (fbm(vec3f(q.xz * .07, 9.), 3) - .5);
  let tn = 3. * (fbm(vec3f(q.xz * .09, 2.), 3) - .5);
  var dm = -1e3; var de = 1e3;
  var k = 0u;
  for (var i = 0u; i < u.c.x; i++) {
    let a = P[k]; let b = P[k + 1u]; k += 2u;
    let yr = clamp((p.y - g0) / (b.y - g0), 0., 1.3);
    var e = seg2(q.xz, a.xy, a.zw) - b.x;
    e -= b.z * ss(.3, .92, yr) + 3. * (1. - yr) * (1. - yr) - b.w * ss(.0, .5, yr) * (1. - ss(.5, 1., yr));
    dm = smax(dm, smin(-e, b.y + tn - p.y, 3.), 2.5);
    de = min(de, e);
  }
  var clr = 0.;
  let kc = (u.c.x + u.c.y + u.c.z) * 2u;
  for (var i = 0u; i < u.c.w; i++) {
    let a = P[kc + i * 2u]; let b = P[kc + i * 2u + 1u];
    clr = max(clr, 1. - ss(0., b.y, seg2(q.xz, a.xy, a.zw) - b.x));
  }
  let rad = length(p.xz) + w.x * 14.;
  let n = fbm(vec3f(q.xz * .0125, 1.7), 4);
  let ring = ss(156., 172., rad);
  let plat = max(ss(.5, .565, n) * (1. - clr), ring);
  let th = g0 + plat * mix(26. + 17. * fbm(vec3f(q.xz * .03, 5.), 2), 60., ring);
  var d = smax(g0 + 4.5 * ss(10., 0., de) - p.y, dm, 3.);
  d = smax(d, (th - p.y) * .7, 3.);
  k = u.c.x * 2u;
  for (var i = 0u; i < u.c.y; i++) {
    let a = P[k]; let b = P[k + 1u]; k += 2u;
    var r = p + w * 3. - a.xyz;
    let cs = cos(a.w); let sn = sin(a.w);
    r = vec3f(cs * r.x + sn * r.z, r.y / b.z, -sn * r.x + cs * r.z);
    d = smax(d, b.y - length(vec2f(length(r.xy) - b.x, r.z)), 1.5);
  }
  let hg = p.y - g0;
  let rk = mix(.25, 1., ss(.5, 5., hg));
  d += rk * ((.5 - wor(p * .17 + w * 2.)) * 3.4 + (.5 - wor(p * .41 + 7.)) * 1.3 + (fbm(p * .3, 3) - .5) * 2.2);
  d += rk * 2.2 * (abs(fract(p.y * .21 + w.y * 2.2) - .5) - .25);
  for (var i = 0u; i < u.c.z; i++) {
    let a = P[k]; let b = P[k + 1u]; k += 2u;
    d = smin(d, seg3(p + w * 2., a.xyz, b.xyz) - a.w, 2.);
  }
  let tl = max(1. - ss(8., 16., distance(p.xz, vec2f(0., -106.))), 1. - ss(8., 16., distance(p.xz, vec2f(74., 14.))));  // two towers may stand well above the water
  return min(d, 3. + 8. * tl - p.y);
}
@compute @workgroup_size(4, 4, 4) fn main(@builtin(global_invocation_id) id: vec3u) {
  if (any(id >= u.n.xyz)) { return; }
  var d = dens(u.o.xyz + vec3f(id) * u.o.w);
  if (id.x == 0u || id.z == 0u || id.x == u.n.x - 1u || id.z == u.n.z - 1u || id.y == u.n.y - 1u) { d = -1.; }
  D[id.x + u.n.x * (id.y + u.n.y * id.z)] = d;
}
`;

// ---------------------------------------------------------------- fullscreen helpers
const W_FS = /*wgsl*/`
@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f { return vec4f(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0., 1.); }
`;

// rock detail texture (tileable): rg = slope, b = height, a = mottling
const W_DETAIL = W_NOISE + W_FS + /*wgsl*/`
fn hp(p: vec2f, per: f32) -> f32 { return h31(vec3f(p - per * floor(p / per), per)); }
fn tn(p: vec2f, per: f32) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(hp(i, per), hp(i + vec2f(1., 0.), per), u.x), mix(hp(i + vec2f(0., 1.), per), hp(i + vec2f(1., 1.), per), u.x), u.y);
}
fn tf(uv: vec2f, per: f32, n: i32) -> f32 { var a = .5; var s = 0.; var pr = per; for (var i = 0; i < n; i++) { s += a * tn(uv * pr + f32(i) * 7.3, pr); pr *= 2.; a *= .5; } return s / (1. - 2. * a); }
fn tw(p: vec2f, per: f32) -> vec3f {
  let i = floor(p); let f = fract(p); var d = vec2f(9.); var id = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) {
    let o = vec2f(f32(x), f32(y)); let c = i + o; let cw = c - per * floor(c / per);
    let hh = h33(vec3f(cw, per)); let r = o + hh.xy - f; let l = dot(r, r);
    if (l < d.x) { d.y = d.x; d.x = l; id = hh.z; } else if (l < d.y) { d.y = l; }
  } }
  return vec3f(sqrt(d), id);
}
fn H(uv: vec2f) -> f32 {
  let wq = uv + .11 * (vec2f(tf(uv, 3., 4), tf(uv + .5, 3., 4)) - .5);
  let f = tf(wq, 3., 8);
  let r1 = 1. - abs(tf(wq + 1.7, 5., 6) * 2. - 1.);
  let cr = min(abs(tf(wq + 4.1, 4., 5) * 2. - 1.) * 7., 1.);
  let cr2 = min(abs(tf(wq.yx + 2.3, 9., 4) * 2. - 1.) * 9., 1.);
  let pt = tw(wq * 29., 29.);
  let pit = (1. - ss(.0, .34, pt.x)) * step(.62, pt.z);
  return f * .50 + r1 * r1 * .24 + cr * cr2 * .26 - pit * .07;
}
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / 1024.; let e = 1. / 1024.;
  let h = H(uv);
  let gx = H(uv + vec2f(e, 0.)) - H(uv - vec2f(e, 0.)); let gy = H(uv + vec2f(0., e)) - H(uv - vec2f(0., e));
  let s = clamp(vec2f(gx, gy) * 1024. * .5 * .075, vec2f(-1.), vec2f(1.));
  return vec4f(-s * .5 + .5, h, tf(uv + 3.7, 3., 5));
}
`;

// blit / mip / bloom chain
const W_BLIT = W_FS + /*wgsl*/`
@group(0) @binding(0) var t: texture_2d<f32>;
@group(0) @binding(1) var s: sampler;
fn uvOf(fc: vec4f, k: f32) -> vec2f { return fc.xy * k / vec2f(textureDimensions(t)); }
@fragment fn fsMip(@builtin(position) fc: vec4f) -> @location(0) vec4f { return textureSampleLevel(t, s, uvOf(fc, 2.), 0.); }
fn kar(c: vec3f) -> vec4f { let w = 1. / (1. + max(c.r, max(c.g, c.b))); return vec4f(c * w, w); }
@fragment fn fsDown0(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  let a = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.).rgb, vec3f(24.)));
  let b = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.).rgb, vec3f(24.)));
  let c = kar(min(textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.).rgb, vec3f(24.)));
  let d = kar(min(textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.).rgb, vec3f(24.)));
  let m = a + b + c + d;
  return vec4f(m.rgb / m.a, 1.);
}
@fragment fn fsDown(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, 2.); let e = 1. / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
@fragment fn fsUp(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = uvOf(fc, .5); let e = .75 / vec2f(textureDimensions(t));
  return (textureSampleLevel(t, s, uv + e * vec2f(-1., -1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., -1.), 0.)
        + textureSampleLevel(t, s, uv + e * vec2f(-1., 1.), 0.) + textureSampleLevel(t, s, uv + e * vec2f(1., 1.), 0.)) * .25;
}
`;

// animated water texture: r = caustic, ba = surface slope
const W_WATER = W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> tm: vec4f;
fn caus(uv: vec2f, t: f32) -> f32 {
  let p = uv * 6.2831853;
  var i = p; var c = 0.;
  for (var n = 1; n <= 5; n++) {
    let tt = t * (1. - 3.5 / f32(n));
    i = p + vec2f(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    let s = sin(i.x + tt); let k = cos(i.y + tt);
    c += abs(s * k) / (1.25 * sqrt(s * s + k * k) + 1e-4);
  }
  c = 1.17 - pow(c / 5., 1.4);
  return pow(abs(c), 8.);
}
const WK = array<vec3f, 10>(vec3f(1., 2., 1.), vec3f(-2., 1., .9), vec3f(3., 1., .6), vec3f(1., -4., .5), vec3f(4., 3., .4),
  vec3f(-3., 5., .32), vec3f(6., -2., .28), vec3f(5., 7., .2), vec3f(-8., 3., .18), vec3f(2., 11., .14));
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let uv = fc.xy / ${WATER}.; let t = tm.x;
  let c = caus(uv, t * .45 + 23.);
  let wu = uv + .02 * vec2f(sin(6.2831853 * (uv.y * 2. + .1 * t)), cos(6.2831853 * (uv.x * 3. - .07 * t)));
  var s = vec2f(0.);
  for (var i = 0; i < 10; i++) {
    let k = WK[i];
    s += k.xy * k.z * cos(dot(k.xy, wu) * 6.2831853 + t * (.5 + .35 * sqrt(length(k.xy))) * select(-1., 1., (i & 1) == 0) + f32(i) * 1.7);
  }
  return vec4f(c, c, s * .06);
}
`;

// ---------------------------------------------------------------- shared scene code
const S_G = /*wgsl*/`
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f, tor: vec4f, mot: vec4f, rot: vec4f };
const SIG = vec3f(.058, .0235, .0195);
const KD = vec3f(.056, .0245, .0170);
const WCOL = vec3f(.16, .58, .90);
const KDZ = vec3f(.034, .023, .018);
const PCOL = vec3f(.58, .66, .98);
const SUNC = vec3f(1.7, 1.6, 1.45);
const TAU = 6.2831853;
const LOW = ${LV > 1};
fn sat(x: f32) -> f32 { return clamp(x, 0., 1.); }
fn ss(a: f32, b: f32, x: f32) -> f32 { let t = clamp((x - a) / (b - a), 0., 1.); return t * t * (3. - 2. * t); }
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(.06711056, .00583715)))); }
fn hs(x: f32) -> f32 { return fract(sin(x * 127.1) * 43758.5453); }
fn kd(z: f32) -> vec3f { return mix(KD, KDZ, z); }
fn sg(z: f32) -> vec3f { return mix(SIG, vec3f(.034, .026, .022), z); }
fn fin(c: vec3f) -> vec4f { return vec4f(min(max(c, vec3f(0.)), vec3f(40.)), 1.); }
const KDF = vec3f(.043, .045, .042);
fn fogIn(ro: vec3f, rd: vec3f, d: f32, z: f32, sun: vec3f) -> vec3f {
  let k = mix(KD, KDF, z);
  let a = sg(z) - k * rd.y;
  let I = (1. - exp(-a * d)) / a;
  let mu = max(dot(rd, sun), 0.);
  let m2 = mu * mu;
  return mix(WCOL, PCOL, z) * sg(z) * exp(k * ro.y) * I * (1.22 + .3 * m2 * m2);
}
// the sea: ten travelling waves, sharp crests and flat troughs, at the real deep-water speed (angle, wavelength, half height);
// waves too fine for the pixels at this distance fade out. Returns (height, dh/dx, dh/dz, crest 0..1)
const WV = array<vec3f, 10>(vec3f(.40, 58., .45), vec3f(-.55, 37., .28), vec3f(.10, 23., .16), vec3f(.95, 15., .10),
  vec3f(.30, 9.5, .06), vec3f(-.75, 6.2, .035), vec3f(1.2, 4.1, .02), vec3f(-.1, 2.7, .012), vec3f(.7, 1.7, .007), vec3f(-1.0, 1.1, .004));
fn swell(p: vec2f, t: f32, d: f32) -> vec4f {
  var r = vec4f(0.); var tot = 1e-4; let fp = d * .0035;
  for (var i = 0; i < 10; i++) {
    let w = WV[i]; let dir = vec2f(cos(w.x), sin(w.x)); let k = TAU / w.y;
    let th = k * dot(dir, p) - sqrt(9.81 * k) * t + f32(i) * 2.3;
    let a = w.z * ss(fp * 6., fp * 14., w.y); let e = exp(sin(th) - 1.);
    let dh = a * e * cos(th) * k;
    r += vec4f(a * (e - .467), dir.x * dh, dir.y * dh, a * e); tot += a;
  }
  return vec4f(r.xyz, r.w / tot);
}
`;

const S_B = S_G + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sC: sampler;
@group(0) @binding(3) var sS: sampler_comparison;
@group(0) @binding(4) var tSh: texture_depth_2d;
@group(0) @binding(5) var tW: texture_2d<f32>;
@group(0) @binding(6) var tD: texture_2d<f32>;
@group(0) @binding(7) var tV: texture_3d<f32>;
@group(0) @binding(8) var tM: texture_2d<f32>;
fn shUV(p: vec3f) -> vec3f { let s = g.sm * vec4f(p, 1.); return vec3f(s.x * .5 + .5, .5 - s.y * .5, s.z - .0007); }
fn shadow1(p: vec3f) -> f32 { let s = shUV(p); return textureSampleCompareLevel(tSh, sS, s.xy, s.z); }
fn shadow4(p: vec3f) -> f32 {
  let s = shUV(p); let e = 1.8 / ${SHADOW}.;
  return (textureSampleCompareLevel(tSh, sS, s.xy + vec2f(-e, -e), s.z) + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(e, -e), s.z)
        + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(-e, e), s.z) + textureSampleCompareLevel(tSh, sS, s.xy + vec2f(e, e), s.z)) * .25;
}
fn shadow9(p: vec3f) -> f32 {
  if (LOW) { return shadow1(p); }
  let s = shUV(p); let e = 2.1 / ${SHADOW}.; var a = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { a += textureSampleCompareLevel(tSh, sS, s.xy + vec2f(f32(x), f32(y)) * e, s.z); } }
  return a / 9.;
}
fn cuv(p: vec3f) -> vec2f { return p.xz - g.sun.xz * (p.y / g.sun.y); }
fn caus(p: vec3f, d: f32) -> vec3f {
  let q = cuv(p);
  let o = vec2f(.004, .0025);
  let a = vec3f(textureSample(tW, sR, q / 3.3 + o).r, textureSample(tW, sR, q / 3.3).r, textureSample(tW, sR, q / 3.3 - o).r);
  let b = textureSample(tW, sR, q.yx / 6.9 + .37).r;
  let c = min(pow(a, vec3f(2.3)) * 5. * (.45 + b * 1.3), vec3f(4.));
  return mix(mix(c, vec3f(.33), ss(35., 100., d)), vec3f(.33), ss(-.3, .3, p.y));
}
fn caus2(p: vec3f, d: f32) -> f32 {
  let q = cuv(p);
  let c = min(pow(textureSample(tW, sR, q / 4.1).r, 1.4) * 2.6 * (.45 + textureSample(tW, sR, q.yx / 6.9 + .37).r * 1.3), 2.6);
  return mix(mix(c, .33, ss(35., 100., d)), .33, ss(-.3, .3, p.y));
}
fn nh(p: vec2f) -> vec2f { return fract(sin(vec2f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)))) * 43758.5453); }
fn cnet(q: vec2f, t: f32) -> f32 {
  let ip = floor(q); let fp = q - ip;
  var d1 = 9.; var d2 = 9.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let o = vec2f(f32(x), f32(y)); let h = nh(ip + o);
    let r = o + .5 + .36 * sin(t * (1.6 + h.yx * 1.8) + 6.2831853 * h) + .16 * sin(t * (3.4 + h * 2.6) + 40. * h.yx) - fp;
    let d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  } }
  let e = sqrt(d2) - sqrt(d1);
  return exp(-e * 7.) * (.55 + .45 * exp(-sqrt(d1) * 1.2));
}
fn caus3(p: vec3f, d: f32) -> f32 {
  var q = cuv(p) + vec2f(sin(p.z * .9 + g.cam.w * .9), cos(p.x * .8 - g.cam.w * .75)) * .16;
  q += vec2f(sin(q.y * 7.3 + g.cam.w * 1.7) + .6 * sin(q.y * 13.1 - g.cam.w * 2.3), cos(q.x * 6.7 - g.cam.w * 1.9) + .6 * cos(q.x * 15.3 + g.cam.w * 2.1)) * .035;
  let a = cnet(q * 1.35 + vec2f(g.cam.w * .12, 0.), g.cam.w * 1.5);
  let b = cnet(q * .6 + vec2f(3.7, g.cam.w * -.1), g.cam.w * 1.1 + 5.);
  let br = .78 + .22 * sin(q.x * 11. + sin(q.y * 9. + g.cam.w * 1.3) * 2. + g.cam.w) * sin(q.y * 8.3 - q.x * 3. - g.cam.w * .8);
  return (a * .75 + b * .6) * br * (1. - ss(35., 100., d)) * (1. - ss(-.3, .3, p.y));
}
fn sunE(y: f32, z: f32) -> vec3f { return SUNC * exp(kd(z) * (min(y, 0.) / g.sun.y)) * (.5 + .5 * sat(-y / 30.)); }
fn vol(p: vec3f) -> vec4f { return textureSampleLevel(tV, sC, (p - vec3f(-192., -56., -192.)) / vec3f(384., 72., 384.), 0.); }
fn amb(p: vec3f, n: vec3f, sky: f32, z: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return mix(vec3f(.22, .60, .80), vec3f(.34, .56, .82), z) * exp(kd(z) * min(p.y, 0.) * 1.2) * (.3 + .7 * sky) * (.24 + .76 * up * up) * 1.3 * (.55 + .45 * sat(-p.y / 30.)) + vec3f(.003, .010, .016);
}
fn zone(p: vec3f) -> f32 { return mix(g.sun.w, textureSampleLevel(tM, sC, p.xz / 384. + .5, 0.).b, .2); }
fn side(p: vec3f, n: vec3f, open: f32, z: f32) -> vec3f { return mix(WCOL, PCOL, z) * exp(kd(z) * min(p.y, 0.)) * open * (1. - abs(n.y)) * .7; }
// tunnel darkness at a point (the volume's b channel) and the torch (the camera's light: a cone with a falloff). g.tor.x is the
// torch switch (0..1), g.tor.y the darkness at the camera itself
fn dkAt(p: vec3f) -> f32 { return textureSampleLevel(tV, sC, (p - vec3f(-192., -56., -192.)) / vec3f(384., 72., 384.), 0.).b; }
fn torchAt(p: vec3f, n: vec3f) -> f32 {
  let v = p - g.cam.xyz; let d = max(length(v), .1); let rd = v / d;
  let nd = select(.75, sat(dot(n, -rd)), dot(n, n) > .1);
  return g.tor.x * ss(.6, .85, dot(rd, g.fwd.xyz)) * (1. / (1. + d * d * .03)) * ss(36., 14., d) * (.3 + .7 * nd) * 3.4;
}
// how much of its normal light a thing at p keeps: all of it in the open, almost none deep in a tunnel except where the torch hits
fn dkLit(p: vec3f) -> f32 { return 1. - .97 * dkAt(p) * (1. - sat(torchAt(p, vec3f(0.)) * .5)); }
fn fog(c: vec3f, wp: vec3f, z: f32) -> vec3f { return fogRaw(c * dkLit(wp), wp, z); }
// skylight at most 150 m along the ray: past that, terrain and the background behind it (vsB) get the same haze
fn fogRaw(c: vec3f, wp: vec3f, z: f32) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let rd = v / d;
  // water inside a tunnel is as dark as the rock: haze counts for what the ray crosses of the dark (~14 m near either end)
  let hm = 1. - .96 * sat((g.tor.y + dkAt(wp)) * min(1., 14. / d));
  if (g.cam.y > 0.) {
    // camera above the water: clear air with a touch of haze; the water's haze only starts where the ray enters it
    if (wp.y >= 0.) { let hk = ss(25., 120., g.cam.y); return mix(vec3f(.85, 1.2, 1.7) * (1. - .35 * hk), c, exp(-d * .0012 * (1. - .8 * hk))); } // (from high up the air is clearer, so the rock keeps its colour)
    let t0 = g.cam.y / (g.cam.y - wp.y); let e = g.cam.xyz + v * t0; let dw = d * (1. - t0);
    return c * exp(-sg(z) * dw) * ss(230., 185., dw) + fogIn(e, rd, dw, z, g.sun.xyz) * (.58 + .42 * mix(1., vol(e + rd * min(dw, 150.)).g, 1. - ss(170., 192., max(abs(e.x + rd.x * min(dw, 150.)), abs(e.z + rd.z * min(dw, 150.)))))) * hm; // (past the volume's edge its texels must not be stretched over the open sea)
  }
  return c * exp(-sg(z) * d) * ss(230., 185., d) + fogIn(g.cam.xyz, rd, d, z, g.sun.xyz) * (.58 + .42 * vol(g.cam.xyz + rd * min(d, 150.)).g) * hm;
}
fn qrot(q: vec4f, v: vec3f) -> vec3f { return v + 2. * cross(q.xyz, cross(q.xyz, v) + q.w * v); }
`;

// ---------------------------------------------------------------- solid meshes (terrain, rocks, set pieces, sponges, coral)
const W_SOLID = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) on: vec3f,
  @location(4) @interpolate(flat) m: vec4f, @location(5) @interpolate(flat) q: vec4f, @location(6) ao: f32 };
@vertex fn vs(i: VI) -> VO {
  var o: VO;
  var sc = i.a.w;
  if (i.c.x < 1.5 && i.c.z > 1.5 && g.res.x > 0.) { sc *= 1. - ss(i.c.z * .7, i.c.z, distance(i.a.xyz, g.cam.xyz) / g.mis.z); }
  var lp = i.p * sc; let mm = i.c.x;
  if (mm > 9.5 && mm < 10.5) { // a garden eel: sways in the current, and sinks into the sand when you come close
    lp.y *= mix(.08, 1., ss(2.2, 6., distance(i.a.xyz, g.cam.xyz)));
    let sw = vec2f(sin(g.cam.w * .8 + i.c.y * 30. + lp.y * 3.), cos(g.cam.w * .7 + i.c.y * 20. + lp.y * 2.5)) * .06 * i.n.w * i.n.w * sc;
    lp = vec3f(lp.x + sw.x, lp.y, lp.z + sw.y);
  }
  if (mm > 11.5 && mm < 12.5) { let sw = vec2f(sin(g.cam.w * 1.1 + i.c.y * 9. + lp.y * 9.), cos(g.cam.w * .9 + i.c.y * 11. + lp.y * 8.)) * .035 * i.n.w * sc; lp = vec3f(lp.x + sw.x, lp.y, lp.z + sw.y); } // anemone tentacles
  var w = i.a.xyz + qrot(i.b, lp);
  w.y += sin(g.cam.w * .3 + i.c.y * 40.) * i.c.w;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = qrot(i.b, i.n.xyz); o.op = i.p * i.a.w + i.c.y * 37.; o.on = i.n.xyz;
  o.m = i.c; o.q = i.b; o.ao = i.n.w;
  return o;
}
struct TP { h: f32, c: f32, n: vec3f };
fn tri(p: vec3f, n: vec3f, s: f32) -> TP {
  var w = pow(abs(n), vec3f(4.)); w /= (w.x + w.y + w.z);
  let x = textureSample(tD, sR, p.zy * s); let y = textureSample(tD, sR, p.xz * s); let z = textureSample(tD, sR, p.xy * s);
  var o: TP;
  o.h = x.b * w.x + y.b * w.y + z.b * w.z;
  o.c = x.a * w.x + y.a * w.y + z.a * w.z;
  let a = x.rg * 2. - 1.; let b = y.rg * 2. - 1.; let c = z.rg * 2. - 1.;
  o.n = vec3f(0., a.y, a.x) * w.x + vec3f(b.x, 0., b.y) * w.y + vec3f(c.x, c.y, 0.) * w.z;
  return o;
}
@fragment fn fs(i: VO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let mat = i32(i.m.x + .5); let sd = i.m.y; let fl_ = select(-1., 1., ff);
  let on = normalize(i.on) * fl_; let n0 = normalize(i.n) * fl_;
  let dist = length(i.wp - g.cam.xyz);
  let ts = select(1., i.m.z, mat >= 2);
  let A = tri(i.op, on, .1 * ts); let B = tri(i.op, on, .43 * ts); let C = tri(i.op, on, 1.9 * ts); let F = tri(i.op, on, 6.7 * ts); let fk = ss(10., 1.5, dist) * f32(mat <= 1);
  let Wd = textureSample(tD, sR, vec2f(i.op.x * .06, (i.op.y + i.op.z) * .7));
  let big = textureSample(tD, sR, i.op.xz * .013 + i.op.y * .021).a;
  let big2 = textureSample(tD, sR, i.op.zx * .031 + i.op.y * .043 + .37).a;
  var sgro = 0.;
  let sk = textureSample(tD, sR, vec2f((i.op.x + i.op.z) * .33, i.op.y * .035));
  let sk2 = textureSample(tD, sR, vec2f((i.op.x - i.op.z) * 1.1, i.op.y * .11));
  let gm = textureSample(tM, sC, i.wp.xz / 384. + .5);
  let ca = caus(i.wp, dist);
  let hgt = A.h * .5 + B.h * .35 + C.h * .15;
  var bump = 1.7; var gloss = .1; var alb = vec3f(0.); var emi = vec3f(0.); var vao = 1.; var flu = 0.;
  let flt = ss(.72, .93, n0.y);
  if (mat <= 1) {
    // layered rock: grey / olive / brown beds, warm encrustation patches, algae on up-facing parts
    let st = i.op.y * .55 + A.h * 1.6 + big * 5. + big2 * 3.;
    let bed = hs(floor(st)); let sf = fract(st);
    alb = mix(vec3f(.11, .12, .13), vec3f(.33, .30, .25), sat(A.c * 1.5 - .25));
    alb = mix(alb, mix(vec3f(.26, .19, .10), vec3f(.20, .22, .14), bed), ss(.42, .66, big) * .7);
    alb *= mix(.72, 1.15, bed) * (1. - .45 * ss(.12, .0, sf) * (1. - abs(on.y)));
    let enc = ss(.46, .6, big2 * .6 + B.c * .5) * ss(.3, .6, hgt);
    alb = mix(alb, mix(vec3f(.34, .07, .10), vec3f(.40, .25, .07), ss(.45, .6, A.c)) * (.5 + .8 * B.h), enc * .75);
    alb = mix(alb, vec3f(.50, .50, .46) * (.5 + .7 * C.h), ss(.60, .70, B.c * .6 + C.c * .5) * .5);
    let alg = ss(-.1, .6, n0.y) * ss(.3, .52, B.c * .55 + big * .5);
    alb = mix(alb, vec3f(.035, .14, .07), alg * .8);
    alb *= (.22 + 1.3 * hgt) * mix(1., .62 + .76 * F.h, fk);
    sgro = -ss(.14, .0, sf) * (1. - abs(on.y)) * 1.2;
    if (mat == 0) {
      alb = mix(alb, vec3f(.13, .15, .14) * (.55 + .6 * B.h), flt * gm.a * .7);
      let mg = flt * sat(gm.r * 1.5 - .45 + (B.c - .5) * 1.6) * ss(.35, .6, A.h) * ss(-34., -40., i.wp.y);
      alb = mix(alb, vec3f(.20, .02, .12) * (.4 + .9 * B.h), mg * .8);
      flu = mg * .35;
      alb = mix(alb, alb * vec3f(.85, .8, 1.4) + vec3f(.015, .0, .05), gm.b * .8);
    }
  } else if (mat == 2) {
    // whale fluke: smooth pale stone with dark streaks running along its length
    alb = mix(vec3f(.42, .47, .48), vec3f(.10, .13, .15), ss(.40, .62, sk.a * .6 + sk2.b * .5)) * (.75 + .3 * B.h);
    alb = mix(alb, vec3f(.60, .64, .62), ss(.62, .75, sk2.a) * .5);
    gloss = .9; bump = .3;
  } else if (mat == 3) {
    alb = mix(vec3f(.13, .085, .05), vec3f(.36, .25, .14), Wd.b) * (.6 + .5 * B.h);
    let pk = fract(atan2(i.op.z, 2. - i.op.y) * 7.);
    alb *= .35 + .65 * ss(0., .12, min(pk, 1. - pk));
    alb = mix(alb, vec3f(.08, .22, .16), ss(.5, .7, A.c) * .6);
    gloss = .2; bump = .7;
  } else if (mat == 4) {
    let hue = fract(sd * 7.31);
    alb = mix(vec3f(.60, .17, .08), vec3f(.64, .35, .10), fract(hue * 3.));
    if (hue > .75) { alb = vec3f(.44, .18, .42); }
    alb *= (.45 + .75 * B.h) * (.7 + .3 * C.h);
    vao = i.ao * i.ao; gloss = .2; bump = 1.4; flu = .55;
  } else if (mat == 6) { // sea urchin: black-violet with a faint sheen
    alb = mix(vec3f(.025, .015, .035), vec3f(.075, .035, .085), A.c); gloss = .5; bump = .4;
  } else if (mat == 7) { // starfish: orange-red, dotted
    alb = mix(vec3f(.8, .22, .07), vec3f(.85, .45, .12), fract(sd * 3.7)); alb = mix(alb, vec3f(.95, .85, .7), ss(.6, .75, A.c) * .5); alb *= .7 + .6 * B.h; bump = 1.6; gloss = .15;
  } else if (mat == 8) { // shell: cream with brown ribs
    alb = mix(vec3f(.82, .74, .62), vec3f(.46, .3, .2), ss(.4, .6, fract(i.op.x * 55.)) * .5 + .15 * A.c); bump = .8; gloss = .35;
  } else if (mat == 9) { // sea cucumber: dark olive-brown, warty
    alb = mix(vec3f(.12, .09, .05), vec3f(.28, .2, .1), A.c * .7 + F.h * .3) * (.7 + .6 * B.h); bump = 2.2; gloss = .25;
  } else if (mat == 10) { // garden eel: pale with dark blotches
    alb = mix(vec3f(.82, .76, .6), vec3f(.18, .13, .08), ss(.55, .7, A.c) * .85); gloss = .3; bump = .5;
  } else if (mat == 11) { // brain coral: green-tan with winding dark grooves
    let gv = 1. - ss(.0, .07, abs(A.c - .5));
    alb = mix(vec3f(.46, .5, .3), vec3f(.1, .12, .06), gv) * (.8 + .4 * B.h); bump = 1.2; flu = .2;
  } else if (mat == 12) { // anemone: soft pale pink tentacles with violet tips
    alb = mix(vec3f(.88, .62, .56), vec3f(.55, .2, .72), i.ao * i.ao); flu = .6; gloss = .3; bump = .3;
  } else if (mat == 13) { // table coral: dull cream underneath, mauve or green on top
    alb = mix(vec3f(.55, .45, .26), mix(vec3f(.42, .55, .34), vec3f(.58, .3, .52), fract(sd * 4.1)), ss(-.2, .5, n0.y)) * (.17 + .25 * B.h); bump = .9; gloss = .03; flu = 0.;
  } else {
    let hue = fract(sd * 5.73);
    alb = mix(vec3f(.80, .08, .10), vec3f(.90, .22, .40), fract(hue * 4.));
    if (hue > .7) { alb = vec3f(.88, .42, .10); }
    if (hue > .9) { alb = vec3f(.55, .22, .75); }
    alb *= (.4 + .8 * B.h) * (.5 + .9 * i.ao * i.ao);
    alb = mix(alb, vec3f(1., .75, .6), ss(.8, 1., i.ao) * .35);
    emi = alb * .01; flu = .75; gloss = .25; bump = 1.5;
  }
  // sediment: low, flat, sandy ground is sand and silt (rock stays on slopes and high up). The ripples run across the current (the same
  // direction that drifts you), steeper on the lee side, wandering a little, and their crests shift with the view (cheap parallax)
  let sedK = select(0., ss(.8, .95, n0.y) * (.3 + .7 * gm.a) * ss(-16., -30., i.wp.y), mat <= 1);
  var rv = vec3f(0.);
  let rwarp = textureSample(tD, sR, i.wp.xz * .05).a - .5;
  let cq = cuv(i.wp) / 55. + vec2f(g.cam.w * .002, g.cam.w * .0012);
  let cn = .5 + .25 * sin(cq.x * 5.3 + sin(cq.y * 3.1) * 1.7) + .17 * sin(cq.y * 9.1 - cq.x * 4.3 + 1.3) + .08 * sin((cq.x + cq.y) * 17.);
  let cloudSh = 1. - .12 * ss(.5, .68, cn) * ss(-32., -4., i.wp.y);
  if (sedK > 0.) {
    let grain = A.c * .5 + F.h * .5;
    var sand = mix(vec3f(.26, .22, .15), vec3f(.46, .40, .29), grain) * (.9 + .2 * B.h);
    sand = mix(sand, vec3f(.1, .09, .07), ss(.8, .9, F.c) * .5);                               // dark grains
    sand = mix(sand, sand * vec3f(.62, .6, .58), ss(.45, .7, big2) * .55);                       // patches of darker silt
    let fd = vec2f(.8, .6); let Vp = normalize(g.cam.xyz - i.wp);
    var rph = dot(i.wp.xz, fd) * 14.96 + rwarp * 7.;
    rph += dot(Vp.xz, fd) * 14.96 * .04 * (.5 + .5 * sin(rph));                                  // parallax
    let ph2 = rph + .6 * sin(rph);                                                               // steeper on the lee side
    let rf = ss(45., 8., dist) * sedK;
    rv = vec3f(fd.x, 0., fd.y) * cos(ph2) * .55 * rf;
    sand *= 1. + .12 * sin(ph2) * rf;
    alb = mix(alb, sand, sedK); gloss = mix(gloss, .04, sedK); bump = mix(bump, .4, sedK); flu = mix(flu, 0., sedK);
  }
  let N = normalize(qrot(i.q, normalize(on + (A.n * .85 + B.n * .65 + C.n * .45 * ss(60., 12., dist) + F.n * .5 * fk) * bump + vec3f(.8, sgro, .35) * vec3f(0., 1., 0.) + rv)));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let v1 = vol(i.wp + n0 * 1.5); let v2 = vol(i.wp + n0 * 4.5);
  let ao = (sat((v1.r - .5) * 8.) * .55 + sat((v2.r - .5) * 2.7) * .45) * vao * ss(.12, .6, hgt) * (1. - .6 * gm.g);
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * shadow9(i.wp + n0 * .35) * (1. - .4 * gm.g) * cloudSh;
  let ndl = sat(dot(N, L));
  let am = (amb(i.wp, N, v1.g, z) + side(i.wp, N, sat((v2.r - .5) * 2.7), z)) * ao;
  // rock out of the water is weathered brown, not bleached white by the sun
  let ab = ss(.1, 2.5, i.wp.y) * select(0., 1., mat <= 1);
  alb = mix(alb, mix(vec3f(.2, .13, .085), vec3f(.4, .29, .19), B.h) * (.75 + .5 * F.h), ab * .8);
  let ray = sedK * caus3(i.wp, dist); let cas = mix(ca, vec3f(.62), sedK);                                   // on sand the sun's pattern is soft and low in contrast
  let dl = E * ndl * (.10 + mix(vec3f(.33), mix(vec3f(.33), cas, 1. - .4 * sedK), ss(.1, .45, dot(n0, L))) * 2.5);
  var c = alb * (dl + am) + emi + alb * flu * dot(dl + am, vec3f(.1, .5, .5));
  c *= 1. - .3 * ab;
  c += E * ndl * ray * vec3f(.92, 1., 1.02) * 4.4 * (.5 + alb);                                  // light strings: the sun focused by the ripples, drawn on top of the sand
  let H = normalize(V + L);
  c += E * (.25 + ca) * pow(sat(dot(N, H)), mix(10., 70., gloss)) * gloss * ndl * 1.8;
  c += (amb(i.wp, reflect(-V, N), v1.g, z) + side(i.wp, reflect(-V, N), sat((v2.r - .5) * 2.7), z)) * ao * (.08 + gloss) * .6 * pow(1. - sat(dot(N, V)), 2.5);
  if (i.wp.y > -.7 && i.wp.y < 1.6) {
    // the waterline: rock just above the waves is dark and wet, and a ring of foam rides up and down it with the swell
    let dy = i.wp.y - swell(i.wp.xz, g.cam.w, dist).x;
    let nz = textureSampleLevel(tD, sR, i.wp.xz * .8 + vec2f(g.cam.w * .03, 0.), 0.).b + .25 * sin(i.wp.x * 5. + i.wp.z * 3. + g.cam.w * 1.3);
    c *= 1. - .5 * ss(.8, .05, dy) * step(-.05, dy);
    let foam = ss(.5, .04, abs(dy + .05)) * ss(.2, .55, nz);
    c = mix(c, vec3f(.9, .94, .98) * (.3 + .7 * sat(dot(dl, vec3f(.33)))), foam * .85);
  }
  // inside a tunnel the rock gets only the torch: the usual lighting fades out and the torch adds light shaped by the real normal
  let dk = dkAt(i.wp);
  c = c * (1. - .97 * dk) + alb * dk * torchAt(i.wp, N) * vec3f(1., .93, .8) * (.5 + .5 * ao) * (.8 + .2 * F.h * 2.);
  return fin(fogRaw(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- leaves (kelp, grasses, ground cover)
const W_LEAF = S_B + /*wgsl*/`
override ROWS: f32 = 7.;
override FAR: f32 = 150.;
struct LI { @location(0) a: vec4f, @location(1) b: vec4f, @location(2) c: vec4f };
struct LO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) uv: vec2f,
  @location(3) @interpolate(flat) col: vec3f, @location(4) @interpolate(flat) pr: vec4f,
  @location(5) @interpolate(flat) sd: vec2f, @location(6) @interpolate(flat) spc: vec3f };
fn sway(p: vec2f, h: f32, t: f32) -> vec2f {
  let ph = dot(p, vec2f(.031, .017));
  let tide = sin(t * .21 + ph * .4);                                                  // the slow surge: everything leans one way, then the other
  let a = .024 * pow(max(h, 0.), 1.25) * (.8 + .5 * tide * tide);
  return vec2f(.009, .006) * pow(max(h, 0.), 1.25) * tide + a * (vec2f(sin(t * .5 + ph + h * .09), cos(t * .37 + ph * 1.3 + h * .07)) + .35 * vec2f(sin(t * 1.3 + ph * 3. + h * .3), cos(t * 1.1 + ph * 2. + h * .23)));
}
fn shape2(v: f32) -> f32 { return sin(3.14159 * sat(v)); }
fn pal(h: f32) -> vec3f {
  if (h < .3) { return vec3f(1., .62, .08); }
  if (h < .6) { return vec3f(.12, 1., .22); }
  if (h < .8) { return vec3f(.2, .85, 1.); }
  return vec3f(1., .3, .8);
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: LI) -> LO {
  var o: LO;
  let u = f32(vi & 1u) * 2. - 1.; let v = sin(f32(vi >> 1u) / (ROWS - 1.) * 1.5708);
  let ty = i32(i.c.x * 255. + .5); let s1 = i.c.y; let s2 = i.c.z;
  let t = g.cam.w;
  let len = i.a.w; let hA = i.b.w;
  let cy = cos(i.b.x); let sy = sin(i.b.x); let ct = cos(i.b.y); let st = sin(i.b.y);
  let d = vec3f(st * cy, ct, st * sy); let pe = vec3f(ct * cy, -st, ct * sy); let sd = vec3f(-sy, 0., cy);
  // per type: x sparkle prob, y translucency, z iridescence, w emissive
  var col = vec3f(0.); var pr = vec4f(0.); var spc = vec3f(0.); var shp = vec2f(.75, .7); var wav = 1.; var fls = 1.;
  let hsel = hs(s1 * 13.7 + s2 * 71.3);
  switch ty {
    case 0 { col = mix(vec3f(.11, .125, .022), vec3f(.04, .10, .04), s1); col = mix(col, vec3f(.25, .17, .025), step(.72, s2)); pr = vec4f(.24, .9, 0., 0.); spc = pal(hsel * .72); shp = vec2f(.5, .32); wav = 1.9; }
    case 1 { col = vec3f(.10, .11, .035); pr = vec4f(0., .2, 0., 0.); shp = vec2f(.05, .1); wav = .3; fls = .3; }
    case 2 { col = mix(vec3f(.05, .20, .16), vec3f(.12, .26, .22), s1); col = mix(col, vec3f(.30, .14, .24), step(.85, s2)); pr = vec4f(.05, 1.0, .25, 0.); spc = vec3f(.6, 1., .9); shp = vec2f(.45, .35); wav = 2.2; }
    case 3 { col = mix(vec3f(.02, .05, .065), vec3f(.05, .03, .08), s1); col = mix(col, vec3f(.09, .03, .09), step(.8, s2)); pr = vec4f(.2, .85, .55, .02); spc = mix(vec3f(.5, .35, 1.), vec3f(.2, 1., .7), step(.6, hsel)); shp = vec2f(.7, .6); wav = 2.4; }
    case 4 { col = mix(vec3f(.30, .15, .02), vec3f(.42, .25, .04), s1); pr = vec4f(.2, 1., .1, 0.); spc = vec3f(1., .85, .5); shp = vec2f(.5, .4); wav = 1.8; }
    case 5 { col = mix(vec3f(.85, .05, .40), vec3f(.60, .10, .80), step(.7, s1)); col = mix(col, vec3f(.95, .25, .55), step(.75, s2)); pr = vec4f(.22, .8, 0., .30); spc = vec3f(1., .35, .8); shp = vec2f(.6, .6); fls = 2.; }
    case 6 { col = mix(vec3f(.80, .16, .16), vec3f(.92, .36, .42), s1); pr = vec4f(.06, 1., 0., .10); spc = vec3f(1., .5, .5); shp = vec2f(.4, .3); wav = 2.; }
    default { col = mix(vec3f(.05, .40, .36), vec3f(.10, .52, .58), s1); pr = vec4f(.1, .9, .2, .04); spc = vec3f(.3, 1., .9); shp = vec2f(.6, .5); }
  }
  pr.x = step(hs(s1 * 91.7 + s2 * 37.1 + i.b.x), pr.x);
  let k = (i.c.w - .3) * 2.0 + sin(t * (.8 + s1) * fls + s2 * 40. + hA * .25) * .10 * fls;
  let wph = v * (3. + 5. * s2) + s1 * 30. + t * 1.1;
  let wv = sin(wph) * .12 * wav;
  let kq = k * 1.7; let ka = select(kq, .06, abs(kq) < .06);
  let sK = sin(ka * v); let cK = cos(ka * v);
  let c = i.a.xyz + len * (d * (sK / ka) + pe * ((1. - cK) / ka + wv * v));
  let sl = sK + wv + cos(wph) * .10 * wav * v * (3. + 5. * s2);
  let N = normalize(pe * cK - d * sl); let T0 = normalize(d * cK + pe * sl);
  let tw = (s1 - .5) * 2.4 * v + sin(t * .9 + s2 * 20.) * .25 * v;
  let S = sd * cos(tw) + N * sin(tw); let N2 = N * cos(tw) - sd * sin(tw);
  let shape = pow(max(sin(3.14159 * pow(v, shp.x)), 0.), shp.y);
  let shp_ = g.res.x == 0.;
  let cd = distance(i.a.xyz, g.cam.xyz); let far = FAR * g.mis.z;
  let nearK = select(1. - ss(26., 40., cd), 0., shp_);
  let farK = select((1. - ss(far * .8, far, cd)) * ss(.6, 2.2, distance(c, g.cam.xyz)) * ss(len * 1.1 + .5, len * 2.2 + 1.2, distance(i.a.xyz + d * (len * .5), g.cam.xyz)), 1., shp_);
  let ruf = sin(v * 10. + s2 * 30. + t * .6) * i.b.z * .36 * u * shape2(v) * nearK;
  var p = c + S * (u * farK * select(i.b.z * .5 * shape, select(max(i.b.z * .5, .09) * shape, 0., ty == 1), shp_));
  p += N2 * ruf;
  let sw = sway(i.a.xz, hA + (p.y - i.a.y), t);
  p.x += sw.x; p.z += sw.y;
  { // a swimmer pushes the plants aside: the whole plant leans away from them as one curve (nothing at the root, most at the tip),
    // and the wake drags and sways it. Everything is worked out from the plant's root, so each blade keeps its shape
    let rw = i.a.xz - g.cam.xz; let rd = length(rw); let hp = max(p.y - i.a.y, 0.); let hh = sat(hp * .3); let spd = min(g.mot.w / 4.5, 1.3);
    let prox = ss(6., .8, rd) * ss(7., 2., abs(p.y - g.cam.y));
    let dir = rw / max(rd, .15); let tg = vec2f(-dir.y, dir.x);
    let bend = hh * hh * (2. - hh);
    let fl = sin(t * 3.4 + i.a.x * 3. + i.a.z * 2. - hp * .5) * .5 + sin(t * 2.1 + i.a.z * 5. - hp * .3) * .3;
    let fw = normalize(g.fwd.xz + vec2f(1e-4)); let ahead = ss(.1, .9, dot(dir, fw));
    let pw = (dir * (.3 + 1.6 * spd) + tg * fl * .5 * spd + fw * .7 * spd * ahead) * prox * bend;
    p = vec3f(p.x + pw.x, p.y - dot(pw, pw) / (2. * max(hp, .4)), p.z + pw.y);
  }
  o.cp = g.vp * vec4f(p, 1.); o.wp = p; o.n = normalize(N2 + S * u * .55 - T0 * cos(v * 10. + s2 * 30. + t * .6) * u * .7 * nearK); o.uv = vec2f(u, v);
  o.col = col; o.pr = pr; o.sd = vec2f(s1, s2); o.spc = spc;
  return o;
}
struct GO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) col: vec3f };
@vertex fn vsGl(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> GO {
  var o: GO; let q = vec2f(f32(vi & 1u), f32(vi >> 1u)) * 2. - 1.; let t = g.cam.w;
  var p = a.xyz; let sw = sway(a.xz, a.w, t); p.x += sw.x; p.z += sw.y;
  p += .1 * vec3f(sin(t * .7 + b.x * 50.), sin(t * .9 + b.x * 70.), cos(t * .8 + b.x * 90.));
  let d = length(p - g.cam.xyz);
  if (d > 120. || dot(p - g.cam.xyz, g.fwd.xyz) < -1.) { o.cp = vec4f(0., 0., 2., 1.); return o; }
  let tw = pow(.5 + .5 * sin(t * (.35 + .9 * hs(b.x)) + b.x * 100.), 4.);
  let sz = min(max(b.z, d * .0026), d * .0045);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q;
  let z = zone(p);
  let lit = .3 + 1.8 * shadow1(p) * sunE(p.y, z).g;
  let e = b.z / sz;
  o.col = pal(b.y) * (.12 + tw * 1.7) * lit * e * e * exp(-SIG.g * d) * ss(.4, 1.5, d) * 17. * dkLit(p);
  return o;
}
@fragment fn fsGl(i: GO) -> @location(0) vec4f {
  let r = dot(i.uv, i.uv);
  return vec4f(min(i.col * exp(-r * 7.) * (1. - ss(.7, 1., r)), vec3f(10.)), 0.);
}
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus2(i.wp, dist);
  var n = normalize(i.n); if (!ff) { n = -n; }
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp);
  let lt = textureSample(tD, sR, vec2f(i.uv.x * .13 + i.sd.x * 3.7, i.uv.y * .8 + i.sd.y * 5.3));
  let vv = vol(i.wp + vec3f(0., .8, 0.));
  let E = sunE(i.wp.y, z) * shadow1(i.wp + L * .3);
  let ndl = dot(n, L);
  var alb = i.col * (.72 + .28 * ss(0., .25, abs(i.uv.x))) * mix(.5, 1.12, i.uv.y) * (1. - .45 * ss(30., 8., dist) * ss(.6, 1., sin(i.uv.y * 40. - abs(i.uv.x) * 7. + i.sd.x * 40.))) * (.58 + .42 * ss(0., .13, abs(i.uv.x))) * (.5 + 1.0 * lt.b) * (.65 + .7 * lt.a);
  let ndv = sat(dot(n, V));
  let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + i.sd.x * .22 + i.uv.y * .5 + .55));
  alb = mix(alb, alb * .5 + ir * vec3f(.15, .13, .30), i.pr.z * (1. - ndv) * .8);
  let tr = (max(-ndl, 0.) * .85 + .15) * i.pr.y;
  let trc = alb * mix(vec3f(1.), vec3f(1.5, 1.4, .75), sat(i.pr.y) * (1. - i.pr.z));
  let aov = sat((vv.r - .5) * 6.) * mix(.4, 1., i.uv.y);
  let am = (amb(i.wp, n, vv.g, z) + amb(i.wp, -n, vv.g, z) * i.pr.y * .55 * vec3f(1.1, 1.15, .7) + side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.3 + .7 * aov);
  var c = E * (.06 + ca * 1.5) * (alb * max(ndl, 0.) + trc * tr) + alb * am;
  let H = normalize(V + L);
  c += E * (pow(sat(dot(n, H)), 40.) * (.45 + ir * i.pr.z * 2.) + pow(sat(dot(n, H)), 9.) * .07) + am * ir * i.pr.z * pow(1. - ndv, 3.) * 1.5;
  c += E * trc * i.pr.y * pow(sat(dot(-V, L)), 3.) * 1.2;
  c += alb * i.pr.w * (.5 + 3. * dot(am + E * .3, vec3f(.1, .5, .5)));
  // sparkle: whole-leaf glints that twinkle slowly
  let tw = pow(.5 + .5 * sin(g.cam.w * (.5 + i.sd.y * 1.4) + i.sd.x * 90.), 5.);
  let m = ss(.2, .0, abs(i.uv.y - (.35 + .45 * i.sd.y))) * (1. - i.uv.x * i.uv.x);
  let lit = .35 + E.g * 1.2;
  c += i.spc * i.pr.x * (.1 + tw) * m * lit * .6;
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- fish + mantas
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32, @location(4) lt: f32 };
@vertex fn vsFish(i: VI) -> VO {
  var o: VO;
  let s = i.b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71));
  let R = i.a.w; let t = g.cam.w;
  let ta = t * i.b.y + i.b.w * 6.3 + (h.x - .5) * (26. / R);
  let ph = i.b.w * 17.;
  let ya = min(2.2, R * .35);
  let P = i.a.xyz + vec3f(R * cos(ta), ya * sin(3. * ta + ph), R * .6 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 3. * ya * cos(3. * ta + ph), R * .6 * cos(ta))) * sign(i.b.y);
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  let off = (S * ((h.y - .5) * 5. + sin(t * .6 + s * 40.) * .5) + Up * ((h.z - .5) * 3.2 + cos(t * .5 + s * 31.) * .4)) * min(1., R / 10.);
  var l = i.p * i.b.z * (.75 + .5 * h.z);
  l.z += sin(t * 9. + s * 50. + l.x * 5.) * .22 * (.25 * i.b.z - l.x);
  var c0 = P + off; let dc = c0 - g.cam.xyz; let dl = length(dc);
  c0 += dc / max(dl, .1) * 2.6 * ss(6., 1.2, dl);                                  // they shy away from a diver who comes close
  let w = c0 + T * l.x + Up * l.y + S * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = T * i.n.x + Up * i.n.y + S * i.n.z; o.op = i.p; o.sd = s + select(0., 10., i.b.w > 1.5) + select(0., 20., i.b.w > 3.);
  o.lt = shadow1(w);
  return o;
}
@fragment fn fsFish(i: VO) -> @location(0) vec4f {
  let n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let z = zone(i.wp); let vv = vol(i.wp);
  var alb = mix(vec3f(.50, .68, .80), vec3f(.10, .22, .40), ss(-.05, .2, i.op.y));
  alb = mix(alb, vec3f(.95, .8, .3), step(.86, fract(i.sd * 7.7)) * .6);
  if (i.sd > 25.) { // a reef fish: yellow tang, blue tang, damsel or anthias
    let sp = floor(fract(i.sd * 9.1) * 4.);
    if (sp < 1.) { alb = vec3f(1., .78, .05); }
    else if (sp < 2.) { alb = mix(vec3f(.04, .22, .95), vec3f(1., .85, .1), ss(-.2, -.3, i.op.x)); alb = mix(alb, vec3f(.02, .02, .08), ss(.0, .05, abs(i.op.y - .02)) * 0.); }
    else if (sp < 3.) { alb = mix(vec3f(.05, .45, 1.), vec3f(.02, .03, .12), ss(.0, .15, i.op.y) * .8); }
    else { alb = mix(vec3f(1., .3, .5), vec3f(1., .6, .15), ss(-.1, .12, i.op.y)); }
    alb = alb * (.85 + .3 * ss(.0, -.2, i.op.y));
  } else if (i.sd > 5.) { // a clownfish: orange with two white bands edged in black
    alb = vec3f(1., .38, .04);
    let band = max(ss(.035, .02, abs(i.op.x - .17)), ss(.035, .02, abs(i.op.x + .1)));
    alb = mix(alb, vec3f(.03, .02, .02), max(ss(.065, .04, abs(i.op.x - .17)), ss(.065, .04, abs(i.op.x + .1))) * .85);
    alb = mix(alb, vec3f(.95, .95, .92), band);
  }
  let E = sunE(i.wp.y, z) * i.lt;
  var c = alb * (E * (.25 + .75 * sat(dot(n, L))) + amb(i.wp, n, vv.g, z) * 1.3);
  c += E * pow(sat(dot(n, normalize(V + L))), 24.) * 1.6 + vec3f(.3, .6, .7) * pow(1. - sat(dot(n, V)), 3.) * .25 * vv.g;
  c += alb * E * caus2(i.wp, length(i.wp - g.cam.xyz)) * .4;
  return fin(fog(c, i.wp, z));
}
@vertex fn vsJelly(i: VI) -> VO {
  var o: VO; let t = g.cam.w; let k = i.b.x; let sz = i.a.w;
  let P = i.a.xyz + vec3f(sin(t * .05 + k * 20.) * 5. + sin(t * .13 + k * 7.) * 1.5, sin(t * .5 + k * 9.) * 1.4, cos(t * .045 + k * 13.) * 5. + cos(t * .11 + k * 5.));
  let au = i.n.w;
  let u = min(au, .5) * 2.; let tn = max(au - .5, 0.) * 2.;
  let pu = sin(t * 1.3 + k * 17.);            // the bell contracts (pu > 0) and relaxes
  let rf = 1. + .17 * pu * (.25 + .75 * u);
  var lp = vec3f(i.p.x * rf, i.p.y * (1. - .12 * pu * (1. - u)), i.p.z * rf);
  // tentacles and arms trail and ripple
  let ph = t * 1.1 + k * 5. - lp.y * 2.4;
  lp = vec3f(lp.x + sin(ph) * .16 * tn * tn, lp.y + .05 * pu * tn, lp.z + cos(ph * .9 + 1.3) * .16 * tn * tn);
  let yw = k * 6.3 + t * .08; let cs = cos(yw); let sn = sin(yw);
  let rl = vec3f(cs * lp.x - sn * lp.z, lp.y, sn * lp.x + cs * lp.z);
  let w = P + rl * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w;
  o.n = vec3f(cs * i.n.x - sn * i.n.z, i.n.y, sn * i.n.x + cs * i.n.z);
  o.op = vec3f(au, i.p.x, i.p.z); o.sd = k; o.lt = shadow1(w);
  return o;
}
@fragment fn fsJelly(i: VO) -> @location(0) vec4f {
  var n = normalize(i.n); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  if (dot(n, V) < 0.) { n = -n; }
  let z = zone(i.wp); let vv = vol(i.wp); let t = g.cam.w;
  let au = i.op.x; let isT = step(.5001, au); let u = min(au, .5) * 2.;
  let fr = pow(1. - sat(dot(n, V)), 2.5);
  let an = atan2(i.op.z, i.op.y + 1e-4);
  let canal = ss(.16, .0, abs(fract(an * 1.2732 + i.sd * 3.) - .5) - .3) * (1. - u * .5) * (1. - isT);   // 8 radial canals
  let gon = ss(.55, .2, length(vec2f(i.op.y, i.op.z))) * (1. - isT) * ss(.2, .6, 1. - u);                // the pale gonads
  var alb = mix(vec3f(.62, .56, .96), vec3f(.95, .5, .8), u * (1. - isT));
  alb = mix(alb, vec3f(.95, .75, .9), isT * .6);
  let E = sunE(i.wp.y, z) * i.lt;
  var c = alb * (E * (.2 + .5 * sat(dot(n, L))) + amb(i.wp, n, vv.g, z) * 1.1);
  c += alb * E * pow(sat(dot(-V, L)), 3.) * 1.2;                                                          // sunlight shining through
  c += vec3f(.9, .6, 1.) * (canal * .25 + gon * .35) * (E * .5 + .12);
  c += vec3f(.45, .35, .95) * ss(-12., -36., i.wp.y) * (.12 + .5 * fr + .35 * canal + .3 * isT * (.5 + .5 * sin(t * 2. + i.op.y * 40.)));
  c += vec3f(.5, .7, .9) * fr * .3 * vv.g;
  let a = clamp(mix(.24 + .5 * fr + canal * .2 + gon * .25, .55, isT), 0., .9);
  let f = min(max(fog(c, i.wp, z), vec3f(0.)), vec3f(30.));
  return vec4f(f * a, a);
}
@vertex fn vsShark(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let R = i.a.w; let sz = i.b.z;
  let ta = t * i.b.y + i.b.x;
  let P = i.a.xyz + vec3f(R * cos(ta), 1.6 * sin(1.5 * ta + i.b.w * 6.), R * .8 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 2.4 * cos(1.5 * ta + i.b.w * 6.), R * .8 * cos(ta))) * sign(i.b.y);
  var S = normalize(cross(vec3f(0., 1., 0.), T)); var Up = cross(T, S);
  let bank = -.1 * sign(i.b.y);
  let S2 = S * cos(bank) + Up * sin(bank); Up = Up * cos(bank) - S * sin(bank); S = S2;
  var l = i.p;
  // swimming: a lateral wave runs from head to tail, small at the head and growing towards the tail
  let q = clamp(.62 - l.z * .5, 0., 1.5); let amp = .015 + .15 * q * q;
  let ph = t * 2.3 + i.b.w * 40. - l.z * 2.6;
  l.x += amp * sin(ph);
  l.y += .012 * sin(t * .9 + i.b.w * 20.) * max(abs(i.p.x) - .15, 0.) * 4.; // pectorals flex gently
  let dx = -.15 * q * sin(ph) - 2.6 * amp * cos(ph); // d(l.x)/d(l.z), for the normals
  let th = atan(dx);
  let nl = vec3f(i.n.x * cos(th) + i.n.z * sin(th), i.n.y, -i.n.x * sin(th) + i.n.z * cos(th));
  let w = P + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * nl.x + Up * nl.y + T * nl.z; o.op = i.p; o.sd = i.b.w;
  o.lt = i.n.w; // shark: mouth / gill depth (0..1), -1 on teeth
  return o;
}
fn sharkShade(i: VO, pup: bool) -> vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus(i.wp, dist);
  let tx = textureSample(tD, sR, i.op.xz * 1.3 + i.sd);
  let ty = textureSample(tD, sR, i.op.zy * 3.1 + i.sd * 2.);
  let V = normalize(g.cam.xyz - i.wp);
  var nn = normalize(i.n); if (dot(nn, V) < 0.) { nn = -nn; }
  let n = normalize(nn + (vec3f(tx.r, ty.g, tx.g) - vec3f(.5)) * .22); let L = g.sun.xyz;
  let z = zone(i.wp); let vv = vol(i.wp);
  let p = i.op; let ax = abs(p.x);
  // countershading: slate grey above, white below, with a ragged boundary that dips towards the tail
  let edge = .12 + .25 * (tx.a - .5) + .12 * sin(p.z * 9. + ty.b * 3.) - .15 * ss(-.3, -.9, p.z);
  let top = ss(edge - .12, edge + .12, nn.y + (ty.a - .5) * .15);
  // (blacktip reef shark: brownish grey above, white below, a pale stripe along the flank)
  let back = select(mix(vec3f(.16, .185, .21), vec3f(.30, .33, .35), tx.b * .7 + ty.r * .3), mix(vec3f(.24, .22, .185), vec3f(.37, .34, .29), tx.b * .7 + ty.r * .3), pup);
  let belly = mix(vec3f(.80, .82, .82), vec3f(.62, .65, .68), ty.b * .4);
  var alb = mix(belly, back, top);
  // fins: pale undersides with dark tips and trailing edges
  // (the blacktip reef sharks: the first dorsal's tip jet black over a white band, black tips on the other fins too)
  let tipD = select(max(ss(.42, .56, p.y) * step(abs(p.z), .5), max(ss(.5, .7, ax) * step(p.y, -.2), ss(-1.15, -1.3, p.z) * .8)), ss(.44, .5, p.y) * step(abs(p.z), .5), pup);
  alb = mix(alb, select(vec3f(.05, .055, .07), vec3f(.008, .008, .01), pup), tipD * select(.5 + .5 * ss(0.2, 0.9, ty.a), 1., pup));
  if (pup) {
    let band = ss(.3, .35, p.y) * (1. - ss(.42, .45, p.y)) * step(abs(p.z), .5);                       // the white band under the black dorsal tip
    alb = mix(alb, vec3f(.9, .9, .88), band);
    let tips = max(ss(.4, .5, ax) * step(p.y, -.1), ss(-1.28, -1.4, p.z));                            // pectoral / pelvic tips, the tail's lobes
    alb = mix(alb, vec3f(.01, .01, .012), tips);
    alb = mix(alb, vec3f(.86, .86, .82), ss(.2, .0, abs(nn.y - .05)) * ss(-.9, -.2, p.z) * ss(.9, .5, p.z) * .35); // the pale flank stripe
  }
  // eyes, the inside of the mouth and gill slits (shaped in the mesh; i.lt says how deep), teeth
  alb *= 1. - .85 * ss(.017, .009, length(vec3f(ax - .126, p.y - .03, p.z - .8)));
  alb = mix(alb, vec3f(.012, .008, .01), sat(i.lt * 1.6) * .97);
  if (i.lt < -.5) { alb = vec3f(.74, .71, .64); }
  let E = sunE(i.wp.y, z) * shadow4(i.wp + n * .3);
  var c = alb * (E * sat(dot(n, L)) * (.3 + ca) + amb(i.wp, vec3f(n.x, abs(n.y) * .55 + .25, n.z), vv.g, z) * 1.1 + side(i.wp, n, 1., z) * .8);
  c += E * pow(sat(dot(n, normalize(V + L))), 40.) * .4 * (.3 + ca) * (1. - top * .4);
  let sky = amb(i.wp, vec3f(0., 1., 0.), vv.g, z);
  c += alb * sky * ca * .4 * (1. - top) + sky * pow(1. - sat(dot(n, V)), 3.) * .3 * (.12 + .88 * sat(dot(alb, vec3f(.33)) * 2.5)); // (the rim light must not lift black parts)
  return fin(fog(c, i.wp, z));
}
@fragment fn fsShark(i: VO) -> @location(0) vec4f { return sharkShade(i, false); }
@fragment fn fsPup(i: VO) -> @location(0) vec4f { return sharkShade(i, true); }
// blacktip reef sharks that swim along the sea floor: the CPU steers them, an instance is x, y, z, yaw | pitch, size, tail phase,
// turn rate, plus four sideways offsets (metres) of the body at 0.4, 0.8, 1.2 and 1.6 body lengths behind the middle: the body
// follows the trail the head left, so a turn bends it in an S: nose first, the rest after
struct VP { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
fn latAt(u: f32, c: vec4f) -> f32 { // sideways offset at u body lengths behind the middle (a smooth curve through the four stations)
  if (u <= 0.) { return 0.; }
  if (u >= 1.6) { return c.w; }
  let v = array<f32, 6>(0., 0., c.x, c.y, c.z, c.w);
  let s = u / .4; let k = i32(floor(s)); let t = s - f32(k);
  let p0 = v[k]; let p1 = v[k + 1]; let p2 = v[k + 2]; let p3 = v[min(k + 3, 5)];
  return .5 * (2. * p1 + (p2 - p0) * t + (2. * p0 - 5. * p1 + 4. * p2 - p3) * t * t + (3. * p1 - p0 - 3. * p2 + p3) * t * t * t);
}
@vertex fn vsPup(i: VP) -> VO {
  var o: VO;
  let sz = i.b.y; let cy = cos(i.a.w); let sy = sin(i.a.w); let cp = cos(i.b.x); let sp = sin(i.b.x);
  let T = vec3f(sy * cp, sp, cy * cp); var S = vec3f(cy, 0., -sy); var Up = vec3f(-sy * sp, cp, -cy * sp);
  let bank = -clamp(i.b.w, -1., 1.) * .15;
  let S2 = S * cos(bank) + Up * sin(bank); Up = Up * cos(bank) - S * sin(bank); S = S2;
  var l = i.p;
  let q = clamp(.62 - l.z * .5, 0., 1.5); let amp = .006 + .04 * q * q; // a slight tail beat, small even at the tip
  let ph = i.b.z - l.z * 2.;
  l.x += amp * sin(ph);
  let lat = latAt(-l.z, i.c) / sz;                     // the body bends along the path the head took
  l.x += lat;
  let dlat = (latAt(-(l.z + .03), i.c) - latAt(-(l.z - .03), i.c)) / (.06 * sz);
  let dx = -.04 * q * sin(ph) - 2. * amp * cos(ph) + dlat;
  let th = atan(dx);
  let nl = vec3f(i.n.x * cos(th) + i.n.z * sin(th), i.n.y, -i.n.x * sin(th) + i.n.z * cos(th));
  let w = i.a.xyz + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * nl.x + Up * nl.y + T * nl.z; o.op = i.p; o.sd = .37;
  o.lt = i.n.w;
  return o;
}
// nurse sharks asleep on the sea floor: an instance is x, y, z, yaw | pitch, size, seed, tail bend. Almost still: the body
// breathes (the head region swells a little, slowly), the paddle fins ripple at their edges, the tail drifts
struct VN { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f, @location(5) d: vec4f };
const NZK = array<f32, 8>(1.12, .75, .3, -.15, -.6, -1.1, -1.6, -2.2);
// how far the ground is above / below the straight rest pose at body position z (the eight values stored with each shark)
fn nurseOff(z: f32, c: vec4f, d: vec4f) -> f32 {
  let v = array<f32, 8>(c.x, c.y, c.z, c.w, d.x, d.y, d.z, d.w);
  if (z >= NZK[0]) { return v[0]; }
  for (var k = 0; k < 7; k++) { if (z >= NZK[k + 1]) { let t = (NZK[k] - z) / (NZK[k] - NZK[k + 1]); return mix(v[k], v[k + 1], t * t * (3. - 2. * t)); } }
  return v[7];
}
@vertex fn vsNurse(i: VN) -> VO {
  var o: VO;
  let t = g.cam.w; let sz = i.b.y; let sd = i.b.z; let ph = sd * 40.; let A = i.b.w;
  let cy = cos(i.a.w); let sy = sin(i.a.w); let cp = cos(i.b.x); let sp = sin(i.b.x);
  let T = vec3f(sy * cp, sp, cy * cp); let S = vec3f(cy, 0., -sy); let Up = vec3f(-sy * sp, cp, -cy * sp);
  var l = i.p;
  l.y += nurseOff(l.z, i.c, i.d) / sz; // lie on the ground along the whole body
  // the sinuous rest pose: the whole body bends in an S (same curve the placement and the collision use)
  let z0 = l.z; let bend = A * sin((1. - z0) * 1.55) * (.15 + .85 * ss(.9, -.4, z0));
  let z1 = z0 + .02; let z2 = z0 - .02;
  let dbend = (A * sin((1. - z1) * 1.55) * (.15 + .85 * ss(.9, -.4, z1)) - A * sin((1. - z2) * 1.55) * (.15 + .85 * ss(.9, -.4, z2))) / .04;
  l.x += bend;
  // gentle life: the pectoral and pelvic fins flap slowly, the dorsals and the tail sway, the head swells as it breathes
  let pec = ss(.18, .32, abs(l.x - bend)) * step(-.15, l.z) * step(l.z, .62) * step(l.y, -.06);
  l.y += sin(t * .95 + ph + sign(l.x - bend) * .7) * .17 * max(abs(l.x - bend) - .17, 0.) * pec;
  let pel = ss(.1, .2, abs(l.x - bend)) * step(-.7, l.z) * step(l.z, -.3) * step(l.y, -.05);
  l.y += sin(t * 1.1 + ph + 2. + sign(l.x - bend) * .7) * .14 * max(abs(l.x - bend) - .1, 0.) * pel;
  l.x += sin(t * .8 + ph) * .022 * ss(.1, .4, l.y);
  let tl = ss(-1.1, -2.3, l.z);
  l.x += sin(t * .55 + ph) * .1 * tl * tl; l.y += sin(t * .7 + ph + 1.) * .015 * tl;
  let br = .5 + .5 * sin(t * 1.1 + ph);
  let hd = ss(.2, .75, l.z) * ss(1., .8, l.z) * (1. - pec);
  l.y *= 1. + .02 * br * hd;
  let th = atan(dbend);
  let nl = vec3f(i.n.x * cos(th) + i.n.z * sin(th), i.n.y, -i.n.x * sin(th) + i.n.z * cos(th));
  let w = i.a.xyz + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * nl.x + Up * nl.y + T * nl.z; o.op = i.p; o.sd = sd;
  o.lt = i.n.w;
  return o;
}
fn hn3(p: vec3f) -> vec3f { var q = fract(p * vec3f(.1031, .1030, .0973)); q += dot(q, q.yxz + 33.33); return fract((q.xxy + q.yxx) * q.zyx); }
// irregular dark blotches: jittered 3-D cells, each holding a soft round spot with its own size (dens = share of cells that have one)
fn spots3(p: vec3f, sc: f32, dens: f32, rmin: f32, rmax: f32) -> f32 {
  let q = p * sc; let id = floor(q); let f = fract(q) - .5; var m = 0.;
  for (var x = -1; x <= 1; x++) { for (var y = -1; y <= 1; y++) { for (var z = -1; z <= 1; z++) {
    let o = vec3f(f32(x), f32(y), f32(z)); let h = hn3(id + o);
    if (h.x < dens) { let r = mix(rmin, rmax, h.z); m = max(m, ss(r, r * .55, length(f - o - (h.yzx - .5) * .7))); }
  } } }
  return m;
}
@fragment fn fsNurse(i: VO) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus(i.wp, dist);
  let p = i.op;
  let side_ = abs(normalize(i.n).x) > .6; // fins and flanks face sideways: map the skin from the side there
  let tx = textureSample(tD, sR, select(p.xz, p.zy, side_) * 1.9 + i.sd);
  let ty = textureSample(tD, sR, p.zy * 4.3 + i.sd * 3.);
  let V = normalize(g.cam.xyz - i.wp);
  var nn = normalize(i.n); if (dot(nn, V) < 0.) { nn = -nn; }
  let n = normalize(nn + (vec3f(tx.r, ty.g, tx.g) - vec3f(.5)) * .16); let L = g.sun.xyz;
  let z = zone(i.wp); let vv = vol(i.wp);
  // tawny ochre skin, paler underneath, blotched with dark brown spots (big ones on the back and flanks, fine freckles all over)
  let top = ss(-.25, .35, normalize(i.n).y + (ty.a - .5) * .25);
  let sp = i.sd * 17.;
  let big = spots3(p + sp, 5., .62, .3, .46); let fine = spots3(p + sp + 3., 17., .6, .26, .42);
  var alb = mix(vec3f(.60, .47, .27), mix(vec3f(.33, .20, .06), vec3f(.43, .27, .09), tx.b), top);
  alb = mix(alb, vec3f(.15, .075, .03), big * .8 * mix(.3, 1., top));
  alb = mix(alb, vec3f(.18, .09, .035), fine * .7 * mix(.5, 1., top));
  alb *= .86 + .28 * ty.b;
  alb *= vec3f(1. + 2.2 * (1. - exp(-.028 * max(-i.wp.y, 0.))), 1., .85);                              // water has eaten the reds by this depth: keep the skin ochre
  let skin = vec3f(.4, .255, .09) * vec3f(1. + 2.2 * (1. - exp(-.028 * max(-i.wp.y, 0.))), 1., .85) * (.86 + .28 * ty.b); // the lid is the same tawny skin
  let eye = step(i.lt, -.5);                                                                       // the eyeballs (aux -1): dark, wet and glossy, with a paler ring
  // blinking: every 5-11 s (each shark on its own beat) the lid rises over the eye and drops again in about half a second,
  // now and then twice in a row
  let per = 5. + 6. * fract(i.sd * 13.7); let bu = fract(g.cam.w / per + fract(i.sd * 7.31));
  let blink = max(sin(3.14159 * clamp(bu / .05, 0., 1.)), sin(3.14159 * clamp((bu - .08) / .045, 0., 1.)) * step(.5, fract(i.sd * 3.9)));
  // pale eyeball with a golden iris and a dark pupil looking out and a little forward, shaded by the brow above it
  let ec = vec3f(select(-.1419, .1419, p.x > 0.), .0404, .965); let eu = normalize(p - ec + vec3f(0., 1e-5, 0.));
  let gz = dot(eu, normalize(vec3f(select(-.85, .85, p.x > 0.), .45, .3)));
  var ecol = vec3f(.9, .87, .78) * (.62 + .38 * ss(-.5, .6, eu.y));
  ecol = mix(ecol, vec3f(.32, .22, .06), ss(.84, .89, gz));
  ecol = mix(ecol, vec3f(.012, .009, .007), ss(.95, .965, gz));
  let lidY = mix(-1.15, 1.15, blink);
  let lid = (1. - ss(lidY - .1, lidY + .1, eu.y)) * step(.001, blink);                              // how much of the eye the lid covers (it rises from below)
  ecol = mix(ecol, skin, lid);
  alb = mix(alb, ecol, eye);
  alb = mix(alb, vec3f(.06, .03, .025), sat(i.lt) * .85);                                                // mouth, gill slits, spiracles
  // resting on the floor: the underside and the creases are in shadow
  let gr = mix(.3, 1., ss(-.085, .02, p.y));
  let nl = normalize(mix(n, normalize(vec3f(n.x * .25, 1., n.z * .25)), lid * eye));
  let E = sunE(i.wp.y, z) * shadow4(i.wp + n * .3) * gr;
  var c = alb * (E * sat(dot(nl, L)) * (.3 + ca) * .9 + amb(i.wp, vec3f(nl.x, abs(nl.y) * .55 + .25, nl.z), vv.g, z) * .8 * gr + side(i.wp, nl, 1., z) * .5 * gr);
  c += E * pow(sat(dot(n, normalize(V + L))), 22.) * .22 * (.3 + ca) * (1. - top * .3);               // a faint wet sheen
  c += E * pow(sat(dot(n, normalize(V + L))), 120.) * 2.6 * eye * (1. - lid);                           // the glint in each eye (gone while the lid is over it)
  c += alb * amb(i.wp, vec3f(0., 1., 0.), vv.g, z) * ca * .25 * top * gr;
  return fin(fog(c, i.wp, z));
}
// seagulls: an instance is x, y, z, yaw | flying (0 perched .. 1 in the air), size, seed. In the air the wings beat (now and then they
// glide, held out and slightly raised) and the legs tuck in; perched the wings fold back along the body
@vertex fn vsGull(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let fly = i.b.x; let sz = i.b.y; let sd = i.b.z;
  var l = i.p; let u = i.n.w; let au = abs(u);
  let wing = step(.02, au); let pf = 1. - fly; let leg = step(i.p.y, -.2);
  let beat = mix(.14, 1., ss(-.25, .45, sin(t * .45 + sd * 30.)));
  let ph = t * 8.5 + sd * 40.;
  l.y += wing * fly * (beat * (.5 * au * au * sin(ph) + .05 * sin(ph - 1.)) + .16 * sin(au * 2.6) - .13 * au * au * au * (1. - beat * .5));
  l.z -= wing * fly * beat * .04 * au * (1. + sin(ph));
  l.x = mix(l.x, sign(l.x) * (.16 + (abs(l.x) - .1) * .06), wing * pf);
  l.z -= wing * pf * au * .52; l.y += wing * pf * (.075 - .11 * au);
  l.y = mix(l.y, -.12 + (l.y + .12) * .18, leg * fly);
  l.z -= leg * fly * .12;
  let cy = cos(i.a.w); let sy = sin(i.a.w);
  let rl = vec3f(l.x * cy + l.z * sy, l.y, -l.x * sy + l.z * cy) * sz;
  let w = i.a.xyz + rl;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = vec3f(i.n.x * cy + i.n.z * sy, i.n.y, -i.n.x * sy + i.n.z * cy); o.op = i.p; o.sd = sd;
  o.lt = 1.;
  return o;
}
@fragment fn fsGull(i: VO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); var nn = normalize(i.n); if (dot(nn, V) < 0.) { nn = -nn; }
  let L = g.sun.xyz; let z = zone(i.wp); let vv = vol(i.wp);
  let p = i.op; let ax = abs(p.x);
  let tx = textureSample(tD, sR, p.xz * 2.3 + i.sd);
  let top = ss(-.15, .35, nn.y);
  var alb = vec3f(.93, .94, .94);
  let mant = max(ss(.12, .2, ax), ss(.4, .3, p.z) * ss(.0, .06, p.y)) * top;
  alb = mix(alb, vec3f(.55, .59, .64) * (.88 + .24 * tx.r), mant * .92);
  alb = mix(alb, vec3f(.03, .03, .035), ss(.78, .9, ax) * ss(.1, -.1, p.z + tx.g * .15 - .05) * .96);
  alb = mix(alb, vec3f(.95, .72, .1), ss(.76, .79, p.z) * (1. - .45 * ss(.86, .9, p.z)));
  alb = mix(alb, vec3f(.9, .62, .5), step(p.y, -.2));
  alb *= 1. - .95 * ss(.026, .013, length(vec3f(ax - .072, p.y - .088, p.z - .64)));
  let E = sunE(i.wp.y, z) * shadow4(i.wp + nn * .3);
  let thin = step(.13, ax);
  var c = alb * (E * (sat(dot(nn, L)) + thin * .4 * sat(-dot(nn, L))) + mix(amb(i.wp, vec3f(nn.x, abs(nn.y) * .55 + .25, nn.z), vv.g, z) * 1.1 + side(i.wp, nn, 1., z) * .5, vec3f(.62, .68, .78) * (.34 + .66 * (nn.y * .5 + .5)), ss(-.5, .6, i.wp.y)));
  c += E * pow(sat(dot(nn, normalize(V + L))), 30.) * .12;
  return fin(fog(c, i.wp, z));
}
@vertex fn vsManta(i: VI) -> VO {
  var o: VO;
  let t = g.cam.w; let R = i.a.w; let sz = i.b.z;
  let ta = t * i.b.y + i.b.x;
  let P = i.a.xyz + vec3f(R * cos(ta), 2.5 * sin(2. * ta + i.b.w), R * .75 * sin(ta));
  let T = normalize(vec3f(-R * sin(ta), 5. * cos(2. * ta + i.b.w) * 1., R * .75 * cos(ta))) * sign(i.b.y);
  var S = normalize(cross(vec3f(0., 1., 0.), T)); var Up = cross(T, S);
  let bank = -.28 * sign(i.b.y);
  let S2 = S * cos(bank) + Up * sin(bank); Up = Up * cos(bank) - S * sin(bank); S = S2;
  let u = i.n.w; let au = abs(u);
  let fp = t * 1.25 + i.b.w * 5. - au * 1.2;
  let amp = .36 * pow(au, 1.6);
  var l = i.p;
  l.y += amp * sin(fp) - .1 * sin(t * 1.25 + i.b.w * 5.);
  let tail = ss(-.5, -1.9, l.z) * step(au, .001);
  l.x += tail * sin(t * .8 + l.z * 2.) * .12;
  let sl = (.576 * pow(au, .6) * sin(fp) - .43 * pow(au, 1.6) * cos(fp)) * sign(u);
  let ln = normalize(vec3f(i.n.x - sl * i.n.y, i.n.y + sl * i.n.x, i.n.z));
  let w = P + (S * l.x + Up * l.y + T * l.z) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = S * ln.x + Up * ln.y + T * ln.z; o.op = i.p; o.sd = i.b.w;
  o.lt = 1.;
  return o;
}
@fragment fn fsManta(i: VO) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus(i.wp, dist);
  let tx = textureSample(tD, sR, i.op.xz * .9 + i.sd);
  let n = normalize(i.n + (vec3f(tx.r, 0., tx.g) - vec3f(.5, 0., .5)) * .5); let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let z = zone(i.wp); let vv = vol(i.wp);
  let top = ss(-.2, .25, normalize(i.n).y);
  let au = abs(i.op.x);
  let gill = ss(.25, .0, abs(au - .13) * 8.) * ss(.04, .12, i.op.z) * ss(.34, .26, i.op.z) * ss(.2, .8, sin(i.op.z * 110.));
  var belly = vec3f(.13, .17, .21) * (.6 + .6 * tx.b) * (1. - .7 * gill);
  belly = mix(belly, vec3f(.05, .08, .11), sat(ss(.45, .9, au + tx.a * .35) + ss(-.1, -.4, i.op.z + tx.b * .2) * .7));
  var back = vec3f(.04, .065, .10) + vec3f(.10, .16, .2) * ss(.5, .75, tx.a);
  back = mix(back, vec3f(.36, .46, .52), ss(.25, .0, abs(au - .26) * 3.5 + abs(i.op.z - .12) * 5.) * .8);
  var alb = mix(belly, back, top);
  let E = sunE(i.wp.y, z) * shadow4(i.wp + n * .3);
  let ndv = sat(dot(n, V));
  let ir = .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + ndv * 1.1 + tx.a * 1.5 + .55));
  let fillN = vec3f(n.x, abs(n.y) * .55 + .25, n.z);
  var c = alb * (E * sat(dot(n, L)) * (.3 + ca) + amb(i.wp, fillN, vv.g, z) * 1.1 + side(i.wp, n, 1., z) * .8);
  c += ir * vec3f(.35, .16, .6) * (.07 + .22 * tx.b) * (.4 + E.g * .2 * ca.g) * (1. - top * .3);
  c += E * pow(sat(dot(n, normalize(V + L))), 30.) * .5 * (.3 + ca);
  let sky = amb(i.wp, vec3f(0., 1., 0.), vv.g, z);
  c += alb * sky * ca * .45 * (1. - top) + sky * pow(1. - ndv, 3.) * .35;
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- water surface seen from below
const W_SURF = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f };
@vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = vec3f(g.cam.x + p.x * 900., 0., g.cam.z + p.y * 900.);
  o.cp = g.vp * vec4f(o.wp, 1.);
  return o;
}
fn h21(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn vn2(p: vec2f) -> f32 {
  let i = floor(p); let f = fract(p); let u = f * f * (3. - 2. * f);
  return mix(mix(h21(i), h21(i + vec2f(1., 0.)), u.x), mix(h21(i + vec2f(0., 1.)), h21(i + vec2f(1., 1.)), u.x), u.y);
}
fn fbm2(p: vec2f) -> f32 { var a = .5; var s = 0.; var q = p; for (var i = 0; i < 5; i++) { s += a * vn2(q); q = q * 2.03 + vec2f(17.1, 5.3); a *= .5; } return s; }
const SKYH = vec3f(.85, 1.2, 1.7);
// the sky seen from above the water: a haze-to-blue gradient, drifting clouds, the sun
fn skyCol(rd: vec3f) -> vec3f {
  let y = max(rd.y, 0.);
  var c = mix(SKYH, vec3f(.10, .42, 1.25), pow(sat(y * 1.1), .55));
  let mu = max(dot(rd, g.sun.xyz), 0.);
  let uv = rd.xz / (y + .14) * .6 + vec2f(g.cam.w * .004, g.cam.w * .0015);
  let cl = ss(.5, .74, fbm2(uv * 1.1)) * ss(.0, .2, y);
  let cc = vec3f(1.65, 1.68, 1.75) * (.7 + .5 * pow(mu, 3.)) - vec3f(.0, .06, .18) * (1. - ss(.5, .74, fbm2(uv * 1.1 + .15)));
  c = mix(c, cc, cl * .88);
  c += SUNC * (pow(mu, 6.) * .16 + pow(mu, 90.) * .9 + ss(.99955, .99986, mu) * 30.) * (1. - cl * .85);
  let nk = g.rot.z;
  let sq = floor(rd * 420.); let hh = fract(sin(dot(sq, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
  let st = ss(.9972, .9996, hh) * (.55 + .45 * sin(g.cam.w * 2. + hh * 90.)) * ss(.0, .25, rd.y);
  c = mix(c, c * vec3f(.05, .06, .17) + vec3f(.012, .02, .06) + vec3f(1., .95, .85) * st * 2.2, nk);
  return c;
}
// from far above: black sky, stars, and the Earth as a sphere (radius 6371 km) with ocean, land, clouds, a terminator and a thin atmosphere
fn spaceCol(rd: vec3f) -> vec3f {
  let h = g.cam.y * .001; let R = 6371.; let L = g.sun.xyz;
  let sq = floor(rd * 520.); let hh = fract(sin(dot(sq, vec3f(12.9898, 78.233, 37.719))) * 43758.5453);
  var c = vec3f(1., .95, .88) * ss(.9955, .9995, hh) * 1.8 + vec3f(.004, .006, .014);
  let mu = max(dot(rd, L), 0.);
  c += SUNC * (pow(mu, 400.) * 6. + pow(mu, 30.) * .03);
  let ro = h + R; let b = ro * rd.y; let disc = b * b - (h * h + 2. * h * R);
  let cl = ro * ro - b * b;
  if (disc > 0. && b < 0.) {
    let t = -b - sqrt(disc);
    let n = normalize(vec3f(rd.x * t, h + rd.y * t + R, rd.z * t));
    let q = n.xz * 2.6 + vec2f(n.y * 1.7, n.y * .6);
    let lm = ss(.5, .6, fbm2(q * 1.5 + 3.));
    var col = mix(vec3f(.02, .11, .3), vec3f(.05, .3, .55), pow(1. - max(dot(n, -rd), 0.), 2.) * .5);
    col = mix(col, mix(vec3f(.1, .22, .08), vec3f(.5, .4, .24), fbm2(q * 5.)), lm);
    let cd = ss(.5, .76, fbm2(q * 3.6 + vec2f(g.cam.w * .003, 0.)));
    col = mix(col, vec3f(.95), cd * .85);
    let nl = dot(n, L); let day = ss(-.12, .3, nl);
    let sp = pow(max(dot(reflect(rd, n), L), 0.), 90.) * (1. - lm) * (1. - cd);
    var e = col * (.012 + 1.5 * day) + vec3f(1., .95, .85) * sp * 2.5;
    let fr = pow(1. - max(dot(n, -rd), 0.), 3.5);
    e += vec3f(.28, .55, 1.2) * fr * 1.6 * (day * .9 + .08);
    return e;
  }
  let ac = sqrt(max(cl, 0.)) - R;
  if (b < 0. && ac < 400.) { c += vec3f(.22, .5, 1.1) * exp(-max(ac, 0.) / 38.) * (.14 + .8 * ss(-.2, .5, dot(normalize(vec3f(rd.x, 0., rd.z)), vec3f(L.x, 0., L.z) / max(length(L.xz), .01)))); }
  return c;
}
@fragment fn fs(i: VO) -> @location(0) vec4f {
  if (g.cam.y > 3000.) { discard; }
  let up = g.cam.y > 0.; let t = g.cam.w;
  let v0 = i.wp - g.cam.xyz; let d = length(v0); let V = v0 / d;
  // where the ray really meets the waves (their height, flattened near the waterline so the camera never sits inside one)
  var p = i.wp; let hs = ss(0., 1.5, abs(g.cam.y));
  if (abs(V.y) > .02) { for (var k = 0; k < 3; k++) { let h = swell(p.xz, t, d).x * hs; p = g.cam.xyz + V * ((h - g.cam.y) / V.y); } }
  let sw = swell(p.xz, t, d);
  let fl = select(ss(260., 60., d), ss(700., 90., d), up);
  // the repeating ripple texture only adds detail seen from the air; from underneath the waves alone shape the surface
  let s = (textureSample(tW, sR, p.xz / 13.).ba + textureSample(tW, sR, p.zx / 4.7 + .2).ba * .7 + textureSample(tW, sR, p.xz / 37. + .6).ba * .8) * fl * select(0., 1., up);
  // from underneath the ripples are close and sharp, and the light through them breaks into bright, crisp patterns
  let fine = vec2f(0.);
  let su = vec2f(-sw.y + (s.x + fine.x) * .5, -sw.z + (s.y + fine.y) * .5); // sideways part of the upward normal
  // whitecaps: foam breaks up on the highest crests
  let foam = ss(.62, .86, sw.w + (fbm2(p.xz * 1.7 + vec2f(t * .15, 0.)) - .5) * .5) * ss(500., 80., d);
  if (up) {
    // seen from the air: a mirror for the sky and a window onto the sea (blended over it), foam, and light glowing
    // through the crests that are lit from behind
    let n = normalize(vec3f(su.x, 1., su.y));
    let ci = sat(dot(-V, n));
    let fr = .02 + .98 * pow(1. - ci, 5.);
    var R = reflect(V, n); R.y = max(R.y, .015);
    let mu = max(dot(R, g.sun.xyz), 0.);
    let glit = (pow(mu, 1400.) * 70. + pow(mu, 160.) * 1.4) * ss(700., 120., d);
    let lit = .25 + .75 * sat(dot(n, g.sun.xyz));
    let sss = vec3f(.04, .38, .34) * pow(sat(dot(V, g.sun.xyz)), 2.) * sat(sw.w * 1.6 - .3) * .5;
    let col = (skyCol(R) + SUNC * glit) * fr * (1. - foam) + vec3f(1.05, 1.1, 1.15) * lit * foam * .9 + sss * (1. - fr);
    return vec4f(col, fr * (1. - foam) + foam * .9) * (1. - ss(25., 120., g.cam.y)); // (from high up the far sea takes over)
  }
  let n = normalize(vec3f(-su.x, -1., -su.y));
  let ci = sat(dot(V, -n));
  let k = 1. - 1.769 * (1. - ci * ci);
  let win = ss(0., .22, k);
  let fr = pow(1. - sqrt(max(k, 0.)), 5.);
  // through the window you see the real sky, squeezed by refraction (the whole horizon fits inside it) and shaken by the waves
  let rr = normalize(refract(V, n, 1.33) + vec3f(0., 1e-4, 0.));
  let sky = skyCol(vec3f(rr.x, max(rr.y, .01), rr.z)) * (1. - fr) * .5;
  let z = zone(p);
  let R = reflect(V, n);
  let refl = fogIn(p, R, 300., z, g.sun.xyz) * 1.15;
  var c = mix(refl, sky, win);
  c = mix(c, vec3f(.55, .8, .9) * (.3 + .7 * win), foam * .5); // foam seen from underneath: bright, bubbly patches
  return vec4f(min(max(fog(c, p, z), vec3f(0.)), vec3f(40.)), 1.);
}
// behind everything: where no terrain is drawn (it stops at ~240 m) the water looks as it does at that distance;
// from the air, upward rays see the sky and downward ones the sea below the surface
fn ah(p: vec2f) -> vec3f { return fract(sin(vec3f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)), dot(p, vec2f(419.2, 371.9)))) * 43758.5453); }
// a made-up archipelago on the flat sea: atolls (green core, sand, white surf, turquoise shallows) on a 1.8 km grid, hazed with distance
fn archipelago(q: vec2f, tt: f32, base: vec3f) -> vec3f {
  let cs = 1800.; let ip = floor(q / cs); var res = base;
  for (var j = -1; j <= 1; j++) { for (var i = -1; i <= 1; i++) {
    let cell = ip + vec2f(f32(i), f32(j)); let h = ah(cell);
    if (h.z < .5) { continue; }
    let ctr = (cell + .25 + .5 * h.xy) * cs; let rad = 130. + 330. * fract(h.x * 7.13 + h.y * 3.1);
    let nz = fbm2(q * .018 + h.xy * 40.) - .5;
    let d = length(q - ctr) / rad * (1. + .22 * nz);
    var c = mix(res, vec3f(.1, .58, .64), ss(1.35, .85, d) * .85);
    c = mix(c, vec3f(.92, .97, 1.), ss(.12, 0., abs(d - .8)) * .85);
    c = mix(c, vec3f(.86, .78, .58), ss(.66, .54, d));
    c = mix(c, vec3f(.1, .3, .09) * (.8 + .6 * (fbm2(q * .05) - .3)), ss(.46, .32, d));
    res = c;
  } }
  return mix(res, SKYH * .9, 1. - exp(-tt / 26000.));
}
@vertex fn vsB(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w); // (the ray itself, not a point: the camera is far too high for a position to keep its precision)
  o.cp = vec4f(p, 1e-7, 1.);
  return o;
}
@fragment fn fsB(i: VO) -> @location(0) vec4f {
  let rd = normalize(i.wp);
  if (g.cam.y > 0.) {
    if (g.cam.y > 3000.) {
      let ks = ss(3000., 60000., g.cam.y); var b0: vec3f;
      if (rd.y > -.0045) { b0 = skyCol(rd); } else { let p = g.cam.xyz + rd * (g.cam.y / -rd.y + 200.); b0 = fog(vec3f(0.), p, zone(p)); }
      return fin(mix(b0, spaceCol(rd), ks));
    }
    if (rd.y > -.0045) { return fin(skyCol(rd)); }
    let p = g.cam.xyz + rd * (g.cam.y / -rd.y + 200.);
    var col = fog(vec3f(0.), p, select(g.sun.w * .8, zone(p), max(abs(p.x), abs(p.z)) < 180.)); // (open sea: not the world map's edge texels stretched outwards)
    let hk = ss(25., 120., g.cam.y);
    if (hk > 0.) { // from high up the open sea goes on: far-off atolls, haze and the sun's glitter
      let tt = g.cam.y / -rd.y;
      col = mix(col, archipelago(g.cam.xz + rd.xz * tt, tt, col), hk * ss(700., 1300., tt));
      // our own atoll: an uneven ring of sand, bright shallows and surf around the outside of its rock wall, like the far-off ones
      let q0 = g.cam.xz + rd.xz * tt; let an = atan2(q0.y, q0.x);
      let ed = 7. + 3.2 * sin(3. * an + 1.) + 2.2 * sin(5. * an + 2.) + 1.4 * sin(9. * an) + 0.9 * sin(17. * an + 4.);
      let r0 = length(q0) + 1.6 * ed + 26. * (fbm2(q0 * .017 + 7.) - .5) + 9. * (fbm2(q0 * .09) - .5);
      var cc = mix(col, vec3f(.1, .58, .64), ss(272., 196., r0) * .85 * hk);
      cc = mix(cc, vec3f(.92, .97, 1.), ss(5., 0., abs(r0 - 226.)) * .8 * hk);
      cc = mix(cc, vec3f(.86, .78, .58), ss(226., 212., r0) * hk);
      col = cc;
      col += SUNC * .3 * pow(max(dot(reflect(rd, vec3f(0., 1., 0.)), g.sun.xyz), 0.), 160.) * hk * ss(300., 900., tt);
    }
    return fin(col);
  }
  let p = g.cam.xyz + rd * 240.;
  return fin(fog(vec3f(0.), p, zone(p)));
}
`;

// ---------------------------------------------------------------- sprites: bubbles (alpha) and drifting particles (additive)
const W_SPR = S_B + /*wgsl*/`
struct VO { @builtin(position) cp: vec4f, @location(0) uv: vec2f, @location(1) @interpolate(flat) pr: vec4f, @location(2) wp: vec3f };
fn quad(i: u32) -> vec2f { return vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.; }
@vertex fn vsBub(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let life = fract(t * b.y / b.z + b.x);
  let h = life * b.z;
  var p = a.xyz + vec3f(0., h, 0.);
  let wob = b.w * (.3 + h * .035);
  p.x += sin(t * 1.7 + b.x * 50. + h * .6) * wob + sin(h * .13 + b.x * 9.) * b.w * 2.;
  p.z += cos(t * 1.3 + b.x * 33. + h * .5) * wob + cos(h * .11 + b.x * 7.) * b.w * 2.;
  let sz = a.w * (.55 + .7 * life) * ss(0., .03, life) * ss(0., -1.2, p.y);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * sz;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  o.pr = vec4f(b.x, sz, shadow1(p), 0.);
  return o;
}
@fragment fn fsBub(i: VO) -> @location(0) vec4f {
  let t = g.cam.w;
  let an = atan2(i.uv.y, i.uv.x + 1e-4);
  let big = ss(.04, .22, i.pr.y);
  let r = length(i.uv) / (.9 + big * .05 * sin(an * 3. + t * 5. + i.pr.x * 40.) + big * .02 * sin(an * 5. - t * 7.));
  let aa = fwidth(r) * 1.5;
  let disc = 1. - ss(1. - aa, 1., r);
  let rim = ss(.55, .98, r);
  let hl = ss(.34, .0, length(i.uv - vec2f(-.36, .42))) + .5 * ss(.2, .0, length(i.uv - vec2f(.4, -.42)));
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * (.25 + .75 * i.pr.z);
  let hi = fogIn(i.wp, vec3f(0., 1., 0.), 80., z, g.sun.xyz) * 1.5;
  let lo = fogIn(i.wp, vec3f(0., -1., 0.), 80., z, g.sun.xyz);
  var c = mix(lo, hi, ss(-.5, .8, i.uv.y + rim * .4)) * (.5 + 1.2 * rim) + E * hl * 1.6;
  var al = disc * sat(.03 + rim * rim * rim * .9 + hl);
  let v = i.wp - g.cam.xyz; let d = length(v);
  let T = exp(-SIG.g * d) * ss(1.2, 3., d);
  c = c * T + fogIn(g.cam.xyz, v / d, d, z, g.sun.xyz) * (1. - T);
  al *= mix(.35, 1., T);
  return vec4f(min(max(c * al * dkLit(i.wp), vec3f(0.)), vec3f(20.)), al);
}
@vertex fn vsSnow(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let B = 44.;
  var p = a.xyz * B + vec3f(t * .16, t * .04, t * .12) + .5 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
  p = g.cam.xyz + (fract((p - g.cam.xyz) / B + .5) - .5) * B;
  let d = length(p - g.cam.xyz);
  let sz = (.012 + .045 * a.w * a.w * a.w);
  let w = p + (g.right.xyz * q.x + g.up.xyz * q.y) * max(sz, d * .0011);
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = p;
  let fade = ss(B * .5, B * .32, d) * ss(.6, 2.5, d) * min(1., sz / (d * .0011)) * ss(-.3, -1.5, p.y);
  let tw = .6 + .4 * sin(t * (1. + a.w * 2.) + a.x * 100.);
  o.pr = vec4f(fade * tw, shadow1(p), a.w, d);
  return o;
}
@fragment fn fsSnow(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  let m = ss(1., .2, r);
  let z = zone(i.wp);
  let c = (sunE(i.wp.y, z) * i.pr.y * .8 + amb(i.wp, vec3f(0., 1., 0.), 1., z) * .3) * mix(vec3f(1.), vec3f(.7, 1., .9), i.pr.z);
  let bio = step(.78, i.pr.z) * ss(-24., -40., i.wp.y) * (.55 + .45 * sin(g.cam.w * (.8 + i.pr.z) + i.pr.z * 90.));
  let c2 = c * mix(vec3f(1.), vec3f(.15, 1., 1.3), bio) + vec3f(.02, .22, .32) * bio * 6.;
  return vec4f(min(max(c2 * m * m * i.pr.x * exp(-SIG.g * i.pr.w) * dkLit(i.wp), vec3f(0.)), vec3f(8.)), 0.);
}
@vertex fn vsPuff(@builtin(vertex_index) vi: u32, @location(0) a: vec4f, @location(1) b: vec4f) -> VO {
  var o: VO; let q = quad(vi);
  let rot = b.y * 6.283 + g.cam.w * (.12 + .2 * b.y); let cs = cos(rot); let sn = sin(rot);
  let qr = vec2f(q.x * cs - q.y * sn, q.x * sn + q.y * cs);
  let w = a.xyz + (g.right.xyz * qr.x + g.up.xyz * qr.y) * a.w * 1.5;
  o.cp = g.vp * vec4f(w, 1.); o.uv = q; o.wp = a.xyz;
  o.pr = vec4f(b.x, shadow1(a.xyz), b.y, a.w);
  return o;
}
@fragment fn fsPuff(i: VO) -> @location(0) vec4f {
  let r = length(i.uv);
  let an = atan2(i.uv.y, i.uv.x + 1e-4);
  let sd = i.pr.z * 40.;
  let rr = r / (.62 + .13 * sin(an * 3. + sd) + .08 * sin(an * 5. - sd * .43 + g.cam.w * .4) + .05 * sin(an * 9. + sd * .17));
  let z = zone(i.wp);
  let v = i.wp - g.cam.xyz; let d = length(v);
  let al = ss(1., .1, rr) * i.pr.x * ss(.2, 1.3, d);
  let wh = step(1.5, i.pr.z) * step(i.pr.z, 3.); let dk = step(3., i.pr.z) * step(i.pr.z, 4.); let gl = step(4., i.pr.z);
  if (gl > .5) { let tw = .75 + .25 * sin(g.cam.w * 2.3 + i.pr.z * 90.); let gg = ss(1., 0., rr); return vec4f(vec3f(.25, .9, 1.) * gg * gg * 1.6 * tw * ss(.15, .6, d), 0.); }
  var c = (sunE(i.wp.y, z) * i.pr.y * .95 + amb(i.wp, vec3f(0., 1., 0.), 1., z) * 1.2) * mix(vec3f(.66, .57, .42), vec3f(.95, .98, 1.), wh) * (1. - .2 * ss(.8, 0., rr));
  c = mix(c, vec3f(.01, .035, .06), dk);
  var T = exp(-SIG.g * d); T = mix(T, 1., dk * .65);
  c = c * T + fogIn(g.cam.xyz, v / d, d, z, g.sun.xyz) * (1. - T) * .6;
  return vec4f(min(max(c * dkLit(i.wp), vec3f(0.)), vec3f(12.)) * al, al);
}
`;

// ---------------------------------------------------------------- volumetric light shafts (half res)
const W_RAYS = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sR: sampler;
@group(0) @binding(2) var sS: sampler_comparison;
@group(0) @binding(3) var tSh: texture_depth_2d;
@group(0) @binding(4) var tW: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
@group(0) @binding(6) var tV: texture_3d<f32>;
@group(0) @binding(7) var sC: sampler;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let dp = textureLoad(tDp, vec2i(fc.xy) * 2, 0);
  let uv = fc.xy * 2. * g.res.zw;
  let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
  let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
  let rl = length(rv); let rd = rv / rl;
  let zl = g.fwd.w / max(dp, 1e-6);
  if (g.cam.y > 0.) { return vec4f(0., 0., 0., zl); } // no underwater shafts in the air
  var tm = min(zl * rl, 120.);
  if (rd.y > 1e-4) { tm = min(tm, -g.cam.y / rd.y); }
  let ro = g.cam.xyz; let sx = g.sun.xyz; let k = kd(g.sun.w); let sgz = sg(g.sun.w);
  let dt = tm / ${RAYN}.;
  let j = ign(fc.xy);
  var acc = vec3f(0.);
  for (var n = 0; n < ${RAYN}; n++) {
    let t = (f32(n) + j) * dt;
    let p = ro + rd * t;
    let s = g.sm * vec4f(p, 1.);
    let vis = textureSampleCompareLevel(tSh, sS, vec2f(s.x * .5 + .5, .5 - s.y * .5), s.z - .0006);
    let q = p.xz - sx.xz * (p.y / sx.y);
    let pat = ss(.3, .7, textureSampleLevel(tW, sR, q / 27., 2.5).r) * ss(.15, .6, textureSampleLevel(tW, sR, q.yx / 11. + .3, 2.).r);
    let o = textureSampleLevel(tV, sC, (p - vec3f(-192., -56., -192.)) / vec3f(384., 72., 384.), 0.).r;
    let mist = sat(1. - (o - .5) * 3.4);
    acc += exp(-sgz * t + k * (p.y / sx.y)) * (vis * (.012 + pat * 6.) * (1. + 1.2 * mist * mist));
  }
  let mu = max(dot(rd, sx), 0.);
  let ph = mix(.2 + 2.0 * mu * mu * mu, .8, g.sun.w);
  let wc = mix(WCOL + vec3f(.04, .07, .05), PCOL + vec3f(.28, .16, .12), g.sun.w);
  return vec4f(min(acc * dt * sgz * wc * SUNC * ph * g.mis.y * (1. - .55 * g.sun.w), vec3f(20.)), zl);
}
`;
// depth-aware 3x3 blur of the half-res shafts (hides the sampling dither)
const W_RBLUR = W_FS + /*wgsl*/`
@group(0) @binding(0) var tR: texture_2d<f32>;
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let p = vec2i(fc.xy); let mx = vec2i(textureDimensions(tR)) - 1;
  let c = textureLoad(tR, p, 0);
  var acc = vec3f(0.); var ws = 0.;
  for (var y = -1; y <= 1; y++) { for (var x = -1; x <= 1; x++) {
    let r = textureLoad(tR, clamp(p + vec2i(x, y) , vec2i(0), mx), 0);
    let w = 1. / (.03 + abs(r.a - c.a) / c.a);
    acc += r.rgb * w; ws += w;
  } }
  return vec4f(acc / ws, c.a);
}
`;

// ---------------------------------------------------------------- final composite
const W_POST = S_G + W_FS + /*wgsl*/`
@group(0) @binding(0) var<uniform> g: G;
@group(0) @binding(1) var sC: sampler;
@group(0) @binding(2) var tS: texture_2d<f32>;
@group(0) @binding(3) var tR: texture_2d<f32>;
@group(0) @binding(4) var tB: texture_2d<f32>;
@group(0) @binding(5) var tDp: texture_depth${AA > 1 ? '_multisampled' : ''}_2d;
fn h2(p: vec2f) -> vec4f { return fract(sin(vec4f(dot(p, vec2f(127.1, 311.7)), dot(p, vec2f(269.5, 183.3)), dot(p, vec2f(419.2, 371.9)), dot(p, vec2f(97.7, 593.1)))) * 43758.5453); }
fn tmap(x: vec3f) -> vec3f { return sat3((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14)); }
fn sat3(x: vec3f) -> vec3f { return clamp(x, vec3f(0.), vec3f(1.)); }
@fragment fn fs(@builtin(position) fc: vec4f) -> @location(0) vec4f {
  let px = vec2i(fc.xy);
  let uv = fc.xy * g.res.zw;
  let zf = g.fwd.w / max(textureLoad(tDp, px, 0), 1e-6);
  // depth-aware upsample of the half-res shafts
  let h = fc.xy * .5 - .5; let b = floor(h); let f = h - b; let bi = vec2i(b);
  let mx = vec2i(textureDimensions(tR)) - 1;
  var acc = vec3f(0.); var ws = 0.;
  for (var k = 0; k < 4; k++) {
    let o = vec2i(k & 1, k >> 1);
    let r = textureLoad(tR, clamp(bi + o, vec2i(0), mx), 0);
    let bw = mix(1. - f.x, f.x, f32(o.x)) * mix(1. - f.y, f.y, f32(o.y));
    let w = (bw + .02) / (.02 + abs(r.a - zf) / zf);
    acc += r.rgb * w; ws += w;
  }
  // seen from the air the sea bends the view of what lies under it; after a trip through the surface the lens is
  // wet (drops that dry up one by one) or full of bubbles
  var suv = uv; let wt = g.mis.w; let asp = g.right.w / g.up.w; var lens = 0.;
  if (g.cam.y > 0.) {
    let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
    let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
    let rl = length(rv); let rd = rv / rl;
    if (rd.y < -.03) {
      let t0 = -g.cam.y / rd.y;
      let dw = min(zf * rl - t0, 25.);
      if (dw > .1) {
        let sw = swell(g.cam.xz + rd.xz * t0, g.cam.w, t0);
        // where the refracted ray ends up on screen, compared with a perfectly flat sea: only the wobble is kept
        let H = g.cam.xyz + rd * t0;
        let P1 = H + refract(rd, normalize(vec3f(-sw.y, 1., -sw.z)), .752) * dw;
        let P0 = H + refract(rd, vec3f(0., 1., 0.), .752) * dw;
        let v1 = P1 - g.cam.xyz; let v0 = P0 - g.cam.xyz; let z1 = max(dot(v1, g.fwd.xyz), .1); let z0 = max(dot(v0, g.fwd.xyz), .1);
        let q1 = vec2f(dot(v1, g.right.xyz) / (z1 * g.right.w), dot(v1, g.up.xyz) / (z1 * g.up.w));
        let q0 = vec2f(dot(v0, g.right.xyz) / (z0 * g.right.w), dot(v0, g.up.xyz) / (z0 * g.up.w));
        var dq = (q1 - q0) * vec2f(.5, -.5); let dl = length(dq); dq *= min(dl, .035) / max(dl, 1e-5);
        let fr = .02 + .98 * pow(1. + rd.y, 5.);
        suv = uv + dq * ss(.1, .6, dw) * (1. - fr) * ss(0., .08, min(min(uv.x, 1. - uv.x), min(uv.y, 1. - uv.y)));
      }
    }
  }
  if (wt > 0.) {
    // just out of the water: drops cling to the lens and run down it, thinning as they go, until it is dry
    let age = 1. - wt;
    for (var L = 0; L < 2; L++) {
      let sc = select(6., 11., L == 1);
      let q = vec2f(uv.x * asp, uv.y) * sc; let f = fract(q) - .5; let r = h2(floor(q) + f32(L) * 17.3);
      let rad = (.09 + .17 * r.w) * (1. - .5 * age);
      let y0 = -.38 + r.z * .25; let cy = min(y0 + age * (.25 + .6 * r.w), .45);
      let c0 = vec2f((r.y - .5) * .4, cy);
      let live = step(r.x, .8) * ss(0., .3, wt) * ss(.5, .3, cy);
      let e = vec2f(f.x - c0.x, (f.y - c0.y) * .75); let de = length(e);
      let m = ss(rad, rad * .55, de) * live;
      let tr = step(y0, f.y) * step(f.y, c0.y) * ss(.035, .0, abs(f.x - c0.x)) * live * .35; // the wet trail it leaves
      suv -= (f - c0) * m * .9 / sc * vec2f(1. / asp, 1.); lens += m + tr * .4 - .55 * ss(rad * .6, rad, de) * (1. - ss(rad, rad * 1.18, de)) * live;
    }
  }
  // depth of field (focus on what is in the middle of the view) and motion blur from the swimmer's own movement, in one gather
  var c = textureSampleLevel(tS, sC, suv, 0.).rgb;
  {
    let dm = vec2i(textureDimensions(tS)); let sc = f32(dm.y) / 720.; let ctr = dm / 2;
    var inv = 0.;
    inv += 1. / (g.fwd.w / max(textureLoad(tDp, ctr, 0), 1e-6));
    inv += 1. / (g.fwd.w / max(textureLoad(tDp, ctr + vec2i(16, 0), 0), 1e-6));
    inv += 1. / (g.fwd.w / max(textureLoad(tDp, ctr - vec2i(16, 0), 0), 1e-6));
    inv += 1. / (g.fwd.w / max(textureLoad(tDp, ctr + vec2i(0, 11), 0), 1e-6));
    inv += 1. / (g.fwd.w / max(textureLoad(tDp, ctr - vec2i(0, 11), 0), 1e-6));
    inv = inv * .2;
    let coc = min(sc * 6. * abs(1. / zf - inv), sc * 5.);
    let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.); let zz = max(zf, .7);
    var mv = vec2f((-g.mot.x / g.right.w + nd.x * g.mot.z) * .5, -(-g.mot.y / g.up.w + nd.y * g.mot.z) * .5) / zz + vec2f(g.rot.x * .5, -g.rot.y * .5);
    let ml = length(mv); mv = mv * min(ml, .03) / max(ml, 1e-6);
    if (coc > .7 || ml > .0015) {
      var sum = c; var wsum = 1.;
      for (var k = 0; k < 10; k++) {
        let fk = (f32(k) + .5) / 10.; let an = f32(k) * 2.39996; let rad = sqrt(fk) * coc;
        let tuv = suv + mv * (fk - .5) + vec2f(cos(an), sin(an)) * rad * g.res.zw;
        let tp = clamp(vec2i(tuv * vec2f(dm)), vec2i(0), dm - 1);
        let tz = g.fwd.w / max(textureLoad(tDp, tp, 0), 1e-6);
        let tc = min(sc * 6. * abs(1. / tz - inv), sc * 5.);
        let w = .1 + .9 * ss(rad * .5 - 1., rad * .5 + 1., tc);
        sum += textureSampleLevel(tS, sC, tuv, 0.).rgb * w; wsum += w;
      }
      c = sum / wsum;
    }
  }
  c += acc / ws;
  c *= 1. + lens * .12;
  if (g.cam.y < 0.) {
    // from below, the surface beyond the angle of the bright window is a mirror: it shows the seabed upside down. The
    // camera is close to the surface, so that is the view flipped about the horizon, distorted by the waves
    let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
    let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
    let rl = length(rv); let rd = rv / rl;
    if (rd.y > .01) {
      let t0 = -g.cam.y / rd.y;
      if (zf * rl >= t0 * .98) {
        let sw = swell(g.cam.xz + rd.xz * t0, g.cam.w, t0);
        let n = normalize(vec3f(-sw.y, 1., -sw.z));
        let ci = sat(dot(rd, n)); let win = ss(0., .22, 1. - 1.769 * (1. - ci * ci));
        let rr = reflect(rd, n); let zz = dot(rr, g.fwd.xyz);
        if (zz > .05) {
          let q = vec2f(dot(rr, g.right.xyz) / (zz * g.right.w), dot(rr, g.up.xyz) / (zz * g.up.w));
          let m = vec2f(q.x * .5 + .5, .5 - q.y * .5);
          let ed = ss(0., .06, m.x) * ss(1., .94, m.x) * ss(0., .06, m.y) * ss(1., .94, m.y);
          c = mix(c, textureSampleLevel(tS, sC, m, 0.).rgb, (1. - win) * ed * .92);
        }
      }
    }
  }
  if (wt < 0.) {
    // just in: only a cloud of microscopic air bubbles clinging to the lens and rising away
    let k = -wt; var mb = 0.;
    for (var L = 0; L < 3; L++) {
      let q = vec2f(uv.x * asp, uv.y) * (42. + f32(L) * 26.) + vec2f(0., g.cam.w * (1.1 + .5 * f32(L)));
      let f = fract(q) - .5; let r = h2(floor(q) + f32(L) * 9.1);
      mb += ss(.07 + .1 * r.w, .035, length(f - (r.yz - .5) * .6)) * step(r.x, k * .9) * (.5 + .5 * r.w);
    }
    c += vec3f(.7, .9, 1.) * mb * .3 * k;
  }
  if (g.cam.y < 0.) {
    // from below, the surface beyond the angle of the bright window is a mirror: it shows the seabed upside down. The
    // camera is close to the surface, so that is the view flipped about the horizon, distorted by the waves
    let nd = vec2f(uv.x * 2. - 1., 1. - uv.y * 2.);
    let rv = g.fwd.xyz + g.right.xyz * (nd.x * g.right.w) + g.up.xyz * (nd.y * g.up.w);
    let rl = length(rv); let rd = rv / rl;
    if (rd.y > .01) {
      let t0 = -g.cam.y / rd.y;
      if (zf * rl >= t0 * .98) {
        let sw = swell(g.cam.xz + rd.xz * t0, g.cam.w, t0);
        let n = normalize(vec3f(-sw.y, 1., -sw.z));
        let ci = sat(dot(rd, n)); let win = ss(0., .22, 1. - 1.769 * (1. - ci * ci));
        let rr = reflect(rd, n); let zz = dot(rr, g.fwd.xyz);
        if (zz > .05) {
          let q = vec2f(dot(rr, g.right.xyz) / (zz * g.right.w), dot(rr, g.up.xyz) / (zz * g.up.w));
          let m = vec2f(q.x * .5 + .5, .5 - q.y * .5);
          let ed = ss(0., .06, m.x) * ss(1., .94, m.x) * ss(0., .06, m.y) * ss(1., .94, m.y);
          c = mix(c, textureSampleLevel(tS, sC, m, 0.).rgb, (1. - win) * ed * .92);
        }
      }
    }
  }
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .06) + bl * .03;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .55;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .55);
  c *= l / max(l0, 1e-4);
  c = mix(c, vec3f(l), ss(.55, 1., l) * .1);
  c = mix(vec3f(l), c, .93) + vec3f(.008, .002, 0.);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
