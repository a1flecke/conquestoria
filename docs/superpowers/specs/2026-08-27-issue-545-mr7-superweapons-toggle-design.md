# #545 MR7 — Superweapons Setting & Off-Mode Design

## Goal

Implement spec §13 of the arc-level design (`docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`): a `GameSettings.superweapons?: 'off' | 'on'` toggle that fully suppresses every strategic-deterrence verb (capacity, launch platforms, arms-control pacts, AI deterrence caution) while keeping the full building/tech/unit branch buildable for its ordinary yields — plus an honest content-description pass for the 6 entities whose text currently makes ICBM-specific claims.

## Architecture: gate at existing-contract boundaries, not a threaded parameter

The naive approach — thread a new `settings`/`GameState` parameter through `getAvailableBuildings` and its ~6 call sites — was rejected. Every "strategic verb" function already receives `state: GameState` as its first argument, so the gate belongs *inside* those functions, not in a new parameter threaded through everything downstream of them.

**The SRP question that actually matters:** does this function's *own documented contract* already mean "is this usable/available right now" (a live, gameplay-effective answer) — or does it mean "what happened / what physically exists" (a historical or computational fact)? Only the first category may fold in the settings check without corrupting its meaning for other callers (a codex/history/stats screen, a future feature). Sorted by that test:

| Function | File | Contract | Gate here? |
|---|---|---|---|
| `hasManhattanProject` | `strategic-arsenal-system.ts` | historical fact ("thin, permanent query against `builtNationalProjects`" — MR6's own comment) | **No** — stays pure |
| `getStrategicArsenalCapacity` | `strategic-arsenal-system.ts` | physical computation from current buildings | **No** — stays pure |
| `getArsenalStatus` | `strategic-arsenal-system.ts` | MR6's own build-eligibility chokepoint — "can I currently build a warhead" | **Yes** |
| `getEligibleStrategicLaunchPlatforms` | `strategic-launch-system.ts` | always a live/derived "what's launchable now" | **Yes** |
| `hasArmsControlTreaty` | `diplomacy-system.ts` | own MR6 doc comment: "available to propose... now" | **Yes** |
| `hasKnownStrategicCapability` | `strategic-arsenal-system.ts` | "does the viewer currently perceive real capability" | **Yes** |

A new pure predicate, `isSuperweaponsEnabled(state)` (backed by `resolveSuperweaponsFlag(settings)`, mirroring `resolveWorldPressureFlags`'s exact shape in `world-pressure-flags.ts`), is the single source of truth every gated function checks.

**Two gaps this pattern alone doesn't cover**, found by tracing every consumer of these six functions rather than trusting the chokepoint list to be complete:

1. **`strategicArsenalValueScore`** (`ai-production.ts`) scores `arsenalCapacityGated` buildings (Nuclear Arsenal, Missile Silo) by the civ's war count — an AI production-desirability signal *independent of* `getArsenalStatus`'s build-eligibility gate. When off, this still exists and gives the AI a phantom incentive to prioritize buildings whose capacity contribution can never materialize. Needs its own `isSuperweaponsEnabled` check, returning 0 when off.
2. **`hud-controller.ts`'s arsenal HUD button** checks `getStrategicArsenalCapacity(state, civ.id) > 0` **directly**, not through `getArsenalStatus`. This is the *only* discoverable entry point to the Strategic Arsenal panel (`panel-actions-controller.ts` has no other route to `'strategic-arsenal'`) — so gating visibility here is the single correct chokepoint for the whole panel's reachability, not a workaround. No redundant check is needed inside the panel itself.
3. **`city-panel.ts`'s `arsenalStatusLine`/`getLockedItemReason`** (the warhead build-queue display) also call `getStrategicArsenalCapacity` directly, for the same reason. Both need the check, and `getLockedItemReason`'s off-mode branch must return a plain "not available in this game" message rather than falling through to the generic missing-tech/resource reasoning (which would misdescribe the real cause).

## Setting resolution

- **New solo games**: `createDefaultSettings` sets `superweapons: 'on'` directly — a silent default, no setup-screen card (per spec's exact wording: "chosen explicitly at hot-seat setup," implying solo does not get an explicit prompt).
- **New hot-seat games**: an explicit choice card in `campaign-setup.ts`, mirroring `beastsMode`'s existing card pattern exactly (default selection `'on'`).
- **Legacy saves** (field `undefined`): `resolveSuperweaponsFlag` falls back to `'off'` — the one deliberate asymmetry from `beastsMode`'s "undefined inherits the live default" convention (spec's explicit rationale: retroactively arming an existing family's save without anyone opting in defeats the toggle's purpose).
- **Mid-game / legacy opt-in**: a new toggle in `pause-menu-panel.ts` (this game's existing mid-game settings surface, currently audio-only) — this is what makes the spec's "a settings screen lets the player explicitly opt in afterward" concrete.

**Considered and deliberately dropped**: a first-load notification for a legacy save that had active nuclear investment (`hasManhattanProject` or `strategicArsenal > 0`) before this MR shipped, explaining that superweapons defaulted to off. This codebase's own established precedent for exactly this situation — `world-pressure-flags.ts`'s `aiPressure`/`aiCrisisInteractions` rollout flags, which also silently change legacy-save AI behavior on load with no notification (per that file's own comment: "this is the rollout mechanism") — does not notify. Adding one here would be a new, inconsistent UX pattern rather than a fix; the pause-menu toggle is the spec's stated remedy, and a player will discover it there when they look for their now-inert nuke capability.

## Content honesty

The 6 entities named in the arc spec (`manhattan_project`, `nuclear_arsenal`, `missile_silo`, `strategic_air_command`, `arms_control_treaty` buildings, `missile_submarine` unit, plus their gating techs) keep their real descriptions when `'on'`. When `'off'`, each falls back to honest plain-yield text with the ICBM/capacity/launch claim removed entirely (e.g. Missile Silo: "Hardened underground command bunker. +4 production per turn." — dropping "+1 arsenal capacity... this silo can launch it..."). This is a UI-read-time concern, separate from the gameplay-availability gating above: a small resolver checked at the specific UI call sites that render these 6 entities' descriptions (city panel build queue/locked items, tech panel unlock text, unit training panel) — not a blanket rewrite of the description system. Exact call sites to be verified against the live tree at plan-writing time, per `.claude/rules/spec-fidelity.md`.

Per `.claude/rules/content-description-honesty.md`'s checklist: each rewritten string needs a positive test asserting the claimed effect is real (or, for the off-mode fallback, that no false claim remains) — not just a `description-honesty.test.ts` denylist pass.

## Testing shape

- Direct unit tests for `isSuperweaponsEnabled`/`resolveSuperweaponsFlag` (on/off/undefined).
- For each of the 6 gated functions: an on-case (unaffected, matches pre-MR7 behavior) and an off-case (returns the "nothing" answer) — negative tests proving the gate actually suppresses the verb, per `.claude/rules/spec-fidelity.md`'s "add tests for A without B."
- `strategicArsenalValueScore` off-case: 0 regardless of war count.
- HUD button and city-panel display: off-case hides/changes the line; on-case unaffected (regression via existing MR4-era HUD/city-panel test patterns).
- Full-catalog description-honesty test extended for the 6 entities' off-mode text (no ICBM/capacity claim survives).
- Full regression: solo default-on and legacy default-off, hot-seat card selection, mid-game pause-menu toggle round-trip.

## Non-goals

- No change to any yield value, production cost, or era-pacing number — this MR is purely a gate on the strategic-verb *layer*, not the buildings' baseline economy contribution (per spec: "the full branch stays in the tree, fully buildable — no dead branch, no wasted research").
- No retroactive capacity/arsenal state change on toggle — always computed live from current buildings + the flag, so flipping the setting mid-game needs no special-case migration code.
