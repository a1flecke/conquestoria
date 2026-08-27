# #545 MR6 — Arms Control Treaty: Implementation Design

This is an MR-scoped implementation design, not a new feature spec. It translates the
arc-level design spec's §12 (`docs/superpowers/specs/2026-08-25-issue-545-strategic-deterrence-design.md`,
lines 422-447) into concrete module/function/data shapes for MR6, re-verifying every
current-code claim directly rather than trusting the spec's own "audited 2026-08-25"
header (main has moved twice since then — MR4 and MR5 both merged after that date).

## Locked decision

**Cap selection**: the arms-control cap is auto-computed at signing time — no new
numeric-input UI. Confirmed with the user over the "player picks a number" and "fixed
preset choices" alternatives; picked specifically to keep this a flat one-click action
exactly like every other treaty type, matching the arc spec's own "v1 ships exactly one
arms-control mechanic" framing.

## Design review — issues found and fixed

An inline review across gameplay/balance, ages 7-43, play styles, difficulty modes, AI,
UI/UX, architecture, extensibility, data, SFX, saves, testing, and solo/hot-seat
regressions ran on the first draft of this design (presented in chat, not yet written
down). Findings, folded directly into the sections below:

1. **A cap of exactly 0 is a real gameplay trap, and it's not rare.** The first draft's
   `cap = max(civA.strategicArsenal, civB.strategicArsenal)` can legitimately be 0 — a
   civ only needs `hasManhattanProject` (capability *known*, not arsenal *built*) to
   pass the AI's proposing gate, so two civs that both completed Manhattan Project but
   haven't produced a single warhead yet would sign a pact that permanently bans either
   of them from ever building one, without first eating a -30 reputation hit to
   withdraw. Fixed: floor the cap at 1 — `max(civA, civB, 1)`.
2. **That same fix resolves a cross-MR interaction with MR5.** The Veteran
   existential-threat first-use gate (`ai-strategic-doctrine.ts`) requires
   `strategicArsenal >= 1` to have any legal target at all. A 0-cap pact would leave a
   Veteran AI with literally no possible response even at the moment its own capital is
   about to fall — the floor-of-1 fix means that scenario is now merely *constrained*,
   not impossible.
3. **A whole execution path was missing from the first draft: nothing would have
   actually signed the treaty when the AI proposes it.** `evaluateDiplomacy` computing
   a `{ action: 'arms_control_pact', targetCiv }` decision is not the same as that
   decision being *executed* — `basic-ai.ts`'s decision-execution switch has no case
   for it, and TypeScript's switch-without-default doesn't error on a missing case, so
   this would have been a silent "no dead computed data" violation, not a compile
   error. Same gap found in `acceptDiplomaticRequest` (a third, previously-unaccounted
   signing call site — reached when a *human* accepts an *AI-initiated* pending
   proposal) and in `TREATY_LABELS: Record<TreatyType, string>`
   (`notification-routing.ts`) — this one **does** fail to compile once
   `arms_control_pact` is added to `TreatyType` without a matching entry, which is at
   least a fast, loud failure rather than a silent one. All three call sites are now
   explicit tasks below (§ Architecture).
4. **Documented, not fixed — confirmed intentional, matching existing precedent.** Two
   things that looked like omissions on first read turned out to already match how
   every peer treaty type behaves: (a) `strategicArsenal` is empire-wide, so a pact
   signed with one civ constrains capability against every other civ too (including an
   unrelated war) — this is the spec's actual intent (§12's own wording: "a signatory's
   `strategicArsenal` exceeds its own agreed cap"), not new behavior MR6 introduces; (b)
   the AI's proposing threshold has no `OPPONENT_CHALLENGE_PROFILES` difficulty knob —
   confirmed `non_aggression_pact`/`trade_agreement`/`alliance` don't have one either
   (personality/relationship-only, no per-difficulty scaling anywhere in that decision
   path today), so omitting one here is consistency, not a gap.
5. **Confirmed no new SFX needed.** No treaty sign or break anywhere in the codebase has
   dedicated SFX today — adding one only for this treaty type would be arbitrary.
6. **Confirmed the existing "Break" button already satisfies "no silent destructive
   UI" with zero new code.** It already has a two-click in-panel confirm
   (`diplomacy-panel.ts`, `armed`/3-second-disarm-timer pattern, `#554`) generic across
   every `TreatyType` — `arms_control_pact` inherits it automatically once it's a real
   treaty in state.
7. **Confirmed pacifist-safety is structural, matching MR5's own precedent.** A human
   who never builds Manhattan Project never gets an AI-initiated arms-control proposal
   at all — the AI's own proposing gate requires `hasKnownStrategicCapability(actor,
   target)`, which is false for a civ with no capability. No separate protection code
   needed; worth a named regression test to keep it that way.
8. **`arsenalCap` stays optional from the start.** MR4 made `strategicStrikesReceivedFrom`
   required and broke ~15 pre-existing test fixtures, later fixed to optional. Applying
   that lesson here directly: `Treaty.arsenalCap?: number` is optional from the first
   commit — old saves have no `arms_control_pact` treaties to migrate (the type didn't
   exist before), and no other treaty type ever sets this field, so no migration is
   needed either way.

## §12 (verbatim from arc spec, re-verified)

> New treaty concept, `arms_control_pact`, carrying an optional `arsenalCap: number`
> field... Available to propose once the proposing civ has completed the Arms Control
> Treaty national project. Both signatories agree to a mutual cap; if a signatory's
> `strategicArsenal` exceeds its own agreed cap (checked at production-completion time —
> you cannot complete a Build Warhead item that would push you over an active cap),
> production of that item is blocked while the pact holds, exactly like any other
> prerequisite-gated production item — no separate enforcement pass needed. Breaking the
> pact... fires the same witness/reputation pipeline as any other treaty violation,
> using the existing treaty-break severity precedent already in `diplomacy-system.ts`
> (`breakTreaty`'s existing -30 relationship delta).
>
> **AI acceptance**: extends `ai-diplomacy.ts`'s existing relationship-threshold +
> `personality.diplomacyFocus` pattern... `arms_control_pact` adds one more condition on
> top of a similar relationship/diplomacy-focus bar: the AI only proposes or accepts a
> cap when it can see (§9's visibility rule) that **both** sides have known nuclear
> capability.

**Re-verified against live code, with one correction to the spec's own framing**:
`evaluateProposal` (the function §12's "AI acceptance" language implies is being
extended) has **zero callers anywhere in `src/`** — dead code (filed as
[a1flecke/conquestoria#901](https://github.com/a1flecke/conquestoria/issues/901), out
of scope for this MR). Every human-initiated treaty proposal signs immediately for both
sides via `applyDiplomaticAction`, with no AI "acceptance" evaluation in that direction
at all. So "AI acceptance" in practice means only one thing in this codebase: the AI's
own decision to *propose* the pact (extending `evaluateDiplomacy`, which already has the
`non_aggression_pact` relationship+diplomacyFocus pattern §12 describes) — never an
accept/decline step, since that mechanism doesn't exist for any treaty type today.
`breakTreaty`'s -30 delta confirmed present and unchanged
(`src/systems/diplomacy-system.ts:214-231`).

## Architecture

### 1. Data model

`TreatyType` (`src/core/types.ts`) gains `'arms_control_pact'`. `Treaty` gains
`arsenalCap?: number`.

### 2. Cap computation (shared, used by all three signing call sites below)

New export in `src/systems/diplomacy-system.ts`:

```ts
// #545 MR6 spec §12: both signatories are capped at the higher of their two current
// arsenals, floored at 1 -- never 0. A floor of exactly 0 (legitimately reachable when
// both civs have Manhattan Project but haven't built a warhead yet) would permanently
// ban either signatory from ever building one without first breaking the pact, and
// would leave a Veteran AI with zero possible existential-threat response
// (ai-strategic-doctrine.ts's gate requires strategicArsenal >= 1). See design review
// finding #1/#2.
export function computeArmsControlCap(state: GameState, civAId: string, civBId: string): number {
  const civA = state.civilizations[civAId];
  const civB = state.civilizations[civBId];
  return Math.max(
    civA ? getStrategicArsenal(civA) : 0,
    civB ? getStrategicArsenal(civB) : 0,
    1,
  );
}
```

### 3. `signTreaty` extension

`signTreaty` already has a type-specific-extra-field precedent (`if (type ===
'trade_agreement') treaty.goldPerTurn = 2;`) — but that's a fixed constant computable
from nothing external, whereas the cap needs full `GameState` `signTreaty` doesn't
receive. Extend with one new optional trailing parameter, computed by the caller (which
has `GameState`) and threaded straight through:

```ts
export function signTreaty(
  state: DiplomacyState,
  selfId: string,
  otherCivId: string,
  type: TreatyType,
  turnsRemaining: number,
  turn: number,
  arsenalCap?: number,
): DiplomacyState {
  const treaty: Treaty = { type, civA: selfId, civB: otherCivId, turnsRemaining };
  if (type === 'trade_agreement') treaty.goldPerTurn = 2;
  if (type === 'arms_control_pact' && arsenalCap !== undefined) treaty.arsenalCap = arsenalCap;
  // ...unchanged below
}
```

`turnsRemaining` is `-1` (permanent until broken) for `arms_control_pact`, matching
`alliance`'s existing convention — the spec gives it no natural expiry.

### 4. Three signing call sites (all three needed — this is finding #3 above)

- **`applyDiplomaticAction`** (`diplomacy-system.ts`) — human-initiated, immediate
  bilateral sign. New dedicated `case 'arms_control_pact':` (not folded into the
  existing `non_aggression_pact | trade_agreement | open_borders | alliance` combined
  case, since only this type needs the extra cap computation): compute
  `computeArmsControlCap(state, actorId, targetCivId)`, call `signTreaty` for both
  sides with it, emit `diplomacy:treaty-accepted` (existing event, reused verbatim).
- **`basic-ai.ts`'s decision-execution switch** — new `case 'arms_control_pact':`,
  same `isHuman` branch already used for `alliance`/`trade_agreement`/`open_borders`:
  target human → `enqueueTreatyProposal` (no cap computed yet — see next bullet); target
  AI → compute the cap and sign both sides immediately, mirroring the existing AI↔AI
  pattern exactly.
- **`acceptDiplomaticRequest`** — reached when a human accepts an AI's *pending*
  proposal. When `request.treatyType === 'arms_control_pact'`, compute
  `computeArmsControlCap(state, request.fromCivId, request.toCivId)` (using the
  *current*, accept-time arsenal counts — not whatever they were when the AI first
  proposed, since turns may have passed) and pass it into both `signTreaty` calls.

### 5. `getAvailableActions` gate

New trailing parameter, `hasArmsControlTreaty: boolean` — whether the civ whose
diplomacy/techs are already being passed (the acting/viewing civ) has completed the
Arms Control Treaty national project. New helper for the check itself:

```ts
// src/systems/diplomacy-system.ts, alongside getAvailableActions
export function hasArmsControlTreaty(state: GameState, civId: string): boolean {
  return state.builtNationalProjects?.[`${civId}:arms_control_treaty`] !== undefined;
}
```

Inside `getAvailableActions`, alongside the existing era/tech-gated pushes:

```ts
if (hasArmsControlTreaty) {
  actions.push('arms_control_pact');
}
```

No relationship/era/tech gate here — per spec, this action's only human-facing gate is
NP completion; the capability-visibility condition below is AI-decision-only (spec's own
"AI acceptance" framing, not a UI-availability rule — a human should be free to propose
even pre-emptively).

**Three call sites need the new argument**: `diplomacy-panel.ts` (pass
`hasArmsControlTreaty(state, state.currentPlayer)`), `ai-diplomacy.ts`'s
`evaluateDiplomacy` (receives it as its own new parameter, passed through from
`basic-ai.ts`), and `basic-ai.ts`'s own direct call
(`getAvailableActions(civ.diplomacy, plannedWarTarget, ...)` — that one gates
`declare_war` only and doesn't need the new arg, confirm this at plan-writing time by
re-reading the exact call).

### 6. `evaluateDiplomacy` new branch

A **new, independent `if`** — not inserted into the existing
`alliance`/`trade_agreement`/`non_aggression_pact` `else-if` chain, since a civ can
reasonably want both an alliance and an arms-control pact with the same target
simultaneously (thematically orthogonal, not competing treaty slots):

```ts
if (
  actions.includes('arms_control_pact')
  && relationship > 0 && personality.diplomacyFocus > 0.4  // same bar as non_aggression_pact, per spec's own "similar...bar" framing
  && actorHasKnownCapability  // hasManhattanProject(state, civId) -- self-evident, no visibility gate
  && context.targetHasKnownStrategicCapability  // MR5's existing predicate/field, reused verbatim
) {
  decisions.push({ action: 'arms_control_pact', targetCiv: civId });
}
```

`evaluateDiplomacy` gains one new parameter, `actorHasKnownCapability: boolean`,
computed once by `basic-ai.ts` (`hasManhattanProject(newState, civId)`) rather than
per-target-civ (it's the same value for every entry in the loop, unlike
`targetHasKnownStrategicCapability` which is genuinely per-target).

### 7. Enforcement — consolidate 4 duplicated inline computations into 1 shared helper

New exports in `src/systems/strategic-arsenal-system.ts`:

```ts
// Most-restrictive (minimum) cap across every active arms_control_pact this civ is a
// party to -- a civ can sign multiple pacts with different partners at different caps;
// each is independently binding, so the tightest one governs.
export function getActiveArmsControlCap(state: GameState, civId: string): number | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const caps = civ.diplomacy.treaties
    .filter(t => t.type === 'arms_control_pact' && (t.civA === civId || t.civB === civId))
    .map(t => t.arsenalCap)
    .filter((cap): cap is number => cap !== undefined);
  return caps.length > 0 ? Math.min(...caps) : null;
}

export function getArsenalStatus(state: GameState, civId: string): { hasManhattanProject: boolean; atCapacity: boolean } {
  const civ = state.civilizations[civId];
  const current = civ ? getStrategicArsenal(civ) : 0;
  const physicalCap = getStrategicArsenalCapacity(state, civId);
  const treatyCap = getActiveArmsControlCap(state, civId);
  const effectiveCap = treatyCap !== null ? Math.min(physicalCap, treatyCap) : physicalCap;
  return {
    hasManhattanProject: hasManhattanProject(state, civId),
    atCapacity: current >= effectiveCap,
  };
}
```

All 4 existing inline `{ hasManhattanProject: ..., atCapacity: ... }` computations
(`city-panel.ts:277`-adjacent, `ai-production.ts:586`, `planning-system.ts:139` and
`:193`) are replaced with a call to `getArsenalStatus`. This is the entire enforcement
mechanism — `getAvailableBuildings`'s existing `arsenalCapacityGated` check already
excludes `warhead` once `atCapacity` is true; no new gating logic needed there.

### 8. UI surfacing

- **Diplomacy panel treaty label**: the existing generic `row.treaties` mapping
  (`t.type.replace(/_/g, ' ')`) gets a small, targeted addition — when
  `t.type === 'arms_control_pact'`, append the cap: `` `Arms Control Pact (cap: ${t.arsenalCap})` ``.
- **`TREATY_LABELS`** (`notification-routing.ts`) gains `arms_control_pact: 'Arms
  Control Pact'` — required for `Record<TreatyType, string>` to compile once the type
  grows; feeds `routeTreatyProposed`'s "X proposes a {label}" notification for the
  AI→human pending-proposal case.
- **Strategic Arsenal panel** (`strategic-arsenal-summary-presentation.ts`): gains
  `activeArmsControlCap: number | null` via `getActiveArmsControlCap`.
- **City panel** `arsenalStatusLine`: change `capacity` in "Arsenal: X/Y" from
  `getStrategicArsenalCapacity` alone to the *effective* (min of physical and treaty)
  cap, so the displayed number never contradicts why production is blocked. When a
  treaty cap is the binding constraint (stricter than physical capacity), add a short
  second line naming it, so a player isn't left guessing why they're "not at capacity"
  by the physical number yet can't build.

## Non-goals for MR6

- No accept/decline evaluation for incoming proposals (tracked in
  [#901](https://github.com/a1flecke/conquestoria/issues/901), pre-existing gap, not
  MR6's to fix).
- No AI decision to withdraw from an existing pact.
- No difficulty-tier scaling on the AI's proposing threshold (matches every peer treaty
  type's existing behavior).
- No cap-awareness added to the strategic launch preview flow — launching spends a
  warhead, it never increases arsenal, so there's nothing a launch could violate; the
  arc spec's §14 line implying otherwise is treated as imprecise phrasing, not a
  requirement (per `.claude/rules/spec-fidelity.md`'s "specs can be stale" guidance).
- No new SFX (matches every other treaty type having none).
- No new "break" confirmation UI (the existing generic two-click confirm already covers
  it).
- MR7's `superweapons` off-mode gating is out of scope; `getArsenalStatus` being a
  single new chokepoint is a deliberate forward-compatible choice for that MR, not
  something MR6 needs to wire up itself.

## Testing approach

- `computeArmsControlCap`: floors at 1 even when both arsenals are 0; returns the higher
  arsenal when one side is already armed; symmetric regardless of argument order.
- `signTreaty`: `arsenalCap` is set only for `arms_control_pact`, absent/ignored for
  every other type (regression — a stray cap value passed for e.g. `alliance` must not
  leak onto the treaty).
- All three signing call sites: human-initiated (`applyDiplomaticAction`), AI↔AI
  immediate sign, AI→human via `acceptDiplomaticRequest` — each produces a treaty with
  the correct computed cap on both sides.
- `getAvailableActions`: `arms_control_pact` appears iff `hasArmsControlTreaty` is true;
  absent otherwise, regardless of relationship/era/tech (no other gate).
- `evaluateDiplomacy`: known-capability-both-sides + relationship/diplomacyFocus bar all
  required — negative tests for each condition alone (matching
  `.claude/rules/spec-fidelity.md`'s conjunction-testing requirement); confirms it can
  coexist with an `alliance` decision in the same call (not mutually exclusive).
  **Pacifist-safety invariant** (finding #7): a civ with no Manhattan Project is never
  the target of an AI-proposed arms-control pact, regardless of relationship/personality.
- `getArsenalStatus`/`getActiveArmsControlCap`: multiple active pacts at different caps
  → the minimum governs; no active pact → falls back to physical capacity only; `warhead`
  excluded from `getAvailableBuildings`'s output once treaty-capped even when physical
  capacity has room remaining.
- UI: diplomacy panel shows the cap number in the treaty label; Strategic Arsenal panel
  surfaces the active cap; city panel's arsenal line reflects the effective (not just
  physical) cap and explains a treaty-driven block distinctly from a capacity-driven one.
- Full-suite regression: `TREATY_LABELS` compiles (TypeScript itself enforces this);
  `national-project-balance.test.ts` unaffected (Arms Control Treaty NP's existing
  `civYieldBonus: { gold: 5 }` is untouched); `pacing-audit.test.ts` unaffected (no yield
  change).
