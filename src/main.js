import './style.css';
import { Game } from './core/game.js';

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

    <div class="font-pixel text-[10px] text-white/40 max-w-sm leading-relaxed">
      ← → Winkel · ↑ ↓ Stärke · Shift = fein<br>
      Leertaste = Feuer · Tab/E = Waffe · Q = Waffe zurück · ESC = Pause
    </div>
    <div class="font-pixel text-[9px] text-white/30">v0.9 — Schritt 9/11</div>
  </div>

  <div id="screen-hud" class="hidden">
    <div class="absolute top-3 right-3 flex gap-2">
      <button id="btn-pause"
        class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
        Menü
      </button>
    </div>
    <div class="absolute bottom-3 inset-x-3 flex flex-wrap gap-3 items-end justify-between font-pixel text-[10px] pointer-events-none">
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 min-w-[220px]">
        <div class="text-white/70 mb-1">Aktiver Spieler</div>
        <div id="hud-active" class="text-tw-accent text-sm">P1</div>
        <div class="mt-2">Winkel: <span id="hud-angle" class="text-emerald-400">90°</span></div>
        <div>Stärke: <span id="hud-power" class="text-emerald-400">50</span></div>
        <div class="mt-2 text-white/70">Waffe</div>
        <div id="hud-weapon" class="text-tw-accent">● Standard ×∞</div>
      </div>
      <div id="hud-players" class="bg-tw-panel/80 border border-white/10 rounded p-3 max-w-md flex flex-col gap-1"></div>
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 text-white/70 max-w-md">
        <div class="text-white mb-1">Steuerung</div>
        <div>← → Winkel · ↑ ↓ Stärke · Shift = fein</div>
        <div>Leertaste = Feuer · Tab/E = Waffe · Q = zurück</div>
        <div id="hud-status" class="text-emerald-400 mt-2">—</div>
      </div>
    </div>
  </div>

  <div id="screen-banner" class="screen hidden flex items-center justify-center">
    <div class="bg-tw-panel/90 border border-white/20 rounded-lg px-8 py-6 text-center font-pixel shadow-2xl">
      <div id="banner-title" class="text-2xl text-tw-accent">—</div>
      <div id="banner-sub" class="text-[10px] text-white/70 mt-2">—</div>
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
game.start();
