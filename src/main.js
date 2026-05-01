import './style.css';
import { Game } from './core/game.js';
import { initTouchControls } from './ui/touch.js';

/**
 * Bootstrap. Baut die DOM-Overlays (Menue, HUD, Banner, Shop, Game-Over),
 * uebergibt die Steuerung dann an Game (State-Machine + Render-Loop).
 */

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="game-canvas"></canvas>

  <div id="screen-menu" class="screen flex flex-col items-center justify-center gap-5 text-center px-6 overflow-auto py-6">
    <h1 class="font-pixel text-3xl md:text-5xl text-tw-accent drop-shadow-lg">TANK WARS</h1>
    <p class="font-pixel text-[10px] md:text-xs text-white/70 max-w-md leading-relaxed">
      Hot-Seat-Artillery im Browser. Hommage an den DOS-Klassiker.
    </p>

    <div class="grid grid-cols-2 gap-3 w-full max-w-sm font-pixel text-[10px] text-left">
      <label class="flex flex-col gap-1">
        <span class="text-white/70">Spieler</span>
        <select id="setup-num-players" class="bg-tw-panel border border-white/20 rounded px-2 py-2 text-white">
          <option value="2">2</option>
          <option value="3">3</option>
          <option value="4" selected>4</option>
          <option value="5">5</option>
          <option value="6">6</option>
          <option value="8">8</option>
          <option value="10">10</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-white/70">davon Mensch</span>
        <select id="setup-num-humans" class="bg-tw-panel border border-white/20 rounded px-2 py-2 text-white"></select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-white/70">KI-Stufe</span>
        <select id="setup-difficulty" class="bg-tw-panel border border-white/20 rounded px-2 py-2 text-white">
          <option value="beginner">Anfänger</option>
          <option value="pro" selected>Profi</option>
          <option value="expert">Pro</option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-white/70">Runden</span>
        <select id="setup-best-of" class="bg-tw-panel border border-white/20 rounded px-2 py-2 text-white">
          <option value="1">Best of 1</option>
          <option value="3" selected>Best of 3</option>
          <option value="5">Best of 5</option>
          <option value="7">Best of 7</option>
        </select>
      </label>
      <label class="flex flex-col gap-1 col-span-2">
        <span class="text-white/70">Welt-Größe</span>
        <select id="setup-world-size" class="bg-tw-panel border border-white/20 rounded px-2 py-2 text-white">
          <option value="klein">Klein (1280)</option>
          <option value="mittel" selected>Mittel (2000)</option>
          <option value="gross">Groß (3000)</option>
          <option value="riesig">Riesig (4200)</option>
        </select>
      </label>
    </div>

    <button id="btn-start"
      class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded shadow hover:bg-yellow-300 transition">
      Neues Spiel
    </button>

    <div class="flex gap-2">
      <button id="btn-sound"
        class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
        Sound ◉
      </button>
      <button id="btn-music"
        class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
        Musik ○
      </button>
    </div>

    <div class="font-pixel text-[10px] text-white/40 max-w-sm leading-relaxed desktop-only">
      Pfeiltasten Winkel/Stärke · Shift = fein<br>
      Leertaste = Feuer · Tab/E = Waffe · Q = zurück · ESC = Pause
    </div>
    <div class="font-pixel text-[9px] text-white/30">v1.0</div>
  </div>

  <div id="screen-hud" class="hidden">
    <div class="absolute top-3 right-3 flex gap-2">
      <button id="btn-pause"
        class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
        Menü
      </button>
    </div>

    <div id="hud-mobile" class="hud-mobile-only absolute top-3 left-3 right-20 pointer-events-none">
      <div class="bg-tw-panel/85 border border-white/10 rounded p-2 font-pixel text-[9px] flex flex-col gap-1">
        <div class="flex items-center justify-between gap-2">
          <span id="hud-active-mobile" class="text-tw-accent text-xs truncate">P1</span>
          <span class="text-white/80">
            <span id="hud-angle-mobile" class="text-emerald-400">90°</span>
            <span class="text-white/30">·</span>
            <span id="hud-power-mobile" class="text-emerald-400">50</span>
          </span>
          <span id="hud-weapon-mobile" class="text-tw-accent truncate max-w-[120px]">● Std ×∞</span>
        </div>
        <div id="hud-players-mobile" class="flex items-center gap-1 flex-wrap"></div>
      </div>
    </div>

    <div id="hud-desktop" class="absolute bottom-3 inset-x-3 flex flex-wrap gap-3 items-end justify-between font-pixel text-[10px] pointer-events-none hud-desktop-only">
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 min-w-[220px]">
        <div class="text-white/70 mb-1">Aktiver Spieler</div>
        <div id="hud-active" class="text-tw-accent text-sm">P1</div>
        <div class="mt-2">Winkel: <span id="hud-angle" class="text-emerald-400">90°</span></div>
        <div>Stärke: <span id="hud-power" class="text-emerald-400">50</span></div>
        <div class="mt-2 text-white/70">Waffe</div>
        <div id="hud-weapon" class="text-tw-accent">● Standard ×∞</div>
      </div>
      <div id="hud-players" class="bg-tw-panel/80 border border-white/10 rounded p-3 max-w-md flex flex-col gap-1"></div>
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 text-white/70 max-w-md desktop-only">
        <div class="text-white mb-1">Steuerung</div>
        <div>Pfeile Winkel/Stärke · Shift = fein</div>
        <div>Leertaste = Feuer · Tab/E = Waffe · Q = zurück</div>
        <div id="hud-status" class="text-emerald-400 mt-2">—</div>
      </div>
    </div>
  </div>

  <div id="screen-banner" class="screen hidden flex items-center justify-center px-4">
    <div class="bg-tw-panel/95 border border-white/20 rounded-lg px-6 py-5 text-center font-pixel shadow-2xl max-w-md w-full">
      <div id="banner-title" class="text-lg md:text-2xl text-tw-accent">—</div>
      <div id="banner-sub" class="text-[10px] text-white/70 mt-2 leading-relaxed">—</div>
      <button id="btn-banner-continue"
        class="hidden mt-4 font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded shadow active:bg-yellow-300 transition w-full">
        Weiter
      </button>
    </div>
  </div>

  <div id="screen-shop" class="screen hidden flex items-center justify-center bg-black/60 overflow-auto">
    <div class="bg-tw-panel border border-white/20 rounded-lg p-5 max-w-5xl w-[95%] max-h-[92vh] flex flex-col">
      <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div class="font-pixel text-xl text-tw-accent">Shop</div>
        <div id="shop-header" class="font-pixel text-xs text-tw-accent">—</div>
      </div>
      <div id="shop-player-tabs" class="flex flex-wrap gap-2 mb-4"></div>
      <div id="shop-grid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 overflow-auto"></div>
      <div class="flex justify-end mt-4">
        <button id="btn-shop-continue"
          class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded hover:bg-yellow-300 transition">
          Nächste Runde
        </button>
      </div>
    </div>
  </div>

  <div id="touch-controls" class="hidden absolute inset-x-0 bottom-0 pointer-events-none z-10">
    <div class="flex justify-between items-end p-3 gap-2">
      <div class="flex flex-col gap-2 pointer-events-auto bg-tw-panel/85 border border-white/10 rounded px-2 py-2 max-w-[40%]">
        <div class="font-pixel text-[8px] text-white/70 flex items-center justify-between gap-2">
          <span>Zoom</span>
          <span id="zoom-label" class="text-tw-accent">1.0×</span>
        </div>
        <input id="zoom-slider" type="range" min="1" max="4" step="0.1" value="1"
          class="w-full accent-tw-accent" style="touch-action:manipulation" />
        <div id="touch-hint" class="font-pixel text-[8px] text-white/60 leading-tight transition-opacity duration-700">
          Tippen + ziehen aufs Feld zum Zielen.<br>2 Finger zum Verschieben.
        </div>
      </div>
      <div class="flex items-end gap-2 pointer-events-auto">
        <button id="touch-weapon"
          class="font-pixel text-[10px] bg-tw-panel/80 border border-white/20 text-white px-3 py-3 rounded shadow-lg active:bg-tw-panel">
          Waffe ▸
        </button>
        <button id="touch-fire"
          class="font-pixel text-sm bg-tw-accent text-tw-bg px-7 py-5 rounded-full shadow-lg active:bg-yellow-300 active:scale-95 transition">
          FEUER
        </button>
      </div>
    </div>
  </div>

  <div id="screen-pause" class="screen hidden flex items-center justify-center bg-black/60">
    <div class="bg-tw-panel border border-white/20 rounded-lg p-6 max-w-sm w-[90%] text-center flex flex-col gap-3">
      <div class="font-pixel text-xl text-tw-accent">Pause</div>
      <button id="btn-resume"
        class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded hover:bg-yellow-300 transition">
        Weiter
      </button>
      <button id="btn-pause-menu"
        class="font-pixel text-[10px] bg-tw-panel/60 hover:bg-tw-panel text-white px-4 py-2 rounded border border-white/20">
        Hauptmenü (Spielstand verwerfen)
      </button>
      <div class="font-pixel text-[9px] text-white/40 mt-2">ESC schließt die Pause</div>
    </div>
  </div>

  <div id="screen-gameover" class="screen hidden flex items-center justify-center bg-black/60">
    <div class="bg-tw-panel border border-white/20 rounded-lg p-6 max-w-md w-[90%] text-center">
      <div class="font-pixel text-2xl text-tw-accent mb-3">Spiel vorbei</div>
      <div id="gameover-content" class="font-pixel text-[10px] text-white/80 mb-6 leading-relaxed">—</div>
      <button id="btn-back-menu"
        class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded hover:bg-yellow-300 transition">
        Hauptmenü
      </button>
    </div>
  </div>
`;

const game = new Game();
initTouchControls(game);
game.start();

// Debug-Hook (auch in Prod nuetzlich, ist <50 Bytes).
if (typeof window !== 'undefined') window.__game = game;
