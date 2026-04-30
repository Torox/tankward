import './style.css';
import { Renderer } from './rendering/renderer.js';
import { Terrain } from './entities/terrain.js';
import { startLoop } from './core/loop.js';
import { createRng } from './core/rng.js';

/**
 * Bootstrap fuer Schritt 2: Renderer + prozedurales Terrain.
 * Step-Loop zeichnet Sky + Terrain. Spaeter (Schritt 3+) kommen Tanks/Projektile dazu.
 */

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="game-canvas"></canvas>
  <div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none">
    <h1 class="font-pixel text-lg md:text-2xl text-tw-accent drop-shadow">TANK WARS</h1>
  </div>
  <div class="absolute top-3 right-3 flex gap-2 pointer-events-auto">
    <button id="btn-regen"
      class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
      Neue Karte
    </button>
    <button id="btn-sky"
      class="font-pixel text-[10px] bg-tw-panel/80 hover:bg-tw-panel text-white px-3 py-2 rounded border border-white/10">
      Sky wechseln
    </button>
  </div>
  <div class="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none">
    <p id="boot-status" class="font-pixel text-[10px] text-emerald-400">
      Schritt 2/11 — Renderer + Terrain online.
    </p>
  </div>
`;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const renderer = new Renderer(canvas);

let seed = (Math.random() * 1e9) >>> 0;
let rng = createRng(seed);
let skyIndex = 0;
let terrain = new Terrain(renderer.width, renderer.height, rng);

function regen() {
  seed = (Math.random() * 1e9) >>> 0;
  rng = createRng(seed);
  terrain = new Terrain(renderer.width, renderer.height, rng);
}

document.getElementById('btn-regen').addEventListener('click', () => regen());
document.getElementById('btn-sky').addEventListener('click', () => {
  skyIndex = (skyIndex + 1) % 3;
});

// Bei Resize: Terrain auf neue Breite anpassen.
let lastWidth = renderer.width;
let lastHeight = renderer.height;
window.addEventListener('resize', () => {
  if (renderer.width !== lastWidth || renderer.height !== lastHeight) {
    lastWidth = renderer.width;
    lastHeight = renderer.height;
    terrain = new Terrain(renderer.width, renderer.height, createRng(seed));
  }
});

// FPS-Tracking direkt in der Loop, damit nicht zwei rAFs parallel laufen.
const status = document.getElementById('boot-status');
let frameCount = 0;
let fpsT0 = performance.now();

startLoop((dt, now) => {
  renderer.drawSky(skyIndex);
  renderer.drawTerrain(terrain);

  frameCount++;
  if (now - fpsT0 >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - fpsT0));
    status.textContent = `Schritt 2/11 — Renderer + Terrain. ${fps} fps · seed ${seed}`;
    frameCount = 0;
    fpsT0 = now;
  }
});
