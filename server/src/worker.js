// Abyssal Crew server: a Worker that serves the client, one Durable Object that keeps the list of open lobbies,
// and one Durable Object per lobby (a room).
//
//   GET  /api/lobbies               open lobbies
//   POST /api/lobbies               create a lobby {name, creator} -> {id}
//   GET  /ws?room=ID&name=&skin=    join a lobby (WebSocket)
//   anything else                   the client's static files
//
// The room is authoritative on what matters: who analysed a discovery first and how many points they get.
// Voice goes peer to peer (WebRTC); the room only relays the signalling messages.

import { generateDiscoverables, analysisSeconds, pointsFor, ANALYZE_RANGE, SKINS, EMOTES } from '../../source/src/net/catalog.js';
import { WORLD_BOUNDS } from '../../source/src/net/bounds.js';

const MAX_PLAYERS = 8;
const MAP_NAME = 'Abyssal Garden';
const DISCOVERABLES = generateDiscoverables(WORLD_BOUNDS);
const BY_ID = new Map(DISCOVERABLES.map((d) => [d.id, d]));
const SKIN_KEYS = new Set(SKINS.map((s) => s.key));
const EMOTE_KEYS = new Set(EMOTES.map((e) => e.key));

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// free text typed by players (names, lobby names): short, without control characters or markup
const clean = (s, max) =>
  String(s || '').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, max);

const newId = () => {
  const a = 'abcdefghjkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const dir = env.LOBBIES.get(env.LOBBIES.idFromName('directory'));

    if (url.pathname === '/api/lobbies') {
      if (req.method === 'GET') return dir.fetch('https://dir/list');
      if (req.method === 'POST') {
        const body = await req.json().catch(() => ({}));
        const name = clean(body.name, 40) || 'Expedition';
        const creator = clean(body.creator, 24) || 'Diver';
        const id = newId();
        const room = env.ROOMS.get(env.ROOMS.idFromName(id));
        await room.fetch('https://room/init', { method: 'POST', body: JSON.stringify({ id, name, creator }) });
        await dir.fetch('https://dir/create', {
          method: 'POST',
          body: JSON.stringify({ id, name, creator, map: MAP_NAME, max: MAX_PLAYERS }),
        });
        return json({ id });
      }
      return json({ error: 'method not allowed' }, 405);
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'expected a WebSocket' }, 426);
      const id = clean(url.searchParams.get('room'), 12).toLowerCase();
      if (!/^[a-z0-9]{4,12}$/.test(id)) return json({ error: 'invalid lobby' }, 400);
      const room = env.ROOMS.get(env.ROOMS.idFromName(id));
      return room.fetch(req);
    }

    return env.ASSETS.fetch(req);
  },
};

// ------------------------------------------------------------------ directory ---

export class Lobbies {
  constructor(ctx) {
    this.ctx = ctx;
  }

  async fetch(req) {
    const url = new URL(req.url);
    const lobbies = (await this.ctx.storage.get('lobbies')) || {};

    if (url.pathname === '/list') {
      const now = Date.now();
      // an occupied room reports at least every 30 s: one silent for 90 s is empty (its players vanished without
      // closing); a lobby left empty for 10 minutes drops off the list
      let changed = false;
      for (const [id, l] of Object.entries(lobbies)) {
        if (l.players > 0 && now - l.updatedAt > 90 * 1000) { l.players = 0; changed = true; }
        if (l.players === 0 && now - l.updatedAt > 10 * 60 * 1000) { delete lobbies[id]; changed = true; }
      }
      if (changed) await this.ctx.storage.put('lobbies', lobbies);
      const list = Object.values(lobbies).sort((a, b) => b.players - a.players || b.updatedAt - a.updatedAt);
      return json({ lobbies: list });
    }

    const body = await req.json().catch(() => ({}));

    if (url.pathname === '/create') {
      lobbies[body.id] = { ...body, players: 0, createdAt: Date.now(), updatedAt: Date.now() };
      await this.ctx.storage.put('lobbies', lobbies);
      return json({ ok: true });
    }

    if (url.pathname === '/update') {
      const l = lobbies[body.id];
      if (l) {
        l.players = body.players;
        l.updatedAt = Date.now();
        await this.ctx.storage.put('lobbies', lobbies);
      }
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  }
}

// ----------------------------------------------------------------------- room ---

export class Room {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    // analyses in progress: objId -> Map(playerId -> start in ms). Kept in memory: while analysing, the client sends
    // its position 10 times a second, so the room does not hibernate and the map is not lost.
    this.analyzing = new Map();
  }

  // Sockets of players still here. A client that vanished without closing (tab killed, network gone) stops sending
  // its heartbeat; after 20 s it no longer counts and its socket is closed.
  sockets() {
    const now = Date.now(), live = [];
    for (const ws of this.ctx.getWebSockets()) {
      const seen = this.info(ws).seen || now;
      if (now - seen < 20000) live.push(ws);
      else { try { ws.close(1001, 'timeout'); } catch {} }
    }
    return live;
  }

  info(ws) {
    return ws.deserializeAttachment() || {};
  }

  setInfo(ws, data) {
    ws.serializeAttachment(data);
  }

  send(ws, msg) {
    try { ws.send(JSON.stringify(msg)); } catch {}
  }

  broadcast(msg, except) {
    const s = JSON.stringify(msg);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      try { ws.send(s); } catch {}
    }
  }

  async reportCount(leaving) {
    const players = this.sockets().filter((ws) => ws !== leaving).length;
    const meta = (await this.ctx.storage.get('meta')) || {};
    if (!meta.id) return;
    const dir = this.env.LOBBIES.get(this.env.LOBBIES.idFromName('directory'));
    await dir.fetch('https://dir/update', { method: 'POST', body: JSON.stringify({ id: meta.id, players }) });
  }

  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === '/init') {
      const body = await req.json();
      await this.ctx.storage.put('meta', { id: body.id, name: body.name, creator: body.creator, map: MAP_NAME });
      return json({ ok: true });
    }

    const meta = await this.ctx.storage.get('meta');
    if (!meta) return json({ error: 'no such lobby' }, 404);
    if (this.sockets().length >= MAX_PLAYERS) return json({ error: 'lobby full' }, 409);

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID().slice(0, 8);
    const skin = SKIN_KEYS.has(url.searchParams.get('skin')) ? url.searchParams.get('skin') : SKINS[0].key;
    const name = clean(url.searchParams.get('name'), 24) || 'Diver';
    this.ctx.acceptWebSocket(server);

    const scores = (await this.ctx.storage.get('scores')) || {};
    const claims = (await this.ctx.storage.get('claims')) || {};
    const me = { id, name, skin, pos: [0, -20, 0], yaw: 0, pitch: 0, score: scores[name] || 0, seen: Date.now() };
    this.setInfo(server, me);

    const others = this.sockets().filter((ws) => ws !== server).map((ws) => this.info(ws));

    this.send(server, { t: 'welcome', you: me, players: others, claims, meta, max: MAX_PLAYERS });
    this.broadcast({ t: 'join', player: me }, server);
    await this.reportCount();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const me = this.info(ws);
    if (!me.id) return;

    switch (m.t) {
      case 'state': {
        // position and heading: trusted, but only to show the player to the others
        if (!Array.isArray(m.p) || m.p.length !== 3 || m.p.some((v) => !Number.isFinite(v))) return;
        me.pos = m.p;
        me.yaw = Number(m.yaw) || 0;
        me.pitch = Number(m.pitch) || 0;
        me.seen = Date.now();
        this.setInfo(ws, me);
        this.broadcast({ t: 'state', id: me.id, p: me.pos, yaw: me.yaw, pitch: me.pitch }, ws);
        if (!this.reported || Date.now() - this.reported > 30000) { this.reported = Date.now(); await this.reportCount(); }
        break;
      }

      case 'emote': {
        if (!EMOTE_KEYS.has(m.e)) return;
        this.broadcast({ t: 'emote', id: me.id, e: m.e });
        break;
      }

      case 'skin': {
        if (!SKIN_KEYS.has(m.s)) return;
        me.skin = m.s;
        this.setInfo(ws, me);
        this.broadcast({ t: 'skin', id: me.id, s: m.s });
        break;
      }

      case 'chat': {
        const text = clean(m.text, 200);
        if (text) this.broadcast({ t: 'chat', id: me.id, name: me.name, text });
        break;
      }

      // WebRTC signalling for voice: not read here, only delivered
      case 'rtc': {
        const target = this.sockets().find((s) => this.info(s).id === m.to);
        if (target) this.send(target, { t: 'rtc', from: me.id, data: m.data });
        break;
      }

      case 'analyze_start': {
        const d = BY_ID.get(m.obj);
        if (!d) return;
        const claims = (await this.ctx.storage.get('claims')) || {};
        if (claims[d.id]) return this.send(ws, { t: 'analyze_denied', obj: d.id, reason: 'claimed' });
        const dx = me.pos[0] - d.anchor[0];
        const dz = me.pos[2] - d.anchor[2];
        if (Math.hypot(dx, dz) > ANALYZE_RANGE + d.orbit + 2) {
          return this.send(ws, { t: 'analyze_denied', obj: d.id, reason: 'far' });
        }
        if (!this.analyzing.has(d.id)) this.analyzing.set(d.id, new Map());
        this.analyzing.get(d.id).set(me.id, Date.now());
        this.send(ws, { t: 'analyze_ok', obj: d.id, seconds: analysisSeconds(d) });
        this.broadcast({ t: 'analyzing', id: me.id, obj: d.id }, ws);
        break;
      }

      case 'analyze_cancel': {
        this.analyzing.get(m.obj)?.delete(me.id);
        break;
      }

      case 'analyze_done': {
        const d = BY_ID.get(m.obj);
        const started = this.analyzing.get(m.obj)?.get(me.id);
        if (!d || !started) return;
        const claims = (await this.ctx.storage.get('claims')) || {};
        if (claims[d.id]) return this.send(ws, { t: 'analyze_denied', obj: d.id, reason: 'claimed', by: claims[d.id].by });
        // 300 ms of slack for latency; earlier than that does not count
        if (Date.now() - started < analysisSeconds(d) * 1000 - 300) {
          return this.send(ws, { t: 'analyze_denied', obj: d.id, reason: 'early' });
        }
        const points = pointsFor(d);
        claims[d.id] = { by: me.name, points, at: Date.now() };
        const scores = (await this.ctx.storage.get('scores')) || {};
        scores[me.name] = (scores[me.name] || 0) + points;
        me.score = scores[me.name];
        this.setInfo(ws, me);
        await this.ctx.storage.put({ claims, scores });
        this.analyzing.delete(d.id);
        this.broadcast({ t: 'found', obj: d.id, by: me.name, byId: me.id, points, score: me.score });
        break;
      }
    }
  }

  async webSocketClose(ws) {
    const me = this.info(ws);
    for (const m of this.analyzing.values()) m.delete(me.id);
    this.broadcast({ t: 'leave', id: me.id }, ws);
    await this.reportCount(ws);
    try { ws.close(1000); } catch {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
}
