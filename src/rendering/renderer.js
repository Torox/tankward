import { CONFIG } from '../core/config.js';

/**
 * Renderer kapselt Canvas-Kontext, DPR-Resize und Hintergrund/Terrain-Zeichnung.
 * Logische Koordinaten sind CSS-Pixel; setTransform skaliert nach DPR.
 */
export class Renderer {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(CONFIG.world.minWidth, window.innerWidth);
    this.height = Math.max(CONFIG.world.minHeight, window.innerHeight);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    // Logische Pixel == CSS-Pixel
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.width = window.innerWidth;
    this.height = window.innerHeight;
  }

  /**
   * Himmel-Gradient gemaess Preset-Index.
   * @param {number} skyIndex
   */
  drawSky(skyIndex = 0) {
    const sky = CONFIG.sky.presets[skyIndex % CONFIG.sky.presets.length];
    const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  /**
   * Zeichnet das Terrain als gefuelltes Polygon mit Gras-Band oben und Erd-Verlauf darunter.
   * Performant durch ein einziges Path und ein zweites Pass fuer das Gras-Band.
   *
   * @param {import('../entities/terrain.js').Terrain} terrain
   */
  drawTerrain(terrain) {
    const ctx = this.ctx;
    const { earthTopColor, earthBotColor, surfaceColor, grassBandHeight } = CONFIG.terrain;

    // Erd-Polygon
    const earthGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    earthGrad.addColorStop(0, earthTopColor);
    earthGrad.addColorStop(1, earthBotColor);

    ctx.beginPath();
    ctx.moveTo(0, this.height);
    ctx.lineTo(0, terrain.heights[0]);
    for (let x = 1; x < terrain.width; x++) {
      ctx.lineTo(x, terrain.heights[x]);
    }
    ctx.lineTo(terrain.width - 1, this.height);
    ctx.closePath();
    ctx.fillStyle = earthGrad;
    ctx.fill();

    // Gras-Band: duenne Linie entlang der Oberflaeche
    ctx.strokeStyle = surfaceColor;
    ctx.lineWidth = grassBandHeight;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(0, terrain.heights[0]);
    for (let x = 1; x < terrain.width; x++) {
      ctx.lineTo(x, terrain.heights[x]);
    }
    ctx.stroke();
  }

  /** Vollbild loeschen — wird vor jedem Frame aufgerufen. */
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}
