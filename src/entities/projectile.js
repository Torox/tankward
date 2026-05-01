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
  constructor({ x, y, vx, vy, color = '#fbbf24', radius = 3, ownerId = '', weaponId = 'standard', isChild = false }) {
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
    /** @type {'flying'|'rolling'|'drilling'|'piercing'} */
    this.mode = 'flying';
    /** Verbleibende Penetrations-Distanz (Phase 1.2). */
    this.pierceRemaining = 0;
    /** Spawn-Position — fuer "Pierce nur am Muendungsbereich"-Check (Phase 1.6). */
    this.spawnX = x;
    this.spawnY = y;
    /** Einmal gepierced -> kein zweites Mal moeglich. */
    this.hasPierced = false;
    /** Splits passieren nur einmal pro Projektil. */
    this.didSplit = false;
    /** True, wenn dieses Projektil eine Submunition ist (Streubombe/MIRV-Kind). */
    this.isChild = isChild;
    /** Roll-/Bohr-Zaehler werden bei Bedarf von Game gesetzt. */
    this.rollTime = 0;
    this.drillRemaining = 0;
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

    // Unten = immer tot (kein Boden-Bounce). Links/rechts wird in
    // game._applyWallMode behandelt (Phase 2.2).
    if (this.y > bounds.height + 50) {
      this.alive = false;
    }
  }
}
