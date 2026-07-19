# Era 13 MR4: Full Autonomy Network Design

**Date:** 2026-07-19

**Status:** Approved direction for issue #514; implementation must preserve the Era 13+ approved design.

**Depends on:** #513, merged as `f7c5e6101a71f2c5d9afc698739e33e686c1f2b1`.

## Purpose

Turn the existing Cyber intent lifecycle into a complete Autonomy Network without making
it a chore, a hidden AI advantage, or a source of hot-seat leaks. The network is an
optional, persistent planning layer: players link a plan once, see its outcome, and
adapt to transparent counters. It must remain useful to builders, researchers, traders,
explorers, defenders, and aggressors alike.

## Product decisions

- **Fun and balance:** Capacity is a budget for visible plans, never a punishment meter.
  A normal assignment cannot exceed Capacity. Surge is the sole overload path, is always
  explicit, uses a preview that equals the resolved effect, and has bounded recovery.
  Strain never pauses a valid ordinary plan or reduces base yields, movement, or strength.
- **Accessible depth:** Integrated is the default posture. The tutorial teaches one
  constructive plan, then posture after a successful resolution, then Surge after a
  Stable resolution. Default copy states outcomes; formula detail is available on demand.
- **Player choice:** Recommendations may reorder plans but cannot hide them. Every
  focused catalog includes `Show all`. Holding or ignoring the network never blocks end
  turn.
- **Difficulty and AI:** Explorer, Standard, and Veteran share rules, values, Capacity,
  Load, resources, and intel. Difficulty changes only deterministic candidate breadth,
  planning quality, reconsideration, and seeded mistakes. Explorer must still maintain a
  useful constructive plan and react to one observed hostile effect.
- **Privacy and feedback:** UI, overlays, notifications, and audio are viewer-scoped.
  During hot-seat handoff: end turn, autosave/opaque veil, identity confirmation, viewer
  reset, authorized warning, input, then target-turn-end resolution. No prior-player
  focus, map line, source identity, or sound survives into the next viewer.
- **Architecture:** Extend the current `NetworkPlan` definitions, validator, preview,
  resolver, cleanup, and viewer-intel path. Do not introduce another evaluator, plan
  lifecycle, viewer-intel store, or UI-owned mutation. Definitions use typed, closed
  effect data; Capacity, Load, valid links, and previews are derived selectors.
- **Save safety:** Preserve schema version 3. Any MR4 state is serializable plain data,
  deterministic, normalized in the existing migration/load path, and byte-stable after
  load-save-load. No stable IDs are repurposed.
- **SFX:** MR4 may use existing viewer-authorized feedback routes only. New authored
  network motifs remain MR6 work. One formation yields one batched cue; no hidden-source
  preparation or location audio is permitted.

## Gameplay contract

### Capacity, postures, and Surge

At activation, every civilization has base Capacity 2. Capacity additions are typed
definition metadata: precursor-city Capacity is capped at 4 empire-wide; the first three
Network Operations Centers provide 2 each and later copies 1; AI Safety Institute provides
1; National AI Assurance Program provides 2; category-restricted Capacity is capped at 2
per category. These rules keep wide empires useful without granting linear dominance.

Stable means Load is at or below Capacity. Strained occurs only during Surge recovery;
existing plans continue, but no new or expanded ordinary plan may begin. Safeguarded
reserves one Capacity for constructive/defensive plans and delays incoming hostile
economic/civic plans by one preparation round while increasing own hostile Load by one.
Integrated has no modifier. Accelerated permits a Surge allowance of 3 instead of 1 and
uses the Surged effect, but recovers for three rounds instead of two. Postures change no
more than once per three rounds and take effect at the owner’s next round boundary.

A Surge applies only to a plan whose ordinary Load fits. Safeguarded/Integrated allow one
temporary extra Load; Accelerated allows three. It preserves every diplomacy, visibility,
validity, counter, non-stacking, and yield-cap rule; recovery-reduction effects do not
stack and may shorten recovery by at most one round; four-round cooldown follows recovery.

### Plans

The current Harden and Exploit contracts remain intact. Add constructive plans through the
same evaluator:

| Plan | Load | Stable | Surged one-resolution effect |
|---|---:|---|---|
| Fabrication Sprint | 2 | +10% base production, cap +4 | +15%, cap +6 |
| Research Mesh | 3 | +5% base science in each of up to two linked cities, cap +3/city | +8%, cap +5/city |
| Logistics Routing | 2 | +1 gold per each of first two linked active routes | +2 gold per linked route |
| Survey Grid | 1 + linked units | +1 vision for one or two linked eligible units | +2 vision |

Their anchors, link limits, target ownership, same-plan non-stacking, cleanup, preview,
and counters are definition-driven. Effects belong in canonical city-yield, route-income,
and visibility helpers; they grant no movement and never calculate from a recursively
modified base.

Guardian Screen and Swarm Strike are dormant formation definitions for the later Drone
Controller. Test them using fixture units only; do not expose an untrainable action.
They link one to three Combat Drones, apply the strongest valid coordination modifier only,
and pause visibly on a broken link without removing base stats.

## Player surfaces

After activation, the HUD shows Network state, Load/Capacity, posture, and a remaining-plan
hint. The Network panel provides Plans, Capacity, and Security views with all actions
reachable, exact expandable formulas, disabled-state explanations, keyboard/touch controls,
and non-color status cues. City and unit panels deep-link to related plans or counters.
Every action rerenders its still-open surface immediately.

| Before | Action | Immediate visible result |
|---|---|---|
| Stable with room | Assign Fabrication Sprint | Load, plan row, and city yield breakdown update |
| Ordinary plan exceeds Capacity | Inspect confirm | Confirm is disabled with exact deficit and Capacity guidance |
| Eligible plan may Surge | Inspect Surge | Enhanced outcome and recovery are visible before confirmation |
| Strained | Reopen catalog | Existing plans remain visible/active; expansion is disabled; valid cancel, repair, shrink, and equal-or-lower retarget actions remain available |
| Formation link breaks | Move a linked drone out of range | Link and bonus visibly pause; base movement/strength stay unchanged |

## Validation and regression contract

Tests must prove: sublinear three-city/eight-city Capacity; normal-overload rejection;
preview/result equality; posture timing; Surge recovery/cooldown; ordinary-plan continuity;
same-plan non-stacking; canonical yield/route/vision/combat application; human/AI parity;
same numeric rules across difficulties; bounded deterministic AI candidates; one solo
recommendation per round; save-twice equality; capture/peace/elimination cleanup; rendered
post-action UI updates; `Show all` reachability; formula/derived-label negative cases;
stale-click replay; keyboard/reduced-motion/non-color semantics; and two-to-four-player
hot-seat privacy with no UI, overlay, notification, or audio leak before identity
confirmation.

## Delivery boundary

Incremental commits may add hidden foundations, but a plan cannot become player-actionable
until its canonical effect, preview, validation, cleanup, AI use, UI refresh, save behavior,
and viewer-safe presentation ship together. Each commit and the final MR must build and
pass its narrowest relevant checks; the final MR also runs the complete test suite and
production build.
