/**
 * Frame-Loop mit Delta-Time. Capped delta auf 50ms, damit ein Tab-Switch keine
 * Riesen-Sprung-Simulation ausloest, sobald das Spiel zurueckkehrt.
 *
 * @param {(dt: number, now: number) => void} step
 */
export function startLoop(step) {
  let last = performance.now();
  let raf = 0;

  const tick = (now) => {
    const dtMs = Math.min(50, now - last);
    last = now;
    step(dtMs / 1000, now);
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => cancelAnimationFrame(raf);
}
