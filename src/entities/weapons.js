/**
 * Waffen-Katalog.
 *
 * Der Katalog mischt die Kultnamen aus dem originalen Tank-Wars-Umfeld
 * (Missile, Scatter Shot, Cruise Missile, MIRV, Nuke) mit bereits erfundenen
 * Tankward-Waffen (Streubombe, Napalm, Roller, Tunnelbohrer, Erdbeben, ...)
 * und neuen Ideen fuer kuenftige Waffenpacks.
 */
/**
 * Pseudo-Masse je Waffe — beeinflusst Kinetik-Bonus bei Direkttreffern und
 * Penetrations-Tiefe ins Terrain. Skala: 1 = leicht, 30 = brutal.
 *
 * caseHardness regelt, wie tief die Granate sich ins Erdreich bohrt bevor sie
 * detoniert: 0 = detoniert sofort beim Aufprall, 1 = Standard, >1 = AP-aehnlich.
 */
export const WEAPONS = {
  standard: {
    id: 'standard',
    name: 'Missile',
    price: 0,
    unlimited: true,
    blastRadius: 35,
    damage: 25,
    mass: 4,
    caseHardness: 1.0,
    color: '#fbbf24',
    icon: '●',
    desc: 'Klassischer Standard-Schuss. Unbegrenzt verfügbar.'
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
  'scatter-shot': {
    id: 'scatter-shot',
    name: 'Scatter Shot',
    price: 900,
    blastRadius: 22,
    damage: 24,
    mass: 3,
    caseHardness: 0.35,
    splitOnApex: 7,
    splitSpread: 210,
    color: '#bef264',
    icon: '✣',
    desc: 'Kultwaffe: streut sieben kleine Sprengköpfe über ein breites Gebiet.'
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
      tickInterval: 0.4,
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
    caseHardness: 0.0,
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
    caseHardness: 0.0,
    drillOnImpact: { distance: 80, speed: 90 },
    color: '#78350f',
    icon: '✦',
    desc: 'Gräbt sich 80 px tief ein, dann Detonation.'
  },
  'cruise-missile': {
    id: 'cruise-missile',
    name: 'Cruise Missile',
    price: 1800,
    blastRadius: 48,
    damage: 55,
    mass: 6,
    caseHardness: 0.8,
    homing: { turnRate: 1.6, acquireRange: 900, maxAge: 4.5 },
    windFactor: 0.35,
    color: '#38bdf8',
    icon: '➤',
    desc: 'Kultwaffe mit sanfter Zielsuche und reduzierter Windanfälligkeit.'
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
  'baby-nuke': {
    id: 'baby-nuke',
    name: 'Baby Nuke',
    price: 3200,
    blastRadius: 85,
    damage: 75,
    mass: 18,
    caseHardness: 1.2,
    shake: { magnitude: 12, duration: 0.45 },
    color: '#fde68a',
    icon: '☢',
    desc: 'Kleinere Nuke für frühere Runden — brutal, aber nicht final.'
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
      initialRadius: 32,
      cracks: 6,
      crackSpacing: 70,
      crackRadius: 10,
      crackDepth: 35,
      stepDelay: 0.06,
      shakePerCrack: 4.0
    },
    color: '#a78bfa',
    icon: '⌇',
    desc: 'Erdbeben — Risse öffnen sich vom Epizentrum aus.'
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
      initialRadius: 42,
      cracks: 10,
      crackSpacing: 80,
      crackRadius: 12,
      crackDepth: 50,
      stepDelay: 0.07,
      shakePerCrack: 5.0
    },
    color: '#8b5cf6',
    icon: '⌇',
    desc: 'Mittleres Erdbeben — tiefere Risse über größere Reichweite.'
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
      initialRadius: 52,
      cracks: 16,
      crackSpacing: 90,
      crackRadius: 14,
      crackDepth: 70,
      stepDelay: 0.08,
      shakePerCrack: 6.0
    },
    color: '#6d28d9',
    icon: '⌇',
    desc: 'Großes Erdbeben — verheerende Risse durch das halbe Spielfeld.'
  },
  'funky-bomb': {
    id: 'funky-bomb',
    name: 'Funky Bomb',
    price: 3400,
    blastRadius: 24,
    damage: 34,
    mass: 7,
    caseHardness: 0.3,
    splitOnApex: 9,
    splitSpread: 260,
    color: '#f472b6',
    icon: '✺',
    desc: 'Neue Idee mit Retro-Flair: chaotischer Split aus neun bunten Ladungen.'
  },
  'death-head': {
    id: 'death-head',
    name: 'Death’s Head',
    price: 4200,
    blastRadius: 28,
    damage: 40,
    mass: 12,
    caseHardness: 0.5,
    splitOnApex: 11,
    splitSpread: 310,
    shake: { magnitude: 10, duration: 0.4 },
    color: '#f9a8d4',
    icon: '☠',
    desc: 'Endgame-Splitwaffe: viele Sprengköpfe, große Streuung, hoher Druck.'
  },
  railgun: {
    id: 'railgun',
    name: 'Railgun',
    price: 2600,
    blastRadius: 18,
    damage: 85,
    mass: 16,
    caseHardness: 2.2,
    pierceAlways: true,
    windFactor: 0.1,
    color: '#e5e7eb',
    icon: '━',
    desc: 'Neue Präzisionswaffe: kleiner Krater, hoher Direkttreffer-Schaden.'
  },
  'heat-seeker': {
    id: 'heat-seeker',
    name: 'Heat Seeker',
    price: 2200,
    blastRadius: 38,
    damage: 45,
    mass: 5,
    caseHardness: 0.7,
    homing: { turnRate: 2.4, acquireRange: 700, maxAge: 3.5 },
    windFactor: 0.5,
    color: '#fb7185',
    icon: '◆',
    desc: 'Neue Zielsucher-Rakete: korrigiert in der Luft Richtung nächstem Gegner.'
  },
  meteor: {
    id: 'meteor',
    name: 'Meteor',
    price: 3000,
    blastRadius: 70,
    damage: 65,
    mass: 22,
    caseHardness: 1.8,
    shake: { magnitude: 14, duration: 0.5 },
    color: '#fb923c',
    icon: '☄',
    desc: 'Schwerer Einschlag mit tiefem Krater und starkem Screen-Shake.'
  },
  nuke: {
    id: 'nuke',
    name: 'Nuke',
    price: 5000,
    blastRadius: 120,
    damage: 100,
    mass: 30,
    caseHardness: 1.5,
    shake: { magnitude: 18, duration: 0.7 },
    color: '#fde047',
    icon: '☢',
    desc: 'Massiver Schaden + Schockwelle.'
  }
};

export const WEAPON_ORDER = [
  'standard',
  'heavy',
  'scatter-shot',
  'cluster',
  'napalm',
  'roller',
  'driller',
  'cruise-missile',
  'mirv',
  'baby-nuke',
  'dirt-small',
  'dirt-medium',
  'dirt-large',
  'dirt-explosive',
  'sonic',
  'quake-small',
  'quake-medium',
  'quake-large',
  'funky-bomb',
  'death-head',
  'railgun',
  'heat-seeker',
  'meteor',
  'nuke'
];

export const BUILT_IN_WEAPON_PACKS = {
  original: {
    id: 'original',
    name: 'Original / Kult',
    desc: 'Fokus auf die historischen Tank-Wars-Kultnamen.',
    weapons: ['standard', 'scatter-shot', 'cruise-missile', 'mirv', 'baby-nuke', 'nuke']
  },
  tankward: {
    id: 'tankward',
    name: 'Tankward',
    desc: 'Die bereits erfundenen Tankward-Waffen plus Utility-Terrain.',
    weapons: ['standard', 'heavy', 'cluster', 'napalm', 'roller', 'driller', 'dirt-small', 'dirt-medium', 'dirt-large', 'dirt-explosive', 'sonic', 'quake-small', 'quake-medium', 'quake-large', 'nuke']
  },
  chaos: {
    id: 'chaos',
    name: 'Chaos Lab',
    desc: 'Neue Ideen und späte Endgame-Waffen.',
    weapons: ['standard', 'scatter-shot', 'cruise-missile', 'funky-bomb', 'death-head', 'railgun', 'heat-seeker', 'meteor', 'baby-nuke', 'nuke']
  },
  'classic-plus': {
    id: 'classic-plus',
    name: 'Classic+',
    desc: 'Alles: Original, Tankward und neue Ideen.',
    weapons: WEAPON_ORDER
  }
};

export function normalizeWeaponIds(ids) {
  const seen = new Set();
  const result = [];
  for (const id of ['standard', ...(ids ?? [])]) {
    if (!WEAPONS[id] || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return WEAPON_ORDER.filter((id) => seen.has(id));
}

export function allWeaponPacks(customPacks = []) {
  const custom = {};
  for (const pack of customPacks ?? []) {
    if (!pack?.id || !pack?.name) continue;
    custom[pack.id] = {
      id: pack.id,
      name: pack.name,
      desc: pack.desc || 'Eigenes Waffenpack',
      weapons: normalizeWeaponIds(pack.weapons)
    };
  }
  return { ...BUILT_IN_WEAPON_PACKS, ...custom };
}

export function packWeaponIds(packId, customPacks = []) {
  const packs = allWeaponPacks(customPacks);
  return normalizeWeaponIds((packs[packId] ?? packs['classic-plus']).weapons);
}

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
