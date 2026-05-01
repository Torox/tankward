/**
 * ChainHop: zeitversetzter Carve-Impuls fuer CRI (Chain Reaction Inducer).
 * Wird in game.effects[] eingereiht und tickt seinen delay runter; sobald
 * delay <= 0, setzt er fired=true und game._updateEffects fuehrt den Carve
 * + Particles aus.
 */
export class ChainHop {
  constructor({ x, y, radius, delay, shake = 0, noSmooth = false }) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.delay = delay;
    this.shake = shake;
    this.noSmooth = noSmooth;
    this.alive = true;
    this.fired = false;
  }
  update(dt) {
    if (this.fired) return [];
    this.delay -= dt;
    if (this.delay <= 0) this.fired = true;
    return [];
  }
}
