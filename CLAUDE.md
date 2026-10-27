# Tricorder

Luna-Desktop-Client in Electron (macOS und Windows). Eine Plattform für fest eingebaute
**Client-Dienste**: lokale Werkzeuge (zuerst `logbuch`), Zugang zu Luna Home und
Hintergrunddienste, die im Tray weiterlaufen. Der verbindliche Plan steht in `docs/plan.md`.

Daneben liegt das Python-CLI `bin/logbuch` (SQLite, befüllt von den Claude-Code-Hooks in
`hooks/`, Tests in `tests/`). Tabellen `entries` und `pins` (höchstens 4 angeheftete Themen,
`logbuch anheften` / `loesen`, `fertig` löst den Pin); Freitext mit Spiegelstrichen (`- `). Es ist die **Quelle der Wahrheit** für die logbuch-Semantik.
`~/bin/logbuch` ist ein Symlink auf `bin/logbuch`: die Datei nie verschieben oder umbenennen.

## Stack

| Schicht | Wahl |
| --- | --- |
| Desktop | Electron 45, gebaut mit `electron-vite` 6, verpackt mit `electron-builder` |
| UI | Vue 3 (`<script setup lang="ts">`), Vue Router (Hash-History), Pinia (Setup-Stores), vue-i18n (de/en) |
| UI-Layer | **Luna Console** (Kopie unter `src/renderer/design/luna-console/`) + Tailwind CSS v4 |
| Daten | TanStack Query (Vue) über IPC statt fetch; Zod für alle Verträge |
| Datenbank | `node:sqlite` (eingebaut, kein natives Modul), siehe unten |
| Tests | Vitest (+ `@testing-library/vue`), Playwright im Electron-Modus |
| Lint/Format | Oxlint, dann ESLint (flat config), Prettier (`semi: false`, `singleQuote`, `printWidth: 100`) |
| Node / pnpm | Node 24 über `.nvmrc`, `pnpm@10.32.1` über `packageManager` |

Es gibt **kein Backend**. Die Dienste laufen im Electron-Main-Prozess; der Renderer spricht nur
über `window.tricorder` (Preload, `contextBridge`) mit ihnen.

## Befehle

```bash
pnpm install          # postinstall `install-electron` lädt das Electron-Binary (Electron 45
                      # hat kein eigenes postinstall mehr; electron-vite liest nur path.txt)
pnpm dev              # Electron mit Hot Reload (Renderer: HMR, Main/Preload: Rebuild + Neustart)
                      # Renderer-Warnungen/-Fehler (auch Vue-Warnungen) erscheinen im Terminal
pnpm build            # electron-vite build nach out/
pnpm preview          # gebaute App aus out/ starten
pnpm type-check       # tsc (Node-Kontext) + vue-tsc (Web-Kontext und Web-Tests)
pnpm lint             # oxlint, dann eslint (beide mit --fix)
pnpm format           # prettier
pnpm test             # vitest run (Projekte "node" und "web")
pnpm test:e2e         # baut, dann Playwright gegen die gebaute App (Temp-DB, Temp-userData)
pnpm build:mac        # .dmg arm64 nach release/<version>/ (unsigniert)
pnpm build:win        # NSIS-Installer x64 (auf Windows bauen und testen)
python3 -m unittest discover -s tests   # Tests des Python-CLI
```

Ohne direnv vor jedem Node-Befehl: `source ~/.nvm/nvm.sh && nvm use` (die Standard-Node ist v20).

**`ELECTRON_RUN_AS_NODE`:** Terminals in VS Code und Claude Code exportieren
`ELECTRON_RUN_AS_NODE=1`; Electron startet dann als nacktes Node. `electron.vite.config.mts`
löscht die Variable für `pnpm dev`/`pnpm preview`, `e2e/app.ts` für Playwright. Wer Electron
anders startet, muss sie selbst entfernen.

## Umgebung (direnv)

- `.env.local.example`, `.env.test.example`, `.env.prod.example` sind eingecheckt; die echten
  `.env.*` sind git-ignoriert. Einrichtung: `cp .env.local.example .env.local && direnv allow`.
- `.envrc` lädt Node aus `.nvmrc` und `.env.$LUNA_ENV` (Standard `local`). Andere Umgebung:
  `LUNA_ENV=test direnv exec . pnpm test:e2e`.
- Die App liest nur die Prozessumgebung (`envDir: false` in allen drei Vite-Configs).
- Variablen:
  - `LOGBUCH_DB` überschreibt den DB-Pfad des Dienstes logbuch (Vorrang: env >
    Dienst-Einstellung `dbPath` > `~/.logbuch/logbuch.db`). Das CLI liest dieselbe Variable.
    Leer zählt als nicht gesetzt. `pnpm dev` ohne `LOGBUCH_DB` arbeitet gegen die **echte** DB.
  - `TRICORDER_USER_DATA` setzt den userData-Ordner (Vorrang: env > `--user-data-dir=<dir>` >
    Standard). Standard im Dev-Lauf: `<appData>/Tricorder Dev`, damit Dev nie die Einstellungen
    der installierten App teilt; die gepackte App nimmt Electrons Standard.
- `src/main/app-env.ts` prüft beide Variablen beim Start per Zod (leer = nicht gesetzt, sonst
  **absoluter** Pfad). Ist sie ungültig, beendet sich die App sofort mit `z.prettifyError` im
  Terminal und in einem Fehlerdialog. Ein relativer Pfad würde je nach cwd (`pnpm dev`, gepackte
  App, CLI) auf verschiedene Dateien zeigen. Der Dienst logbuch liest danach `process.env`, das
  damit geprüft ist.
- Eine neue Variable kommt in **alle** `.env.*.example`, in `src/main/app-env.ts` (Schema plus
  Test in `pure.spec.ts`), in `src/main/env.d.ts` und in diese Liste.

## Struktur

```
src/
  main/        App-Lebenszyklus, Fenster, Tray, ServiceHost, Einstellungen (Node-Kontext)
  preload/     contextBridge -> window.tricorder (nur invoke/on, keine Node-APIs)
  shared/      Dienst-Vertrag: service.ts, contract.ts, define-service.ts, registry.ts, ipc.ts, api.ts
  renderer/    Vue-App: main.ts, App.vue, i18n.ts, locales/, router/, views/, components/
    design/luna-console/   Kopie des Designsystems (nicht von Hand ändern, siehe README dort)
  services/
    registry.ts            die eine Stelle, an der Dienste eingetragen werden
    <id>/
      manifest.ts          defineManifest({ id, nameKey, color, kind, order })
      contract.ts          defineContract({ methods, events, settings }) – Zod
      main.ts              export default defineService({ manifest, contract, setup })
      main/                optional: weitere Main-Module des Dienstes
      ui/routes.ts         optional: export default RouteRecordRaw[] (+ optional alerts)
      ui/**                Views und Komponenten des Dienstes
      ui/locales/{de,en}.json  Texte der UI, im Renderer unter services.<id>.*
      locales/{de,en}.json Name des Dienstes (Main/Tray und Renderer), unter services.<id>.*
      __tests__/           Node-Tests des Dienstes (Main-Teil, Vertrag)
e2e/           Playwright (Electron); e2e/app.ts startet die App mit Temp-DB und Temp-userData
```

Aliase (Vite, Vitest, tsconfig): `@renderer/*`, `@shared/*`, `@services/*`.

TypeScript-Kontexte:

- `tsconfig.node.json` (tsc): `src/main`, `src/preload`, `src/shared`, `src/services/*.ts`,
  `src/services/<id>/*.ts` (also `main.ts`, `contract.ts`, `manifest.ts`), `src/services/<id>/main/**`,
  `src/services/<id>/__tests__/**`, `e2e/`, die Tool-Configs.
- `tsconfig.web.json` (vue-tsc): `src/renderer`, `src/shared`, `src/services/registry.ts`,
  `src/services/<id>/{manifest,contract}.ts`, `src/services/<id>/ui/**`.
- `tsconfig.web.test.json`: die Web-Tests (`src/renderer/**`, `src/services/<id>/ui/**`).

`main.ts` darf **nicht** aus `ui/` importieren und umgekehrt; gemeinsam sind nur `manifest.ts`
und `contract.ts`.

## Laufzeit (Main-Prozess)

- **userData** enthält `settings.json` (Abschnitte `app` und `services.<id>`, Zod-geprüft,
  atomar geschrieben; eine kaputte Datei wird als `settings.json.corrupt-<zeit>` beiseitegelegt),
  `secrets.json` (safeStorage-verschlüsselt) und `logs/<id>.log` je Dienst plus
  `logs/tricorder.log` für den Host (Rotation bei 2 MB; im Dev-Lauf auch im Terminal).
- **Einzelinstanz:** Die gebaute App läuft nur einmal; ein zweiter Start holt das Fenster nach
  vorn. Unter `pnpm dev` gibt es **keine** Sperre, weil electron-vite Electron bei jedem
  Main-Rebuild sofort neu startet.
- **Fenster schließen** versteckt es nur, die App lebt im Tray weiter. Beenden über das
  Tray-Menü oder Cmd+Q. Tray-Icons liegen in `src/main/assets/` (als `?asset` importiert, damit
  sie in `out/` landen und ohne Builder-Änderung verpackt werden).
- **Autostart** (`settings.app.autostart`, Standard aus) wird nur in der gepackten App
  angewendet; im Dev-Lauf wird er nur geloggt. Gesetzt wird er nur, wenn er vom OS-Zustand
  abweicht (macOS loggt sonst bei jedem Start einen nativen Fehler), und danach geprüft; nimmt
  das OS die Änderung nicht an, steht das als Fehler im Log.
- **Status:** Setzt `setup()` keinen Status, wird der Dienst danach `online`. Der Host loggt jede
  Statusänderung. Der Main-Prozess schreibt **keine** sichtbare Prosa: `status.set(state,
  { code, detail })`. Die UI übersetzt `code` (`services.<id>.reasons.<code>` in den
  `ui/locales` des Dienstes, sonst `reasons.<code>`, sonst `reasons.unknown`) und zeigt `detail`
  (Pfad, technische Meldung) unübersetzt in `.lc-verbatim` unter der Meldung. Ebenso werden
  Aufruffehler über ihren `code` (`errors.*`) übersetzt, die technische Meldung steht verbatim
  daneben.
- **Sprache:** Main entscheidet sie einmal (`pickLocale(app.getLocale())` aus
  `src/shared/locale.ts`: `en` für ein englisches System, sonst `de`) und gibt sie dem Renderer
  über `--tricorder-locale=` / Preload `window.tricorder.locale`. Tray, Fenstertitel und
  Fehlerdialog nehmen ihre Texte aus `src/renderer/locales/*.json` (`tray.*`, `app.title`,
  `serviceState.*`, `startup.*`), damit Tray und Fenster dieselben Wörter benutzen.
- **Einstellungen:** `ValidatedSection.set` arbeitet Patches nacheinander ab (keine verlorenen
  Änderungen bei gleichzeitigen Aufrufen), lehnt unbekannte Schlüssel mit `invalid-input` ab und
  speichert nur Schlüssel des Schemas. Scheitert das Schreiben, bleibt der alte Stand.

## Dienst-Vertrag (`src/shared/`)

- **Manifest** (`service.ts`): `id` (`/^[a-z][a-z0-9-]*$/`, gleich dem Ordnernamen),
  `nameKey` (`services.<id>.name`), `color: LcColor`, `kind: 'local' | 'remote' | 'background'`,
  `order`.
- **Vertrag** (`contract.ts`): `methods: { name: { input, output } }` (Zod; `z.void()` für keine
  Argumente), `events: { name: schema }`, `settings: z.object(...)`, das `{}` akzeptieren muss.
  Der Aufrufer übergibt `z.input<input>`, der Handler bekommt `z.output<input>`; der Handler
  liefert `z.input<output>`, der Aufrufer bekommt `z.output<output>`.
- **Main-Teil** (`define-service.ts`): `setup(ctx)` läuft einmal beim Start und darf eine
  Aufräumfunktion zurückgeben. `ctx` bietet `handle(method, fn)`, `emit(event, data)`,
  `settings.get/set/onChange`, `secrets.get/set/available` (safeStorage),
  `status.set(state, { code, detail })`,
  `schedule(ms, fn)`, `notify(title, body)`, `log.info/warn/error`. Wirft `setup`, bekommt nur
  dieser Dienst den Status `error`.
- **IPC** (`ipc.ts`): Methoden auf `svc:<id>:<method>`, Events auf `svc:<id>:event:<name>`,
  Plattform auf `host:services:list`, `host:services:status`, `host:settings:get`,
  `host:settings:set`, `host:app-settings:get`, `host:app-settings:set`. Jedes `invoke` liefert einen Umschlag `IpcResult<T>`
  (`{ ok: true, data } | { ok: false, error: { code, message } }`); der Renderer packt ihn mit
  `unwrapResult()` aus, das `ServiceCallError` wirft. Ein unbekannter Dienst oder eine
  unbekannte Methode liefert beim `invoke` den Code `unknown-method` (Electron kennt keinen
  Catch-all-Handler); `unknown-service` kommt nur von `settings.get/set`.
- **Preload** (`api.ts`): `window.tricorder` = `invoke(service, method, args)`,
  `on(service, event, cb) -> unsubscribe`, `services.list()`, `services.onStatus(cb)`,
  `settings.get(service)`, `settings.set(service, patch)`, `settings.app.get()`,
  `settings.app.set({ autostart })`, `platform`. Typisiert über `AppApi` aus
  `src/services/registry.ts`.
- **Renderer** (`src/renderer/platform/`): `useService(id)` liefert `{ api, on, query, mutation,
  invalidate }` (TanStack Query, Schlüssel `['svc', id, method, args]`); `on` meldet sich beim
  Unmount selbst ab, `mutation` invalidiert bei Erfolg alle Abfragen des Dienstes.
  `useServiceEventSync()` (in `App.vue`) invalidiert `['svc', id]` bei **jedem** Event eines
  Dienstes und wenn er wieder `online` wird: ein Dienst muss für Live-Updates also nur
  `emit(...)` aufrufen. `useServicesStore` hält den Status aller Dienste.
- Der Preload läuft in der Sandbox und kann **keine Pakete** laden: nur zod-freie Module aus
  `src/shared/` importieren (`ipc.ts`, Typen).

## Neuen Dienst hinzufügen

1. Ordner `src/services/<id>/` mit `manifest.ts` (`defineManifest`), `contract.ts`
   (`defineContract`), `main.ts` (`export default defineService({ manifest, contract, setup })`)
   und `locales/de.json` + `locales/en.json` (mindestens `{ "name": "..." }`; den Namen nutzt
   auch das Tray-Menü).
2. In `src/services/registry.ts` eine Zeile `<id>: { manifest, contract }` eintragen. Mehr
   Verdrahtung gibt es nicht: Den Main-Teil lädt `src/main/services.ts` per
   `import.meta.glob('../services/*/main.ts')` (lazy, ein Importfehler trifft nur diesen Dienst).
3. Hat der Dienst eine Oberfläche: `ui/routes.ts` mit
   - `export default` eines `RouteRecordRaw[]`: Pfade relativ und ohne führenden Slash (`''` ist
     die Startseite des Dienstes, Name `<id>`), weitere Namen beginnen mit `<id>.`; der Renderer
     hängt sie unter `/<id>` ein. Views laden lazy (`() => import('./views/X.vue')`).
   - optional `export const alerts = { unconfigured: Komponente }`: ersetzt für diesen Zustand
     den allgemeinen Hinweis des Rahmens; die Komponente bekommt die Prop `status`.
   - Texte der UI in `ui/locales/{de,en}.json`; sie werden mit `locales/` unter
     `services.<id>.*` zusammengeführt.
   Ohne `ui/routes.ts` bekommt der Dienst keinen Rail-Button, seine Startkachel ist deaktiviert.
   Die Rail ist fest: START und je Dienst ein Button, sonst nichts. Unterseiten und Befehle eines
   Dienstes (z. B. NEUER EINTRAG) stehen als Befehlsreihe auf seinen Seiten, nie in der Rail.
4. Live-Updates: im Main-Teil `ctx.emit('<event>')` aufrufen; der Renderer lädt dann alle
   Abfragen des Dienstes neu.
5. Tests: Main-Teil und Vertrag in `src/services/<id>/__tests__/` (Node), UI-Tests unter
   `ui/**/__tests__/` (jsdom, Helfer `mountApp(path)` und Mock-Bridge in
   `src/renderer/__tests__/helpers.ts`). Lädt der Dienst eine asynchrone Alert-Komponente,
   in `helpers.ts` bei `asyncComponents` eintragen. Der Locale-Paritätstest deckt die
   Dienst-Locales mit ab.

## Tests

- Vitest-Projekt **node**: `src/main/**`, `src/preload/**`, `src/shared/**`, `src/services/*.spec.ts`,
  `src/services/*/main*`, `src/services/*/__tests__/**`. Projekt **web** (jsdom):
  `src/renderer/**`, `src/services/*/ui/**`. Dateien heißen `*.spec.ts` oder `*.test.ts`.
- **Nie** in die echte `~/.logbuch/logbuch.db` schreiben: Tests und Experimente nehmen eine
  Temp-Datei über `LOGBUCH_DB`. Playwright startet die App über `e2e/app.ts`
  (`launchApp({ seed })`) mit Temp-DB und Temp-`userData` (beide als env gesetzt, damit
  direnv-Werte nicht durchschlagen); `logbuchCli(db, ...args)` ruft das Python-CLI auf.
- `e2e/logbuch.spec.ts` ist der Hauptablauf: Startseite -> WO WAR ICH -> neuer Eintrag ->
  Eintrag per CLI erscheint live -> Abschließen mit zwei Taps; dazu fehlende DB -> Yellow Alert.
- `pnpm dev` zur Prüfung immer mit Timeout starten und danach beenden, mit
  `LOGBUCH_DB=<temp>` und `TRICORDER_USER_DATA=<temp>`. Mit `pnpm dev --remoteDebuggingPort
  9333` lässt sich das Dev-Fenster per Playwright `chromium.connectOverCDP` fernsteuern.
- Vertragstests gegen das Python-CLI rufen `bin/logbuch` mit `LOGBUCH_DB=<temp>` auf.

## i18n

- Jeder sichtbare Text über `t()` mit Schlüssel in **de und en** (`src/renderer/locales/`,
  Dienste in `src/services/<id>/locales/` und `src/services/<id>/ui/locales/`). Standard `de`,
  Fallback `en`, `legacy: false`.
- Datum und Zeit über die vue-i18n-Datumsformate (`d(date, 'time')`, `d(date, 'date')`), nicht
  von Hand formatieren. Gespeicherte Zeiten (`ts` als ISO-String) zeigt `useTimeFormat` auf der
  Uhr ihres eigenen Offsets (Formate `*Wall` mit `timeZone: 'UTC'` auf `wallClockAsUtc(ts)`),
  wie `stardate()` und das CLI; ein `Date` erscheint in Ortszeit.
- `src/renderer/__tests__/locales.spec.ts` schlägt fehl, wenn de und en nicht dieselben
  Schlüssel haben.

## UI-Designsystem: Luna Console

Dieses Repo nutzt Luna Console (`src/renderer/design/luna-console/`). Für jede UI-Arbeit
verbindlich:

- Hintergrund immer `color-lcars-ground` (schwarz). Keine Cards, Rahmen, Schatten, Verläufe oder Icons.
- Struktur = farbige Formen mit 4px Abstand (`space-1`). Die einzige Linie ist die 2px
  `color-lcars-divider` über einer Statuszeile.
- Text auf einer farbigen Form ist immer Ink (schwarz), Gewicht 600, Großbuchstaben, unten rechts.
- Text auf dem Grund: Werte/Titel orange, Labels lavendel, sekundäre Werte creme.
- Rundungen: Elbows (`radius-elbow` 56 / `radius-elbow-inner` 26) oder halbe Elementhöhe (Pills).
  Pill-Reihen runden nur die äußeren Enden.
- Eine Schrift: `font-lcars` (Antonio, aus `@fontsource/antonio`). Nur die Typo-Skala aus
  `tokens.json`, keine eigenen Größen.
- Zahlen: tabellarisch, mit Nullen aufgefüllt (`064`, `21:07`).
- Statusfarben (`online`, `armed`) nur für Zustände, nie als Deko. Rot = Gefahr.
- Zustände: Red Alert (Verbindung weg, Dienst `offline`/`error`) und Yellow Alert (falsche
  Konfiguration, Dienst `unconfigured`) lassen den Rahmen pulsieren (`.alert-pulse` /
  `.lc-pulse`) und ersetzen den Inhalt durch `LcNotice`. Destruktive Befehle brauchen zwei
  Taps (armed -> bestätigen).
- Texte: kurze Substantive/Verben in Großbuchstaben, Befehlscodes `NN-XXX`, Alarme nennen
  Ursache und Abhilfe.
- Zwei Dichten: `touch` (Originalmaße) und `desk` (~0,7, automatisch bei `pointer: fine`);
  `data-lc-density="touch|desk"` an `<html>` oder einem Container erzwingt eine. Größen nur
  über die Variablen (`--type-*`, Layout-/Radius-/Abstands-Tokens, `--density-scale` für
  Ausrichtungsabstände ohne eigenes Token), nie als Literal. Prototyp in
  `src/renderer/assets/density.css`, bis er upstream ist (`docs/plan-dichte-desk.md`).
  Dazu `data-lc-density="log"`: dichte Stufe nur für einen Inhaltscontainer (Text wie ein
  Protokoll), nie für den Rahmen; alle logbuch-Seiten nutzen sie.
- Befehle und Filter auf einer Dienstseite sind `LcChip`s in einer `.lc-chips`-Reihe: so breit
  wie der Text (höchstens 16em), dann Ellipse; nur ein gekürzter Text bekommt den vollen Text als
  Tooltip. Keine Control-Rows über die volle Breite für einzelne Befehle.
- Freitext mit Spiegelstrichen (`- ` am Zeilenanfang) zeigt `LcNoteText` an
  (`src/renderer/components/note.ts`); `LcFieldArea` setzt sie per Enter fort.
- Keine festen Bildschirmgrößen. Der Rahmen füllt seinen Container (`#app { height: 100dvh }`);
  Layouts passen sich über intrinsische Grids oder Container Queries an.
- Erst vorhandene `Lc*`-Komponenten / `.lc-*`-Klassen nutzen. Neue Komponenten (z. B. `LcField`)
  entstehen unter `src/renderer/components/` und verwenden nur Tokens, keine literalen Farben.

## SQLite: `node:sqlite` statt `better-sqlite3`

**Weicht vom Plan ab** (`docs/plan.md` sah `better-sqlite3` mit Electron-Rebuild vor), von
Patrick am 2026-10-23 bestätigt. Beim Aufsetzen des Gerüsts am 2026-10-22 gewählt. Grund: kein
natives Modul, also kein Electron-Rebuild und kein ABI-Problem beim Windows-Build; ein Modul für
Vitest (Node) und Electron. Abwägung: `node:sqlite` ist in Node 24 noch als experimentell
eingestuft (eine Warnung erscheint in Node 24.21 / Electron 45 nicht), die API kann sich mit einem
Electron-Update ändern. Bricht die API mit einem Electron-Update, wird `src/services/logbuch/main/store.ts`
auf `better-sqlite3` umgestellt (die Tests bleiben gleich).

Geprüft mit `DatabaseSync` (Datei anlegen, `PRAGMA busy_timeout`, CREATE/INSERT/SELECT):

| Umgebung | Ergebnis |
| --- | --- |
| Node 24.21.0 (Vitest-Projekt `node`, `src/main/__tests__/node-sqlite.spec.ts`) | OK, SQLite 3.53.4 |
| Electron 45.0.0 mit `ELECTRON_RUN_AS_NODE=1` (Node 24.22.0) | OK, SQLite 3.53.4 |
| Electron 45.0.0 als echtes Main-Skript (`app.whenReady()`) | OK |
| Von electron-vite gebündelt (`require("node:sqlite")` bleibt extern) und in Electron ausgeführt | OK |

Hinweise für den Dienst: `DatabaseSync` ist synchron; `PRAGMA busy_timeout = 10000` setzen,
den Journal-Modus nicht ändern (das CLI schreibt parallel), Spalten in snake_case wie in
`bin/logbuch`.

## Arbeitsweise

- Nicht committen, pushen oder Branches anlegen ohne ausdrückliches OK.
- `pnpm dev` und Electron nie dauerhaft laufen lassen, wenn sie nur zur Prüfung gestartet werden.
