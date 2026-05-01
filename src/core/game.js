import { Renderer } from '../rendering/renderer.js';
import { Terrain } from '../entities/terrain.js';
import { Tank, TANK_COLORS, pickSpawnPositions } from '../entities/tank.js';
import { Projectile } from '../entities/projectile.js';
import { FireBlob } from '../entities/fire-blob.js';
import { ChainHop } from '../entities/chain-hop.js';
import { WEAPONS, WEAPON_ORDER, canFire, consume as consumeWeapon } from '../entities/weapons.js';
import { generateWind, muzzleVelocity, setPhysicsScale, GRAVITY } from '../physics/ballistics.js';
import { checkProjectileImpact, applyBlast, settleTanks } from '../physics/collision.js';
import { AiController, DIFFICULTY } from '../ai/ai.js';
import { aiBuyWeapons, summarizePurchases } from '../ai/shop.js';
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
  PLAYER_SETUP: 'PLAYER_SETUP',
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
  aiDifficulty: DIFFICULTY.pro,    // Legacy — wird ueber resolveCharacter gemappt
  aiCharacter: 'random',           // Phase 3: 'random' | 'mr-stupid' | ... | 'wind-master'
  bestOf: 3,
  worldSize: 'mittel',             // klein | mittel | gross | riesig
  maxWind: 10,                     // Legacy fuer Backward-Compat
  windStage: 'normal',             // off|mild|normal|strong|gale|random (Phase 2.3)
  wallMode: 'off',                 // off|wrap|sticky|elastic|random (Phase 2.2)
  crumblePercent: 75,              // 0..100 (Phase 2.1)
  startCredits: 0                  // Anfangsgeld
};

// Phase 2.3: Wind-Stufen-Mapping. Maximaler Absolutwert je Stufe.
const WIND_STAGE_MAX = {
  off: 0, mild: 5, normal: 10, strong: 18, gale: 25
};
const WIND_STAGE_KEYS = ['off', 'mild', 'normal', 'strong', 'gale'];

// Phase 2.2: Walls-Modi-Liste fuer Random-Auswahl.
const WALL_MODE_KEYS = ['off', 'wrap', 'sticky', 'elastic'];
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
      playerSetup: document.getElementById('screen-player-setup'),
      playerSetupRows: document.getElementById('player-setup-rows'),
      btnSetupBack: document.getElementById('btn-setup-back'),
      btnSetupStart: document.getElementById('btn-setup-start'),
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
      setupBestOf: document.getElementById('setup-best-of'),
      setupWorldSize: document.getElementById('setup-world-size'),
      // Zoom-Slider (in-game)
      zoomSlider: document.getElementById('zoom-slider'),
      zoomLabel: document.getElementById('zoom-label'),
      dpadAngle: document.getElementById('dpad-angle'),
      dpadPower: document.getElementById('dpad-power'),
      ctrlWeaponName: document.getElementById('ctrl-weapon-name'),
      // Pause
      pause: document.getElementById('screen-pause'),
      btnResume: document.getElementById('btn-resume'),
      btnPauseMenu: document.getElementById('btn-pause-menu'),
      // Settings-Submenue
      settings: document.getElementById('screen-settings'),
      btnOpenSettings: document.getElementById('btn-open-settings'),
      btnCloseSettings: document.getElementById('btn-close-settings'),
      setWindStage: document.getElementById('set-wind-stage'),
      setWallMode: document.getElementById('set-wall-mode'),
      setCrumble: document.getElementById('set-crumble'),
      setStartCredits: document.getElementById('set-start-credits'),
      setWorldSizeSettings: document.getElementById('set-world-size'),
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
      aiCharacter: this.settings.aiCharacter ?? DEFAULT_CONFIG.aiCharacter,
      bestOf: this.settings.bestOf,
      worldSize: this.settings.worldSize ?? DEFAULT_CONFIG.worldSize,
      maxWind: this.settings.maxWind ?? DEFAULT_CONFIG.maxWind,
      windStage: this.settings.windStage ?? DEFAULT_CONFIG.windStage,
      wallMode: this.settings.wallMode ?? DEFAULT_CONFIG.wallMode,
      crumblePercent: this.settings.crumblePercent ?? DEFAULT_CONFIG.crumblePercent,
      startCredits: this.settings.startCredits ?? DEFAULT_CONFIG.startCredits
    };

    /** D-Pad-Aim-Input: -1/0/+1 je Achse (von touch.js gesetzt). */
    this.aimInput = { angleDir: 0, powerDir: 0 };
    /** Camera-Mode: false = Auto-Fit beim Schuss; true = bleibt im Zoom + folgt Projektil. */
    this._followMode = false;
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
      // Phase 3.3: Statt direkt zu starten geht's auf die Spieler-Auswahl-Seite.
      this.setState(S.PLAYER_SETUP);
    });
    this.el.btnSetupBack?.addEventListener('click', () => {
      this.sound.playClick();
      this.setState(S.MENU);
    });
    this.el.btnSetupStart?.addEventListener('click', () => {
      this.sound.playClick();
      this._readPlayerSetupRows();
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
    if (this.el.setupBestOf) this.el.setupBestOf.value = String(this.config.bestOf);
    if (this.el.setupWorldSize) this.el.setupWorldSize.value = this.config.worldSize;

    // Settings-Submenue verkabeln.
    if (this.el.setWindStage) this.el.setWindStage.value = this.config.windStage;
    if (this.el.setWallMode) this.el.setWallMode.value = this.config.wallMode;
    if (this.el.setCrumble) this.el.setCrumble.value = String(this.config.crumblePercent);
    if (this.el.setStartCredits) this.el.setStartCredits.value = String(this.config.startCredits);
    if (this.el.setWorldSizeSettings) this.el.setWorldSizeSettings.value = this.config.worldSize;

    this.el.btnOpenSettings?.addEventListener('click', () => {
      this.sound.playClick();
      this.el.settings?.classList.remove('hidden');
    });
    this.el.btnCloseSettings?.addEventListener('click', () => {
      this.sound.playClick();
      this._saveSettingsForm();
      this.el.settings?.classList.add('hidden');
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
    const bo = parseInt(this.el.setupBestOf?.value ?? '3', 10);
    this.config.numPlayers = clamp(np, 2, 10);
    this.config.bestOf = clamp(bo, 1, 9);
    this.settings = saveSettings({
      numPlayers: this.config.numPlayers,
      bestOf: this.config.bestOf
    });
  }

  /** Liest die Werte des Einstellungen-Subscreens und persistiert sie. */
  _saveSettingsForm() {
    const ws = this.el.setWorldSizeSettings?.value ?? 'mittel';
    const stage = this.el.setWindStage?.value ?? 'normal';
    const wall = this.el.setWallMode?.value ?? 'off';
    const crumble = parseInt(this.el.setCrumble?.value ?? '75', 10);
    const sc = parseInt(this.el.setStartCredits?.value ?? '0', 10);
    this.config.worldSize = CONFIG.world.presets[ws] ? ws : 'mittel';
    this.config.windStage = ['off','mild','normal','strong','gale','random'].includes(stage) ? stage : 'normal';
    this.config.wallMode = ['off','wrap','sticky','elastic','random'].includes(wall) ? wall : 'off';
    this.config.crumblePercent = clamp(crumble, 0, 100);
    this.config.startCredits = clamp(sc, 0, 5000);
    this.settings = saveSettings({
      worldSize: this.config.worldSize,
      windStage: this.config.windStage,
      wallMode: this.config.wallMode,
      crumblePercent: this.config.crumblePercent,
      startCredits: this.config.startCredits
    });
  }

  // -- Player-Setup-Screen (Phase 3.3) ---------------------------------------

  /**
   * Liefert die Slot-Konfiguration. Beim ersten Aufruf bzw. wenn die Anzahl
   * der Spieler veraendert wurde, wird das Default-Layout erzeugt:
   *   Slot 0       = Mensch ("Spieler 1")
   *   Slot 1..N-1  = KI mit Charakter "random"
   *
   * Persistierte Werte (Namen + Charakter-Auswahl) werden aus settings.players
   * uebernommen, soweit sie noch in den Slot-Bereich passen.
   */
  _ensurePlayerConfig() {
    const np = this.config.numPlayers;
    const persisted = this.settings.players ?? [];
    const current = this.playerConfig ?? [];
    const next = [];
    for (let i = 0; i < np; i++) {
      const fallback = current[i] ?? persisted[i] ?? null;
      next.push({
        type: fallback?.type ?? (i === 0 ? 'human' : 'ai'),
        name: fallback?.name ?? (i === 0 ? 'Spieler 1' : ''),
        character: fallback?.character ?? 'random'
      });
    }
    this.playerConfig = next;
  }

  /** Baut das HTML fuer die N Slot-Reihen. */
  _renderPlayerSetup() {
    this._ensurePlayerConfig();
    const rows = this.el.playerSetupRows;
    if (!rows) return;
    const characterOpts = `
      <option value="random">🎲 Zufall</option>
      <option value="mr-stupid">🤡 Mr. Stupid</option>
      <option value="lobber">🏹 Lobber</option>
      <option value="rifleman">🎯 Rifleman</option>
      <option value="windless-wit">🌬️ Windless Wit</option>
      <option value="lob-shoot">🎲 Lob &amp; Shoot</option>
      <option value="twanger">🪞 Twanger</option>
      <option value="wind-master">🌪️ Wind Master</option>
    `;
    rows.innerHTML = this.playerConfig.map((slot, i) => {
      const color = TANK_COLORS[i % TANK_COLORS.length];
      const isHuman = slot.type === 'human';
      return `
        <div class="player-row bg-tw-panel/80 border border-white/10 rounded p-2 flex items-center gap-2 font-pixel text-[10px]"
             style="border-left:4px solid ${color}">
          <span class="w-12 shrink-0 text-tw-accent">P${i + 1}</span>
          <div class="flex shrink-0 gap-1">
            <button data-slot-type="human" data-slot-idx="${i}"
              class="player-type-btn px-2 py-1 rounded border ${isHuman ? 'bg-tw-accent text-tw-bg border-tw-accent' : 'bg-tw-bg/60 text-white/70 border-white/20'}">
              👤 Mensch
            </button>
            <button data-slot-type="ai" data-slot-idx="${i}"
              class="player-type-btn px-2 py-1 rounded border ${!isHuman ? 'bg-tw-accent text-tw-bg border-tw-accent' : 'bg-tw-bg/60 text-white/70 border-white/20'}">
              🤖 KI
            </button>
          </div>
          <div class="flex-1 min-w-0">
            ${isHuman
              ? `<input type="text" data-slot-name="${i}" value="${escapeHtml(slot.name || `Spieler ${i + 1}`)}"
                    placeholder="Name"
                    class="w-full bg-tw-bg/80 border border-white/20 rounded px-2 py-1 text-white" />`
              : `<select data-slot-character="${i}"
                    class="w-full bg-tw-bg/80 border border-white/20 rounded px-2 py-1 text-white">
                    ${characterOpts}
                 </select>`
            }
          </div>
        </div>
      `;
    }).join('');
    // Character-Selects auf den persistierten Wert setzen
    rows.querySelectorAll('select[data-slot-character]').forEach((sel) => {
      const idx = parseInt(sel.getAttribute('data-slot-character'), 10);
      sel.value = this.playerConfig[idx]?.character ?? 'random';
    });
    // Type-Buttons binden
    rows.querySelectorAll('button[data-slot-type]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-slot-idx'), 10);
        const type = btn.getAttribute('data-slot-type');
        if (this.playerConfig[idx]) {
          this.playerConfig[idx].type = type;
          this._renderPlayerSetup(); // Neu rendern fuer Layout-Wechsel
        }
      });
    });
  }

  /** Liest die Slot-Werte aus dem DOM zurueck in playerConfig + persistiert sie. */
  _readPlayerSetupRows() {
    const rows = this.el.playerSetupRows;
    if (!rows || !this.playerConfig) return;
    rows.querySelectorAll('input[data-slot-name]').forEach((inp) => {
      const idx = parseInt(inp.getAttribute('data-slot-name'), 10);
      if (this.playerConfig[idx]) this.playerConfig[idx].name = inp.value.trim() || `Spieler ${idx + 1}`;
    });
    rows.querySelectorAll('select[data-slot-character]').forEach((sel) => {
      const idx = parseInt(sel.getAttribute('data-slot-character'), 10);
      if (this.playerConfig[idx]) this.playerConfig[idx].character = sel.value;
    });
    this.settings = saveSettings({ players: this.playerConfig });
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
    this._ensurePlayerConfig();
    this.scores = new Array(this.config.numPlayers).fill(0);
    this.roundIndex = 0;
    this.maxRounds = this.config.bestOf;
    this._hintShown = false; // Touch-Hint einmal pro Match.

    // Persistente Tanks: bleiben ueber Runden hinweg (Inventory + Credits).
    this.tanks = [];
    for (let i = 0; i < this.config.numPlayers; i++) {
      const slot = this.playerConfig[i];
      const isHuman = slot.type === 'human';
      const baseId = PLAYER_NAMES[i];
      // Anzeigename: Mensch-Name aus Eingabe, KI bekommt Charakter-Name (sobald
      // der AiController gebaut ist, ueberschreiben wir name dann).
      const t = new Tank({
        id: baseId,
        name: isHuman ? (slot.name || `Spieler ${i + 1}`) : `${baseId}`,
        color: TANK_COLORS[i % TANK_COLORS.length],
        x: 0,
        isHuman
      });
      t.selectedWeapon = 'standard';
      t.credits = this.config.startCredits;
      t.lastShopPurchases = [];
      if (!isHuman) {
        t.ai = new AiController(t, slot.character || 'random');
        // Anzeigename = Charaktername (z. B. "Lobber") — der Spieler weiss
        // damit immer, gegen welchen Charakter er gerade antritt.
        t.name = `${t.ai.character.emoji} ${t.ai.character.name}`;
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
      case S.PLAYER_SETUP:
        this._showOnly('playerSetup');
        this._renderPlayerSetup();
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
        // Camera-Verhalten: im Follow-Mode smooth zum aktiven Spieler pannen
        // (gleiche Zoomstufe). Sonst lassen wir den User-Zoom in Ruhe.
        if (t && this._followMode) {
          this.renderer.setCameraTarget(
            { centerWorld: { x: t.x, y: t.y - 40 } },
            5
          );
        }
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
      case S.SHOP: {
        // KI-Tanks kaufen automatisch nach Schwierigkeit. Resultate werden
        // im Shop angezeigt; Mensch sieht was die KI eingelagert hat.
        for (const t of this.tanks) {
          if (!t.isHuman && t.alive !== undefined) {
            t.lastShopPurchases = aiBuyWeapons(t, this.config.aiDifficulty);
          }
        }
        // Erster MENSCHLICHER Tab als initial aktiv (KI-Tabs sind read-only).
        this.shopActiveIdx = this.tanks.findIndex((t) => t.isHuman);
        if (this.shopActiveIdx < 0) this.shopActiveIdx = 0;
        this._populateShop();
        this._showOnly('shop');
        break;
      }
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

    // Phase 2.3: Gust-Mechanik in der Sturm-Stufe. ~3 % Chance pro Sekunde
    // einen 1-Sekunden-Gust auszuloesen (2x base wind).
    if (this._currentWindStage === 'gale') {
      const now = this.stateTime;
      if (this._gustActive && now >= this._gustEndsAt) {
        this._gustActive = false;
        this.wind = this.baseWind;
      }
      if (!this._gustActive && Math.random() < 0.03 * dt) {
        this._gustActive = true;
        this._gustEndsAt = now + 1.0;
        // Gust-Richtung kann auch flippen — typische Sturm-Boe.
        const flipChance = Math.random() < 0.3 ? -1 : 1;
        this.wind = this.baseWind * 2 * flipChance;
      }
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
    // Power-Range 0..1000 -> Speed × 10 ggn. der alten 0..100-Range, sonst dauert
    // 0->1000 25 Sekunden Halten (statt der alten 2.5 s fuer 0->100).
    const powerSpeed = (fine ? 120 : 400) * dt;
    // Tastatur-Input.
    if (this.input.isDown('ArrowLeft')) active.adjustAngle(angleSpeed);
    if (this.input.isDown('ArrowRight')) active.adjustAngle(-angleSpeed);
    // Touch-D-Pad-Input mit Tap-vs-Hold-Beschleunigung (Phase 1.7):
    // Sofortiger Tap-Klick erfolgt schon in touch.js beim pointerdown. Hier
    // skaliert der Continuous-Mode zusaetzlich mit der Halte-Dauer:
    //   t < 0.4s  -> 0.3x..1.0x (lineares Anlaufen)
    //   t >= 0.4s -> 1.0x..2.5x (lineares Beschleunigen, capped)
    const aimAccel = (axis) => {
      if (!this.aimInput?.[axis]) return 0;
      const t0 = this.aimInput[`${axis}_t0`];
      if (!t0) return 1;
      const heldFor = (performance.now() - t0) / 1000;
      if (heldFor < 0.4) return 0.3 + heldFor * 1.75;     // 0.3 -> 1.0
      return Math.min(2.5, 1.0 + (heldFor - 0.4) * 1.0);  // 1.0 -> 2.5 ueber 1.5s
    };
    const angleAccel = aimAccel('angleDir');
    const powerAccel = aimAccel('powerDir');
    if (this.aimInput?.angleDir) active.adjustAngle(this.aimInput.angleDir * angleSpeed * angleAccel);
    if (this.aimInput?.powerDir) active.adjustPower(this.aimInput.powerDir * powerSpeed * powerAccel);
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
    // Trail-Recording fuer naechste Runde.
    t.currentShotTrail = [{ x: tip.x, y: tip.y }];

    // Camera-Verhalten: PC/Tablet rauszoomen zur Gesamtuebersicht; Mobile-
    // Portrait bleibt im Zoom (verfolgt das Projektil).
    if (!this._followMode) {
      this.renderer.setCameraTarget({ zoom: 1 }, 6);
    }

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

    // Follow-Camera: Mobile-Portrait verfolgt das Hauptprojektil.
    if (this._followMode && this.projectile) {
      this.renderer.setCameraTarget(
        { centerWorld: { x: this.projectile.x, y: this.projectile.y } },
        8
      );
    }
  }

  _stepProjectile(p, dt, bounds, isChild) {
    if (p.mode === 'rolling') return this._stepRolling(p, dt, bounds);
    if (p.mode === 'drilling') return this._stepDrilling(p, dt, bounds);
    if (p.mode === 'piercing') return this._stepPiercing(p, dt, bounds);

    const prevX = p.x;
    const prevY = p.y;
    p.update(dt, this.wind, bounds);

    // Phase 2.2: Wall-Mode anwenden (off/wrap/sticky/elastic).
    this._applyWallMode(p, bounds);

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
      // Trail-Aufzeichnung (nur Hauptgeschoss, sub-sample alle ~12 Welt-Pixel).
      if (!isChild) {
        const owner = this.tanks.find((t) => t.id === p.ownerId);
        const trail = owner?.currentShotTrail;
        if (trail) {
          const last = trail[trail.length - 1];
          if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= 12) {
            trail.push({ x: p.x, y: p.y });
            // Begrenze Speicher (sehr lange Schuesse).
            if (trail.length > 400) trail.shift();
          }
        }
      }
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

    // Kinetik-Bonus nur bei Tank-Direkttreffern (Terrain-Treffer entstehen oft
    // nach gravity-bedingtem Geschwindigkeits-Verlust und sind unspektakulaer).
    let kineticBonus = 0;
    if (impact.type === 'tank') {
      kineticBonus = computeKineticBonus(p, w);
    }

    // Phase 1.2/1.6: Penetration NUR am Muendungsbereich. Ein normaler Schuss
    // kann sich beim Verlassen des Rohrs in nahes Erdreich bohren (z. B. wenn
    // der Tank den Hang anvisiert) — bohrt ein Stueck weit und detoniert dann
    // im Boden. Spaetere Aufschlaege (nach Flug durch die Luft) detonieren
    // immer sofort. Spezialwaffen mit pierceAlways (z. B. Laser) sind exempt.
    if (impact.type === 'terrain' && p.mode === 'flying') {
      const distFromMuzzle = Math.hypot(p.x - p.spawnX, p.y - p.spawnY);
      const nearMuzzle = distFromMuzzle < 60;
      const allowPierce = w.pierceAlways || (nearMuzzle && !p.hasPierced);
      if (allowPierce) {
        const pierceDist = computePierceDistance(p, w);
        if (pierceDist >= 8) {
          p.mode = 'piercing';
          p.pierceRemaining = pierceDist;
          p.hasPierced = true; // einmaliges Privileg verbraucht
          p.x = impact.x;
          p.y = impact.y;
          // Velocity beim Eintauchen reduzieren — nicht stoppen, aber abbremsen.
          p.vx *= 0.7;
          p.vy *= 0.7;
          return;
        }
      }
    }

    this._detonate(p, impact, w, { kineticBonus });
    p.alive = false;
  }

  /**
   * Pro Frame: Granate bohrt sich durchs Erdreich. Bremst kontinuierlich,
   * carved einen schmalen Tunnel, detoniert wenn:
   *   - Penetrations-Reserve aufgebraucht
   *   - Geschwindigkeit zu klein (festgesetzt)
   *   - Granate aus dem Boden raus (auf der anderen Seite des Huegels)
   *   - Tank in Reichweite getroffen
   */
  _stepPiercing(p, dt, bounds) {
    const w = WEAPONS[p.weaponId] || WEAPONS.standard;

    // Position update (mit reduzierter Gravity, Erde traegt das Geschoss).
    const dx = p.vx * dt;
    const dy = p.vy * dt;
    p.x += dx;
    p.y += dy;
    p.vy += GRAVITY * 0.3 * dt;

    // Reibung: Pro Sekunde ~50 % Velocity-Verlust skaliert mit (1/caseHardness).
    const dragFactor = 0.5 / Math.max(0.5, w.caseHardness ?? 1.0);
    const drag = Math.pow(dragFactor, dt);
    p.vx *= drag;
    p.vy *= drag;

    const dist = Math.hypot(dx, dy);
    p.pierceRemaining -= dist;
    p.age += dt;

    // Carve schmalen Tunnel — bleibt unsichtbar, da Heightmap keine Tunnel
    // darstellt. Aber bei finaler Detonation entsteht eine grosse Kerbe.
    this.terrain.carve(p.x, p.y, 6);
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 24) p.trail.shift();

    // Tank-Treffer waehrend des Bohrens?
    for (const tank of this.tanks) {
      if (!tank.alive) continue;
      if (Math.abs(tank.x - p.x) < 18 && Math.abs(tank.y - p.y) < 24) {
        const kineticBonus = computeKineticBonus(p, w);
        this._detonate(p, { type: 'tank', tank, x: p.x, y: p.y }, w, { kineticBonus });
        p.alive = false;
        return;
      }
    }

    // Out-of-bounds? -> Detonation am letzten Punkt.
    if (p.x < 0 || p.x > bounds.width || p.y > bounds.height) {
      this._detonate(p, { x: p.x, y: p.y }, w);
      p.alive = false;
      return;
    }

    // Aus Erdreich raus (Surface unter uns gefallen)? Wieder fliegend.
    const aboveGround = p.y < this.terrain.surfaceY(p.x) - 2;
    if (aboveGround) {
      p.mode = 'flying';
      return;
    }

    // Ausgebremst oder Pierce-Reserve aufgebraucht? -> Detonation.
    const speed = Math.hypot(p.vx, p.vy);
    if (p.pierceRemaining <= 0 || speed < 80) {
      this._detonate(p, { x: p.x, y: p.y }, w);
      p.alive = false;
    }
  }

  _detonate(p, impact, w, opts = {}) {
    if (w.sonicWave) {
      this._sonicSweep(w.sonicWave);
      // Skip carve — sonic deals no terrain damage at impact, only collapses.
    } else if (w.chainReact) {
      this._scheduleChain(impact, w.chainReact);
      // Skip default carve — _scheduleChain hat den initialen Carve schon erledigt.
    } else {
      this.terrain.carve(impact.x, impact.y, w.blastRadius);
      // Phase 2.1: Crumble-Effekt nach Krater. Bei 100 % immer geglaettet,
      // bei 0 % nie — sichtbarer Unterschied an der Krater-Kontur.
      this.terrain.smoothCrater(impact.x, w.blastRadius, this.config.crumblePercent ?? 75);
    }
    const hits = applyBlast(impact, this.tanks, w.blastRadius, w.damage);

    // Kinetik-Bonus: Direkttreffer-Tank bekommt zusaetzlichen Schaden basierend
    // auf Geschwindigkeit² × Masse. Die Splash-Opfer kriegen den Bonus NICHT —
    // sie sind nicht direkt getroffen worden.
    if (impact.type === 'tank' && opts.kineticBonus > 0) {
      const bonusDmg = Math.max(1, Math.round(w.damage * opts.kineticBonus));
      impact.tank.takeDamage(bonusDmg);
      // Treffer-Liste fuer Credits ergaenzen / aufaddieren.
      const existing = hits.find((h) => h.tank === impact.tank);
      if (existing) existing.dmg += bonusDmg;
      else hits.push({ tank: impact.tank, dmg: bonusDmg });
    }

    this._awardCredits(p.ownerId, hits);

    // Lernen fuer "expert"-KI: dem Schuetzen den Treffer zurueckmelden.
    const shooter = this.tanks.find((t) => t.id === p.ownerId);
    if (shooter && shooter.ai) shooter.ai.recordImpact(impact.x, impact.y);

    // Trail finalisieren — letzter Punkt = Detonations-Position; archiviere.
    if (shooter && shooter.currentShotTrail) {
      shooter.currentShotTrail.push({ x: impact.x, y: impact.y });
      shooter.lastShotTrail = shooter.currentShotTrail;
      shooter.currentShotTrail = null;
    }

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

    // Dirt-Familie: schuettet Erde an die Aufprallstelle. Funktioniert
    // parallel zu carve (dirt-explosive: Krater UND Erdwall).
    if (w.dirtFill) this._applyDirtFill(impact, w.dirtFill);
  }

  _applyDirtFill(impact, cfg) {
    this.terrain.heap(impact.x, impact.y, cfg.radius, cfg.height);
    // Particles in Erd-Braun fuer visuelles Feedback
    this.particles.explosion(impact.x, impact.y, cfg.radius * 0.5);
    this._applyDirtCrush(impact, cfg);
  }

  _applyDirtCrush(impact, cfg) {
    for (const t of this.tanks) {
      if (!t.alive) continue;
      if (Math.abs(t.x - impact.x) > cfg.radius * 1.2) continue;
      const newSurf = this.terrain.surfaceY(t.x);
      // TANK_BODY_HEIGHT importiert aus tank.js (siehe top of game.js)
      const tankTop = t.y - 12 - 4 - 8; // body + tracks + turret approx
      if (newSurf < tankTop) {
        const buryDepth = Math.min(20, tankTop - newSurf);
        const dmg = Math.round(buryDepth * 0.5);
        if (dmg > 0) t.takeDamage(dmg);
      }
    }
  }

  _sonicSweep(cfg) {
    const W = this.terrain.width;
    for (let pass = 0; pass < cfg.sweepPasses; pass++) {
      for (let k = 0; k < 5; k++) {
        const cx = ((k + 0.5) / 5) * W;
        this.terrain.smoothCrater(cx, W / 8, cfg.smoothPercent);
      }
    }
    // Visueller Effekt
    this.particles.explosion(this.worldWidth / 2, this.worldHeight * 0.4, 60);
    this.renderer.triggerShake(4, 0.3);
  }

  _scheduleChain(impact, cfg) {
    // Initial Detonation am Aufprall.
    this.terrain.carve(impact.x, impact.y, cfg.initialRadius);
    this.terrain.smoothCrater(impact.x, cfg.initialRadius, this.config.crumblePercent ?? 75);
    this.particles.explosion(impact.x, impact.y, cfg.initialRadius);
    this.sound.playExplosion(cfg.initialRadius);

    // Chain-Hops queue
    let r = cfg.initialRadius;
    let prevX = impact.x;
    for (let i = 0; i < cfg.hops; i++) {
      r *= cfg.falloff;
      if (r < 6) break;
      const ox = (Math.random() - 0.5) * cfg.spreadX;
      const cx = clamp(prevX + ox, 10, this.worldWidth - 10);
      const cy = this.terrain.surfaceY(cx);
      this.effects.push(new ChainHop({
        x: cx, y: cy, radius: r,
        delay: (i + 1) * cfg.jitterDelay
      }));
      prevX = cx;
    }
  }

  /**
   * Phase 2.2: Wall-Mode an Spielfeld-Raendern anwenden.
   * - off:     Geschoss verlaesst Welt seitlich -> tot
   * - wrap:    links/rechts wickeln um (oben/unten weiter offen)
   * - sticky:  Bounce mit 50 % Velocity-Verlust
   * - elastic: Bounce ohne Verlust
   *
   * Random-Mode wird beim Round-Start in _currentWallMode aufgeloest.
   */
  _applyWallMode(p, bounds) {
    if (!p.alive || p.mode !== 'flying') return;
    const mode = this._currentWallMode || 'off';
    const W = bounds.width;
    if (mode === 'off') {
      if (p.x < -50 || p.x > W + 50) p.alive = false;
      return;
    }
    if (mode === 'wrap') {
      if (p.x < 0) p.x += W;
      else if (p.x > W) p.x -= W;
      return;
    }
    // sticky / elastic
    const factor = mode === 'sticky' ? 0.5 : 1.0;
    if (p.x < 0) {
      p.x = -p.x;
      p.vx = -p.vx * factor;
    } else if (p.x > W) {
      p.x = 2 * W - p.x;
      p.vx = -p.vx * factor;
    }
    if (p.y < 0) {
      p.y = -p.y;
      p.vy = Math.abs(p.vy) * factor;
    }
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
      // ChainHop: einmal triggert, fuehrt Carve aus
      if (e instanceof ChainHop && e.fired && e.alive) {
        this.terrain.carve(e.x, e.y, e.radius);
        this.terrain.smoothCrater(e.x, e.radius, this.config.crumblePercent ?? 75);
        this.particles.explosion(e.x, e.y, e.radius);
        this.sound.playExplosion(e.radius);
        e.alive = false;
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

    // Phase 2.2: Wall-Mode pro Runde aufloesen (Random -> konkrete Wahl).
    this._currentWallMode = this.config.wallMode === 'random'
      ? WALL_MODE_KEYS[Math.floor(rng() * WALL_MODE_KEYS.length)]
      : (this.config.wallMode || 'off');

    // Phase 2.3: Wind-Stage pro Runde aufloesen + Base-Wind generieren.
    const stage = this.config.windStage === 'random'
      ? WIND_STAGE_KEYS[Math.floor(rng() * WIND_STAGE_KEYS.length)]
      : (this.config.windStage || 'normal');
    this._currentWindStage = stage;
    const maxWind = WIND_STAGE_MAX[stage] ?? 10;
    this.baseWind = generateWind(rng, maxWind);
    this.wind = this.baseWind;
    // Gust-Mechanik nur in Stufe "gale" aktiv.
    this._gustActive = false;
    this._gustEndsAt = 0;

    this.skyIndex = (this.roundIndex + Math.floor(rng() * 3)) % 3;

    // Persistente Tanks: Position + HP fuer neue Runde resetten, Inventory + Credits behalten.
    const xs = pickSpawnPositions(this.tanks.length, this.worldWidth, rng);
    this.tanks.forEach((t, i) => {
      t.x = xs[i];
      t.y = 0;
      t.hp = t.maxHp;
      t.alive = true;
      t.turretAngle = 90;
      t.power = 500;
      t._lastTickAngle = undefined;
      t._lastTickPower = undefined;
      // Trails zwischen Runden behalten waere stoerend — frisch starten.
      t.lastShotTrail = null;
      t.currentShotTrail = null;
      // Falls die ausgewaehlte Waffe nicht mehr verfuegbar -> auf Standard zurueck.
      if (!canFire(t, t.selectedWeapon)) t.selectedWeapon = 'standard';
      t.snapToTerrain(this.terrain);
    });

    // Camera-Mode: Mobile-Portrait und kleine Displays bekommen Follow-Mode
    // (Camera bleibt im Zoom, verfolgt Projektil + naechsten Spieler).
    // Desktop/Tablet zoomen beim Schuss automatisch zur Gesamtuebersicht.
    const isPortrait = this.renderer.viewportH > this.renderer.viewportW;
    const isSmall = this.renderer.viewportW < 720;
    this._followMode = isPortrait || isSmall;

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
    for (const k of ['menu', 'playerSetup', 'hud', 'shop', 'gameover']) {
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

    // Spieler-Tabs: Mensch-Tanks anklickbar, KI-Tanks nur als Status-Pillen.
    if (this.el.shopPlayerTabs) {
      this.el.shopPlayerTabs.innerHTML = this.tanks
        .map((t, i) => {
          const isActive = i === this.shopActiveIdx;
          if (t.isHuman) {
            return `
              <button data-shop-tab="${i}"
                class="shop-tab font-pixel text-[10px] px-3 py-2 rounded border transition
                  ${isActive ? 'bg-tw-accent text-tw-bg border-tw-accent' : 'bg-tw-panel/60 text-white/80 border-white/10 hover:border-white/30'}"
                style="${isActive ? '' : `border-left:3px solid ${t.color}`}">
                ${t.name} · ${t.credits}¢
              </button>`;
          }
          // KI-Tab: read-only-Pille mit Einkaufsliste.
          const summary = summarizePurchases(t.lastShopPurchases);
          return `
            <div class="font-pixel text-[10px] px-3 py-2 rounded border bg-tw-panel/40 text-white/60 border-white/5 flex flex-col gap-0.5"
                 style="border-left:3px solid ${t.color}">
              <span><span class="text-white">${t.name}</span> · ${t.credits}¢</span>
              <span class="text-[8px] text-white/50">${summary}</span>
            </div>`;
        })
        .join('');
      this.el.shopPlayerTabs.querySelectorAll('button[data-shop-tab]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(/** @type {HTMLElement} */ (e.currentTarget).dataset.shopTab || '0', 10);
          if (this.tanks[idx]?.isHuman) {
            this.shopActiveIdx = idx;
            this._populateShop();
          }
        });
      });
    }

    const tank = this.tanks[this.shopActiveIdx];
    if (!tank) return;
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

    if (this.state !== S.MENU && this.state !== S.PLAYER_SETUP) {
      // Welt-Space ab hier: Terrain, Tanks, Projektile, Partikel.
      this.renderer.applyCamera();
      if (this.terrain) this.renderer.drawTerrain(this.terrain);
      // Trails der vergangenen Schuesse — DEZENT, hinter Tanks.
      for (const t of this.tanks) {
        this.renderer.drawShotTrail(t.lastShotTrail, t.color);
      }
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
        const powerStr = `${Math.round(active.power)}/${active.powerMax}`;
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
        // D-Pad-Anzeige (Legacy — falls noch im DOM, wird aktualisiert).
        if (this.el.dpadAngle) this.el.dpadAngle.textContent = angleStr;
        if (this.el.dpadPower) this.el.dpadPower.textContent = powerStr;
        // Bedienpanel: Waffenname auf dem Cycle-Button live zeigen.
        if (this.el.ctrlWeaponName) {
          this.el.ctrlWeaponName.textContent = `${shortName(w.name).toUpperCase()} ×${stock}`;
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

/** Sehr einfacher HTML-Escape fuer Spielernamen im Player-Setup. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/**
 * Kinetik-Bonus bei Direkttreffern: schneller, schwerer Schuss richtet bis zu
 * +50 % zusaetzlichen Schaden an.
 *
 * Eichung:
 *   Standard-Granate (mass 4) bei v=900 px/s -> +40 %
 *   Standard-Granate (mass 4) bei v=300 px/s ->  +4 %
 *   Atombombe (mass 30) bei v=900 px/s -> capped auf +50 %
 *
 * Damit lohnt sich „Sniper-Stil" mit niedriger Flugbahn (= hoher Power, wenig
 * Gravity-Verlust) gegenueber Lobs, ohne dass kleine Munition zur Atombombe
 * mutiert.
 */
function computeKineticBonus(p, w) {
  const speed = Math.hypot(p.vx, p.vy);
  const m = w.mass ?? 4;
  // Skalierung: 0.5 * m * v² / kRef
  const kRef = 4_000_000;
  return Math.min(0.5, (0.5 * m * speed * speed) / kRef);
}

/**
 * Penetrations-Distanz beim Aufprall aufs Terrain. Nur Waffen mit
 * caseHardness > 0 koennen sich einbohren — Roller/Driller haben eigene
 * Logik (caseHardness 0).
 *
 * Eichung:
 *   Standard (mass 4, h 1.0) bei v=900 px/s -> ~25 px Penetration
 *   Standard bei v=300 px/s ->  ~3 px (zu wenig, faellt unter Schwelle 8)
 *   Atombombe (mass 30, h 1.5) bei v=900 -> capped auf 80 px
 *
 * Niedrige Power -> Direktdetonation auf Surface (klassisch).
 * Hohe Power -> bohrt sich in Huegel rein und detoniert tief drin.
 */
function computePierceDistance(p, w) {
  if (!w.caseHardness || w.caseHardness <= 0) return 0;
  const speed = Math.hypot(p.vx, p.vy);
  const m = w.mass ?? 4;
  // Skalierung: KE × Haerte / kRef
  const kRef = 80_000;
  const raw = (0.5 * m * speed * speed * w.caseHardness) / kRef;
  return Math.min(80, Math.max(0, raw));
}
