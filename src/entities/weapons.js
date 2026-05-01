/**
 * Waffen-Katalog (Spec-Tabelle aus dem Briefing).
 * Datenobjekte; die eigentliche Logik (Apex-Split, Rollen, Bohren, Napalm)
 * orchestriert Game (siehe game.js: _handleImpact, _updateRolling, _updateDrilling, _splitAtApex, _spawnNapalm).
 *
 * Numerische Werte sind Tuning-Parameter — Aenderungen koennen sich stark
 * auf das Spielgefuehl auswirken.
 */
/**
 * Pseudo-Masse je Waffe — beeinflusst Kinetik-Bonus bei Direkttreffern und
 * (ab Phase 1.2) Penetrations-Tiefe ins Terrain. Skala: 1 = leicht, 30 = brutal.
 *
 * caseHardness (Phase 1.2) regelt, wie tief die Granate sich ins Erdreich bohrt
 * bevor sie detoniert: 0 = detoniert sofort beim Aufprall, 1 = Standard,
 * >1 = AP-aehnlich. Default 1.0 fuer alle, individuell tunbar.
 */
export const WEAPONS = {
  standard: {
    id: 'standard',
    name: 'Standard-Granate',
    price: 0,
    unlimited: true,
    blastRadius: 35,
    damage: 25,
    mass: 4,
    caseHardness: 1.0,
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
    mass: 10,
    caseHardness: 1.0,
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
    mass: 3,
    caseHardness: 0.4,
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
    mass: 5,
    caseHardness: 0.6,
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
    mass: 6,
    caseHardness: 0.0, // rollt — bohrt nie
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
    mass: 8,
    caseHardness: 0.0, // hat eigene drill-Logik mit fester Distanz
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
    mass: 5,
    caseHardness: 0.4,
    splitOnApex: 5,
    splitSpread: 160,
    color: '#22d3ee',
    icon: '✸',
    desc: 'Spaltet sich am Apex in 5 Sprengköpfe.'
  },
  'dirt-small': {
    id: 'dirt-small',
    name: 'Erdwurf klein',
    price: 300,
    blastRadius: 0,
    damage: 0,
    mass: 5,
    caseHardness: 0,
    dirtFill: { radius: 50, height: 40 },
    color: '#a16207',
    icon: '▲',
    desc: 'Schüttet kleinen Erdhügel auf.'
  },
  'dirt-medium': {
    id: 'dirt-medium',
    name: 'Erdwurf mittel',
    price: 600,
    blastRadius: 0,
    damage: 0,
    mass: 8,
    caseHardness: 0,
    dirtFill: { radius: 80, height: 65 },
    color: '#92400e',
    icon: '▲',
    desc: 'Mittelgroßer Erdhügel — guter Sichtblock.'
  },
  'dirt-large': {
    id: 'dirt-large',
    name: 'Erdwurf groß',
    price: 1100,
    blastRadius: 0,
    damage: 0,
    mass: 12,
    caseHardness: 0,
    dirtFill: { radius: 120, height: 100 },
    color: '#78350f',
    icon: '▲',
    desc: 'Massiver Erdwall — Bunker.'
  },
  'dirt-explosive': {
    id: 'dirt-explosive',
    name: 'Erdwurf explosiv',
    price: 1800,
    blastRadius: 50,
    damage: 25,
    mass: 10,
    caseHardness: 0.4,
    dirtFill: { radius: 140, height: 80 },
    color: '#dc2626',
    icon: '▲',
    desc: 'Explosion + massiver Erdwall radial.'
  },
  sonic: {
    id: 'sonic',
    name: 'Sonic Blaster',
    price: 1400,
    blastRadius: 0,
    damage: 0,
    mass: 2,
    caseHardness: 0,
    sonicWave: { smoothPercent: 100, sweepPasses: 3 },
    color: '#22d3ee',
    icon: '≈',
    desc: 'Kollabiert instabiles Terrain weltweit.'
  },
  'quake-small': {
    id: 'quake-small',
    name: 'Erdbeben klein',
    price: 900,
    blastRadius: 0,
    damage: 0,
    mass: 4,
    caseHardness: 0.2,
    earthquake: {
      initialRadius: 28,
      hopsPerSide: 8,
      stepDist: 30,
      falloff: 0.92,
      stepDelay: 0.05,
      yJitter: 6
    },
    color: '#a78bfa',
    icon: '⌇',
    desc: 'Kleines Erdbeben — Riss reißt nach beiden Seiten auf.'
  },
  'quake-medium': {
    id: 'quake-medium',
    name: 'Erdbeben mittel',
    price: 1700,
    blastRadius: 0,
    damage: 0,
    mass: 5,
    caseHardness: 0.2,
    earthquake: {
      initialRadius: 36,
      hopsPerSide: 14,
      stepDist: 35,
      falloff: 0.93,
      stepDelay: 0.06,
      yJitter: 8
    },
    color: '#8b5cf6',
    icon: '⌇',
    desc: 'Mittleres Erdbeben — Riss-Front mit langer Reichweite.'
  },
  'quake-large': {
    id: 'quake-large',
    name: 'Erdbeben groß',
    price: 2800,
    blastRadius: 0,
    damage: 0,
    mass: 6,
    caseHardness: 0.2,
    earthquake: {
      initialRadius: 44,
      hopsPerSide: 22,
      stepDist: 40,
      falloff: 0.95,
      stepDelay: 0.07,
      yJitter: 10
    },
    color: '#6d28d9',
    icon: '⌇',
    desc: 'Großes Erdbeben — verheerender Riss durch das halbe Spielfeld.'
  },
  nuke: {
    id: 'nuke',
    name: 'Atombombe',
    price: 5000,
    blastRadius: 120,
    damage: 100,
    mass: 30,
    caseHardness: 1.5, // schweres Gehaeuse, bohrt sich tief ein
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
  'dirt-small',
  'dirt-medium',
  'dirt-large',
  'dirt-explosive',
  'sonic',
  'quake-small',
  'quake-medium',
  'quake-large',
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
