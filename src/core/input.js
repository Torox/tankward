/**
 * Tasten-Input-Manager. Hält gedrueckte Keys und liefert pro Frame, welche
 * gerade aktiv sind. So koennen wir Auto-Repeat-Verhalten (Pfeiltaste halten
 * fuer schnelles Drehen) sauber implementieren ohne Browser-Auto-Repeat-Lag.
 *
 * Usage:
 *   const input = new Input();
 *   if (input.isDown('ArrowLeft')) tank.adjustAngle(-1);
 *   input.consume('Space');  // einmaliger Trigger (nicht Auto-Repeat)
 */
export class Input {
  constructor(target = window) {
    /** @type {Set<string>} */
    this.down = new Set();
    /** @type {Set<string>} keys, die in diesem Frame neu gedrueckt wurden */
    this.pressed = new Set();
    /** @type {Set<string>} keys, die in diesem Frame losgelassen wurden */
    this.released = new Set();

    target.addEventListener('keydown', (e) => {
      // ESC, Tab, Pfeiltasten, Space etc. nicht durch Browser default abfangen
      if (this._shouldPreventDefault(e.code)) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });

    target.addEventListener('keyup', (e) => {
      this.down.delete(e.code);
      this.released.add(e.code);
    });

    window.addEventListener('blur', () => this.down.clear());
  }

  /** Aufruf am Ende eines Frames, damit pressed/released sich zuruecksetzen. */
  endFrame() {
    this.pressed.clear();
    this.released.clear();
  }

  isDown(code) {
    return this.down.has(code);
  }

  /** True nur in dem Frame, in dem die Taste neu gedrueckt wurde. */
  wasPressed(code) {
    return this.pressed.has(code);
  }

  /** Holt Press-Trigger und entfernt ihn (so dass nachfolgende Checker nicht doppelt feuern). */
  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  _shouldPreventDefault(code) {
    return (
      code === 'Space' ||
      code === 'Tab' ||
      code === 'ArrowLeft' ||
      code === 'ArrowRight' ||
      code === 'ArrowUp' ||
      code === 'ArrowDown'
    );
  }
}
