import { WEAPONS, canFire } from '../entities/weapons.js';
import { TANK_BODY_HEIGHT } from '../entities/tank.js';
import { CHARACTERS, resolveCharacter } from './characters.js';

/**
 * Backward-Compat-Konstanten. Werden noch von Settings/UI referenziert.
 * Ab Phase 3 ersetzen Charaktere die 3 Stufen — DIFFICULTY mappt auf einen
 * konkreten Charakter via resolveCharacter().
 */
export const DIFFICULTY = Object.freeze({
  beginner: 'beginner',
  pro: 'pro',
  expert: 'expert'
});

const AIM_SPEED_DEG_PER_S = 90;
// Power-Range 0..1000 (Tank-Wars-3.2-Style); Speed entsprechend skaliert.
const POWER_SPEED_PER_S = 700;

/**
 * AiController orchestriert den KI-Zug:
 *   - waehlt Ziel (schwaechster Tank)
 *   - waehlt Waffe (priorisiert nach character.weaponTier)
 *   - delegiert das Aiming an den Charakter (siehe characters.js)
 *   - animiert Turret + Power Richtung Ziel-Aim und feuert beim Erreichen
 */
export class AiController {
  /**
   * @param {import('../entities/tank.js').Tank} tank
   * @param {string} characterIdOrLegacy  Charakter-ID, 'random' oder Legacy-Difficulty.
   */
  constructor(tank, characterIdOrLegacy = 'rifleman') {
    this.tank = tank;
    // Charakter wird beim Construct fixiert. 'random' wuerfelt einmal pro Tank.
    this.character = resolveCharacter(characterIdOrLegacy);
    // Backward-Compat: difficulty-Field bleibt, gemappt aus weaponTier.
    this.difficulty = ['beginner', 'pro', 'expert'][this.character.weaponTier] || 'pro';
    this.state = 'idle';
    this.aim = { angle: 90, power: 500 };
    this.targetTank = null;
    /** Letzter Schuss-Errorvektor (target - hit). */
    this.lastError = null;
  }

  /** Wird beim Eintritt in PLAYER_TURN aufgerufen, wenn der Panzer ein KI-Panzer ist. */
  beginTurn(game) {
    if (!this.tank.alive) return;
    this.state = 'aiming';
    this.aimStart = performance.now();

    const enemies = game.tanks.filter((t) => t.alive && t !== this.tank);
    if (enemies.length === 0) {
      this.state = 'firing';
      return;
    }

    this.targetTank = this._pickTarget(enemies);
    this.tank.selectedWeapon = this._pickWeapon(game);

    // Charakter berechnet Aim-Solution (incl. eigener Jitter + Schwaeche).
    this.aim = this.character.solve(this.tank, this.targetTank, game);
    // Defensiv: Power-Cap respektieren, falls der Charakter danebenliegt.
    if (this.aim.power > this.tank.powerMax) this.aim.power = this.tank.powerMax;
  }

  /**
   * Pro Frame: animiert den Turm langsam zur Zielloesung. Wenn dort: feuert.
   * @param {number} dt
   * @param {() => void} fire
   */
  update(dt, fire) {
    if (this.state !== 'aiming') return;
    const t = this.tank;

    // Wenn das Ziel ueber dem eigenen Power-Cap liegt (z.B. weil der Tank
    // zwischendurch Schaden bekam), aim.power runterclampen.
    if (this.aim.power > t.powerMax) this.aim.power = t.powerMax;

    const dA = this.aim.angle - t.turretAngle;
    const dP = this.aim.power - t.power;
    if (Math.abs(dA) > 0.4) {
      const step = Math.sign(dA) * Math.min(Math.abs(dA), AIM_SPEED_DEG_PER_S * dt);
      t.adjustAngle(step);
    }
    if (Math.abs(dP) > 4) {
      const step = Math.sign(dP) * Math.min(Math.abs(dP), POWER_SPEED_PER_S * dt);
      t.adjustPower(step);
    }
    if (Math.abs(dA) < 0.4 && Math.abs(dP) < 4) {
      this.state = 'firing';
      fire();
      return;
    }

    // Safety-Net: nach 4 Sekunden Aimen ohne Konvergenz einfach feuern.
    if (this.aimStart && performance.now() - this.aimStart > 4000) {
      this.state = 'firing';
      fire();
    }
  }

  /** Hook fuer Lerneffekt. Game ruft das nach IMPACT auf. */
  recordImpact(impactX, impactY) {
    if (!this.targetTank) return;
    const tx = this.targetTank.x;
    const ty = this.targetTank.y - TANK_BODY_HEIGHT / 2 - 4;
    this.lastError = { dx: tx - impactX, dy: ty - impactY };
  }

  // -- Internals -------------------------------------------------------------

  _pickTarget(enemies) {
    // Schwaechsten zuerst, bei Gleichstand naechsten.
    enemies.sort((a, b) => {
      if (a.hp !== b.hp) return a.hp - b.hp;
      return Math.abs(a.x - this.tank.x) - Math.abs(b.x - this.tank.x);
    });
    return enemies[0];
  }

  _pickWeapon(game) {
    // Spezialwaffen einsetzen abhaengig vom Waffen-Tier des Charakters.
    // Tier 0 (Mr. Stupid): nutzt selten Spezialwaffen
    // Tier 1 (Lobber/Rifleman/...): mittlere Wahrscheinlichkeit
    // Tier 2 (Wind Master): immer wenn vorhanden
    const t = this.tank;
    const allowed = new Set(game?._packWeaponIds?.() ?? Object.keys(WEAPONS));
    const priority = [
      'nuke', 'death-head', 'funky-bomb', 'meteor', 'baby-nuke', 'mirv', 'quake-large',
      'railgun', 'heat-seeker', 'cruise-missile', 'scatter-shot',
      'driller', 'quake-medium',
      'dirt-explosive', 'heavy',
      'quake-small', 'cluster', 'roller', 'sonic', 'napalm',
      'standard'
    ];
    const tier = this.character.weaponTier ?? 1;
    for (const id of priority) {
      if (!allowed.has(id)) continue;
      if (canFire(t, id)) {
        const w = WEAPONS[id];
        if (w.unlimited) continue;
        if (tier >= 2) return id;
        if (tier === 1 && Math.random() < 0.5) return id;
        if (tier === 0 && Math.random() < 0.2) return id;
      }
    }
    return 'standard';
  }
}
