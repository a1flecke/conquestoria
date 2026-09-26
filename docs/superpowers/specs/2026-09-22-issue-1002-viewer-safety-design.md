# #1002 — Viewer Information Safety: Design + Plan

**Base:** `origin/main` @ `f510491a` (audited at `bc193715`, #1090 merged; #1082 landed in between, unrelated). **Issue:** #1002 (Phase A of #1026).

## Stage 0 — what is actually true on `main`

| Area | State at base |
|---|---|
| Canonical predicates | `shouldListMajorCivForViewer` / `canInspect*ForViewer` (`viewer-intel.ts`), `hasMetCivilization` (`discovery-system.ts`), `getVisibility`, `isUnitConcealedFrom` — all present and reused below. |
| Surface tests | Strategic warnings (#1090), diplomacy panel, world pressure, legendary-wonder intel, viewer-event presentation, domination presentation each hand-roll their own privacy assertions ("does not contain X"). None share a helper; none prove that a *change* to hidden state leaves the output unchanged. |
| Movement explainer | `redactMovementRejectionForViewer` keys off the **destination only** (explicit TODO naming #1002). Confirmed leak (RED tests): a hostile unit or barbarian camp on an *unexplored path tile* is explained by name; the same for a unit in *fog* or a *concealed* submarine (destination or path), and for the Zone-of-Control copy when the ZoC source is unseen. The executor-failure path (`executeAnimatedUnitMove`) shows the raw resolver `message` with no redaction at all. |
| #435 | Fixed on the **writer** side (`105f1225`: treaty/war writers refuse unmet pairs; `tests/integration/save-load-mass-discovery.test.ts`). No test pins the **reader** side: authoritative cross-civ relationship state (AI↔AI treaties/wars, drift-capped relationship scores, AI national intent) surviving save/load without making any viewer acquainted with, or able to list, an unmet civ. |
| Hot seat | No helper that projects one world for two viewers and checks each is bounded by its own knowledge. |
| Structural | Only the domination-authority source rule. Nothing stops a viewer-facing module from reading `state.opponentAI` (AI strategic internals) or surfacing a raw movement resolver message. |
| Issue staleness | World races / rival history / named wars / big moments are not shipped — they are future consumers of the harness, not coverage targets. |

## Architecture (three layers)

1. **Authoritative state** — omniscient; canonical legality (`resolveUnitMoveIntent`) and AI decisions live here and are **not** changed.
2. **Viewer projection** — `*ForViewer` helpers, `deriveStrategicWarningTransitions(…, viewerId)`, `getMovementBlockerReason` / `presentMovementRejectionForViewer`. The invariant is proved here.
3. **UI** — consumes (2). A structural rule forbids viewer-facing modules from reaching into AI internals or the raw movement resolver.

## 1. Differential harness — `tests/helpers/viewer-safety.ts`

No universal object walker (it cannot tell a civ id from a flavour string). Instead:

- `ViewerSurface<W, P>` = `{ name, project(world, viewerId) }` — `W` is whatever the surface reads (a `GameState`, or `{ before, after }` for round-transition surfaces).
- `expectViewerSafety(surface, { world, viewerId, hidden, earned })`:
  - every **hidden** mutation must actually change the world (no vacuous mutations) and must leave the viewer's projection **deep-equal**;
  - at least one **earned** control is **required** and must change the projection — a constant projection cannot pass.
- `expectHotSeatDifferential(surface, { world, viewers: [a, b], knownOnlyTo: b, mutation })` — **one** shared world: the mutation changes b's projection and leaves a's unchanged.
- `domProjection(el)` — normalized text **plus** `title` / `aria-*` / `alt` / `data-*` attribute values, so hidden tooltip/ARIA text is part of the compared projection.

## 2. Knowledge fixtures — `tests/helpers/viewer-knowledge-fixtures.ts`

Real `createHotSeatGame` world (two humans + AIs). Composable helpers: `makeMet`, `expectUnmet` (fails if the "unmet" case would be vacuous), `setTileVisibility`, `setNationalIntent`, `signTreatyForTest` (AI↔AI, the #435 class), `driftAllRelationships` (with a spare-the-known-pairs option — the harness caught a first draft that also drifted the viewer's known relationship).

## 3. Path-aware movement redaction

- *Revised during implementation.* A first draft tagged rejections with evidence inside `validateUnitMove`. It was dropped: redacting an unexplored-path blocker to a generic string still **differs** from what the viewer would see with no blocker ("Move one step at a time into unexplored territory"), so the differential test fails. The correct answer is *what the canonical resolver says over the viewer's knowledge*.
- `projectMovementKnowledgeForViewer(state, viewerId)` — explanation-only view: foreign units only on **visible** tiles and not concealed (units are never remembered in fog); cities / camps / pirate enclaves only on **explored** tiles (matching `hasDiscoveredCity`, so remembered structures stay explained); terrain untouched.
- `presentMovementRejectionForViewer(state, unitId, to, viewerId)` is the ONE rule: destination unexplored → "Too far away to spot."; else re-resolve with the unchanged `resolveUnitMoveIntent` over that projection → its reason if still refused; the ZoC copy if the viewer can see the ZoC source; otherwise `hidden-obstacle`: "Something out of sight is in the way." `validateUnitMove` is not modified at all.
- `getMovementBlockerReason` takes the viewer to be `unit.owner` (owner-scoped, as #1025 MR4 required) and reads that civ's visibility itself — callers can no longer pass a partial or wrong visibility. A civ with no visibility map knows nothing.
- `executeAnimatedUnitMove` routes executor failures through the same function (sibling leak).
- **Bounded residue (documented):** `unreachable` answers terrain connectivity (no actor evidence); the tap-range highlight is canonical legality and necessarily reflects hidden blockers — hiding legal moves or offering illegal ones is worse (#998). The explainer never says *what* or *where*.

## 4. Structural enforcement

`tests/helpers/viewer-safety-boundaries.ts` — a pure matcher over (path, source), exercised by fixture snippets that model realistic regressions and by a scan of `src/ui`, `src/presentation`, `src/renderer`, `src/input`, `src/app`:

- **R1** no `opponentAI` read (AI strategic internals) — allowlist: `src/ui/turn-handoff.ts` (the viewer's own audio-dedup ledger).
- **R2** no import from `@/ai/**` — allowlist: `ai-unit-roles` (a static unit-role catalog).
- **R3** no `resolveUnitMoveIntent` / `validateUnitMove` — allowlist: `src/input/worker-movement-flow.ts` (a gate whose failure flows into the redacting executor path).

## 5. Consumers (materially different boundaries)

| # | Existing test area | Boundary proved |
|---|---|---|
| 1 | `strategic-warning-system.test.ts` (#1090) | unmet civ's intent shift invisible; visible after contact; **hot-seat** two-viewer differential on one world |
| 2 | `unit-movement-explainer.test.ts` + `selected-unit-movement-feedback.test.ts` | unexplored path tile / fog unit / concealed submarine / unseen ZoC source cannot change the player-facing reason |
| 3 | `diplomacy-panel.test.ts` | AI↔AI treaty, drift-capped relationship, unmet-civ rename cannot change the rendered panel (text + attributes) |
| 4 | `legendary-wonder-intel.test.ts` | **remembered** intel: live project changes don't alter the summary; stored intel is kept when the rival is no longer visible |
| 5 | `world-pressure-presentation.test.ts` | a crisis on an unmet civ is invisible; on a met civ it appears |
| 6 | `save-load-mass-discovery.test.ts` (#435) | cross-civ relationship state + save/load/normalize never grants acquaintance |

## Self-critique (condensed answers)

False confidence is bounded by requiring an earned control per case and a non-vacuous-mutation check. Remembered facts: the wonder-intel case asserts they survive; the movement rule keeps remembered structures in fog explained. Public facts are never used as hidden mutations. Hot seat uses one world with two viewers. Structural rules are narrow with named allowlists (zero false positives on the current tree). No UI duplicates projection logic. AI never consumes a viewer projection; the parity test pins `resolveUnitMoveIntent`. No persisted state, no migration. Runtime cost is a handful of visibility/concealment lookups on a rejected tap — no new world scans on hot paths. The #435 test targets the causal class (non-visibility evidence + load), not the old AI loop.

## Plan / verification

1. RED: movement explainer + feedback tests; #435 reader-side regression; harness self-tests; boundary matcher fixtures.
2. GREEN: knowledge projection + explainer rule → selection-controller → harness/fixtures → migrate consumers.
3. Docs: `invariants.md` (#1002 row), `movement-actions.md`, `ui-panels.md`.
4. `check-src-rule-violations.sh` on changed src; targeted tests; shard allocation for the new test file; `yarn build`; `yarn test:durable` + status. AI-long skipped (no AI/simulation semantics change).
