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
  return min(d, 3. - p.y);
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
struct G { vp: mat4x4f, sm: mat4x4f, cam: vec4f, right: vec4f, up: vec4f, fwd: vec4f, sun: vec4f, res: vec4f, mis: vec4f };
const SIG = vec3f(.058, .0296, .0186);
const KD = vec3f(.056, .0288, .0164);
const WCOL = vec3f(.085, .43, .96);
const KDZ = vec3f(.034, .023, .018);
const PCOL = vec3f(.44, .40, .96);
const SUNC = vec3f(1.66, 1.6, 1.56);
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
  let a0 = sg(z) - k * rd.y;
  let a = select(a0, vec3f(1e-4), abs(a0) < vec3f(1e-4)); // looking almost straight up a channel can reach 0
  let I = (1. - exp(-a * d)) / a;
  let mu = max(dot(rd, sun), 0.);
  let m2 = mu * mu;
  return mix(WCOL, PCOL, z) * sg(z) * exp(k * ro.y) * I * (1.22 + .3 * m2 * m2);
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
  return mix(c, vec3f(.33), ss(35., 100., d));
}
fn caus2(p: vec3f, d: f32) -> f32 {
  let q = cuv(p);
  let c = min(pow(textureSample(tW, sR, q / 4.1).r, 1.4) * 2.6 * (.45 + textureSample(tW, sR, q.yx / 6.9 + .37).r * 1.3), 2.6);
  return mix(c, .33, ss(35., 100., d));
}
fn sunE(y: f32, z: f32) -> vec3f { return SUNC * exp(kd(z) * (min(y, 0.) / g.sun.y)) * (.5 + .5 * sat(-y / 30.)); }
fn vol(p: vec3f) -> vec4f { return textureSampleLevel(tV, sC, (p - vec3f(-192., -56., -192.)) / vec3f(384., 60., 384.), 0.); }
fn amb(p: vec3f, n: vec3f, sky: f32, z: f32) -> vec3f {
  let up = n.y * .5 + .5;
  return mix(vec3f(.18, .54, .86), vec3f(.34, .56, .82), z) * exp(kd(z) * min(p.y, 0.) * 1.2) * (.3 + .7 * sky) * (.24 + .76 * up * up) * 1.3 * (.55 + .45 * sat(-p.y / 30.)) + vec3f(.012, .034, .058);
}
fn zone(p: vec3f) -> f32 { return mix(g.sun.w, textureSampleLevel(tM, sC, p.xz / 384. + .5, 0.).b, .2); }
fn side(p: vec3f, n: vec3f, open: f32, z: f32) -> vec3f { return mix(WCOL, PCOL, z) * exp(kd(z) * min(p.y, 0.)) * open * (1. - abs(n.y)) * .7; }
// skylight at most 150 m along the ray: past that, terrain and the background behind it (vsB) get the same haze
fn fog(c: vec3f, wp: vec3f, z: f32) -> vec3f {
  let v = wp - g.cam.xyz; let d = length(v); let rd = v / d;
  return c * exp(-sg(z) * d) * ss(230., 185., d) + fogIn(g.cam.xyz, rd, d, z, g.sun.xyz) * (.58 + .42 * vol(g.cam.xyz + rd * min(d, 150.)).g);
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
  var w = i.a.xyz + qrot(i.b, i.p * sc);
  w.y += sin(g.cam.w * .3 + i.c.y * 40.) * i.c.w;
  if (abs(i.c.x - 6.) < .5) { // soft coral bends with the current, more toward its tips
    let h = i.p.y * sc; let ph = dot(i.a.xz, vec2f(.9, .6)) + i.c.y * 6.;
    w += vec3f(.8, 0., .6) * (sin(g.cam.w * .8 + ph + h * .7) * .07 * h * h) + vec3f(-.6, 0., .8) * (cos(g.cam.w * .63 + ph * 1.3 + h) * .04 * h * h);
  }
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
  } else if (mat == 6) { // soft coral: pastel flesh, paler glowing tips
    let hue = fract(sd * 9.17);
    alb = mix(vec3f(.95, .32, .58), vec3f(.6, .34, .95), fract(hue * 3.));
    if (hue > .66) { alb = vec3f(1., .58, .22); }
    if (hue > .86) { alb = vec3f(.9, .55, .7); }
    alb = mix(alb * .45, mix(alb, vec3f(1.), .1), ss(.3, 1., i.ao)) * (.6 + .3 * B.h);
    emi = alb * .03 * ss(.5, 1., i.ao); flu = .3; gloss = .3; bump = .25;
  } else if (mat == 7) { // anemone column
    alb = mix(vec3f(.3, .13, .3), vec3f(.4, .2, .14), fract(sd * 3.9)) * (.5 + .6 * B.h); gloss = .3; bump = .5;
  } else {
    let hue = fract(sd * 5.73);
    alb = mix(vec3f(.80, .08, .10), vec3f(.90, .22, .40), fract(hue * 4.));
    if (hue > .7) { alb = vec3f(.88, .42, .10); }
    if (hue > .9) { alb = vec3f(.55, .22, .75); }
    alb *= (.4 + .8 * B.h) * (.5 + .9 * i.ao * i.ao);
    alb = mix(alb, vec3f(1., .75, .6), ss(.8, 1., i.ao) * .35);
    emi = alb * .01; flu = .75; gloss = .25; bump = 1.5;
  }
  let rip = select(0., flt * gm.a * cos((i.wp.x * .8 + i.wp.z * .35) * 5. + A.c * 9.) * .65, mat == 0);
  let N = normalize(qrot(i.q, normalize(on + (A.n * .85 + B.n * .65 + C.n * .45 * ss(60., 12., dist) + F.n * .5 * fk) * bump + vec3f(.8, sgro, .35) * vec3f(rip, 1., rip))));
  let L = g.sun.xyz; let V = normalize(g.cam.xyz - i.wp);
  let v1 = vol(i.wp + n0 * 1.5); let v2 = vol(i.wp + n0 * 4.5);
  let ao = (sat((v1.r - .5) * 8.) * .55 + sat((v2.r - .5) * 2.7) * .45) * vao * ss(.12, .6, hgt);
  let z = zone(i.wp);
  let E = sunE(i.wp.y, z) * shadow9(i.wp + n0 * .35);
  let ndl = sat(dot(N, L));
  let am = (amb(i.wp, N, v1.g, z) + side(i.wp, N, sat((v2.r - .5) * 2.7), z)) * ao;
  let dl = E * ndl * (.10 + mix(vec3f(.33), ca, ss(.1, .45, dot(n0, L))) * 2.5);
  var c = alb * (dl + am) + emi + alb * flu * dot(dl + am, vec3f(.1, .5, .5));
  // the diver's lamp: what the camera passes closely keeps its form and its true colours
  c += alb * vec3f(1., .97, .9) * (.42 / (1. + dist * dist * .07)) * (.25 + .75 * sat(dot(N, V))) * (.4 + .6 * ao);
  let H = normalize(V + L);
  c += E * (.25 + ca) * pow(sat(dot(N, H)), mix(10., 70., gloss)) * gloss * ndl * 1.8;
  c += (amb(i.wp, reflect(-V, N), v1.g, z) + side(i.wp, reflect(-V, N), sat((v2.r - .5) * 2.7), z)) * ao * (.08 + gloss) * .6 * pow(1. - sat(dot(N, V)), 2.5);
  return fin(fog(c, i.wp, z));
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
  let a = .024 * pow(max(h, 0.), 1.25);
  return a * (vec2f(sin(t * .5 + ph + h * .09), cos(t * .37 + ph * 1.3 + h * .07)) + .35 * vec2f(sin(t * 1.3 + ph * 3. + h * .3), cos(t * 1.1 + ph * 2. + h * .23)));
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
  let farK = select((1. - ss(far * .8, far, cd)) * ss(.9, 2.6, length(g.cam.xyz - i.a.xyz - d * clamp(dot(g.cam.xyz - i.a.xyz, d), 0., len))) * ss(len * 1.1 + .5, len * 2.2 + 1.2, distance(i.a.xyz + d * (len * .5), g.cam.xyz)), 1., shp_);
  let ruf = sin(v * 10. + s2 * 30. + t * .6) * i.b.z * .36 * u * shape2(v) * nearK;
  var p = c + S * (u * farK * select(i.b.z * .5 * shape, select(max(i.b.z * .5, .09) * shape, 0., ty == 1), shp_));
  p += N2 * ruf;
  let sw = sway(i.a.xz, hA + (p.y - i.a.y), t);
  p.x += sw.x; p.z += sw.y;
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
  o.col = pal(b.y) * (.12 + tw * 1.7) * lit * e * e * exp(-SIG.g * d) * ss(.4, 1.5, d) * 17.;
  return o;
}
@fragment fn fsGl(i: GO) -> @location(0) vec4f {
  let r = dot(i.uv, i.uv);
  return vec4f(min(i.col * exp(-r * 7.) * (1. - ss(.7, 1., r)), vec3f(10.)), 0.);
}
@fragment fn fs(i: LO, @builtin(front_facing) ff: bool) -> @location(0) vec4f {
  let dist = length(i.wp - g.cam.xyz);
  let ca = caus2(i.wp, dist);
  // which way "across the blade" points in the world, from how the blade coordinate changes over the screen
  let gu = dpdx(i.wp) * dpdx(i.uv.x) + dpdy(i.wp) * dpdy(i.uv.x);
  var n = normalize(i.n); if (!ff) { n = -n; }
  // the blade is drawn flat but shaded as if gently curved across its width
  n = normalize(n + gu / max(length(gu), 1e-9) * (i.uv.x * .55));
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
  let am = (amb(i.wp, n, vv.g, z) + amb(i.wp, -n, vv.g, z) * i.pr.y * .55 * vec3f(1.1, 1.15, .7) + side(i.wp, n, sat((vv.r - .5) * 4.), z) * .6) * (.46 + .54 * aov);
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

// ---------------------------------------------------------------- tentacles (anemones, polyps, sea whips)
// One ribbon per tentacle, turned to face the camera and shaded as a round tube; no mesh, the strip is built from the
// vertex index like the leaves. a = root xyz + length, b = axis xyz + radius, c = kind, seed, colour, phase.
// Kinds: 0 anemone tentacle (b = its rest direction), 1 arm of a polyp that opens and closes (b = the polyp's axis,
// the seed places the arm around it), 2 sea whip.
const W_TENT = S_B + /*wgsl*/`
override ROWS: f32 = 8.;
struct TI { @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct TO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) uv: vec2f, @location(2) sd: vec3f, @location(3) @interpolate(flat) m: vec4f, @location(4) lt: f32 };
fn tpos(a: vec4f, b: vec4f, c: vec4f, v: f32, t: f32) -> vec3f {
  let d = b.xyz; let e1 = normalize(cross(d, vec3f(.31, .2, .93))); let e2 = cross(d, e1); let s = c.y;
  // the current comes in waves that travel across the reef
  let cur = vec3f(.8, 0., .6) * sin(t * .8 + dot(a.xz, vec2f(.9, .6)) + c.w * 6.3);
  if (c.x < .5) {
    let out = d - vec3f(0., d.y, 0.); // tentacles lean out, droop under their own weight and curl at the tip
    return a.xyz + (d * v + out * (.55 * v * v) - vec3f(0., .32 * v * v * v, 0.)
      + e1 * (sin(v * 3.2 + t * 1.1 + s * 40.) * .2 * v + sin(v * 7. + s * 9.) * .07 * v * v) + e2 * (cos(v * 2.7 + t * .9 + s * 31.) * .2 * v) + cur * (.34 * v * v)) * a.w;
  }
  if (c.x < 1.5) { // the arm curls away from the axis by an angle that pulses: an arc in closed form
    let az = s * TAU; let rad = e1 * cos(az) + e2 * sin(az);
    let f = .7 + .55 * sin(t * 1.6 + c.w * 6.3);
    return a.xyz + (d * sin(f * v) + rad * (1. - cos(f * v))) * (a.w / f) + cur * (.05 * v * a.w);
  }
  return a.xyz + (d * v + e1 * (sin(v * 4. + s * 20.) * .13 * v) + e2 * (cos(v * 3.1 + s * 33.) * .1 * v) + cur * (.16 * v * v)) * a.w;
}
@vertex fn vs(@builtin(vertex_index) vi: u32, i: TI) -> TO {
  var o: TO;
  let u = f32(vi & 1u) * 2. - 1.; let v = 1. - pow(1. - f32(vi >> 1u) / (ROWS - 1.), 1.7); let t = g.cam.w; // rows bunch up toward the rounded tip
  let p = tpos(i.a, i.b, i.c, v, t);
  let tg = normalize(tpos(i.a, i.b, i.c, v + .04, t) - tpos(i.a, i.b, i.c, v - .04, t));
  let vd = g.cam.xyz - p; let dist = length(vd);
  let sd = normalize(cross(tg, vd / dist));
  // tapering, with a bulb at the tip of anemone tentacles and polyp arms; never thinner than about a pixel
  var r = i.b.w * (1. - .45 * v);
  if (i.c.x < 1.5) { let q = (v - .87) / .08; r += i.b.w * .6 * exp(-q * q); }
  r *= sqrt(max(1. - pow(max(v - .93, 0.) / .07, 2.), 0.));
  r = max(r, dist * .0007 * step(v, .99));
  if (g.res.x > 0. && dist > 85. * g.mis.z) { r = 0.; }
  let w = p + sd * (u * r);
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.uv = vec2f(u, v); o.sd = sd; o.m = i.c; o.lt = shadow1(i.a.xyz + i.b.xyz * .3);
  return o;
}
@fragment fn fs(i: TO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz; let u = i.uv.x; let v = i.uv.y;
  let n = normalize(normalize(i.sd) * u + V * sqrt(max(1. - u * u, 0.)));
  let z = zone(i.wp); let vv = vol(i.wp); let ca = caus2(i.wp, distance(g.cam.xyz, i.wp));
  let h = i.m.z; let k = i.m.x; let tip = ss(.78, .95, v);
  var body = vec3f(.85, .2, .6); var tc = vec3f(.3, .95, 1.);
  if (h > .25) { body = vec3f(.2, .75, .42); tc = vec3f(1., .45, .8); }
  if (h > .5) { body = vec3f(.9, .72, .46); tc = vec3f(.7, .4, 1.); }
  if (h > .75) { body = vec3f(.16, .36, .95); tc = vec3f(1., .82, .3); }
  var alb = mix(body * (.4 + .6 * v), tc, tip); var emi = tc * tip * .22 + body * .03 * v;
  if (k > 1.5) { // sea whip: warm stem, a row of pale glowing polyps
    let st = mix(vec3f(.85, .16, .1), vec3f(1., .6, .1), fract(h * 3.));
    alb = st * (.72 + .28 * sin(v * 170. + u * 2.)) * (.6 + .4 * v); emi = st * .05 * v;
  } else if (k > .5) { // polyp: pale arms, the pulse shows as a soft glow
    alb = mix(mix(vec3f(.75, .8, 1.), vec3f(1., .75, .85), fract(h * 2.)), vec3f(1.), tip * .6);
    emi = alb * (.06 + .1 * tip);
  }
  let E = sunE(i.wp.y, z) * i.lt * (.5 + .5 * ca);
  let ndl = dot(n, L);
  var c = alb * (E * (.3 + .7 * sat(ndl) + .3 * sat(-ndl)) + amb(i.wp, n, vv.g, z) * 1.25) * (.5 + .5 * sqrt(max(1. - u * u, 0.)));
  c += E * pow(sat(dot(n, normalize(V + L))), 30.) * .5 + alb * pow(abs(u), 3.) * .25 * vv.g;
  c += emi * (.8 + .2 * sin(g.cam.w * 1.7 + i.m.y * 50.));
  return fin(fog(c, i.wp, z));
}
`;

// ---------------------------------------------------------------- fish + mantas
const W_ANIM = S_B + /*wgsl*/`
struct VI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f };
struct VO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec3f, @location(3) @interpolate(flat) sd: f32, @location(4) lt: f32 };
// Fish instances: a = home xyz + radius, b = seed, speed, size, phase, c = colours, behaviour, two behaviour parameters.
// Behaviours: 0 ribbon school, 1 hovering cloud, 2 bait ball, 3 hunter, 4 loner. Every one is a function of time alone,
// so nothing is simulated: fpos() gives where a fish is at time t, and its heading comes from asking again a moment
// earlier and later.
struct FI { @location(0) p: vec3f, @location(1) n: vec4f, @location(2) a: vec4f, @location(3) b: vec4f, @location(4) c: vec4f };
struct FO { @builtin(position) cp: vec4f, @location(0) wp: vec3f, @location(1) n: vec3f, @location(2) op: vec4f, @location(3) @interpolate(flat) sd: vec3f, @location(4) lt: f32 };
// the slowly drifting centre of a bait ball
fn ballC(a: vec4f, ph: f32, t: f32) -> vec3f { return a.xyz + vec3f(sin(t * .07 + ph * 9.) * 3., sin(t * .11 + ph * 5.) * 1.2, cos(t * .06 + ph * 7.) * 3.); }
// A hunter flies a figure of eight whose crossing point is the ball, so it cuts through it twice per 48 s loop, and
// fastest there. Bait fish call this too, to get out of its way.
fn hunter(a: vec4f, ph: f32, k: f32, t: f32) -> vec3f {
  let u0 = t * .13 + k * 2.3 + ph * 6.3; let u = u0 - .35 * sin(2. * u0);
  let an = k * 2.1 + ph * 4.; let d = vec3f(cos(an), .12 * sin(k * 5. + 1.), sin(an)); let e = vec3f(-d.z, .35, d.x);
  return ballC(a, ph, t) + d * (a.w * 3.6 * cos(u)) + e * (a.w * 1.5 * sin(2. * u));
}
fn fpos(a: vec4f, b: vec4f, c: vec4f, t: f32) -> vec3f {
  let s = b.x; let h = vec3f(hs(s), hs(s + .37), hs(s + .71)); let R = a.w;
  if (c.y < .5) { // a ribbon of fish circling an ellipse, rising and falling
    let ta = t * b.y + b.w * 6.3 + (h.x - .5) * (26. * c.z / R); let ph = b.w * 17.;
    let T = normalize(vec3f(-R * sin(ta), 6.6 * cos(3. * ta + ph), R * .6 * cos(ta)));
    let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
    return a.xyz + vec3f(R * cos(ta), 2.2 * sin(3. * ta + ph), R * .6 * sin(ta))
      + (S * ((h.y - .5) * 5. + sin(t * .6 + s * 40.) * .5) + Up * ((h.z - .5) * 3.2 + cos(t * .5 + s * 31.) * .4)) * c.z;
  }
  if (c.y < 1.5) { // a cloud hovering over its home; every so often it darts in toward the reef and drifts back out
    let q = (h - .5) * 2.;
    let br = fract(t / (9. + 6. * b.w) + b.w + c.w);
    let k = 1. - .5 * ss(0., .05, br) * exp(-max(br - .05, 0.) * 7.);
    let w = vec3f(sin(t * (.5 + h.x) + s * 31.), sin(t * (.4 + h.y) + s * 17.) * .6, sin(t * (.45 + h.z) + s * 23.)) * (.25 + .08 * R) * c.z;
    return a.xyz + vec3f(q.x, q.y * .55 + .25, q.z) * (R * (.35 + .65 * hs(s + .13)) * k) + w * k;
  }
  if (c.y < 2.5) { // bait ball: a swirling shell of fish that opens up around each hunter
    let la = h.y * 2. - 1.; let cl = sqrt(1. - la * la);
    let rd = R * (.12 + .88 * pow(h.z, .55)) * (1. + .07 * sin(t * .9 + b.w * 20.));
    let th = h.x * TAU + t * (.3 + .25 * h.z) * (.4 + .6 * cl) + sin(t * .7 + s * 20.) * .15;
    var p = ballC(a, b.w, t) + vec3f(cos(th) * cl, la * .8 + sin(t * 1.3 + s * 9.) * .04, sin(th) * cl) * rd;
    for (var k = 0; k < 2; k++) {
      let d = p - hunter(a, b.w, f32(k), t + .35); let l = length(d); let ro = R * .75;
      p += d / max(l, .01) * (ro * 1.1 * exp(-l * l / (ro * ro)));
    }
    return p;
  }
  if (c.y < 3.5) { // hunter c.z of its ball; followers (c.w > 0) trail the leader
    return hunter(a, b.w, c.z, t - c.w * .3) + (h - .5) * vec3f(5., 3., 5.) * step(.01, c.w);
  }
  // loner: wanders a loop near home, nearly stopping now and then
  let u0 = t * b.y + b.w * 6.3; let u = u0 - .27 * sin(u0 * 3.);
  return a.xyz + vec3f(R * cos(u) + R * .3 * cos(2.7 * u + c.w * 9.), c.z * sin(1.9 * u + c.w * 5.), R * .7 * sin(u) + R * .3 * sin(2.3 * u + c.w * 4.));
}
@vertex fn vsFish(i: FI) -> FO {
  var o: FO;
  let s = i.b.x; let t = g.cam.w; let bh = i.c.y;
  var P = fpos(i.a, i.b, i.c, t);
  // fish keep their distance from the camera (further for big fish), so none fills the view or gets cut by it
  { let dc = P - g.cam.xyz; let dl = length(dc); P += dc / max(dl, .01) * max(1.2 + 2.6 * i.b.z - dl, 0.); }
  var v = (fpos(i.a, i.b, i.c, t + .1) - fpos(i.a, i.b, i.c, t - .1)) * 5.;
  let sp = min(length(v), 5.);
  // hovering fish face into the current
  if (bh > .5 && bh < 1.5) { v += vec3f(cos(i.b.w * 6.3), 0., sin(i.b.w * 6.3)) * .7; }
  // fish swim close to level: the climb or dive is at most a third of the forward speed
  { let hl = length(v.xz) + .05; v.y = clamp(v.y * .6, -.33 * hl, .33 * hl); }
  let T = normalize(v + vec3f(1e-3, 0., 0.));
  let S = normalize(cross(vec3f(0., 1., 0.), T)); let Up = cross(T, S);
  let sz = i.b.z * (.8 + .4 * hs(s + .71)); let fi = abs(i.n.w);
  var l = i.p * sz; let tw = .5 - i.p.x;
  // swimming: a wave that grows toward the tail, harder when the fish is fast; fins ripple on their own
  l.z += sin(t * 6. / sqrt(i.b.z) + s * 50. + i.p.x * 5.) * (.04 + .025 * sp) * tw * tw * sz;
  l.z += sin(t * 12. + i.p.x * 20. + s * 9.) * fi * .04 * sz;
  let w = P + T * l.x + Up * l.y + S * l.z;
  o.cp = g.vp * vec4f(w, 1.); o.wp = w; o.n = T * i.n.x + Up * i.n.y + S * i.n.z; o.op = vec4f(i.p, i.n.w);
  var pan = 0.;
  if (bh > 1.5 && bh < 2.5) { for (var k = 0; k < 2; k++) { let d = length(P - hunter(i.a, i.b.w, f32(k), t)) / (i.a.w * .9); pan = max(pan, exp(-d * d)); } }
  o.sd = vec3f(s, i.c.x, pan);
  o.lt = shadow1(w);
  return o;
}
fn irid(x: f32) -> vec3f { return .5 + .5 * cos(TAU * (vec3f(0., .33, .67) + x)); }
// Colours (i.sd.y): 0 bait, 1 orange-magenta anthias, 2 violet-gold anthias, 3 triggerfish, 4 hunter, 5 clownfish,
// 6 butterflyfish, 7 blue tang, 8 idol, 9 parrotfish, 10 fusilier, 11 chromis. x runs nose (+.5) to tail, y is height.
@fragment fn fsFish(i: FO) -> @location(0) vec4f {
  let V = normalize(g.cam.xyz - i.wp); let L = g.sun.xyz;
  let z = zone(i.wp); let vv = vol(i.wp);
  let ca = caus2(i.wp, distance(g.cam.xyz, i.wp));
  var n = normalize(i.n); let fi = abs(i.op.w);
  if (fi > .02 && dot(n, V) < 0.) { n = -n; }
  let x = i.op.x; let y = i.op.y; let s = i.sd.x;
  let back = ss(-.03, .08, y);
  var alb = vec3f(.5); var emi = vec3f(0.); var ir = .2; var fc = vec3f(.5); var fg = vec3f(0.);
  switch (u32(i.sd.y + .5)) {
    case 0u: {
      alb = mix(vec3f(.5, .62, .74), vec3f(.07, .2, .4), back);
      alb = mix(alb, vec3f(.95, .8, .3), step(.86, fract(s * 7.7)) * .5); fc = alb; ir = .35;
    }
    case 1u: {
      alb = mix(vec3f(1., .42, .1), vec3f(.95, .15, .45), ss(.3, -.35, x)) * (.8 + .2 * back);
      alb = mix(alb, vec3f(.75, .3, 1.), ss(.014, .004, abs(y - .02 + .12 * (x - .36))) * ss(.05, .2, x) * step(x, .34));
      fc = mix(alb, vec3f(.7, .25, .95), ss(.35, 1., fi)); fg = vec3f(1., .3, .75) * .5; ir = .3;
    }
    case 2u: {
      alb = mix(vec3f(.5, .15, .85), vec3f(1., .75, .1), ss(.0, .09, y - .03 + x * .1));
      fc = mix(alb, vec3f(1., .8, .15), ss(.2, .8, fi)); fg = vec3f(1., .7, .2) * .5; ir = .3;
    }
    case 3u: {
      var q = vec2f(x + .03 * sin(y * 23.), y + .02 * sin(x * 17.)) * 8.; q.x += floor(q.y) * .5;
      let hh = hs(dot(floor(q), vec2f(7.3, 13.1)));
      let sp = ss(.2 + .2 * hh, .12 + .18 * hh, length(fract(q) - .5 - (vec2f(hh, fract(hh * 7.)) - .5) * .4)) * ss(.02, -.04, y);
      let wv = .05 * sin(y * 37. + x * 11.) + .03 * sin(x * 29.);
      let li = ss(.16, .03, abs(sin((x + wv) * 21. + y * 15.))) * ss(.02, .08, y) * ss(.42, .3, x) * (.5 + .5 * sin(x * 13. + 2.));
      alb = mix(vec3f(.03, .05, .13), vec3f(.95, .97, 1.), sp);
      alb = mix(alb, vec3f(1., .75, .1), min(li, 1.) * .8);
      alb = mix(alb, vec3f(1., .4, .05), ss(.41, .47, x));
      emi = vec3f(.3, .9, 1.) * sp * .35 + vec3f(1., .7, .1) * min(li, 1.) * .2;
      fc = mix(vec3f(.04, .08, .18), vec3f(.1, .5, .7), ss(.5, 1., fi)); fg = vec3f(.2, .9, 1.) * .6;
    }
    case 4u: {
      alb = mix(vec3f(.4, .47, .55), vec3f(.02, .06, .13), ss(-.02, .05, y));
      emi = vec3f(.2, .85, 1.) * ss(.012, .002, abs(y - .012)) * ss(-.42, .2, x) * ss(.42, .3, x) * .8;
      fc = mix(vec3f(.1, .14, .2), vec3f(.3, .42, .5), fi); fg = vec3f(.2, .6, .8) * .15; ir = .4;
    }
    case 5u: {
      let bd = min(min(abs(x - .27), abs(x + .02)), abs(x + .3)); let wb = ss(.05, .035, bd);
      alb = mix(mix(vec3f(1., .36, .04), vec3f(.01), ss(.075, .055, bd)), vec3f(1.), wb);
      emi = vec3f(.6, .8, 1.) * wb * .25;
      fc = mix(vec3f(1., .4, .05), vec3f(.02), ss(.6, .9, fi)); fg = vec3f(1., .5, .1) * .6;
    }
    case 6u: {
      alb = mix(vec3f(.98, .96, .9), vec3f(1., .78, .08), ss(.05, -.3, x - y * .5));
      alb *= 1. - .5 * ss(.8, 1., sin((x + abs(y) * .7) * 70.));
      alb = mix(alb, vec3f(.02), ss(.035, .02, abs(x - .36)));
      let es = length(vec2f(x + .22, y - .14));
      alb = mix(alb, vec3f(.02), ss(.06, .045, es));
      emi = vec3f(.3, .9, 1.) * ss(.075, .06, es) * ss(.045, .06, es) * 1.2;
      fc = vec3f(1., .8, .1); fg = vec3f(1., .8, .2) * .5;
    }
    case 7u: {
      let mk = ss(0., .03, y - .05 - 1.2 * (x + .02) * (x + .02)) * ss(.32, .26, x);
      alb = mix(vec3f(.03, .22, 1.), vec3f(.01, .01, .04), mk * .9);
      emi = vec3f(.05, .3, 1.) * .05 * (1. - mk);
      fc = mix(vec3f(.03, .22, 1.), vec3f(1., .85, .1), ss(-.38, -.46, x)); fg = fc * .6;
    }
    case 8u: {
      alb = mix(vec3f(.97, .95, .85), vec3f(1., .8, .15), ss(0., -.25, x));
      alb = mix(alb, vec3f(.02), max(ss(.06, .04, abs(x - .24)), ss(.07, .05, abs(x + .2))));
      alb = mix(alb, vec3f(1., .45, .05), ss(.42, .48, x));
      fc = mix(vec3f(.02), vec3f(.95), ss(.1, .5, fi)); fg = vec3f(.8, .9, 1.) * .35;
    }
    case 9u: {
      var q = vec2f(x, y) * 19.; q.x += floor(q.y) * .5;
      let ed = ss(.3, .52, length(fract(q) - vec2f(.5, .42)));
      let base = mix(vec3f(.08, .8, .72), vec3f(.98, .4, .62), ss(.3, -.3, x + y * .5 + .12 * sin(y * 14.))) * (.82 + .36 * hs(dot(floor(q), vec2f(3.1, 17.7))));
      alb = base * (1. - .3 * ed); emi = base * (1. - ed) * .04;
      fc = vec3f(.1, .5, .95); fg = vec3f(.3, .8, 1.) * .7; ir = .45;
    }
    case 10u: {
      let st = ss(.022, .008, abs(y - .045));
      alb = mix(mix(vec3f(.8, .85, .9), vec3f(.08, .4, .95), ss(-.02, .05, y)), vec3f(1., .85, .1), st);
      emi = vec3f(1., .8, .1) * st * .25; fc = vec3f(1., .85, .15); fg = fc * .4;
    }
    default: {
      alb = mix(vec3f(.5, .95, .8), vec3f(.2, .7, .9), back); ir = .7; fc = alb; fg = vec3f(.3, 1., .8) * .5;
    }
  }
  if (fi < .02) { // eye
    let e = length(vec2f(x - .36, y - .035));
    alb = mix(mix(alb, vec3f(.95, .85, .5), ss(.036, .03, e)), vec3f(.01), ss(.024, .019, e));
  }
  alb = mix(alb, fc, ss(.02, .2, fi)); emi += fg * fi * fi * .6;
  let E = sunE(i.wp.y, z) * i.lt * (.55 + .45 * ca);
  let ndl = dot(n, L); let ndv = sat(dot(n, V));
  // fins let some light through from behind
  var c = alb * (E * (.25 + .75 * sat(ndl) + fi * .45 * sat(-ndl)) + amb(i.wp, n, vv.g, z) * (.3 + .6 * sat((vv.r - .5) * 2.7)) * (.6 + .4 * sat(n.y * .5 + .5 + ndl * .5)));
  c += E * pow(sat(dot(n, normalize(V + L))), 24.) * (1.2 + i.sd.z * 3.) * (1. - fi) + vec3f(.3, .6, .7) * pow(1. - ndv, 3.) * .25 * vv.g;
  c += irid(ndv * 1.2 + x * .6 + s) * ir * pow(1. - ndv, 1.5) * (E + .1);
  if (i.sd.y < .5) { c += E * pow(sat(dot(n, normalize(V + L))), 5.) * (.5 + 1.5 * i.sd.z) * (1. - back); }
  c += emi * (.75 + .25 * sin(g.cam.w * 2. + s * 40.));
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
@fragment fn fs(i: VO) -> @location(0) vec4f {
  let v = i.wp - g.cam.xyz; let d = length(v); let V = v / d;
  let fl = ss(260., 60., d);
  let s = (textureSample(tW, sR, i.wp.xz / 13.).ba + textureSample(tW, sR, i.wp.zx / 4.7 + .2).ba * .7 + textureSample(tW, sR, i.wp.xz / 37. + .6).ba * .8) * fl
    // fine ripples, only near the camera (further off they would shimmer)
    + (textureSample(tW, sR, i.wp.xz / 1.9 + .4).ba * .4 + textureSample(tW, sR, i.wp.zx / .77 + .1).ba * .22) * ss(55., 5., d);
  let n = normalize(vec3f(-s.x * .8, -1., -s.y * .8));
  let ci = sat(dot(V, -n));
  let k = 1. - 1.769 * (1. - ci * ci);
  let win = ss(0., .22, k);
  let rr = refract(V, n, 1.33);
  let sd = max(dot(rr, g.sun.xyz), 0.);
  let fr = pow(1. - sqrt(max(k, 0.)), 5.);
  let sky = (vec3f(.27, .71, 1.) * 1.3 * clamp(1. + 2.3 * (s.x * .6 - s.y * .8), .5, 2.2) + vec3f(1., .95, .85) * (pow(sd, 60.) * 1.3 + pow(sd, 500.) * 12. + pow(sd, 4000.) * 22.)) * (1. - fr);
  let z = zone(i.wp);
  let R = reflect(V, n);
  let refl = fogIn(i.wp, R, 300., z, g.sun.xyz) * 1.15;
  let c = mix(refl, sky, win);
  return fin(fog(c, i.wp, z));
}
// behind everything: where no terrain is drawn (it stops at ~240 m) the water looks as it does at that distance
@vertex fn vsB(@builtin(vertex_index) i: u32) -> VO {
  var o: VO;
  let p = vec2f(f32(i & 1u), f32(i >> 1u)) * 2. - 1.;
  o.wp = g.cam.xyz + g.fwd.xyz + g.right.xyz * (p.x * g.right.w) + g.up.xyz * (p.y * g.up.w);
  o.cp = vec4f(p, 1e-7, 1.);
  return o;
}
@fragment fn fsB(i: VO) -> @location(0) vec4f {
  let p = g.cam.xyz + normalize(i.wp - g.cam.xyz) * 240.;
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
  return vec4f(min(max(c * al, vec3f(0.)), vec3f(20.)), al);
}
@vertex fn vsSnow(@builtin(vertex_index) vi: u32, @location(0) a: vec4f) -> VO {
  var o: VO; let q = quad(vi); let t = g.cam.w;
  let B = 44.;
  var p = a.xyz * B + vec3f(t * .22, t * .05, t * .13) + .5 * vec3f(sin(t * .3 + a.x * 60.), sin(t * .23 + a.y * 50.), cos(t * .27 + a.z * 70.));
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
  return vec4f(min(max(c * m * m * i.pr.x * exp(-SIG.g * i.pr.w), vec3f(0.)), vec3f(8.)), 0.);
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
    let o = textureSampleLevel(tV, sC, (p - vec3f(-192., -56., -192.)) / vec3f(384., 60., 384.), 0.).r;
    let mist = sat(1. - (o - .5) * 3.4);
    acc += exp(-sgz * t + k * (p.y / sx.y)) * (vis * (.012 + pat * 6.) * (1. + 1.2 * mist * mist));
  }
  let mu = max(dot(rd, sx), 0.);
  let ph = mix(.2 + 2.0 * mu * mu * mu, .8, g.sun.w);
  let wc = mix(WCOL + vec3f(.04, .07, .05), PCOL + vec3f(.12, .06, .04), g.sun.w);
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
  var c = textureLoad(tS, px, 0).rgb + acc / ws;
  let bl = textureSampleLevel(tB, sC, uv, 0.).rgb;
  c = mix(c, bl, .06) + bl * .03;
  c *= g.mis.x;
  let q = uv - .5;
  c *= 1. - dot(q, q) * .55;
  c = tmap(c);
  let l0 = dot(c, vec3f(.2126, .7152, .0722));
  let l = mix(l0, l0 * l0 * (3. - 2. * l0), .4);
  c *= l / max(l0, 1e-4);
  c = mix(c, vec3f(l), ss(.55, 1., l) * .1);
  c = mix(vec3f(l), c, .95) + vec3f(.002, .003, .007);
  c = pow(max(c, vec3f(0.)), vec3f(1. / 2.2));
  let n = ign(fc.xy) + ign(fc.xy + 37.) - 1.;
  return vec4f(c + n / 255., 1.);
}
`;
