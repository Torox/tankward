/**
 * SoundManager — synthetisiert alle Effekte mit der Web Audio API; keine Asset-Dateien.
 *
 * Pattern: AudioContext lazy beim ersten User-Interaktions-Ereignis erstellen
 * (Browser blocken sonst Autoplay).
 */
export class SoundManager {
  constructor() {
    /** @type {AudioContext|null} */
    this.ctx = null;
    /** @type {GainNode|null} */
    this.master = null;
    /** @type {GainNode|null} */
    this.musicGain = null;
    /** @type {OscillatorNode|null} */
    this._musicSrc = null;
    this.muted = false;
    this.musicEnabled = true;
  }

  init() {
    if (this.ctx) return;
    const Ctor = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.7;
    this.master.connect(this.ctx.destination);
  }

  resume() {
    if (this.ctx?.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.7;
  }

  setMusic(on) {
    this.musicEnabled = on;
    if (on) this._startMusic();
    else this._stopMusic();
  }

  // -- Effekte ---------------------------------------------------------------

  /**
   * @param {string} weaponId
   */
  playShoot(weaponId = 'standard') {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const sizeFor = {
      standard: 1, heavy: 0.7, cluster: 0.9, napalm: 0.6,
      roller: 1, driller: 1.1, mirv: 0.6, nuke: 0.4
    };
    const size = sizeFor[weaponId] ?? 1;

    // Boom-Komponente
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220 * size, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.35, t + 0.01);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.22);

    // Knall (Rauschen)
    const noise = this._noiseSource(0.07);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1200;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.15, t + 0.005);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    noise.connect(filter).connect(ng).connect(this.master);
    noise.start(t);
    noise.stop(t + 0.09);
  }

  /**
   * @param {number} blastRadius
   */
  playExplosion(blastRadius = 35) {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const size = Math.min(2.5, blastRadius / 35); // 1 = standard, 3.4 = nuke

    const dur = 0.35 + size * 0.25;
    const noise = this._noiseSource(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2200, t);
    filter.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.6 * Math.min(1.4, size), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    noise.connect(filter).connect(g).connect(this.master);
    noise.start(t);
    noise.stop(t + dur + 0.05);

    // Sub-Rumble bei grossen Explosionen
    if (size > 1.3) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(60, t);
      osc.frequency.exponentialRampToValueAtTime(28, t + dur);
      const og = this.ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(0.45, t + 0.05);
      og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(og).connect(this.master);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  playClick() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 880;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.05);
  }

  playRoundEnd() {
    if (this.muted || !this.ctx) return;
    const t = this.ctx.currentTime;
    const notes = [523, 659, 784, 1047]; // C-Dur Arpeggio
    notes.forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = this.ctx.createGain();
      const start = t + i * 0.08;
      g.gain.setValueAtTime(0.0001, start);
      g.gain.exponentialRampToValueAtTime(0.15, start + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      osc.connect(g).connect(this.master);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  }

  // -- Hintergrund-Musik ------------------------------------------------------

  _startMusic() {
    if (!this.ctx || this._musicSrc) return;
    // Loopable Chip-Bass-Pattern.
    const t = this.ctx.currentTime;
    const dur = 8;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const sr = this.ctx.sampleRate;
    const notes = [110, 165, 130, 196, 110, 165, 146, 220];
    for (let i = 0; i < data.length; i++) {
      const time = i / sr;
      const beat = Math.floor((time / dur) * notes.length) % notes.length;
      const f = notes[beat];
      const phase = (time * f) % 1;
      const env = Math.exp(-((time * 4) % 0.5) * 3);
      data[i] = (phase < 0.5 ? 0.5 : -0.5) * env * 0.4;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = this.ctx.createGain();
    g.gain.value = 0.1;
    src.connect(g).connect(this.master);
    src.start(t);
    this._musicSrc = src;
    this.musicGain = g;
  }

  _stopMusic() {
    try {
      this._musicSrc?.stop();
    } catch (e) {
      // Bereits gestoppt — egal.
    }
    this._musicSrc = null;
    this.musicGain = null;
  }

  _noiseSource(seconds) {
    if (!this.ctx) throw new Error('no ctx');
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}
