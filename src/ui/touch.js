/**
 * Eingabe-Bindings (Touch + Maus) — Aim, Pan, Zoom.
 *
 * Aim:    D-Pad-Buttons unten links (Tap oder Press-and-Hold)
 * Pan:    1) Mobile: 2-Finger-Drag auf Canvas
 *         2) PC: Rechtsklick + Maus-Drag auf Canvas
 * Zoom:   1) Mobile: Pinch (2-Finger-Spreizung) auf Canvas
 *         2) PC: Mausrad
 *
 * Aim-Input wird in game.aimInput akkumuliert; das Game wendet das pro Frame
 * im _updatePlayerTurn an (gleicher Pfad wie Keyboard).
 *
 * @param {import('../core/game.js').Game} game
 */
export function initTouchControls(game) {
  detectTouch();
  bindCanvasGestures(game);
  bindMouseGestures(game);
  bindAimButtons(game);
  bindButtons(game);
}

let touchActive = false;

function detectTouch() {
  const enable = () => {
    if (touchActive) return;
    touchActive = true;
    document.body.classList.add('has-touch');
  };
  if (window.matchMedia?.('(pointer: coarse)').matches) enable();
  window.addEventListener('touchstart', enable, { once: true, capture: true, passive: true });
}

// -- Canvas-Gesten (Touch) --------------------------------------------------

function bindCanvasGestures(game) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let twoFingerActive = false;
  let lastDist = 0;
  let lastMid = null;

  const computeMid = (touches) => ({
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  });
  const computeDist = (touches) =>
    Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        twoFingerActive = true;
        lastDist = computeDist(e.touches);
        lastMid = computeMid(e.touches);
      }
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!twoFingerActive || e.touches.length < 2) return;
      e.preventDefault();
      const dist = computeDist(e.touches);
      const mid = computeMid(e.touches);
      const rect = canvas.getBoundingClientRect();

      // Zoom durch Distanz-Aenderung (Pinch): zoom-Factor = neueDist/alteDist.
      if (lastDist > 10 && dist > 10) {
        const factor = dist / lastDist;
        const newZoom = game.renderer.camera.zoom * factor;
        const anchor = game.renderer.screenToWorld(mid.x - rect.left, mid.y - rect.top);
        game.renderer.setZoom(newZoom, anchor);
      }
      // Pan durch Mid-Punkt-Verschiebung.
      if (lastMid) {
        const scale = game.renderer._scale();
        const dx = (lastMid.x - mid.x) / scale;
        const dy = (lastMid.y - mid.y) / scale;
        game.renderer.pan(dx, dy);
      }
      lastDist = dist;
      lastMid = mid;
    },
    { passive: false }
  );

  const end = (e) => {
    if (e.touches.length < 2) {
      twoFingerActive = false;
      lastMid = null;
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
}

// -- Maus-Gesten (PC) -------------------------------------------------------

function bindMouseGestures(game) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  // Rechtsklick + Drag = Pan. Kontextmenue unterdruecken.
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  let panning = false;
  let lastX = 0;
  let lastY = 0;

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 2) return; // nur rechte Maustaste
    panning = true;
    lastX = e.clientX;
    lastY = e.clientY;
    e.preventDefault();
  });
  window.addEventListener('mousemove', (e) => {
    if (!panning) return;
    const scale = game.renderer._scale();
    const dx = (lastX - e.clientX) / scale;
    const dy = (lastY - e.clientY) / scale;
    game.renderer.pan(dx, dy);
    lastX = e.clientX;
    lastY = e.clientY;
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 2) panning = false;
  });

  // Mausrad: Zoom anchored um Maus-Position.
  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const anchor = game.renderer.screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
      // deltaY: positiv = scroll runter = rauszoomen.
      const factor = Math.pow(0.999, e.deltaY); // weiches Step-Verhalten
      game.renderer.setZoom(game.renderer.camera.zoom * factor, anchor);
    },
    { passive: false }
  );
}

// -- D-Pad-Aim-Buttons -----------------------------------------------------

function bindAimButtons(game) {
  const panel = document.getElementById('control-panel');
  if (!panel) return;
  if (!game.aimInput) game.aimInput = { angleDir: 0, powerDir: 0 };

  /** @type {Record<string, [keyof typeof game.aimInput, number]>} */
  const apply = {
    'angle-left':  ['angleDir', +1], // Pfeiltaste links erhoeht angle (turret nach links)
    'angle-right': ['angleDir', -1],
    'power-up':    ['powerDir', +1],
    'power-down':  ['powerDir', -1]
  };

  // Sofort-Klick-Mengen bei Pointer-Down (kurzer Tap fuer feine Anpassung):
  const TAP_POWER = 5;   // ±5 Power pro Tap (bei Range 0..1000)
  const TAP_ANGLE = 0.5; // ±0.5° pro Tap

  panel.querySelectorAll('button[data-aim]').forEach((btn) => {
    const action = btn.getAttribute('data-aim');
    const cfg = apply[action];
    if (!cfg) return;
    const [key, value] = cfg;

    const press = (e) => {
      e.preventDefault();
      try { btn.setPointerCapture?.(e.pointerId); } catch (_) {}
      // Sofort-Tap: kleiner Klick auch bei <50ms Beruehrung. Garantiert
      // dass kurzes Antippen immer eine sichtbare Aenderung ergibt.
      const t = game.tanks[game.activeIndex];
      if (t && t.alive && game.state === 'PLAYER_TURN') {
        if (key === 'powerDir') t.adjustPower(value * TAP_POWER);
        else if (key === 'angleDir') t.adjustAngle(value * TAP_ANGLE);
      }
      // Continuous-Mode mit Hold-Time-Tracking fuer Beschleunigung in game.js.
      game.aimInput[key] = value;
      game.aimInput[`${key}_t0`] = performance.now();
    };
    const release = () => {
      if (game.aimInput[key] === value) {
        game.aimInput[key] = 0;
        game.aimInput[`${key}_t0`] = 0;
      }
    };

    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('pointerleave', release);
    btn.addEventListener('lostpointercapture', release);
  });
}

// -- FEUER + Waffe-Buttons --------------------------------------------------

function bindButtons(game) {
  const fire = document.getElementById('touch-fire');
  const weapon = document.getElementById('touch-weapon');

  fire?.addEventListener('click', (e) => {
    e.preventDefault();
    if (game.state !== 'PLAYER_TURN' || game.paused) return;
    const t = game.tanks[game.activeIndex];
    if (t && t.isHuman && t.alive) game._fire();
  });

  weapon?.addEventListener('click', (e) => {
    e.preventDefault();
    const t = game.tanks[game.activeIndex];
    if (t && t.isHuman) game._cycleWeapon(t, +1);
  });
}
