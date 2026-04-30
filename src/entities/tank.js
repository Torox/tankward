/**
 * Panzer-Entity. Position klebt am Terrain (y = terrain.surfaceY(x) - bodyHeight/2).
 * Bewegung gibt es nicht (Artillery-Klassiker). Im Spiel veraendert der Spieler nur:
 *   - turretAngle (Grad, 0..180; 0 = rechts, 90 = oben, 180 = links)
 *   - power (0..100, beeinflusst spaeter v0 des Projektils)
 */

const ANGLE_MIN = 0;
const ANGLE_MAX = 180;
const POWER_MIN = 0;
const POWER_MAX = 100;

export const TANK_BODY_WIDTH = 32;
export const TANK_BODY_HEIGHT = 12;
export const TURRET_LENGTH = 18;

export class Tank {
  /**
   * @param {object} opts
   * @param {string} opts.id          Eindeutige ID (z.B. "P1")
   * @param {string} opts.name        Anzeige-Name
   * @param {string} opts.color       Hex-Farbe fuer Body/HP-Bar
   * @param {number} opts.x           x-Position in CSS-Pixel
   * @param {boolean} [opts.isHuman]  true = Mensch, false = KI (Default true)
   */
  constructor({ id, name, color, x, isHuman = true }) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.x = x;
    this.y = 0; // wird von snapToTerrain gesetzt
    this.hp = 100;
    this.maxHp = 100;
    this.credits = 0;
    this.turretAngle = 90;     // Grad — startet senkrecht nach oben
    this.power = 50;            // 0..100
    this.isHuman = isHuman;
    this.alive = true;
    /** @type {Map<string, number>} weaponId -> Anzahl */
    this.inventory = new Map();
  }

  /** Setzt y so, dass der Panzer auf dem Terrain steht. */
  snapToTerrain(terrain) {
    this.y = terrain.surfaceY(this.x);
  }

  /**
   * Rohr-Endpunkt in Welt-Koordinaten — wird fuer die Geschoss-Spawn-Position
   * und fuers Zeichnen des Rohrs verwendet.
   */
  turretTip() {
    const rad = (this.turretAngle * Math.PI) / 180;
    const cx = this.x;
    const cy = this.y - TANK_BODY_HEIGHT / 2;
    // In Canvas-Koordinaten geht +y nach unten -> sin negieren.
    return {
      x: cx + Math.cos(rad) * TURRET_LENGTH,
      y: cy - Math.sin(rad) * TURRET_LENGTH
    };
  }

  /** Winkel anpassen, geclamped. */
  adjustAngle(delta) {
    this.turretAngle = clamp(this.turretAngle + delta, ANGLE_MIN, ANGLE_MAX);
  }

  /** Stärke anpassen, geclamped. */
  adjustPower(delta) {
    this.power = clamp(this.power + delta, POWER_MIN, POWER_MAX);
  }

  /** HP abziehen; setzt alive=false bei <= 0. */
  takeDamage(amount) {
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.alive = false;
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** Standard-Farbpalette fuer bis zu 10 Spieler. */
export const TANK_COLORS = [
  '#ef4444', // rot
  '#3b82f6', // blau
  '#22c55e', // gruen
  '#eab308', // gelb
  '#a855f7', // violett
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
  '#84cc16', // lime
  '#f43f5e'  // rose
];

/**
 * Verteilt n Panzer auf zufaelligen, ausreichend voneinander entfernten x-Positionen.
 * Mindestabstand verhindert Spawn-Overlap.
 *
 * @param {number} n
 * @param {number} canvasWidth
 * @param {() => number} rng
 * @returns {number[]} sortierte x-Positionen
 */
export function pickSpawnPositions(n, canvasWidth, rng) {
  const margin = 60;
  const usable = canvasWidth - margin * 2;
  const minSpacing = Math.max(80, usable / (n * 1.6));

  const xs = [];
  let attempts = 0;
  while (xs.length < n && attempts < 500) {
    const x = margin + rng() * usable;
    if (xs.every((existing) => Math.abs(existing - x) >= minSpacing)) {
      xs.push(x);
    }
    attempts++;
  }
  // Fallback: gleichmaessige Verteilung, falls Random-Sampling nicht reicht
  while (xs.length < n) {
    xs.push(margin + ((xs.length + 0.5) * usable) / n);
  }
  xs.sort((a, b) => a - b);
  return xs;
}
