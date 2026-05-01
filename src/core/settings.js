/**
 * localStorage-gestuetzte Einstellungen mit In-Memory-Fallback,
 * falls Storage nicht verfuegbar ist (z.B. Inkognito mit Quota=0).
 */
const KEY = 'tankward.settings.v1';

const DEFAULTS = {
  sound: true,
  music: false,
  musicTrack: 0,
  numPlayers: 4,
  numHumans: 1,
  aiDifficulty: 'pro',
  bestOf: 3,
  worldSize: 'mittel',
  // Einstellungen-Submenue:
  maxWind: 10,             // Legacy-Slider (-max..+max) — bleibt fuer Backward-Compat
  windStage: 'normal',     // Phase 2.3: off|mild|normal|strong|gale|random
  wallMode: 'off',         // Phase 2.2: off|wrap|sticky|elastic|random
  crumblePercent: 75,      // Phase 2.1: 0..100 — Wahrscheinlichkeit, dass Krater glattgezogen wird
  startCredits: 0          // Anfangsgeld pro Tank
};

let cache = null;

export function loadSettings() {
  if (cache) return { ...cache };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      cache = { ...DEFAULTS, ...JSON.parse(raw) };
    } else {
      cache = { ...DEFAULTS };
    }
  } catch {
    cache = { ...DEFAULTS };
  }
  return { ...cache };
}

export function saveSettings(patch) {
  cache = { ...(cache ?? DEFAULTS), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    /* in-memory only */
  }
  return { ...cache };
}
