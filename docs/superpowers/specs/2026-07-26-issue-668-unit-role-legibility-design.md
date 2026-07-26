# Issue #668 Unit Role Legibility Design

**Date:** 2026-07-26  
**Status:** Approved through inline review  
**Issue:** #668

## Scope and drift decision

Issue #668's title mentions a Codex, but the live application has a Wonder Codex only;
it has no unit Codex launcher, unit catalog, or player-reachable unit reference surface.
The governing Task 4 instead names the three live decision surfaces: city production,
selected-unit information, and the tech inspector. This slice implements those surfaces
and does not create an unreachable unit-Codex module. A future unit-Codex surface is
explicitly out of scope for this focused MR.

## Player outcome

Every player sees the same canonical role facts where they decide to build, research,
inspect, or upgrade a unit:

- a plain-language role sentence of at most 18 words;
- icon-and-text role, counters, vulnerabilities, and upgrade direction;
- an optional native disclosure for exact typed values and unmet technologies;
- a terminal explanation when no successor exists.

The presentation never changes eligibility, combat calculations, AI decisions, difficulty,
queues, or saves. It is a legibility layer over `UNIT_ROLE_DEFINITIONS`,
`TRAINABLE_UNITS`, and `evaluateProductionPrerequisites`.

## Inline review

| Dimension | Finding and decision |
|---|---|
| Gameplay and balance | No values, gates, combat rules, or upgrade edges change. The UI reports existing facts only, so balance fixtures and tuning envelopes do not change. |
| Fun, ages 7–43, play styles | The first sentence stays short and jargon-free; icon-plus-text supports quick reading while exact rows remain available for optimizers. No recommendation hides legal choices. |
| Difficulty and computer players | Explorer, Standard, and Veteran retain identical unit facts and legality. AI already consumes the same role definition; this UI-only change adds no AI branch or hidden information. |
| UI and UX | Production cards, selected-unit info, and the tech inspector each show the role summary. Details use a native `details` disclosure, retain 44-pixel controls already present, and refresh through existing panel rerender paths after queue/research/upgrade interactions. |
| Architecture and extensibility | A pure `unit-role-presentation` helper owns labels, ordered facts, terminal copy, and prerequisite status. UI modules consume it; no unit-ID switch or duplicated role list is permitted. |
| Data and saved games | Read-only derivation from existing serializable definitions and game state. No schema, migration, normalizer, or save round-trip change is required. |
| SFX and notifications | Inspecting static information has no mechanical consequence. No sound, animation, notification, history entry, or mixer event is introduced, preventing handoff leakage. |
| Solo and hot seat | Presentation is derived from the currently rendered city/unit/tech and `state.currentPlayer`; it never reads another player's private state. Tests render two current-player contexts and assert the active player's legality and missing requirements. |
| Regression strategy | DOM tests cover readable summary, icon-plus-text counter rows, terminal state, partial conjunctive gate, full catalog reachability, disclosure content, and post-action rerender behavior. Existing system role and prerequisite tests remain the canonical metadata guard. |

## Presentation contract

`getUnitRolePresentation` accepts a unit type and optional completed technology IDs. It
returns no value for non-catalog data, otherwise returns the definition's short summary,
primary and secondary role labels, counter and vulnerability rows, an upgrade row, and
ordered prerequisite rows. Icons never stand alone: every row includes visible text.

The city build catalog displays the summary and compact role line for every legal unit,
without filtering or reordering entries. The selected-unit panel displays the same summary
and an expandable details block. The tech inspector displays the same role presentation for
each unit unlocked by the selected technology, including a partial-conjunction checklist.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Eligible unit is visible in a city build catalog | Open Build tab | Its summary and role/counter line appear; all other legal units remain reachable. |
| Selected friendly unit has an upgrade | Open its info panel | Role details and the explicit successor or terminal reason appear before the upgrade action. |
| Selected tech unlocks a unit with two technology requirements | Inspect the tech | The unit's missing requirement is visible and it is not presented as immediately trainable. |
| Current player changes in hot seat | Open that player's city, unit, or tech panel | The panel derives eligibility and missing requirements from the new current player only. |
| Player queues research or completes an upgrade | Existing callback rerenders the open panel | The same presentation recomputes from current state; stale requirement text is not retained. |

## Misleading UI risks

- A unit with one completed technology out of two must show the remaining technology and
  must not be labeled as available.
- Terminal units must never imply an inferred successor; they show their explicit terminal
  reason instead.
- A counter is a role relationship, not a combat guarantee; labels use “Strong against”
  and “Vulnerable to”, never promised outcomes.
- Production recommendations are out of scope. The complete legal catalog remains the
  only production catalog and no role metadata changes its order or reachability.

## Interaction replay checklist

- Open a city build catalog, select a legal unit, queue it, and assert the refreshed panel
  still exposes role information and preserves queue content.
- Open a selected unit, inspect details, upgrade through the existing confirmation path,
  and assert the rerendered panel reflects the target unit.
- Inspect a partially gated tech, change the current player, reopen the inspector, and
  assert the old player's completed-tech markers do not remain.
- Reopen each surface after its existing state mutation; no disclosure or stale-DOM
  callback owns persistent state.

## Verification ownership

The worktree command wrapper must return immediately after its special `yarn install`
and `yarn setup:hooks` paths. The smoke test rejects a second fall-through invocation.
For long-running verification, agent tooling must retain and poll the original terminal
session until it yields both an exit code and its normal completion summary; an incomplete
tool response is not a passing result and must not trigger a duplicate run.
