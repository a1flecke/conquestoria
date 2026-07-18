# Issue #523: Dual-era pacing design

## Status and intent

Issue #523 identifies a pacing/fairness failure: the shared `state.era` currently jumps when any civilization completes a single qualifying technology. That value then directly changes threats, combat pacing, crises, minor-civilization upgrades, and national-project windows for every player.

This design preserves a shared sense of history while making a civilization's own research the authoritative source for rules that affect it. It must make relaxed solo, family, competitive, and hot-seat games equally legible and fair without weakening advanced-player strategy or AI play.

## Player contract

The game has two clearly named clocks:

| Clock | Meaning | Authority |
|---|---|---|
| **Your Era / Civilization Era** | The age reached by one civilization's research. | All owner- or target-facing gameplay rules. |
| **World Age** | A shared historical milestone reached by the group. | Timeline, aggregate announcement, diplomacy flavor, codex/history, and explicitly designed non-punitive shared content. |

The player-facing rule is: **“Your research changes your civilization; the World Age tells the shared story.”** No direct penalty against a slower civilization may silently fall back to World Age.

### Civilization-era progression

Civilization era is derived, never separately mutable state. A civilization advances only through contiguous qualifying technology completion: it must meet each preceding era's threshold before a later era counts.

Thresholds are authored data in the era pacing profile:

| Era band | Qualifying technologies required | Purpose |
|---|---:|---|
| Eras 2–3 | 50% (rounded up) | Early delight and quick access to recognizable new choices for new/young players. |
| Eras 4–8 | 60% (rounded up) | The strategic core rewards broad development rather than a one-track power rush. |
| Eras 9–12 | 55% (rounded up) | Preserves endgame momentum and supports specialized late-game play. |
| Era 13 | 1 authored qualifying technology | Intentional final milestone with the current authored roster. |

`countsForEraAdvancement: false` technologies remain excluded. Difficulty modes do **not** alter the definition of an era; they affect research pace and AI challenge through their existing knobs. This keeps the rules teachable across ages and modes.

### World-Age progression

World Age is the highest era reached by a strict majority of active major civilizations. For `n` active, non-eliminated major civilizations, the required count is `floor(n / 2) + 1`. A civilization at a later personal era counts toward every lower era it has passed. Minor civilizations, barbarians, pirates, beasts, and eliminated majors never count.

This prevents a runaway AI from advancing the world alone while preserving a meaningful shared milestone. It also works consistently in solo and hot-seat games: human players and AI use exactly the same calculation.

## Gameplay ownership

Every era-sensitive rule must receive an explicit era source; generic `state.era` use is not acceptable except for declared World-Age-only presentation/content.

| Consumer | Required source | Rule |
|---|---|---|
| Technology/city availability, national-project availability, expiry, and yield fading | Project/city owner civilization era | A player never loses or fades a project because a rival advanced. |
| Crisis eligibility, flavor bands, beast awakening, and severity | Target civilization era | Difficulty profiles may tune frequency and severity, never replace the era source. |
| Combat's quick early-fight multiplier | Minimum of the two involved civilizations' personal eras | Advanced unit strength still matters; the scalar only keeps early and mixed-era fights from becoming unexpectedly slow. |
| AI research and strategic planning | Acting AI civilization era | Use the canonical resolver already used by AI planning; do not add AI-only thresholds. |
| Barbarian spawning | Intended target civilization era | Spawn a unit appropriate for the civilization the camp is pressuring. |
| Barbarian target selection | Target-safe eligibility | A neutral unit may not select/attack a civilization whose personal era is below the unit's authored pressure era. |
| Minor-civilization upgrade/spawn pressure | Deterministic local-pressure era, capped to engagement target | Distant leaders cannot upgrade a local garrison; no neutral threat may out-era the civilization it engages. |
| Timeline, aggregate history, diplomacy flavor, World-Age announcement | World Age | These must remain non-punitive and must not reveal private research in hot-seat games. |

### Neutral-pressure resolver

Neutral actors need a shared, deterministic helper rather than ad-hoc use of World Age.

1. Resolve the intended major-civilization target from the existing actor/camp targeting context.
2. If a target is known, use that target's personal era.
3. If no target is known, derive a local candidate set from active major cities within `NEUTRAL_PRESSURE_LOCAL_RADIUS = 7` hexes, using existing wrapped-distance rules; choose the median candidate era with deterministic civ-ID tie-breaking.
4. If that set is empty, the actor remains at its current safe tier and must not spawn or upgrade into a higher tier until it has a target/local candidate. Existing neutral units remain target-safe under step 5.
5. Before a neutral actor attacks or retargets, enforce the target-safe eligibility cap. It may patrol, defend, or choose an eligible target instead.

The resolver and its radius are shared by barbarian and minor-civilization systems. It returns an era, not a unit type; each system retains its own roster/upgrade definitions. This makes later neutral factions extensible without adding world-era branches.

## Architecture and data

### Canonical helpers

The implementation must centralize these pure, typed helpers near technology/era definitions:

- `resolveCivilizationEra(completedTechIds)` — uses the authored band threshold and contiguous requirement.
- `resolveWorldAge(civilizations)` — strict-majority aggregation over active majors.
- `resolveCombatEra(state, attackerOwner, defenderOwner)` — handles major, neutral, and other owner kinds explicitly. A neutral participant uses its resolved/authored pressure era; the final scalar is still the lower involved era.
- `resolveNeutralPressureEra(state, position, intendedTargetId?)` and target-eligibility helpers.

Existing call sites must call these helpers, not recreate arithmetic or scan `state.era`. Exact ownership classification must use the project's canonical owner-kind helpers.

### State and save compatibility

`state.era` remains the persisted World Age for compatibility. Personal eras are derived from serialized completed technology IDs and are never cached on `Civilization`; this avoids duplicate mutable state and automatically keeps new/loaded saves coherent.

Introduce a versioned, deterministic save migration that:

1. Recomputes `state.era` as World Age from active major civilizations' derived personal eras.
2. Normalizes existing active national-project queues against the owning civilization's personal era, preserving valid active work even if the old global era would have removed it.
3. Does not recreate historical projects already removed/expired by old behavior, manufacture rewards, or emit notifications.
4. Is idempotent: loading a migrated save again produces an identical state.

New optional neutral-actor metadata is allowed only if it is necessary to enforce target-safe behavior; it must have an explicit legacy default and be included in schema migration. Prefer deriving authored pressure era from existing unit/roster definitions over adding per-unit state.

## UI, UX, sound, and accessibility

- HUD exposes **Your Era** for `currentPlayer` and **World Age** with distinct, concise help text. World Age is aggregate only.
- The technology panel shows exact progress to the next personal era (for example, `16 / 18 qualifying technologies`) and states the applicable 50%, 60%, or 55% rule. It updates immediately after research completes.
- Personal-era advancement emits `civilization:era-advanced` with `civId`, old era, and new era. The UI filters it to the active human viewer, writes a durable player-scoped notification/log entry, and plays a short UI SFX cue; it must not change the adaptive music era.
- World-Age advancement retains the existing `era:advanced` event for the shared music/history transition and emits one aggregate notification/log entry. Its existing transition cue is the calmer shared-history sound; it must not name a rival or disclose unseen research.
- All dynamic DOM text uses the project's safe DOM pattern; sound obeys existing mute/accessibility settings.
- In hot-seat, panels rerender against `state.currentPlayer`. No personal-era progress, research detail, or inferred rival threshold is shown to another seat; aggregate World Age remains visible.

## Difficulty, fun, and AI behavior

- **Explorer/younger or relaxed play:** faster early 50% personal thresholds provide visible progress and avoid foreign-AI difficulty spikes.
- **Standard play:** the 60% middle maintains meaningful breadth, national-project planning, and satisfying counterplay.
- **Veteran/competitive play:** players may race ahead for unit and unlock advantages, but cannot force passive opponents into a punitive new world tier. Existing challenge profiles continue to set AI research/pressure behavior.
- AI uses the same personal-era resolver as players. Neutral-pressure logic is deterministic and target-safe, so it does not introduce hidden AI advantages or non-reproducible behavior.
- Later-era 55% thresholds prevent stalled endings while retaining strategic specialization. Balance validation must examine authored late-era science costs and match completion times, not threshold counts alone.

## Events and notifications

Era changes are determined at the mutation/turn source and emitted from an explicit before/after diff. Do not infer one-time notifications by scanning a loaded final state.

- Emit a personal-era event for each civilization whose derived era rises during a turn; UI/audio subscribes only for the active human viewer.
- Emit one World-Age event when the strict-majority world value rises. A multi-step catch-up calculation is represented as one visible transition to the final age, avoiding notification floods.
- Loading/migrating a save never emits either event.

## Test and regression contract

### Pure logic

- Threshold band boundary tests: just below and at 50%, 60%, and 55%; Era 13; excluded scaffolding technologies.
- Contiguous progression: later-era technology alone cannot skip an unmet earlier threshold.
- Majority math: two, three, four, and five active majors; strict-majority boundaries; eliminated civ exclusion; no neutral owner inclusion.
- Neutral resolver: target selection, local median, wrapped-map distance, deterministic ties, no-candidate safe behavior, and target-safe negative cases.

### Gameplay and caller parity

- A human and an AI may advance personal era independently without changing the other's projects, crises, or direct pressure.
- Combat tests cover human-vs-AI, AI-vs-human, air, pirate, minor-civ, and barbarian callers; mixed-era early pacing uses the lower involved personal era.
- Barbarian/minor-civ tests prove a distant advanced AI cannot create an over-tier neutral attacker against an early-era player.
- National-project tests prove owner-era availability, expiry, queue preservation, and yield fading; a rival's era alone is a negative case.
- Crisis/beast tests prove target-era eligibility and challenge-profile parity across human/AI paths.

### UI, sound, and hot-seat

- HUD and technology-panel tests assert the exact labels/progress and immediate rerender after research changes state.
- Negative tests prove World Age is not presented as personal unlock progress and unavailable/next-era labels do not include incorrect items.
- Notification-log tests assert distinct personal/world messages and no duplicate/replayed migration notification; audio-dispatch tests assert that personal advancement uses the UI cue, World Age retains the music-transition cue, and both respect muted settings.
- Hot-seat tests switch `currentPlayer` and prove personal progress is viewer-scoped while World Age is aggregate and non-leaking.

### Persistence, balance, and implementation verification

- Migration tests start from legacy saves with artificially high old `state.era`, verify deterministic recalculation, active queue preservation, no historical resurrection, and idempotent reload.
- Deterministic solo simulations cover each built-in difficulty, multiple seeded maps, early/mid/late progress, AI catch-up, and practical completion time.
- Statistical combat checks keep same-tier early encounters within the existing 2–4-exchange target and check mixed-era outcomes.
- Before implementation is considered complete, inspect all `state.era` reads and classify each as World Age, personal era, neutral pressure, or unrelated legacy migration. No direct gameplay consumer may remain unclassified.

## Scope and delivery

This is a cross-system change and must be delivered in reviewable slices: canonical era helpers/data and tests; consumer migration with parity tests; UI/events/audio/hot-seat tests; save migration and full deterministic regression sweep. Each slice must preserve a runnable game and avoid a temporary state where one caller still uses the old global rule.

Out of scope: changing technology costs, difficulty profile values, unit roster balance, adding new global punitive events, or retroactively restoring already-expired historical projects. Those changes require separate design decisions after playtest evidence.
