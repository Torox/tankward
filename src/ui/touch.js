/**
 * Mobile-Touch-Steuerung — direkte Canvas-Manipulation statt Joystick.
 *
 * Konzept:
 *  - 1 Finger auf Canvas: Drag setzt Winkel + Stärke des aktiven Panzers
 *    (Vektor vom Tank zum Finger in WELT-Koordinaten = Zielrichtung,
 *    Distanz = Stärke).
 *  - 2 Finger: Pan der Karte (Mittelpunkt-Delta -> Camera-Pan).
 *  - Loslassen: nichts. Es gibt einen dedizierten FEUER-Button.
 *
 * Touch-Coords werden via renderer.screenToWorld in Welt-Koords umgerechnet,
 * damit Aim auch mit aktivem Zoom + Pan funktioniert.
 *
 * @param {import('../core/game.js').Game} game
 */
export function initTouchControls(game) {
  detectTouch();
  bindCanvasAim(game);
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

const POWER_REACH_PX = 220; // Welt-Pixel fuer Power=100

function bindCanvasAim(game) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let mode = 'idle'; // 'idle' | 'aim' | 'pan'
  let aimTouchId = null;
  let panLastMid = null;
  let panTouchIds = null;

  const screenToWorld = (clientX, clientY) => {
    const rect = canvas.getBoundingClientRect();
    return game.renderer.screenToWorld(clientX - rect.left, clientY - rect.top);
  };

  const applyAim = (touch) => {
    if (game.state !== 'PLAYER_TURN' || game.paused) return;
    const t = game.tanks[game.activeIndex];
    if (!t || !t.alive || !t.isHuman) return;

    const w = screenToWorld(touch.clientX, touch.clientY);
    const cx = t.x;
    const cy = t.y - 16;
    const dx = w.x - cx;
    const dy = w.y - cy;

    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    if (deg > 180) deg = deg > 270 ? 0 : 180;
    deg = clamp(deg, 5, 175);
    t.turretAngle = deg;

    const dist = Math.hypot(dx, dy);
    t.power = clamp(Math.round((dist / POWER_REACH_PX) * 100), 0, 100);
  };

  const updatePan = (touches) => {
    // Mid-Punkt zwischen den zwei verfolgten Fingern.
    let a = null, b = null;
    for (let i = 0; i < touches.length; i++) {
      if (touches[i].identifier === panTouchIds[0]) a = touches[i];
      if (touches[i].identifier === panTouchIds[1]) b = touches[i];
    }
    if (!a || !b) return;
    const rect = canvas.getBoundingClientRect();
    const midX = (a.clientX + b.clientX) / 2 - rect.left;
    const midY = (a.clientY + b.clientY) / 2 - rect.top;
    if (panLastMid) {
      // Pan in Welt-Pixeln = Screen-Delta / Scale (umgekehrt zum Mid-Movement).
      const scale = game.renderer._scale();
      const dx = (panLastMid.x - midX) / scale;
      const dy = (panLastMid.y - midY) / scale;
      game.renderer.pan(dx, dy);
    }
    panLastMid = { x: midX, y: midY };
  };

  canvas.addEventListener(
    'touchstart',
    (e) => {
      // Mehr als 1 Finger -> Pan-Modus
      if (e.touches.length >= 2) {
        e.preventDefault();
        if (mode === 'aim') {
          mode = 'idle';
          aimTouchId = null;
        }
        mode = 'pan';
        panTouchIds = [e.touches[0].identifier, e.touches[1].identifier];
        panLastMid = null;
        updatePan(e.touches);
        return;
      }
      // 1 Finger -> Aim
      if (game.state !== 'PLAYER_TURN') return;
      const t = game.tanks[game.activeIndex];
      if (!t || !t.isHuman || !t.alive) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();
      mode = 'aim';
      aimTouchId = touch.identifier;
      applyAim(touch);
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (mode === 'pan') {
        e.preventDefault();
        updatePan(e.touches);
        return;
      }
      if (mode === 'aim') {
        e.preventDefault();
        const touch = findTouch(e.changedTouches, aimTouchId);
        if (touch) applyAim(touch);
      }
    },
    { passive: false }
  );

  const endTouch = (e) => {
    if (mode === 'pan') {
      // Wenn nur noch 0 oder 1 Finger uebrig: Pan beenden.
      if (e.touches.length < 2) {
        mode = 'idle';
        panTouchIds = null;
        panLastMid = null;
      }
      return;
    }
    if (mode === 'aim') {
      const ended = findTouch(e.changedTouches, aimTouchId);
      if (ended) {
        mode = 'idle';
        aimTouchId = null;
      }
    }
  };
  canvas.addEventListener('touchend', endTouch);
  canvas.addEventListener('touchcancel', endTouch);
}

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

function findTouch(list, id) {
  for (let i = 0; i < list.length; i++) {
    if (list[i].identifier === id) return list[i];
  }
  return null;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
