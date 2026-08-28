# #545 MR8 — Hot-Seat Privacy Pass, Save/Migration Verification, Final Balance Audit Design

## Goal

Close out the arc-level design's §15 (hot-seat & privacy), §16 (save/load), and the final "full balance/pacing re-audit + full test-matrix closure" roadmap item (`docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`). This MR is a verification pass, not new-feature work: each of §15's 5 claims was checked directly against the current codebase before writing this design, per `.claude/rules/spec-fidelity.md`'s "verify claims directly" guidance.

## §15 findings (verified against MR1-7's actual code, not assumed)

| Claim | Status | Evidence |
|---|---|---|
| Launch action/arsenal count/platform status are always `state.currentPlayer`'s own | ✅ Already correct | `getStrategicArsenalSummaryPresentation`'s only caller passes `deps.session.getState().currentPlayer`; `city-panel.ts`'s and `selected-unit-info.ts`'s Prepare-Strategic-Launch sections both gate on `owner === state.currentPlayer` (MR7 fixes) |
| Cap-treaty availability can't leak a sibling's hidden arsenal by absence | ✅ Already correct | `hasArmsControlTreaty` reads only the proposing civ's own `builtNationalProjects` entry — never touches the target civ at all |
| Overlays/previews/disabled-reasons never reveal an undiscovered rival platform's location | ✅ Already correct | `getStrategicLaunchLegality`'s target list requires `hasDiscoveredCity(state, actorCivId, targetCityId)` before a city can appear as a legal target at all |
| Notifications/audio scoped to civs who'd legitimately know | ✅ Already correct | `register-strategic-strike-presentation.ts` already routes through `deliver(recipientCivId, ...)`/`deliver(witnessCivId, ...)` with `hasMetCivilization` witness-qualification on both sides, and SFX gates on `state.currentPlayer` being a direct party or qualified witness (MR5 consolidation) |
| No stale panel state survives a hot-seat handoff | ❌ **Real gap found** | See below |

## The one real bug: strategic-launch flow survives hot-seat handoff

`turn-flow-controller.ts`'s handoff cleanup block (around the `setBlockingOverlay('turn-handoff')` call) already has an established pattern for exactly this class of problem:

```ts
closePirateWatersPanels(uiLayer);
closeNetworkPanelsForHandoff();
ceremonies.clearForHandoff();
renderLoop.setSelectedPirateFactionId(null);
```

Two things belonging in this same list are absent:
1. `renderLoop.setStrategicLaunchPreview(null)` — the blast-radius/target preview overlay. `render-loop.ts`'s own comment says it's "cleared on stage-2 exit (cancel, back, or advancing to stage 3) and on flow close" — every case is a *user-driven* interaction with the flow itself, none is "the turn ended regardless of what the flow was doing."
2. A DOM cleanup for the `#strategic-launch-flow` panel root, mirroring `closePirateWatersPanels`'s exact shape (`container.querySelector('#strategic-launch-flow')?.remove()`).

Concretely: a player who opens the strike-target picker, selects a target (arming the preview), and ends their turn without explicitly canceling would leave both the canvas overlay and the open target-selection panel itself for the next hot-seat player to see — the exact "previous player's pending target/preview state" the spec names.

**Fix:** add a `closeStrategicLaunchFlow(container)` export to `strategic-launch-flow.ts` (matching `closePirateWatersPanels`'s exact signature/pattern), and call both it and `renderLoop.setStrategicLaunchPreview(null)` in `turn-flow-controller.ts`'s handoff block, alongside the existing pirate/network/selected-faction cleanup.

## §15 regression coverage — self-review correction

The initial draft of this design assumed none of the 4 already-correct claims had a dedicated regression test. Verified directly against the live test files before finalizing (per `.claude/rules/spec-fidelity.md`) — that assumption was wrong for 3 of the 4:

- `hasArmsControlTreaty`'s existing `'is civ-scoped'` test (`diplomacy-system.test.ts`) already proves civ A's availability is unaffected by civ B's state. **No new test needed.**
- `register-strategic-strike-presentation.test.ts` already has `"an AI-vs-AI strike the human hasn't met both civs in produces no witness notification and no SFX"` — exactly the leak this claim guards against. **No new test needed.**
- `getLegalStrategicLaunchTargets`'s underlying `getStrategicLaunchLegality` already has a direct `'rejects with target-not-discovered when the target city has not been explored'` test, and `getLegalStrategicLaunchTargets` itself is a 3-line filter over that function's `.ok` result — the composition is thin enough that the lower-level test is sufficient coverage. **No new test needed** (a redundant wrapper-level test would just re-assert what the lower-level test already proves).
- **Strategic Arsenal panel is the one genuine gap**: no existing test proves `getStrategicArsenalSummaryPresentation` for civ A is unaffected by civ B's arsenal/platform state when both are passed the same multi-civ `state`. Gets one direct test.

## §16 (save/load) verification

No new migration code — every arc-added field is already optional with a correct fallback:
- `Civilization.strategicArsenal?: number` → `getStrategicArsenal`'s `?? 0`.
- `GameSettings.superweapons?: 'off' | 'on'` → `resolveSuperweaponsFlag`'s `?? 'off'`.
- `Treaty.arsenalCap?: number` → absent on every non-`arms_control_pact` treaty, and no legacy save can have that treaty type at all (it didn't exist before MR6).
- `HotSeatConfig.settingsOverrides?: Partial<GameSettings>` → optional, MR7.

MR8 adds explicit regression tests loading a state literal that omits every one of these fields and asserting the whole feature set still behaves correctly (no crash, capacity computes as 0, arsenal reads as 0, etc.) — turning the "already safe by construction" claim into something a future change can't silently break without a test noticing.

## Balance/pacing re-audit

`pacing-audit.test.ts`, `pacing-reference-economy.test.ts`, `national-project-balance.test.ts`, and `wonder-definitions.test.ts` already pass in full (323/323, verified as a baseline before writing this design) — the whole arc's cumulative yield changes (Manhattan Project's production moving to Nuclear Arsenal in MR1, Arms Control Treaty's own yield, etc.) stay within the established ceilings. MR8 records this confirmation explicitly (a short note in the plan doc, not new test code) rather than re-deriving balance work that's already correct.

## "Full test-matrix closure"

Given MR1-7 already carried their own extensive test suites (9198 tests as of MR7's merge) and this MR's own new tests close the specific gaps above, "full test-matrix closure" here means: run the complete suite one final time at the end of MR8 and confirm every strategic-deterrence-related test still passes together — not a new testing framework or coverage tool.

## Non-goals

- No new gameplay mechanic — this MR only fixes the one confirmed hot-seat leak and adds regression coverage for already-correct behavior.
- No balance/yield changes — the audit is a confirmation pass, not a retune.
- No new save-migration entries — the existing optional-field design is already correct; only tests are added.
