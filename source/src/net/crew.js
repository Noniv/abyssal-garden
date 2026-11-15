// ============================================================================
// Abyssal Crew: the multiplayer layer, only in the crew build (node build.mjs --crew).
// Lobbies, other divers' subs, discoveries to analyse for points, emotes, chat and proximity voice.
// main.js reaches it through `typeof NET !== 'undefined'` guards, so the single-player page is unchanged.
// ============================================================================
const NET = (() => {
  const IT = /^it/i.test(navigator.language || '');
  const tr = (it, en) => (IT ? it : en);
  const nm = (o) => (IT ? o.it : o.en);
  const make = (tag, cls, text, parent) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const load = (k) => { try { return localStorage[k] || ''; } catch { return ''; } };
  const save = (k, v) => { try { localStorage[k] = v; } catch {} };
  const byte = (v) => round(clamp(v, 0, 1) * 255);
  const pack = (c, k = 1) => byte(c[0] * k) * 65536 + byte(c[1] * k) * 256 + byte(c[2] * k);
  const css = (c) => `rgb(${byte(c[0])},${byte(c[1])},${byte(c[2])})`;
  const SKIN = Object.fromEntries(SKINS.map((s) => [s.key, s]));
  const KIND = {
    fish: tr('forma di vita sconosciuta', 'unknown life form'), jelly: tr('forma di vita sconosciuta', 'unknown life form'),
    shell: tr('conchiglia sconosciuta', 'unknown shell'), relic: tr('reperto sconosciuto', 'unknown relic'), coral: tr('corallo sconosciuto', 'unknown coral'),
  };
  const TILT = { amphora: 1.25, anchor: 1.5, conch: 1.3 };
  const LAMP = pack([1, 0.92, 0.7]);
  const CAP = 160, LABEL_UP = 1.4, Q0 = [0, 0, 0, 1];
  const ICE = { iceServers: [{ urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] }] };

  let DISC = [], BYID = new Map();
  const GROUP = {}, MESH = {}, runs = [];
  let inst = null, instF = null;
  let ws = null, me = null, meta = null, joined = false, sendT = 0, beatT = 0, lastState = '';
  const players = new Map(), peers = new Map(), rivals = new Map();
  let claims = {};
  let target = null, shown = undefined, analysis = null, typing = false, skin = SKIN[load('crewSkin')] ? load('crewSkin') : SKINS[0].key;
  let actx = null, mic = null, micOn = false;
  const dom = {};
  const invite = (new URLSearchParams(location.search).get('lobby') || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // ---------------------------------------------------------------- shapes
  const join = (a, b) => { const o = a.p.length / 3; a.p.push(...b.p); a.aux.push(...b.aux); for (const i of b.i) a.i.push(i + o); return a; };
  const ring = (cx, cy, cz, r, axis, n = 16) => {
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = i / n * TAU; pts.push(axis === 'z' ? [cx + cos(a) * r, cy + sin(a) * r, cz] : [cx + cos(a) * r, cy, cz + sin(a) * r]); }
    return pts;
  };
  // every swimmer has its nose on +x; the sub has its nose on -z (the way the camera looks at yaw 0)
  function shapes() {
    const S = {}, up = () => [0, 1, 0];
    S.fish = meshFish();
    { // seahorse: curled body with the snout forward
      const m = new Mesh();
      m.tube([[0.1, 0.5, 0], [0, 0.38, 0], [0.05, 0.12, 0], [0.02, -0.12, 0], [-0.06, -0.28, 0], [0.02, -0.4, 0], [0.12, -0.36, 0], [0.1, -0.27, 0]],
        (k) => [0.07, 0.08, 0.11, 0.1, 0.06, 0.04, 0.03, 0.02][k], 7, true);
      m.tube([[0.12, 0.47, 0], [0.34, 0.44, 0]], 0.03, 5, true);
      m.sweep([[-0.04, 0.3, 0], [-0.04, 0, 0]], 0.02, 0.14, () => [1, 0, 0]);
      S.seahorse = m;
    }
    { // octopus: head and eight curling arms
      const m = icosphere(2, (x, y, z) => [x * 0.3, y * 0.36 + 0.32, z * 0.3]);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, pts = [];
        for (let i = 0; i <= 7; i++) { const t = i / 7, r = 0.1 + 0.62 * t; pts.push([cos(a) * r, 0.1 - 0.28 * t + 0.1 * sin(t * 7 + k), sin(a) * r]); }
        m.tube(pts, (i) => 0.08 * (1 - i / 8), 5, true);
      }
      S.octopus = m;
    }
    { // turtle: domed shell, head, four flippers
      const m = icosphere(2, (x, y, z) => [x * 0.55, (y < -0.3 ? -0.3 : y) * 0.28, z * 0.45]);
      join(m, icosphere(1, (x, y, z) => [0.62 + x * 0.14, 0.02 + y * 0.1, z * 0.11]));
      for (const s of [-1, 1]) {
        m.sweep([[0.25, 0, s * 0.3], [0.15, -0.03, s * 0.85]], 0.26, 0.04, up);
        m.sweep([[-0.35, 0, s * 0.3], [-0.5, -0.02, s * 0.55]], 0.14, 0.04, up);
      }
      S.turtle = m;
    }
    { // jellyfish: a bell and trailing tentacles
      const m = meshLathe([[0, 0.45, 1], [0.25, 0.42, 1], [0.42, 0.3, 1], [0.5, 0.1, 1], [0.46, 0, 1], [0.3, 0.05, 1], [0, 0.1, 1]], 16, 0.08);
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU, pts = [];
        for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push([cos(a) * 0.32 + 0.06 * sin(t * 6 + k), -t * 1.1, sin(a) * 0.32 + 0.06 * cos(t * 5 + k)]); }
        m.tube(pts, (i) => 0.025 * (1 - i / 7), 4, true);
      }
      S.jelly = m;
    }
    { // nautilus: a log spiral
      const m = new Mesh(), pts = [], N = 36, A = TAU * 1.75;
      for (let i = 0; i <= N; i++) { const a = i / N * A, r = 0.04 * exp(0.22 * a); pts.push([cos(a) * r, 0.45 + sin(a) * r, 0]); }
      m.tube(pts, (k) => 0.75 * 0.04 * exp(0.22 * k / N * A), 8, true);
      S.nautilus = m;
    }
    S.conch = meshLathe([[0, 0, 1], [0.22, 0.03, 1], [0.34, 0.22, 1], [0.3, 0.45, 1], [0.18, 0.68, 1], [0.06, 0.88, 1], [0, 0.95, 1]], 10, 0.3, 6);
    { // amphora with two handles
      const m = meshLathe([[0, 0, 1], [0.08, 0.02, 1], [0.2, 0.25, 1], [0.26, 0.5, 1], [0.2, 0.75, 1], [0.09, 0.88, 1], [0.08, 1.05, 1], [0.12, 1.1, 1], [0.06, 1.08, 1], [0, 0.9, 1]], 14, 0.05);
      for (const s of [-1, 1]) m.tube([[s * 0.08, 1.0, 0], [s * 0.25, 1.0, 0], [s * 0.22, 0.78, 0]], 0.03, 5, false);
      S.amphora = m;
    }
    { // anchor: shank, curved arms, stock and ring
      const m = new Mesh();
      m.sweep([[0, 0, 0], [0, 1.2, 0]], 0.1, 0.1, () => [1, 0, 0]);
      m.sweep([[-0.5, 0.35, 0], [-0.35, 0.08, 0], [0, 0, 0], [0.35, 0.08, 0], [0.5, 0.35, 0]], 0.1, 0.1, () => [0, 0, 1]);
      m.sweep([[0, 1.05, -0.45], [0, 1.05, 0.45]], 0.08, 0.08, up);
      m.tube(ring(0, 1.32, 0, 0.12, 'z', 12), 0.03, 5, false);
      S.anchor = m;
    }
    { // chest: box, lid and lock
      const m = new Mesh();
      m.sweep([[-0.5, 0.25, 0], [0.5, 0.25, 0]], 0.6, 0.5, up);
      m.sweep([[-0.52, 0.56, 0], [0.52, 0.56, 0]], 0.64, 0.16, up);
      join(m, icosphere(1, (x, y, z) => [x * 0.06, 0.45 + y * 0.07, -0.31 + z * 0.03]));
      S.chest = m;
    }
    S.coral = meshCoral(0, true);
    { // the sub: hull (skin colour), trim (second colour) and lamps (they glow)
      const hull = new Mesh(), R = [0.1, 0.24, 0.36, 0.44, 0.48, 0.5, 0.5, 0.5, 0.49, 0.47, 0.42, 0.33, 0.2], pts = [];
      for (let i = 0; i < R.length; i++) pts.push([0, 0, 1.35 - 2.7 * i / (R.length - 1)]);
      hull.tube(pts, (k) => R[k], 14, true);
      S.hull = hull;
      const t = new Mesh();
      t.tube([[0, 0.3, -0.25], [0, 0.82, -0.18]], 0.2, 10, true);
      t.tube([[0, 0.78, -0.1], [0, 1.05, -0.1], [0, 1.05, -0.3]], 0.03, 5, true);
      t.sweep([[0, 0, 1.0], [0, 0, 1.5]], 0.05, 1.0, up);
      t.sweep([[0, 0, 1.0], [0, 0, 1.5]], 1.0, 0.05, up);
      t.tube(ring(0, 0, 1.5, 0.32, 'z'), 0.035, 5, false);
      t.tube(ring(0, 0, -0.05, 0.51, 'z', 20), 0.04, 5, false);
      for (const s of [-1, 1]) {
        t.tube([[s * 0.55, -0.18, 0.55], [s * 0.55, -0.18, 0]], 0.13, 8, true);
        t.sweep([[s * 0.1, -0.15, 0.3], [s * 0.5, -0.18, 0.3]], 0.2, 0.05, up);
      }
      S.trim = t;
      const l = icosphere(2, (x, y, z) => [x * 0.22, y * 0.2, -1.32 + z * 0.1]);
      for (const s of [-1, 1]) join(l, icosphere(1, (x, y, z) => [s * 0.55 + x * 0.1, -0.18 + y * 0.1, -0.02 + z * 0.05]));
      S.lamp = l;
    }
    return S;
  }

  // ---------------------------------------------------------------- network
  const send = (m) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); };

  function connect(id) {
    if (ws) return;
    audio(); // a click: the audio context may start now
    const name = (dom.name.value || '').trim().slice(0, 24) || dom.name.placeholder;
    save('crewName', name);
    note(tr('Connessione…', 'Connecting…'));
    const q = new URLSearchParams({ room: id, name, skin });
    const s = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws?${q}`);
    let opened = false;
    ws = s;
    s.onopen = () => { opened = true; };
    s.onmessage = (e) => { let m; try { m = JSON.parse(e.data); } catch { return; } onMsg(m); };
    s.onclose = () => {
      if (ws !== s) return;
      const was = joined;
      reset();
      if (was) { toast(tr('Connessione persa: sei tornato alla lobby.', 'Connection lost: back to the lobby.'), null, 'info'); document.exitPointerLock?.(); }
      else note(opened ? tr('La spedizione si è chiusa.', 'The expedition closed.') : tr('Spedizione non trovata o piena.', 'Expedition not found or full.'));
      refresh();
    };
  }

  function leave() {
    const s = ws;
    reset();
    s?.close();
    refresh();
  }

  function reset() {
    ws = null; joined = false; me = null; meta = null; claims = {}; analysis = null; target = null; shown = undefined;
    for (const id of [...players.keys()]) dropPlayer(id);
    rivals.clear();
    hideScan(); prompt(null); renderCrew();
    history.replaceState(null, '', location.pathname);
    showLobby();
  }

  function onMsg(m) {
    switch (m.t) {
      case 'welcome':
        me = m.you; meta = m.meta; claims = m.claims || {}; joined = true;
        for (const p of m.players) addPlayer(p);
        for (const p of m.players) call(p.id);
        history.replaceState(null, '', `${location.pathname}?lobby=${meta.id}`);
        note('');
        showLobby(); renderCrew();
        break;
      case 'join':
        addPlayer(m.player);
        toast(tr(`${m.player.name} si è unito alla spedizione.`, `${m.player.name} joined the expedition.`), null, 'info');
        break;
      case 'leave': {
        const p = players.get(m.id);
        if (p) toast(tr(`${p.name} è risalito.`, `${p.name} surfaced.`), null, 'info');
        dropPlayer(m.id);
        break;
      }
      case 'state': {
        const p = players.get(m.id);
        if (p) { p.tgt = m.p; p.tyaw = m.yaw; p.tpitch = m.pitch; }
        break;
      }
      case 'skin': {
        const p = players.get(m.id);
        if (p) { p.skin = m.s; renderCrew(); }
        break;
      }
      case 'emote': showEmote(m.id, m.e); break;
      case 'chat': chatLine(m.name, m.text); break;
      case 'rtc': onRtc(m.from, m.data); break;
      case 'analyze_ok':
        if (analysis && analysis.d.id === m.obj) { analysis.pending = false; analysis.t0 = performance.now(); analysis.seconds = m.seconds; }
        break;
      case 'analyze_denied':
        if (analysis && analysis.d.id === m.obj) {
          hideScan(); analysis = null;
          flash({ claimed: m.by ? tr(`${m.by} l'ha già scoperto.`, `${m.by} already found it.`) : tr('Già scoperto.', 'Already found.'),
            far: tr('Troppo lontano per analizzarlo.', 'Too far to analyse.'), early: tr('Analisi incompleta.', 'Analysis incomplete.') }[m.reason] || '');
        }
        break;
      case 'analyzing': {
        const p = players.get(m.id);
        if (p) rivals.set(m.obj, { name: p.name, until: performance.now() + 25e3 });
        shown = undefined;
        break;
      }
      case 'found': {
        const d = BYID.get(m.obj);
        claims[m.obj] = { by: m.by, points: m.points };
        rivals.delete(m.obj);
        const mine = me && m.byId === me.id;
        if (mine) { me.score = m.score; pop(m.points, d); }
        else { const p = players.get(m.byId); if (p) p.score = m.score; }
        if (analysis && analysis.d.id === m.obj) { analysis = null; hideScan(); if (!mine) flash(tr(`${m.by} è arrivato prima.`, `${m.by} got there first.`)); }
        if (d) toastFound(m.by, d, m.points);
        shown = undefined;
        renderCrew();
        break;
      }
    }
  }

  function addPlayer(p) {
    if (players.has(p.id) || (me && p.id === me.id)) return;
    const tag = make('div', 'cw-tag', null, dom.hud), em = make('i', null, '', tag);
    make('b', null, p.name, tag);
    tag.style.display = 'none';
    players.set(p.id, { ...p, pos: [...p.pos], tgt: [...p.pos], tyaw: p.yaw, tpitch: p.pitch, tag, em, emT: 0, vis: false, talk: false });
    renderCrew();
  }

  function dropPlayer(id) {
    const p = players.get(id);
    if (p) { p.tag.remove(); clearTimeout(p.emT); players.delete(id); }
    dropPeer(id);
    renderCrew();
  }

  // ---------------------------------------------------------------- analysis
  function analyze() {
    if (analysis || !target || !ws) return;
    analysis = { d: target, pending: true, sent: false, t0: 0, seconds: analysisSeconds(target) };
    send({ t: 'analyze_start', obj: target.id });
    prompt(null);
    dom.scan.hidden = false; dom.scan.classList.remove('done');
    setScan(0, analysis.seconds);
    dom.scanS.textContent = tr('Analisi in corso', 'Analysing');
  }

  function cancel(msg) {
    if (!analysis) return;
    send({ t: 'analyze_cancel', obj: analysis.d.id });
    analysis = null; hideScan();
    if (msg) flash(msg);
  }

  const ARC = 2 * PI * 44;
  function setScan(f, rem) {
    dom.arc.style.strokeDashoffset = ARC * (1 - f);
    dom.scanT.textContent = `${rem.toFixed(1)} s`;
  }
  function hideScan() { if (dom.scan) dom.scan.hidden = true; }

  function prompt(d) {
    if (d === shown) return;
    shown = d;
    if (!d) { dom.prompt.hidden = true; return; }
    dom.prompt.hidden = false;
    dom.pText.textContent = `${tr('Analizza', 'Analyse')} ${KIND[d.kind]}`;
    dom.pips.replaceChildren(...[1, 2, 3, 4, 5].map((i) => make('i', i <= d.complexity ? 'on' : '')));
    const rv = rivals.get(d.id);
    dom.pTime.textContent = `${tr('circa', 'about')} ${Math.ceil(analysisSeconds(d))} s` +
      (rv && rv.until > performance.now() ? `, ${tr(`anche ${rv.name} lo sta analizzando`, `${rv.name} is analysing it too`)}` : '');
  }

  let flashT = 0;
  function flash(msg) {
    if (!msg) return;
    dom.flash.textContent = msg; dom.flash.hidden = false;
    clearTimeout(flashT); flashT = setTimeout(() => { dom.flash.hidden = true; }, 2800);
  }

  function pop(points, d) {
    dom.popB.textContent = `+${points}`;
    dom.popS.textContent = d ? `${nm(d)}: ${tr('prima scoperta', 'first discovery')}` : '';
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    dom.pop.animate(still
      ? { opacity: [0, 1, 1, 0] }
      : { opacity: [0, 1, 1, 0], transform: ['translate(-50%,-30%) scale(.7)', 'translate(-50%,-50%) scale(1)', 'translate(-50%,-55%) scale(1)', 'translate(-50%,-80%) scale(1)'] },
      { duration: 2600, easing: 'cubic-bezier(.2,.7,.3,1)' });
    dom.scan.classList.add('done');
  }

  // ---------------------------------------------------------------- HUD text
  function toast(text, points, cls) {
    const t = make('div', `cw-toast ${cls || ''}`);
    if (Array.isArray(text)) t.append(...text); else t.textContent = text;
    if (points != null) make('em', null, `+${points}`, t);
    dom.toasts.prepend(t);
    while (dom.toasts.children.length > 5) dom.toasts.lastChild.remove();
    setTimeout(() => { t.classList.add('old'); setTimeout(() => t.remove(), 900); }, cls === 'info' ? 4500 : 7000);
  }
  function toastFound(by, d, points) {
    const s = document.createElement('span'), a = make('strong', null, by), b = make('strong', null, nm(d));
    if (IT) s.append('Il sommozzatore ', a, ' ha trovato ', b); else s.append('Diver ', a, ' found ', b);
    toast([s], points);
  }

  function chatLine(name, text) {
    const p = make('p', null, null, dom.log);
    make('b', null, `${name} `, p);
    p.append(text);
    while (dom.log.children.length > 6) dom.log.firstChild.remove();
    setTimeout(() => { p.classList.add('old'); setTimeout(() => p.remove(), 1000); }, 12e3);
  }
  function openChat() {
    if (typing) return;
    typing = true; release();
    dom.input.hidden = false; dom.input.value = ''; dom.input.focus();
  }
  function closeChat() {
    typing = false; dom.input.blur(); dom.input.hidden = true;
  }

  function emote(i) { if (EMOTES[i]) send({ t: 'emote', e: EMOTES[i].key }); }
  function showEmote(id, key) {
    const e = EMOTES.find((x) => x.key === key);
    if (!e) return;
    if (me && id === me.id) {
      dom.self.textContent = e.glyph;
      dom.self.animate({ opacity: [0, 1, 1, 0], transform: ['translateX(-50%) scale(.6)', 'translateX(-50%) scale(1)', 'translateX(-50%) scale(1)', 'translateX(-50%) scale(1)'] }, { duration: 1800 });
      return;
    }
    const p = players.get(id);
    if (!p) return;
    p.em.textContent = e.glyph;
    clearTimeout(p.emT); p.emT = setTimeout(() => { p.em.textContent = ''; }, 3000);
    chatLine(p.name, `${e.glyph} ${nm(e)}`);
  }

  function renderCrew() {
    if (!dom.crew) return;
    if (!joined) { dom.crew.hidden = true; return; }
    dom.crew.hidden = false;
    const list = [{ ...me, me: true }, ...players.values()].sort((a, b) => b.score - a.score);
    dom.crewH.textContent = meta ? meta.name : '';
    dom.crewL.replaceChildren(...list.map((p) => {
      const row = make('p', p.me ? 'me' : p.talk ? 'talk' : '');
      make('span', null, null, row).style.background = css((SKIN[p.skin] || SKINS[0]).hull);
      make('b', null, p.name, row);
      make('em', null, String(p.score || 0), row);
      return row;
    }));
    if (dom.inRoom) dom.inRoom.textContent = meta ? `${meta.name}: ${list.length}/8 ${tr('a bordo', 'aboard')}` : '';
  }

  function renderMic() {
    dom.mic.classList.toggle('on', micOn);
    dom.micT.textContent = micOn ? tr('Microfono acceso', 'Microphone on') : tr('Microfono spento', 'Microphone off');
    if (dom.micB) dom.micB.textContent = micOn ? tr('Spegni il microfono', 'Turn microphone off') : tr('Accendi il microfono', 'Turn microphone on');
  }

  // ---------------------------------------------------------------- voice (WebRTC between players)
  function audio() {
    if (!actx) { try { actx = new AudioContext(); } catch { return null; } }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function peer(id) {
    let p = peers.get(id);
    if (p) return p;
    const pc = new RTCPeerConnection(ICE);
    p = { pc, tr: null, q: Promise.resolve() };
    peers.set(id, p);
    pc.onicecandidate = (e) => { if (e.candidate) send({ t: 'rtc', to: id, data: { c: e.candidate } }); };
    pc.ontrack = (e) => hear(id, e.streams[0] || new MediaStream([e.track]));
    return p;
  }

  // the newcomer calls everyone already in the room; the others answer
  function call(id) {
    const p = peer(id);
    p.q = p.q.then(async () => {
      p.tr = p.pc.addTransceiver('audio', { direction: 'sendrecv' });
      if (micOn && mic) await p.tr.sender.replaceTrack(mic);
      await p.pc.setLocalDescription();
      send({ t: 'rtc', to: id, data: { d: p.pc.localDescription } });
    }).catch((e) => console.warn('voice', e));
  }

  function onRtc(from, data) {
    if (!players.has(from) || !data) return;
    const p = peer(from);
    p.q = p.q.then(async () => {
      if (data.d) {
        await p.pc.setRemoteDescription(data.d);
        if (data.d.type === 'offer') {
          p.tr = p.pc.getTransceivers()[0] || null;
          if (p.tr) { p.tr.direction = 'sendrecv'; if (micOn && mic) await p.tr.sender.replaceTrack(mic); }
          await p.pc.setLocalDescription();
          send({ t: 'rtc', to: from, data: { d: p.pc.localDescription } });
        }
      } else if (data.c) await p.pc.addIceCandidate(data.c);
    }).catch((e) => console.warn('voice', e));
  }

  // a remote voice goes through a panner: it comes from their sub and fades linearly to nothing at VOICE_RANGE
  function hear(id, stream) {
    const a = audio(), p = peers.get(id);
    if (!a || !p || p.src) return;
    // Chrome only feeds a remote stream to Web Audio while a media element is playing it
    p.el = new Audio(); p.el.srcObject = stream; p.el.muted = true; p.el.play().catch(() => {});
    p.src = a.createMediaStreamSource(stream);
    p.pan = new PannerNode(a, { panningModel: 'HRTF', distanceModel: 'linear', refDistance: 2, maxDistance: VOICE_RANGE, rolloffFactor: 1 });
    p.an = a.createAnalyser(); p.an.fftSize = 256; p.buf = new Uint8Array(256);
    p.src.connect(p.an); p.src.connect(p.pan); p.pan.connect(a.destination);
  }

  function dropPeer(id) {
    const p = peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch {}
    p.src?.disconnect(); p.pan?.disconnect();
    if (p.el) p.el.srcObject = null;
    peers.delete(id);
  }

  async function toggleMic() {
    audio();
    if (!mic) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        mic = s.getAudioTracks()[0];
      } catch {
        flash(tr('Microfono non disponibile: controlla i permessi del browser.', 'Microphone unavailable: check the browser permissions.'));
        return;
      }
    }
    micOn = !micOn; mic.enabled = micOn;
    for (const p of peers.values()) p.tr?.sender.replaceTrack(micOn ? mic : null).catch(() => {});
    renderMic();
  }

  function voice(cx, cy, cz) {
    if (!actx) return;
    const L = actx.listener, t = actx.currentTime;
    if (L.positionX) {
      L.positionX.setValueAtTime(cx, t); L.positionY.setValueAtTime(cy, t); L.positionZ.setValueAtTime(cz, t);
      L.forwardX.setValueAtTime(F[FX], t); L.forwardY.setValueAtTime(F[FY], t); L.forwardZ.setValueAtTime(F[FZ], t);
      L.upX.setValueAtTime(F[UX], t); L.upY.setValueAtTime(F[UY], t); L.upZ.setValueAtTime(F[UZ], t);
    } else { L.setPosition(cx, cy, cz); L.setOrientation(F[FX], F[FY], F[FZ], F[UX], F[UY], F[UZ]); }
    let crew = false;
    for (const [id, p] of peers) {
      const pl = players.get(id);
      if (!pl || !p.pan) continue;
      p.pan.positionX.setValueAtTime(pl.pos[0], t); p.pan.positionY.setValueAtTime(pl.pos[1], t); p.pan.positionZ.setValueAtTime(pl.pos[2], t);
      p.an.getByteTimeDomainData(p.buf);
      let e = 0; for (let i = 0; i < p.buf.length; i++) { const v = p.buf[i] - 128; e += v * v; }
      const talk = sqrt(e / p.buf.length) > 4 && hypot(pl.pos[0] - cx, pl.pos[1] - cy, pl.pos[2] - cz) < VOICE_RANGE;
      if (talk !== pl.talk) { pl.talk = talk; pl.tag.classList.toggle('talk', talk); crew = true; }
    }
    if (crew) renderCrew();
  }

  // ---------------------------------------------------------------- lobby (inside the menu)
  function note(t) { if (dom.note) { dom.note.textContent = t; dom.note.hidden = !t; } }

  async function refresh() {
    if (joined || !dom.list) return;
    try {
      const r = await fetch('/api/lobbies', { cache: 'no-store' });
      if (!r.ok) throw 0;
      renderList((await r.json()).lobbies || []);
    } catch { renderList(null); }
  }

  function renderList(list) {
    if (!list) { dom.list.replaceChildren(make('p', 'cw-empty', tr('Server delle lobby non raggiungibile.', 'Lobby server unreachable.'))); return; }
    if (invite && !list.some((l) => l.id === invite)) list = [{ id: invite, name: tr('Spedizione condivisa con te', 'Expedition shared with you'), creator: '', players: 0, max: 8 }, ...list];
    if (!list.length) { dom.list.replaceChildren(make('p', 'cw-empty', tr('Nessuna spedizione aperta: creane una qui sotto.', 'No open expeditions: create one below.'))); return; }
    dom.list.replaceChildren(...list.map((l) => {
      const b = make('button', l.id === invite ? 'inv' : '');
      const s = make('span', null, null, b);
      make('b', null, l.name, s);
      make('small', null, [l.creator && tr(`di ${l.creator}`, `by ${l.creator}`), l.map].filter(Boolean).join(', '), s);
      make('em', null, `${l.players}/${l.max}`, b);
      b.disabled = l.players >= l.max;
      b.onclick = () => connect(l.id);
      return b;
    }));
  }

  async function create(e) {
    e.preventDefault();
    if (ws) return;
    const creator = (dom.name.value || '').trim() || dom.name.placeholder;
    const name = dom.newName.value.trim() || tr(`Spedizione di ${creator}`, `${creator}'s expedition`);
    dom.newBtn.disabled = true;
    try {
      const r = await fetch('/api/lobbies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, creator }) });
      if (!r.ok) throw 0;
      dom.newName.value = '';
      connect((await r.json()).id);
    } catch { note(tr('Impossibile creare la spedizione: server non raggiungibile.', 'Could not create the expedition: server unreachable.')); }
    dom.newBtn.disabled = false;
  }

  function showLobby() {
    dom.pick.hidden = joined; dom.in.hidden = !joined;
    dom.dive.style.display = joined ? '' : 'none';
    for (const e of [dom.q, dom.k]) if (e) e.style.display = joined ? '' : 'none';
    dom.name.disabled = joined;
    renderCrew();
  }

  const subIcon = (s) => {
    const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 64 28');
    const shape = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); };
    shape('path', { d: 'M2 8l7 6-7 6z', fill: css(s.trim) });
    shape('rect', { x: 26, y: 2, width: 11, height: 8, rx: 2, fill: css(s.trim) });
    shape('path', { d: 'M7 14c0-5 8-8 21-8h13c9 0 16 3 16 8s-7 8-16 8H28C15 22 7 19 7 14z', fill: css(s.hull) });
    shape('circle', { cx: 52, cy: 14, r: 2.6, fill: '#fff4c8' });
    return svg;
  };

  function pickSkin(k) {
    skin = k; save('crewSkin', k);
    for (const b of dom.skins.children) b.classList.toggle('on', b.dataset.k === k);
    if (joined) { me.skin = k; send({ t: 'skin', s: k }); renderCrew(); }
  }

  function buildUI() {
    make("style", null, CREW_CSS, document.head);
    const hud = dom.hud = make('div', null, null, document.body); hud.id = 'cw';
    dom.crew = make('div', null, null, hud); dom.crew.id = 'cw-crew'; dom.crew.hidden = true;
    dom.crewH = make('h2', null, '', dom.crew); dom.crewL = make('div', null, null, dom.crew);
    dom.toasts = make('div', null, null, hud); dom.toasts.id = 'cw-toasts';
    const chat = make('div', null, null, hud); chat.id = 'cw-chat';
    dom.log = make('div', null, null, chat);
    dom.input = make('input', null, null, chat);
    Object.assign(dom.input, { hidden: true, maxLength: 200, placeholder: tr('Scrivi alla squadra, Invio per inviare', 'Message the crew, Enter to send') });
    dom.input.onkeydown = (e) => {
      if (e.key === 'Enter') { const t = dom.input.value.trim(); if (t) send({ t: 'chat', text: t }); closeChat(); e.preventDefault(); }
      else if (e.key === 'Escape') closeChat();
    };
    dom.mic = make('div', null, null, hud); dom.mic.id = 'cw-mic';
    make('span', 'cw-key', 'V', dom.mic); dom.micT = make('span', null, '', dom.mic);
    dom.prompt = make('div', null, null, hud); dom.prompt.id = 'cw-prompt'; dom.prompt.hidden = true;
    dom.prompt.onclick = analyze;
    make('span', 'cw-key', 'F', dom.prompt);
    const pt = make('span', null, null, dom.prompt);
    dom.pText = make('b', null, '', pt);
    const pm = make('small', null, null, pt);
    dom.pips = make('span', 'cw-pips', null, pm); dom.pTime = make('span', null, '', pm);
    dom.flash = make('p', null, '', hud); dom.flash.id = 'cw-flash'; dom.flash.hidden = true;
    // the scanner: a ring that fills while the analysis runs, around the crosshair
    dom.scan = make('div', null, null, hud); dom.scan.id = 'cw-scan'; dom.scan.hidden = true;
    make('div', 'sweep', null, dom.scan);
    dom.scan.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 100 100"><circle class=track cx=50 cy=50 r=44 /><circle class=arc cx=50 cy=50 r=44 stroke-dasharray="${ARC}" stroke-dashoffset="${ARC}" /></svg>`);
    dom.arc = dom.scan.querySelector('.arc');
    const sc = make('div', 'c', null, dom.scan);
    dom.scanT = make('b', null, '', sc); dom.scanS = make('span', null, '', sc);
    dom.pop = make('div', null, null, hud); dom.pop.id = 'cw-pop';
    dom.popB = make('b', null, '', dom.pop); dom.popS = make('span', null, '', dom.pop);
    dom.self = make('div', null, '', hud); dom.self.id = 'cw-self';
    dom.marks = make('div', null, null, hud);

    // lobby panel, in the menu above the dive button
    dom.dive = document.getElementById('d'); dom.q = document.getElementById('q'); dom.k = document.getElementById('k');
    const lob = make('section'); lob.id = 'cw-lobby';
    dom.dive.parentNode.insertBefore(lob, dom.dive);
    const lab = make('label', null, tr('Il tuo nome', 'Your name'), lob);
    dom.name = make('input', null, null, lab);
    Object.assign(dom.name, { maxLength: 24, value: load('crewName'), placeholder: `${tr('Sommozzatore', 'Diver')} ${10 + (Math.random() * 90 | 0)}`, autocomplete: 'nickname' });
    const sk = make('div', 'cw-row', null, lob);
    make('span', 'cw-cap', tr('Il tuo sottomarino', 'Your sub'), sk);
    dom.skins = make('div', 'cw-skins', null, sk);
    for (const s of SKINS) {
      const b = make('button', s.key === skin ? 'on' : '', null, dom.skins);
      b.dataset.k = s.key; b.title = nm(s); b.setAttribute('aria-label', nm(s));
      b.appendChild(subIcon(s)); b.onclick = () => pickSkin(s.key);
    }
    dom.pick = make('div', 'cw-row', null, lob);
    make('span', 'cw-cap', tr('Spedizioni aperte', 'Open expeditions'), dom.pick);
    dom.list = make('div', 'cw-list', null, dom.pick);
    const f = make('form', 'cw-new', null, dom.pick);
    dom.newName = make('input', null, null, f);
    Object.assign(dom.newName, { maxLength: 40, placeholder: tr('Nome della nuova spedizione', 'New expedition name') });
    dom.newBtn = make('button', null, tr('Crea', 'Create'), f);
    f.onsubmit = create;
    dom.in = make('div', 'cw-row', null, lob); dom.in.hidden = true;
    dom.inRoom = make('p', 'cw-room', '', dom.in);
    const acts = make('div', 'cw-acts', null, dom.in);
    const copy = make('button', null, tr('Copia il link di invito', 'Copy invite link'), acts);
    copy.onclick = () => {
      navigator.clipboard?.writeText(location.href).then(() => note(tr('Link copiato: chi lo apre entra nella tua spedizione.', 'Link copied: whoever opens it joins your expedition.')), () => note(location.href));
    };
    dom.micB = make('button', null, '', acts); dom.micB.onclick = toggleMic;
    make('button', null, tr('Esci', 'Leave'), acts).onclick = leave;
    dom.note = make('p', 'cw-note', '', lob); dom.note.hidden = true;
    dom.dive.textContent = tr('Tuffati', 'Dive in');
    dom.dive.addEventListener('click', audio);
    renderMic(); showLobby(); refresh();
    setInterval(() => { if (!joined && document.body.classList.contains('m')) refresh(); }, 5000);
  }

  // ---------------------------------------------------------------- per-frame
  // The floor height can put a discovery inside rock or in a cave under an overhang: once the collision grid is up
  // (first frame), lift each one above the highest rock over it, so it and its swimming circle are in open water.
  // Only the height changes: the server checks distance on the horizontal plane.
  let settled = false;
  function settle() {
    settled = true;
    const rock = (x, y, z) => {
      const ix = ((x - OX) / VS - CO) | 0, iy = ((y - OY) / VS) | 0, iz = ((z - OZ) / VS - CO) | 0;
      if (ix < 0 || iy < 0 || iz < 0 || ix >= CN * 4 - 1 || iz >= CN * 4 - 1 || iy >= NY - 1) return false;
      return cv(ix, iy, iz) > 0;
    };
    for (const d of DISC) {
      const a = d.anchor, h = d.size * 0.5, pts = [[0, 0]];
      if (d.orbit) for (let i = 0; i < 8; i++) pts.push([cos(i / 8 * TAU) * d.orbit, sin(i / 8 * TAU) * d.orbit]);
      let top = -1e9;
      for (const [x, z] of pts) for (let y = a[1] - h; y < -2; y += 0.4) if (rock(a[0] + x, y, a[2] + z)) top = max(top, y);
      if (top > -1e9) a[1] = min(top + h + (d.orbit ? 0.8 : 0.25), -3);
    }
  }

  function project(x, y, z) {
    const m = UB, w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w < 0.3) return null;
    const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w;
    if (px < -1.2 || px > 1.2 || py < -1.2 || py > 1.2) return null;
    return [(px * 0.5 + 0.5) * canvas.clientWidth, (0.5 - py * 0.5) * canvas.clientHeight, w];
  }
  function place(o, s, alpha) {
    if (!s) { if (o.vis) { o.el.style.display = 'none'; o.vis = false; } return; }
    if (!o.vis) { o.el.style.display = ''; o.vis = true; }
    o.el.style.transform = `translate(${s[0] | 0}px,${s[1] | 0}px) translate(-50%,-100%)`;
    o.el.style.opacity = alpha;
  }

  return {
    // after the world is generated, while the ground height is still known
    world(Wd) {
      const h = (x, z) => { const y = Wd.gy(x, z); return Number.isFinite(y) ? clamp(y, -50, -4) : -30; };
      DISC = generateDiscoverables(WORLD_BOUNDS, h);
      // boulders and rock chunks (unit-radius meshes, 12 floats per instance) are not in the floor height:
      // a discovery inside or under one goes on top of it
      const rocks = [], add = (a, from = 0, n = a.length / 12) => { for (let i = from; i < from + n; i++) if (a[i * 12 + 3] > 0.4) rocks.push(a.subarray(i * 12, i * 12 + 4)); };
      for (let m = 0; m < 4; m++) add(Wd.solids.data, Wd.solids.ranges[m][0], Wd.solids.ranges[m][1]);
      for (const c of Wd.chunks) add(c.data);
      for (const d of DISC) {
        const a = d.anchor, hs = d.size * 0.5;
        for (let pass = 0; pass < 6; pass++) {
          let moved = false;
          for (const r of rocks) {
            const rr = r[3] * 1.15 + d.orbit + hs;
            if (abs(r[0] - a[0]) > rr || abs(r[2] - a[2]) > rr || a[1] > r[1] + r[3] * 0.95 + hs) continue;
            if (hypot(r[0] - a[0], r[2] - a[2]) < rr) { a[1] = r[1] + r[3] * 0.95 + hs; moved = true; }
          }
          if (!moved) break;
        }
        d.anchor[1] = min(d.anchor[1], -3);
        d.q = qMul(qAxis(0, 1, 0, d.phase), qAxis(0, 0, 1, TILT[d.mesh] || 0));
        (GROUP[d.mesh] ||= []).push(d);
        d.mark = { el: make('div', 'cw-mark'), vis: false };
        d.mark.el.style.display = 'none';
      }
      BYID = new Map(DISC.map((d) => [d.id, d]));
      buildUI();
      for (const d of DISC) dom.marks.appendChild(d.mark.el);
    },
    // add the crew's meshes to the scene's mesh list (they are uploaded with the others)
    meshes(list) {
      const sv = _seed, S = shapes();
      _seed = sv; // the shapes do not disturb the random sequence of whatever comes next
      for (const k in S) { const b = S[k].build(); MESH[k] = b; list.push(b); }
    },
    // in the scene pass, with the mesh vertex and index buffers bound
    draw(r) {
      if (!DISC.length) return;
      if (!settled) settle();
      if (!inst) { instF = new Float32Array(CAP * 12); inst = device.createBuffer({ size: CAP * 48, usage: BU.VERTEX | BU.COPY_DST }); }
      const T = Date.now() / 1000, cx = F[CX], cz = F[CZ];
      let n = 0; runs.length = 0;
      const put = (x, y, z, s, q, mat, col) => {
        const o = n++ * 12;
        instF[o] = x; instF[o + 1] = y; instF[o + 2] = z; instF[o + 3] = s;
        instF[o + 4] = q[0]; instF[o + 5] = q[1]; instF[o + 6] = q[2]; instF[o + 7] = q[3];
        instF[o + 8] = mat; instF[o + 9] = 0.37; instF[o + 10] = col; instF[o + 11] = 0;
      };
      for (const key in GROUP) {
        const from = n;
        for (const d of GROUP[key]) {
          if (n >= CAP) break;
          const p = positionAt(d, T);
          if (abs(p[0] - cx) > 170 || abs(p[2] - cz) > 170) continue;
          let q = d.q, s = d.size;
          if (d.orbit) {
            const a = d.phase + T * d.speed;
            if (d.kind === 'jelly') { q = Q0; s *= 1 + 0.07 * sin(T * 2.2 + d.phase); }
            else q = qAxis(0, 1, 0, -a - PI / 2 + sin(T * 5 + d.phase) * 0.12);
          }
          const gone = !!claims[d.id];
          put(p[0], p[1], p[2], s, q, d.kind === 'jelly' && !gone ? 7 : 6, pack(d.color, gone ? 0.35 : 1));
        }
        if (n > from) runs.push(MESH[key], from, n - from);
      }
      for (const part of ['hull', 'trim', 'lamp']) {
        const from = n;
        for (const p of players.values()) {
          if (n >= CAP) break;
          const sk = SKIN[p.skin] || SKINS[0], q = qMul(qAxis(0, 1, 0, -p.yaw), qAxis(1, 0, 0, p.pitch * 0.6));
          put(p.pos[0], p.pos[1], p.pos[2], 1, q, part === 'lamp' ? 7 : 6, part === 'lamp' ? LAMP : pack(sk[part]));
        }
        if (n > from) runs.push(MESH[part], from, n - from);
      }
      if (!n) return;
      Q.writeBuffer(inst, 0, instF, 0, n * 12);
      r.setPipeline(pSolid); r.setVertexBuffer(1, inst);
      for (let i = 0; i < runs.length; i += 3) { const m = runs[i]; r.drawIndexed(m.ib.length, runs[i + 2], m.i0, m.v0, runs[i + 1]); }
    },
    // before the frame is drawn: other subs glide, our pose goes out, the analysis advances
    tick(dt) {
      if (!joined) return;
      const now = performance.now(), T = Date.now() / 1000, cx = F[CX], cy = F[CY], cz = F[CZ];
      const k = 1 - exp(-dt * 8);
      for (const p of players.values()) {
        for (let i = 0; i < 3; i++) p.pos[i] += (p.tgt[i] - p.pos[i]) * k;
        let dy = p.tyaw - p.yaw; dy -= Math.round(dy / TAU) * TAU;
        p.yaw += dy * k; p.pitch += (p.tpitch - p.pitch) * k;
      }
      if (now - sendT > 100) {
        sendT = now;
        const st = [cx.toFixed(2), cy.toFixed(2), cz.toFixed(2), F[YAW].toFixed(3), F[PIT].toFixed(3)].join();
        // a heartbeat every second keeps the room awake (it forgets running analyses when it hibernates)
        if (st !== lastState || now - beatT > 1000) {
          lastState = st; beatT = now;
          send({ t: 'state', p: [+cx.toFixed(2), +cy.toFixed(2), +cz.toFixed(2)], yaw: +F[YAW].toFixed(3), pitch: +F[PIT].toFixed(3) });
        }
      }
      if (menu && typing) closeChat();
      if (analysis) {
        const d = analysis.d, p = positionAt(d, T), dist = hypot(p[0] - cx, p[1] - cy, p[2] - cz);
        if (menu) cancel();
        else if (dist > ANALYZE_RANGE * 1.4) cancel(tr('Troppo lontano: analisi interrotta.', 'Too far: analysis stopped.'));
        else if (!analysis.pending) {
          const e = (now - analysis.t0) / 1000, f = min(1, e / analysis.seconds);
          setScan(f, max(0, analysis.seconds - e));
          if (f >= 1 && !analysis.sent) { analysis.sent = true; dom.scanS.textContent = tr('Verifica…', 'Checking…'); send({ t: 'analyze_done', obj: d.id }); }
        }
      }
      target = null;
      if (!analysis && !menu) {
        let best = -9;
        for (const d of DISC) {
          if (claims[d.id]) continue;
          const p = positionAt(d, T), dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz, dist = hypot(dx, dy, dz);
          if (dist > ANALYZE_RANGE) continue;
          const dot = (dx * F[FX] + dy * F[FY] + dz * F[FZ]) / (dist || 1), s = dot - dist / ANALYZE_RANGE * 0.4;
          if (dot > 0.6 && s > best) { best = s; target = d; }
        }
      }
      prompt(target);
      voice(cx, cy, cz);
    },
    // after the frame is drawn (the view matrix is current): names, emotes and discovery markers follow the scene
    overlay() {
      if (!joined) return;
      const T = Date.now() / 1000, cx = F[CX], cy = F[CY], cz = F[CZ];
      for (const p of players.values()) {
        const dist = hypot(p.pos[0] - cx, p.pos[1] - cy, p.pos[2] - cz), o = { el: p.tag, vis: p.vis };
        place(o, dist < 120 ? project(p.pos[0], p.pos[1] + LABEL_UP, p.pos[2]) : null, dist < 60 ? 1 : max(0.25, 1 - (dist - 60) / 60));
        p.vis = o.vis;
      }
      for (const d of DISC) {
        const p = positionAt(d, T), dist = hypot(p[0] - cx, p[1] - cy, p[2] - cz), c = claims[d.id];
        const on = dist < (c ? 16 : 34) && d !== shown;
        const s = on ? project(p[0], p[1] + d.size * 0.6 + 0.3, p[2]) : null;
        if (s && c && d.mark.done !== c.by) { d.mark.done = c.by; d.mark.el.className = 'cw-mark found'; d.mark.el.replaceChildren(make('b', null, nm(d)), make('small', null, tr(`trovato da ${c.by}`, `found by ${c.by}`))); }
        if (s && !c && d.mark.done) { d.mark.done = null; d.mark.el.className = 'cw-mark'; d.mark.el.replaceChildren(); }
        place(d.mark, s, c ? 0.9 : clamp(1.3 - dist / 34, 0.25, 0.9));
      }
    },
    // true when the key belongs to the crew layer (main.js then ignores it)
    key(e) {
      if (e.target && e.target.tagName === 'INPUT') return true;
      if (!joined || menu) return false;
      const c = e.code;
      if (c === 'Enter' || c === 'KeyT') { if (!e.repeat) openChat(); e.preventDefault(); return true; }
      if (c === 'KeyF') { if (!e.repeat) analyze(); return true; }
      if (c === 'KeyV') { if (!e.repeat) toggleMic(); return true; }
      if (c >= 'Digit1' && c <= 'Digit6') { if (!e.repeat) emote(c.charCodeAt(5) - 49); return true; }
      return false;
    },
  };
})();

// Colours follow the page's own: deep water, glass cyan, foam white; amber is kept for points.
const CREW_CSS = `
#cw{position:absolute;inset:0;pointer-events:none;font-size:.85em;transition:opacity .4s}
body:not(.g) #cw{opacity:0}
#cw [hidden],#cw-lobby [hidden]{display:none!important}
.cw-key{min-width:1.2em;padding:.22em .55em;border-radius:.35em;background:#e8fbff;color:#03222d;box-shadow:inset 0 -.15em #0004;text-align:center;font-weight:800;line-height:1.2}
.cw-tag{position:absolute;left:0;top:0;display:grid;justify-items:center;gap:.15em;white-space:nowrap;text-shadow:0 1px 3px #000c}
.cw-tag i{font-style:normal;font-size:2.2em;line-height:1}
.cw-tag b{padding:.15em .6em;border-radius:.4em;background:#03131cb3;font-weight:700}
.cw-tag.talk b{box-shadow:0 0 0 2px #7ff3ff,0 0 .8em #19c3d6}
.cw-mark{position:absolute;left:0;top:0;width:1.1em;height:1.1em;border:2px solid #7ff3ff;border-radius:50%;box-shadow:0 0 .6em #19c3d6}
.cw-mark.found{width:auto;height:auto;border:0;box-shadow:none;display:grid;justify-items:center;padding:.3em .6em;border-radius:.4em;background:#03131cb3;white-space:nowrap}
.cw-mark.found small{font-size:.8em;font-weight:600;color:#ffc24a}
#cw-crew{position:absolute;top:1em;left:1em;display:grid;gap:.3em;min-width:12em;padding:.65em .85em;border-radius:.55em;background:#03131cb3}
#cw-crew h2{margin:0 0 .15em;font-size:.8em;font-weight:700;color:#7ff3ff}
#cw-crew p{display:flex;align-items:center;gap:.55em;color:#cdeff5;font-weight:600}
#cw-crew p.me{color:#fff;font-weight:800}
#cw-crew p.talk b{color:#7ff3ff}
#cw-crew span{width:.75em;height:.75em;border-radius:.2em;flex:none}
#cw-crew em{margin-left:auto;padding-left:1em;font-style:normal;font-variant-numeric:tabular-nums;color:#ffc24a}
#cw-toasts{position:absolute;top:4.2em;right:1em;display:grid;gap:.5em;justify-items:end;width:min(25em,46vw)}
.cw-toast{display:flex;align-items:baseline;gap:.9em;padding:.7em .95em;border-radius:.5em;background:#03131cdd;border-left:3px solid #ffc24a;font-weight:600;line-height:1.35;transition:opacity .9s}
.cw-toast strong{color:#fff;font-weight:800}
.cw-toast em{margin-left:auto;font-style:normal;font-weight:900;font-size:1.15em;color:#ffc24a;font-variant-numeric:tabular-nums}
.cw-toast.info{border-color:#7ff3ff;font-size:.9em;color:#bfeff7}
.cw-toast.old{opacity:0}
#cw-chat{position:absolute;left:1em;bottom:1em;display:grid;gap:.3em;width:min(30em,60vw)}
#cw-chat div{display:grid;gap:.25em;justify-items:start}
#cw-chat p{padding:.3em .65em;border-radius:.4em;background:#03131c99;font-weight:500;transition:opacity 1s}
#cw-chat p b{color:#7ff3ff;font-weight:700}
#cw-chat p.old{opacity:0}
#cw-chat input,#cw-lobby input{font:600 1em/1.3 system-ui,sans-serif;padding:.6em .75em;border:0;border-radius:.45em;background:#e8fbff;color:#03222d;-webkit-user-select:text;user-select:text;pointer-events:auto}
#cw-mic{position:absolute;right:1em;bottom:1em;display:flex;align-items:center;gap:.55em;padding:.45em .75em .45em .45em;border-radius:.5em;background:#03131cb3;color:#9ab7bf;font-weight:600}
#cw-mic.on{color:#fff;box-shadow:inset 0 0 0 2px #ff6b5e}
#cw-prompt{position:absolute;left:50%;bottom:15%;transform:translateX(-50%);display:flex;align-items:center;gap:.8em;padding:.6em 1.1em .6em .6em;border-radius:.6em;background:#03131cd0;pointer-events:auto;cursor:pointer}
#cw-prompt>span:last-child{display:grid;gap:.2em}
#cw-prompt small{display:flex;align-items:center;gap:.7em;color:#7ff3ff;font-weight:600}
.cw-pips{display:inline-flex;gap:.22em}
.cw-pips i{width:.5em;height:.5em;border-radius:50%;box-shadow:inset 0 0 0 1.5px #7ff3ff}
.cw-pips i.on{background:#7ff3ff}
#cw-flash{position:absolute;left:50%;bottom:15%;transform:translateX(-50%);padding:.55em 1em;border-radius:.5em;background:#03131cd0;color:#ffd9d5;font-weight:600}
#cw-scan{position:absolute;left:50%;top:50%;width:9.5em;height:9.5em;margin:-4.75em 0 0 -4.75em;display:grid;place-items:center}
#cw-scan svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}
#cw-scan .track{fill:none;stroke:#7ff3ff2e;stroke-width:4}
#cw-scan .arc{fill:none;stroke:#7ff3ff;stroke-width:5;stroke-linecap:round;filter:drop-shadow(0 0 3px #19c3d6)}
#cw-scan.done .arc{stroke:#ffc24a;filter:drop-shadow(0 0 4px #ffc24a)}
#cw-scan .sweep{position:absolute;inset:9%;border-radius:50%;background:conic-gradient(#7ff3ff00 72%,#7ff3ff47);animation:cw-sweep 1.3s linear infinite}
#cw-scan .c{position:relative;display:grid;justify-items:center;gap:.25em;text-shadow:0 1px 4px #000}
#cw-scan .c b{font:800 1.9em/1 system-ui,sans-serif;font-variant-numeric:tabular-nums}
#cw-scan .c span{font-size:.78em;color:#7ff3ff;font-weight:600}
@keyframes cw-sweep{to{transform:rotate(1turn)}}
#cw-pop{position:absolute;left:50%;top:34%;transform:translate(-50%,-50%);display:grid;justify-items:center;gap:.2em;opacity:0;text-shadow:0 2px 8px #000a}
#cw-pop b{font:900 4em/1 system-ui,sans-serif;color:#ffc24a;font-variant-numeric:tabular-nums}
#cw-pop span{font-size:1.1em;font-weight:700}
#cw-self{position:absolute;left:50%;top:18%;transform:translateX(-50%);font-size:3.5em;opacity:0}
#cw-lobby{display:grid;gap:.9em;padding:1em;border-radius:.7em;background:#03131cc4;text-align:left;font-weight:600;font-size:.9em}
#cw-lobby label,.cw-row{display:grid;gap:.4em}
#cw-lobby label,.cw-cap{font-size:.85em;color:#7ff3ff}
#cw-lobby input{font-size:1.05em}
.cw-skins{display:grid;grid-template-columns:repeat(6,1fr);gap:.35em}
#cw-lobby .cw-skins button{padding:.3em .25em;border-radius:.45em;background:#ffffff0d;box-shadow:inset 0 0 0 2px #7ff3ff22}
#cw-lobby .cw-skins button.on{background:#7ff3ff24;box-shadow:inset 0 0 0 2px #7ff3ff}
.cw-skins svg{width:100%;height:auto}
.cw-list{display:grid;gap:.35em;max-height:11em;overflow:auto}
#cw-lobby .cw-list button{justify-content:flex-start;gap:.8em;padding:.6em .8em;background:#e8fbff10;color:#e8fbff;box-shadow:inset 0 0 0 1px #7ff3ff38;text-transform:none;letter-spacing:0;text-align:left}
#cw-lobby .cw-list button.inv{box-shadow:inset 0 0 0 2px #ffc24a}
#cw-lobby .cw-list button:disabled{opacity:.45;cursor:not-allowed}
.cw-list span{display:grid;gap:.1em}
.cw-list small{font-weight:500;color:#9fd8e2}
.cw-list em{margin-left:auto;font-style:normal;font-variant-numeric:tabular-nums}
.cw-empty{font-weight:500;color:#9fd8e2}
.cw-new{display:flex;gap:.4em}
.cw-new input{flex:1;min-width:0}
#cw-lobby .cw-new button,#cw-lobby .cw-acts button{padding:.6em .9em;font-size:.85em}
.cw-acts{display:flex;flex-wrap:wrap;gap:.4em}
.cw-room{font-size:1.1em;color:#fff}
.cw-note{font-size:.85em;color:#ffd9d5;font-weight:500}
@media (prefers-reduced-motion:reduce){#cw-scan .sweep{animation:none}}
`;
