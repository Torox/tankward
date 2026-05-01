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
    /** Screen-Shake-Zustand (gesetzt von Game._detonate). */
    this.shakeMagnitude = 0;
    this.shakeTime = 0;
    this.shakeMaxTime = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /**
   * Loest einen Screen-Shake aus (z.B. bei Atombombe).
   * @param {number} magnitude Pixel
   * @param {number} duration Sekunden
   */
  triggerShake(magnitude, duration) {
    if (magnitude > this.shakeMagnitude) this.shakeMagnitude = magnitude;
    if (duration > this.shakeTime) {
      this.shakeTime = duration;
      this.shakeMaxTime = duration;
    }
  }

  /**
   * Pro Frame aufrufen, BEVOR irgendetwas gezeichnet wird. Setzt die Transform-
   * Matrix neu — bei aktivem Shake mit zufaelligem Offset, der mit der Restzeit
   * abklingt.
   * @param {number} dt
   */
  beginFrame(dt) {
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const t = Math.max(0, this.shakeTime / this.shakeMaxTime);
      const m = this.shakeMagnitude * t;
      const dx = (Math.random() - 0.5) * 2 * m;
      const dy = (Math.random() - 0.5) * 2 * m;
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, dx * this.dpr, dy * this.dpr);
      if (this.shakeTime <= 0) {
        this.shakeMagnitude = 0;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      }
    } else {
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }
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

    // Name (Kurzform — id, ohne "(KI)"-Suffix; Beschriftung soll nicht das halbe Tank-Bild verdecken)
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(tank.id, cx, hpY - 4);

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
    // Auf Mobile (schmal) weiter unten platzieren — sonst kollidiert er
    // mit dem oberen Mobile-HUD.
    const isMobile = this.width <= 720;
    const cx = this.width / 2;
    const pillW = isMobile ? 130 : 180;
    const pillH = 36;
    const cy = isMobile ? 110 : 50;
    const textY = cy + 6;
    const arrowY = cy - 8;
    const maxArrow = isMobile ? 48 : 70;
    const arrowLen = (Math.abs(wind) / 10) * maxArrow;
    const dir = Math.sign(wind);

    // Hintergrund-Pille
    ctx.fillStyle = 'rgba(17, 26, 44, 0.85)';
    roundRect(ctx, cx - pillW / 2, cy - pillH / 2, pillW, pillH, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Pfeil OBERHALB des Texts (nicht durch ihn).
    if (arrowLen > 1) {
      ctx.strokeStyle = wind === 0 ? '#94a3b8' : (dir > 0 ? '#22c55e' : '#ef4444');
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - dir * arrowLen, arrowY);
      ctx.lineTo(cx + dir * arrowLen, arrowY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx + dir * arrowLen, arrowY);
      ctx.lineTo(cx + dir * (arrowLen - 5), arrowY - 3);
      ctx.lineTo(cx + dir * (arrowLen - 5), arrowY + 3);
      ctx.closePath();
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fill();
    }

    ctx.fillStyle = '#fde68a';
    ctx.font = '10px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Wind ${wind > 0 ? '+' : ''}${wind.toFixed(1)}`, cx, textY);
    ctx.textBaseline = 'alphabetic';
  }

  /**
   * Zeichnet einen Brand-Blob (Napalm). Pulsierend, leichte Sub-Flammen.
   * @param {import('../entities/fire-blob.js').FireBlob} blob
   * @param {number} now
   */
  drawFireBlob(blob, now) {
    if (!blob.alive) return;
    const ctx = this.ctx;
    const pulse = 0.85 + Math.sin(now / 80 + blob.x * 0.1) * 0.15;
    const r = blob.radius * pulse;

    // Aussenglow
    const grad = ctx.createRadialGradient(blob.x, blob.y, 2, blob.x, blob.y, r);
    grad.addColorStop(0, 'rgba(255, 220, 80, 0.95)');
    grad.addColorStop(0.45, 'rgba(239, 68, 68, 0.7)');
    grad.addColorStop(1, 'rgba(124, 45, 18, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Innerer Flammenkern
    ctx.fillStyle = 'rgba(255, 255, 200, 0.9)';
    ctx.beginPath();
    ctx.arc(blob.x, blob.y, Math.max(2, r * 0.25), 0, Math.PI * 2);
    ctx.fill();
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
