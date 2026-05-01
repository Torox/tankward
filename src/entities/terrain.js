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

  /**
   * Schneidet einen kreisfoermigen Krater an (cx, cy) mit Radius r aus dem Terrain.
   * Fuer jede Spalte x in [cx-r .. cx+r] liegt der Krater vertikal in [cy-chord, cy+chord].
   *
   * - War die alte Oberflaeche INNERHALB der Krater-Spalte: neue Oberflaeche = cy+chord
   *   (Material darueber wurde weggesprengt -> Surface faellt nach unten).
   * - War die Oberflaeche OBERHALB des Kraters (= surface y < cy-chord, also in der Luft):
   *   keine Aenderung — Krater haengt unter Tank-Plateau.
   * - War die Oberflaeche UNTERHALB des Kraters: keine Aenderung — die Heightmap kann
   *   keine Tunnel darstellen, also lassen wir die Oberflaeche.
   *
   * @param {number} cx
   * @param {number} cy
   * @param {number} r
   */
  carve(cx, cy, r) {
    const xMin = Math.max(0, Math.floor(cx - r));
    const xMax = Math.min(this.width - 1, Math.ceil(cx + r));
    const r2 = r * r;
    for (let x = xMin; x <= xMax; x++) {
      const dx = x - cx;
      const chord = Math.sqrt(Math.max(0, r2 - dx * dx));
      const bot = cy + chord;
      const surf = this.heights[x];
      // Krater hinterlaesst IMMER eine sichtbare Senke an der Oberflaeche.
      // Drei Faelle:
      //   surf >= top, surf <= bot: klassischer Surface-Treffer
      //                             -> Oberflaeche faellt auf Krater-Boden.
      //   surf < top:               Explosion im Erdreich oder hinter Cliff
      //                             -> Erde ueber dem Krater kollabiert hinein,
      //                                Oberflaeche faellt ebenfalls auf bot.
      //   surf > bot:               Explosion in der Luft (untypisch)
      //                             -> keine Aenderung.
      if (surf <= bot) {
        this.heights[x] = Math.min(this.height - 1, bot);
      }
    }
  }

  /**
   * Phase 2.1: Crumble-Effekt nach einem Krater. Zieht die Kanten des Kraters
   * weicher, wenn die Wuerfel-Probe gegen `crumblePercent` aufgeht.
   *
   * Bei 100 %: jeder Krater wird geglaettet -> sanfte, abgerundete Kerben.
   * Bei 0 %: kein Smoothing -> harte, kantige Kraeter (Cartoon-Stil).
   * Dazwischen: stochastisch.
   *
   * @param {number} cx
   * @param {number} r       Original-Krater-Radius
   * @param {number} percent 0..100
   */
  smoothCrater(cx, r, percent) {
    if (percent <= 0) return;
    // Anzahl der 3-Tap-Smoothing-Passes skaliert linear mit percent.
    // Deterministisch -> sichtbarer Gradient zwischen 0 % und 100 %.
    //   25 %  -> 1 Pass  (leichte Glaettung)
    //   50 %  -> 2 Passes
    //   75 %  -> 3 Passes
    //  100 %  -> 4 Passes (deutlich abgerundet)
    const passes = Math.max(1, Math.round(percent / 25));
    const range = Math.ceil(r * 1.5);
    const xMin = Math.max(1, Math.floor(cx - range));
    const xMax = Math.min(this.width - 2, Math.ceil(cx + range));
    for (let pass = 0; pass < passes; pass++) {
      const next = new Float32Array(xMax - xMin + 1);
      for (let x = xMin; x <= xMax; x++) {
        const a = this.heights[x - 1];
        const b = this.heights[x];
        const c = this.heights[x + 1];
        next[x - xMin] = (a + 2 * b + c) / 4;
      }
      for (let x = xMin; x <= xMax; x++) {
        this.heights[x] = next[x - xMin];
      }
    }
  }
}
