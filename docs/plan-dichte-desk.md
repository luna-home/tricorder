# Plan: Dichte „desk“ für Luna Console

Stand 2026-10-23. Entschieden mit Patrick: Auslöser `pointer: fine` plus Override, Faktor ~0,7,
erst Prototyp in Tricorder, dann Upstream in `luna-design-system`.

## Problem

Luna Console stammt aus `luna-monitor`, einem Touch-Panel. Alle Maße sind Fingermaße (Nav 50px,
Option 58px, Control-Row 64px, Label 22px, Uhr 68px). Auf einem Desktop mit Maus oder Trackpad
wirkt die Oberfläche dadurch zu groß: Bei 1280×800 belegen Kopf und Rahmen ~200px, ein
Logbuch-Eintrag braucht ~230px Höhe, auf die Startseite passen nur wenige Kacheln.

## Konzept

Zwei Dichten, dieselbe Gestalt:

| Dichte | Wann | Maße |
| --- | --- | --- |
| `touch` (Standard) | Touch-Panel, `pointer: coarse` | wie bisher |
| `desk` | `@media (pointer: fine)`, also Maus oder Trackpad | ~0,7 |

- Override: `data-lc-density="touch"` oder `"desk"` an `<html>` (oder an einem Container)
  erzwingt eine Dichte, unabhängig vom Zeiger.
- Umgesetzt allein über CSS-Variablen: Desk definiert die Größen-Tokens neu, die Komponenten
  lesen nur Variablen. Farben, Regeln und Formensprache bleiben gleich.
- Unverändert bleiben `space-1` (4px, die Strukturlücke), `radius-segment`, die 2px-Trennlinie,
  der 3px-Fokusrahmen und `breakpoint-compact` (640px).

### Werte desk

Rahmen am 2026-10-24 schmaler gezogen: Die Rail trägt nur noch START und die Dienste.

| Token | touch | desk |
| --- | --- | --- |
| Typo clock / title / readout | 68 / 58 / 46 | 34 / 30 / 30 |
| Typo tile / button / nav | 30 / 24 / 22 | 20 / 17 / 16 |
| Typo label / status / elbow / code | 22 / 20 / 18 / 16 | 16 / 14 / 13 / 12 |
| rail-width / elbow-width | 150 / 210 | 80 / 116 |
| rail / elbow compact | 100 / 140 | 64 / 88 |
| Elbow-Höhe oben / unten | 104 / 70 | 60 / 40 |
| bar-height | 14 | 8 |
| nav / option / control | 50 / 58 / 64 | 34 / 36 / 40 |
| segmentbar / tile | 90 / 103 | 56 / 72 |
| radius elbow / elbow-inner | 56 / 26 | 40 / 18 |
| radius option / pill / tile / dot | 29 / 32 / 36 / 6 | 18 / 20 / 24 / 4 |
| space-2-5 / 3 / 4-5 / 5 / 8 | 10 / 12 / 18 / 20 / 32 | 8 / 8 / 12 / 14 / 24 |

Kleinste Klickziele in desk: 34px (Nav), 36px (Option, Eingabefeld). Das liegt deutlich über
der Mindestgröße von 24px aus WCAG 2.5.8.

## Phase 1: Prototyp in Tricorder

Status 2026-10-23: umgesetzt und geprüft (type-check, lint, 196 Unit-Tests, 5 e2e-Tests,
Screenshots bei 1280×800, 1000×680 und 600×640). Werte wie in der Tabelle oben.

Die Kopie unter `src/renderer/design/luna-console/` bleibt unangetastet.

1. `src/renderer/assets/density.css` (nach `components.css` und `type.css` importiert):
   desk-Block einmal unter `@media (pointer: fine) { :root:not([data-lc-density='touch']) }`
   und einmal unter `[data-lc-density='desk']`. Der Block definiert die Tokens neu und
   überschreibt die literalen Schriftgrößen und Höhen in `components.css` (Nav, Button, Option,
   Tile, Elbow, Readout, Status, Notice, Panel-Kopf, Grid-Zeilen, Compact-Frame).
2. `type.css`: `lc-type-*` lesen `--type-*`-Variablen statt Literale; dadurch zieht die
   App-Typo automatisch mit.
3. Die Lower-Elbow-Höhe (`:height="70"` inline in `LcPanel.vue`) wird im Prototyp per
   `!important` überschrieben. Upstream entfällt das.
4. App-eigene Stellen prüfen: `field.css` (folgt den Tokens), `EntryFormView` (`minmax(280px)`),
   macOS-Ampeln auf dem kleineren oberen Elbow, Drag-Leiste, Fenster-Standardgröße 1280×800
   (bleibt vorerst so).
5. Prüfung: Screenshots (1280×800, 1000×680, <640px compact) vorher/nachher, dazu
   `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`. Neuer e2e-Check: die
   Nav-Höhe ist in der Electron-App 34px, mit `data-lc-density="touch"` 50px.
6. Werte nach Durchsicht der Screenshots mit Patrick feinjustieren.

## Phase 2: Upstream `luna-design-system`

1. `tokens.json` (Version 2): Typo-Stile, Layout, Radius und Abstand bekommen einen Wert je
   Dichte (`density: { touch, desk }`), dazu Abschnitt `density` mit Auslöser und Override.
2. `tokens.css`: `--type-*`-Variablen, dazu der desk-Block (Media Query + Attribut).
3. `components.css`: alle literalen Größen durch Variablen ersetzen; Elbow-Höhen als
   `--elbow-upper-height` / `--elbow-lower-height`, Panel-Zeilen daraus berechnen.
4. `LcPanel.vue` / `LcElbow.vue`: Höhe aus CSS statt inline-px.
5. Showcase `index.html`: Umschalter touch/desk. `AGENTS.design.md`: Regel zur Dichte.
6. Commit in `luna-design-system` nur mit OK.
7. Danach in Tricorder neu kopieren, `density.css` löschen, `type.css` auf die
   Upstream-Variablen umstellen, Hash in der README der Kopie anpassen, CLAUDE.md (Abschnitt
   UI-Designsystem) um die Dichte ergänzen, Prüfung wie in Phase 1.
