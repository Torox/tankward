/**
 * Mobile-Touch-Overlay. Wird nur initialisiert, wenn das Endgeraet einen
 * coarse Pointer hat (Telefon/Tablet). Bietet:
 *
 *  - Linker Joystick-Bereich: Drag setzt Winkel/Power direkt am aktiven Panzer
 *  - Rechter Bereich mit "FEUER"-Button + Waffen-Cycle-Button
 *
 * Schreibt direkt in Game/aktiven Tank — kein eigener State.
 */

const COARSE_QUERY = '(pointer: coarse)';

export function isTouchDevice() {
  return typeof window.matchMedia === 'function' && window.matchMedia(COARSE_QUERY).matches;
}

/**
 * Hangt sich an das Touch-Overlay-DOM. Erwartet folgende IDs aus main.js:
 *  - #touch-controls            Container (wird sichtbar gemacht)
 *  - #touch-aim                 Drag-Zielfeld
 *  - #touch-aim-knob            Visueller Knopf
 *  - #touch-fire                Feuer-Button
 *  - #touch-weapon              Waffen-Cycle-Button
 *
 * @param {import('../core/game.js').Game} game
 */
export function initTouchControls(game) {
  if (!isTouchDevice()) return;
  const root = document.getElementById('touch-controls');
  const aim = document.getElementById('touch-aim');
  const knob = document.getElementById('touch-aim-knob');
  const fire = document.getElementById('touch-fire');
  const weapon = document.getElementById('touch-weapon');
  if (!root || !aim || !fire) return;

  root.classList.remove('hidden');

  let dragging = false;

  const updateFromPoint = (clientX, clientY) => {
    const rect = aim.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    const r = Math.min(rect.width, rect.height) / 2;
    const dist = Math.min(r, Math.hypot(dx, dy));
    const angle = Math.atan2(-dy, dx); // -PI..PI mit oben = +PI/2
    let deg = (angle * 180) / Math.PI;
    if (deg < 0) deg += 360;
    // Wir interessieren uns nur fuer 0..180 (oben).
    deg = clamp(deg, 5, 175);

    const t = game.tanks[game.activeIndex];
    if (t && t.alive && t.isHuman) {
      t.turretAngle = deg;
      t.power = Math.round((dist / r) * 100);
    }

    // Knob visuell setzen.
    if (knob) {
      const nx = (dx / Math.max(1, Math.hypot(dx, dy))) * dist;
      const ny = (dy / Math.max(1, Math.hypot(dx, dy))) * dist;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
    }
  };

  aim.addEventListener('touchstart', (e) => {
    if (!e.touches[0]) return;
    e.preventDefault();
    dragging = true;
    updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
  });
  aim.addEventListener('touchmove', (e) => {
    if (!dragging || !e.touches[0]) return;
    e.preventDefault();
    updateFromPoint(e.touches[0].clientX, e.touches[0].clientY);
  });
  aim.addEventListener('touchend', () => {
    dragging = false;
  });

  fire.addEventListener('click', () => {
    // Programmgesteuerter Space-Press (geht durch denselben Pfad wie Tastatur).
    if (game.state === 'PLAYER_TURN') {
      const t = game.tanks[game.activeIndex];
      if (t && t.isHuman && t.alive) game._fire();
    }
  });
  weapon?.addEventListener('click', () => {
    const t = game.tanks[game.activeIndex];
    if (t && t.isHuman) game._cycleWeapon(t, +1);
  });
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
