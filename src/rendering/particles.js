import { GRAVITY } from '../physics/ballistics.js';

const MAX_PARTICLES = 1200;

/**
 * Generischer Partikel mit Position, Geschwindigkeit, Lebenszeit, Schwerkraft-Faktor.
 * Reicht fuer Explosionsfunken, Schutt und Rauch (Rauch hat negativen gravity-Faktor).
 */
export class Particle {
  constructor({ x, y, vx, vy, life, color, size, gravity = 1, fade = true }) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.life = life;
    this.maxLife = life;
    this.color = color;
    this.size = size;
    this.gravity = gravity;
    this.fade = fade;
    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return;
    this.life -= dt;
    if (this.life <= 0) {
      this.alive = false;
      return;
    }
    this.vy += GRAVITY * this.gravity * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }
}

export class ParticleSystem {
  constructor() {
    /** @type {Particle[]} */
    this.list = [];
  }

  count() {
    return this.list.length;
  }

  add(p) {
    this.list.push(p);
    if (this.list.length > MAX_PARTICLES) {
      this.list.splice(0, this.list.length - MAX_PARTICLES);
    }
  }

  update(dt) {
    for (const p of this.list) p.update(dt);
    this.list = this.list.filter((p) => p.alive);
  }

  draw(ctx) {
    for (const p of this.list) {
      const alpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  // -- Spawn-Helfer ----------------------------------------------------------

  /**
   * Explosionsburst: helle Funken + Schutt + Rauchwolke.
   * Stueckzahlen skalieren mit dem Blast-Radius.
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   */
  explosion(x, y, radius) {
    const sparkCount = Math.min(80, Math.round(radius * 1.5));
    const debrisCount = Math.min(40, Math.round(radius * 0.7));
    const smokeCount = Math.min(30, Math.round(radius * 0.5));

    for (let i = 0; i < sparkCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 90 + Math.random() * radius * 3;
      this.add(new Particle({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 50,
        life: 0.35 + Math.random() * 0.5,
        color: i % 3 === 0 ? '#fbbf24' : '#fff7e0',
        size: 2 + Math.random() * 3,
        gravity: 0.8
      }));
    }

    for (let i = 0; i < debrisCount; i++) {
      const a = -Math.PI + Math.random() * Math.PI; // bevorzugt nach oben/seitwaerts
      const speed = 50 + Math.random() * radius * 1.5;
      this.add(new Particle({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.9 + Math.random() * 0.8,
        color: ['#7c2d12', '#451a03', '#3d2b1a'][i % 3],
        size: 2 + Math.random() * 3,
        gravity: 1.0
      }));
    }

    for (let i = 0; i < smokeCount; i++) {
      this.add(new Particle({
        x: x + (Math.random() - 0.5) * 14,
        y: y + (Math.random() - 0.5) * 14,
        vx: (Math.random() - 0.5) * 30,
        vy: -25 - Math.random() * 35,
        life: 1.2 + Math.random() * 1.0,
        color: ['#475569', '#64748b', '#94a3b8'][i % 3],
        size: 4 + Math.random() * 5,
        gravity: -0.15 // Rauch steigt
      }));
    }
  }

  /**
   * Kleiner Trail-Funken — z.B. wenn ein Projektil ein Tank-Hit landet.
   */
  hitSparks(x, y) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 120 + Math.random() * 120;
      this.add(new Particle({
        x,
        y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        life: 0.25 + Math.random() * 0.2,
        color: '#fde68a',
        size: 2,
        gravity: 0.3
      }));
    }
  }

  /**
   * Tank-Tod: dichte schwarze Rauchwolke + Funken.
   */
  tankDeath(x, y) {
    for (let i = 0; i < 25; i++) {
      this.add(new Particle({
        x,
        y,
        vx: (Math.random() - 0.5) * 80,
        vy: -50 - Math.random() * 80,
        life: 1.5 + Math.random(),
        color: i % 2 === 0 ? '#1f2937' : '#475569',
        size: 5 + Math.random() * 4,
        gravity: -0.2
      }));
    }
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      this.add(new Particle({
        x,
        y,
        vx: Math.cos(a) * (60 + Math.random() * 100),
        vy: Math.sin(a) * (60 + Math.random() * 100) - 40,
        life: 0.5 + Math.random() * 0.4,
        color: '#fbbf24',
        size: 2,
        gravity: 0.6
      }));
    }
  }
}
