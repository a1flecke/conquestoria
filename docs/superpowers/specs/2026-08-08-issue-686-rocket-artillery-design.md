# Issue 686 Rocket Artillery Design

**Issue:** #686 — Add Rocket Artillery with bounded saturation splash
**Base:** `origin/main` at `1eea6202245244b597e4b9a05ebd4d9174bfe36b`

## Outcome

Rocket Artillery is the Era-10 siege successor to Artillery: Rocketry-gated, cost 260,
strength 57, movement 2, bombard range 3.  Its clear role sentence is: **“Bombards one
target and damages up to two nearby visible enemy soldiers.”**  It has an explicit
`Artillery → Rocket Artillery` edge and stays fragile when directly engaged.

## Inline review and resolutions

| Dimension | Finding | Required resolution |
| --- | --- | --- |
| Balance and fun | Unbounded nearby damage would turn a specialist into a universal answer. | Deal exactly 25% of final primary damage to no more than two eligible targets; preserve existing direct-combat weakness and test Artillery, Rocket Artillery, a same-era generalist, and a direct attacker. |
| New-mechanic clarity / ages 7–43 | “Splash” is jargon and a large result can be surprising. | Use the plain role sentence in the catalog; preview and resolved notification state the affected-unit count and damage in text, with exact values available in the existing detail surface. |
| Play styles | Rush, defender, builder, and optimizer need a tactical choice, not a mandatory upgrade. | Range-three area pressure rewards positioning, while movement two and direct-combat fragility leave flanking and close engagement as answers; no new requirement or difficulty-only advantage is introduced. |
| Difficulty and computer players | AI must neither see hidden units nor value hypothetical chain damage. | Candidate selection receives the same visible, stable-ordered eligible targets as resolution. Explorer, Standard, and Veteran retain identical legality and formula; only existing decision-quality controls may differ. |
| UI / UX | A result that only changes health is opaque; an over-detailed alert becomes noisy. | Reuse the current combat preview, result history, and one grouped combat notification. Do not add an action, panel, or modal. A hidden non-current hot-seat player receives neither names nor audio/visual evidence. |
| Architecture / extensibility | An `attacker.type === 'rocket_artillery'` branch would duplicate later area-effect rules. | Add an optional typed splash capability to the unit definition and a focused canonical resolver. Unit catalog data opts in; combat mutation, AI, and presentation consume its result. |
| Data and saves | The result needs deterministic affected IDs, while long-lived save shapes must not gain transient state. | Put deterministic splash records on `CombatResult`, apply them through the existing outcome mutation, and persist only through the already serialized combat-history/event pathway if that pathway stores the result. Normalizers accept older results with no splash field; no game-state schema bump unless the audited persisted history contract requires one. |
| SFX | New distinct effects need audible feedback, but #717 owns siege/heavy-weapons audio. | Reuse the existing combat presentation/audio path with no Rocket-Artillery-specific sound or new mixer event. Text/visual facts remain the primary feedback; #717 can replace the temporary behavior. |
| Solo, hot seat, and regression | Secondary targets can leak fog information or behave differently outside the player handler. | Filter by current attacker-owner visibility before selection; stable-sort IDs; use the same `applyCombatOutcomeToState` path for player, AI, and pirate callers. Test current-viewer isolation and no recursive splash. |
| Proper implementation | Applying splash before primary resolution can target invalid state; applying it after deletion can lose targets. | Resolve eligible targets from the pre-combat state after confirming legal primary combat; mutate primary outcome first, then apply capped secondary damage to still-existing eligible units without calling combat/reward resolution again. |

## Chosen design

### Typed data

Add an optional `splash` capability to `UnitDefinition` with `damageFraction`,
`maxTargets`, and a public label. Rocket Artillery is its only initial user. This is a
capability rather than a role because it describes attack resolution, not AI identity;
the existing typed combat role remains `siege` and drives general production planning.

### Canonical combat flow

`resolveCombat` continues to calculate only the legal primary exchange and returns the
final primary damage. A small pure helper receives the pre-combat `GameState`, attacker,
defender, and final primary damage. It returns at most two records in lexicographic unit
ID order after applying these predicates:

1. adjacent to the primary defender;
2. hostile to the attacker;
3. military (not civilian), not a city, not embarked cargo, and not the primary defender;
4. visible to the attacker owner under the canonical fog helper.

Each record stores target ID and `Math.round(finalPrimaryDamage * 0.25)`. The helper
never calls combat resolution, consumes no RNG, and therefore cannot recurse.

`applyCombatOutcomeToState` is the only mutation point. It applies normal primary
combat, then subtracts the bounded secondary damage from surviving selected units using
the existing safe unit-removal/capture-safe cleanup path. Secondary damage grants no
extra combat reward, XP, diplomacy event, retaliation, history event, or further splash.
The returned result contains public, recipient-safe splash facts for presentation.

### Presentation and AI

The existing preview formatter receives an optional plain-language splash summary. The
combat event carries the same already-viewer-filtered result; it produces one grouped
combat notification and existing combat visual only for authorized viewers. The AI scores
only damage to targets visible to its owner, using the pure resolver rather than scanning
the whole map per candidate or reading hidden state.

### Compatibility and scope

No new player action, queue model, save-owned state, sound asset, or animation is added.
Existing saves deserialize Rocket Artillery only once it is created through normal
production/upgrade; omitted optional `splash` result fields are backward-compatible.
The temporary existing sprite/catalog mapping must be registered and its separate visual
and audio replacement issues remain #711 and #717.

## Acceptance tests

- Catalog and upgrade integrity: exact stats/gate/range and `Artillery → Rocket Artillery`.
- Resolver: final-primary-damage basis, 25%, cap two, stable ID order, visible hostile
  military positives; ally, civilian, city, cargo, primary target, hidden, and third
  target negatives.
- Mutation: player and AI callers receive the same health changes; killed secondary
  targets clean up roster/cargo safely; no reward, retaliation, or recursive effect.
- Presentation: preview/history/one notification expose a visible effect, while
  unauthorized hot-seat viewers receive no secondary-target identity or presentation.
- Determinism and balance: identical state/seed yields identical records; Rocket
  Artillery remains a worse direct defender than a same-era generalist and does not
  one-shot a full-health peer through one secondary hit.

## Alternatives rejected

1. **Rocket-Artillery ID switch in combat mutation:** fastest now, but repeats the
   fragile one-off branching that #547 explicitly forbids.
2. **Resolve a separate combat exchange per splash target:** incorrectly introduces
   retaliation, RNG, rewards, and recursive area effects.
3. **Presentation-only nearby damage:** would desynchronize player, AI, and saved state.
