/**
 * Tech-House-Musik-Engine. Synthetisiert vier 16-Step-Loops mit Web Audio API —
 * keine Sample-Dateien, keine externen Calls.
 *
 * Look-Ahead-Scheduling-Pattern (Chris Wilson 2013): wir planen Audio-Events
 * ~100ms in der Zukunft via setTimeout(25ms), damit Browser-Throttling den
 * Beat nicht zertruemmert.
 *
 * Patterns laufen in 4/4 mit 16 Sechzehntel-Stepps. Jeder Track definiert pro
 * Step Kick, Closed/Open-Hat, Clap, Bass-Note, Chord-Stab.
 */

// Note-Namen -> Frequenz (Hz). Reicht von D2..C5.
const NOTE = {};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
for (let octave = 1; octave <= 6; octave++) {
  for (let n = 0; n < 12; n++) {
    const midi = (octave + 1) * 12 + n;
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    NOTE[`${NAMES[n]}${octave}`] = f;
  }
}

// Akkord-Definitionen (in 3. Oktave)
const CHORDS = {
  Am:  ['A3', 'C4', 'E4'],
  Em:  ['E3', 'G3', 'B3'],
  Dm:  ['D3', 'F3', 'A3'],
  F:   ['F3', 'A3', 'C4'],
  Cm:  ['C3', 'D#3', 'G3'],
  Gm:  ['G3', 'A#3', 'D4'],
  Fm:  ['F3', 'G#3', 'C4'],
  Bbm: ['A#3', 'C#4', 'F4']
};

// '.' = leer, ansonsten 'X' (Hit) bzw. Note-Name.
function p(s) {
  return s.split('').map((c) => (c === '.' ? 0 : 1));
}

const TRACKS = [
  {
    name: 'Deep Sundown',
    bpm: 122,
    kick: p('X...X...X...X...'),
    hatC: p('..X...X...X...X.'),
    hatO: p('.......X.......X'),
    clap: p('....X.......X...'),
    bass: ['A2', null, null, 'A2', null, 'E2', null, null, 'A2', null, null, 'C3', null, 'E2', null, null],
    chord: [null, null, null, null, null, null, null, null, 'Am', null, null, null, 'Em', null, null, null]
  },
  {
    name: 'Underground Drive',
    bpm: 126,
    kick: p('X...X...X...X...'),
    hatC: p('..X.X.X...X.X.X.'),
    hatO: p('.......X.......X'),
    clap: p('....X...........'),
    bass: ['C2', null, 'C2', null, 'G2', null, 'C2', null, 'C2', null, 'D#2', null, 'G2', null, 'C3', null],
    chord: [null, null, null, null, null, null, null, null, 'Cm', null, null, null, null, null, 'Gm', null]
  },
  {
    name: 'Tribal Pulse',
    bpm: 124,
    kick: p('X...X...X...X...'),
    hatC: p('.X.X.X.X.X.X.X.X'),
    hatO: p('................'),
    clap: p('....X.......X...'),
    bass: ['D2', null, null, 'A2', null, null, 'D2', null, 'D2', null, null, 'F2', null, null, 'A2', null],
    chord: [null, null, null, null, 'Dm', null, null, null, null, null, null, null, 'F', null, null, null]
  },
  {
    name: 'Peak Time',
    bpm: 128,
    kick: p('X...X...X...X...'),
    hatC: p('..X.X.X.X.X.X.X.'),
    hatO: p('.......X.......X'),
    clap: p('....X.......X...'),
    bass: ['F2', null, 'F2', null, 'C3', null, 'F2', null, 'F2', null, 'G#2', null, 'C3', null, 'F2', null],
    chord: [null, null, null, null, null, null, null, null, 'Fm', null, null, null, null, null, 'Bbm', null]
  }
];

const LOOK_AHEAD = 0.1;          // Sekunden Schedule-Vorlauf
const SCHEDULER_INTERVAL = 25;   // ms Polling

export class MusicEngine {
  /**
   * @param {AudioContext} ctx
   * @param {AudioNode} master Output-Ziel (i.d.R. SoundManager.master)
   */
  constructor(ctx, master) {
    this.ctx = ctx;
    this.master = master;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.18;
    this.gain.connect(master);

    /** @type {NodeJS.Timeout|null} */
    this._timer = null;
    this._noiseCache = new Map();

    this.trackIdx = 0;
    this.playing = false;
    this.nextStepTime = 0;
    this.step = 0;
  }

  get trackName() {
    return TRACKS[this.trackIdx]?.name ?? '';
  }

  get trackCount() {
    return TRACKS.length;
  }

  setTrack(idx) {
    this.trackIdx = ((idx % TRACKS.length) + TRACKS.length) % TRACKS.length;
  }

  start() {
    if (this.playing || !this.ctx) return;
    this.playing = true;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.step = 0;
    this._scheduler();
  }

  stop() {
    this.playing = false;
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
  }

  next() {
    this.setTrack(this.trackIdx + 1);
  }

  _scheduler() {
    if (!this.playing) return;
    const track = TRACKS[this.trackIdx];
    const stepDur = 60 / track.bpm / 4; // 16tel-Note in Sekunden
    while (this.nextStepTime < this.ctx.currentTime + LOOK_AHEAD) {
      this._scheduleStep(track, this.step, this.nextStepTime, stepDur);
      this.nextStepTime += stepDur;
      this.step = (this.step + 1) % 16;
    }
    this._timer = setTimeout(() => this._scheduler(), SCHEDULER_INTERVAL);
  }

  _scheduleStep(track, i, t, stepDur) {
    if (track.kick[i]) this._kick(t);
    if (track.hatC[i]) this._hat(t, false);
    if (track.hatO[i]) this._hat(t, true);
    if (track.clap[i]) this._clap(t);
    if (track.bass[i]) this._bass(track.bass[i], t, stepDur * 1.8);
    if (track.chord[i]) this._chord(track.chord[i], t, stepDur * 6);
  }

  // -- Synthese ---------------------------------------------------------------

  _kick(t) {
    const ctx = this.ctx;
    // Sub-Sweep (150 -> 40 Hz)
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + 0.2);

    // Click-Komponente (kurz hochfrequent)
    const click = ctx.createOscillator();
    click.type = 'triangle';
    click.frequency.value = 1200;
    const cg = ctx.createGain();
    cg.gain.setValueAtTime(0.0001, t);
    cg.gain.exponentialRampToValueAtTime(0.3, t + 0.001);
    cg.gain.exponentialRampToValueAtTime(0.001, t + 0.015);
    click.connect(cg).connect(this.gain);
    click.start(t);
    click.stop(t + 0.02);
  }

  _hat(t, open) {
    const ctx = this.ctx;
    const dur = open ? 0.18 : 0.04;
    const buf = this._noise(0.25);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = false;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = open ? 7000 : 9000;
    filter.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(open ? 0.2 : 0.16, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(this.gain);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  _clap(t) {
    const ctx = this.ctx;
    // Drei kurze versetzte Bursts -> typisches Clap-Feeling
    const offsets = [0, 0.012, 0.022];
    for (const off of offsets) {
      const at = t + off;
      const src = ctx.createBufferSource();
      src.buffer = this._noise(0.05);
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1500;
      filter.Q.value = 1.5;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.18, at + 0.001);
      g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
      src.connect(filter).connect(g).connect(this.gain);
      src.start(at);
      src.stop(at + 0.06);
    }
    // Body (laenger nachklingend)
    const body = ctx.createBufferSource();
    body.buffer = this._noise(0.2);
    const bf = ctx.createBiquadFilter();
    bf.type = 'bandpass';
    bf.frequency.value = 1200;
    bf.Q.value = 0.6;
    const bg = ctx.createGain();
    const bt = t + 0.025;
    bg.gain.setValueAtTime(0.0001, bt);
    bg.gain.exponentialRampToValueAtTime(0.08, bt + 0.005);
    bg.gain.exponentialRampToValueAtTime(0.001, bt + 0.16);
    body.connect(bf).connect(bg).connect(this.gain);
    body.start(bt);
    body.stop(bt + 0.2);
  }

  _bass(noteName, t, dur) {
    const ctx = this.ctx;
    const f = NOTE[noteName];
    if (!f) return;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = f;
    // Filter-Sweep simuliert Acid-Bass-Feeling
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 8;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.04);
    filter.frequency.exponentialRampToValueAtTime(150, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.42, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(filter).connect(g).connect(this.gain);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  _chord(name, t, dur) {
    const ctx = this.ctx;
    const notes = CHORDS[name];
    if (!notes) return;
    for (const note of notes) {
      const f = NOTE[note];
      if (!f) continue;
      // Detune zwei Oszillatoren minimal -> warmer Stack
      for (const detune of [-7, +7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 2200;
        filter.Q.value = 4;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.04, t + 0.05);
        g.gain.exponentialRampToValueAtTime(0.001, t + dur);
        o.connect(filter).connect(g).connect(this.gain);
        o.start(t);
        o.stop(t + dur + 0.05);
      }
    }
  }

  _noise(seconds) {
    const key = String(seconds);
    if (this._noiseCache.has(key)) return this._noiseCache.get(key);
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * seconds));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseCache.set(key, buf);
    return buf;
  }
}

export function trackList() {
  return TRACKS.map((t) => t.name);
}
