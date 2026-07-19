# Pillage, Civilian Capture & Prize Crews Design

## Goal

Issue #541 (battle-mechanics arc #546, package 4) gives economic warfare a
verb. Today no pillaging exists anywhere in `src/` — improvements are only
ever destroyed by catastrophe crises at their epicenter — and civilians
(workers/settlers/caravans/naval traders) are always killed on defeat, never
captured. This leaves barbarians, pirates, and the #526/#535 world-pressure
arc without real teeth, and gives players and AI civs no way to wage war
against an enemy's economy short of razing whole cities. This design adds
three related combat-adjacent actions — pillage, civilian capture, and
naval prize-crew capture — sharing one deterministic, no-silent-destruction
philosophy.

## Scope

- **Pillage**: a combat unit standing on an enemy-owned tile with a
  completed improvement and/or road may spend its action to burn it for a
  one-time gold reward and a small heal.
- **Civilian capture**: a defeated, unescorted unit of `UnitClass:
  'civilian'` (land or naval trade) is always captured (ownership transfers)
  instead of destroyed.
- **Prize crews**: a decisively-won naval combat against a naval military
  unit captures the hull instead of sinking it, at every era.
- Barbarian raid plans, pirate plunder, and AI civs at war all use pillage
  and capture through the same shared helpers the player uses — this is
  required, not optional.
- A new challenge-profile field scales barbarian/pirate pillage
  aggressiveness by difficulty.

## Non-goals

- No settings toggle to disable pillage/capture — framing (see below)
  carries the age range, the same way undecorated combat already does.
- No new movement, blockade, or supply mechanics.
- No changes to city capture/siege — that is handled by the existing
  city-as-combat-entity path (#522) and is out of scope here.
- No morale/rout, formations, or fuel/ammo tracking — already rejected for
  this arc in #546.
- Witness-reputation counting of third-party pillage (#526 MR6/7) is noted
  as a future hook, not built in this change.

## Pillage

### Targeting and action

A unit with `UNIT_DEFINITIONS[unit.type].strength > 0`, standing on a tile
where `tile.owner` is a different civ (or `null`/barbarian-owned
improvement) and `!unit.hasActed`, gets a "Pillage" action alongside its
existing Fortify/Rest/Skip Turn buttons in `selected-unit-info.ts`, using
the same contextual-button pattern already used there (e.g. the worker
`onWorkerAction` button at line 425).

One action pillages everything present on the tile in a single step:

- If `tile.improvement !== 'none'` and `tile.improvementTurnsLeft === 0`:
  set `improvement: 'none'`, `improvementTurnsLeft: 0`, and award the
  pillaging civ gold, and heal the pillaging unit by +25 (capped at 100).
  Improvements have no existing gold/production "build cost" field today —
  `IMPROVEMENT_BUILD_TURNS` (`improvement-system.ts:155`) tracks worker-turns,
  not currency. Rather than inventing a per-improvement-type gold table to
  hand-maintain (and re-tune every time a new improvement ships), pillage
  gold derives from that existing field: `pillageGold =
  round(IMPROVEMENT_BUILD_TURNS[type] * GOLD_PER_PILLAGE_BUILD_TURN)`, with
  `GOLD_PER_PILLAGE_BUILD_TURN` a single new tunable constant (starting
  value: 3 — e.g. a farm at 4 build turns yields 12 gold, an oil well at 5
  build turns yields 15). This keeps a new improvement type correctly
  pillage-valued for free instead of needing a second hand-authored table in
  parallel with `IMPROVEMENT_BUILD_TURNS`. The exact constant is subject to
  the pacing-audit gate in Test Strategy, not fixed by this design.
- If `tile.hasRoad`: also clear `hasRoad`, in the same action.
- A tile with only an in-progress improvement (`improvementTurnsLeft > 0`)
  and no road offers no Pillage action — there is nothing finished to burn.
- A tile with `tile.owner === pillagingUnit.owner` (recovering your own
  territory) awards **zero** gold even if it still shows an enemy-built
  improvement — prevents scorched-earth gold farming on recaptured land.
- Pillaging consumes the unit's full action (`hasActed: true`,
  `movementPointsLeft: 0`), mirroring Fortify/Rest.

### Consumers to audit

`improvementTurnsLeft` and `improvement` are read by several existing
systems (resource acquisition, city-work, quest objectives). Setting
`improvement: 'none'` mid-build is not a new state shape — it is the same
state a freshly-cleared tile already has — but the implementation plan must
enumerate every reader of these two fields and confirm none of them assume
"improvement was here, therefore X" in a way pillage would violate.

### UI

Before executing, show a confirm prompt naming the improvement and the gold
reward (reusing the existing `window.confirm()` preview pattern already
used for spy infiltration in `main.ts:2214`) — satisfies the no-silent-
destructive-UI rule for a destructive, non-reversible action. A completed
pillage posts a notification: `Pillaged {improvement name} for {N} gold`.

### Balance

Pillage gold is a **one-time combat reward**, not a recurring yield — the
wonder/national-project `civYieldBonus`/`cityYieldBonus` ceilings in
`game-balance.md` do not apply to it. Its own ceiling is: capped by the
`GOLD_PER_PILLAGE_BUILD_TURN` constant above, zero gold on your own
territory, one pillage per unit per turn (the action-consumption rule
already enforces this).

## Civilian Capture

### Eligibility

Every `UnitType` whose `UNIT_CLASS_BY_TYPE` entry includes `'civilian'` is
capturable: `settler`, `worker`, `missionary`, `caravan`, `merchant_wagon`,
`freight_convoy`, `expedition`, and the naval trade line (`transport`,
`carrack`, `galleon`, `steamship`, `troop_transport`, `naval_trader`,
`steamship_trader`, `cargo_freighter`, `container_ship`). Driving this off
the existing class tag (rather than a hand-maintained type list) means a
future civilian unit is covered automatically, matching this codebase's
existing convention of data-table-driven behavior (e.g. the
`NP_PRODUCTION_DISCOUNTS` table in `game-balance.md`).

### Mechanism

Deterministic ownership transfer — no new RNG. This extends the pattern
`applyCombatOutcomeToState` already implements for `cyber_unit`
(`combat-reward-system.ts:291–305` on the attacker-loses side,
`:329–343` on the defender-loses side): instead of
`removeUnitFromCopies`, the losing civilian's `owner` field is set to the
winner, and both civs' `civilizations[id].units[]` arrays are updated in
the same mutation (remove from loser, add to winner). A defeated,
unescorted civilian is **always** captured; there is no chance to instead
destroy it or have it escape.

### Identity on capture

A captured unit keeps its own type — a captured caravan is still a caravan,
a captured galleon is still a galleon — **except** `settler`, which
converts to `worker` on capture (matching the existing `applyUpgrade`
type-swap helper in `unit-upgrade-system.ts:77`: swap `type`, normalize
`health` to 100, zero `movementPointsLeft`, mark `hasActed: true`). This is
the one deliberate downgrade: capturing an enemy settler must not hand the
capturing civ a free city-founding unit.

### Side-state cleanup on capture

Some civilian types carry side state beyond `civ.units[]` membership — an
active `TradeRoute` anchored to a captured caravan/merchant_wagon/
freight_convoy/naval_trader, or a missionary's `missionaryCooldownUntilTurn`.
The implementation plan must audit each civilian type's death-cleanup path
today (what currently happens to this side state when the unit is killed)
and reconcile it identically on capture — a trade route silently pointing
at a unit that changed owners is the same class of dangling-reference bug
`game-systems.md`'s diplomacy-lifecycle rule warns about for civ removal.

### Escort protection

No new code needed: `selectDefenderForAttack` (`combat-system.ts:39`)
already sorts stack defenders by "can fight" (`strength > 0`) first, so a
combat unit stacked with a civilian is always chosen as the defender ahead
of the civilian. A civilian is only ever the resolved defender when it is
alone on its tile. This must be covered by a regression test, not just
inferred from reading the sort — see Test Strategy.

### Framing

"They join you" — no enslavement language, matching the addendum. This is
consistent with the `content-description-honesty.md` spirit: the capture
notification text must describe only what actually happens (ownership
transfer), not invent a mechanic that doesn't exist.

## Prize Crews (Naval Military Capture)

### Scope

Applies to every naval military `UnitType` (`UNIT_CLASS_BY_TYPE` includes
`'naval'` but not `'civilian'`) at every era — galley/trireme through
submarine/carrier/missile_submarine, and all `pirate_*` naval types. The
mechanic is not retired after the Age of Sail: pirates, "ghost navies," and
submarine crews are all still boardable/capturable in the modern era, per
direct guidance — only the flavor text changes, not the mechanic.
`beast_sea_serpent` also carries `'naval'` but is explicitly excluded: it is
a legendary-beast unit (`game-systems.md`'s beast exception — owned by the
`'beasts'` owner constant, not a player civ), and "capturing" a legendary
sea monster as a prize hull is not a real interaction this design covers.

### Trigger

Deterministic threshold, evaluated at combat resolution whenever the loser
of a naval-military-vs-naval-military combat would otherwise be destroyed
(bidirectional — either the attacker or the defender can be the one
captured, mirroring `cyber_unit`'s existing bidirectional treatment):

- The losing unit's effective combat strength for this exchange was **≤
  50%** of the winning unit's (a decisive, roughly-2:1-or-better win),
  **and**
- The winning unit's health after the exchange is **≥ 50%**.

If both hold, the losing naval military unit is captured (ownership
transfers, same `civ.units[]` bookkeeping as civilian capture) instead of
being removed. If either fails, today's behavior (destroy) applies
unchanged. "Effective combat strength" here means whatever the combat
resolver already computed for each side to determine the exchange (attacker
offense vs. defender's `getEffectiveDefenseStrength`, `combat-system.ts:26`)
— the plan should reuse those exact numbers rather than recomputing a
parallel strength figure, so the capture threshold and the odds the player
was already shown never disagree. Because the threshold is deterministic
and derived from numbers already surfaced in the combat-odds preview, the
UI can show "capture possible" before the player commits to the attack —
no hidden roll.

### Era-scaled flavor

The mechanic is identical across eras; only the notification/label text
changes:

| Unit types | Label |
|---|---|
| `galley`, `trireme`, `frigate`, `ironclad`, `pirate_galley`, `pirate_corsair`, `pirate_frigate` | "Prize Crew" / "Boarding Party" |
| `pre_dreadnought`, `destroyer`, `submarine`, `missile_submarine`, `carrier`, `pirate_ironclad`, `pirate_fast_attack_craft`, `pirate_mothership` | "Captured & Towed" / "Crew Surrenders" |

## AI & Difficulty

### Barbarians and pirates

`barbarian-system.ts` already builds a `kind: 'resource'` raid plan that
navigates a barbarian unit to an improved resource tile
(`barbarian-system.ts:428–449`) — today this plan resolves with no payoff
on arrival. This change wires an actual pillage action into that existing
plan's arrival/execution step, rather than adding new targeting logic.
Pirate plunder gets an equivalent coastal-improvement variant.

### AI civs

AI civs at war pillage and capture through the same shared system helpers
the player uses (`applyCombatOutcomeToState`, the new pillage action
helper) — per `end-to-end-wiring.md`'s "shared state mutations must be
actor-complete" rule, this cannot live only in a UI click handler. This
also feeds the #526/#535 world-pressure fairness goal: AI civs must be
pillageable and must pillage back, not just absorb it one-directionally.

### Difficulty scaling

A new field on `OpponentChallengeProfile` (`opponent-challenge.ts`):

```ts
pillageAggressivenessMultiplier: number; // scales barbarian/pirate
  // preference for pillage-capable raid plans over plain raid/withdraw
```

| Tier | Value |
|---|---|
| `explorer` | 0.5 |
| `standard` | 1.0 |
| `veteran` | 1.3 |

Values match the existing `crisisSeverityMultiplier` tier spread in the
same file, for consistency with how every other difficulty knob in that
table is scaled. Player-side pillage/capture rules are **identical** at
every difficulty — only barbarian/pirate/AI frequency changes, matching
the addendum's "player-side rules identical at all levels."

## Data, Saves, and Extensibility

- No save migration: pillage reuses `tile.improvement`/`tile.hasRoad`
  fields that already exist and are already nullable/false in valid saves.
  Capture reuses `unit.owner`/`civ.units[]`, the same fields the existing
  `cyber_unit` capture path already mutates today.
- The new `pillageAggressivenessMultiplier` field is added to all three
  existing `OPPONENT_CHALLENGE_PROFILES` entries in the same change — an
  old save's `opponentChallenge` string still resolves to a complete
  profile object, no migration needed.
- Extensibility: capture eligibility (civilian and naval-military) is
  driven entirely by the existing `UNIT_CLASS_BY_TYPE` table. A future unit
  type needs zero changes to the capture logic itself, only its class tag.

## Player Truth Table

| Situation | Outcome |
|---|---|
| Combat unit on enemy tile with finished improvement, unit hasn't acted | Pillage action available; confirm shows improvement name + gold |
| Same, but improvement is mid-construction, no road | No Pillage action — nothing to burn |
| Combat unit pillages a tile the player used to own (recaptured) | Improvement/road still cleared, but **zero gold** |
| Unescorted worker/settler/caravan/missionary/naval trader loses combat | Always captured (owner transfers); settler becomes worker, everything else keeps its type |
| Civilian stacked with any combat unit loses combat | The combat unit is always the resolved defender — the civilian is never targeted or captured |
| Naval military unit loses combat, loser's effective strength ≤ 50% of winner's, winner ends ≥ 50% health | Captured, not sunk (label varies by era) |
| Same naval combat, but win was narrower or winner drops below 50% health | Sunk, as today |
| Barbarian/pirate raid unit reaches a `'resource'`-plan improved tile | Pillages it (barbarian-side execution of the same helper) |
| Difficulty set to `veteran` vs `explorer` | Barbarian/pirate raid plans favor pillage more/less often; player-side rules unchanged |

## Test Strategy

- **Pillage**: gold formula (`IMPROVEMENT_BUILD_TURNS[type] *
  GOLD_PER_PILLAGE_BUILD_TURN`, rounded), zero gold on own territory, heal
  cap at 100, road-and-improvement cleared together, no action available on
  mid-build tiles, action consumes the unit's turn.
- **Civilian capture**: deterministic capture (seeded-RNG test proving no
  randomness affects the outcome), settler→worker conversion via
  `applyUpgrade`-equivalent field reconciliation, every other civilian type
  keeps its own type, both civs' `civilizations[id].units[]` arrays update
  correctly, side-state cleanup (trade route cancellation, missionary
  cooldown) verified per civilian type.
- **Escort protection**: explicit regression — a stack of [combat unit,
  civilian] loses combat, assert the civilian unit still exists and is
  still owned by the original civ; only a lone civilian gets captured.
- **Prize crews**: threshold boundary tests (exactly 50% strength ratio,
  exactly 50% health — pick a side and test both sides of the boundary),
  bidirectional (attacker-captured and defender-captured cases), era-label
  selection for at least one pre-industrial and one modern naval type.
- **AI/barbarian parity**: at least one test proving an AI civ or barbarian
  unit pillages/captures through the same shared helper as the player path
  (per `end-to-end-wiring.md`'s human + non-human coverage requirement).
- **Difficulty**: `pillageAggressivenessMultiplier` present and distinct
  across all three tiers; a barbarian raid-plan-selection test showing the
  multiplier actually shifts plan choice frequency.
- **Balance**: confirm pillage gold is exempt from (not silently subject
  to) the wonder/national-project yield-ceiling tests, since it is a
  one-time reward — add an explicit comment/test noting this scope
  boundary so a future contributor doesn't misapply those ceilings here.
- Run the full-catalog pacing outlier gate
  (`tests/systems/pacing-audit.test.ts`) since pillage introduces a new
  gold source, per `game-balance.md`'s "Pacing Regression Prevention"
  section.

## Verification

- `yarn test` and `yarn build` both green before push, per project
  convention.
- Manual playtest: pillage a barbarian-adjacent tile as both player and
  observe an AI/barbarian civ pillage back; capture an unescorted worker
  and a stacked (escorted) worker to confirm the escort holds; win a
  lopsided naval battle to confirm a prize-crew capture notification
  appears instead of a sink.
