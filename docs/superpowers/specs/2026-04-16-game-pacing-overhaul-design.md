# Game Pacing Overhaul Design Specification

**Date:** 2026-04-16
**Status:** Proposed
**Depends on:** Current `main` as of 2026-04-16
**Goal:** Make Conquestoria feel active, rewarding, and strategically rich from the first turns onward by overhauling pacing, build/research flow, and the surfaces that communicate progress.

---

## 1. Intent

The current early game is too slow in the wrong ways. The problem is not only that numbers are high. The problem is that the player spends too many turns with little visible payoff, too many disabled choices, and too many opportunities to accidentally do nothing productive.

This design keeps the game's breadth of choices. It does **not** solve pacing by shrinking the tech tree, deleting buildings, or flattening the roster. Instead, it changes how quickly different kinds of content should arrive, how that timing is calculated, and how the UI keeps momentum visible.

The desired experience is:

- the early game feels alive within the first few turns
- foundational units, buildings, and techs arrive fast enough to create momentum
- later eras contain both quick wins and longer projects
- the player can always see what is progressing, what comes next, and how long it will take
- the game does not allow avoidable idle states when valid choices exist

This is a design for a **medium-length campaign with a snappy opening**.

---

## 2. Product Goals

### 2.1 Primary Goals

- Reduce boring early turns and dead air in Era 1
- Preserve the full breadth of tech, unit, and building choices
- Establish a repeatable cost formula for future content additions
- Make pacing legible in the UI through clear turn estimates and clearer progression presentation
- Prevent "I ended turn but nothing meaningful was queued" states for human players
- Add light forward planning tools so turns continue to feel active after completions

### 2.2 Secondary Goals

- Make later eras reachable in normal playtests without making the entire campaign feel trivial
- Improve the feel of the tech tree by addressing issue `#56`
- Ensure browser-only, offline-friendly balance analysis and pacing validation
- Keep all new systems compatible with save/load, local storage, and the existing event-driven architecture

### 2.3 Non-Goals

This design does not:

- require a server, analytics backend, or remote telemetry
- reduce the number of tech tracks or the overall content breadth
- automate the player's empire so heavily that choices stop mattering
- promise final numeric costs in the spec itself
- redesign victory conditions

---

## 3. Current Diagnosis

The current "nothing is happening" feel comes from several compounding issues:

1. **Basic early costs are too slow for the available output**
   Era 1 cities begin with modest production and science, but many foundational units, buildings, and techs still take too many turns relative to how early they matter.

2. **The tech tree presents too much disabled content at once**
   The current panel shows an overwhelming wall of options, including many items the player cannot act on yet. This makes progression feel blocked rather than branching.

3. **Progress is not communicated strongly enough**
   The player can see costs, but not always the right "how soon will this change my game?" framing. The missing or insufficient ETA emphasis contributes to the sense of stall.

4. **The game allows unproductive idle states**
   Human players can have cities building nothing or research set to nothing even when valid options exist. This creates avoidable dead turns and makes the game feel less responsive than it is.

5. **Completions do not chain into momentum**
   Even after something finishes, the player may need to manually revisit each surface before progress resumes. This makes advancement feel stop-start instead of continuous.

The pacing overhaul must address all five, not only raw cost tables.

---

## 4. Pacing Philosophy

Conquestoria should feel active from the opening turns without losing strategic breadth.

The balancing philosophy is:

- foundational choices should arrive quickly enough to teach the game and create momentum
- not all discoveries should take the same amount of time
- not all builds should take the same amount of time
- some things should feel like quick breakthroughs
- some things should feel like long, deliberate investments
- long waits are acceptable only when the payoff feels transformative

The game's pacing should be inspired by the real world's uneven tempo of discovery and construction, but fun takes precedence over simulation. Historical intuition can inform whether a thing feels like a fast follow-up, a deliberate infrastructure project, or a marquee breakthrough. Historical realism must not justify boring waits for basic game actions.

The central question is not "How many turns long is the campaign?" The central question is "How often does the player get meaningful progress, new capability, or a satisfying next step?"

---

## 5. Campaign Target

The target is a **medium campaign** with a **snappy opening**.

Interpretation:

- the game should commonly reach later eras in normal play
- the campaign should still have weight and escalation
- the opening should not feel like a long prelude before the game begins

Era 1 targets:

- foundational units and buildings should often complete in roughly `3-4` turns in a new capital
- foundational techs should complete quickly enough that early research feels like momentum, not homework
- there should be visible movement in the player's empire almost every few turns

Later-era target:

- later eras should contain a mixture of quick, medium, and long projects
- later projects may take longer, but there should still be shorter follow-up options available
- the game should avoid eras where every meaningful choice becomes uniformly slow

---

## 6. Pacing Bands

Every costed item should belong to a pacing band. The band determines the intended time-to-payoff profile before item-specific modifiers are applied.

### 6.1 Bands

| Band | Purpose | Era 1 target | Later-era target |
|---|---|---:|---:|
| `starter` | Immediate momentum and onboarding payoff | `2-4` turns | `2-5` turns |
| `core` | Bread-and-butter progression | `3-5` turns | `4-7` turns |
| `specialist` | Niche or synergy-driven options | `4-6` turns | `5-8` turns |
| `infrastructure` | Long-term empire investments | `5-8` turns | `6-10` turns |
| `power-spike` | Strong capability jumps or broad accelerants | `6-9` turns | `7-11` turns |
| `marquee` | Transformative capstones and wonders | `10+` turns | `10-16+` turns |

### 6.2 Example Intent

- `starter`: warrior, scout, shrine, first-step research that unlocks immediate new play
- `core`: library, workshop, archer, everyday research that develops an empire normally
- `specialist`: mounted, naval, espionage, diplomacy, or counter-focused branches
- `infrastructure`: aqueduct-like, trade-network-like, growth-network-like content
- `power-spike`: strong empire-wide boosters, strong military breakpoints, broad unlock hubs
- `marquee`: legendary wonders and major capstone-like investments

### 6.3 Band Rules

- A band describes intended pacing, not thematic importance
- Two items in the same era may intentionally land in very different turn windows
- Early foundational military, economy, and science options should rarely be above `core`
- A long wait is allowed only if the item changes the game meaningfully enough to earn that wait

---

## 7. Cost Formula Framework

The game should move from hand-authored ad hoc costs toward a metadata-driven formula.

### 7.1 Core Formula

For any costed item:

`recommended_cost = expected_output_profile * target_turn_window * item_modifiers`

Where:

- `expected_output_profile` is the expected production or science available for the relevant stage of the game
- `target_turn_window` comes from `band x era x content type`
- `item_modifiers` adjust for scope, unlock power, urgency, and specialization

### 7.2 Content Types

The formula should operate separately for at least:

- `building`
- `unit`
- `tech`
- `wonder`

Different content types use different expected-output profiles:

- city production for buildings and units
- empire science for techs
- city or empire production assumptions for wonders depending on final implementation

### 7.3 Required Metadata

Each costed item should eventually declare:

- `era`
- `contentType`
- `pacingBand`
- `role`
- `impact`
- `scope`
- `snowballRisk`
- `urgency`
- `situationality`
- `unlockBreadth`

Suggested interpretation:

- `impact`: how strong the direct payoff is
- `scope`: local city, local military role, or empire-wide
- `snowballRisk`: how strongly the item accelerates future output
- `urgency`: whether the player needs access quickly to avoid frustration or helplessness
- `situationality`: how niche the item is
- `unlockBreadth`: how much downstream content this item opens

### 7.4 Modifier Principles

- Empire-wide accelerants should cost more than local equivalents
- High-snowball items should cost more than low-snowball items in the same band
- Niche or situational items may be cheaper than universally useful items
- Defensive or foundational basics should not be overpriced
- Unlock hubs that gate many follow-up choices should be priced carefully so the player does not feel bottlenecked out of whole categories

### 7.5 Human-Friendly Numbers

Recommended costs should be rounded to human-friendly values so the final roster still feels authored rather than machine-generated.

---

## 8. Era Output Profiles

The formula depends on expected output assumptions. These assumptions must be explicit and local to the repository.

### 8.1 Purpose

Era output profiles provide the baseline production and science that the formula expects an average player empire to have when evaluating item timing.

### 8.2 Profile Types

At minimum, define local profiles for:

- `new capital`
- `developed single city`
- `small empire`
- `midgame empire`
- `lategame empire`

The exact implementation can evolve, but the important point is that costs are compared against a declared expectation instead of vibes.

### 8.3 Design Constraint

Profiles are not telemetry. They are authored local balance assumptions, calibrated through local simulations and playtests.

---

## 9. Browser-Only Balance And Validation Tooling

This project is a browser game with local storage and no server. All balance analysis must be local, deterministic, and repo-native.

### 9.1 Offline Balance Audit

Create a developer-facing local audit tool that:

- reads tech, building, unit, and wonder definitions from local files
- applies the cost formula
- reports current cost vs recommended cost
- shows estimated completion turns under the configured output profiles
- flags outliers and suspicious bottlenecks

The output can be CLI text, JSON, Markdown, or all three. It does not depend on a backend.

### 9.2 Deterministic Local Simulation

Create a local simulation or scripted playtest harness that can run from fixed seeds and output comparable summaries such as:

- turn of first completed unit/building/tech
- turn of first era advance
- number of dead turns
- average completion times by category
- pacing variance across seeds

This should be deterministic so that changes in pacing are attributable to code and data changes rather than noise.

### 9.3 In-Browser Debug Telemetry

Add an optional local-only debug view or export path that can surface pacing-relevant information during playtests:

- production per turn
- science per turn
- current item ETA
- queued next items
- recent completion timeline
- current idle warnings
- dead-turn streak counter

If needed, the data can be manually copied or downloaded. No remote collection is required.

### 9.4 Success Standard

The game should be balanceable and reviewable by developers and playtesters using only local tools, saved games, seeded runs, and optional exported local reports.

---

## 10. Tech Tree UX Overhaul

This design explicitly absorbs issue `#56`.

### 10.1 Problem

The current tech panel is too long, too scroll-heavy, and shows too many disabled options at once. This contributes directly to the "nothing is happening" feel because the player's eye is drawn to unavailable content instead of reachable momentum.

### 10.2 Required Direction

The tech tree should present research as a dependency-driven progression surface, not a giant list of tracks with large blocks of unavailable entries.

Required behavior:

- display research as a dependency tree or dependency-aware progression surface
- default emphasis should be on:
  - current research
  - available now
  - next unlock layer
- de-emphasize deeper locked items instead of presenting a full overwhelming wall of disabled entries

### 10.3 ETA Requirements

The tech UI must show:

- turns remaining for the active research
- estimated turns for each currently available tech
- clear visual distinction between quick picks and long investments

### 10.4 Pacing-Friendly UX Goals

The player should be able to answer all of these quickly:

- What am I researching right now?
- How long until it finishes?
- Which techs can I pick immediately after this?
- Which options are quick momentum plays?
- Which options are bigger investments?

### 10.5 Locked Content Treatment

Deeply locked items should not dominate the screen.

Acceptable patterns:

- collapsed future layers
- faint dependency previews
- optional expand-to-see-full-tree behavior

Unacceptable pattern:

- default view as an oversized scroll of mostly disabled cards

---

## 11. City Production UX Overhaul

The city panel must communicate pacing as clearly as the tech panel.

### 11.1 ETA Requirements

For buildable buildings and units, the city panel should show:

- estimated turns to complete
- current queue ordering
- what is active now
- what is next

### 11.2 Pacing-Friendly Presentation

The city panel should make quick-payoff items easy to spot without hiding broader options.

The player should be able to quickly distinguish:

- fast foundational picks
- medium investments
- long projects

This can be visual, textual, or both, but the result must reduce decision fatigue and reinforce momentum.

### 11.3 Queue Visibility

The panel must make it clear when a city is already planned for the next few completions so the player feels progress is lined up, not constantly resetting to zero.

---

## 12. Queues And Forward Planning

To keep the feel that something is always happening, both city production and research gain short queues.

### 12.1 Queue Limits

- each city may queue up to `3` items
- research may queue up to `3` techs

### 12.2 Supported Actions

Players must be able to:

- add an item to the queue
- reorder the queue
- remove an item from the queue

### 12.3 Shared UX Rules

Production and research queues should behave consistently enough that learning one teaches the other.

Common behavior:

- show active item first
- show the next two planned items
- recalculate ETA presentation when order changes
- make removal explicit and easy
- make reorder interaction straightforward on both desktop and mobile

### 12.4 Why Queueing Matters

Short queueing reduces dead turns without removing player agency.

It helps because:

- completions can chain into more progress automatically
- the player can plan a short sequence without setting the empire on autopilot
- the game feels active between panel visits

### 12.5 Constraints

- queue depth is intentionally short at `3`
- queueing should support momentum, not replace meaningful choices
- the game should still bring the player back to decision points often

### 12.6 Invalid Queue States

If a queued item becomes invalid by the time it would start, the UI must clearly surface that and require the player to resolve it. The game must not silently waste turns on a broken queue entry.

---

## 13. No-Avoidable-Idle Rule

Human players should not be allowed to accidentally leave valid work undone when meaningful options exist.

### 13.1 Research Rule

If the human player has:

- no current research selected
- fewer than `3` techs in the research queue
- at least one valid research option

then the game should prompt the player to choose research before allowing the turn flow to continue past the relevant decision boundary.

### 13.2 City Rule

If the human player has at least one city with:

- no active production item
- fewer than `3` items in that city's production queue
- at least one valid build option

then the game should prompt the player to choose production before allowing the turn flow to continue past the relevant decision boundary.

### 13.3 UX Framing

This should feel like helpful guidance, not punishment.

The chooser should:

- explain why a choice is needed
- show the best short options clearly
- show ETAs
- make it easy to commit a sensible choice quickly

### 13.4 Recommendation Behavior

The game may recommend sensible picks, but it must not silently auto-pick for the player when valid choices exist, unless a separate future feature explicitly introduces optional automation.

### 13.5 Edge Cases

The forced-choice rule should only trigger when valid options exist. It must not trap the player in cases where:

- no research is available
- no buildable item is available
- a city is blocked by a special rule and has no valid production target

---

## 14. Fun Guardrails

The pacing overhaul must be judged by feel as much as by formulas.

### 14.1 Required Feel

- early turns should produce regular payoffs
- there should usually be at least one short-payoff option visible
- the player should feel their empire waking up quickly
- long waits should be reserved for things that feel important

### 14.2 Anti-Patterns To Avoid

- every visible option in an era taking a long time
- the only interesting techs being hidden several layers deep
- core military or science basics priced like capstones
- the player finishing something and immediately falling back into a blank state
- menus that make progression feel more stalled than it actually is

### 14.3 Strategic Breadth Preservation

Depth and breadth are preserved by:

- keeping many available branches
- differentiating them by pacing bands
- using queueing to preserve momentum
- using UI emphasis to show near-term action without deleting long-term ambition

---

## 15. Content Classification Pass

Before final numeric rebalance, the current roster should be classified.

### 15.1 Required Scope

Classify all current:

- units
- buildings
- techs
- legendary wonder production projects

If some content is not yet wired into the same systems, it should still be classified so future convergence is straightforward.

### 15.2 Classification Output

The classification should record, at minimum:

- current cost
- target era
- pacing band
- role
- notable modifiers
- recommended target range

This classification pass is the bridge between current ad hoc values and the future balancing formula.

---

## 16. Validation Criteria

The pacing overhaul is successful only if both systemic and experiential criteria improve.

### 16.1 System Criteria

- the balance audit runs locally
- the formula can generate recommendations for all classified content
- queueing is save/load safe
- forced-choice behavior respects valid-option checks
- UI ETA values match actual completion logic

### 16.2 Experience Criteria

- Era 1 foundational units and buildings commonly finish within the intended opening band
- foundational techs complete often enough that research feels active early
- later eras still contain both short and long options
- the tech tree feels less overwhelming and less stalled
- the player cannot casually waste turns by forgetting to pick production or research when valid options exist

### 16.3 Review Criteria

Before implementation is considered complete, reviewers should be able to inspect:

- the cost-model assumptions
- local audit output
- deterministic simulation summaries
- UI behavior for queueing, ETA display, and forced-choice prompts

---

## 17. Risks And Mitigations

### 17.1 Risk: Early game becomes too cheap and loses weight

Mitigation:

- use banding instead of across-the-board reductions
- preserve longer timings for infrastructure, power-spike, and marquee content

### 17.2 Risk: Queueing becomes accidental automation

Mitigation:

- keep queues short at `3`
- keep active progress and near-future choices highly visible

### 17.3 Risk: Formula creates bland, overly normalized costs

Mitigation:

- treat the formula as a recommendation engine, then round and review
- preserve authored exceptions when justified by playtest evidence

### 17.4 Risk: Forced-choice flow becomes annoying

Mitigation:

- trigger only when valid options exist
- design the chooser for speed and clarity
- use recommendations and ETA-rich presentation

### 17.5 Risk: UI redesign becomes disconnected from pacing work

Mitigation:

- explicitly treat issue `#56`, ETA display, queue visibility, and idle-state prevention as part of the pacing overhaul scope

---

## 18. Implementation Scope Boundaries

This design intentionally combines systems work and UX work because the current problem is cross-cutting. A successful implementation must include:

- balance metadata and recommendation logic
- cost retuning for current content
- local-only audit and validation tooling
- tech tree redesign and ETA display
- city panel ETA and queue visibility improvements
- queueing for production and research
- no-avoidable-idle enforcement

Treating any one of these as optional polish would leave the root pacing problem unresolved.

---

## 19. Acceptance Summary

This design is approved when Conquestoria can truthfully claim all of the following:

- the opening game is materially faster and less boring
- the game keeps its breadth of choices
- some content is quick, some is slow, and the differences feel intentional
- the player can see how many turns remain for current and available research/build choices
- the tech tree no longer defaults to an exhausting wall of disabled content
- the player can queue, reorder, and remove up to `3` research and production items
- the game does not let human players accidentally idle production or research when valid options exist
- all pacing analysis remains fully local and compatible with an offline browser game
