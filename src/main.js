import './style.css';
import { Renderer } from './rendering/renderer.js';
import { Terrain } from './entities/terrain.js';
import { Tank, TANK_COLORS, pickSpawnPositions } from './entities/tank.js';
import { Projectile } from './entities/projectile.js';
import { generateWind, muzzleVelocity } from './physics/ballistics.js';
import { startLoop } from './core/loop.js';
import { createRng } from './core/rng.js';
import { Input } from './core/input.js';

/**
 * Bootstrap fuer Schritt 4: Ballistik + Wind + Projektile.
 * Pro Frame: max. 1 Projektil; "Treffer/Zerstoerung" kommt in Schritt 5.
 */

const NUM_TANKS = 4;
const PLAYER_NAMES = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8', 'P9', 'P10'];

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="game-canvas"></canvas>

  <div class="absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-2">
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

  <div id="hud-bottom" class="absolute bottom-3 inset-x-3 flex flex-wrap gap-3 items-end justify-between font-pixel text-[10px] pointer-events-none">
    <div class="bg-tw-panel/80 border border-white/10 rounded p-3 min-w-[200px]">
      <div class="text-white/70 mb-1">Aktiver Spieler</div>
      <div id="hud-active" class="text-tw-accent text-sm">P1</div>
      <div class="mt-2">Winkel: <span id="hud-angle" class="text-emerald-400">90°</span></div>
      <div>Stärke: <span id="hud-power" class="text-emerald-400">50</span></div>
    </div>
    <div class="bg-tw-panel/80 border border-white/10 rounded p-3 text-white/70 max-w-md">
      <div class="text-white mb-1">Steuerung</div>
      <div>← → Winkel · ↑ ↓ Stärke · Shift = fein</div>
      <div>Leertaste = Feuer · N = nächster Panzer</div>
      <div id="boot-status" class="text-emerald-400 mt-2">Schritt 4/11 — Ballistik + Wind online.</div>
    </div>
  </div>
`;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const renderer = new Renderer(canvas);
const input = new Input();

let seed = (Math.random() * 1e9) >>> 0;
let rng = createRng(seed);
let skyIndex = 0;
let wind = 0;
let terrain;
/** @type {Tank[]} */
let tanks = [];
let activeIndex = 0;
/** @type {Projectile|null} */
let projectile = null;

function spawnRound() {
  rng = createRng(seed);
  terrain = new Terrain(renderer.width, renderer.height, rng);
  wind = generateWind(rng);
  const xs = pickSpawnPositions(NUM_TANKS, renderer.width, rng);
  tanks = xs.map((x, i) => {
    const t = new Tank({
      id: PLAYER_NAMES[i],
      name: PLAYER_NAMES[i],
      color: TANK_COLORS[i % TANK_COLORS.length],
      x
    });
    t.snapToTerrain(terrain);
    return t;
  });
  activeIndex = 0;
  projectile = null;
}

function regen() {
  seed = (Math.random() * 1e9) >>> 0;
  spawnRound();
}

function nextActiveTank() {
  for (let i = 0; i < tanks.length; i++) {
    activeIndex = (activeIndex + 1) % tanks.length;
    if (tanks[activeIndex].alive) return;
  }
}

function fire() {
  const t = tanks[activeIndex];
  if (!t || !t.alive) return;
  const tip = t.turretTip();
  const { vx, vy } = muzzleVelocity(t.turretAngle, t.power);
  projectile = new Projectile({
    x: tip.x,
    y: tip.y,
    vx,
    vy,
    ownerId: t.id
  });
}

spawnRound();

document.getElementById('btn-regen').addEventListener('click', () => regen());
document.getElementById('btn-sky').addEventListener('click', () => {
  skyIndex = (skyIndex + 1) % 3;
});

let lastWidth = renderer.width;
let lastHeight = renderer.height;
window.addEventListener('resize', () => {
  if (renderer.width !== lastWidth || renderer.height !== lastHeight) {
    lastWidth = renderer.width;
    lastHeight = renderer.height;
    spawnRound();
  }
});

const hudActive = document.getElementById('hud-active');
const hudAngle = document.getElementById('hud-angle');
const hudPower = document.getElementById('hud-power');
const status = document.getElementById('boot-status');

let frameCount = 0;
let fpsT0 = performance.now();

startLoop((dt, now) => {
  const active = tanks[activeIndex];
  const inputLocked = !!projectile;

  // Steuerung nur, wenn kein Projektil unterwegs.
  if (!inputLocked && active && active.alive) {
    const fine = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const angleSpeed = (fine ? 15 : 60) * dt;
    const powerSpeed = (fine ? 12 : 40) * dt;

    if (input.isDown('ArrowLeft')) active.adjustAngle(angleSpeed);
    if (input.isDown('ArrowRight')) active.adjustAngle(-angleSpeed);
    if (input.isDown('ArrowUp')) active.adjustPower(powerSpeed);
    if (input.isDown('ArrowDown')) active.adjustPower(-powerSpeed);

    if (input.consume('Space')) fire();
    if (input.consume('KeyN') || input.consume('Tab')) nextActiveTank();
  } else {
    // Pressed-Buffer trotzdem leeren, damit Tasten nicht "queued" bleiben.
    input.consume('Space');
    input.consume('KeyN');
    input.consume('Tab');
  }

  // Projektil-Update.
  if (projectile) {
    projectile.update(dt, wind, { width: renderer.width, height: renderer.height });
    // Vorlaeufiger Treffer-Stub: bei Boden-Y -> tot. Echte Kollision in Schritt 5.
    if (projectile.y >= terrain.surfaceY(projectile.x)) {
      projectile.alive = false;
    }
    if (!projectile.alive) {
      projectile = null;
      // Naechster Spieler ist provisorisch dran.
      nextActiveTank();
    }
  }

  // Render.
  renderer.drawSky(skyIndex);
  renderer.drawTerrain(terrain);
  for (let i = 0; i < tanks.length; i++) {
    renderer.drawTank(tanks[i], i === activeIndex && !inputLocked, now);
  }
  if (projectile) renderer.drawProjectile(projectile);
  renderer.drawWindIndicator(wind);

  // HUD.
  if (active) {
    hudActive.textContent = active.name + (inputLocked ? ' (im Flug)' : '');
    hudActive.style.color = active.color;
    hudAngle.textContent = `${Math.round(active.turretAngle)}°`;
    hudPower.textContent = `${Math.round(active.power)}`;
  }

  // FPS.
  frameCount++;
  if (now - fpsT0 >= 500) {
    const fps = Math.round((frameCount * 1000) / (now - fpsT0));
    status.textContent = `Schritt 4/11 · ${fps} fps · seed ${seed} · Wind ${wind}`;
    frameCount = 0;
    fpsT0 = now;
  }

  input.endFrame();
});
