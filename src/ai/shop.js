import { WEAPONS, WEAPON_ORDER } from '../entities/weapons.js';

/**
 * KI-Einkaufsstrategien — abhaengig von der KI-Stufe.
 *
 * Beim Beginnen jeder Shop-Phase werden alle KI-Tanks durch ihre Einkaufslogik
 * geschickt; die Funktion gibt die gekauften Waffen-IDs zurueck (in
 * Reihenfolge), damit der Shop-Bildschirm sie auflisten kann.
 *
 * @param {import('../entities/tank.js').Tank} tank
 * @param {'beginner'|'pro'|'expert'} difficulty
 * @returns {string[]} Liste gekaufter Waffen-IDs (kann mehrfach dieselbe enthalten)
 */
export function aiBuyWeapons(tank, difficulty) {
  const purchases = [];
  const buyOne = (id) => {
    const w = WEAPONS[id];
    if (!w || w.unlimited) return false;
    if (tank.credits < w.price) return false;
    tank.credits -= w.price;
    tank.inventory.set(id, (tank.inventory.get(id) ?? 0) + 1);
    purchases.push(id);
    return true;
  };
  const stockOf = (id) => tank.inventory.get(id) ?? 0;

  if (difficulty === 'beginner') {
    // 60% Chance, ueberhaupt was zu kaufen. Random aus 3 guenstigsten erschwinglichen.
    if (Math.random() < 0.6) {
      const cheap = WEAPON_ORDER
        .map((id) => WEAPONS[id])
        .filter((w) => !w.unlimited && w.price <= tank.credits)
        .sort((a, b) => a.price - b.price)
        .slice(0, 3);
      if (cheap.length) {
        const pick = cheap[Math.floor(Math.random() * cheap.length)];
        buyOne(pick.id);
      }
    }
    return purchases;
  }

  if (difficulty === 'pro') {
    // Stockpile mid-tier: Heavy + Cluster, gelegentlich Roller.
    // Hoechstens 3 Stueck pro Waffentyp anhaeufen, Stop wenn unter 500 Credits.
    const targets = ['heavy', 'cluster', 'roller', 'driller'];
    let safety = 8;
    while (safety-- > 0 && tank.credits >= WEAPONS.heavy.price) {
      let bought = false;
      for (const id of targets) {
        if (stockOf(id) >= 3) continue;
        if (tank.credits >= WEAPONS[id].price) {
          buyOne(id);
          bought = true;
          break;
        }
      }
      if (!bought) break;
    }
    return purchases;
  }

  // expert
  // Stufe 1: Atombombe wenn leistbar (eine pro Match-Reserve aufbauen).
  if (tank.credits >= WEAPONS.nuke.price && stockOf('nuke') < 1) buyOne('nuke');

  // Stufe 2: MIRV bis 2 Stueck.
  while (tank.credits >= WEAPONS.mirv.price && stockOf('mirv') < 2) {
    if (!buyOne('mirv')) break;
  }
  // Stufe 3: Tunnelbohrer + Heavy stockpilen.
  while (tank.credits >= WEAPONS.driller.price && stockOf('driller') < 2) {
    if (!buyOne('driller')) break;
  }
  while (tank.credits >= WEAPONS.heavy.price && stockOf('heavy') < 4) {
    if (!buyOne('heavy')) break;
  }
  // Stufe 4: Cluster und Roller als Polster.
  while (tank.credits >= WEAPONS.cluster.price && stockOf('cluster') < 4) {
    if (!buyOne('cluster')) break;
  }
  while (tank.credits >= WEAPONS.roller.price && stockOf('roller') < 4) {
    if (!buyOne('roller')) break;
  }

  return purchases;
}

/**
 * Aggregiert eine Liste von Waffen-IDs zu "2× Heavy · 1× Cluster"-Form.
 * @param {string[]} purchases
 */
export function summarizePurchases(purchases) {
  if (!purchases || purchases.length === 0) return 'nichts gekauft';
  const counts = new Map();
  for (const id of purchases) counts.set(id, (counts.get(id) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([id, n]) => `${n}× ${WEAPONS[id]?.name ?? id}`)
    .join(' · ');
}
