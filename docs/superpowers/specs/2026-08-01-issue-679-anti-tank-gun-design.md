# Anti-Tank Gun Design

**Issue:** #679 — Add Anti-Tank Gun and armor-pressure AI

## Goal

Deliver Anti-Tank Gun as a clear, bounded Era 9 response to armored units: powerful
against the typed `armor` class, deliberately worse against other targets, and produced
by computer players from their own earned information rather than hidden enemy state.

## Contract

- Anti-Tank Gun unlocks at Tank Warfare, costs 170 production, has 43 strength, 2
  movement, and a range-1 unit attack.
- When attacking, its canonical combat modifiers are exactly +50% against the existing
  typed `armor` unit class and −15% against non-armor targets. It has neither modifier
  while defending. It must never use a Tank-specific combat branch; current Tank and
  any future armor-class unit receive the same rule.
- It is a specialist, not a replacement frontline unit. Deterministic exchanges must
  show its intended advantage against armor while the non-armor penalty leaves a
  credible generalist and combined-arms choice.
- Explorer, Standard, and Veteran share catalog data, gates, combat formulas,
  visibility boundaries, and force-budget cap. Difficulty may use existing decision
  quality and priority behavior, but receives no Anti-Tank-Gun-specific statistics,
  production bonus, or hidden information.

## AI intelligence and force budget

The AI receives an explicit `anti-armor` strategic role. A shared preparation helper
derives that role from `MajorCivPerception`, not from `state.units`:

- A currently visible, relevant hostile armor unit creates immediate counter demand.
- A trusted `source: 'observed'` fog-memory snapshot creates at most one lower-priority
  preparedness demand while its existing confidence remains positive. The shared
  decay reaches zero after six turns; malformed, legacy-reconstructed, unexplored,
  stale, concealed, or unrelated observations create no demand.
- The counter cap is `max(1, floor(maxPrimaryForce / 3))`: one in Explorer and two in
  Standard/Veteran. Visible demand is `min(visibleArmorCount, counterCap)`. When no
  armor is visible, any positive-confidence trusted memory may create one lower-priority
  preparedness slot; it never adds to visible demand. Owned Anti-Tank Guns populate
  `assigned` before demand merges, and valid queued guns reduce the normal production
  residual. One sighting therefore cannot make every city queue specialists.
- Remembered armor may inform production planning only. Tactical targeting, movement,
  attack preview, and combat resolution continue to use currently visible targets.

This makes scouting matter without allowing a brief past sighting to create permanent
counter spam or allowing an AI/camp to react to an unseen Tank across the map.

## Architecture

The unit is a stable `UnitType` carried through `UNIT_DEFINITIONS`, `TRAINABLE_UNITS`,
Tank Warfare unlock data, combat-role definitions, `UNIT_CLASS_BY_TYPE`, canonical
class-counter definitions, AI strategic-role catalog, sprite catalog, and SFX
fallback catalog. The existing `armor` class and an extended typed class-counter
evaluator are authoritative: its schema supports either a required defender class or
an excluded defender class, so the non-armor penalty stays data-driven.

The new AI demand is calculated during prepared major-civilization planning, where
perception is already constructed. Production consumes the typed force demand through
its normal candidate/residual-demand flow. No UI handler, city-production special
case, unit-ID tactical branch, duplicate visibility cache, or global intelligence
registry is permitted.

## Player experience

The concise role text says that the unit defeats armored vehicles but is weaker against
other targets. Existing production and unit-inspection surfaces must show the gate,
cost, range, and both combat facts in plain language. The combat preview exposes the
applicable fact for known targets without revealing a concealed target's type or an
opponent's private queue.

Recommendation ordering may favor the unit where appropriate but must not hide any
other legal production choice. After the player queues or produces it, the open city
surface must render the normal updated queue/order/ETA state immediately.

## Player Truth Table

| Before | Player action | Immediate visible result |
| --- | --- | --- |
| Tank Warfare is incomplete | Opens production catalog | Anti-Tank Gun remains unavailable with Tank Warfare named. |
| Tank Warfare is complete | Opens production catalog | Anti-Tank Gun is reachable with cost, range, and specialist role. |
| Known target has `armor` class | Previews or resolves attack | +50% anti-armor fact is shown and calculated. |
| Known target lacks `armor` class | Previews or resolves attack | −15% non-armor fact is shown and calculated. |
| Anti-Tank Gun is defending | Previews or resolves combat | Neither attack-only modifier is shown or calculated. |
| Current human queues the unit | Confirms production | The existing city panel immediately shows the updated queue and ETA/order. |
| Hot-seat turn changes | Opens or refreshes a surface | Only the current player sees their own gates, queue, and earned combat facts. |

## Misleading UI risks

- “Anti-armor” must not imply an all-purpose +50% bonus; a known non-armor target
  visibly shows the −15% tradeoff, and a defender preview does not claim either
  attack-only modifier.
- A production recommendation must not suppress the rest of the legal catalog.
- Fog-memory is an AI planning input, not player-visible proof that an enemy unit is
  still present. No player notification, SFX, preview, or queue reveal may expose it.

## Data, saves, audio, and art

The stable string ID and definition catalogs preserve serializable plain game state.
No save-schema migration is required unless implementation adds a new persisted field;
the approved design adds none. Current queue entries and trusted last-seen snapshots
must round-trip safely, and malformed/legacy snapshots remain ignored.

Register valid temporary sprite and SFX fallbacks in the existing catalogs. Bespoke art
and audio remain owned by their dedicated asset issues. Combat text/visual facts are
the required accessible equivalent when audio is muted; audio must use the standard
mixer and never leak another hot-seat player's activity.

## Verification boundaries

Write focused failing regressions before production code. Cover catalog completeness
and Tank Warfare gating; armor positive, non-armor negative, and defender-direction
combat facts; current Tank plus a future-proof typed armor fixture; expected counter exchange; visible,
recent remembered, expired, untrusted, and hidden-intel AI cases; queue-residual and
force-budget anti-spam cases; AI research/production eligibility; difficulty parity;
rendered city/preview behavior; save/load; SFX/sprite catalog completeness; solo; and
two-human hot-seat isolation.

## Inline review resolutions

| Dimension | Review result and enforced resolution |
| --- | --- |
| Balance and fun | Preserve 170/43/2/range-1 and the attack-only +50%/−15% specialist envelope. Test a bounded 20–40% counter exchange instead of asserting a misleading raw-strength ladder. |
| New mechanics | Reuse the typed `armor` class plus a typed excluded-class counter predicate; no Tank ID branch. The bounded planning-memory signal is not a new tactical vision rule. |
| Ages 7–43 and play styles | A short role sentence and visible active/inactive facts serve casual and younger players; exact modifiers, scouting, feints, and combined-arms tradeoffs reward optimizers. Builder, defensive, and aggressive fixtures retain non-specialist production choices. |
| Difficulty and computer players | All difficulties share legality, combat, and perception boundaries. AI uses only owned state and earned visible/recent trusted observations, with a one/two-unit force-budget cap and normal residual queue accounting. |
| UI and UX | Gate, exact modifiers, full-catalog reachability, queue refresh, and viewer-scoped previews are regression requirements; no new opaque control or hidden recommendation surface is introduced. |
| Architecture and extensibility | Typed catalog metadata owns unit identity, armor classification, counter behavior, and AI role. Prepared perception feeds normal production demand; no duplicate cache or special-case city/tactics code. |
| Data and saves | No new persisted shape or migration. Regression coverage proves queues and trusted/invalid last-seen state remain safe across save/load. |
| SFX and art | Temporary catalog fallbacks and standard mixer behavior are required; visible combat facts remain accessible with muted audio and hot-seat isolation prevents leaks. |
| Regression coverage | Human and AI combat paths, no-hidden-roster negative, expiration/untrusted-memory negatives, force-budget cap, difficulty parity, solo, and two-human hot seat are mandatory. |
