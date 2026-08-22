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
is additionally blocked while the target has any active target-scoped pressure event,
including a conventional active crisis, unrest counted by the independent-crisis cap, an
active Stampede, or a Rogue Elephant Host. Blocked turns neither roll nor advance the
Stampede chance; they preserve the accumulated eligible-turn count. This avoids stacked
emergencies without converting recovery into a predictable cycle.

The existing independent-crisis cap remains authoritative. AI targets always use Standard
cooldown and chance values. Each human in hot seat resolves their own challenge and
history; no player's event state affects another human's clock.

## Stampede lifecycle

When a roll succeeds, create one `stampede` crisis force for the target and enter a
one-target-turn warning phase. The warning is plain language: "Herds are approaching;
use screens or defeat them before they damage the countryside." Herds neither move nor
attack during that phase.

On activation, spawn 2 / 3 / 4 herds for Explorer / Standard / Veteran. Each herd has
100 health, movement two, and strength `28 + 4 * (era - 3)`, giving 28--48 from era 3 to
era 8. Challenge changes only count and recurrence pressure; base stats, legality,
containment, information, and rewards remain identical. Spawn order and locations use
the repository's seeded deterministic rules and always reject invalid or occupied tiles.

For each of six active herd turns, reuse #702's canonical route commit and its visible
next-two-step presentation. Herds do not deliberately pursue units or capture cities.
Crossing an occupied legal tile invokes shared trample combat. A crisis-wide counter
permits no more than two improvement pillages per active turn. At expiry, remaining herd
units leave the map through the crisis-force cleanup path.

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
transition that changes them. Details may disclose exact values, but no surface reveals
hidden route tiles or another hot-seat player's warning, route, status, or reward.

## Architecture, data, and saves

A focused Stampede system owns eligibility, deterministic roll, spawn, warning-to-active
transition, active-turn resolution, terminal classification, and charge expiry. It
consumes `CrisisForce`, `resolvePressureSeverityForCiv`, #702 route helpers, canonical
combat outcomes, and existing pressure-cap helpers. UI and turn flow call it; they do not
recompute outcomes by scanning final state or duplicate ID-specific rules.

Persist only plain, stable data required to resume an exact mid-event state: phase,
target, creation/resolution turns, active-turn count, pillage and casualty/city-damage
counters, herd membership, terminal outcome, reward claim state, pending charge, and
the per-target recurrence history (last resolved turn and eligible-turn count). Add the
next schema migration only after rebasing confirms the current version. Normalization is
idempotent, rejects malformed references, removes orphan crisis units through the shared
owner cleanup, and preserves valid legacy saves.

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
renderer tests prove immediate refresh and two-human hot-seat isolation. Balance fixtures
exercise intended screens, a combat response, a builder containment response, and
Explorer/Standard/Veteran pressure without changing common rules.

Temporary route marker/sprite fallbacks already registered by #702 remain valid. #703
does not add bespoke art or sound; #713 and #719 own final visual and audio treatment.
