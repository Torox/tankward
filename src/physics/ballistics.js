import { CONFIG } from '../core/config.js';

/**
 * Welt-abhaengiger Skalierungsfaktor fuer v0. Wird beim Rundenstart von Game
 * via setPhysicsScale(worldWidth) gesetzt, damit groessere Welten weiterhin
 * "die andere Seite" erreichen.
 *
 * Mathematik: Reichweite = v0²/g bei 45°. Wenn v0 mit sqrt(world/ref) skaliert,
 * skaliert die Reichweite linear mit der Weltbreite — exakt was wir wollen.
 */
let _velocityScale = 1;

export function setPhysicsScale(worldWidth) {
  _velocityScale = Math.sqrt(worldWidth / CONFIG.world.referenceWidth);
}

export function getPhysicsScale() {
  return _velocityScale;
}

/**
 * Konvertiert die Spieler-Staerke (0..100) in eine Anfangsgeschwindigkeit (px/s).
 * Skaliert mit der Welt-Groesse.
 */
export function powerToVelocity(power) {
  return power * 9 * _velocityScale;
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
