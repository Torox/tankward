/**
 * Mulberry32 — kleiner, deterministischer PRNG.
 * Wir wollen reproduzierbares Terrain (z.B. fuer Tests / Replays).
 *
 * @param {number} seed
 * @returns {() => number} Liefert Zahlen in [0, 1).
 */
export function createRng(seed = Date.now() >>> 0) {
  let s = seed >>> 0;
  return function rng() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zufallszahl in [min, max). */
export function randRange(rng, min, max) {
  return min + (max - min) * rng();
}

/** Zufaelliger Integer in [min, max] (inklusive). */
export function randInt(rng, min, max) {
  return Math.floor(min + (max - min + 1) * rng());
}
