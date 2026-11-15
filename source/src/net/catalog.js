// Shared by the client and the server: the same discoveries in the same places, generated from the same seed.
// The server uses it to validate a claim (does it exist? is the player close? has enough time passed?),
// the client to draw them and show how long an analysis takes.

export const ROOM_SEED = 0x5eabed;

// deterministic generator (mulberry32): same seed, same sequence everywhere
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// species and objects: size in metres, complexity 1-5, rarity 1 (common) - 4 (unique).
// `kind` says whether it swims; `mesh` picks the procedural shape the client draws.
export const SPECIES = [
  { key: 'clownfish', kind: 'fish', mesh: 'fish', it: 'Pesce pagliaccio', en: 'Clownfish', size: 0.3, complexity: 1, rarity: 1, color: [1.0, 0.45, 0.1] },
  { key: 'tang', kind: 'fish', mesh: 'fish', it: 'Pesce chirurgo blu', en: 'Blue tang', size: 0.4, complexity: 1, rarity: 1, color: [0.15, 0.4, 1.0] },
  { key: 'lionfish', kind: 'fish', mesh: 'fish', it: 'Pesce scorpione', en: 'Lionfish', size: 0.5, complexity: 3, rarity: 2, color: [0.9, 0.25, 0.2] },
  { key: 'seahorse', kind: 'fish', mesh: 'seahorse', it: 'Cavalluccio marino', en: 'Seahorse', size: 0.35, complexity: 4, rarity: 3, color: [1.0, 0.8, 0.3] },
  { key: 'octopus', kind: 'fish', mesh: 'octopus', it: 'Polpo', en: 'Octopus', size: 1.2, complexity: 4, rarity: 2, color: [0.85, 0.35, 0.5] },
  { key: 'grouper', kind: 'fish', mesh: 'fish', it: 'Cernia gigante', en: 'Giant grouper', size: 2.2, complexity: 2, rarity: 2, color: [0.45, 0.4, 0.3] },
  { key: 'turtle', kind: 'fish', mesh: 'turtle', it: 'Tartaruga marina', en: 'Sea turtle', size: 1.4, complexity: 3, rarity: 3, color: [0.35, 0.55, 0.3] },
  { key: 'shark', kind: 'fish', mesh: 'fish', it: 'Squalo martello', en: 'Hammerhead shark', size: 4.5, complexity: 4, rarity: 3, color: [0.55, 0.6, 0.65] },
  { key: 'jelly', kind: 'jelly', mesh: 'jelly', it: 'Medusa luminosa', en: 'Glowing jellyfish', size: 0.8, complexity: 3, rarity: 2, color: [0.6, 0.8, 1.0] },
  { key: 'nautilus', kind: 'shell', mesh: 'nautilus', it: 'Nautilo', en: 'Nautilus', size: 0.4, complexity: 5, rarity: 4, color: [0.95, 0.85, 0.7] },
  { key: 'conch', kind: 'shell', mesh: 'conch', it: 'Conchiglia regina', en: 'Queen conch', size: 0.5, complexity: 2, rarity: 1, color: [1.0, 0.7, 0.6] },
  { key: 'amphora', kind: 'relic', mesh: 'amphora', it: 'Anfora romana', en: 'Roman amphora', size: 0.9, complexity: 3, rarity: 3, color: [0.75, 0.4, 0.25] },
  { key: 'anchor', kind: 'relic', mesh: 'anchor', it: 'Ancora antica', en: 'Old anchor', size: 1.6, complexity: 2, rarity: 2, color: [0.4, 0.38, 0.36] },
  { key: 'chest', kind: 'relic', mesh: 'chest', it: 'Forziere del relitto', en: 'Shipwreck chest', size: 1.0, complexity: 5, rarity: 4, color: [0.6, 0.45, 0.2] },
  { key: 'coral', kind: 'coral', mesh: 'coral', it: 'Corallo arcobaleno', en: 'Rainbow coral', size: 1.8, complexity: 3, rarity: 2, color: [1.0, 0.4, 0.7] },
];

// how many of each rarity live in the world
const PER_RARITY = { 1: 6, 2: 4, 3: 2, 4: 1 };

/**
 * The world's discoveries. bounds = {minX, maxX, minZ, maxZ}; heightAt(x, z) is optional and rests objects on the
 * sea floor (the server does without: it validates on the horizontal plane).
 */
export function generateDiscoverables(bounds, heightAt) {
  const r = rng(ROOM_SEED);
  const out = [];
  for (const sp of SPECIES) {
    const n = PER_RARITY[sp.rarity] || 1;
    for (let i = 0; i < n; i++) {
      const x = bounds.minX + r() * (bounds.maxX - bounds.minX);
      const z = bounds.minZ + r() * (bounds.maxZ - bounds.minZ);
      const ground = heightAt ? heightAt(x, z) : 0;
      // swimmers circle slowly around a fixed point; objects lie on the floor
      const swims = sp.kind === 'fish' || sp.kind === 'jelly';
      const lift = swims ? 2 + r() * 6 : sp.size * 0.15;
      out.push({
        ...sp,
        id: `${sp.key}-${i}`,
        anchor: [x, ground + lift, z],
        orbit: swims ? 1.5 + r() * 4 : 0,
        speed: swims ? 0.15 + r() * 0.3 : 0,
        phase: r() * Math.PI * 2,
      });
    }
  }
  return out;
}

// position at time t (seconds of wall clock): every client computes the same one
export function positionAt(d, t) {
  if (!d.orbit) return d.anchor;
  const a = d.phase + t * d.speed;
  return [d.anchor[0] + Math.cos(a) * d.orbit, d.anchor[1] + Math.sin(a * 0.7) * 0.6, d.anchor[2] + Math.sin(a) * d.orbit];
}

// the bigger and more complex, the longer it takes to analyse
export function analysisSeconds(d) {
  return Math.min(20, 2 + d.complexity * 1.6 + d.size * 0.9);
}

// points: complexity, size and rarity
export function pointsFor(d) {
  return Math.round(10 * d.complexity + 6 * d.size + 25 * (d.rarity - 1));
}

// maximum horizontal distance for an analysis, in metres
export const ANALYZE_RANGE = 14;
// voices fade linearly to silence at this distance
export const VOICE_RANGE = 40;

export const SKINS = [
  { key: 'giallo', it: 'Classico', en: 'Classic', hull: [1.0, 0.78, 0.15], trim: [0.15, 0.15, 0.18] },
  { key: 'abisso', it: 'Abisso', en: 'Abyss', hull: [0.1, 0.18, 0.35], trim: [0.3, 0.9, 1.0] },
  { key: 'corallo', it: 'Corallo', en: 'Coral', hull: [1.0, 0.45, 0.4], trim: [1.0, 0.95, 0.85] },
  { key: 'kelp', it: 'Kelp', en: 'Kelp', hull: [0.25, 0.55, 0.3], trim: [0.9, 0.8, 0.3] },
  { key: 'ghiaccio', it: 'Ghiaccio', en: 'Ice', hull: [0.85, 0.92, 1.0], trim: [0.3, 0.5, 0.9] },
  { key: 'magma', it: 'Magma', en: 'Magma', hull: [0.2, 0.08, 0.06], trim: [1.0, 0.4, 0.1] },
];

export const EMOTES = [
  { key: 'wave', it: 'Ciao', en: 'Hi', glyph: '👋' },
  { key: 'heart', it: 'Bello', en: 'Nice', glyph: '❤️' },
  { key: 'wow', it: 'Wow', en: 'Wow', glyph: '😮' },
  { key: 'look', it: 'Guarda qui', en: 'Look here', glyph: '👀' },
  { key: 'laugh', it: 'Ahah', en: 'Haha', glyph: '😂' },
  { key: 'bye', it: 'Risalgo', en: 'Surfacing', glyph: '🫧' },
];
