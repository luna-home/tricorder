# Plan: Tricorder – Luna-Desktop-Client (Electron) mit Client-Diensten

## Kontext

`tricorder` enthält bisher nur das Python-CLI `logbuch` (SQLite unter `~/.logbuch/logbuch.db`, befüllt von den Claude-Code-Hooks), kein UI. Patrick will den Tricorder als **Luna-Client in Electron**, als Plattform für Client-Dienste:

- **lokale Werkzeuge** (logbuch zuerst, später etwa cockpit),
- **Zugang zu Luna Home** (MQTT, Home Assistant, Monitor, Backups …),
- **Hintergrunddienste**: Die App läuft im Tray bzw. in der Menüleiste weiter, auch wenn das Fenster zu ist.

Weitere Vorgaben:

- Läuft auf **macOS und Windows**.
- Dienste sind **fest eingebaut und modular**.
- UI im **Luna-Design-System (Luna Console, LCARS)**.
- Patrick will **selbst Einträge anlegen** können.
- **Echte Zeit** steht im Vordergrund, die Sternzeit nur als Gag darunter.

Umfang dieses Plans: **Plattform-Gerüst plus der Dienst logbuch**. Luna-Home-Dienste bekommen ihre Schnittstelle in der Plattform, gebaut werden sie aber jeweils in einem eigenen Plan.

## Stack

Nach `skills/frontend-stack`, Abschnitt Desktop:

- `electron-vite` mit Vue 3, `<script setup lang="ts">`, Vue Router, Pinia (Setup-Stores), vue-i18n (de/en) und Zod
- TypeScript im Strict-Modus
- UI-Layer: Luna Console (Tailwind v4)
- Server-Daten über TanStack Query, angebunden über IPC statt fetch
- `better-sqlite3` mit Electron-Rebuild; `electron-builder` baut `.dmg` (arm64) und den NSIS-Installer für Windows
- Tests mit Vitest, `@testing-library/vue` und Playwright (Electron-Modus)
- Lint und Format: ESLint, Oxlint und Prettier wie in `luna-monitor`
- Node 24 über `.nvmrc`; `pnpm@10.32.1` über `packageManager`

Es gibt **kein Backend**. Die Dienste laufen im Electron-Main-Prozess.

## Struktur

```
tricorder/
  .nvmrc .npmrc .envrc .env.{local,test,prod}.example .gitignore
  package.json  electron.vite.config.ts  electron-builder.yml  CLAUDE.md
  bin/logbuch  hooks/  tests/          # Python-CLI bleibt (~/bin/logbuch ist Symlink darauf)
  src/
    main/        # App-Lebenszyklus, Fenster, Tray, ServiceHost, Einstellungen
    preload/     # contextBridge: window.tricorder (typisiert, nur invoke/subscribe)
    shared/      # Dienst-Vertrag, IPC-Typen, Zod-Schemas
    renderer/    # Vue-App: Rahmen, Startseite, Router aus der Registry
      design/luna-console/   # Kopie von luna-design-system @ ff6aae1
    services/
      registry.ts            # die eine Stelle, an der Dienste eingetragen werden
      logbuch/
        manifest.ts          # id, Name (i18n-Key), LcColor, Art: local|remote|background
        main.ts              # Dienst im Main-Prozess (DB, Methoden, Hintergrundjobs)
        contract.ts          # Zod-Schemas der Methoden
        ui/                  # Views, Routen, Komponenten
        locales/{de,en}.json
```

## Plattform: der Dienst-Vertrag

Jeder Dienst besteht aus **Manifest + Main-Teil + UI-Teil**:

- **Main-Teil**: `defineService({ manifest, contract, setup(ctx) })`. `ctx` liefert dem Dienst:
  - `handle(methode, fn)`: IPC-Kanal `svc:<id>:<methode>`. Die Argumente prüft der Host per Zod aus `contract.ts`, bevor `fn` läuft.
  - `emit(event, data)`: Push an die UI, z. B. „neuer Eintrag“.
  - `settings`: eigener, Zod-validierter Bereich in der Einstellungsdatei unter `userData`. Geheimnisse wie MQTT-Passwörter speichert er per Electron `safeStorage`.
  - `status.set('online' | 'offline' | 'unconfigured' | 'error', grund)`: speist die Statusanzeige, den Red bzw. Yellow Alert und die Startkacheln.
  - `schedule(intervall, fn)` für Hintergrunddienste und `notify(titel, text)` für Systembenachrichtigungen.
  - `log`: Logdatei unter `userData/logs`.
- **Host** (`src/main/service-host.ts`): startet alle Dienste aus der Registry. Wirft ein Dienst einen Fehler, bleiben die anderen davon unberührt: Er bekommt den Status `error`, und die App läuft weiter.
- **Preload**: Er gibt nur `invoke(service, methode, args)` und `on(service, event, cb)` frei, keine Node-APIs. Die Sicherheitseinstellungen sind `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false` und eine restriktive CSP.
- **Renderer**: `useService('logbuch')` liefert einen typisierten Client, dessen Typen aus `contract.ts` abgeleitet sind. Router-Routen, Rail-Navigation von `LcPanel` und die Startkacheln baut der Renderer aus der Registry.
- Ein neuer Dienst braucht einen neuen Ordner unter `src/services/` und eine Zeile in `registry.ts`. Das steht in `CLAUDE.md`.

**App-Verhalten:**

- Tray-Icon (macOS-Menüleiste bzw. Windows-Infobereich) mit „Öffnen“, einer kurzen Statusliste der Dienste und „Beenden“.
- Schließt man das Fenster, läuft die App im Tray weiter.
- Fensterrahmen: auf macOS `titleBarStyle: 'hiddenInset'`, damit der LCARS-Rahmen das ganze Fenster füllt; auf Windows bleibt der Standardrahmen.
- Autostart beim Login wird eine Einstellung, die standardmäßig aus ist.

## Dienst logbuch

- **DB**: `better-sqlite3`.
  - Pfad aus den Dienst-Einstellungen; Standard ist `~/.logbuch/logbuch.db`, die Umgebungsvariable `LOGBUCH_DB` überschreibt ihn für Entwicklung und Tests.
  - Schema `CREATE TABLE IF NOT EXISTS` wie in `bin/logbuch`, `busy_timeout` 10 s, Journal-Modus unverändert (das CLI schreibt parallel).
  - Fehlt die Datei (etwa auf Windows), wird **keine** leere DB angelegt. Der Dienst steht dann auf `unconfigured`, und die Ansicht zeigt einen Yellow Alert: „LOGBUCH NICHT GEFUNDEN – PFAD IN EINSTELLUNGEN SETZEN“.
- **Methoden**, nachgebaut aus der Python-Logik:
  - `openTopics({project?, all?})`
  - `projects()`
  - `history({project, topic})`
  - `addEntry({project, topic, status, nextStep?, openQuestions?, refs?})`: übernimmt die vorhandene Schreibweise eines Themas; `source` ist `'manual'`
  - `done({project, topic, note?})`
  - Das `ts`-Format ist identisch zu Python (`2026-10-22T09:15:00+02:00`).
- **Hintergrund**: Der Dienst beobachtet die DB-Datei (`fs.watch` mit Entprellung). Schreiben die Hooks oder das CLI einen Eintrag, aktualisiert sich die Ansicht von selbst über `emit('changed')`.
- **Ansichten** im Luna-Console-Stil:
  1. **WO WAR ICH**: offene Themen, neueste zuerst, Projektfilter als `LcOptionPill`-Reihe. Je Thema stehen Projekt (Lavendel), Thema (Orange) sowie Stand, Weiter, Offen und Bezug.
  2. **VERLAUF**: alle Einträge eines Themas.
  3. **NEUER EINTRAG**: Projekt wählen oder neu eintippen, Thema mit Vorschlägen. Pflichtfeld ist der Stand; Weiter, Offen und Bezug sind optional. Aus der Themenansicht heraus sind Projekt und Thema schon vorbelegt.
  4. **ABSCHLIESSEN**: zwei Taps (armed → bestätigen), optional mit Notiz.
- **Zeit**: Die echte Zeit steht groß, z. B. `MI 21.10.2026 · 22:52` mit `VOR 10 STD`. Darunter klein in Creme `STERNZEIT 2026.805`. Formatiert wird über die vue-i18n-Datumsformate. Die Sternzeit wird wie `stardate()` in Python gerechnet; ein Test prüft, dass beide dasselbe ergeben.

## Fehlende Komponente: Eingabefeld

Luna Console hat **kein Text- und kein Textarea-Feld**, und die Regel des Systems lautet: Fehlt eine Komponente, wird sie gemeinsam gebaut.

Vorschlag: `LcField` und `LcFieldArea`.

- **Aussehen:** Das Label ist Lavendel. Die Eingabefläche liegt auf Schwarz und hat einen Pill-Rand in `inactive`. Der Text ist Orange, der Fokus eine Creme-Outline. Verwendet werden nur Tokens.
- **Ablage:** Die Komponenten liegen zuerst in `src/renderer/components/`. Ein Beitrag zu `luna-design-system` wäre ein eigener Schritt.

Die Felder werden direkt in der laufenden Dev-Version (`pnpm dev`) beurteilt, keine Screenshots.

## Kleine Änderung am CLI

`stamp()` in `bin/logbuch` stellt die echte Zeit nach vorn: `Mi 21.10. 22:52 · vor 10 Std · Sternzeit 2026.805`. Die Python-Tests passe ich an.

## Reihenfolge

1. Der erste Commit nimmt das vorhandene logbuch unverändert auf. Dann den Branch `feat/electron-client` anlegen.
2. Gerüst: electron-vite, `.nvmrc`/`.envrc`/`.env.*.example`/`.gitignore`, Lint und Tests, `CLAUDE.md`
3. Plattform: Dienst-Vertrag, ServiceHost, Preload, Registry, Tray, Rahmen mit Luna Console, Startseite
4. Dienst logbuch: Main-Teil und Vertragstest gegen das Python-CLI
5. Logbuch-UI: `LcField`, Ansichten, Formular, Abschließen
6. CLI-Zeitstempel umstellen
7. Playwright-Electron-Hauptablauf, macOS-Build, Vereinfachung mit dem code-simplifier

Push und PR mache ich nur nach deinem OK. Ein Remote ist noch nicht eingerichtet.

## Verifikation

- `python3 -m unittest discover -s tests` ist grün.
- `pnpm test`:
  - Unit-Tests für ServiceHost (Zod-Ablehnung, Fehler-Isolation) und logbuch
  - **Vertragstest:** Ein Eintrag per `bin/logbuch merk` in eine temporäre DB erscheint über den Dienst. Ein Eintrag über den Dienst erscheint in `logbuch wo`. Die Zusammenführung von Groß- und Kleinschreibung und `done` verhalten sich in beiden Richtungen gleich.
  - Locale-Parität, Sternzeit, Zeitformat, Komponenten
- `pnpm type-check` und `pnpm lint`
- Playwright startet die App mit einer Test-DB und prüft: Startseite → Logbuch → neuer Eintrag → erscheint in WO WAR ICH → ein Eintrag per CLI erscheint live → abschließen → verschwindet.
- **Ergebnis ist eine lauffähige Dev-Version:** `pnpm install && pnpm dev` startet die Electron-App mit Hot Reload gegen die echte DB. Weiterentwickelt wird daran gemeinsam. Echte Einträge lege ich nur nach Rückfrage an.
- `pnpm build:mac` erzeugt eine startfähige `.app`. **Windows** wird konfiguriert (NSIS-Target, Pfade über `os.homedir()`), aber von hier nicht geprüft: earth ist nur über MQTT erreichbar. Den ersten Windows-Build testest du selbst auf earth.
- Voraussetzung: Aktiv ist Node v20. Node 24.21.0 ist per nvm installiert und wird über `.nvmrc` und direnv genutzt.
