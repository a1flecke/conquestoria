# Issue 845 Root-Cause Fix Plan: Undefended Camps + Naval Attack-Domain Regression

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix two independent, confirmed defects reported against #845: (1) a unit can walk
straight onto/through an undefended barbarian camp instead of being offered an assault, and (2)
a genuine regression that makes Galley and Trireme unable to attack any naval unit, pirates
included.

**Architecture:** Task 1 extends the same "map entity blocks ordinary movement" pattern being
added for cities in the #843 plan (`2026-08-16-issue-843-undefended-city-movement.md`) to cover
`state.barbarianCamps` as well. Task 2 is unrelated — a pure attack-legality fix in
`attack-targeting.ts`, no movement code involved.

**Tech Stack:** TypeScript, Vitest.

---

## Finding 1: undefended barbarian camps are not a movement obstacle at all (worse than #843)

**Screenshot evidence:** an Archer with `Moves: 0/2` shown standing directly on top of a desert
camp structure — "he disappeared into it" instead of attacking from range.

**Root cause:** `state.barbarianCamps` (`src/core/types.ts` `BarbarianCamp`) is a third map-entity
registry, parallel to `state.units` and `state.cities`, but it has **zero representation** in the
movement system:

- `grep -n "camp" src/systems/unit-movement-system.ts` — no matches. `validateUnitMove` has an
  explicit `foreignCity` rejection for cities (see #843's plan) but nothing analogous for camps.
  A camp tile is terrain-passable, so an ordinary move onto it simply **succeeds**.
- `grep -n "camp" src/input/*.ts src/app/controllers/map-interaction-controller.ts` — no matches
  either (aside from the unrelated `'lumber_camp'` worker-action string). There is no
  `resolveSelectedUnitTapIntent`-style `'assault-camp'` intent at all.

**Why this only shows up when the camp is undefended:** `processBarbarians` spawns each new
raider directly onto its camp's own tile (`src/systems/barbarian-system.ts:631`,
`spawnedUnits.push({ campId: camp.id, position: { ...camp.position } })`). While that raider is
still standing there, attacking the camp tile is really attacking the raider — ordinary
unit-vs-unit combat, which works today, and `applyCampDestructionAtTarget` (invoked from
`player-action-controller.ts` after a defender is destroyed at that position) then destroys the
camp as a side effect. The bug only appears in the (common) window where the camp currently has
no garrison — the exact same "no defenses" condition as #843's city bug, and structurally the
same defect class: **a special map entity that must block ordinary movement and offer a distinct
action instead is invisible to the movement system unless a unit happens to be standing on it.**

## Inline review of Finding 1 (balance, fun, ages 7–43, play styles, UI/UX, architecture, saves, hot-seat)

- **Balance / fun:** clearing barbarian camps is a core early-game income/safety loop; right now
  it silently fails the moment a camp has no visible garrison, which is common (raiders leave to
  raid, or the spawn cooldown just hasn't fired yet). No numeric change needed once fixed — reuses
  the existing `destroyCamp`/`applyCampDestructionAtTarget` flat-gold reward unchanged.
- **Ages 7–43 / play styles:** completionist/explorer players ("clear every camp off the map")
  are hit hardest, since they're the ones most likely to approach a camp between raider spawns.
  For younger players especially, "my unit just walked into the enemy base and nothing happened"
  reads as broken, not subtle — favor the simplest, most legible fix (see recommendation below).
- **Design-call resolution:** an early draft of this task left "direct attack vs. dedicated panel"
  open. **Recommendation: route it through the existing combat-preview → `executeAttack` path**,
  treating the camp as a plain attackable target (no capture/raze choice, since a camp only has
  one outcome — destroyed). This matches lower cognitive load for the youngest players, reuses an
  already-tested interaction pattern instead of adding a new modal, and avoids duplicating the
  city-capture panel's more complex two-choice UI for a mechanic that doesn't need it. Land this
  as the default; only build a dedicated panel if a reviewer specifically wants one.
- **Fun / flavor:** once a camp has a real "you attacked and destroyed it" moment instead of
  silently vanishing, surface `camp.banditLordName` in the destruction notification when present
  (`"Bandit Lord Kestrix's camp is destroyed! +18 gold"`) — the data already exists for named
  resurgent camps and currently goes unused in this path; this is a cheap, high-value addition
  once the interaction itself exists. Not required, but low-cost enough to bundle in.
- **Architecture / extensibility:** reuse the #843 plan's `getBlockingMapEntityAt` predicate
  (Task 1 there) rather than writing a parallel camp-specific BFS/validation check — add a
  `state.barbarianCamps` case to that one function so both cities and camps share the same
  BFS-termination and `validateUnitMove` rejection wiring.
- **Data / saves:** no `GameState` schema change — camps are already a persisted registry
  (`state.barbarianCamps`), untouched by this fix; the only "data" change is a new
  `MovementBlockerReason`/validation reason string, which is derived, not persisted. **No save
  migration required.**
- **Hot-seat:** same requirement as #843 — the blocking check must key off the acting unit's
  `owner`, not `state.currentPlayer`. Add the same two-human-civ, seat-switch regression as #843's
  Task 6 once this camp case is added to the shared predicate.
- **AI/difficulty:** barbarian camps are already primarily an AI-vs-environment concern (major
  civs and AI already fight raiders when they spawn); this fix doesn't change combat outcomes,
  only whether an *undefended* camp can be targeted at all, so no AI behavior change is expected
  beyond "AI can now also clear undefended camps it previously couldn't." **Correction after
  implementation:** the AI had a real, separate gap here, not just an inherited one — major-civ
  AI plans can already target `kind: 'camp'` (`ai-plan-portfolio.ts`, `ai-objective-scoring.ts`,
  `ai-round-scheduler.ts`), but `ai-tactics.ts` had no tactical action at all for an undefended
  camp (only `ai-major-turn.ts`'s post-combat follow-up existed, gated on killing a defender
  first) — the AI would path adjacent and then stall with nothing to do. Fixed with a new
  `rankCampAssault` (`ai-tactics.ts`) and `'assault-camp'` execution case (`ai-major-turn.ts`),
  confirmed via the same regression-first method as everywhere else in this arc.

### Task 1 — Make undefended camps block ordinary movement and offer an assault action

**Deviation from the original design call:** the inline review above recommended routing camp
assault through the existing unit-vs-unit `combat-preview` → `executeAttack` path to avoid new UI.
That turned out not to fit: `combat-preview`'s tap-intent branch requires a `defenderEntry` (a real
unit occupying the target hex, via `selectDefenderEntryAtKey`), which an undefended camp by
definition doesn't have — there's no "defender" object to plug into that path. Implemented instead:
a new, minimal `assault-camp`/`assault-camp-preview` intent pair (parallel to the existing
`assault-city`/`assault-preview`, not `combat-preview`), with a small inline preview panel in
`map-interaction-controller.ts` (title + one gold-reward info line + Attack/Cancel) — no capture/
raze choice, no strength comparison, since `destroyCamp` is a guaranteed flat-gold outcome. This is
still the minimal option once the earlier plan's assumption didn't hold, and still avoids a
dedicated `src/ui/` panel file.

**Files actually touched:**
- `src/systems/unit-system.ts` — `getBlockingMapEntityAt`/`getBlockingMapEntityKeys` extended with
  a `state.barbarianCamps` case (`'barbarian-camp'` reason), plus a `unit.owner !== 'barbarian'`
  exception so a barbarian-owned mover isn't blocked from its own camp.
  `UnitMovementBlockerCode`/`MovementBlockerReason`'s code unions and
  `BLOCKING_MAP_ENTITY_MESSAGES` gained the new reason — `validateUnitMove` and
  `getMovementBlockerReason` needed **zero further changes**, since both already route through
  the shared predicate/message map (the payoff of #843's Task 1 architecture decision).
- `src/input/selected-unit-tap-intent.ts` — new `assault-camp` intent kind and
  `canReachCampAssault` adjacency/strength/domain gate (mirrors `canReachCityAssault` but without
  `attack-targeting.ts`'s profile/target system, since camps aren't part of it).
- `src/input/map-tap-intent.ts` — new `assault-camp-preview` `MapTapIntent` kind.
- `src/app/controllers/map-interaction-controller.ts` — new switch case building the preview panel
  described above.
- `src/app/controllers/player-action-controller.ts` — new `beginPlayerCampAssault(attackerId,
  campId)`, mirroring `beginPlayerCityAssault`'s notification/quest-transition/advisor/diplomatic-
  reaction sequence (reusing `applyCampDestructionAtTarget`, already imported here for the
  post-combat case in `executeAttack`). Re-validates adjacency **and** re-checks for a garrisoning
  unit at the execution layer, not just via the tap-intent gate — a test written for the "already
  defended" case caught that the first draft trusted UI precedence alone and would have destroyed
  a garrisoned camp outright if called directly; see `.claude/rules` movement-validation precedent.
- `src/app/bootstrap.ts` — wires `beginPlayerCampAssault` through, same pattern as
  `beginPlayerCityAssault`.
- `src/ai/ai-tactics.ts` — **not** `basic-ai.ts` (that file is barbarian/pirate/minor-civ AI, not
  major-civ AI, and was never in scope here). `isForeignCityDestination` renamed to
  `isBlockedMoveDestination` and rebuilt on `getBlockingMapEntityAt` so it excludes camp
  coordinates from ordinary AI move candidates too, not just city ones (4 call sites updated to
  pass `unit` instead of `actorId`). New `rankCampAssault` (mirrors `rankCapture`) proposes an
  `assault-camp` action when a `plan.target.kind === 'camp'` and the AI unit is adjacent to an
  undefended one; new `assault-camp` variant on `AITacticalAction`, `actionId`, and
  `applyPredictedAction`.
- `src/ai/ai-major-turn.ts` — new `'assault-camp'` case in the real `executeAction` switch,
  reusing `applyCampDestructionAtTarget` and emitting the same `barbarian:camp-destroyed` event/
  quest-transition sequence its existing post-combat call site (`resolveAttackFollowUp`) already
  does for the defended case.

**Tests:** `tests/systems/unit-movement-system.test.ts`, `tests/systems/unit-system.test.ts`,
`tests/input/selected-unit-tap-intent.test.ts`, `tests/input/map-tap-intent.test.ts`,
`tests/app/controllers/player-action-controller.test.ts`,
`tests/app/controllers/map-interaction-controller.test.ts` (mock update only),
`tests/ai/ai-tactics.test.ts`, `tests/ai/ai-major-turn.test.ts`.

- [x] `validateUnitMove` rejects an ordinary move onto an undefended `state.barbarianCamps` tile
      with reason `'barbarian-camp'`, and does not path through one toward a tile beyond it —
      confirmed via the shared predicate, no camp-specific validation code needed.
- [x] `getBlockingMapEntityAt(state, unit, coord)` extended with the `state.barbarianCamps` case;
      reused unchanged by `validateUnitMove`, `getMovementRangeDetails`/`getMovementRange`'s BFS,
      and `getMovementBlockerReason` — no second, parallel blocking check was written.
- [x] Wired the `assault-camp`/`assault-camp-preview` tap-intent and the `beginPlayerCampAssault`
      executing action so tapping an adjacent undefended camp destroys it instead of moving onto
      it. `camp.banditLordName` is included in the notification when present
      (`"Kestrix the Cruel's camp destroyed! +35 gold"`), confirmed by a dedicated test.
- [x] Added the regression proving a unit 2+ hexes from an undefended camp does not have that tile
      in its movement range (`unit-movement-system.test.ts`'s `'does not path through an
      undefended barbarian camp toward a tile beyond it'`), and a companion adjacent-case
      regression at the tap-intent layer confirming the preview still opens correctly.
- [x] Added the hot-seat regression: two human civs, switch `state.currentPlayer`, confirm camp
      blocking is keyed off the acting unit's `owner` (`unit-system.test.ts`'s `'#845 hot-seat'`
      describe block, mirroring #843's city version).
- [x] Added the AI regression: an AI-controlled unit adjacent to an undefended camp with a
      `kind: 'camp'` plan destroys it via `processMajorCivStrategicTurn`, mirroring the existing
      defended-camp test in `ai-major-turn.test.ts` exactly (same events, same reward math), plus
      a focused `rankUnitTacticalActions` test in `ai-tactics.test.ts` proving the `assault-camp`
      candidate itself is offered.
- [x] Every new/changed assertion above was confirmed to actually fail without its corresponding
      source change (via `git stash` on the relevant source files, rerun, then restore) before
      being counted as passing — not just reasoned about. The occupancy defense-in-depth gap
      (previous bullet) was caught exactly this way, by a test, not by inspection.

## Finding 2: Galley/Trireme cannot attack any naval unit — a regression from the #826 fix

**Confirmed directly:** `getUnitAttackProfile('galley')` and `getUnitAttackProfile('trireme')`
both currently return `targetDomains: ['land']` — i.e. these naval combat units are only
"allowed" to attack land targets, and are blocked from attacking any naval unit (pirates
included) by `canAttackUnitDomain`.

**Root cause, precisely:** commit `1f8ac7fee2` ("fix: squash issues 823 through 827", 2026-08-14,
implementing the #826 "domain-aware unit targeting" task from
`docs/superpowers/plans/2026-08-14-issues-823-827-bug-squash.md`) changed
`src/systems/attack-targeting.ts`'s `DEFAULT_ATTACK_PROFILE` from:

```ts
const DEFAULT_ATTACK_PROFILE: UnitAttackProfile = { kind: 'melee', range: 1, targets: ['unit', 'city'] };
```

to:

```ts
const DEFAULT_ATTACK_PROFILE: UnitAttackProfile = {
  kind: 'melee', range: 1, targets: ['unit', 'city'], targetDomains: ['land'],
};
```

and added `canAttackUnitDomain`:

```ts
export function canAttackUnitDomain(attacker: Unit, target: Unit): boolean {
  const profile = getUnitAttackProfile(attacker.type);
  const attackerDomain = UNIT_DEFINITIONS[attacker.type].domain ?? 'land';
  const targetDomain = UNIT_DEFINITIONS[target.type].domain ?? 'land';
  const targetDomains = profile.targetDomains
    ?? (attackerDomain === 'land' && profile.kind === 'melee'
      ? ['land']
      : ['land', 'naval', 'air']);
  return targetDomains.includes(targetDomain);
}
```

The intent was clearly for the `profile.targetDomains ?? (attackerDomain === 'land' ... )`
fallback to compute the right default **per attacker domain** whenever a unit's own
`attackProfile` doesn't specify `targetDomains`. That fallback is correct in isolation. The bug
is that `getUnitAttackProfile` resolves ANY unit lacking its own `attackProfile` (via
`UNIT_DEFINITIONS[type].attackProfile ?? DEFAULT_ATTACK_PROFILE`) to the **same shared
`DEFAULT_ATTACK_PROFILE` object** — and that object now has `targetDomains: ['land']` baked in
directly. Because `profile.targetDomains` is therefore never `undefined` for these units, the
smart per-attacker-domain fallback in `canAttackUnitDomain` never runs for them; they just
inherit the blanket land-only restriction regardless of their own domain.

`galley`, `trireme` (both `domain: 'naval'`) have no explicit `attackProfile` in
`UNIT_DEFINITIONS` (`src/systems/unit-system.ts`), so both regressed silently the moment
`DEFAULT_ATTACK_PROFILE` gained `targetDomains: ['land']`. (Other naval entries without an
`attackProfile` — `transport`, `carrack`, `galleon`, `steamship`, `troop_transport`,
`naval_trader`, `steamship_trader`, `cargo_freighter` — are non-combat/zero-strength, so
`canAttackByProfileOnMap`'s `strength > 0` gate already excludes them; they aren't part of this
regression.) This also explains why the AI's pirate-hunting tests (`basic-ai-pirates.test.ts`)
still pass: `applyPirateAiResponse` resolves pirate combat through its own bespoke "canonical
destruction" path, not through `canUnitAttackTarget`/`getAttackTargets` — so the AI never hit
this bug, only the player's normal attack flow did.

## Inline review of Finding 2 (balance, fun, ages 7–43, play styles, difficulty/AI, architecture, extensibility, saves)

- **Severity:** this is a full early-game naval-combat blocker, not a cosmetic issue — every civ's
  Galley and Trireme (the only combat ships available before Frigate) currently cannot legally
  declare an attack against **any** naval unit, player or AI, pirate or not. Recommend landing
  Task 2 first and independently of Task 1/#843 — it's a two-line, high-confidence, low-risk
  revert of the regressive part of a two-day-old commit, with no dependency on the movement work.
- **Balance / fun:** naval-focused strategies and coastal conquest are currently unplayable in
  eras 1–2; this fix restores intended balance rather than changing it (the #826 fix's *intent* —
  stopping land units from attacking ships — is fully preserved; only the accidental naval
  self-block is removed).
- **Ages 7–43 / play styles:** "I built ships and they can't fight" is a hard stop for any
  naval-leaning player, young or experienced — there's no workaround available in-game, so this
  isn't a matter of discoverability like the movement bugs, it's a dead mechanic until fixed.
- **Difficulty modes / AI:** the pirate-hunting AI tests still pass because
  `applyPirateAiResponse` resolves pirate combat through its own bespoke path, bypassing
  `canUnitAttackTarget` entirely — so those tests prove nothing about regular AI-vs-AI or
  AI-vs-player naval combat between major civs, which almost certainly *does* go through the same
  broken `canUnitAttackTarget`/`getAttackTargets` path the player uses. That means this bug may
  currently be suppressing **all** early-game AI naval aggression against non-pirate targets,
  civ-wide, at every difficulty level — a much bigger behavioral change than "pirates only" once
  fixed. **Added an explicit task below** to verify AI-vs-AI and AI-vs-player Galley/Trireme
  combat before and after the fix, across at least two difficulty/aggression settings, so a
  reviewer can see exactly how much AI behavior changes rather than discovering it in playtesting.
- **Architecture / extensibility:** while auditing `UNIT_DEFINITIONS` for every unit lacking an
  explicit `attackProfile` (the same shape of gap that caused this regression), two more instances
  turned up that are **out of scope to fix here** but worth flagging rather than silently ignoring:
  - `observation_balloon` (air, `strength: 6`, no `attackProfile`) — its own description text says
    *"Cannot attack."* Today it's accidentally land-domain-restricted by this same bug; after the
    fix it would default to `['land','naval','air']` (attacker domain `air`, so the smart fallback
    doesn't hit the land-only branch), meaning it could newly attempt attacks against land/naval/
    air targets — inconsistent with its own "Cannot attack" description text. This looks like a
    `.claude/rules/content-description-honesty.md` question (does it have `strength: 6` by design
    for some other reason, e.g. combat-log flavor, or should it have `strength: 0`?) rather than
    something this attack-targeting fix should silently paper over. **Flagging for separate
    follow-up, not fixing here.**
  - `beast_sea_serpent` (naval, no `attackProfile`) — its description says "only ships and ranged
    units can fight it," implying *other* units attack *it*, not that it attacks with a
    profile-gated melee. Its missing `attackProfile` likely doesn't matter for this bug (beast
    attacks probably route through `beast-system.ts`'s own logic, not
    `canUnitAttackTarget`/`canAttackUnitDomain`), but that's unconfirmed. **Flagging for
    verification, not assuming it needs the same fix.**
- **Saves:** no schema change; `targetDomains` is static per-unit-type definition data, never
  per-save-instance state. **No save migration required.**

### Task 2 — Stop `DEFAULT_ATTACK_PROFILE` from overriding the per-domain fallback

**Files:**
- Modify: `src/systems/attack-targeting.ts`
- Test: `tests/systems/attack-targeting.test.ts`

- [x] Added failing tests: `canUnitAttackTarget`/`canAttackByProfileOnMap` allowing an adjacent
      Galley to attack an adjacent pirate galley (and a Trireme vs. an enemy Trireme); a positive
      control confirms a Warrior (land melee, default profile) still cannot attack a naval unit,
      proving the #826 fix for land units survives. Confirmed all 3 fail pre-fix, pass post-fix
      (verified via `git stash`-revert-and-rerun, not just reasoning).
- [x] Ran `bash scripts/run-with-mise.sh yarn vitest run tests/systems/attack-targeting.test.ts`
      before applying the fix; confirmed the new naval-attack assertions failed and the
      land-melee-vs-naval assertion still passed (isolating exactly the regressed case).
- [x] Removed the hardcoded `targetDomains: ['land']` from `DEFAULT_ATTACK_PROFILE`, restoring it
      to `{ kind: 'melee', range: 1, targets: ['unit', 'city'] }` (`targetDomains` now genuinely
      `undefined`), so `canAttackUnitDomain`'s existing per-attacker-domain fallback runs and
      computes the correct default instead of a single blanket value. Pure revert of the
      regressive part — `canAttackUnitDomain`'s own logic needed no change.
- [x] Re-ran the focused suite plus `tests/ai/ai-tactics.test.ts` — #826's land-vs-naval
      restriction holds (existing `'rejects land melee attacks against naval units...'` test still
      passes unchanged, since Warrior/Spearman's `attackerDomain === 'land'` still hits the
      fallback's `['land']` branch). One pre-existing test's literal expected-shape assertion
      (`'gives warriors the default melee profile...'`) needed updating to drop `targetDomains`
      from the expected object — documented inline why.
- [x] Grepped `DEFAULT_ATTACK_PROFILE` — the only two references are its declaration and
      `getUnitAttackProfile`'s fallback, both in `attack-targeting.ts`; no other caller assumes
      the old shape.
- [x] Added the AI-behavior regression: two tests in `ai-tactics.test.ts` (one per opponent
      challenge tier, `'veteran'` and `'standard'`) proving an AI Galley/Trireme now proposes an
      `attack` action against an adjacent hostile *civ* ship (not a pirate — the pirate-hunting
      path never hit this bug, per the root-cause writeup above). Confirmed both fail pre-fix,
      pass post-fix via the same revert-and-rerun method. Full suite: 487/487 files, 8022/8025
      tests passing (3 pre-existing skips) after this fix, zero regressions.

### Task 3 — Cross-cutting verification

**Sequencing note:** Task 2 (naval domain) has no dependency on Task 1 (camps) or on the #843
plan — land and verify it independently and first, per the severity note above.

- [x] Ran `scripts/check-src-rule-violations.sh` against every changed `src/` path (all 13 files
      touched across both findings) — clean.
- [x] Ran the full suite: `bash scripts/run-with-mise.sh yarn test` — 487/487 test files,
      8039/8042 tests passing (3 pre-existing skips), zero regressions, after both findings.
- [x] Ran `bash scripts/run-with-mise.sh yarn build` — clean, no type errors.
- [x] Confirmed no save-schema change is needed for either finding (checked in each inline review
      above) — no `save-migrations.ts` entry added.
- [ ] **Manual browser verification: same limitation as #843's plan** — attempted (dev server
      running, solo game started), but the app exposes no debug hook or save-injection path
      (IndexedDB `saves` store and `localStorage` both empty for an in-progress unsaved session),
      so hand-engineering an exact "undefended camp/enemy ship adjacent to a war unit" scenario
      isn't feasible without unbounded manual play. Logged as a known gap, not a false completion
      claim — the automated coverage for both findings includes verified reproduction-and-fix
      cycles (every new assertion confirmed to fail pre-fix via `git stash`-revert-and-rerun, not
      just reasoned about) across solo and hot-seat configurations, and across the player and AI
      execution paths.

## Final review pass (before PR)

Re-reviewed the *actual implementation* across the same dimensions as the #843 plan's final
review section. Two real findings, both fixed:

- **Naval fix side effect (content-honesty regression):** `observation_balloon` (air domain,
  `strength: 6`, no explicit `attackProfile`) was flagged in this plan's own inline review as
  "worth verifying, not fixing here." Verification during this pass confirmed it as a real,
  measurable regression: pre-fix it was accidentally land-domain-restricted by the same bug that
  broke Galley/Trireme; post-fix, an air-domain attacker with no profile of its own falls back to
  the fully permissive `['land','naval','air']` set, so it would have newly been able to declare
  attacks — directly contradicting its own `UNIT_DESCRIPTIONS` text, "Cannot attack." Confirmed
  with `canAttackByProfileOnMap(balloon, target) === true` pre-fix. Fixed with an explicit
  `attackProfile: { kind: 'melee', range: 1, targets: [] }` (leaves `strength: 6` untouched, since
  that stat is used defensively when the balloon itself is attacked). Added a regression test in
  `attack-targeting.test.ts`, confirmed to fail without the fix.
  - Also checked `beast_sea_serpent` (the other unit this plan flagged as "unconfirmed"): beast
    attacks resolve through `beast-system.ts`'s own turn-processing path
    (`turn-manager.ts`'s `beastResult.attackOrders` → `resolveCombat` directly), never through
    `canAttackByProfileOnMap`/`canUnitAttackTarget` — confirmed via search, not just inferred.
    Player-vs-beast combat only checks the *player's own* attacker profile, not the beast's. No
    fix needed; this was correctly left unconfirmed rather than fixed speculatively.
- **Testing gap:** `chooseAutoExploreMove`'s regression coverage only exercised the undefended-
  *city* case (inherited from the #843 plan's Task 4), even though an undefended *camp* is the
  more common real-world case for a wandering scout (camps sit on open land far more often than
  an enemy city is encountered mid-explore). Added
  `'does not nominate an undefended barbarian camp as its own auto-explore destination'` to
  `auto-explore-system.test.ts`.

Everything else checked out on direct inspection against established codebase conventions:
hot-seat `currentPlayer`/`attacker.owner` usage matches `executeAttack`'s existing pattern exactly
(not a new bug); `SFX.combat()` on camp assault matches the existing "assault action resolved"
convention used for city assault too, regardless of whether real combat occurred; the camp
preview panel's buttons match the file's own established (if not `createGameButton`-based)
styling convention — `map-interaction-controller.ts` is outside `ui-panels.md`'s hook-enforced
path scope (`src/ui/**`, `src/renderer/**`, `src/main.ts`), and introducing 44px-touch-target
buttons inconsistent with every *other* preview panel in the same file would be a worse,
unrelated redesign, not a fix; `beginPlayerCampAssault`'s silent no-op on a missing
attacker/camp matches `beginPlayerCityAssault`'s identical existing behavior. One tempting change
was deliberately **not** made: giving land units a red "attack" highlight for an adjacent
undefended city/camp (instead of the current blue "move" highlight) — an existing test
(`'highlights a visible hostile city for a naval bombardment, but not for a land unit'`)
encodes that land-unit city/camp assault deliberately routes through a separate preview flow
with different highlight semantics than direct combat; reversing that is a real design decision,
not a bug, and doing so here would contradict an existing intentional regression test.
