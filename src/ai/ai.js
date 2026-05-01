import { GRAVITY, powerToVelocity, windToAcceleration } from '../physics/ballistics.js';
import { WEAPONS, canFire } from '../entities/weapons.js';
import { TANK_BODY_HEIGHT } from '../entities/tank.js';

/**
 * Schwierigkeitsstufen aus der Spec.
 * - beginner ("Anfaenger"): zufaellige Streuung (±30°) um die optimale Loesung
 * - pro      ("Profi"):     berechnete Parabel + leichte Streuung (±5°)
 * - expert   ("Pro"):       nahezu perfekt + Lernen aus letztem Schuss
 */
export const DIFFICULTY = Object.freeze({
  beginner: 'beginner',
  pro: 'pro',
  expert: 'expert'
});

const AIM_SPEED_DEG_PER_S = 90;
// Power-Range 0..1000 (Tank-Wars-3.2-Style); Speed entsprechend skaliert.
const POWER_SPEED_PER_S = 700;
const POST_FIRE_DELAY = 0.0; // wir verlassen aimen sofort wenn Ziel erreicht

export class AiController {
  /**
   * @param {import('../entities/tank.js').Tank} tank
   * @param {'beginner'|'pro'|'expert'} difficulty
   */
  constructor(tank, difficulty = DIFFICULTY.pro) {
    this.tank = tank;
    this.difficulty = difficulty;
    this.state = 'idle';
    this.aim = { angle: 90, power: 500 };
    this.targetTank = null;
    /** Letzter Schuss-Errorvektor (target - hit) zum Lernen (nur expert). */
    this.lastError = null;
  }

  /** Wird beim Eintritt in PLAYER_TURN aufgerufen, wenn der Panzer ein KI-Panzer ist. */
  beginTurn(game) {
    if (!this.tank.alive) return;
    this.state = 'aiming';

    const enemies = game.tanks.filter((t) => t.alive && t !== this.tank);
    if (enemies.length === 0) {
      this.state = 'firing';
      return;
    }

    this.targetTank = this._pickTarget(enemies);
    this.tank.selectedWeapon = this._pickWeapon();

    const sol = this._solveBallistic(game);
    this.aim = this._applyJitter(sol);
  }

  /**
   * Pro Frame: animiert den Turm langsam zur Zielloesung. Wenn dort: feuert.
   * @param {number} dt
   * @param {() => void} fire Callback, der das eigentliche Schiessen ausloest.
   */
  update(dt, fire) {
    if (this.state !== 'aiming') return;
    const t = this.tank;

    const dA = this.aim.angle - t.turretAngle;
    const dP = this.aim.power - t.power;
    if (Math.abs(dA) > 0.4) {
      const step = Math.sign(dA) * Math.min(Math.abs(dA), AIM_SPEED_DEG_PER_S * dt);
      t.adjustAngle(step);
    }
    if (Math.abs(dP) > 4) {
      const step = Math.sign(dP) * Math.min(Math.abs(dP), POWER_SPEED_PER_S * dt);
      t.adjustPower(step);
    }
    if (Math.abs(dA) < 0.4 && Math.abs(dP) < 4) {
      this.state = 'firing';
      fire();
    }
  }

  /** Hook fuer Lerneffekt der "expert"-Stufe. Game ruft das nach IMPACT auf. */
  recordImpact(impactX, impactY) {
    if (!this.targetTank) return;
    const tx = this.targetTank.x;
    const ty = this.targetTank.y - TANK_BODY_HEIGHT / 2 - 4;
    this.lastError = { dx: tx - impactX, dy: ty - impactY };
  }

  // -- Internals -------------------------------------------------------------

  _pickTarget(enemies) {
    // Schwaechsten zuerst, bei Gleichstand naechsten.
    enemies.sort((a, b) => {
      if (a.hp !== b.hp) return a.hp - b.hp;
      return Math.abs(a.x - this.tank.x) - Math.abs(b.x - this.tank.x);
    });
    return enemies[0];
  }

  _pickWeapon() {
    // Nur "starke" Waffen einsetzen, wenn vorhanden — der Standard ist die Default-Wahl.
    const t = this.tank;
    const priority = ['nuke', 'mirv', 'driller', 'heavy', 'cluster', 'roller', 'napalm', 'standard'];
    for (const id of priority) {
      if (canFire(t, id)) {
        // Auf "expert" auch Spezialwaffen direkt einsetzen; auf einfacheren Stufen
        // nur etwa jeden 2.-3. Zug.
        const w = WEAPONS[id];
        if (w.unlimited) continue; // standard kommt unten als Fallback
        if (this.difficulty === DIFFICULTY.expert) return id;
        if (this.difficulty === DIFFICULTY.pro && Math.random() < 0.5) return id;
        if (this.difficulty === DIFFICULTY.beginner && Math.random() < 0.2) return id;
      }
    }
    return 'standard';
  }

  _solveBallistic(game) {
    const target = this.targetTank;
    if (!target) return { angle: 90, power: 60 };

    const dx = target.x - this.tank.x;
    const aimRight = dx >= 0;

    // Zwei Iterationen: grobes Raster -> feines Raster um den Bestwert.
    let best = { angle: 90, power: 600, miss: Infinity };
    const evaluate = (a, p) => {
      const miss = this._simulate(a, p, game);
      if (miss < best.miss) best = { angle: a, power: p, miss };
    };

    const angleStart = aimRight ? 10 : 95;
    const angleEnd = aimRight ? 85 : 170;
    // Grobes Raster: 4° in angle, 80 Power-Stufen (0..1000-Range).
    for (let a = angleStart; a <= angleEnd; a += 4) {
      for (let p = 300; p <= 1000; p += 80) evaluate(a, p);
    }
    // Feinsuche +/- 6° und +/- 60 Stufen Power um best.
    for (let a = best.angle - 6; a <= best.angle + 6; a += 1) {
      if (a < 5 || a > 175) continue;
      for (let p = best.power - 60; p <= best.power + 60; p += 20) {
        if (p < 100 || p > 1000) continue;
        evaluate(a, p);
      }
    }
    return { angle: best.angle, power: best.power };
  }

  _applyJitter(sol) {
    let dA = 0;
    let dP = 0;
    if (this.difficulty === DIFFICULTY.beginner) {
      dA = (Math.random() - 0.5) * 60; // ±30°
      dP = (Math.random() - 0.5) * 300; // ±150 Power
    } else if (this.difficulty === DIFFICULTY.pro) {
      dA = (Math.random() - 0.5) * 10; // ±5°
      dP = (Math.random() - 0.5) * 60;
    } else {
      // expert
      dA = (Math.random() - 0.5) * 3;
      dP = (Math.random() - 0.5) * 20;
      // Lernen: kleine Korrektur basierend auf letztem Fehler
      if (this.lastError) {
        // Wenn dx > 0 (Treffer war zu weit links -> Ziel rechts), Power leicht erhoehen.
        const corr = Math.sign(this.lastError.dx) * Math.min(80, Math.abs(this.lastError.dx) * 0.4);
        dP += corr;
      }
    }
    return {
      angle: clamp(sol.angle + dA, 5, 175),
      power: clamp(sol.power + dP, 100, 1000)
    };
  }

  /**
   * Vorwaerts-Simulation der Ballistik. Returnt minimale Distanz Projektil <-> Ziel.
   */
  _simulate(angle, power, game) {
    const target = this.targetTank;
    const v0 = powerToVelocity(power);
    const rad = (angle * Math.PI) / 180;
    let x = this.tank.x;
    let y = this.tank.y - TANK_BODY_HEIGHT - 4 - 8; // Rohrhoehe approximiert
    let vx = Math.cos(rad) * v0;
    let vy = -Math.sin(rad) * v0;
    const ax = windToAcceleration(game.wind);
    const ay = GRAVITY;
    const dt = 1 / 60;
    const tx = target.x;
    const ty = target.y - TANK_BODY_HEIGHT / 2 - 4;
    let best = Infinity;
    for (let i = 0; i < 500; i++) {
      vx += ax * dt;
      vy += ay * dt;
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
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
