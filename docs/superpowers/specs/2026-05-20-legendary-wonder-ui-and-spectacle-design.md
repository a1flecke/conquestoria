# Legendary Wonder UI And Spectacle Design

**Issue:** [#217 — Bug: legendary wonder ui off](https://github.com/a1flecke/conquestoria/issues/217)
**Date:** 2026-05-20

## Overview

Legendary wonders currently exist as real gameplay objects, but the player-facing experience makes them feel detached from ordinary city production. The immediate issue is practical: the wonder UI is confusing, visually inconsistent, lacks an obvious close affordance, and available wonders should be discoverable from the normal city build flow.

This design uses a two-stage approach:

1. **Stage 1: City build doorway** — fix issue #217 by surfacing relevant legendary wonders in the normal city Build list, then opening a clearer Crafted Journal-style detail panel for quest, race, reward, and start/queue actions.
2. **Stage 2: Wonder spectacle** — a designed follow-up phase for wonder SVG identities, natural-wonder map treatments, ambient animation, completion moments, and an empire legacy gallery.

Stage 1 is the implementation target for the first plan. Stage 2 is specified enough to preserve the product direction, but should be implemented as a separate phase.

---

## Goals

- Make legendary wonders visible from the same city surface where players already choose buildings and units.
- Keep the build list compact while still making wonder state understandable.
- Preserve a complete, reachable catalog of city-specific wonder ambitions.
- Replace vague IDs and technical requirements with human-readable names, labels, cost, ETA, quest progress, and reward summaries.
- Keep existing wonder race, quest, intel, and production rules authoritative in system helpers rather than UI-only logic.
- Establish a Crafted Journal visual direction for wonders without turning Stage 1 into an art overhaul.

## Non-Goals

- Stage 1 does not redesign natural wonder placement, effects, or map generation.
- Stage 1 does not add a full empire-level wonder gallery.
- Stage 1 does not create final SVG art for every wonder.
- Stage 1 does not relax current tech/resource/city/quest gates.
- Stage 1 does not reveal rival wonder data without earned discovery or espionage intel.

---

## Stage 1 — City Build Doorway

### City Build List Integration

`src/ui/city-panel.ts` should add a compact **Legendary Wonders** subsection inside the normal `Build` list, between buildings and units.

The subsection appears when the selected city has one or more relevant legendary wonder entries:

| Wonder state | Build-list treatment |
|---|---|
| `ready_to_build` | High-priority card with a clear "Ready" state and a prompt to open details/start construction. |
| `questing` | Card showing quest progress and the next incomplete step. |
| `building` | Card showing current construction progress, cost, ETA, and race status. |
| `lost_race` | Recovery card showing carryover production and refund context. |
| Near-eligible | De-emphasized card if only a small number of requirements are missing. |
| Fully blocked | Hidden from the compact build-list subsection, but still reachable from the full wonder panel. |

"Near-eligible" means the city/civ is close enough that surfacing the wonder helps planning rather than creating noise. The first implementation should define this conservatively as both:

- the wonder's era is no later than the current game era or the next era
- no more than two conditions are missing after evaluating techs, resources, and city requirement

Far-future wonders outside that era window must stay out of the compact build-list subsection even if they happen to have only one or two formal requirements.

Each build-list wonder card must show:

- compact wonder identity icon or medallion placeholder
- human-readable wonder name
- state label such as `Ready`, `Questing`, `Building`, `Recovered`, or `Blocked`
- quest progress, for example `Quest 1/2`
- missing requirement chips for near-eligible wonders
- production cost and ETA when the city can currently build or is building the wonder
- short reward teaser

Clicking a wonder card opens the selected city's wonder detail panel. The compact card should not attempt to show every quest/race/intel detail. Stage 1 should not start a legendary wonder directly from the compact build-list card; the detail panel is the confirmation surface where the player sees what the action will do.

### Production Queue Display

Legendary wonder queue items continue to use `legendary:<wonderId>` ids. Stage 1 must make those ids display cleanly anywhere city production is shown:

- current production header
- follow-up queue rows
- ETA calculation
- reorder/remove rows
- build-list cards

The display label must be the legendary wonder's human-readable name, not the raw `legendary:` id. The icon should use a temporary wonder production icon or medallion placeholder until Stage 2 supplies final SVG identities.

Stage 1 implements one construction action: **Start Construction** from the wonder detail panel. Starting construction makes the wonder the active production item by inserting `legendary:<wonderId>` at the front of the selected city's production queue, while preserving the previous active item and follow-up queue behind it. The button copy or nearby helper text must make that reprioritization explicit before the click, for example: `Start Construction - current queue continues after this wonder.`

Starting construction must preserve the existing production queue contract:

- no silent destructive replacement of queued work
- visible active item and queued follow-ups
- visible ETA/order feedback
- immediate panel refresh after the action

A separate "Queue after current" action is out of scope for Stage 1. If a later implementation adds that action, it must get its own visible queue-position text and replay tests.

### Wonder Detail Panel

`src/ui/wonder-panel.ts` remains the detailed surface, but it should be redesigned as a focused Crafted Journal panel instead of a plain full-screen list.

The panel must include:

- obvious close control at the top
- city name and clear title, for example `Athens Wonders`
- short explanation of the selected city's legendary ambitions
- sections for `Ready`, `Questing`, `Building`, `Blocked`, `Recovered`, and `Rival Intel`
- "Show all ambitions" or an equivalent complete catalog affordance if recommendations are limited
- human-readable tech, resource, city, and quest requirements
- current quest step status with completed and pending states
- reward summary
- race/progress summary
- rival intel only through `getLegendaryWonderIntelForViewer` or equivalent viewer-safe helper

The panel should keep all selected-city wonder projects reachable. Recommendation sections may prioritize a small number of wonders, but lower-ranked actionable or informational entries cannot disappear without an explicit complete-section affordance.

### Notifications And Advisors

Wonder notifications should point players toward the live city flow:

- `wonder:legendary-ready` should make clear which city can act and which wonder is ready.
- `wonder:legendary-completed` should remain a global accomplishment message.
- `wonder:legendary-lost` should explain recovered gold/carryover in player language.
- `wonder:legendary-race-revealed` should remain gated by earned espionage intel.

Advisor nudges, especially Artisan advice, should speak in terms of city action and player choice. They should not be the only place a player learns that a wonder is available.

---

## Shared Presentation Helper

Stage 1 should add or extract a shared helper for city-scoped legendary wonder presentation. This helper prevents `city-panel.ts` and `wonder-panel.ts` from duplicating eligibility, sorting, missing requirement, and display-name logic.

The helper should be system-adjacent rather than DOM-specific. It may live in `src/systems/legendary-wonder-presentation.ts` or another focused module with a similar boundary.

It should return entries shaped around UI needs while preserving system ownership of truth:

```ts
interface LegendaryWonderPresentationEntry {
  wonderId: string;
  queueItemId: `legendary:${string}`;
  projectKey: string;
  name: string;
  cityId: string;
  ownerId: string;
  visibleState: 'ready' | 'questing' | 'building' | 'blocked' | 'recovered' | 'completed' | 'lost';
  eligibilityState: 'buildable' | 'questing' | 'near-eligible' | 'blocked' | 'in-progress' | 'resolved';
  missingRequirements: string[];
  questCompleted: number;
  questTotal: number;
  nextQuestStep: string | null;
  rewardSummary: string;
  productionCost: number;
  turnsRemaining: number | null;
  investedProduction: number;
  transferableProduction: number;
  canStartBuild: boolean;
  startActionLabel: string | null;
  sortBucket: 'ready' | 'active' | 'questing' | 'near' | 'blocked' | 'resolved';
}
```

The exact TypeScript names may change during implementation, but the responsibilities should stay the same.

System helpers remain authoritative for:

- project seeding and normalization
- tech/resource/city requirement truth
- quest completion truth
- starting construction
- race completion and loss
- rival intel masking
- global uniqueness and no self-competition

UI code should render the presentation entries and call existing mutation helpers such as `startLegendaryWonderBuild`.

The construction mutation must re-check current tech, resource, city, global-uniqueness, and same-owner active-build eligibility. UI eligibility is guidance, not authority; stale DOM or a direct system call must not start a wonder that is no longer valid.

---

## Stage 2 — Wonder Spectacle Follow-Up

Stage 2 uses the **Crafted Journal** visual direction for everyday wonder surfaces, with theatrical treatment reserved for discoveries and completions.

### Wonder Visual Catalog

Add a focused wonder visual catalog, likely under `src/renderer/wonders/` or a comparable module. It should define stable visual identity for both natural and legendary wonders:

- compact icon or medallion
- palette
- emblem shape
- optional large illustration/structure SVG
- completed-wonder silhouette or map/city marker treatment

Stage 2 should not overload the existing unit/building sprite catalog unless implementation proves that is the best fit. Wonders have different usage: map features, panel medallions, achievement entries, and completion art.

### Natural Wonder Map Presence

Natural wonders should move beyond the generic glowing `✦` marker. Each natural wonder should get a distinct map treatment that remains readable at multiple zoom levels and does not interfere with unit/city interactions.

Examples:

- Great Volcano: warm crater glow and subtle smoke flicker
- Crystal Caverns: faceted gem shimmer
- Ancient Forest: oversized ancient canopy mark
- Coral Reef: bright reef pattern on coast
- Aurora Fields: pale sky-ribbon shimmer

Discovery state must remain viewer-safe. Unexplored tiles show nothing. Fog and last-seen behavior should follow existing visibility rules.

### Legendary Wonder Completion Presence

Completed legendary wonders should become visible achievements:

- in the host city detail context
- in the future Empire Legacy gallery
- in notifications and completion celebration
- optionally on the map/city renderer if a non-obstructive marker is designed

Rival completed wonders may be shown only at the detail level the player has earned through contact, discovery, or espionage.

### Animation

Wonder animation should be modest during normal play and more expressive at major moments.

Normal play:

- ambient shimmer for discovered natural wonders
- subtle medallion pulse for newly ready wonders
- gentle construction/race progress flourish

Major moments:

- short discovery reveal
- short legendary completion celebration
- journal-style achievement entry unlock

Animations must keep the map usable and should respect reduced-motion settings if the project has or adds such a setting.

### Empire Legacy Gallery

The gallery is a Stage 2 surface that shows:

- completed wonders owned by the current player
- lost races and recovered effort
- known rival masterpieces with earned intel only
- undiscovered or unknown wonders as masked silhouettes when appropriate

The gallery is not the primary way to start wonders. It is a record of legacy, rivalry, and discovery.

---

## Data Flow

Stage 1 data flow:

1. City panel opens for `state.currentPlayer`.
2. The city flow initializes or refreshes legendary projects for the selected city.
3. The shared presentation helper converts system state into city-scoped wonder presentation entries.
4. `city-panel.ts` renders a compact Legendary Wonders subsection from those entries.
5. Clicking a card opens `wonder-panel.ts` for the same city.
6. `wonder-panel.ts` renders full project detail from the same presentation helper plus viewer-safe rival intel.
7. Starting construction calls shared system mutation helpers.
8. The visible panel refreshes immediately from the updated state.
9. Turn processing continues to resolve quest readiness, construction progress, completion, race loss, and notifications through existing event paths.

This flow keeps the gameplay source of truth in systems and the player-visible explanation in UI presentation helpers.

---

## Error Handling And Edge Cases

- Missing wonder definitions render a safe fallback label and do not crash the city panel.
- Missing city/civ references omit the affected entry from actionable sections and should be covered by tests if a helper can encounter them.
- Completed global wonders are removed from competing actionable lists except for the winner's completed/resolved record.
- A civ cannot race against itself in two cities unless a later spec explicitly changes that rule.
- Seeded placeholder projects must not be treated as buildable merely because they exist.
- A stale `ready_to_build` project must not start construction if the city/civ no longer satisfies required techs, resources, or city terrain.
- Rival race intel must remain masked unless stored under the current viewer's earned intel.
- Near-eligible cards must be de-emphasized and must not expose a start/queue action.
- A `legendary:<wonderId>` queue item for an unknown wonder should display a fallback label and fallback cost behavior rather than breaking queue rendering.

---

## Testing Requirements

### City Panel Tests

Add or update tests in `tests/ui/city-panel.test.ts`:

- relevant legendary wonders appear in the normal Build list for the selected city
- blocked far-future wonders do not crowd the compact build list
- the build list shows human-readable name, state label, quest progress, missing requirement chips, cost/ETA when relevant, and reward teaser
- clicking a wonder card opens the wonder detail panel callback for the selected city
- `legendary:<wonderId>` displays as the wonder name in current production and queue rows
- starting construction preserves existing queue entries behind the active wonder
- the visible city panel refreshes immediately after a wonder action

### Wonder Panel Tests

Add or update tests in `tests/ui/wonder-panel.test.ts`:

- panel includes an obvious close control
- entries are grouped into ready, questing, building, blocked, recovered, and rival intel sections as applicable
- "Show all ambitions" or equivalent complete catalog affordance keeps all selected-city wonders reachable
- current-player scoping works in hot seat
- rival intel remains hidden without earned intel
- rival intel uses viewer-safe data when earned
- recommended sections do not hide lower-ranked actionable items
- human-readable requirements replace raw technical ids where display helpers exist

### System And Presentation Tests

Add or update tests in `tests/systems/legendary-wonder-system.test.ts` or a new mirrored presentation test:

- eligible vs near-eligible vs blocked entries are classified correctly
- questing vs ready vs building vs lost/resolved states map to correct presentation states
- seeded placeholder projects are not treated as actionable
- global uniqueness prevents completed wonders from appearing as buildable for rivals
- the same owner cannot actively race the same wonder from two cities
- `startLegendaryWonderBuild` refuses stale ready projects when a tech, resource, or city requirement is no longer satisfied
- `legendary:<wonderId>` metadata returns name, cost, icon/placeholder, and fallback values

### Required Checks

For Stage 1 implementation, run:

```bash
scripts/check-src-rule-violations.sh src/ui/city-panel.ts src/ui/wonder-panel.ts src/systems/legendary-wonder-system.ts
./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ui/wonder-panel.test.ts tests/systems/legendary-wonder-system.test.ts
./scripts/run-wonder-regressions.sh
```

If additional `src/` files change, include them in `scripts/check-src-rule-violations.sh` and run their mirrored or smallest relevant tests. Run `./scripts/run-with-mise.sh yarn build` before push, PR creation, or merge.

---

## Acceptance Criteria

Stage 1 is complete when:

- a player can discover relevant legendary wonders from the normal city Build list
- the build list remains compact and understandable
- clicking a wonder opens a clear, closable, city-scoped detail panel
- ready wonders can be started without silently destroying existing queue work
- current production and queue rows show human-readable legendary wonder names
- all selected-city wonder ambitions remain reachable
- rival wonder details obey earned-intel rules
- targeted city-panel, wonder-panel, system/presentation, and wonder regression checks pass

Stage 2 is ready for its own implementation plan when Stage 1 is merged or otherwise accepted, and the follow-up plan can focus on visuals, animation, completion ceremony, and gallery work without reopening the core build-flow contract.
