# Tank Wars

Browserbasierte Hommage an den Artillery-Klassiker (DOS, 1986).
Vanilla JS + HTML5 Canvas + Vite + TailwindCSS — kein Backend, kein Framework.

## Status

In Entwicklung. Schrittweise nach Plan (siehe `docs/PLAN.md` bzw. Commit-Historie).

| Schritt | Thema                              | Status   |
|--------:|------------------------------------|----------|
| 1       | Projekt-Setup                      | ✅       |
| 2       | Canvas-Renderer + Terrain          | offen    |
| 3       | Panzer-Entity + Eingabe            | offen    |
| 4       | Ballistik + Wind + Projektil       | offen    |
| 5       | Kollision + Terrain-Zerstoerung    | offen    |
| 6       | Rundenmanagement + Game States     | offen    |
| 7       | Waffen-System + Shop               | offen    |
| 8       | KI-Gegner                          | offen    |
| 9       | HUD + Menues + Sound               | offen    |
| 10      | Polish (Partikel, Shake, Mobile)   | offen    |
| 11      | README + Deployment                | offen    |

## Setup

```bash
npm install
npm run dev      # Dev-Server (Hot-Reload)
npm run build    # Produktions-Build nach dist/
npm run preview  # Build lokal anschauen
```

Erfordert Node.js 18+ und npm.

## Projektstruktur

```
src/
  core/        Game Loop, State Management
  entities/    Tank, Projectile, Terrain
  physics/     Ballistik, Wind, Kollision
  rendering/   Canvas-Renderer, Partikel
  ui/          HUD, Menues, Shop
  audio/       Sound-Manager
  ai/          Computergegner-Logik
```

## Steuerung (geplant)

- ← → : Winkel anpassen (Shift = feinere Schritte)
- ↑ ↓ : Stärke anpassen
- Tab : Waffe wechseln
- Leertaste : Schiessen
- ESC : Pausenmenue

## Lizenz

Privat / TBD.
