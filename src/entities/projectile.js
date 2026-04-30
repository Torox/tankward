import { GRAVITY, windToAcceleration } from '../physics/ballistics.js';

const TRAIL_MAX = 24;

/**
 * Projektil — punktfoermige Flugbahn unter Schwerkraft + Wind.
 * Kollision/Schaden kommt in Schritt 5; hier reicht Flug + Off-Screen-Erkennung.
 */
export class Projectile {
  /**
   * @param {object} opts
   * @param {number} opts.x
   * @param {number} opts.y
   * @param {number} opts.vx
   * @param {number} opts.vy
   * @param {string} [opts.color]
   * @param {number} [opts.radius]
   * @param {string} [opts.ownerId]   ID des Schiessenden (fuer Self-Damage-Filter etc.)
   * @param {string} [opts.weaponId]  Welche Waffe — relevant ab Schritt 5
   */
  constructor({ x, y, vx, vy, color = '#fbbf24', radius = 3, ownerId = '', weaponId = 'standard' }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.color = color;
    this.radius = radius;
    this.ownerId = ownerId;
    this.weaponId = weaponId;
    this.alive = true;
    /** @type {{x:number,y:number}[]} Trail-Punkte fuer das Rendering */
    this.trail = [];
    this.age = 0;
  }

  /**
   * Eulerschritt. Fuer mehr Praezision koennte man Verlet/RK4 nehmen, aber Euler
   * ist hier voellig ausreichend, solange dt vernuenftig klein bleibt.
   *
   * @param {number} dt   Sekunden
   * @param {number} wind -10..+10
   * @param {{width:number,height:number}} bounds
   */
  update(dt, wind, bounds) {
    if (!this.alive) return;
    const ax = windToAcceleration(wind);
    const ay = GRAVITY;

    this.vx += ax * dt;
    this.vy += ay * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.age += dt;

    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();

    // Off-Screen (links/rechts/unten) -> tot.
    if (this.x < -50 || this.x > bounds.width + 50 || this.y > bounds.height + 50) {
      this.alive = false;
    }
  }
}
