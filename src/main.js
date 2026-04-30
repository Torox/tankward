import './style.css';
import { Game } from './core/game.js';

/**
 * Bootstrap. Baut die DOM-Overlays (Menue, HUD, Banner, Shop, Game-Over),
 * uebergibt die Steuerung dann an Game (State-Machine + Render-Loop).
 */

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="game-canvas"></canvas>

  <div id="screen-menu" class="screen flex flex-col items-center justify-center gap-6 text-center px-6">
    <h1 class="font-pixel text-3xl md:text-5xl text-tw-accent drop-shadow-lg">TANK WARS</h1>
    <p class="font-pixel text-[10px] md:text-xs text-white/70 max-w-md leading-relaxed">
      Hot-Seat-Artillery im Browser. Hommage an den DOS-Klassiker.
    </p>
    <button id="btn-start"
      class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded shadow hover:bg-yellow-300 transition">
      Neues Spiel
    </button>
    <div class="font-pixel text-[10px] text-white/40 max-w-sm">
      ← → Winkel · ↑ ↓ Stärke · Shift = fein · Leertaste = Feuer · Tab = Skip
    </div>
    <div class="font-pixel text-[9px] text-white/30">v0.6 — Schritt 6/11</div>
  </div>

  <div id="screen-hud" class="hidden">
    <div class="absolute top-3 right-3 flex gap-2">
      <button id="btn-pause"
        class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
        Menü
      </button>
    </div>
    <div class="absolute bottom-3 inset-x-3 flex flex-wrap gap-3 items-end justify-between font-pixel text-[10px] pointer-events-none">
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 min-w-[200px]">
        <div class="text-white/70 mb-1">Aktiver Spieler</div>
        <div id="hud-active" class="text-tw-accent text-sm">P1</div>
        <div class="mt-2">Winkel: <span id="hud-angle" class="text-emerald-400">90°</span></div>
        <div>Stärke: <span id="hud-power" class="text-emerald-400">50</span></div>
      </div>
      <div id="hud-players" class="bg-tw-panel/80 border border-white/10 rounded p-3 max-w-md flex flex-col gap-1"></div>
      <div class="bg-tw-panel/80 border border-white/10 rounded p-3 text-white/70 max-w-md">
        <div class="text-white mb-1">Steuerung</div>
        <div>← → Winkel · ↑ ↓ Stärke · Shift = fein</div>
        <div>Leertaste = Feuer · Tab = Skip</div>
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

  <div id="screen-shop" class="screen hidden flex items-center justify-center bg-black/50">
    <div class="bg-tw-panel border border-white/20 rounded-lg p-6 max-w-2xl w-[90%]">
      <div class="font-pixel text-xl text-tw-accent mb-3">Shop</div>
      <p class="font-pixel text-[10px] text-white/70 mb-6 leading-relaxed">
        Waffen-Sortiment kommt in Schritt 7. Erstmal: Bestaetigen, um zur naechsten Runde zu starten.
      </p>
      <div class="flex justify-end">
        <button id="btn-shop-continue"
          class="font-pixel text-sm bg-tw-accent text-tw-bg px-6 py-3 rounded hover:bg-yellow-300 transition">
          Nächste Runde
        </button>
      </div>
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
