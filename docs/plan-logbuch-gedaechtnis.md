# Plan: logbuch als Gedächtnisstütze für parallele Themen

Stand 2026-10-23. Wunsch von Patrick: Das logbuch soll beim Springen zwischen 3–4 Themen helfen,
mit mehr Text in Spiegelstrichen je Schritt.

Entschieden:

- Spiegelstriche sind eine Aufzählung im Text: reine Notiz, nichts zum Abhaken.
- Für den Wechsel werden 3–4 Themen angeheftet. Sie erscheinen als Rail-Knöpfe, Cmd/Strg+1–4
  springt direkt hin, und jedes Thema hat eine volle Themenseite.
- Geschrieben wird gleichberechtigt in der App, über die Claude-Hooks und im CLI.

Darstellung, abgestimmt am Mockup `docs/mockups/logbuch-gedaechtnis.html`:

- Der Inhalt liest sich wie ein Protokoll: eigene dichte Größenstufe nur für den Inhaltsbereich
  (Text 14px, Feldnamen 11px, Titel 20px, Knöpfe 26px, Zeilenhöhe 1,3). Der Rahmen bleibt desk.
- Keine Spalten: Die Felder stehen untereinander. Weiter ist eingerückt und beginnt genau unter
  den Strichen von Stand, damit es als Unterpunkt zu lesen ist. Offen und Bezug stehen wieder
  auf der Ebene von Stand.

## Heute

- Ein Eintrag hat vier Felder (`status`, `next_step`, `open_questions`, `refs`), jedes ein
  einzelner Text. Ein Eintrag ist eine Momentaufnahme; maßgeblich ist der neueste.
- „Wo war ich“ zeigt je Thema nur den Stand. Weiter und Offen stehen erst im Verlauf.
- Das Formular hat einzeilige Felder für Weiter und Bezug und beginnt bei jedem Eintrag leer.
- Der Summarizer der Hooks schreibt Stand als „1–2 Sätze“.

## A. Spiegelstriche (ohne Schemaänderung)

Status 2026-10-23: umgesetzt. `note.ts` (`parseNote`, `continueList`), `LcNoteText`,
`LcFieldArea` setzt Striche per Enter fort, `EntryFields` untereinander mit eingerücktem Weiter,
Formular mit Projekt/Thema in einer Zeile und vier mehrzeiligen Feldern, Dichte `log` auf allen
logbuch-Seiten, Kopf eines Themas in „Wo war ich“ in einer Zeile. CLI rückt mehrzeilige Werte
ein, Hooks verlangen Spiegelstriche. Geprüft: 206 Unit-, 13 Python-, 5 e2e-Tests.

Gespeichert wird weiter Klartext mit Zeilenumbrüchen. Jede Zeile, die mit `- ` beginnt, ist ein
Punkt; andere Zeilen sind Absätze. Damit bleiben alte Einträge gültig, und das CLI sieht
dieselben Daten.

1. **Anzeige** (`EntryFields.vue` → neue Komponente `LcNoteText` unter
   `src/renderer/components/`): Text in Absätze und Punkte zerlegen. Punkte bekommen einen
   lavendelfarbenen Strich (Text `–`, kein Icon) und hängenden Einzug.
2. **Eingabe** (`LcFieldArea`): Stand, Weiter und Offen werden mehrzeilig, Bezug auch. Steht der
   Cursor in einer `- `-Zeile, setzt Enter in der nächsten Zeile wieder `- `. Enter auf einem leeren
   `- ` beendet die Liste. Cmd/Strg+Enter speichert wie bisher.
3. **CLI-Ausgabe** (`format_entry`): Mehrzeilige Werte werden unter dem Label eingerückt statt
   in einer Zeile ausgegeben.
4. **Hooks** (`SUMMARY_PROMPT`): Stand, Weiter und Offen kommen als Spiegelstriche (`- …`, je
   2–5 Punkte, konkret: Dateien, Entscheidungen, Befehle). Der SessionStart-Hinweis zeigt
   Claude, wie man mehrzeilig schreibt (`$'- a\n- b'`).

## B. Themenseite und Fortschreiben

Status 2026-10-24: umgesetzt. Aktueller Stand groß oben, Verlauf neueste zuerst als
aufklappbare Zeilen, `+ STAND` belegt das Formular mit dem letzten Eintrag vor.

1. **Themenseite** (`HistoryView` → Route `logbuch.history` bleibt): Oben steht der aktuelle
   Stand groß (Stand, Weiter, Offen, Bezug mit Spiegelstrichen). Darunter folgen die Befehle
   `+ STAND`, `ANHEFTEN`/`LÖSEN` und `ABSCHLIESSEN`, darunter der Verlauf der älteren Einträge.
2. **Fortschreiben:** `+ STAND` öffnet das Formular mit dem letzten Stand vorbelegt (Stand,
   Weiter, Offen, Bezug). Du änderst nur, was sich bewegt hat, und der neue Eintrag bleibt eine
   vollständige Momentaufnahme.
3. **„Wo war ich“:** Angeheftete Themen stehen oben. Je Thema werden Stand und Weiter gezeigt
   (gekürzt auf wenige Zeilen), nicht nur der Stand.

## C. Angeheftete Themen

Status 2026-10-24: umgesetzt, mit Änderung: Die Rail trägt nur noch START und die Dienste
(Patrick: weitere Dienste wie ein Portscanner kommen dazu). Die Pins stehen deshalb als
Pill-Reihe oben auf „Wo war ich“ und der Themenseite; Cmd/Strg+1–4 gilt, solange die Reihe
sichtbar ist (nicht im Formular). Das Plattform-Feature „Unterseiten in der Rail“ ist entfernt.

**Speicherort:** neue Tabelle in der logbuch-DB, damit CLI, Hooks und App dieselben Pins sehen:

```sql
CREATE TABLE IF NOT EXISTS pins (
    project TEXT NOT NULL,
    topic TEXT NOT NULL COLLATE NOCASE,
    position INTEGER NOT NULL,      -- 1..4, Taste Cmd/Strg+position
    ts TEXT NOT NULL,
    PRIMARY KEY (project, topic)
);
```

- Es gibt höchstens 4 Pins. Ein fünfter wird abgelehnt (Code `pins-full`), die UI sagt, welcher
  Pin gelöst werden muss.
- Ein abgeschlossenes Thema verliert seinen Pin (`fertig` / `done` löschen ihn in derselben
  Transaktion). Die Positionen rücken nicht nach, damit die Tasten stabil bleiben; ein neuer Pin
  nimmt die kleinste freie Position.
- **CLI** (Quelle der Wahrheit): `logbuch anheften <thema>` und `logbuch loesen <thema>`.
  `logbuch wo` zeigt angeheftete Themen zuerst, mit `[1]`…`[4]` markiert.
- **Dienst:** Vertrag um `pins`, `pin` und `unpin` erweitern. Der Store legt die Tabelle an
  wie `entries` (`CREATE TABLE IF NOT EXISTS`). Vertragstest gegen das CLI.
- **Rail:** Die Pins erscheinen dauerhaft als Rail-Knöpfe `1 TRICORDER` … unter den
  Dienst-Knöpfen, also auch von der Startseite aus. Dafür braucht die Plattform einen
  **dynamischen Nav-Beitrag** eines Dienstes: `ui/routes.ts` exportiert optional
  `useNav(): ComputedRef<ServiceNavItem[]>`, und `App.vue` hängt die Einträge an. Heute kennt
  die Rail nur statische `meta.navKey`-Routen.
- **Tasten:** Cmd+1–4 (macOS) bzw. Strg+1–4 (Windows) springen zur Themenseite. Das läuft über
  einen Keydown-Handler im Renderer, nicht über einen globalen OS-Shortcut, und ist in
  Eingabefeldern aktiv, weil die Modifier-Taste eindeutig ist.
- **SessionStart-Hook:** Er nennt zuerst die angehefteten Themen des Projekts, dann die übrigen
  offenen.

## D. CLI: mehrzeilig bequem

`logbuch merk <thema> -e` öffnet `$EDITOR` mit einer Vorlage, die mit dem letzten Stand des
Themas vorbelegt ist:

```
# Stand
- …
# Weiter
- …
# Offen
# Bezug
```

Nach dem Speichern wird der Eintrag geschrieben; bleibt die Datei leer oder unverändert, bricht
der Befehl ab. Der bisherige Aufruf mit Argumenten bleibt.

## Reihenfolge und Prüfung

A → B → C → D, jeweils mit Tests: Python-`unittest` fürs CLI, Vitest für Store, Vertrag und
Views, ein e2e-Ablauf (Thema anheften → Cmd+1 → `+ STAND` vorbelegt → Spiegelstriche speichern
→ per CLI geschriebener Eintrag erscheint live). Screenshots in der Dichte desk.

Die Dichte-Arbeit (`docs/plan-dichte-desk.md`, Phase 2 upstream) ruht so lange; die neuen
Komponenten nutzen bereits die Dichte-Variablen.
