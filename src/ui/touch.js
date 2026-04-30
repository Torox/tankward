/**
 * Mobile-Touch-Steuerung — direkte Canvas-Manipulation statt Joystick.
 *
 * Konzept:
 *  - Finger auf Canvas legen + ziehen: setzt Winkel + Stärke des aktiven Panzers
 *    relativ zur Tank-Position (Vektor von Tank zu Finger = Zielrichtung,
 *    Distanz = Stärke).
 *  - Loslassen: nichts. Es gibt einen dedizierten FEUER-Button (vermeidet
 *    versehentliches Schiessen waehrend des Zielens).
 *  - Touch-Overlay wird automatisch sichtbar, sobald ein Touch-Event passiert
 *    ODER der Pointer "coarse" ist (Phone/Tablet).
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
  // Sofort, wenn das Geraet einen groben Pointer hat.
  if (window.matchMedia?.('(pointer: coarse)').matches) enable();
  // Sonst beim ersten Touch-Event (Hybrid-Geraete: Touchscreen-Laptop).
  window.addEventListener('touchstart', enable, { once: true, capture: true, passive: true });
}

const POWER_REACH_PX = 220; // Pixel-Distanz fuer Power=100 (Daumen-Reichweite)

function bindCanvasAim(game) {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;

  let dragging = false;
  let trackingTouchId = null;

  /** @param {Touch} touch */
  const apply = (touch) => {
    if (game.state !== 'PLAYER_TURN' || game.paused) return;
    const t = game.tanks[game.activeIndex];
    if (!t || !t.alive || !t.isHuman) return;

    const rect = canvas.getBoundingClientRect();
    const fx = touch.clientX - rect.left;
    const fy = touch.clientY - rect.top;

    // Vektor vom Rohrfuss zum Finger.
    const cx = t.x;
    const cy = t.y - 16; // ungefaehrer Turm-Mittelpunkt
    const dx = fx - cx;
    const dy = fy - cy;

    // Winkel berechnen (Canvas-Konvention: +y nach unten -> negieren).
    let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;
    if (deg < 0) deg += 360;
    // Tank kann nur 0..180 zielen (oben). Untere Halbkugel auf naechste
    // horizontale Grenze klemmen, damit der Spieler nicht "unten" ziehen kann.
    if (deg > 180) deg = deg > 270 ? 0 : 180;
    deg = clamp(deg, 5, 175);
    t.turretAngle = deg;

    // Power: Distanz / POWER_REACH_PX, geclamped.
    const dist = Math.hypot(dx, dy);
    t.power = clamp(Math.round((dist / POWER_REACH_PX) * 100), 0, 100);
  };

  canvas.addEventListener(
    'touchstart',
    (e) => {
      if (game.state !== 'PLAYER_TURN') return;
      const t = game.tanks[game.activeIndex];
      if (!t || !t.isHuman || !t.alive) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      e.preventDefault();
      dragging = true;
      trackingTouchId = touch.identifier;
      apply(touch);
    },
    { passive: false }
  );

  canvas.addEventListener(
    'touchmove',
    (e) => {
      if (!dragging) return;
      e.preventDefault();
      const touch = findTouch(e.changedTouches, trackingTouchId);
      if (touch) apply(touch);
    },
    { passive: false }
  );

  const endDrag = (e) => {
    if (!dragging) return;
    const ended = findTouch(e.changedTouches, trackingTouchId);
    if (ended) {
      dragging = false;
      trackingTouchId = null;
    }
  };
  canvas.addEventListener('touchend', endDrag);
  canvas.addEventListener('touchcancel', endDrag);
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
