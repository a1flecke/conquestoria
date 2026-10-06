# Playtest protocol (#1363)

How to gather human play evidence that can be read next to the numbers. The goal is a small, repeatable battery, not
user-research infrastructure. Everything stays on the tester's machine.

## 1. Record

Open the game with `?playtest=1` ([playtest-recorder.md](playtest-recorder.md)), play normally, then press
**Export playtest log** and save the file. One file per sitting. Do not edit it.

## 2. A useful set of sessions

Collect what you can; the report works with one file and gets more useful with several.

| Session | Why it matters |
|---|---|
| Early game (first ~40 turns) | Is the opening clear, or administrative? |
| Midgame continuation of the same campaign | Where churn and idle cities/units appear once there is a lot to manage. |
| Late-game continuation, when a campaign gets there | What the long tail feels like. Not required; the rest of the battery stands alone. |
| A hot-seat sitting | Per-seat logs stay separate; compare seats. |
| A new or casual player | Where does someone with no habits stall? |
| An experienced 4X player | What do they find redundant or opaque? |
| An optimisation-minded player | What do they route around? |

Do not collect names, contact details, health information or anything else unrelated to the game. Seats appear in the
log by seat id only.

## 3. Ask five questions right after the session

Write the answers next to the log (a few lines each is plenty):

1. What was your plan this session?
2. When did a turn feel administrative rather than strategic?
3. Which Council recommendation did you ignore, and why?
4. Was there a point where you stopped knowing what to do next?
5. Which rival, war, crisis, or decision was most memorable? What would make you want to play one more turn?

## 4. Turn the logs into a report

```bash
./scripts/run-with-mise.sh yarn playtest:report session-1.json session-2.json
./scripts/run-with-mise.sh yarn playtest:report session-1.json --format json --out report.json
```

The command reads only the files you give it (no game state, no network) and prints a Markdown summary, or the
machine-readable report with `--format json`. The same input bytes always give the same output: sessions are labelled
by a hash of their content (`s-xxxxxxxx`), never by file name or path, there are no timestamps, and every list has a
fixed tie-break. A file with a different `schema`/`schemaVersion`, or one that is malformed, is rejected with a message
and produces no report.

## 5. Read evidence, then judge

The report states **observations**, for example:

> food was a strategic constraint on 11 turns; the Council showed it on 11; its action button was used 1 time.

It does not say a mechanic is unbalanced or a screen is poor, and it cannot measure fun. Read the observations
beside the tester's answers, then decide with people. A pattern worth acting on becomes a focused issue that quotes the
evidence; the report itself never retunes anything.

What it covers (all from fields the recorder already captures): turns, seats and turn-time spread (median, p90, max, the
longest turns), notifications per turn, panel opens and reopens and unusually busy turns, idle cities and units at end
turn and repeated idle stretches, Council cards shown vs action-button uses and how long each constraint lived (and
whether it came back), victory-lane transitions and the longest stretch without one, and gold at end of turn. The log
records which card **ids** were acted on, not their buckets, so an action rate by bucket is reported as unavailable
rather than guessed.
