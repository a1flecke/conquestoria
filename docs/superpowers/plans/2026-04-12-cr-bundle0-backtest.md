# Bundle 0 Back-Test — April 12 Bugs vs New Enforcement Hook

Verifies that `.claude/hooks/check-src-edit.sh` would have caught the three regex-detectable bugs surfaced in the April 12 code review, had it been in place earlier.

**Baseline SHA checked:** `9eae2dc` (state at review time).

## Results

| Issue | File | Pattern matched | Hook exit | Caught? |
|-------|-----------------------------------|-----------------------|-----------|---------|
| 2     | `src/systems/faction-system.ts`   | Direct state mutation | 2         | Yes |
| 1     | `src/systems/council-system.ts`   | `cities[0]` in UI/rec | 2         | Yes |
| 5     | `src/core/hotseat-events.ts`      | Dead-field heuristic  | 2         | Yes |

## Reproduce

```bash
BACKTEST=/tmp/cr-backtest
rm -rf "$BACKTEST"; mkdir -p "$BACKTEST/src/systems" "$BACKTEST/src/core"

git show 9eae2dc:src/systems/faction-system.ts > "$BACKTEST/src/systems/faction-system.ts"
git show 9eae2dc:src/systems/council-system.ts > "$BACKTEST/src/systems/council-system.ts"
git show 9eae2dc:src/core/hotseat-events.ts > "$BACKTEST/src/core/hotseat-events.ts"

for f in \
  "$BACKTEST/src/systems/faction-system.ts" \
  "$BACKTEST/src/systems/council-system.ts" \
  "$BACKTEST/src/core/hotseat-events.ts" ; do
  echo "=== $f ==="
  echo "{\"tool_input\":{\"file_path\":\"$f\"}}" | .claude/hooks/check-src-edit.sh
  echo "exit=$?"
done
```

## Captured hits

**faction-system.ts** — 5 mutation sites flagged including `state.units[rebel.id] = rebel` (line 104) and `state.cities[cityId] = updated` (lines 127, 134, 140).

**council-system.ts** — `state.civilizations[civId]?.cities[0]` (line 12) flagged; file not on allowlist (allowlist is `src/ai/**` and `src/systems/faction-system.ts` only).

**hotseat-events.ts** — `sciencePerTurn: 0, // calculated at render time from city yields` (line 72) flagged by the placeholder-with-`// calculated`-comment heuristic.

## Not regex-detectable (would still need review)

Issues 3 (breakaway diplomacy wiring), 4 (queue truncation), 6 (rebel spawn occupancy), 7 (minor-civ color leak) are too semantic for a grep rule. They are addressed by documented rule sections in `.claude/rules/*.md` and remain reliant on the `code-review:code-review` skill before merge, which the pre-push hook now reminds about.
