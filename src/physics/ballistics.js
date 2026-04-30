import { CONFIG } from '../core/config.js';

/**
 * Konvertiert die Spieler-Staerke (0..100) in eine Anfangsgeschwindigkeit (px/s).
 * v0 max = 900 px/s ergibt mit gravity=600 eine maximale Reichweite v0²/g = 1350 px,
 * was selbst auf breiten Monitoren ueber den ganzen Frame reicht.
 */
export function powerToVelocity(power) {
  return power * 9;
}

/**
 * Wind in [-10..+10] (Skalar, Vorzeichen = Richtung) in horizontale Beschleunigung
 * (px/s²) umrechnen. Wert 10 -> 80 px/s² — ueber 2-3 s Flugzeit deutlich sichtbar,
 * aber nicht uebermaechtig.
 */
export function windToAcceleration(wind) {
  return wind * 8;
}

/**
 * Generiert eine zufaellige Wind-Staerke pro Runde.
 * @param {() => number} rng
 * @returns {number} -10..+10 (mit 1 Nachkommastelle)
 */
export function generateWind(rng) {
  return Math.round((rng() * 20 - 10) * 10) / 10;
}

/**
 * Initiale Geschwindigkeitsvektoren aus Winkel (Grad) + Staerke (0..100).
 * Canvas-Konvention: +y nach unten -> sin negieren, damit "oben" auf dem Bildschirm
 * positiv ist.
 */
export function muzzleVelocity(angleDeg, power) {
  const v = powerToVelocity(power);
  const rad = (angleDeg * Math.PI) / 180;
  return {
    vx: Math.cos(rad) * v,
    vy: -Math.sin(rad) * v
  };
}

export const GRAVITY = CONFIG.world.gravity;
