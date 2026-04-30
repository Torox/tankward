import { CONFIG } from '../core/config.js';
import { randRange } from '../core/rng.js';

/**
 * Terrain als Heightmap: heights[x] = y-Position (CSS-Pixel) der Oberflaeche.
 * Kleinere y-Werte = hoeher (Canvas-Konvention). Unter heights[x] ist Erde, darueber Luft.
 *
 * Spaeter (Schritt 5) wird heights mutiert (Krater) und settled (Schwerkraft).
 */
export class Terrain {
  /**
   * @param {number} width  Breite in CSS-Pixeln
   * @param {number} height Hoehe in CSS-Pixeln
   * @param {() => number} rng
   */
  constructor(width, height, rng) {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.rng = rng;
    /** @type {Float32Array} heights[x] = y der Oberflaeche */
    this.heights = new Float32Array(this.width);
    this.generate();
  }

  /**
   * Erzeugt eine huegelige Landschaft aus mehreren ueberlagerten Sinus-Oktaven
   * + leichtem Random-Walk-Jitter. Reicht fuer den Klassiker-Look.
   */
  generate() {
    const { baselineFraction, amplitude, octaves } = CONFIG.terrain;
    const baseline = this.height * baselineFraction;

    // Pro Oktave: Frequenz, Amplitude, Phasenoffset
    const oct = [];
    for (let i = 0; i < octaves; i++) {
      oct.push({
        freq: (0.5 + i * 0.7) * (Math.PI * 2) / this.width * (1 + i),
        amp: amplitude / (i + 1),
        phase: randRange(this.rng, 0, Math.PI * 2)
      });
    }

    for (let x = 0; x < this.width; x++) {
      let y = baseline;
      for (const o of oct) {
        y += Math.sin(x * o.freq + o.phase) * o.amp;
      }
      // Kleines Rauschen, damit es nicht zu glatt wirkt
      y += (this.rng() - 0.5) * 4;
      // Clamp — Boden darf nicht aus dem Frame raus
      y = Math.max(40, Math.min(this.height - 8, y));
      this.heights[x] = y;
    }

    // 1× Glaettung (Mittelwert mit Nachbarn), damit Sinus + Jitter weicher wird
    const smoothed = new Float32Array(this.width);
    for (let x = 0; x < this.width; x++) {
      const a = this.heights[Math.max(0, x - 1)];
      const b = this.heights[x];
      const c = this.heights[Math.min(this.width - 1, x + 1)];
      smoothed[x] = (a + b + c) / 3;
    }
    this.heights = smoothed;
  }

  /** Hoehe an x (gerundet & geclamped). */
  surfaceY(x) {
    const i = Math.max(0, Math.min(this.width - 1, Math.floor(x)));
    return this.heights[i];
  }

  /** True, wenn (x,y) unterhalb der Oberflaeche (also "in der Erde") liegt. */
  isSolid(x, y) {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return false;
    return y >= this.surfaceY(x);
  }
}
