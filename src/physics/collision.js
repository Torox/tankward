import { TANK_BODY_HEIGHT, TANK_BODY_WIDTH } from '../entities/tank.js';

/**
 * Substep-Kollision entlang der Bewegungsstrecke (prev -> current).
 * Returnt das ERSTE Hit (Tank oder Terrain) oder null.
 *
 * Tanks: AABB ueber Body+Turm.
 * Terrain: pixelgenau via terrain.isSolid.
 *
 * @param {import('../entities/projectile.js').Projectile} projectile
 * @param {number} prevX
 * @param {number} prevY
 * @param {import('../entities/terrain.js').Terrain} terrain
 * @param {import('../entities/tank.js').Tank[]} tanks
 * @returns {{type:'tank'|'terrain', x:number, y:number, tank?:import('../entities/tank.js').Tank}|null}
 */
export function checkProjectileImpact(projectile, prevX, prevY, terrain, tanks) {
  const dx = projectile.x - prevX;
  const dy = projectile.y - prevY;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist));
  const stepX = dx / steps;
  const stepY = dy / steps;

  let x = prevX;
  let y = prevY;
  for (let i = 1; i <= steps; i++) {
    x += stepX;
    y += stepY;

    // Self-Hit am Spawn ignorieren (Projektil startet am Rohrende, das sehr nah am Owner ist).
    const ignoreOwner = projectile.age < 0.12;

    for (const tank of tanks) {
      if (!tank.alive) continue;
      if (ignoreOwner && tank.id === projectile.ownerId) continue;
      if (hitsTankBox(x, y, tank)) {
        return { type: 'tank', tank, x, y };
      }
    }
    if (terrain.isSolid(x, y)) {
      return { type: 'terrain', x, y };
    }
  }
  return null;
}

/** AABB-Test gegen Body + Turm-Halbkreis (vereinfacht als Box). */
function hitsTankBox(x, y, tank) {
  const halfW = TANK_BODY_WIDTH / 2 + 2;
  const left = tank.x - halfW;
  const right = tank.x + halfW;
  const trackH = 4;
  const turretR = 8;
  const top = tank.y - trackH - TANK_BODY_HEIGHT - turretR;
  const bottom = tank.y;
  return x >= left && x <= right && y >= top && y <= bottom;
}

/**
 * Wendet Sprengschaden auf alle Panzer im Radius an (lineares Falloff).
 * Direkter Treffer (Distanz=0) -> baseDamage. Rand des Kraters -> 0.
 *
 * @param {{x:number,y:number}} impact
 * @param {import('../entities/tank.js').Tank[]} tanks
 * @param {number} blastRadius
 * @param {number} baseDamage
 * @returns {{tank: import('../entities/tank.js').Tank, dmg: number}[]}
 */
export function applyBlast(impact, tanks, blastRadius, baseDamage) {
  const hits = [];
  for (const tank of tanks) {
    if (!tank.alive) continue;
    const cx = tank.x;
    const cy = tank.y - TANK_BODY_HEIGHT / 2 - 4; // Body-Mitte
    const d = Math.hypot(cx - impact.x, cy - impact.y);
    if (d > blastRadius) continue;
    const dmg = Math.max(0, Math.round(baseDamage * (1 - d / blastRadius)));
    if (dmg > 0) {
      tank.takeDamage(dmg);
      hits.push({ tank, dmg });
    }
  }
  return hits;
}

/**
 * Sturzschaden-Tuning: ab welcher Falldistanz beginnt Schaden, und wie viel
 * HP pro Pixel. Aus 30 px Sturz -> 0 HP, aus 80 px -> ~12 HP, aus 150 px -> ~30 HP.
 */
const FALL_DAMAGE_THRESHOLD_PX = 30;
const FALL_DAMAGE_PER_PX = 0.25;

/**
 * Nach Terrain-Aenderung: Panzer fallen auf die neue Oberflaeche, wenn diese
 * unter dem alten y liegt (Krater unter Panzer). Steigt das Terrain (passiert
 * normalerweise nicht in einem Krater-Modell), bleibt der Panzer wo er ist.
 *
 * Sturz > FALL_DAMAGE_THRESHOLD_PX wirkt Schaden — Tank-Wars-3.2-Mechanik.
 * Der Crumble-/CRI-Combo (Boden wegsprengen, Tank stuerzen) bekommt damit
 * echtes taktisches Gewicht statt nur kosmetischem Re-Settle.
 *
 * @param {import('../entities/tank.js').Tank[]} tanks
 * @param {import('../entities/terrain.js').Terrain} terrain
 */
export function settleTanks(tanks, terrain) {
  for (const tank of tanks) {
    if (!tank.alive) continue;
    const newY = terrain.surfaceY(tank.x);
    if (newY > tank.y) {
      const fallDist = newY - tank.y;
      tank.y = newY;
      if (fallDist > FALL_DAMAGE_THRESHOLD_PX) {
        const dmg = Math.round((fallDist - FALL_DAMAGE_THRESHOLD_PX) * FALL_DAMAGE_PER_PX);
        if (dmg > 0) tank.takeDamage(dmg);
      }
    }
    // Faellt der Panzer aus dem Frame -> tot.
    if (tank.y >= terrain.height - 2) {
      tank.takeDamage(tank.hp);
    }
  }
}
