import { Renderer } from '../rendering/renderer.js';
import { Terrain } from '../entities/terrain.js';
import { Tank, TANK_COLORS, pickSpawnPositions } from '../entities/tank.js';
import { Projectile } from '../entities/projectile.js';
import { generateWind, muzzleVelocity } from '../physics/ballistics.js';
import { checkProjectileImpact, applyBlast, settleTanks } from './../physics/collision.js';
import { startLoop } from './loop.js';
import { createRng } from './rng.js';
import { Input } from './input.js';

/**
 * Game-State-Machine. Reihenfolge gemaess Spec:
 * MENU -> ROUND_START -> PLAYER_TURN -> PROJECTILE_FLYING -> IMPACT
 *      -> (alive>1) PLAYER_TURN | (alive<=1) ROUND_END -> SHOP -> ROUND_START | GAME_OVER -> MENU
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
  bestOf: 3 // ungerade -> kein Patt-Ende
};

const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

export class Game {
  constructor() {
    this.canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
    this.renderer = new Renderer(this.canvas);
    this.input = new Input();

    /** @type {Record<string, HTMLElement>} */
    this.el = {
      menu: document.getElementById('screen-menu'),
      hud: document.getElementById('screen-hud'),
      banner: document.getElementById('screen-banner'),
      shop: document.getElementById('screen-shop'),
      gameover: document.getElementById('screen-gameover'),
      hudActive: document.getElementById('hud-active'),
      hudAngle: document.getElementById('hud-angle'),
      hudPower: document.getElementById('hud-power'),
      hudPlayers: document.getElementById('hud-players'),
      hudStatus: document.getElementById('hud-status'),
      bannerTitle: document.getElementById('banner-title'),
      bannerSub: document.getElementById('banner-sub'),
      gameoverContent: document.getElementById('gameover-content'),
      btnStart: document.getElementById('btn-start'),
      btnPause: document.getElementById('btn-pause'),
      btnShopContinue: document.getElementById('btn-shop-continue'),
      btnBackMenu: document.getElementById('btn-back-menu')
    };

    this.config = { ...DEFAULT_CONFIG };

    this.state = null;
    this.stateTime = 0;

    /** @type {Tank[]} */
    this.tanks = [];
    /** @type {Terrain|null} */
    this.terrain = null;
    /** @type {Projectile|null} */
    this.projectile = null;
    this.wind = 0;
    this.skyIndex = 0;
    this.activeIndex = 0;
    /** @type {number[]} runden-gewonnen pro tank-index */
    this.scores = [];
    this.roundIndex = 0;
    /** @type {number} target-rundenzahl, ab der Game-Over greift */
    this.maxRounds = this.config.bestOf;

    this._wireDom();
    this.setState(S.MENU);

    // FPS-Tracking
    this._frames = 0;
    this._fpsT = performance.now();
  }

  _wireDom() {
    this.el.btnStart?.addEventListener('click', () => this._startNewGame());
    this.el.btnPause?.addEventListener('click', () => {
      // Pause -> zurueck ins Hauptmenue (Spielstand verworfen). Echtes Pause-Menue: Schritt 9.
      this.setState(S.MENU);
    });
    this.el.btnShopContinue?.addEventListener('click', () => {
      this.roundIndex++;
      if (this._isMatchOver()) this.setState(S.GAME_OVER);
      else this.setState(S.ROUND_START);
    });
    this.el.btnBackMenu?.addEventListener('click', () => this.setState(S.MENU));
  }

  _startNewGame() {
    this.scores = new Array(this.config.numPlayers).fill(0);
    this.roundIndex = 0;
    this.maxRounds = this.config.bestOf;
    this.setState(S.ROUND_START);
  }

  start() {
    startLoop((dt, now) => {
      this.update(dt, now);
      this.render(now);
      this._frames++;
      if (now - this._fpsT >= 500) {
        const fps = Math.round((this._frames * 1000) / (now - this._fpsT));
        if (this.el.hudStatus) {
          this.el.hudStatus.textContent = `${fps} fps · Wind ${this.wind}`;
        }
        this._frames = 0;
        this._fpsT = now;
      }
      this.input.endFrame();
    });
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
        break;
      case S.PLAYER_TURN:
        this._hideBanner();
        this._showOnly('hud');
        break;
      case S.PROJECTILE_FLYING:
        break;
      case S.IMPACT:
        break;
      case S.ROUND_END: {
        const alive = this._aliveTanks();
        if (alive.length === 1) {
          const winner = alive[0];
          const idx = this.tanks.indexOf(winner);
          if (idx >= 0) this.scores[idx] = (this.scores[idx] ?? 0) + 1;
          this._showBanner(`${winner.name} gewinnt die Runde!`, this._scoresLine(), winner.color);
        } else {
          this._showBanner('Patt — alle ausgeschaltet', this._scoresLine(), '#94a3b8');
        }
        break;
      }
      case S.SHOP:
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
    switch (state) {
      case S.ROUND_END:
        this._hideBanner();
        break;
      default:
        break;
    }
  }

  update(dt) {
    this.stateTime += dt;
    switch (this.state) {
      case S.MENU:
        // Keyboard-Shortcut zum Spielstart.
        if (this.input.consume('Enter') || this.input.consume('Space')) this._startNewGame();
        break;

      case S.ROUND_START:
        // Banner kurz stehen lassen, dann Spieler-Turn.
        if (this.stateTime > 1.0 || this.input.consume('Space')) {
          this.setState(S.PLAYER_TURN);
        }
        break;

      case S.PLAYER_TURN:
        this._updatePlayerTurn(dt);
        break;

      case S.PROJECTILE_FLYING:
        this._updateProjectile(dt);
        break;

      case S.IMPACT:
        // Kurze Pause fuer visuelles Feedback (Partikel kommen in Schritt 10).
        if (this.stateTime > 0.45) {
          const alive = this._aliveTanks();
          if (alive.length <= 1) {
            this.setState(S.ROUND_END);
          } else {
            this._nextActiveTank();
            this.setState(S.PLAYER_TURN);
          }
        }
        break;

      case S.ROUND_END:
        if (this.stateTime > 0.6 && (this.input.consume('Space') || this.input.consume('Enter'))) {
          // Gleich Game-Over checken (vor dem Shop), wenn der Match-Sieger schon feststeht.
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
    const fine = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const angleSpeed = (fine ? 15 : 60) * dt;
    const powerSpeed = (fine ? 12 : 40) * dt;
    if (this.input.isDown('ArrowLeft')) active.adjustAngle(angleSpeed);
    if (this.input.isDown('ArrowRight')) active.adjustAngle(-angleSpeed);
    if (this.input.isDown('ArrowUp')) active.adjustPower(powerSpeed);
    if (this.input.isDown('ArrowDown')) active.adjustPower(-powerSpeed);

    if (this.input.consume('Space')) this._fire();
    if (this.input.consume('Tab')) {
      this._nextActiveTank();
    }
  }

  _updateProjectile(dt) {
    if (!this.projectile) {
      this.setState(S.IMPACT);
      return;
    }
    const prevX = this.projectile.x;
    const prevY = this.projectile.y;
    this.projectile.update(dt, this.wind, {
      width: this.renderer.width,
      height: this.renderer.height
    });
    if (this.projectile.alive) {
      const impact = checkProjectileImpact(
        this.projectile,
        prevX,
        prevY,
        this.terrain,
        this.tanks
      );
      if (impact) {
        const radius = 35;
        const damage = 25;
        this.terrain.carve(impact.x, impact.y, radius);
        applyBlast(impact, this.tanks, radius, damage);
        settleTanks(this.tanks, this.terrain);
        this.projectile.alive = false;
      }
    }
    if (!this.projectile.alive) {
      this.projectile = null;
      this.setState(S.IMPACT);
    }
  }

  _fire() {
    const t = this.tanks[this.activeIndex];
    if (!t || !t.alive) return;
    const tip = t.turretTip();
    const { vx, vy } = muzzleVelocity(t.turretAngle, t.power);
    this.projectile = new Projectile({ x: tip.x, y: tip.y, vx, vy, ownerId: t.id });
    this.setState(S.PROJECTILE_FLYING);
  }

  _beginRound() {
    const seed = ((this.roundIndex + 1) * 1000003) ^ ((Math.random() * 1e9) >>> 0);
    const rng = createRng(seed >>> 0);
    this.terrain = new Terrain(this.renderer.width, this.renderer.height, rng);
    this.wind = generateWind(rng);
    this.skyIndex = (this.roundIndex + Math.floor(rng() * 3)) % 3;

    const xs = pickSpawnPositions(this.config.numPlayers, this.renderer.width, rng);
    this.tanks = xs.map((x, i) => {
      const t = new Tank({
        id: PLAYER_NAMES[i],
        name: PLAYER_NAMES[i],
        color: TANK_COLORS[i % TANK_COLORS.length],
        x
      });
      t.snapToTerrain(this.terrain);
      return t;
    });
    this.activeIndex = 0;
    this.projectile = null;
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
    // Klassisches Best-of: jemand kann nicht mehr eingeholt werden.
    const top = Math.max(...this.scores, 0);
    const remaining = this.maxRounds - this.roundIndex;
    const threshold = Math.floor(this.maxRounds / 2) + 1;
    if (top >= threshold) return true;
    // Auch Game-Over, wenn alle bis auf einen "rechnerisch raus" sind.
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
    return this.tanks
      .map((t, i) => `${t.name}:${this.scores[i] ?? 0}`)
      .join(' · ');
  }

  _renderPlayersHud() {
    if (!this.el.hudPlayers) return;
    this.el.hudPlayers.innerHTML = this.tanks
      .map((t, i) => {
        const ratio = Math.max(0, t.hp / t.maxHp);
        const wins = this.scores[i] ?? 0;
        const dim = t.alive ? '' : 'opacity-40';
        return `
          <div class="flex items-center gap-2 ${dim}">
            <span class="inline-block w-2 h-2 rounded-sm" style="background:${t.color}"></span>
            <span class="text-white text-[10px] w-8" data-pid="${i}">${t.name}</span>
            <span class="relative inline-block w-20 h-2 bg-black/50 rounded-sm overflow-hidden">
              <span class="absolute inset-y-0 left-0" style="width:${ratio * 100}%; background:${this._hpColor(ratio)}"></span>
            </span>
            <span class="text-tw-accent text-[10px]">x${wins}</span>
          </div>`;
      })
      .join('');
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
  }

  _showOnly(name) {
    for (const k of ['menu', 'hud', 'shop', 'gameover']) {
      if (!this.el[k]) continue;
      if (k === name) this.el[k].classList.remove('hidden');
      else this.el[k].classList.add('hidden');
    }
    // Banner ist orthogonal — nicht hier ausblenden.
  }

  render(now) {
    this.renderer.drawSky(this.skyIndex);
    if (this.terrain) this.renderer.drawTerrain(this.terrain);

    if (this.state !== S.MENU) {
      for (let i = 0; i < this.tanks.length; i++) {
        const showActive = i === this.activeIndex && this.state === S.PLAYER_TURN;
        this.renderer.drawTank(this.tanks[i], showActive, now);
      }
      if (this.projectile) this.renderer.drawProjectile(this.projectile);
      this.renderer.drawWindIndicator(this.wind);
    }

    // HUD-Werte aktualisieren.
    if (this.state === S.PLAYER_TURN || this.state === S.PROJECTILE_FLYING) {
      const active = this.tanks[this.activeIndex];
      if (active) {
        if (this.el.hudActive) {
          this.el.hudActive.textContent =
            active.name + (this.state === S.PROJECTILE_FLYING ? ' (im Flug)' : '');
          this.el.hudActive.style.color = active.color;
        }
        if (this.el.hudAngle) this.el.hudAngle.textContent = `${Math.round(active.turretAngle)}°`;
        if (this.el.hudPower) this.el.hudPower.textContent = `${Math.round(active.power)}`;
      }
      // HP-Liste live aktualisieren.
      if (this.el.hudPlayers) {
        const rows = this.el.hudPlayers.children;
        for (let i = 0; i < rows.length && i < this.tanks.length; i++) {
          const t = this.tanks[i];
          const bar = rows[i].querySelector('span > span');
          if (bar) bar.style.width = `${(t.hp / t.maxHp) * 100}%`;
          rows[i].classList.toggle('opacity-40', !t.alive);
        }
      }
    }
  }
}
