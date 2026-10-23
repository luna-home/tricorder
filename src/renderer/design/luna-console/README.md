# Luna Console (Kopie)

Kopie des Designsystems Luna Console aus `luna-design-system`
(`~/workspace/luna/luna-design-system`), Stand **`ff6aae1d6825960256f5743660585a6f14039266`**
(„Deploy showcase to docs.kuckelsberg.de“, 2026-10-21).

Kopiert: `tokens.json`, `tokens.css`, `theme.css`, `components.css`, `vue/*`, `AGENTS.design.md`.

Einzige Abweichung vom Original: Die erste Zeile von `components.css` (Google-Fonts-Import für
Antonio) ist entfernt. Die App läuft offline; Antonio kommt aus `@fontsource/antonio`
(400/600/700), importiert in `src/renderer/main.ts`.

Die Dateien hier nicht von Hand ändern. Fehlt eine Komponente, entsteht sie zuerst unter
`src/renderer/components/` und geht danach als Beitrag an `luna-design-system`. Ein Update
heißt: Dateien neu kopieren, den Font-Import wieder entfernen und den Commit-Hash oben anpassen.
