# Issue 703 Beast Stampede Design

## Purpose and scope

Issue #703 activates the Beast Stampede as recurring, target-scoped world pressure. It
builds on #701 crisis-force ownership and #702 deterministic herd routes. It delivers a
complete, understandable core crisis: eligibility, warning, spawning, turn resolution,
trampling, bounded pillage, containment, rewards, save safety, and the minimum
viewer-safe player facts. It does not deliver #704's richer AI response, grouped
notifications, dedicated presentation surface, or final Stampede audio treatment.

The prior one-Stampede-per-civilization rule is explicitly replaced. A civilization may
face later Stampedes, but never on a fixed schedule or while already handling pressure.

## Recurring pressure clock

Each civilization has an independent, serializable Stampede history. A completed
Stampede starts a difficulty-specific cooldown. After cooldown, each eligible target turn
performs a deterministic roll derived from the game seed, target civilization ID, and
turn. The chance grows only on eligible turns and is capped; it is not shown as a precise
future schedule to the player.

| Challenge | Cooldown | Initial chance | Growth per eligible turn | Cap |
| --- | ---: | ---: | ---: | ---: |
| Explorer | 12 turns | 3% | +1 percentage point | 12% |
| Standard | 8 turns | 4% | +2 percentage points | 18% |
| Veteran | 5 turns | 5% | +3 percentage points | 25% |

The clock is eligible only when all ordinary Stampede gates hold: era 3--8, a qualifying
plains or grassland region near a target city, and a legal unoccupied spawn location. It
is additionally blocked when the canonical per-civilization pressure helper reports an
active conventional crisis or unrest group, or when `crisisForces` has an active force
targeting that civilization (including a Stampede or Rogue Elephant Host). That helper
uses only target-scoped persisted state; it must not inspect hidden rival units or infer
pressure from map scans. Blocked turns neither roll nor advance the Stampede chance; they
preserve the accumulated eligible-turn count. This avoids stacked emergencies without
converting recovery into a predictable cycle.

The existing independent-crisis cap remains authoritative, selected with the same
pressure-severity resolver as the recurrence profile so AI targets always use Standard
cooldown, chance, and cap values. Each human in hot seat resolves their own challenge and
history; no player's event state affects another human's clock.

## Stampede lifecycle

When a roll succeeds, create one `stampede` crisis force for the target and enter a
one-target-turn warning phase. The warning is plain language: "Herds are approaching;
use screens or defeat them before they damage the countryside." #703 adds a compact
current-player Stampede status line to the existing world-pressure surface and refreshes
it immediately; #704 owns the dedicated alert, notification, and richer presentation
experience. Herds neither move nor attack during that phase. At the start
of that same target's following turn, the canonical turn-flow helper changes the force
to active and processes exactly one ordered herd pass; it is never triggered by a UI
handler or by a different civilization's turn.

On activation, spawn 2 / 3 / 4 herds for Explorer / Standard / Veteran. Each herd has
100 health, movement two, and strength `28 + 4 * (era - 3)`, giving 28--48 from era 3 to
era 8. Challenge changes only count and recurrence pressure; base stats, legality,
containment, information, and rewards remain identical. Spawn order and locations use
the repository's seeded deterministic rules and always reject invalid or occupied tiles.

For each of six active herd turns, reuse #702's canonical route commit and its visible
next-two-step presentation. Herds do not deliberately pursue units or capture cities.
The route extension must distinguish an invalid occupied tile from a visible hostile
blocker: water, mountains, city centers, cargo, friendly crisis units, and a second map
unit remain illegal, while a single hostile map unit may be selected as the first route
step. The shared movement/combat path resolves trample before movement; the herd enters
only if the defender is removed and movement remains legal. This corrects #702's
non-occupancy route rule without allowing unit stacking or bypassing shared combat.

Herds are processed by stable force/unit ID order. After each completed landing, one
canonical helper may pillage the landed improvement only while the force-wide per-pass
counter is below two; it records the actual tile key and never chooses a hidden target.
At expiry, remaining herd units leave the map through the crisis-force cleanup path.

## Outcomes and rewards

The mutation source records exactly one terminal outcome per force:

- **Defeated:** every herd was destroyed before expiry.
- **Contained:** the force expires with no city damage, no civilian killed, and at most
  two improvements pillaged across the whole event.
- **Survived:** the force expires without meeting containment.

Defeated and Contained grant `min(10 * era, 80)` gold once and one ten-turn Herding
Insight charge. The charge discounts the next eligible Beast Handler or War Elephant by
20%. If neither becomes reachable before charge expiry, it converts once to 20 gold.
Survived grants neither reward. A crisis force cannot generate normal beast-hoard,
capture, or duplicate combat-reward payouts.

The core player-facing facts are always understandable: current phase, remaining active
turns, containment limits (city damage, civilian loss, and pillage budget), currently
earned-visible route steps, outcome, and pending charge. They refresh at the same state
transition that changes them. The existing production catalog shows the discounted next
eligible Beast Handler or War Elephant cost, remaining charge duration, and an explicit
"next eligible unit" label; it never hides other legal production choices. Details may
disclose exact values, but no surface reveals hidden route tiles or another hot-seat
player's warning, route, status, or reward.

## Architecture, data, and saves

A focused Stampede system owns eligibility, deterministic roll, spawn, warning-to-active
transition, active-turn resolution, terminal classification, and charge expiry. It
consumes `CrisisForce`, `resolvePressureSeverityForCiv`, #702 route helpers, canonical
combat outcomes, and existing pressure-cap helpers. UI and turn flow call it; they do not
recompute outcomes by scanning final state or duplicate ID-specific rules. The initial
AI behavior is the existing legal hostile-combat behavior shared with crisis forces;
#704 owns new AI prioritization, dispatch, and response recommendations.

Persist a typed `StampedeState` registry keyed by target civilization ID, plus the
generic `CrisisForce` membership record. `StampedeState` contains only plain data needed
to resume the exact event: force ID, phase, creation/resolution turns, active-turn count,
pillage and casualty/city-damage counters, terminal outcome, reward claim state, pending
charge, last resolved turn, and accumulated eligible-turn count. City damage, civilian
loss, and herd death are recorded at their respective combat/city mutation sources and
fed into this state; terminal classification never reconstructs them from a final map.

The rebased current schema is 16, so this change adds schema 17. Its migration defaults
the optional registry to `{}`, normalizes malformed records idempotently, removes orphan
crisis units through the shared owner cleanup, and preserves valid legacy saves. Tests
cover schema 0, 16, 17, malformed values, and round trips in warning, active, resolved,
and charge states.

## Balance, accessibility, and test contract

The mechanic gives defenders a screen-and-contain option, combat-focused players a
defeat option, and builders enough warning and non-combat tools to avoid a forced war.
Fort/Citadel and fortified-unit route avoidance remain bounded under #702's rules; they
are helpful rather than guaranteed. The system must not inspect hidden rival, unit, route,
or provider state.

Tests cover deterministic repeated rolls; all three challenge curves; pressure blocking
and resumption; AI Standard severity; warning non-action; spawn count/formula/legality;
trample parity through human and non-human callers; the two-pillage active-turn cap;
all terminal boundaries; no duplicate reward; Herding Insight use and expiry; and
save/load during warning, active, resolved, and charge states. Viewer-scoped DOM and
renderer tests prove immediate warning/status and production-cost refresh, full catalog
reachability, reduced-motion information parity, and two-human hot-seat isolation.
Balance fixtures exercise intended screens, a combat response, a builder containment
response, and Explorer/Standard/Veteran pressure without changing common rules.

Temporary route marker/sprite fallbacks already registered by #702 remain valid. Existing
combat and pillage audio continues through its normal visible actions; #703 emits no new
hidden-event audio and does not claim a bespoke Stampede sound. #713 and #719 own final
visual and audio treatment, including warning, movement, and outcome coalescing.
