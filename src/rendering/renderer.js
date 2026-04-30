import { CONFIG } from '../core/config.js';
import { TANK_BODY_HEIGHT, TANK_BODY_WIDTH, TURRET_LENGTH } from '../entities/tank.js';

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

  /**
   * Zeichnet einen Panzer (Body + Turm + Rohr + HP-Bar + Name).
   * Wenn `isActive`, wird ein gelber Pfeil ueber dem Panzer geblinkt — Hinweis,
   * wer am Zug ist.
   *
   * @param {import('../entities/tank.js').Tank} tank
   * @param {boolean} isActive
   * @param {number} now performance.now() — fuer das Blinken
   */
  drawTank(tank, isActive, now) {
    if (!tank.alive) return;
    const ctx = this.ctx;
    const cx = tank.x;
    const groundY = tank.y;

    const bodyW = TANK_BODY_WIDTH;
    const bodyH = TANK_BODY_HEIGHT;
    const trackH = 4;

    // Ketten (dunkler, etwas breiter)
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(cx - bodyW / 2 - 2, groundY - trackH, bodyW + 4, trackH);

    // Body
    ctx.fillStyle = tank.color;
    roundRect(ctx, cx - bodyW / 2, groundY - trackH - bodyH, bodyW, bodyH, 3);
    ctx.fill();

    // Body-Outline
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.stroke();

    // Turm-Halbkreis
    const turretCenterY = groundY - trackH - bodyH;
    ctx.beginPath();
    ctx.fillStyle = darken(tank.color, 0.2);
    ctx.arc(cx, turretCenterY, 8, Math.PI, 2 * Math.PI);
    ctx.fill();

    // Rohr
    const rad = (tank.turretAngle * Math.PI) / 180;
    const tipX = cx + Math.cos(rad) * TURRET_LENGTH;
    const tipY = turretCenterY - Math.sin(rad) * TURRET_LENGTH;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(cx, turretCenterY);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    // HP-Bar oberhalb des Panzers
    const hpW = bodyW + 4;
    const hpH = 3;
    const hpX = cx - hpW / 2;
    const hpY = groundY - trackH - bodyH - 18;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hpX - 1, hpY - 1, hpW + 2, hpH + 2);
    ctx.fillStyle = hpColor(tank.hp / tank.maxHp);
    ctx.fillRect(hpX, hpY, hpW * (tank.hp / tank.maxHp), hpH);

    // Name
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tank.name, cx, hpY - 4);

    // Active-Marker (blinkender Pfeil)
    if (isActive) {
      const blink = (Math.sin(now / 200) + 1) / 2;
      ctx.fillStyle = `rgba(251, 191, 36, ${0.5 + blink * 0.5})`;
      const arrowY = hpY - 18;
      ctx.beginPath();
      ctx.moveTo(cx, arrowY + 8);
      ctx.lineTo(cx - 6, arrowY);
      ctx.lineTo(cx + 6, arrowY);
      ctx.closePath();
      ctx.fill();
    }
  }

  /**
   * Zeichnet ein Projektil + Trail (verblassend).
   * @param {import('../entities/projectile.js').Projectile} p
   */
  drawProjectile(p) {
    if (!p.alive) return;
    const ctx = this.ctx;

    // Trail
    if (p.trail.length > 1) {
      ctx.lineCap = 'round';
      ctx.lineWidth = 2;
      for (let i = 1; i < p.trail.length; i++) {
        const a = p.trail[i - 1];
        const b = p.trail[i];
        const alpha = i / p.trail.length;
        ctx.strokeStyle = `rgba(251, 191, 36, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }

    // Kopf
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Wind-Indikator oben mittig: Pfeil + Zahlenwert.
   * @param {number} wind -10..+10
   */
  drawWindIndicator(wind) {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = 56;
    const maxArrow = 60;
    const arrowLen = (Math.abs(wind) / 10) * maxArrow;
    const dir = Math.sign(wind);

    // Hintergrund-Pille
    ctx.fillStyle = 'rgba(17, 26, 44, 0.7)';
    roundRect(ctx, cx - 90, cy - 14, 180, 28, 14);
    ctx.fill();

    // Pfeil
    if (arrowLen > 1) {
      ctx.strokeStyle = wind === 0 ? '#94a3b8' : (dir > 0 ? '#22c55e' : '#ef4444');
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - dir * arrowLen, cy);
      ctx.lineTo(cx + dir * arrowLen, cy);
      ctx.stroke();
      // Spitze
      ctx.beginPath();
      ctx.moveTo(cx + dir * arrowLen, cy);
      ctx.lineTo(cx + dir * (arrowLen - 6), cy - 4);
      ctx.lineTo(cx + dir * (arrowLen - 6), cy + 4);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    ctx.fillStyle = '#fde68a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Wind ${wind > 0 ? '+' : ''}${wind.toFixed(1)}`, cx, cy);
    ctx.textBaseline = 'alphabetic';
  }

  /** Vollbild loeschen — wird vor jedem Frame aufgerufen. */
  clear() {
    this.ctx.clearRect(0, 0, this.width, this.height);
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function hpColor(ratio) {
  if (ratio > 0.6) return '#22c55e';
  if (ratio > 0.3) return '#eab308';
  return '#ef4444';
}

function darken(hex, amount) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = Math.max(0, Math.round(parseInt(m[1], 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(m[2], 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(m[3], 16) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}
