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
