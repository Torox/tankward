import { Renderer } from '../rendering/renderer.js';
import { Terrain } from '../entities/terrain.js';
import { Tank, TANK_COLORS, pickSpawnPositions } from '../entities/tank.js';
import { Projectile } from '../entities/projectile.js';
import { FireBlob } from '../entities/fire-blob.js';
import { WEAPONS, WEAPON_ORDER, canFire, consume as consumeWeapon } from '../entities/weapons.js';
import { generateWind, muzzleVelocity, setPhysicsScale } from '../physics/ballistics.js';
import { checkProjectileImpact, applyBlast, settleTanks } from '../physics/collision.js';
import { AiController, DIFFICULTY } from '../ai/ai.js';
import { SoundManager } from '../audio/sound.js';
import { ParticleSystem } from '../rendering/particles.js';
import { loadSettings, saveSettings } from './settings.js';
import { CONFIG } from './config.js';
import { startLoop } from './loop.js';
import { createRng } from './rng.js';
import { Input } from './input.js';

/**
 * Game-State-Machine.
 * MENU -> ROUND_START -> PLAYER_TURN -> PROJECTILE_FLYING -> IMPACT
 *      -> (alive>1) PLAYER_TURN | (alive<=1) ROUND_END -> SHOP -> ROUND_START | GAME_OVER -> MENU
 *
 * Inventory + Credits persistieren ueber Runden (innerhalb eines Matches);
 * HP/Position werden je Runde resettet.
 */
export const S = Object.freeze({
  MENU: 'MENU',
  ROUND_START: 'ROUND_START',
  PLAYER_TURN: 'PLAYER_TURN',
  PROJECTILE_FLYING: 'PROJECTILE_FLYING',
  IMPACT: 'IMPACT',
  ROUND_END: 'ROUND_END',
  SHOP: 'SHOP',
  GAME_OVER: 'GAME_OVER'
});

const DEFAULT_CONFIG = {
  numPlayers: 4,
  numHumans: 1,                    // erster Slot ist Mensch, Rest KI
  aiDifficulty: DIFFICULTY.pro,    // 'beginner' | 'pro' | 'expert'
  bestOf: 3,
  worldSize: 'mittel'              // klein | mittel | gross | riesig
};
const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];
// Credit-Skalierung (Stand v1.1): so dass ein durchschnittlicher Sieg in einer
// Runde fuer eine guenstige Waffe reicht, und ueber 2-3 Runden auch fuer eine
// teure (z.B. Atombombe 5000¢).
const KILL_BONUS = 400;
const ROUND_SURVIVOR_BONUS = 600;
const HIT_CREDITS_PER_HP = 3;

export class Game {
  constructor() {
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();

    /** @type {Record<string, HTMLElement|null>} */
    this.el = {
      menu: document.getElementById('screen-menu'),
      hud: document.getElementById('screen-hud'),
      banner: document.getElementById('screen-banner'),
      shop: document.getElementById('screen-shop'),
      gameover: document.getElementById('screen-gameover'),
      hudActive: document.getElementById('hud-active'),
      hudAngle: document.getElementById('hud-angle'),
      hudPower: document.getElementById('hud-power'),
      hudWeapon: document.getElementById('hud-weapon'),
      hudPlayers: document.getElementById('hud-players'),
      hudStatus: document.getElementById('hud-status'),
      // Mobile-HUD-Mirror
      hudActiveMobile: document.getElementById('hud-active-mobile'),
      hudAngleMobile: document.getElementById('hud-angle-mobile'),
      hudPowerMobile: document.getElementById('hud-power-mobile'),
      hudWeaponMobile: document.getElementById('hud-weapon-mobile'),
      hudPlayersMobile: document.getElementById('hud-players-mobile'),
      btnBannerContinue: document.getElementById('btn-banner-continue'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      gameoverContent: document.getElementById('gameover-content'),
      shopGrid: document.getElementById('shop-grid'),
      shopHeader: document.getElementById('shop-header'),
      shopPlayerTabs: document.getElementById('shop-player-tabs'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      btnShopContinue: document.getElementById('btn-shop-continue'),
      btnBackMenu: document.getElementById('btn-back-menu'),
      // Setup-Form
      setupNumPlayers: document.getElementById('setup-num-players'),
      setupNumHumans: document.getElementById('setup-num-humans'),
      setupDifficulty: document.getElementById('setup-difficulty'),
      setupBestOf: document.getElementById('setup-best-of'),
      setupWorldSize: document.getElementById('setup-world-size'),
      // Zoom-Slider (in-game)
      zoomSlider: document.getElementById('zoom-slider'),
      zoomLabel: document.getElementById('zoom-label'),
      // Pause
      pause: document.getElementById('screen-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnPauseMenu: document.getElementById('btn-pause-menu'),
      // Sound-Toggles
      btnSound: document.getElementById('btn-sound'),
      btnMusic: document.getElementById('btn-music')
    };

    // Settings + Sound
    this.settings = loadSettings();
    this.sound = new SoundManager();
    this.sound.muted = !this.settings.sound;
    this.sound.musicTrackIdx = this.settings.musicTrack ?? 0;

    // Pre-Pause-State, damit Resume in den richtigen Zustand zurueckkehrt.
    this._pausedFrom = null;

    this.config = {
      ...DEFAULT_CONFIG,
      numPlayers: this.settings.numPlayers,
      numHumans: this.settings.numHumans,
      aiDifficulty: this.settings.aiDifficulty,
      bestOf: this.settings.bestOf,
      worldSize: this.settings.worldSize ?? DEFAULT_CONFIG.worldSize
    };
    this.state = null;
    this.stateTime = 0;
    /** Set, wenn der eigentliche Match-Zustand pausiert ist. */
    this.paused = false;

    /** @type {Tank[]} */
    this.tanks = [];
    /** @type {Terrain|null} */
    this.terrain = null;
    /** @type {Projectile|null} Haupt-Projektil */
    this.projectile = null;
    /** @type {Projectile[]} Submunition (Streubombe/MIRV-Kinder) */
    this.subProjectiles = [];
    /** @type {FireBlob[]} aktive Brandeffekte (Napalm) */
    this.effects = [];
    this.particles = new ParticleSystem();

    this.wind = 0;
    this.skyIndex = 0;
    this.activeIndex = 0;
    /** @type {number[]} runden-gewonnen pro tank-index */
    this.scores = [];
    this.roundIndex = 0;
    this.maxRounds = this.config.bestOf;

    /** Welcher Tank-Index ist im Shop gerade aktiv (zum Kaufen). */
    this.shopActiveIdx = 0;

    this._wireDom();
    this.setState(S.MENU);

    this._frames = 0;
    this._fpsT = performance.now();
  }

  _wireDom() {
    this.el.btnStart?.addEventListener('click', () => {
      this.sound.init();
      this.sound.resume();
      this._readSetupForm();
      if (this.settings.music) this.sound.setMusic(true);
      this.sound.playClick();
      this._startNewGame();
    });
    this.el.btnPause?.addEventListener('click', () => this._openPause());
    this.el.btnShopContinue?.addEventListener('click', () => {
      this.sound.playClick();
      this.roundIndex++;
      if (this._isMatchOver()) this.setState(S.GAME_OVER);
      else this.setState(S.ROUND_START);
    });
    this.el.btnBackMenu?.addEventListener('click', () => {
      this.sound.playClick();
      this.setState(S.MENU);
    });
    this.el.btnResume?.addEventListener('click', () => this._closePause());
    this.el.btnPauseMenu?.addEventListener('click', () => {
      this.sound.playClick();
      this._closePause();
      this.setState(S.MENU);
    });
    this.el.btnSound?.addEventListener('click', () => this._toggleSound());
    this.el.btnMusic?.addEventListener('click', () => this._toggleMusic());

    // Banner-Continue: einziger Weg, ROUND_END/GAME_OVER auf Mobile zu verlassen.
    this.el.btnBannerContinue?.addEventListener('click', () => this._advanceFromBanner());

    // Setup-Form initial mit Settings vorbelegen.
    // Reihenfolge: erst numPlayers, dann Options-Liste fuer numHumans aufbauen,
    // dann numHumans-Wert setzen — sonst wird value="" gesetzt, weil Options
    // noch leer sind.
    if (this.el.setupNumPlayers) this.el.setupNumPlayers.value = String(this.config.numPlayers);
    if (this.el.setupDifficulty) this.el.setupDifficulty.value = this.config.aiDifficulty;
    if (this.el.setupBestOf) this.el.setupBestOf.value = String(this.config.bestOf);
    if (this.el.setupWorldSize) this.el.setupWorldSize.value = this.config.worldSize;
    this._refreshNumHumansOptions();
    if (this.el.setupNumHumans) {
      const n = clamp(this.config.numHumans, 0, this.config.numPlayers);
      this.el.setupNumHumans.value = String(n);
    }
    this.el.setupNumPlayers?.addEventListener('change', () => this._refreshNumHumansOptions());

    // Zoom-Slider verkabeln (in-game).
    this.el.zoomSlider?.addEventListener('input', (e) => {
      const z = parseFloat(/** @type {HTMLInputElement} */ (e.target).value);
      this.renderer.setZoom(z);
      if (this.el.zoomLabel) this.el.zoomLabel.textContent = `${z.toFixed(1)}×`;
    });

    this._updateSoundButtons();

    // Globale Tastenkuerzel: ESC = Pause toggle.
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (this.state === S.PLAYER_TURN || this.state === S.PROJECTILE_FLYING) {
        this._openPause();
      } else if (this.paused) {
        this._closePause();
      }
    });
  }

  _readSetupForm() {
    const np = parseInt(this.el.setupNumPlayers?.value ?? '4', 10);
    const nh = parseInt(this.el.setupNumHumans?.value ?? '1', 10);
    const diff = this.el.setupDifficulty?.value ?? DIFFICULTY.pro;
    const bo = parseInt(this.el.setupBestOf?.value ?? '3', 10);
    const ws = this.el.setupWorldSize?.value ?? 'mittel';
    this.config.numPlayers = clamp(np, 2, 10);
    this.config.numHumans = clamp(nh, 0, this.config.numPlayers);
    this.config.aiDifficulty = diff;
    this.config.bestOf = clamp(bo, 1, 9);
    this.config.worldSize = CONFIG.world.presets[ws] ? ws : 'mittel';
    this.settings = saveSettings({
      numPlayers: this.config.numPlayers,
      numHumans: this.config.numHumans,
      aiDifficulty: this.config.aiDifficulty,
      bestOf: this.config.bestOf,
      worldSize: this.config.worldSize
    });
  }

  _refreshNumHumansOptions() {
    if (!this.el.setupNumHumans || !this.el.setupNumPlayers) return;
    const np = parseInt(this.el.setupNumPlayers.value, 10);
    const prevRaw = parseInt(this.el.setupNumHumans.value, 10);
    // Wenn vorher kein gueltiger Wert existierte, Default aus Settings/Config nehmen.
    const fallback = clamp(this.config.numHumans ?? 1, 0, np);
    const current = Number.isFinite(prevRaw) ? Math.min(prevRaw, np) : fallback;
    const opts = [];
    for (let i = 0; i <= np; i++) opts.push(`<option value="${i}">${i}</option>`);
    this.el.setupNumHumans.innerHTML = opts.join('');
    this.el.setupNumHumans.value = String(current);
  }

  _openPause() {
    if (this.paused) return;
    this.paused = true;
    this._pausedFrom = this.state;
    if (this.el.pause) this.el.pause.classList.remove('hidden');
  }

  _closePause() {
    if (!this.paused) return;
    this.paused = false;
    if (this.el.pause) this.el.pause.classList.add('hidden');
  }

  _toggleSound() {
    this.settings = saveSettings({ sound: !this.settings.sound });
    this.sound.setMuted(!this.settings.sound);
    if (!this.settings.sound) this.sound.setMusic(false);
    else if (this.settings.music) this.sound.setMusic(true);
    this._updateSoundButtons();
  }

  /**
   * Cycle: OFF -> Track 0 -> Track 1 -> ... -> letzter Track -> OFF.
   * Browser-Autoplay-Policy: musik startet nur, wenn dieser Click ein
   * User-Gesture-Trigger ist (sound.init wurde im Start-Click gerufen).
   */
  _toggleMusic() {
    this.sound.init();
    this.sound.resume();
    const tracks = this.sound.trackList?.() ?? [];

    if (!this.settings.music) {
      // Aus -> Erster Track
      this.settings = saveSettings({ music: true, musicTrack: 0 });
      this.sound.musicTrackIdx = 0;
      this.sound.music?.setTrack(0);
      if (this.settings.sound) this.sound.setMusic(true);
    } else {
      // An -> naechster Track ODER aus
      const next = (this.settings.musicTrack ?? 0) + 1;
      if (next >= tracks.length) {
        this.settings = saveSettings({ music: false });
        this.sound.setMusic(false);
      } else {
        this.settings = saveSettings({ musicTrack: next });
        this.sound.musicTrackIdx = next;
        this.sound.music?.setTrack(next);
        if (this.settings.sound) {
          this.sound.setMusic(false);
          this.sound.setMusic(true); // restart mit neuem Track
        }
      }
    }
    this._updateSoundButtons();
  }

  _updateSoundButtons() {
    if (this.el.btnSound) {
      this.el.btnSound.textContent = `Sound ${this.settings.sound ? '◉' : '○'}`;
    }
    if (this.el.btnMusic) {
      if (this.settings.music) {
        const name = this.sound.currentTrackName?.() || `Track ${this.settings.musicTrack + 1}`;
        this.el.btnMusic.textContent = `♪ ${name}`;
      } else {
        this.el.btnMusic.textContent = 'Musik ○';
      }
    }
  }

  start() {
    startLoop((dt, now) => {
      this.update(dt, now);
      // Partikel laufen unabhaengig vom Game-State (auch waehrend Banner/Pause-Resume).
      if (!this.paused) this.particles.update(dt);
      this.render(dt, now);
      this._frames++;
      if (now - this._fpsT >= 500) {
        const fps = Math.round((this._frames * 1000) / (now - this._fpsT));
        if (this.el.hudStatus) this.el.hudStatus.textContent = `${fps} fps · Wind ${this.wind}`;
        this._frames = 0;
        this._fpsT = now;
      }
      this.input.endFrame();
    });
  }

  _startNewGame() {
    this.scores = new Array(this.config.numPlayers).fill(0);
    this.roundIndex = 0;
    this.maxRounds = this.config.bestOf;
    this._hintShown = false; // Touch-Hint einmal pro Match.

    // Persistente Tanks: bleiben ueber Runden hinweg (Inventory + Credits).
    this.tanks = [];
    for (let i = 0; i < this.config.numPlayers; i++) {
      const isHuman = i < this.config.numHumans;
      const baseName = PLAYER_NAMES[i];
      const t = new Tank({
        id: baseName,
        name: isHuman ? baseName : `${baseName} (KI)`,
        color: TANK_COLORS[i % TANK_COLORS.length],
        x: 0,
        isHuman
      });
      t.selectedWeapon = 'standard';
      if (!isHuman) {
        t.ai = new AiController(t, this.config.aiDifficulty);
      }
      this.tanks.push(t);
    }

    this.setState(S.ROUND_START);
  }

  setState(next) {
    if (this.state === next) return;
    this._onExit(this.state);
    this.state = next;
    this.stateTime = 0;
    this._onEnter(next);
  }

  _onEnter(state) {
    switch (state) {
      case S.MENU:
        this._showOnly('menu');
        break;
      case S.ROUND_START:
        this._showOnly('hud');
        this._beginRound();
        this._showBanner(`Runde ${this.roundIndex + 1} / ${this.maxRounds}`, this._scoresLine());
        this._setBannerButton(false);
        break;
      case S.PLAYER_TURN: {
        this._hideBanner();
        this._showOnly('hud');
        const t = this.tanks[this.activeIndex];
        if (t && !t.isHuman && t.ai) t.ai.beginTurn(this);
        break;
      }
      case S.ROUND_END: {
        const alive = this._aliveTanks();
        if (alive.length === 1) {
          const winner = alive[0];
          const idx = this.tanks.indexOf(winner);
          if (idx >= 0) this.scores[idx] = (this.scores[idx] ?? 0) + 1;
          winner.credits += ROUND_SURVIVOR_BONUS;
          this._showBanner(`${winner.name} gewinnt die Runde!`, `+${ROUND_SURVIVOR_BONUS} Credits · ${this._scoresLine()}`, winner.color);
          this.sound.playRoundEnd();
        } else {
          this._showBanner('Patt — alle ausgeschaltet', this._scoresLine(), '#94a3b8');
        }
        // Tappbarer Continue-Button (ESC/Space funktioniert weiter, aber Mobile braucht das hier).
        this._setBannerButton(true, this._isMatchOver() ? 'Spielende' : 'Weiter');
        break;
      }
      case S.SHOP:
        this.shopActiveIdx = 0;
        this._populateShop();
        this._showOnly('shop');
        break;
      case S.GAME_OVER: {
        this._showOnly('gameover');
        const lines = this.tanks.map((t, i) => `${t.name}: ${this.scores[i] ?? 0}`).join(' · ');
        const champ = this._champion();
        if (this.el.gameoverContent) {
          this.el.gameoverContent.innerHTML =
            `<div class="text-tw-accent text-sm mb-2">Sieger: ${champ ? champ.name : '–'}</div>` +
            `<div>${lines}</div>`;
        }
        break;
      }
    }
  }

  _onExit(state) {
    if (state === S.ROUND_END) this._hideBanner();
  }

  update(dt) {
    if (this.paused) return;
    this.stateTime += dt;

    // Effekte (Napalm) laufen waehrend PROJECTILE_FLYING und IMPACT.
    if (this.state === S.PROJECTILE_FLYING || this.state === S.IMPACT) {
      this._updateEffects(dt);
    }

    switch (this.state) {
      case S.MENU:
        if (this.input.consume('Enter') || this.input.consume('Space')) this._startNewGame();
        break;
      case S.ROUND_START:
        if (this.stateTime > 1.0 || this.input.consume('Space')) this.setState(S.PLAYER_TURN);
        break;
      case S.PLAYER_TURN:
        this._updatePlayerTurn(dt);
        break;
      case S.PROJECTILE_FLYING:
        this._updateProjectiles(dt);
        if (!this.projectile && this.subProjectiles.length === 0 && this.effects.length === 0) {
          this.setState(S.IMPACT);
        }
        break;
      case S.IMPACT:
        if (this.effects.length === 0 && this.stateTime > 0.45) {
          settleTanks(this.tanks, this.terrain);
          const alive = this._aliveTanks();
          if (alive.length <= 1) this.setState(S.ROUND_END);
          else {
            this._nextActiveTank();
            this.setState(S.PLAYER_TURN);
          }
        }
        break;
      case S.ROUND_END:
        if (this.stateTime > 0.6 && (this.input.consume('Space') || this.input.consume('Enter'))) {
          if (this._isMatchOver()) this.setState(S.GAME_OVER);
          else this.setState(S.SHOP);
        }
        break;
      case S.GAME_OVER:
        if (this.stateTime > 0.6 && (this.input.consume('Space') || this.input.consume('Enter'))) {
          this.setState(S.MENU);
        }
        break;
    }
  }

  _updatePlayerTurn(dt) {
    const active = this.tanks[this.activeIndex];
    if (!active || !active.alive) {
      this._nextActiveTank();
      return;
    }

    if (!active.isHuman && active.ai) {
      // KI denkt + zielt + feuert.
      active.ai.update(dt, () => this._fire());
      // Tasten waehrend KI-Zug ignorieren, aber pressed-Buffer leeren.
      this.input.consume('Space');
      this.input.consume('Tab');
      this.input.consume('KeyQ');
      this.input.consume('KeyE');
      return;
    }

    const fine = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const angleSpeed = (fine ? 15 : 60) * dt;
    const powerSpeed = (fine ? 12 : 40) * dt;
    if (this.input.isDown('ArrowLeft')) active.adjustAngle(angleSpeed);
    if (this.input.isDown('ArrowRight')) active.adjustAngle(-angleSpeed);
    if (this.input.isDown('ArrowUp')) active.adjustPower(powerSpeed);
    if (this.input.isDown('ArrowDown')) active.adjustPower(-powerSpeed);

    // Aim-Tick: persistente "letzter-Tick"-Werte am Tank, damit auch
    // Touch-Drag (der ausserhalb dieser Update-Funktion auf den Tank schreibt)
    // erkannt wird. Initialisiere beide Felder einmalig pro Tank-Aktivierung.
    const curA = Math.floor(active.turretAngle);
    const curP = Math.floor(active.power);
    if (active._lastTickAngle === undefined) {
      active._lastTickAngle = curA;
      active._lastTickPower = curP;
    } else {
      if (curA !== active._lastTickAngle) {
        this.sound.playAimTick('angle', curA > active._lastTickAngle ? +1 : -1);
        active._lastTickAngle = curA;
      }
      if (curP !== active._lastTickPower) {
        this.sound.playAimTick('power', curP > active._lastTickPower ? +1 : -1);
        active._lastTickPower = curP;
      }
    }

    if (this.input.consume('Space')) this._fire();
    if (this.input.consume('Tab')) this._cycleWeapon(active, +1);
    if (this.input.consume('KeyQ')) this._cycleWeapon(active, -1);
    if (this.input.consume('KeyE')) this._cycleWeapon(active, +1);
  }

  _cycleWeapon(tank, dir) {
    const available = WEAPON_ORDER.filter((id) => canFire(tank, id));
    if (available.length === 0) return;
    let i = available.indexOf(tank.selectedWeapon);
    if (i < 0) i = 0;
    i = (i + dir + available.length) % available.length;
    tank.selectedWeapon = available[i];
  }

  // -- Schiessen --------------------------------------------------------------

  _fire() {
    const t = this.tanks[this.activeIndex];
    if (!t || !t.alive) return;
    const wid = canFire(t, t.selectedWeapon) ? t.selectedWeapon : 'standard';
    const w = WEAPONS[wid];
    consumeWeapon(t, wid);

    const tip = t.turretTip();
    const { vx, vy } = muzzleVelocity(t.turretAngle, t.power);
    this.projectile = new Projectile({
      x: tip.x,
      y: tip.y,
      vx,
      vy,
      ownerId: t.id,
      weaponId: wid,
      color: w.color || '#fbbf24',
      radius: wid === 'nuke' ? 5 : wid === 'roller' || wid === 'driller' ? 4 : 3
    });
    this.sound.playShoot(wid);
    this.setState(S.PROJECTILE_FLYING);
  }

  // -- Projektil-Update -------------------------------------------------------

  _updateProjectiles(dt) {
    const bounds = { width: this.worldWidth, height: this.worldHeight };

    if (this.projectile) {
      this._stepProjectile(this.projectile, dt, bounds, /*isChild*/ false);
      if (!this.projectile.alive) this.projectile = null;
    }
    for (const p of this.subProjectiles) {
      if (!p.alive) continue;
      this._stepProjectile(p, dt, bounds, /*isChild*/ true);
    }
    this.subProjectiles = this.subProjectiles.filter((p) => p.alive);
  }

  _stepProjectile(p, dt, bounds, isChild) {
    if (p.mode === 'rolling') return this._stepRolling(p, dt, bounds);
    if (p.mode === 'drilling') return this._stepDrilling(p, dt, bounds);

    const prevX = p.x;
    const prevY = p.y;
    p.update(dt, this.wind, bounds);

    // Apex-Split (Streubombe/MIRV) — nur bei Hauptgeschoss, nicht bei Kindern.
    if (!isChild) {
      const w = WEAPONS[p.weaponId];
      if (w?.splitOnApex && !p.didSplit && p.vy >= 0 && p.age > 0.15) {
        p.didSplit = true;
        this._splitAtApex(p, w);
        p.alive = false;
        return;
      }
    }

    if (p.alive) {
      const impact = checkProjectileImpact(p, prevX, prevY, this.terrain, this.tanks);
      if (impact) this._handleImpact(p, impact);
    }
  }

  _splitAtApex(p, w) {
    const n = w.splitOnApex;
    const spread = w.splitSpread || 80;
    // Kinder erben die x-Geschwindigkeit, bekommen leicht versetzte x + verschiedene vx.
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1); // 0..1
      const dvx = (t - 0.5) * spread; // -spread/2 .. +spread/2
      const child = new Projectile({
        x: p.x + (t - 0.5) * 12,
        y: p.y - 4,
        vx: p.vx + dvx,
        vy: 30 + (i % 2) * 20, // leicht nach unten
        ownerId: p.ownerId,
        weaponId: 'standard', // Kinder = Standard-Sprengkopf
        color: w.color || '#fbbf24',
        radius: 3,
        isChild: true
      });
      this.subProjectiles.push(child);
    }
  }

  _handleImpact(p, impact) {
    const w = WEAPONS[p.weaponId] || WEAPONS.standard;

    // Mode-Wechsel statt Detonation?
    if (w.rollOnImpact && p.mode === 'flying') {
      p.mode = 'rolling';
      p.x = impact.x;
      p.y = Math.max(0, this.terrain.surfaceY(impact.x) - 2);
      p.rollTime = 0;
      return;
    }
    if (w.drillOnImpact && p.mode === 'flying') {
      p.mode = 'drilling';
      p.drillRemaining = w.drillOnImpact.distance;
      const speed = w.drillOnImpact.speed;
      const len = Math.hypot(p.vx, p.vy) || 1;
      p.vx = (p.vx / len) * speed;
      p.vy = (p.vy / len) * speed;
      p.x = impact.x;
      p.y = impact.y;
      return;
    }

    // Direktdetonation (Standard, Heavy, Cluster-Kind, MIRV-Kind, Nuke + Tank-Hits aller anderen).
    this._detonate(p, impact, w);
    p.alive = false;
  }

  _detonate(p, impact, w) {
    this.terrain.carve(impact.x, impact.y, w.blastRadius);
    const hits = applyBlast(impact, this.tanks, w.blastRadius, w.damage);
    this._awardCredits(p.ownerId, hits);

    // Lernen fuer "expert"-KI: dem Schuetzen den Treffer zurueckmelden.
    const shooter = this.tanks.find((t) => t.id === p.ownerId);
    if (shooter && shooter.ai) shooter.ai.recordImpact(impact.x, impact.y);

    this.sound.playExplosion(w.blastRadius);
    this.particles.explosion(impact.x, impact.y, w.blastRadius);

    // Screen-Shake skaliert mit Blast-Radius (Mindeststaerke fuer alle).
    const shakeMag = w.shake?.magnitude ?? Math.min(8, w.blastRadius * 0.12);
    const shakeDur = w.shake?.duration ?? 0.18;
    this.renderer.triggerShake(shakeMag, shakeDur);

    // Tote Tanks bekommen eine eigene Rauch-/Funkenwolke.
    for (const h of hits) {
      if (!h.tank.alive) {
        this.particles.tankDeath(h.tank.x, h.tank.y - 12);
      }
    }

    if (w.napalm) this._spawnNapalm(impact, w.napalm);
  }

  _stepRolling(p, dt, bounds) {
    // Rolle entlang Terrain-Oberflaeche; Hangneigung beschleunigt, Reibung bremst.
    const w = WEAPONS[p.weaponId];
    const cfg = w?.rollOnImpact;
    if (!cfg) {
      p.alive = false;
      return;
    }
    p.rollTime += dt;
    if (p.rollTime > cfg.maxRollTime) {
      this._detonate(p, { x: p.x, y: p.y }, w);
      p.alive = false;
      return;
    }

    // Neigung am aktuellen Standort.
    const x0 = Math.max(2, Math.floor(p.x - 2));
    const x1 = Math.min(this.terrain.width - 3, Math.floor(p.x + 2));
    const slope = (this.terrain.heights[x1] - this.terrain.heights[x0]) / Math.max(1, x1 - x0);
    // a_x = g * sin(atan(slope)) ≈ g * slope/sqrt(1+slope^2)
    const ax = 600 * cfg.gravityFactor * (slope / Math.sqrt(1 + slope * slope));
    p.vx += ax * dt;
    // Reibung
    const dragSign = Math.sign(p.vx);
    p.vx -= dragSign * cfg.friction * dt;
    if (Math.abs(p.vx) < 5 && Math.abs(slope) < 0.05) {
      // ausgerollt
      this._detonate(p, { x: p.x, y: p.y }, w);
      p.alive = false;
      return;
    }
    p.x += p.vx * dt;
    p.y = this.terrain.surfaceY(p.x) - 2;
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 24) p.trail.shift();

    // Tank-Treffer waehrend des Rollens?
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      if (Math.abs(tank.x - p.x) < 18 && Math.abs(tank.y - p.y) < 24) {
        this._detonate(p, { x: p.x, y: p.y }, w);
        p.alive = false;
        return;
      }
    }
    if (p.x < 0 || p.x > bounds.width) {
      p.alive = false;
    }
  }

  _stepDrilling(p, dt, bounds) {
    const w = WEAPONS[p.weaponId];
    const cfg = w?.drillOnImpact;
    if (!cfg) {
      p.alive = false;
      return;
    }
    const dx = p.vx * dt;
    const dy = p.vy * dt;
    p.x += dx;
    p.y += dy;
    const dist = Math.hypot(dx, dy);
    p.drillRemaining -= dist;

    // Beim Durchbohren entstehen kleine Krater laengs des Tunnels.
    this.terrain.carve(p.x, p.y, 8);
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 24) p.trail.shift();

    // Tank-Treffer beim Durchbohren?
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      if (Math.abs(tank.x - p.x) < 18 && Math.abs(tank.y - p.y) < 24) {
        this._detonate(p, { x: p.x, y: p.y }, w);
        p.alive = false;
        return;
      }
    }

    if (p.drillRemaining <= 0 || p.x < 0 || p.x > bounds.width || p.y > bounds.height) {
      this._detonate(p, { x: p.x, y: p.y }, w);
      p.alive = false;
    }
  }

  _spawnNapalm(impact, cfg) {
    for (let i = 0; i < cfg.blobCount; i++) {
      const t = i / (cfg.blobCount - 1 || 1);
      const x = impact.x + (t - 0.5) * cfg.blobSpreadX;
      const y = this.terrain.surfaceY(x) - 4;
      this.effects.push(
        new FireBlob({
          x,
          y,
          radius: cfg.radius,
          tickDamage: cfg.tickDamage,
          ticksRemaining: cfg.ticks,
          tickInterval: cfg.tickInterval
        })
      );
    }
  }

  _updateEffects(dt) {
    for (const e of this.effects) {
      const hits = e.update(dt, this.tanks);
      if (hits.length) {
        // Napalm-Schaden ist anonym — niemand bekommt Credits dafuer (Designentscheidung).
      }
    }
    this.effects = this.effects.filter((e) => e.alive);
  }

  // -- Credits ---------------------------------------------------------------

  _awardCredits(shooterId, hits) {
    const shooter = this.tanks.find((t) => t.id === shooterId);
    if (!shooter) return;
    for (const h of hits) {
      if (h.tank === shooter) continue; // kein Self-Credit
      shooter.credits += h.dmg * HIT_CREDITS_PER_HP;
      if (!h.tank.alive) shooter.credits += KILL_BONUS;
    }
  }

  // -- Runde / Match ---------------------------------------------------------

  _beginRound() {
    const seed = ((this.roundIndex + 1) * 1000003) ^ ((Math.random() * 1e9) >>> 0);
    const rng = createRng(seed >>> 0);

    // Welt-Dimensionen aus Preset bestimmen. Welt-Aspect haelt sich an Viewport,
    // damit "Fit-to-Viewport" weder horizontal noch vertikal Letterbox erzeugt.
    const preset = CONFIG.world.presets[this.config.worldSize] ?? CONFIG.world.presets.mittel;
    this.worldWidth = preset.width;
    const aspect = this.renderer.viewportH / Math.max(1, this.renderer.viewportW);
    this.worldHeight = Math.max(540, Math.round(this.worldWidth * aspect));
    this.renderer.setWorld(this.worldWidth, this.worldHeight);
    this.renderer.resetCamera();
    // Physik-Skalierung damit groessere Welten weiterhin reichbar sind.
    setPhysicsScale(this.worldWidth);
    if (this.el.zoomSlider) {
      this.el.zoomSlider.value = '1';
      if (this.el.zoomLabel) this.el.zoomLabel.textContent = '1.0×';
    }

    this.terrain = new Terrain(this.worldWidth, this.worldHeight, rng);
    this.wind = generateWind(rng);
    this.skyIndex = (this.roundIndex + Math.floor(rng() * 3)) % 3;

    // Persistente Tanks: Position + HP fuer neue Runde resetten, Inventory + Credits behalten.
    const xs = pickSpawnPositions(this.tanks.length, this.worldWidth, rng);
    this.tanks.forEach((t, i) => {
      t.x = xs[i];
      t.y = 0;
      t.hp = t.maxHp;
      t.alive = true;
      t.turretAngle = 90;
      t.power = 50;
      t._lastTickAngle = undefined;
      t._lastTickPower = undefined;
      // Falls die ausgewaehlte Waffe nicht mehr verfuegbar -> auf Standard zurueck.
      if (!canFire(t, t.selectedWeapon)) t.selectedWeapon = 'standard';
      t.snapToTerrain(this.terrain);
    });

    this.activeIndex = 0;
    this.projectile = null;
    this.subProjectiles = [];
    this.effects = [];
    this._renderPlayersHud();
  }

  _nextActiveTank() {
    if (this.tanks.length === 0) return;
    for (let i = 0; i < this.tanks.length; i++) {
      this.activeIndex = (this.activeIndex + 1) % this.tanks.length;
      if (this.tanks[this.activeIndex].alive) return;
    }
  }

  _aliveTanks() {
    return this.tanks.filter((t) => t.alive);
  }

  _isMatchOver() {
    if (this.roundIndex >= this.maxRounds) return true;
    const top = Math.max(...this.scores, 0);
    const remaining = this.maxRounds - this.roundIndex;
    const threshold = Math.floor(this.maxRounds / 2) + 1;
    if (top >= threshold) return true;
    const others = this.scores.filter((_, i) => this.scores[i] !== top);
    if (others.length > 0 && top - Math.max(...others, 0) > remaining) return true;
    return false;
  }

  _champion() {
    let best = -1;
    let bestIdx = -1;
    for (let i = 0; i < this.scores.length; i++) {
      if ((this.scores[i] ?? 0) > best) {
        best = this.scores[i] ?? 0;
        bestIdx = i;
      }
    }
    return bestIdx >= 0 ? this.tanks[bestIdx] : null;
  }

  _scoresLine() {
    return this.tanks.map((t, i) => `${t.name}:${this.scores[i] ?? 0}`).join(' · ');
  }

  // -- HUD -------------------------------------------------------------------

  _renderPlayersHud() {
    if (this.el.hudPlayers) {
      this.el.hudPlayers.innerHTML = this.tanks
        .map((t, i) => {
          const ratio = Math.max(0, t.hp / t.maxHp);
          const wins = this.scores[i] ?? 0;
          const dim = t.alive ? '' : 'opacity-40';
          // Kurzname (P1, P2, ...) ohne "(KI)"-Suffix — bleibt einzeilig.
          const shortLabel = t.id;
          const aiBadge = t.isHuman ? '' : '<span class="text-white/40 text-[8px] ml-0.5">KI</span>';
          return `
            <div class="flex items-center gap-2 whitespace-nowrap ${dim}">
              <span class="inline-block w-2 h-2 rounded-sm flex-shrink-0" style="background:${t.color}"></span>
              <span class="text-white text-[10px] flex-shrink-0">${shortLabel}</span>
              ${aiBadge}
              <span class="relative inline-block w-20 h-2 bg-black/50 rounded-sm overflow-hidden flex-shrink-0">
                <span class="absolute inset-y-0 left-0" style="width:${ratio * 100}%; background:${this._hpColor(ratio)}"></span>
              </span>
              <span class="text-tw-accent text-[10px] flex-shrink-0">x${wins}</span>
              <span class="text-emerald-300 text-[10px] flex-shrink-0">${t.credits}¢</span>
            </div>`;
        })
        .join('');
    }
    if (this.el.hudPlayersMobile) {
      this.el.hudPlayersMobile.innerHTML = this.tanks
        .map((t, i) => {
          const ratio = Math.max(0, t.hp / t.maxHp);
          const wins = this.scores[i] ?? 0;
          return `
            <span class="player-pill ${t.alive ? '' : 'dead'}" data-pid="${i}">
              <span class="swatch" style="background:${t.color}"></span>
              <span class="hpbar"><span style="width:${ratio * 100}%; background:${this._hpColor(ratio)}"></span></span>
              <span class="text-tw-accent text-[8px]">x${wins}</span>
            </span>`;
        })
        .join('');
    }
  }

  _hpColor(r) {
    if (r > 0.6) return '#22c55e';
    if (r > 0.3) return '#eab308';
    return '#ef4444';
  }

  _showBanner(title, sub = '', color = '#fbbf24') {
    if (!this.el.banner) return;
    this.el.banner.classList.remove('hidden');
    if (this.el.bannerTitle) {
      this.el.bannerTitle.textContent = title;
      this.el.bannerTitle.style.color = color;
    }
    if (this.el.bannerSub) this.el.bannerSub.textContent = sub;
  }

  _hideBanner() {
    if (this.el.banner) this.el.banner.classList.add('hidden');
    this._setBannerButton(false);
  }

  _setBannerButton(visible, label = 'Weiter') {
    if (!this.el.btnBannerContinue) return;
    if (visible) {
      this.el.btnBannerContinue.textContent = label;
      this.el.btnBannerContinue.classList.remove('hidden');
    } else {
      this.el.btnBannerContinue.classList.add('hidden');
    }
  }

  _advanceFromBanner() {
    this.sound.playClick();
    if (this.state === S.ROUND_END) {
      if (this._isMatchOver()) this.setState(S.GAME_OVER);
      else this.setState(S.SHOP);
    } else if (this.state === S.GAME_OVER) {
      this.setState(S.MENU);
    }
  }

  _showOnly(name) {
    for (const k of ['menu', 'hud', 'shop', 'gameover']) {
      if (!this.el[k]) continue;
      if (k === name) this.el[k].classList.remove('hidden');
      else this.el[k].classList.add('hidden');
    }
    // Touch-Controls nur sichtbar, wenn HUD aktiv ist (= waehrend Spiel).
    document.body.classList.toggle('in-game', name === 'hud');
    // Touch-Hint nur EINMAL pro Match-Session zeigen — nicht bei jedem Turn-Wechsel.
    const hint = document.getElementById('touch-hint');
    if (hint) {
      if (name === 'hud' && !this._hintShown) {
        this._hintShown = true;
        hint.classList.remove('fade-out');
        clearTimeout(this._hintTimer);
        this._hintTimer = setTimeout(() => hint.classList.add('fade-out'), 4000);
      } else if (name !== 'hud') {
        hint.classList.add('fade-out');
      }
    }
  }

  // -- Shop -------------------------------------------------------------------

  _populateShop() {
    if (!this.el.shopGrid) return;

    // Spieler-Tabs (welcher Tank kauft gerade)
    if (this.el.shopPlayerTabs) {
      this.el.shopPlayerTabs.innerHTML = this.tanks
        .map(
          (t, i) => `
          <button data-shop-tab="${i}"
            class="shop-tab font-pixel text-[10px] px-3 py-2 rounded border transition
              ${i === this.shopActiveIdx ? 'bg-tw-accent text-tw-bg border-tw-accent' : 'bg-tw-panel/60 text-white/80 border-white/10 hover:border-white/30'}"
            style="${i === this.shopActiveIdx ? '' : `border-left:3px solid ${t.color}`}">
            ${t.name} · ${t.credits}¢
          </button>`
        )
        .join('');
      this.el.shopPlayerTabs.querySelectorAll('button[data-shop-tab]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(/** @type {HTMLElement} */ (e.currentTarget).dataset.shopTab || '0', 10);
          this.shopActiveIdx = idx;
          this._populateShop();
        });
      });
    }

    const tank = this.tanks[this.shopActiveIdx];
    if (this.el.shopHeader) {
      this.el.shopHeader.textContent = `${tank.name} · ${tank.credits} Credits`;
      this.el.shopHeader.style.color = tank.color;
    }

    this.el.shopGrid.innerHTML = WEAPON_ORDER.map((id) => {
      const w = WEAPONS[id];
      const owned = w.unlimited ? '∞' : (tank.inventory.get(id) ?? 0);
      const affordable = w.unlimited || tank.credits >= w.price;
      const buyBtn = w.unlimited
        ? `<span class="font-pixel text-[10px] text-emerald-400">unbegrenzt</span>`
        : `<button data-buy="${id}"
            class="font-pixel text-[10px] px-3 py-1 rounded transition
              ${affordable ? 'bg-tw-accent text-tw-bg hover:bg-yellow-300' : 'bg-white/5 text-white/30 cursor-not-allowed'}"
            ${affordable ? '' : 'disabled'}>Kaufen ${w.price}¢</button>`;
      return `
        <div class="bg-tw-bg/60 border border-white/10 rounded p-3 flex flex-col gap-2"
             style="border-left: 3px solid ${w.color}">
          <div class="flex items-center justify-between">
            <div class="font-pixel text-xs text-white">${w.icon} ${w.name}</div>
            <div class="font-pixel text-[10px] text-tw-accent">×${owned}</div>
          </div>
          <div class="font-pixel text-[9px] text-white/60 leading-relaxed">${w.desc}</div>
          <div class="font-pixel text-[9px] text-white/40">
            Schaden ${w.damage} · Radius ${w.blastRadius}
          </div>
          <div class="mt-auto flex justify-end">${buyBtn}</div>
        </div>`;
    }).join('');

    this.el.shopGrid.querySelectorAll('button[data-buy]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = /** @type {HTMLElement} */ (e.currentTarget).dataset.buy;
        if (!id) return;
        this._buyWeapon(this.shopActiveIdx, id);
      });
    });
  }

  _buyWeapon(tankIdx, weaponId) {
    const tank = this.tanks[tankIdx];
    const w = WEAPONS[weaponId];
    if (!tank || !w || w.unlimited) return;
    if (tank.credits < w.price) return;
    tank.credits -= w.price;
    tank.inventory.set(weaponId, (tank.inventory.get(weaponId) ?? 0) + 1);
    this._populateShop();
  }

  // -- Render ----------------------------------------------------------------

  render(dt, now) {
    this.renderer.beginFrame(dt || 0);
    // Sky in SCREEN-Space (faerbt auch Letterbox bei Fit-to-Viewport).
    this.renderer.drawSky(this.skyIndex);

    if (this.state !== S.MENU) {
      // Welt-Space ab hier: Terrain, Tanks, Projektile, Partikel.
      this.renderer.applyCamera();
      if (this.terrain) this.renderer.drawTerrain(this.terrain);
      for (let i = 0; i < this.tanks.length; i++) {
        const showActive = i === this.activeIndex && this.state === S.PLAYER_TURN;
        this.renderer.drawTank(this.tanks[i], showActive, now);
      }
      if (this.projectile) this.renderer.drawProjectile(this.projectile);
      for (const sp of this.subProjectiles) this.renderer.drawProjectile(sp);
      for (const e of this.effects) this.renderer.drawFireBlob(e, now);
      this.particles.draw(this.renderer.ctx);
      // Wind-Indikator wechselt selbst zurueck in Screen-Space.
      this.renderer.drawWindIndicator(this.wind);
    }

    // HUD-DOM-Updates auf 10 Hz drosseln (fuers Auge identisch, spart Layout-Cost).
    if (now - (this._hudT || 0) < 100) return;
    this._hudT = now;

    if (this.state === S.PLAYER_TURN || this.state === S.PROJECTILE_FLYING) {
      const active = this.tanks[this.activeIndex];
      if (active) {
        const flying = this.state === S.PROJECTILE_FLYING;
        const angleStr = `${Math.round(active.turretAngle)}°`;
        const powerStr = `${Math.round(active.power)}`;
        const w = WEAPONS[active.selectedWeapon] || WEAPONS.standard;
        const stock = w.unlimited ? '∞' : active.inventory.get(w.id) ?? 0;
        const wTextLong = `${w.icon} ${w.name} ×${stock}`;
        const wTextShort = `${w.icon} ${shortName(w.name)} ×${stock}`;

        if (this.el.hudActive) {
          this.el.hudActive.textContent = active.name + (flying ? ' (im Flug)' : '');
          this.el.hudActive.style.color = active.color;
        }
        if (this.el.hudAngle) this.el.hudAngle.textContent = angleStr;
        if (this.el.hudPower) this.el.hudPower.textContent = powerStr;
        if (this.el.hudWeapon) {
          this.el.hudWeapon.textContent = wTextLong;
          this.el.hudWeapon.style.color = w.color || '#fff';
        }

        // Mobile-Mirror.
        if (this.el.hudActiveMobile) {
          this.el.hudActiveMobile.textContent = active.name + (flying ? ' ✈' : '');
          this.el.hudActiveMobile.style.color = active.color;
        }
        if (this.el.hudAngleMobile) this.el.hudAngleMobile.textContent = angleStr;
        if (this.el.hudPowerMobile) this.el.hudPowerMobile.textContent = powerStr;
        if (this.el.hudWeaponMobile) {
          this.el.hudWeaponMobile.textContent = wTextShort;
          this.el.hudWeaponMobile.style.color = w.color || '#fff';
        }
      }

      // Live HP-Bars + credits — Desktop.
      if (this.el.hudPlayers) {
        const rows = this.el.hudPlayers.children;
        for (let i = 0; i < rows.length && i < this.tanks.length; i++) {
          const t = this.tanks[i];
          const bar = rows[i].querySelector('span > span');
          if (bar) bar.style.width = `${(t.hp / t.maxHp) * 100}%`;
          rows[i].classList.toggle('opacity-40', !t.alive);
          const credEl = rows[i].lastElementChild;
          if (credEl) credEl.textContent = `${t.credits}¢`;
        }
      }
      // Live HP-Bars — Mobile (Pillen).
      if (this.el.hudPlayersMobile) {
        const pills = this.el.hudPlayersMobile.children;
        for (let i = 0; i < pills.length && i < this.tanks.length; i++) {
          const t = this.tanks[i];
          const ratio = Math.max(0, t.hp / t.maxHp);
          const bar = pills[i].querySelector('.hpbar > span');
          if (bar) {
            bar.style.width = `${ratio * 100}%`;
            bar.style.background = this._hpColor(ratio);
          }
          pills[i].classList.toggle('dead', !t.alive);
        }
      }
    }
  }
}

const SHORT_NAMES = {
  'Standard-Granate': 'Std',
  'Schwere Granate': 'Schwer',
  'Streubombe': 'Streu',
  'Napalm': 'Napalm',
  'Roller': 'Roller',
  'Tunnelbohrer': 'Bohrer',
  'MIRV': 'MIRV',
  'Atombombe': 'Atom'
};

function shortName(name) {
  return SHORT_NAMES[name] ?? name;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
