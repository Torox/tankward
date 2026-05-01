/**
 * Globale Spielkonstanten. Eine zentrale Stelle, damit Tuning-Parameter nicht durch
 * den Code wandern. Werte sind so gewaehlt, dass sie sich auf einem 1280x720-Frame
 * "richtig" anfuehlen — Renderer skaliert ueber Canvas-DPR, Logik bleibt CSS-pixel-basiert.
 */
export const CONFIG = {
  world: {
    // Logische Aufloesung (CSS-Pixel). Renderer skaliert auf devicePixelRatio.
    minWidth: 800,
    minHeight: 480,
    gravity: 600, // px/s^2 — gefuehlt "richtig" fuer Standard-Schussweiten
    // Referenz-Breite fuer Physik-Skalierung. Bei Welt-Breite > Referenz wird
    // v0_max proportional sqrt(world/ref) skaliert, damit Reichweite in
    // groesseren Welten weiterhin "die andere Seite" trifft.
    referenceWidth: 1280,
    // Welt-Presets — Spieler waehlt im Hauptmenue.
    presets: {
      klein:  { width: 1280, label: 'Klein' },
      mittel: { width: 2000, label: 'Mittel' },
      gross:  { width: 3000, label: 'Groß' },
      riesig: { width: 4200, label: 'Riesig' }
    }
  },

  terrain: {
    sampleStep: 1, // 1 Heightmap-Sample pro Pixel (genug fuer Pixel-Krater)
    // Hoehe der Bodenlinie als Anteil der Canvas-Hoehe (0 = oben, 1 = unten)
    baselineFraction: 0.65,
    // Wie stark sich die Hoehenkurve um die Baseline herum bewegt (in Pixel)
    amplitude: 140,
    // Wieviele ueberlagerte Sinus-Oktaven
    octaves: 4,
    // Farben
    surfaceColor: '#7cb342',  // Gras-Top
    earthTopColor: '#8b6f47', // Erde direkt unter dem Gras
    earthBotColor: '#3d2b1a', // Erde tief
    grassBandHeight: 6        // Pixel Gras-Band oberhalb der Erde
  },

  sky: {
    // Mehrere Skies, pro Runde wechselnd. Renderer waehlt per index.
    presets: [
      { name: 'Tag', top: '#1e3a8a', mid: '#60a5fa', bot: '#bae6fd' },
      { name: 'Sonnenuntergang', top: '#1e1b4b', mid: '#f97316', bot: '#fde68a' },
      { name: 'Nacht', top: '#020617', mid: '#1e293b', bot: '#334155' }
    ]
  }
};
