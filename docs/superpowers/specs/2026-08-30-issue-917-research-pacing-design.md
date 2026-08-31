# Issue #917 Research Pacing and Empire Coordination Design

**Date:** 2026-08-30  
**Status:** Approved for implementation planning  
**Issue:** [#917 — Bug: Something is off with tech calculations](https://github.com/a1flecke/conquestoria/issues/917)  
**Supersedes:** The single-city research-output assumptions in the 2026-05-13 pacing design where they conflict with this document  
**Goal:** Keep research legible, rewarding, and strategically paced from Era 1 through every future authored era while guaranteeing that every additional city is research-positive with diminishing returns.

## 1. Decision Summary

Conquestoria will retain authored `Tech.cost` values and authored pacing bands. It will replace the single-city cost-calibration model with deterministic tall, standard, wide, and issue-regression empire scenarios. Live research will use one canonical calculation shared by turn processing, the HUD, the tech panel, queued ETAs, AI planning, and balance tooling.

Multi-city science will use a transparent research-network rule: cities are ordered by current science contribution, the strongest hub contributes at full value, and later hubs contribute positive but diminishing shares. This is not a city tax. Founding, capturing, improving, or retaining a city must never reduce net science.

The all-era cost retune and the new research-network rule must launch atomically with save migration, player-facing explanation, AI parity, and exact regression coverage. The implementation must not temporarily ship one side without the other.

## 2. Player Experience Contract

### 2.1 Core promises

1. **Every city helps.** Adding a city with non-negative science cannot reduce empire research output.
2. **Science investment always helps.** Raising any city's science cannot reduce net science, even if city rankings change.
3. **Expansion has diminishing research returns.** A twelve-city empire researches faster than a comparable one-city empire, but not twelve times faster.
4. **Research remains usable.** Ordinary current-era technologies should usually take several turns, leaving time to build, move, and use their unlocks.
5. **One-turn technologies are exceptional.** They are appropriate for old backfills, an earned instant-research reward, or a temporary spike—not an entire current era.
6. **The game explains the number.** The primary HUD shows the final rate. One tap/click reveals gross city science, research-network coordination, empire bonuses, temporary penalties, and the final rate.
7. **No hidden difficulty cheats.** Explorer, Standard, and Veteran use the same research arithmetic for humans and computer players. Difficulty changes computer-player decision quality and world pressure through existing systems, not technology costs or yield multipliers.
8. **No mandatory research micromanagement.** The network automatically prioritizes the strongest research hubs. Players may specialize cities but never assign network slots manually.

### 2.2 Pacing windows

The existing band windows remain the authoritative current-frontier targets:

| Band | Era 1 | Era 2+ |
|---|---:|---:|
| Starter | 2–4 turns | 2–5 turns |
| Core | 3–5 turns | 4–7 turns |
| Specialist | 4–6 turns | 5–8 turns |
| Infrastructure | 5–8 turns | 6–10 turns |
| Power spike | 6–9 turns | 7–11 turns |
| Marquee | 10–12 turns | 10–16 turns |

Opening exceptions remain:

- starter prerequisites: 2–5 turns at the one-city opening baseline;
- first real unlocks: 8–12 turns at the one-city opening baseline;
- Bronze Working: 9–11 turns at the one-city opening baseline and 5–7 with intentional early science investment.

Scenario acceptance rules supplement, rather than replace, those windows:

- the **standard** empire's median current-frontier ETA must fall inside the authored band;
- the **tall** empire's ETA may exceed the band but must not exceed `ceil(1.5 × band.max)`;
- the **wide** empire's ordinary current-frontier technologies must not collapse below two turns;
- current-frontier power-spike and marquee technologies must not collapse below three turns;
- a technology at least two personal eras behind the civilization may legitimately take one turn;
- normalized median ETA may not change by more than 50% between adjacent eras without explicit typed metadata and a test explaining the exception.

### 2.3 Unlock usefulness

Research pacing must be checked against production and travel, not in isolation. In the standard scenario:

- an unlocked trainable unit should normally remain current long enough for a representative production city to build at least two of it before the next explicit upgrade becomes the expected frontier;
- a marquee military unlock should normally remain current long enough to build at least three or to move an initial force to a representative nearby objective;
- exceptions require typed terminal/transition metadata and an assertion documenting why the short window is intended.

This prevents the Civilization-style failure where a unit becomes obsolete before the player can meaningfully use it.

## 3. Research-Network Rule

### 3.1 Canonical city coordination

For a civilization with per-city science contributions `s1...sn`:

1. Drop missing cities; clamp malformed/non-finite contributions to zero.
2. Sort contributions descending by science, breaking ties by stable city ID.
3. For one-indexed rank `r`, calculate:

   `weight(r) = max(0.15, r^-0.85)`

4. Calculate coordinated city science without intermediate rounding:

   `coordinatedCityScience = Σ science(r) × weight(r)`

5. Add recurring empire-wide science that is not owned by a particular city at full value.
6. Apply temporary research penalties last.
7. Floor once, after all contributions and penalties, and clamp the final value to zero.

The issue #917 city contributions—`9, 8, 8, 8, 7, 5, 5, 4, 1, 1, 1, 1`—produce 65 gross city science and 24 final coordinated city science before any empire-flat bonus or temporary penalty. With the current costs, the screenshot's 25–155-cost technologies would take approximately 2–7 turns instead of 1–3. The all-era cost retune is still required because later representative outputs remain above the legacy single-city profiles even after coordination.

### 3.2 Mathematical invariants

Automated property tests must prove:

- permutation invariance except for the specified city-ID tie break;
- deterministic output for the same serialized state;
- `0 <= finalScience <= grossScience + positiveEmpireBonuses` when no negative penalty exists;
- adding a city with non-negative science never lowers the unrounded or rounded result;
- increasing any city's science never lowers the result;
- marginal city weights never increase with rank;
- the strongest city's city-owned science receives weight `1`;
- every city receives a strictly positive unrounded weight;
- a penalty cannot turn science negative;
- no per-city rounding silently erases fractional contributions before the empire total is calculated.

### 3.3 Scope of coordination

The ranked rule applies to science attributable to cities, including tiles, city centers, buildings, local wonders, local resources, network-city bonuses, unrest/crisis multipliers, and empire percentages already applied to city output.

The following are added after city coordination:

- civilization-wide legendary-wonder science;
- national-project civilization-wide science;
- empire-flat technology science;
- alliance-wide civilization bonuses.

Temporary misinformation or equivalent research penalties apply after both city and empire-wide recurring contributions.

One-time rewards—villages, quests, minor civilizations, espionage intel, wonder completion, and similar sources—do not pass through the per-turn network. They must use the canonical research-progress API and remain capable of completing exactly one technology.

## 4. Architecture

### 4.1 `research-coordination-system.ts`

Single responsibility: transform a typed list of city science contributions into a coordinated city total and expose the contribution rows used by UI and AI marginal-value calculations.

It must not know about `GameState`, technologies, difficulty, saves, DOM, events, or AI. Its public API accepts plain data and returns plain serializable data.

### 4.2 `research-output-system.ts`

Single responsibility: gather every recurring research contribution for one civilization and return a complete `ResearchOutputBreakdown`.

The authoritative turn path supplies the already-calculated per-city science map so the helper does not recalculate or mutate worked tiles. Presentation and AI callers omit that override and receive a projection built from `calculateProjectedCityYields`. Both paths use the same empire-bonus, coordination, penalty, rounding, and explanation logic.

The module must expose:

- `calculateCivResearchOutput(state, civId, options?)`;
- `getMarginalCivResearchGain(state, civId, cityId, additionalScience)` for AI/value explanations;
- typed rows for city gross, coordinated city total, empire bonuses, penalties, and final science.

It must not advance research, mutate state, render UI, play audio, or select AI technology targets.

### 4.3 `tech-system.ts`

Single responsibility for research progress remains here. `processResearch` and `applyResearchBonus` remain pure and become the only legal way to change `TechState.researchProgress`.

Rules:

- at most one technology completes per invocation;
- if a queued successor exists, positive overflow carries into that successor;
- overflow is not banked when no successor is queued;
- the completion result contains the completed technology ID and carried progress;
- every caller that owns an event bus emits `tech:completed` exactly once from the returned result;
- loading a save may normalize completion without emitting player-facing events or sounds.

Direct `researchProgress +=` mutations are prohibited by a source-rule check and regression test.

### 4.4 `research-pacing-model.ts`

Single responsibility: authoring-time research bands, scenario recommendations, and cost validation. Research-specific functions move out of the mixed production/research `pacing-model.ts`; compatibility re-exports prevent a broad import migration in one commit.

Actual runtime costs remain explicit `Tech.cost` data. The model recommends and audits; it does not dynamically replace costs during play.

### 4.5 Scenario and report tooling

Test-only scenario builders model four views for every authored era:

- **tall:** few mature, specialized cities;
- **standard:** the intended default balance target;
- **wide:** many mixed-maturity cities under the canonical coordination rule;
- **regression:** fixed reproductions such as #917's twelve-city Era-2 empire.

A deterministic report command prints, per era and band:

- gross and net science by scenario;
- current, recommended, and migrated costs;
- median and percentile ETAs;
- one-turn current-frontier counts;
- adjacent-era normalized ETA ratios;
- unlocked-unit useful-lifetime warnings.

No authored era may silently inherit the final known era's research profile. Adding a technology whose era lacks scenario data must fail the catalog test with the missing era number.

## 5. Data Flow

```text
city yield calculation ──┐
wonder/project bonuses ──┼─> research-output-system ─> ResearchOutputBreakdown
temporary penalties ─────┘             │
                                       ├─> turn-manager -> tech-system -> event bus
                                       ├─> HUD and tech panel / queue ETA
                                       ├─> AI research and production valuation
                                       └─> deterministic pacing reports/tests
```

The turn manager remains the canonical mutation orchestrator. It may gather inputs, call pure systems, commit returned state, and emit events; it must not contain research formulas.

## 6. AI and Difficulty

- Humans and computer players use identical costs, coordination, progress, overflow, and bonus rules.
- Explorer/Standard/Veteran do not alter science output or technology cost.
- AI research scoring uses canonical net science and canonical queue timing.
- AI production scoring values a science building by its marginal net research gain in that city, not by raw science alone.
- Difficulty continues to change AI candidate quality, mistake bands, tactical behavior, and crisis response through `OpponentChallengeProfile`.
- Tests cover all three difficulty modes and prove the calculation is identical for an otherwise identical civilization.
- No AI reads another player's private research breakdown or hot-seat state.

## 7. UI and UX

### 7.1 Player truth table

| Before | Action | Immediate visible result |
|---|---|---|
| HUD shows `🔬 Pictographs (+24)` | Click/tap the science item | A readable breakdown shows `Cities +65`, `Research network -41`, empire bonuses/penalties, and `Final +24` |
| Tech panel shows current and queued ETAs | Increase a city's science and reopen/rerender | Current and every queued ETA use the new canonical final rate |
| Queue shows A, B, C | Reorder or remove an item | Order and all cumulative ETAs recalculate immediately using overflow and the one-completion-per-turn rule |
| A one-time reward completes the active technology | Return to/open the tech panel | Completed styling, successor, carried progress, and ETA are immediately correct |
| Current hot-seat player changes | Open HUD or tech panel | Only the new current player's research rate, bonuses, penalties, and queue are visible |

### 7.2 Progressive disclosure for ages 7–43

- The default surface shows one whole-number final rate and a turn count.
- The expanded explanation uses the phrases `Cities`, `Research network`, `Empire bonuses`, `Temporary penalties`, and `Final research`; it never exposes exponent terminology.
- Explanatory copy states: `Every city helps. Your strongest research cities contribute the most; additional cities add smaller amounts.`
- Color is supplementary, never the only indication of positive/negative rows.
- Tap targets remain at least 44px, keyboard focus is visible, and the breakdown has an accessible name and text equivalent.
- No child-specific data, age gate, profile, telemetry, or personalization is introduced.

### 7.3 Misleading UI risks

- The HUD must not label gross city science as the rate actually spent.
- The panel must not call coordination a fixed `penalty`; it is the difference between gross and coordinated city contribution and can change as city outputs change.
- Queue ETAs must not divide every cost independently; they must simulate active progress, overflow, queue order, and the one-completion-per-turn floor.
- A `1 turn` label must mean completion on the next applicable owner turn.
- Empire-flat bonuses must not be shown inside a city row.
- Hidden hot-seat players' technology, bonuses, and penalties must never appear in the current viewer's breakdown.

### 7.4 Interaction replay checklist

Tests replay:

- open and close the research breakdown repeatedly;
- add first and second queued technologies;
- reorder up and down;
- remove first and later queued items;
- repeat-click after immutable state commits;
- apply a science-changing city focus and rerender;
- complete via normal turn science and via one-time reward;
- switch hot-seat players and reopen;
- save, reload, and reopen.

## 8. Saves and Migration

The all-era cost retune changes the meaning of persisted absolute `researchProgress`; therefore it requires one schema migration and must not be split across multiple cost-changing releases.

The migration stores a checked-in map of pre-retune base costs for every changed technology. For each civilization with valid active research:

1. calculate the old effective cost, including the old Cloud Computing discount when applicable;
2. calculate the new effective cost;
3. preserve `oldProgress / oldEffectiveCost`, clamped to `[0, 1]`;
4. write the equivalent integer progress against the new effective cost;
5. if the legacy state was already at or above completion, normalize the completion and advance the queue without emitting events or audio;
6. leave queued follow-ups at their existing zero/unstarted progress semantics;
7. remain idempotent after the save reaches the new schema version.

The research-network calculation itself stores no new per-save state and needs no migration. The UI breakdown is derived. Future eras that only add new technologies need no migration unless they also change existing costs or persisted research shape.

## 9. Audio

- Keep the existing `tech:completed` sound path.
- Emit and play it exactly once for normal, overflow-assisted, and instant-reward completion by the current viewer.
- Do not play sounds for passive coordination recalculation, opening the breakdown, save migration, or hidden hot-seat/AI completions.
- No new audio asset is required for this balance correction.

## 10. Delivery Roadmap

### MR1 — Canonical truth without balance changes

- add pure coordination/output types and an identity-policy characterization path;
- centralize recurring science bonuses, penalties, HUD, panel, queue, and AI projections;
- eliminate direct progress mutations and restore #39's invariant;
- preserve current live science and costs in this MR;
- add parity tests proving player, AI, and hot-seat callers see the same canonical arithmetic.

### MR2 — All-era balance laboratory

- extract the research pacing model from production pacing;
- add tall, standard, wide, and #917 scenario builders for Eras 1–13;
- add the deterministic report and useful-lifetime audit;
- make missing future-era profiles fail loudly;
- check in the reviewed all-era cost table and migration map without activating them.

### MR3 — Atomic all-era launch

- activate ranked coordination and all Era 1–13 costs together;
- bump the save schema and preserve in-progress percentages;
- activate canonical HUD, breakdown, tech-panel, queue ETA, and AI marginal valuation;
- preserve difficulty symmetry and hot-seat viewer isolation;
- run focused, full, durable, web-build, and browser-smoke validation.

### MR4 — Overflow and completion polish

- carry overflow to a queued successor while retaining one completion per turn;
- update queue timing and visible carried progress;
- prove exactly-once completion events/SFX for turn, reward, and AI paths;
- re-run the all-era report to ensure overflow changes campaign throughput without reintroducing current-frontier one-turn collapse.

Each MR must update the implementation plan's status. MR3 must not be split into a cost-only, coordination-only, migration-only, or UI-only partial merge.

## 11. Verification Matrix

### Automated

- pure formula example and property tests;
- authoritative-turn versus projected-output parity fixtures;
- every recurring bonus and penalty as an isolated row plus combined-order test;
- every one-time reward path through `applyResearchBonus`;
- all Era 1–13 catalog and scenario gates;
- #917 exact twelve-city fixture;
- one-city Bronze Working baseline and invested cases;
- tall/standard/wide scenario percentiles;
- adjacent-era normalized pacing continuity;
- explicit upgrade-chain useful-lifetime audit;
- AI research and science-building valuation;
- Explorer/Standard/Veteran calculation equality;
- solo and two-human hot-seat owner-turn parity;
- queue add/reorder/remove/replay and DOM refresh;
- schema migration, malformed legacy state, future-schema rejection, and idempotence;
- exactly-once completion events and viewer-scoped SFX;
- source guard against direct `researchProgress` mutation.

### Manual playability

Run deterministic play scripts or saved fixtures covering:

- a young/new player path that follows recommendations and does not specialize heavily;
- a science-focused tall empire;
- peaceful wide expansion;
- conquest-heavy expansion with occupied/unrest cities;
- completionist backfill;
- each opponent difficulty;
- solo and two-to-four-player hot-seat handoffs;
- a pre-migration save at 0%, approximately 50%, 99%, and malformed 100% progress;
- late-era unit production/travel before upgrade obsolescence;
- a future-era fixture proving the missing-profile failure message is actionable.

## 12. Acceptance Criteria

- #917's twelve-city fixture no longer shows every relevant technology at one turn.
- Every city and every positive city-science improvement is non-decreasing for net research.
- Standard-scenario current-frontier medians satisfy authored band windows across Eras 1–13.
- Wide current-frontier ordinary technologies have a two-turn floor; wide power-spike/marquee technologies have a three-turn floor.
- Tall scenario ETAs remain at or below `ceil(1.5 × band.max)`.
- No unexplained adjacent-era normalized median shift exceeds 50%.
- Existing opening Bronze Working contracts remain green.
- AI and all difficulty modes use the same research rules as humans.
- HUD, panel, queue, and turn processing agree exactly.
- Old saves preserve active-research completion percentage and load idempotently.
- Solo and hot-seat research is viewer-safe and owner-turn correct.
- Completion event and sound fire exactly once.
- Every authored future era must add explicit scenario/profile data before catalog tests pass.
- `yarn build`, focused mirrored tests, source-rule checks, durable suite/status, and browser smoke all pass for the launch MR.

## 13. Non-Goals

- changing production speed, global game speed, map movement, or combat rules;
- adding a player-selectable research-speed setting;
- giving difficulty modes hidden science bonuses or discounts;
- adding manual research-network assignments;
- dynamically changing a technology's cost after research begins;
- introducing age tracking, child accounts, analytics, or new personal data;
- commissioning new SFX;
- redesigning the technology tree's prerequisites or unlock content.
