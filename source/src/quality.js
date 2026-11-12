// ============================================================================
// quality level, chosen before anything is built
// ============================================================================
// 0 High is the full scene. 1 Medium and 2 Low are the same world with every 2nd / 4th leaf, glint and pebble, and a
// smaller shadow map that only the terrain, the set pieces and the kelp are baked into. Low also goes without
// anti-aliasing and uses coarser rocks and corals, cheaper texture and shadow filtering, a smaller water texture
// and fewer steps through the light shafts.
// A first visit picks from cheap hints: phones get Low (Medium with 8 GB of memory), computers with 4 GB or less Low.
// localStorage.abyssal keeps "level,pixels,detail" for the next visit. abyssalLoad is set while a world is being
// built: if it is still set on the next visit, that load crashed the tab, and this one runs a level lower.
const mob = matchMedia('(pointer:coarse)').matches, mem = navigator.deviceMemory;
const keep = (k, v) => { try { localStorage[k] = v; } catch {} };
let SV = [], LV, bad;
try { SV = (localStorage.abyssal || '').split(','); bad = localStorage.abyssalLoad; } catch {}
LV = SV[0] ? +SV[0] : mob ? (mem > 7 ? 1 : 2) : mem <= 4 ? 2 : 0;
if (bad && LV < 2) { SV = [++LV]; keep('abyssal', LV); }
const THIN = 1 << LV, SHADOW = LV ? 2048 : 4096, AA = LV > 1 ? 1 : 4, WATER = LV > 1 ? 256 : 512, RAYN = LV > 1 ? 12 : 34;
