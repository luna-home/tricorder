# Tricorder

Luna-Desktop-Client für macOS und Windows, gebaut mit Electron, Vue 3 und dem Designsystem
Luna Console. Der Tricorder ist eine Plattform für fest eingebaute **Client-Dienste**:

- **lokale Werkzeuge**, zuerst `logbuch`: das Arbeitsprotokoll, das die Claude-Code-Hooks
  befüllen („wo war ich?“), mit eigenen Einträgen aus der App heraus;
- **Zugang zu Luna Home** (MQTT, Home Assistant, Monitor, Backups …), jeweils als eigener Dienst;
- **Hintergrunddienste**, die im Tray bzw. in der Menüleiste weiterlaufen, wenn das Fenster zu ist.

Es gibt kein Backend: Die Dienste laufen im Electron-Main-Prozess, die Oberfläche spricht über
eine schmale, typisierte IPC-Brücke (`window.tricorder`) mit ihnen.

Im Repo liegt außerdem das Python-CLI `bin/logbuch` mit seinen Hooks (`hooks/`) und Tests
(`tests/`). Es bleibt die Referenz für die logbuch-Semantik.

## Einrichtung

Voraussetzungen: [nvm](https://github.com/nvm-sh/nvm), [direnv](https://direnv.net/) und
pnpm 10.32.1 (`npm i -g pnpm@10.32.1`).

```bash
nvm install                                       # Node 24 aus .nvmrc
cp .env.local.example .env.local && direnv allow  # Umgebung laden
pnpm install                                      # Abhängigkeiten; postinstall lädt das Electron-Binary
pnpm dev                                          # App mit Hot Reload starten
```

Ohne direnv: `nvm use` im Projektordner und die Variablen aus `.env.local` selbst exportieren.

`pnpm dev` arbeitet gegen die echte Logbuch-Datenbank `~/.logbuch/logbuch.db`. Für eine
Spielwiese `LOGBUCH_DB` in `.env.local` auf eine andere Datei setzen und sie mit dem CLI füllen:

```bash
LOGBUCH_DB=/tmp/logbuch-dev.db bin/logbuch merk "Mein Thema" "Wo es steht" --projekt luna
LOGBUCH_DB=/tmp/logbuch-dev.db pnpm dev
```

Fehlt die Datei, legt die App **keine** an: der Dienst steht auf „nicht eingerichtet“, und die
Logbuch-Seite zeigt einen Yellow Alert, in dem sich der Pfad setzen lässt.

Was `pnpm dev` tut:

- Renderer-Änderungen (Vue, CSS, Locales) kommen per Hot Reload ohne Neustart.
- Änderungen in `src/main`, `src/preload` oder am Main-Teil eines Dienstes bauen neu und starten
  Electron neu.
- Logs von Main und Diensten sowie Warnungen und Fehler des Renderers (auch Vue-Warnungen)
  erscheinen im Terminal.
- Einstellungen und Logs liegen in einem eigenen Ordner `<appData>/Tricorder Dev`
  (macOS: `~/Library/Application Support/Tricorder Dev`), getrennt von einer installierten App.
- Das Fenster zu schließen beendet die App nicht (sie lebt im Tray weiter); Beenden mit Cmd+Q,
  über das Tray-Menü oder Ctrl+C im Terminal.

## Was die App kann

- **Start:** eine Kachel je Dienst mit Live-Status (ONLINE, NICHT EINGERICHTET, FEHLER …).
- **Logbuch:**
  - **WO WAR ICH:** offene Themen, neueste zuerst, mit Projektfilter.
  - **VERLAUF:** alle Einträge eines Themas.
  - **NEUER EINTRAG:** mit Vorschlägen für Projekt und Thema.
  - **ABSCHLIESSEN:** zwei Taps, der erste schaltet scharf.
  - Was CLI und Claude-Code-Hooks schreiben, erscheint ohne Neuladen.
- **Tray / Menüleiste:** Öffnen, Status je Dienst, Beenden.

## Skripte

| Skript | Zweck |
| --- | --- |
| `pnpm dev` | Electron mit Hot Reload: Renderer per HMR, Main und Preload werden neu gebaut und Electron neu gestartet |
| `pnpm build` | Main, Preload und Renderer nach `out/` bauen |
| `pnpm preview` | die gebaute App aus `out/` starten |
| `pnpm type-check` | `tsc` für Main/Preload/Dienste, `vue-tsc` für Renderer und Web-Tests |
| `pnpm lint` | Oxlint, danach ESLint (beide korrigieren, was sie können) |
| `pnpm format` | Prettier über `src/`, `e2e/` und die Configs |
| `pnpm test` | Vitest einmal (Projekte `node` und `web`) |
| `pnpm test:watch` | Vitest im Watch-Modus |
| `pnpm test:e2e` | bauen, dann Playwright gegen die gebaute Electron-App: Hauptablauf des Logbuchs und Yellow Alert bei fehlender DB (Temp-DB, Temp-userData) |
| `pnpm build:mac` | `.dmg` für Apple Silicon (arm64, unsigniert) nach `release/<version>/` |
| `pnpm build:win` | NSIS-Installer für Windows x64 nach `release/<version>/` |

Python-CLI: `python3 -m unittest discover -s tests`.

## Umgebungen

`.envrc` lädt Node aus `.nvmrc` und `.env.$LUNA_ENV` (`local`, `test` oder `prod`; Standard
`local`). Eingecheckt sind nur die `*.example`-Vorlagen. Eine andere Umgebung:
`LUNA_ENV=test direnv exec . pnpm test:e2e`.

| Variable | Bedeutung |
| --- | --- |
| `LOGBUCH_DB` | Absoluter Pfad der Logbuch-Datenbank; überschreibt die Einstellung in der App. Ohne: `~/.logbuch/logbuch.db` |
| `TRICORDER_USER_DATA` | Absoluter Pfad des userData-Ordners (Einstellungen, Logs). Ohne: `Tricorder Dev` im Dev-Lauf, sonst Electrons Standard |

Beide werden beim Start geprüft (`src/main/app-env.ts`); ein relativer Pfad beendet die App mit
einer lesbaren Fehlermeldung.

## Neuer Dienst

Kurzfassung (Details in [`CLAUDE.md`](CLAUDE.md), Abschnitt „Neuen Dienst hinzufügen“):

1. Ordner `src/services/<id>/` mit `manifest.ts`, `contract.ts` (Zod), `main.ts` und
   `locales/{de,en}.json`.
2. Eine Zeile in `src/services/registry.ts`.
3. Optional eine Oberfläche: `ui/routes.ts` mit Views unter `ui/` und Texten in
   `ui/locales/{de,en}.json`. Rail-Button, Startkachel und Statusanzeige entstehen von selbst.

## Entscheidungen

- **`node:sqlite` statt `better-sqlite3`**: weicht vom ursprünglichen Plan ab, am 2026-10-23
  bestätigt. Begründung in [`CLAUDE.md`](CLAUDE.md) („SQLite“).
- **`bin/logbuch resolve_topic`**: bevorzugt die exakte Schreibweise, bevor Groß- und
  Kleinschreibung ignoriert wird. Sonst ließen sich `Übung` und `übung` (SQLite `NOCASE` faltet
  nur ASCII) weder im CLI noch in der App abschließen. Am 2026-10-23 bestätigt.

## Weiter

Stack, Dienst-Vertrag, Laufzeitverhalten und die Designregeln stehen in
[`CLAUDE.md`](CLAUDE.md), der Plan in [`docs/plan.md`](docs/plan.md).
