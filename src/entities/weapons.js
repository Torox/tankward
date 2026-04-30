/**
 * Waffen-Katalog (Spec-Tabelle aus dem Briefing).
 * Datenobjekte; die eigentliche Logik (Apex-Split, Rollen, Bohren, Napalm)
 * orchestriert Game (siehe game.js: _handleImpact, _updateRolling, _updateDrilling, _splitAtApex, _spawnNapalm).
 *
 * Numerische Werte sind Tuning-Parameter — Aenderungen koennen sich stark
 * auf das Spielgefuehl auswirken.
 */
export const WEAPONS = {
  standard: {
    id: 'standard',
    name: 'Standard-Granate',
    price: 0,
    unlimited: true,
    blastRadius: 35,
    damage: 25,
    color: '#fbbf24',
    icon: '●',
    desc: 'Solide Standardwaffe. Unbegrenzt verfügbar.'
  },
  heavy: {
    id: 'heavy',
    name: 'Schwere Granate',
    price: 500,
    blastRadius: 60,
    damage: 50,
    color: '#f97316',
    icon: '◉',
    desc: 'Größerer Sprengradius, doppelter Schaden.'
  },
  cluster: {
    id: 'cluster',
    name: 'Streubombe',
    price: 1000,
    blastRadius: 25,
    damage: 30,
    splitOnApex: 3,
    splitSpread: 100,
    color: '#a3e635',
    icon: '※',
    desc: 'Teilt sich am Apex in 3 Submunitionen.'
  },
  napalm: {
    id: 'napalm',
    name: 'Napalm',
    price: 1500,
    blastRadius: 50,
    damage: 15,
    napalm: {
      blobCount: 7,
      blobSpreadX: 70,
      tickDamage: 15,
      ticks: 5,
      tickInterval: 0.4, // s zwischen Ticks
      radius: 22
    },
    color: '#ef4444',
    icon: '🔥',
    desc: 'Flächenbrand über 5 Ticks (15 Schaden je Tick).'
  },
  roller: {
    id: 'roller',
    name: 'Roller',
    price: 800,
    blastRadius: 25,
    damage: 40,
    rollOnImpact: { friction: 60, gravityFactor: 0.7, maxRollTime: 4 },
    color: '#9ca3af',
    icon: '○',
    desc: 'Rollt nach Aufschlag den Hang hinab.'
  },
  driller: {
    id: 'driller',
    name: 'Tunnelbohrer',
    price: 1200,
    blastRadius: 45,
    damage: 60,
    drillOnImpact: { distance: 80, speed: 90 },
    color: '#78350f',
    icon: '✦',
    desc: 'Gräbt sich 80 px tief ein, dann Detonation.'
  },
  mirv: {
    id: 'mirv',
    name: 'MIRV',
    price: 2500,
    blastRadius: 30,
    damage: 35,
    splitOnApex: 5,
    splitSpread: 160,
    color: '#22d3ee',
    icon: '✸',
    desc: 'Spaltet sich am Apex in 5 Sprengköpfe.'
  },
  nuke: {
    id: 'nuke',
    name: 'Atombombe',
    price: 5000,
    blastRadius: 120,
    damage: 100,
    shake: { magnitude: 18, duration: 0.7 },
    color: '#fde047',
    icon: '☢',
    desc: 'Massiver Schaden + Schockwelle.'
  }
};

export const WEAPON_ORDER = [
  'standard',
  'heavy',
  'cluster',
  'napalm',
  'roller',
  'driller',
  'mirv',
  'nuke'
];

/** Darf in der naechsten Runde verfuegbar sein, wenn vorhanden? Standard=unbegrenzt. */
export function canFire(tank, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w) return false;
  if (w.unlimited) return true;
  return (tank.inventory.get(weaponId) ?? 0) > 0;
}

export function consume(tank, weaponId) {
  const w = WEAPONS[weaponId];
  if (!w || w.unlimited) return;
  const n = tank.inventory.get(weaponId) ?? 0;
  if (n > 0) tank.inventory.set(weaponId, n - 1);
}
