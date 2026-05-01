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
    /** Viewport in CSS-Pixeln (= sichtbarer Bereich auf dem Bildschirm). */
    this.viewportW = 0;
    this.viewportH = 0;
    /** Welt-Dimensionen in Welt-Einheiten (== CSS-Pixel im "Klein"-Preset). */
    this.worldW = 1280;
    this.worldH = 720;
    this.dpr = 1;
    /** Camera: zoom relativ zum Fit-Scale; pan in Welt-Koordinaten. */
    this.camera = { zoom: 1, panX: 0, panY: 0 };
    /** Ziel-Camera (fuer animiertes Hin-Lerpen bei Game-getriebenen Aenderungen). */
    this.targetCamera = { zoom: 1, panX: 0, panY: 0 };
    /** 0 = sofortiges Snap; > 0 = Smoothing-Rate (groesser = schneller). */
    this.smoothing = 0;
    /** Screen-Shake-Zustand (gesetzt von Game._detonate). */
    this.shakeMagnitude = 0;
    this.shakeTime = 0;
    this.shakeMaxTime = 0;
    /** Aktiver Shake-Offset, in Frame-time einmal berechnet, fuer beide Transformations-Pfade. */
    this._shakeDx = 0;
    this._shakeDy = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    // visualViewport reagiert auf Browser-UI-Aufklappen (iOS-URL-Bar etc.) — nicht
    // jeder Browser feuert dabei `resize` aufs window, also auch hier hooken.
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', () => this.resize());
    }
  }

  /**
   * Setzt die Welt-Dimensionen. Vom Game am Rundenstart aufgerufen.
   * @param {number} w Welt-Breite (CSS-Pixel-Einheiten)
   * @param {number} h Welt-Hoehe
   */
  setWorld(w, h) {
    this.worldW = w;
    this.worldH = h;
    this._clampPan();
  }

  /**
   * Sofortiger Zoom (User-Input — Pinch, Mausrad, D-Pad). Verankert um
   * den optionalen Welt-Punkt `anchor` (default: Viewport-Center), damit
   * der Punkt unter dem Mauszeiger/Finger fix bleibt.
   *
   * @param {number} z neuer Zoom-Faktor
   * @param {{x:number,y:number}} [anchor] Welt-Punkt der unverschoben bleibt
   */
  setZoom(z, anchor) {
    const newZoom = Math.max(1, Math.min(4, z));
    if (newZoom === this.camera.zoom) return;
    const fixed = anchor ?? this.screenToWorld(this.viewportW / 2, this.viewportH / 2);
    // Bestimme den Screen-Offset des Anker-Punkts vor dem Zoom.
    const oldS = this._scale();
    const screenOfAnchor = {
      x: (fixed.x - this.camera.panX) * oldS,
      y: (fixed.y - this.camera.panY) * oldS
    };
    this.camera.zoom = newZoom;
    if (newZoom <= 1) {
      this.camera.panX = 0;
      this.camera.panY = 0;
    } else {
      const newS = this._scale();
      this.camera.panX = fixed.x - screenOfAnchor.x / newS;
      this.camera.panY = fixed.y - screenOfAnchor.y / newS;
      this._clampPan();
    }
    this._syncTarget();
  }

  /** Pan in Welt-Pixeln, akkumulativ — fuer User-Input (Maus, 2-Finger). */
  pan(dx, dy) {
    this.camera.panX += dx;
    this.camera.panY += dy;
    this._clampPan();
    this._syncTarget();
  }

  /** Setzt Pan auf (0,0) und Zoom auf 1 — typischer Reset bei neuer Runde. */
  resetCamera() {
    this.camera.zoom = 1;
    this.camera.panX = 0;
    this.camera.panY = 0;
    this._syncTarget();
  }

  /**
   * Animiertes Setzen einer Ziel-Camera. Game ruft das fuer "smooth zur
   * Gesamtuebersicht beim Schuss" oder "verfolge das Projektil".
   *
   * @param {{zoom?:number, panX?:number, panY?:number, centerWorld?:{x:number,y:number}}} target
   * @param {number} [smoothing=8] Lerp-Rate pro Sekunde (0 = sofort)
   */
  setCameraTarget(target, smoothing = 8) {
    if (target.zoom !== undefined) {
      this.targetCamera.zoom = Math.max(1, Math.min(4, target.zoom));
    }
    if (target.centerWorld) {
      // Pan so, dass centerWorld unter dem Viewport-Mittelpunkt landet.
      const z = this.targetCamera.zoom;
      const fitS = this._fitScale();
      const s = fitS * z;
      const visibleW = this.viewportW / s;
      const visibleH = this.viewportH / s;
      this.targetCamera.panX = target.centerWorld.x - visibleW / 2;
      this.targetCamera.panY = target.centerWorld.y - visibleH / 2;
    } else {
      if (target.panX !== undefined) this.targetCamera.panX = target.panX;
      if (target.panY !== undefined) this.targetCamera.panY = target.panY;
    }
    // Pan-Limits auf das Ziel anwenden.
    if (this.targetCamera.zoom <= 1) {
      this.targetCamera.panX = 0;
      this.targetCamera.panY = 0;
    } else {
      const s = this._fitScale() * this.targetCamera.zoom;
      const maxX = Math.max(0, this.worldW - this.viewportW / s);
      const maxY = Math.max(0, this.worldH - this.viewportH / s);
      this.targetCamera.panX = Math.max(0, Math.min(maxX, this.targetCamera.panX));
      this.targetCamera.panY = Math.max(0, Math.min(maxY, this.targetCamera.panY));
    }
    this.smoothing = smoothing;
  }

  /** Stoppt Camera-Animation (= Target = aktuelle Camera). */
  _syncTarget() {
    this.targetCamera.zoom = this.camera.zoom;
    this.targetCamera.panX = this.camera.panX;
    this.targetCamera.panY = this.camera.panY;
    this.smoothing = 0;
  }

  /** Fit-Scale: skaliert die Welt so, dass sie ins Viewport passt. */
  _fitScale() {
    return Math.min(this.viewportW / this.worldW, this.viewportH / this.worldH);
  }

  /** Effektiver Skalierungsfaktor: fit-scale × zoom. */
  _scale() {
    return this._fitScale() * this.camera.zoom;
  }

  /** Zoom-getriebenes Pan-Limit, damit man nicht ueber den Welt-Rand pannt. */
  _clampPan() {
    const s = this._scale();
    const visibleW = this.viewportW / s;
    const visibleH = this.viewportH / s;
    const maxX = Math.max(0, this.worldW - visibleW);
    const maxY = Math.max(0, this.worldH - visibleH);
    this.camera.panX = Math.max(0, Math.min(maxX, this.camera.panX));
    this.camera.panY = Math.max(0, Math.min(maxY, this.camera.panY));
  }

  /** Bildschirm-Koordinate -> Welt-Koordinate (fuer Touch/Maus-Input). */
  screenToWorld(sx, sy) {
    const s = this._scale();
    // Welt ist ggf. zentriert wenn fit-scale durch eine Achse begrenzt ist
    const worldOnScreenW = this.worldW * s;
    const worldOnScreenH = this.worldH * s;
    const offsetX = Math.max(0, (this.viewportW - worldOnScreenW) / 2) - this.camera.panX * s;
    const offsetY = Math.max(0, (this.viewportH - worldOnScreenH) / 2) - this.camera.panY * s;
    return { x: (sx - offsetX) / s, y: (sy - offsetY) / s };
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
   * Pro Frame aufrufen, BEVOR irgendetwas gezeichnet wird. Tickt den Shake
   * und schaltet auf Bildschirm-Koordinaten (HUD/Overlay-Drawing).
   * Welt-Drawings danach via `applyCamera()` umschalten.
   * @param {number} dt
   */
  beginFrame(dt) {
    // Shake-Tick.
    if (this.shakeTime > 0) {
      this.shakeTime -= dt;
      const t = Math.max(0, this.shakeTime / this.shakeMaxTime);
      const m = this.shakeMagnitude * t;
      this._shakeDx = (Math.random() - 0.5) * 2 * m;
      this._shakeDy = (Math.random() - 0.5) * 2 * m;
      if (this.shakeTime <= 0) this.shakeMagnitude = 0;
    } else {
      this._shakeDx = 0;
      this._shakeDy = 0;
    }
    // Camera-Lerp gegen Target (nur wenn Smoothing aktiv ist).
    if (this.smoothing > 0) {
      const a = 1 - Math.exp(-this.smoothing * Math.max(0, dt));
      this.camera.zoom += (this.targetCamera.zoom - this.camera.zoom) * a;
      this.camera.panX += (this.targetCamera.panX - this.camera.panX) * a;
      this.camera.panY += (this.targetCamera.panY - this.camera.panY) * a;
      // Bei sehr nahem Ziel: snappen + Smoothing aus.
      const dz = Math.abs(this.targetCamera.zoom - this.camera.zoom);
      const dp = Math.hypot(
        this.targetCamera.panX - this.camera.panX,
        this.targetCamera.panY - this.camera.panY
      );
      if (dz < 0.005 && dp < 0.5) {
        this.camera.zoom = this.targetCamera.zoom;
        this.camera.panX = this.targetCamera.panX;
        this.camera.panY = this.targetCamera.panY;
        this.smoothing = 0;
      }
      this._clampPan();
    }
    // Identity-Transform (Screen-Space) mit Shake-Offset.
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, this._shakeDx * this.dpr, this._shakeDy * this.dpr);
  }

  /**
   * Setzt die Transform-Matrix in den Welt-Koord-Modus: alle nachfolgenden
   * Draw-Calls in Welt-Koordinaten werden korrekt skaliert + gepannt.
   */
  applyCamera() {
    const s = this._scale();
    const worldOnScreenW = this.worldW * s;
    const worldOnScreenH = this.worldH * s;
    const centerX = Math.max(0, (this.viewportW - worldOnScreenW) / 2);
    const centerY = Math.max(0, (this.viewportH - worldOnScreenH) / 2);
    const tx = centerX - this.camera.panX * s + this._shakeDx;
    const ty = centerY - this.camera.panY * s + this._shakeDy;
    this.ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, this.dpr * tx, this.dpr * ty);
  }

  /** Zurueck in Screen-Space (z.B. fuer HUD-Overlays nach den Welt-Drawings). */
  applyScreenSpace() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, this._shakeDx * this.dpr, this._shakeDy * this.dpr);
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewportW = Math.max(CONFIG.world.minWidth, window.innerWidth);
    this.viewportH = Math.max(CONFIG.world.minHeight, window.innerHeight);
    this.canvas.width = Math.floor(window.innerWidth * this.dpr);
    this.canvas.height = Math.floor(window.innerHeight * this.dpr);
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Echte Viewport-Werte (CSS-Pixel) — kann kleiner als minWidth sein.
    this.viewportW = window.innerWidth;
    this.viewportH = window.innerHeight;
    // Backwards-compat-Aliasse — manche Stellen referenzieren noch width/height.
    this.width = this.viewportW;
    this.height = this.viewportH;
    this._clampPan();
  }

  /**
   * Himmel-Gradient ueber den gesamten Screen-Space (NICHT in Welt-Koordinaten,
   * damit Letterbox-Bereiche bei Fit-Scale auch gefaerbt sind).
   * @param {number} skyIndex
   */
  drawSky(skyIndex = 0) {
    const sky = CONFIG.sky.presets[skyIndex % CONFIG.sky.presets.length];
    const g = this.ctx.createLinearGradient(0, 0, 0, this.viewportH);
    g.addColorStop(0, sky.top);
    g.addColorStop(0.55, sky.mid);
    g.addColorStop(1, sky.bot);
    this.ctx.fillStyle = g;
    this.ctx.fillRect(0, 0, this.viewportW, this.viewportH);
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
    // Terrain in WELT-Koordinaten — Erde reicht bis Welt-Unterkante.
    const groundBottom = terrain.height;

    const earthGrad = ctx.createLinearGradient(0, 0, 0, groundBottom);
    earthGrad.addColorStop(0, earthTopColor);
    earthGrad.addColorStop(1, earthBotColor);

    ctx.beginPath();
    ctx.moveTo(0, groundBottom);
    ctx.lineTo(0, terrain.heights[0]);
    for (let x = 1; x < terrain.width; x++) {
      ctx.lineTo(x, terrain.heights[x]);
    }
    ctx.lineTo(terrain.width - 1, groundBottom);
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
    // Wind-Indikator ist ein HUD-Element (Screen-Space, nicht World-Space).
    this.applyScreenSpace();
    const ctx = this.ctx;
    const cx = this.viewportW / 2;
    const pillW = this.viewportW <= 720 ? 130 : 180;
    const pillH = 36;
    // Immer unterhalb des oberen HUD-Streifens (das jetzt auf allen
    // Plattformen oben sitzt).
    const cy = 110;
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

  /**
   * Zeichnet die Trajektorie eines vergangenen Schusses als dezente,
   * gestrichelte Linie in Spieler-Farbe. Wird in Welt-Space aufgerufen.
   *
   * @param {{x:number, y:number}[]} trail
   * @param {string} color
   */
  drawShotTrail(trail, color) {
    if (!trail || trail.length < 2) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = colorWithAlpha(color, 0.4);
    ctx.lineWidth = 1.4;
    ctx.lineCap = 'round';
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.moveTo(trail[0].x, trail[0].y);
    for (let i = 1; i < trail.length; i++) ctx.lineTo(trail[i].x, trail[i].y);
    ctx.stroke();
    ctx.restore();
  }

  /** Vollbild loeschen — wird vor jedem Frame aufgerufen. */
  clear() {
    this.ctx.clearRect(0, 0, this.viewportW, this.viewportH);
  }
}

function colorWithAlpha(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
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
