import './style.css';

/**
 * Schritt 1 — Setup-Smoke-Test.
 * Spaeter wird hier die zentrale Bootstrap-Logik (StateMachine -> MENU) sitzen.
 */

const app = document.getElementById('app');
app.innerHTML = `
  <canvas id="game-canvas"></canvas>
  <div class="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
    <h1 class="font-pixel text-2xl md:text-4xl text-tw-accent drop-shadow">TANK WARS</h1>
  </div>
  <div class="absolute inset-x-0 bottom-8 flex justify-center pointer-events-none">
    <p id="boot-status" class="font-pixel text-[10px] md:text-xs text-emerald-400">
      Schritt 1/11 — Vite + Tailwind + Canvas online.
    </p>
  </div>
`;

const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById('game-canvas'));
const ctx = canvas.getContext('2d');

let cssWidth = 0;
let cssHeight = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cssWidth = window.innerWidth;
  cssHeight = window.innerHeight;
  canvas.width = Math.floor(cssWidth * dpr);
  canvas.height = Math.floor(cssHeight * dpr);
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// Smoke-Test-Render: Verlauf + bewegter Marker, damit man im Dev-Server Frame-by-Frame-Loop sieht.
let t0 = performance.now();
function frame(now) {
  const t = (now - t0) / 1000;
  const grad = ctx.createLinearGradient(0, 0, 0, cssHeight);
  grad.addColorStop(0, '#1e293b');
  grad.addColorStop(1, '#0b1220');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const cx = cssWidth / 2 + Math.cos(t) * 80;
  const cy = cssHeight / 2 + Math.sin(t * 1.3) * 40;
  ctx.fillStyle = '#fbbf24';
  ctx.beginPath();
  ctx.arc(cx, cy, 6, 0, Math.PI * 2);
  ctx.fill();

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

console.info('[tankward] boot ok');
