# Plan: Dienst `ports` – belegte Ports und ihr Programm

## Context

Der Tricorder bekommt nach `logbuch` seinen zweiten fest eingebauten Client-Dienst. Er zeigt,
welche Ports auf dem eigenen Rechner gerade belegt sind und welches Programm sie hält. Damit lässt
sich zum Beispiel klären, warum `pnpm dev` meldet, dass 5173 schon vergeben ist.

Deine Entscheidungen: **nur lauschende Ports** (TCP LISTEN plus gebundene UDP-Ports), **live nur
bei offener Seite** (kein Hintergrundjob), **nur anzeigen** (kein Beenden), **Windows gleich
mit** (Parser mit Testdaten, auf echtem Windows erst später geprüft).

Streng genommen ist das kein Scanner, der Ports abklopft: Er liest die Socket-Tabelle des
Betriebssystems. Deshalb heißt der Dienst `ports` (Name „Ports“).

## Datenquelle (ausprobiert auf diesem Mac)

- **macOS:** `netstat -anv -p tcp` und `-p udp`. Die Spalte `process:pid` enthält **alle**
  Sockets, auch die von root (`launchd:1` auf 22, `com.docker.backe:3047` auf 3000/27017).
  `lsof` ohne sudo sieht nur die eigenen Prozesse und fällt deshalb weg. Beide Aufrufe zusammen
  brauchen etwa 11 ms.
  - Den Programmnamen kürzt netstat auf 16 Zeichen und er kann Leerzeichen enthalten
    (`Code Helper (Plu:94757`). Geparst wird deshalb von rechts, an der Spalte `state`
    (5 Hex-Zeichen) nach `process:pid`, nicht nach Leerzeichen.
  - Voller Pfad und Benutzer kommen aus einem zusätzlichen Aufruf
    `ps -o pid=,user=,comm= -p <pid,pid,…>`, der auch für root-Prozesse funktioniert
    (`/sbin/launchd`, `/Applications/Docker.app/…/com.docker.backend`).
  - TCP: Zustand `LISTEN`. UDP: numerischer lokaler Port **und** Gegenstelle `*.*`; verbundene
    UDP-Sockets und `*.*`-Einträge ohne Port werden übersprungen.
- **Windows:** `netstat -ano` (TCP, TCPv6, UDP, UDPv6) plus `tasklist /fo csv /nh` für
  PID → Programmname. Ein deutsches Windows schreibt `ABHÖREN` statt `LISTENING`. Lauschend ist
  deshalb eine TCP-Zeile mit Gegenstelle `0.0.0.0:0` / `[::]:0`, unabhängig vom Zustandstext.
  Pfad und Benutzer bleiben unter Windows in v1 `null` (`tasklist /v` bzw. PowerShell wären zu
  langsam für den Live-Takt).
- Andere Plattformen: Status `unconfigured`, Grund `unsupported`.
- Alle Aufrufe über `execFile` (keine Shell), mit Timeout von 5 s.

## Vertrag (`src/services/ports/contract.ts`)

```ts
const listenerSchema = z.object({
  protocol: z.enum(['tcp', 'udp']),
  port: z.number().int().min(1).max(65535),
  /** Lokale Adressen dieses Prozesses auf dem Port, z. B. ['0.0.0.0', '::'] oder ['127.0.0.1']. */
  addresses: z.array(z.string()),
  /** all: alle Schnittstellen, loopback: nur dieser Rechner, interface: bestimmte Adresse(n). */
  scope: z.enum(['all', 'loopback', 'interface']),
  pid: z.number().int().nullable(),
  /** Kurzname laut netstat/tasklist. */
  process: z.string().nullable(),
  /** Voller Pfad der ausführbaren Datei (macOS über ps), sonst null. */
  path: z.string().nullable(),
  user: z.string().nullable(),
})

methods: {
  /** Momentaufnahme aller lauschenden Ports, nach Port und Protokoll sortiert. */
  list: { input: z.void(), output: z.array(listenerSchema) },
}
```

IPv4- und IPv6-Zeilen desselben Prozesses auf demselben Port (z. B. `rapportd` 59594) werden zu
**einer** Zeile mit mehreren `addresses` zusammengefasst. Gruppiert wird nach
(protocol, port, pid).

## Dateien

Neu, nach dem Muster von `src/services/logbuch/`:

- `src/services/ports/manifest.ts`: `id: 'ports'`, `color: 'mauve'`, `kind: 'local'`, `order: 20`
- `src/services/ports/contract.ts` (siehe oben)
- `src/services/ports/main.ts`: `defineService`, `setup` → `startPorts(ctx)`
- `src/services/ports/main/runtime.ts`: prüft die Plattform, setzt den Status, registriert `list`
- `src/services/ports/main/darwin.ts`: `parseNetstatDarwin(text)`, `parsePs(text)`
- `src/services/ports/main/win32.ts`: `parseNetstatWin32(text)`, `parseTasklist(csv)`
- `src/services/ports/main/scan.ts`: führt die Befehle aus (Runner per Parameter injizierbar
  für Tests), führt zusammen, reichert an, sortiert
- `src/services/ports/locales/{de,en}.json`: `{ "name": "Ports" }`
- `src/services/ports/ui/routes.ts`: `''` → `views/PortsView.vue` (Name `ports`)
- `src/services/ports/ui/views/PortsView.vue`
- `src/services/ports/ui/i18n.ts`: `usePortsI18n()` mit `pt(key)`, wie `useLogbuchI18n`
- `src/services/ports/ui/locales/{de,en}.json`: Texte plus `reasons.unsupported`

Geändert:

- `src/services/registry.ts`: Zeile `ports: { manifest, contract }`
- `src/renderer/platform/useService.ts`: `ServiceQueryOptions` um `refetchInterval` erweitern
  und an `useQuery` weiterreichen. TanStack pausiert das Intervall, solange das Dokument
  verborgen ist (`refetchIntervalInBackground` bleibt `false`). Ein ins Tray verstecktes Fenster
  fragt also nicht weiter ab, und ein Hintergrundjob im Main-Prozess ist nicht nötig.
- `CLAUDE.md`: Einleitung nennt `ports` neben `logbuch`; die Struktur bleibt generisch.
- Nach der Freigabe kommt dieser Plan als `docs/plan-ports.md` ins Repo.

## Ansicht `PortsView.vue` (Luna Console)

- `data-lc-density="log"` wie bei den logbuch-Seiten. `PageHead` (Kicker PORTS, Titel BELEGTE
  PORTS, Anzahl `023`). Die Komponente liegt bisher unter logbuch/ui. Für den zweiten Nutzer
  wandert sie nach `src/renderer/components/LcPageHead.vue`, und logbuch importiert sie von dort.
- Eine `.lc-chips`-Reihe mit Filtern als `LcChip`: `ALLE / TCP / UDP` und `NUR EXTERN` (blendet
  `loopback` aus). Der Filter steht in der Query (`?proto=&extern=1`), wie der Projektfilter von
  logbuch.
- Liste als intrinsisches Grid ohne Rahmen. Je Zeile: Port orange, tabellarisch und auf 5 Stellen
  aufgefüllt (`05173`), Protokoll als Label (lavendel), Programm (orange), PID und Benutzer
  (creme), Bereich ALLE/LOKAL/ADRESSE (lavendel). Pfad und Adressen stehen in `.lc-verbatim`
  darunter.
- Kein Programm bekannt (pid `null`): `—` statt eines Namens.
- `QueryState` für Laden, Fehler und leere Liste. Live über
  `query('list', undefined, { refetchInterval: 3000 })`.
- Rein lesend: kein Befehl BEENDEN.

## Tests

- `__tests__/darwin.spec.ts`: Fixture aus echter `netstat -anv`-Ausgabe (tcp4/tcp6/tcp46,
  Name mit Leerzeichen, root-Prozess, verbundene UDP-Zeile und `*.*` werden übersprungen), `ps`-Parser.
- `__tests__/win32.spec.ts`: englische und deutsche Ausgabe (`LISTENING`/`ABHÖREN`), `[::]:135`,
  UDP, PID 4 `System`, `tasklist`-CSV mit Anführungszeichen.
- `__tests__/scan.spec.ts`: Zusammenführen von v4/v6, Bereich, Sortierung, Anreicherung mit
  Fake-Runner, ein scheiternder `ps` liefert trotzdem Ports (Pfad `null`), ein scheiterndes
  netstat wird zum Methodenfehler.
- `__tests__/runtime.spec.ts`: `online` auf darwin/win32, `unconfigured`/`unsupported` sonst.
- `__tests__/live.spec.ts` (nur darwin, `it.runIf`): öffnet einen `net`-Server auf Port 0, und
  `list` meldet genau diesen Port mit `process.pid`.
- `ui/__tests__/PortsView.spec.ts`: `mountApp('/ports')` mit Mock-Handler: Zeilen, Filter-Chips,
  Leer- und Fehlerzustand.
- `e2e/ports.spec.ts`: Der Test öffnet einen Server auf einem freien Port, startet die App über
  `launchApp`, öffnet PORTS und erwartet die Zeile mit diesem Port.
- Bestehende Tests, die genau einen Dienst annehmen (Rail, Startkacheln, Tray), werden geprüft
  und bei Bedarf angepasst. Die Locale-Parität deckt den neuen Dienst automatisch ab.

## Abweichungen bei der Umsetzung

- `list` liefert nur das Array, ohne `scannedAt`: Bei einem Takt von 3 s zeigt die Ansicht
  keinen Zeitstempel.
- Auf macOS ist `process` der Dateiname aus dem `ps`-Pfad (`com.docker.backend`), nicht der
  auf 16 Zeichen gekürzte netstat-Name. Den netstat-Namen nimmt der Dienst nur, wenn `ps` den
  Prozess nicht kennt.
- Screenshots der Prüfung: `docs/mockups/ports-live.png`, `docs/mockups/ports-extern.png`.

## Erweiterung: Docker (2026-10-27)

- `docker ps --format '{{.Names}}\t{{.Ports}}'` im selben Takt, parallel zu netstat (etwa
  120 ms, Timeout 2 s). Die CLI wird unter `/usr/local/bin`, `/opt/homebrew/bin` und im
  Docker.app-Bundle gesucht, unter Windows `docker.exe` im PATH. Fehlt sie oder läuft der Daemon
  nicht, gibt es keine Container, aber auch keinen Fehler.
- Feld `docker: { containers: [{ name, port }] } | null`. Docker-Port ist, was ein laufender
  Container veröffentlicht (deckt auch OrbStack/Colima ab) oder was ein Docker-Prozess hält
  (`com.docker.backend`, `vpnkit`, `docker-proxy`, `wslrelay`).
- Ansicht: Bei einem Docker-Port ist der Container die Überschrift der Zeile (Pill DOCKER in
  peach, Name orange, `→ <Container-Port>`). Programm, PID und Benutzer (`com.docker.backend`)
  stehen creme in der Zeile darunter. Ohne Containernamen bleibt das Programm die Überschrift,
  mit der Pill davor. Filter NUR DOCKER (`?docker=1`). Screenshots: `docs/mockups/ports-docker*.png`.

## Verifikation

1. `pnpm type-check`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`
2. `LOGBUCH_DB=<temp> TRICORDER_USER_DATA=<temp> pnpm dev --remoteDebuggingPort 9333` mit
   Timeout: PORTS über die Rail öffnen, per CDP einen Screenshot nach `docs/mockups/` legen, gegen
   die echte Liste von `netstat -anv` vergleichen (5173 von Vite muss erscheinen), Filter
   ausprobieren. Danach den Dev-Lauf beenden.
3. Windows: nur über die Parser-Tests abgedeckt. Die Prüfung auf echtem Windows ist als offener
   Punkt vermerkt.

Kein Commit ohne dein OK.
