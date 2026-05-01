/**
 * KI-Charakter-Roster (Phase 3) — inspiriert vom Original-Tank-Wars-3.2 (Kenny Morse, 1992).
 *
 * Jeder Charakter hat:
 *   - id, name, emoji, style, weakness  (Metadaten fuer UI/Picker)
 *   - weaponTier  (0..2 — bestimmt Shop-Aggressivitaet, ersetzt alte 3 Stufen)
 *   - solve(tank, target, game) -> { angle, power }
 *
 * Die solve()-Funktionen liefern bereits gejitterte Aim-Werte. Schwaechen sind
 * ECHTE Code-Limits (z. B. Windless Wit ignoriert Wind in der Simulation),
 * keine reine Lore — der Spieler kann sie aktiv ausnutzen.
 */

import { GRAVITY, powerToVelocity, windToAcceleration } from '../physics/ballistics.js';
import { TANK_BODY_HEIGHT } from '../entities/tank.js';

// -- Helpers ----------------------------------------------------------------

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Forwaerts-Simulation: kleinster Distanz-Wert Projektil <-> Target. */
function simulateMiss(tank, target, angle, power, wind, game) {
  const v0 = powerToVelocity(power);
  const rad = (angle * Math.PI) / 180;
  let x = tank.x;
  let y = tank.y - TANK_BODY_HEIGHT - 12;
  let vx = Math.cos(rad) * v0;
  let vy = -Math.sin(rad) * v0;
  const ax = windToAcceleration(wind);
  const tx = target.x;
  const ty = target.y - TANK_BODY_HEIGHT / 2 - 4;
  let best = Infinity;
  const dt = 1 / 60;
  for (let i = 0; i < 500; i++) {
    vx += ax * dt;
    vy += GRAVITY * dt;
    x += vx * dt;
    y += vy * dt;
    const d = Math.hypot(x - tx, y - ty);
    if (d < best) best = d;
    if (
      x < 0 ||
      x > game.terrain.width ||
      y > game.terrain.height ||
      y >= game.terrain.surfaceY(x)
    ) {
      break;
    }
  }
  return best;
}

/**
 * 2-Pass-Grid-Search ueber Angle & Power. Respektiert tank.powerMax (HP-Cap).
 * @param {{useWind?: boolean, angleStart?: number, angleEnd?: number}} opts
 */
function gridSearch(tank, target, game, opts = {}) {
  const useWind = opts.useWind ?? true;
  const wind = useWind ? game.wind : 0;
  const aimRight = target.x > tank.x;
  const angleStart = opts.angleStart ?? (aimRight ? 10 : 95);
  const angleEnd = opts.angleEnd ?? (aimRight ? 85 : 170);
  const pMax = Math.max(100, Math.min(1000, tank.powerMax));
  const pMin = Math.min(100, pMax);
  const pStep = Math.max(20, Math.round((pMax - pMin) / 9 / 10) * 10);

  let best = { angle: 90, power: pMax * 0.6, miss: Infinity };
  for (let a = angleStart; a <= angleEnd; a += 4) {
    for (let p = pMin; p <= pMax; p += pStep) {
      const m = simulateMiss(tank, target, a, p, wind, game);
      if (m < best.miss) best = { angle: a, power: p, miss: m };
    }
  }
  // Feinsuche
  const fineHalf = Math.min(60, Math.max(20, (pMax - pMin) / 8));
  for (let a = best.angle - 6; a <= best.angle + 6; a += 1) {
    if (a < 5 || a > 175) continue;
    for (let p = best.power - fineHalf; p <= best.power + fineHalf; p += 20) {
      if (p < pMin || p > pMax) continue;
      const m = simulateMiss(tank, target, a, p, wind, game);
      if (m < best.miss) best = { angle: a, power: p, miss: m };
    }
  }
  return { angle: best.angle, power: best.power };
}

/** Jitter (Streuung) anwenden + auf legale Range clampen. */
function applyJitter(sol, jitterDeg, jitterPower, tank) {
  const dA = (Math.random() - 0.5) * jitterDeg;
  const dP = (Math.random() - 0.5) * jitterPower;
  const pMax = Math.max(100, tank.powerMax);
  return {
    angle: clamp(sol.angle + dA, 5, 175),
    power: clamp(sol.power + dP, 100, pMax)
  };
}

// -- Charakter-Definitionen --------------------------------------------------

export const CHARACTERS = {
  'mr-stupid': {
    id: 'mr-stupid',
    name: 'Mr. Stupid',
    emoji: '🤡',
    style: 'Random Power, Random Winkel.',
    weakness: 'Trifft nur durch Glück. Idealer Trainings-Bot.',
    weaponTier: 0,
    solve(tank, target, game) {
      const aimRight = target.x > tank.x;
      const a = aimRight ? 10 + Math.random() * 75 : 95 + Math.random() * 75;
      const pMax = Math.max(100, tank.powerMax);
      const p = 100 + Math.random() * (pMax - 100);
      return { angle: a, power: p };
    }
  },

  lobber: {
    id: 'lobber',
    name: 'Lobber',
    emoji: '🏹',
    style: 'Hohe Bahn (~75°), parabolische Korrektur.',
    weakness: 'Wind > 10 wirft seine Bahn aus dem Tritt — Sturm-Stufe nutzen.',
    weaponTier: 1,
    solve(tank, target, game) {
      const aimRight = target.x > tank.x;
      const a = aimRight ? 75 : 105;
      const pMax = Math.max(100, tank.powerMax);
      // Power-Grid-Search bei festem Winkel.
      let best = { p: pMax * 0.6, miss: Infinity };
      for (let p = 200; p <= pMax; p += 50) {
        const m = simulateMiss(tank, target, a, p, game.wind, game);
        if (m < best.miss) best = { p, miss: m };
      }
      return applyJitter({ angle: a, power: best.p }, 5, 50, tank);
    }
  },

  rifleman: {
    id: 'rifleman',
    name: 'Rifleman',
    emoji: '🎯',
    style: 'Direktanvisierung mit voller Power.',
    weakness: 'Wenn das Ziel UNTER ihm ist, schießt er random.',
    weaponTier: 1,
    solve(tank, target, game) {
      const targetAbove = target.y < tank.y - 4;
      if (!targetAbove) {
        // Hilflos: random
        const aimRight = target.x > tank.x;
        const a = aimRight ? 10 + Math.random() * 75 : 95 + Math.random() * 75;
        const pMax = Math.max(100, tank.powerMax);
        return { angle: a, power: 200 + Math.random() * (pMax - 200) };
      }
      // Direkter Schuss
      const tipY = tank.y - TANK_BODY_HEIGHT - 12;
      const dx = target.x - tank.x;
      const dy = (target.y - TANK_BODY_HEIGHT / 2 - 4) - tipY;
      // atan2(-dy, dx) -> Winkel in Spielkoordinaten (positiv = nach oben)
      const a = (Math.atan2(-dy, dx) * 180) / Math.PI;
      const pMax = Math.max(100, tank.powerMax);
      return applyJitter({ angle: a, power: pMax }, 3, 30, tank);
    }
  },

  'windless-wit': {
    id: 'windless-wit',
    name: 'Windless Wit',
    emoji: '🌬️',
    style: 'Echte Physik-Berechnung — aber ignoriert Wind komplett.',
    weakness: 'Hoher Wind (Stark/Sturm) macht ihn fast harmlos.',
    weaponTier: 1,
    solve(tank, target, game) {
      const sol = gridSearch(tank, target, game, { useWind: false });
      return applyJitter(sol, 4, 40, tank);
    }
  },

  'lob-shoot': {
    id: 'lob-shoot',
    name: 'Lob & Shoot',
    emoji: '🎲',
    style: 'Lobber bei offenen Bands, Rifleman bei Bounce-Bands.',
    weakness: 'Random-Bands verwirren ihn — er trifft seine Strategie nicht.',
    weaponTier: 1,
    solve(tank, target, game) {
      const wallMode = game._currentWallMode || 'off';
      if (wallMode === 'off' || wallMode === 'wrap') {
        return CHARACTERS.lobber.solve(tank, target, game);
      }
      return CHARACTERS.rifleman.solve(tank, target, game);
    }
  },

  twanger: {
    id: 'twanger',
    name: 'Twanger',
    emoji: '🪞',
    style: 'Bounce-Schüsse mit hohem Winkel — nutzt Reflect-Bands.',
    weakness: 'Bei Bands=Aus oder Wrap fällt er auf Rifleman zurück.',
    weaponTier: 1,
    solve(tank, target, game) {
      const wallMode = game._currentWallMode || 'off';
      if (wallMode === 'off' || wallMode === 'wrap') {
        return CHARACTERS.rifleman.solve(tank, target, game);
      }
      // Bounce-Versuch: hoher Bogen Richtung Decke, hohe Power.
      const aimRight = target.x > tank.x;
      const a = aimRight ? 60 : 120;
      const pMax = Math.max(100, tank.powerMax);
      return applyJitter({ angle: a, power: pMax * 0.85 }, 5, 50, tank);
    }
  },

  'wind-master': {
    id: 'wind-master',
    name: 'Wind Master',
    emoji: '🌪️',
    style: 'Echte Physik MIT Wind-Kompensation. ~90 % Trefferquote.',
    weakness: 'Bei Bands=Bounce/Elastic gerät er ins Schleudern.',
    weaponTier: 2,
    solve(tank, target, game) {
      const wallMode = game._currentWallMode || 'off';
      // Bounce verwirrt ihn -> mehr Jitter, kleinere Praezision.
      const confused = wallMode === 'sticky' || wallMode === 'elastic';
      const sol = gridSearch(tank, target, game, { useWind: true });
      return applyJitter(sol, confused ? 8 : 2, confused ? 60 : 15, tank);
    }
  }
};

export const CHARACTER_KEYS = [
  'mr-stupid',
  'lobber',
  'rifleman',
  'windless-wit',
  'lob-shoot',
  'twanger',
  'wind-master'
];

/** Mapping fuer Backward-Compat von alter aiDifficulty-Setting. */
export const LEGACY_DIFFICULTY_MAP = {
  beginner: 'mr-stupid',
  pro: 'rifleman',
  expert: 'wind-master'
};

/** Liefert eine zufaellige Charakter-ID — fuer Setup mit aiCharacter='random'. */
export function pickRandomCharacter() {
  return CHARACTER_KEYS[Math.floor(Math.random() * CHARACTER_KEYS.length)];
}

/** Resolved character object from any input (id, 'random', legacy difficulty). */
export function resolveCharacter(idOrLegacy) {
  if (idOrLegacy === 'random') return CHARACTERS[pickRandomCharacter()];
  if (CHARACTERS[idOrLegacy]) return CHARACTERS[idOrLegacy];
  if (LEGACY_DIFFICULTY_MAP[idOrLegacy]) {
    return CHARACTERS[LEGACY_DIFFICULTY_MAP[idOrLegacy]];
  }
  // Fallback
  return CHARACTERS.rifleman;
}
