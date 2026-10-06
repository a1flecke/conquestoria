# Playtest recorder (#1244)

A local-only tool for measuring whether the midgame is strategy or administrative churn. A human tester turns it
on, plays normally, and exports a JSON log. Pacing tooling tells us how fast things happen; this tells us what
the player had to *do*.

## Turning it on

Open the game with `?playtest=1` (for example `http://localhost:5173/?playtest=1`). Any other value, or no
query, leaves it off. The flag is read once at start-up by `src/main.ts` and handed to `createAppComposition`;
with it off **nothing is constructed**: no recorder, no DOM observer, no click listener, no export button, and
`turnFlow` is the unwrapped controller.

With it on, a small **Export playtest log** button appears bottom-left. Pressing it saves
`conquestoria-playtest-log.json` through the platform's normal local save path
(`getSaveFileAdapter().exportText`, the same one the save panel uses; in the desktop app that is the native
save dialog).

## What it never does

- No network request, no analytics service, no account or device identifier.
- No change to `GameState`, to any save, or to IndexedDB. The log lives in memory; closing the tab discards it.
- No timestamp in simulation state. Durations come from an injectable clock and are reported **relative to the
  recorder's own start**, never as wall-clock times.
- No imports from `src/systems`: the recorder is an app-layer observer holding a read-only session port
  (`getState` + `subscribe`, never `commit`). `tests/app/architecture/rules.ts` pins that only
  `src/app/bootstrap.ts` may import it (`playtest-recorder-has-one-importer`).
- No names. Seats are identified by their seat id (`player`, `player-1`, …), never a player's typed name.

## How it observes (one seam per fact)

| Fact | Seam |
|---|---|
| A seat's turn row begins/ends | `GameSession.subscribe` publications. A seat's turn begins at the publication that *reveals* it, so hot-seat's silent adoption is correctly not a turn start. |
| The moment a turn is ended | `withPlaytestEndTurn` decorates `turnFlow.endTurn` once at the composition root, covering the End Turn button, the unmoved-units confirmation and every other caller. The latest request in a turn wins. |
| Panel opens by id | A `MutationObserver` on the UI layer matches added elements against the panel registry's DOM ids, so parameterized panels (city, wonder) are covered like the rest. A panel re-rendered in place counts as another open. |
| Council cards shown / acted on | The pure `buildCouncilAgenda` at the moment the Council appears, and a delegated click on `#council-panel button[data-card-id]`. |
| Notifications by type | The seat's own persisted notification log, by first-seen entry id. What predates recording is a baseline, not "this turn". |
| Idle cities / idle units / gold at end turn | `getIdleCityIds` and `getUnmovedUnitsForEndTurn` (the predicate the end-turn warning uses), read at the end-turn request. |
| Constraints shown, and turns to clear | `buildStrategicAssessment` at each turn start. A constraint missing from a full (capped) set is not counted as cleared. |
| Victory-lane changes | The assessment's lane stages compared between turn starts. |

## Export schema (v1)

```jsonc
{
  "schema": "conquestoria-playtest-log",
  "schemaVersion": 1,
  "note": "Local only. Never uploaded. …",
  "games": [                      // one entry per campaign loaded in the session
    {
      "gameId": "…",
      "seats": {                  // hot seat keeps seats apart
        "player": {
          "turns": [
            {
              "turn": 42,
              "startedAtMs": 1344,          // relative to recorder start
              "closed": true,               // false for the turn in progress at export
              "endRequested": true,
              "durationMs": 17730,          // turn start -> last end-turn request; null if none
              "panelOpens": { "council": 1, "city": 1 },
              "idleCitiesAtEnd": 0, "idleUnitsAtEnd": 2, "goldAtEnd": 0,
              "notifications": { "total": 2, "byType": { "info": 2, "success": 0, "warning": 0 } },
              "council": {
                "cardsShown": 2,
                "cardsShownByBucket": { "do-now": 1, "soon": 0, "to-win": 0, "drama": 1 },
                "constraintKindsShown": ["food"],
                "actionsTaken": ["constraint-food"]
              },
              "constraintsShown": ["food"],
              "victoryChanges": []
            }
          ],
          "constraintLifetimes": [
            { "kind": "food", "firstSeenTurn": 42, "resolvedTurn": null, "turnsToResolve": null }
          ]
        }
      }
    }
  ]
}
```

A change to this shape bumps `schemaVersion`; `tests/app/playtest-recorder.test.ts` pins the row's key set.

## Reading a log

- **Churn**: high `idleCitiesAtEnd` / `idleUnitsAtEnd` at end turn, many `panelOpens` and notifications per turn,
  long `durationMs` with no Council use.
- **Does the advice help?** `council.cardsShown` vs `actionsTaken`, and `constraintLifetimes.turnsToResolve`
  (how long a problem the Council named took to clear).
- **Hot seat**: compare seats under `games[].seats`.

## Turning a log into a report

`yarn playtest:report <log.json> ...` (see [playtest-protocol.md](playtest-protocol.md)) reads one or more exports and
prints deterministic, evidence-only observations (Markdown, or `--format json`). It supports schema v1 only and rejects any
other `schemaVersion`; a recorder change that bumps the version needs the report updated in the same PR.

## Tests

`tests/app/playtest-recorder.test.ts` (fake session, fake clock, canonical predicates, hot seat, export shape),
`tests/ui/playtest-export-button.test.ts`, the flag-off/on composition cases in `tests/app/bootstrap.test.ts`,
and the browser spec `tests/e2e/issue-1244-playtest-recorder.spec.ts` (flag off shows nothing; flag on plays two
real turns, uses the Council and exports through the real download path). Set `PLAYTEST_SAMPLE_OUT=<path>` when
running that spec to keep the exported file.
