import { TANK_BODY_HEIGHT } from './tank.js';

/**
 * Brennender Bereich auf dem Boden — Tickschaden gegen Tanks im Radius.
 * Wird von Game.effects gehalten und pro Frame upgedatet.
 */
export class FireBlob {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} opts.radius
   * @param {number} opts.tickDamage
   * @param {number} opts.ticksRemaining
   * @param {number} opts.tickInterval Sekunden bis zum naechsten Tick
   */
  constructor({ x, y, radius, tickDamage, ticksRemaining, tickInterval }) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.tickDamage = tickDamage;
    this.ticksRemaining = ticksRemaining;
    this.tickInterval = tickInterval;
    this.timeToNextTick = tickInterval;
    this.alive = true;
    this.age = 0;
  }

  /**
   * @param {number} dt
   * @param {import('./tank.js').Tank[]} tanks
   * @returns {{tank: import('./tank.js').Tank, dmg: number}[]} verursachte Schaden
   */
  update(dt, tanks) {
    if (!this.alive) return [];
    this.age += dt;
    this.timeToNextTick -= dt;
    const out = [];
    if (this.timeToNextTick <= 0 && this.ticksRemaining > 0) {
      this.timeToNextTick += this.tickInterval;
      this.ticksRemaining--;
      for (const t of tanks) {
        if (!t.alive) continue;
        const cx = t.x;
        const cy = t.y - TANK_BODY_HEIGHT / 2 - 4;
        const d = Math.hypot(cx - this.x, cy - this.y);
        if (d <= this.radius) {
          t.takeDamage(this.tickDamage);
          out.push({ tank: t, dmg: this.tickDamage });
        }
      }
      if (this.ticksRemaining <= 0) this.alive = false;
    }
    return out;
  }
}
