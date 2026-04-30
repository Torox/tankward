# Tank Wars

Browserbasierte Hommage an den Artillery-Klassiker (DOS, 1986). Hot-Seat-Spiel
für 2–10 Panzer, prozedurales Terrain, 8 Waffen, KI-Gegner, kein Backend.

**Stack:** Vanilla JavaScript (ES2020) · HTML5 Canvas · Vite 5 · TailwindCSS 3 ·
Web Audio API · LocalStorage. Keine Runtime-Dependencies.

## Quickstart

```bash
npm install
npm run dev      # Dev-Server auf http://localhost:5173 (Hot-Reload)
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal anschauen
```

Erfordert Node.js 18+ und npm.

## Features

- **Prozedurales Terrain** aus überlagerten Sinus-Oktaven, pro Pixel zerstörbar
  via Krater-Carving in der Heightmap
- **Realistische Ballistik** mit Schwerkraft + zufälligem Seitenwind je Runde,
  Substep-Pixel-Kollision (kein Tunneling bei hoher Geschwindigkeit)
- **8 Waffen:** Standard-Granate, Schwere Granate, Streubombe (Apex-Split ×3),
  Napalm (Tickschaden), Roller (folgt Hangneigung), Tunnelbohrer, MIRV (Apex-
  Split ×5), Atombombe (Schockwelle + Screen-Shake)
- **3 KI-Schwierigkeitsstufen:** Anfänger (±30° Streuung), Profi (±5°), Pro
  (lernt aus letztem Schussfehler) — alle mit numerischer Ballistik-Suche
- **Credit-System:** 1¢ pro HP-Schaden, 200¢ Kill-Bonus, 250¢ Survival-Bonus,
  zwischen Runden im Shop ausgeben
- **Game States:** MENU → ROUND_START → PLAYER_TURN → PROJECTILE_FLYING → IMPACT
  → ROUND_END → SHOP → GAME_OVER mit Best-of-3/5/7-Logik (rechnerischer
  Match-Sieger wird früher erkannt)
- **Polish:** Partikel-System (Funken, Schutt, Rauch, Tank-Tod), Screen-Shake
  skaliert mit Blast-Radius, drei Sky-Presets (Tag/Sonnenuntergang/Nacht) je Runde
- **Sound:** Web-Audio-synthetisierte Effekte (Schuss variiert pro Waffe,
  Explosion mit Filter-Sweep + Sub-Rumble bei großen Detonationen),
  optionale loopable Chip-Bass-Hintergrundmusik
- **Mobile:** Touch-Joystick + Feuer-Button, automatisch aktiv auf
  coarse-Pointer-Geräten (Phone/Tablet)
- **Persistenz:** Settings (Sound, Musik, Spielanzahl, Stufe, Best-of) via
  `localStorage` mit In-Memory-Fallback

## Steuerung

| Aktion | Tasten |
|---|---|
| Winkel anpassen | ← → (Shift = fein) |
| Stärke anpassen | ↑ ↓ (Shift = fein) |
| Schießen | Leertaste |
| Waffe wechseln | Tab oder E (Q = zurück) |
| Pause | ESC |

Auf Mobile: Joystick links für Winkel/Power, FEUER-Button rechts.

## Projektstruktur

```
src/
├─ core/
│  ├─ game.js         Game-Klasse + State Machine
│  ├─ loop.js         requestAnimationFrame mit dt-Cap
│  ├─ input.js        Keyboard-Manager (isDown / consume)
│  ├─ rng.js          Mulberry32 PRNG (seedable)
│  ├─ config.js       Tuning-Konstanten
│  └─ settings.js     localStorage-Persistenz
├─ entities/
│  ├─ tank.js         Tank-Klasse + Spawn-Verteilung
│  ├─ terrain.js      Heightmap + carve()
│  ├─ projectile.js   Geschoss mit mode (flying/rolling/drilling)
│  ├─ fire-blob.js    Napalm-Brandeffekt
│  └─ weapons.js      Waffen-Katalog (8 Stück)
├─ physics/
│  ├─ ballistics.js   v0/Wind-Mapping, generateWind, muzzleVelocity
│  └─ collision.js    Substep-Hit-Test, applyBlast, settleTanks
├─ rendering/
│  ├─ renderer.js     Canvas-Layer + Screen-Shake + drawTank/drawProjectile/…
│  └─ particles.js    Partikel-System (Cap 1200)
├─ ai/
│  └─ ai.js           AiController mit Ballistik-Solver + Lernfeedback
├─ audio/
│  └─ sound.js        Web-Audio-Synthese (Schuss / Explosion / UI / Musik)
├─ ui/
│  └─ touch.js        Mobile-Touch-Bindings
├─ style.css          Tailwind-Direktiven + Layout-Helper
└─ main.js            Bootstrap (DOM-Overlays + Game starten)
```

## Architektur-Notizen

- **Welt-Koordinatensystem:** Logische CSS-Pixel; der Renderer skaliert auf
  `devicePixelRatio` (gecappt bei 2). Y-Achse zeigt nach unten (Canvas-Konvention).
- **Game-Loop:** `requestAnimationFrame` mit Delta-Time-Cap auf 50 ms (verhindert
  Riesensprung-Simulation nach Tab-Switch).
- **Persistente Tanks:** Inventory + Credits leben über die ganze Match-Dauer;
  HP/Position werden je Runde resettet. So funktioniert der Shop sinnvoll.
- **Sub-Projektile + Effekte:** Streubombe/MIRV werfen Kindprojektile, Napalm
  erzeugt FireBlob-Effekte. IMPACT wird erst betreten, wenn alles ausgelaufen ist.
- **Krater-Modell:** Heightmap repräsentiert nur die oberste Bodenoberfläche; das
  Spiel hat folglich keine Tunnel/Hohlräume. Tunnelbohrer löst das visuell durch
  fortlaufende kleine Krater entlang der Bohrachse.

## Deployment

Statisches `dist/`-Verzeichnis nach `npm run build` — auf jedem Static-Host
deploybar.

### Netlify

`netlify.toml` ist im Root: build command `npm run build`, publish `dist/`.
„Deploy from Git" oder `netlify deploy --prod`.

### Vercel

`vercel.json` ist im Root mit `outputDirectory: "dist"`. Im Vercel-Dashboard
das Repo verbinden — Framework-Erkennung schlägt Vite vor; Defaults passen.

### GitHub Pages

```bash
npm run build
# dist/ als gh-pages-Branch pushen, z.B. via:
npx gh-pages -d dist
```

Wichtig: `vite.config.js` hat `base: './'`, damit relative Pfade auf jedem
Subpfad funktionieren.

### Selbst hosten

`dist/` mit jedem statischen Server ausliefern (Caddy, nginx, `python -m http.server`,
`npx serve dist`). Kein Server-Side-Code nötig.

## Lizenz

Privat / TBD.
