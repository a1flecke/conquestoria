# MR6 — Trade Route Discoverability (#553, UX tier) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A player who researches Trade Routes is told what to do next; active routes are visible in the treasury drawer with gold and trips; and a caravan that cannot establish a route says why. No new units (that is MR7).

**Architecture:** Three additive UI changes riding existing systems: an advisor trigger, a treasury-drawer section reading `state.marketplace.tradeRoutes`, and reason-surfacing on the existing establish-route flow.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`; green build+test before push.
- All UI self-explanatory; buttons via `createGameButton()`; `textContent` for dynamic strings; 44px touch targets.
- Advisors use `state.currentPlayer` (hot-seat rule).
- Content honesty: do not name units that don't exist (see Task 3's message fix).

## Background for the implementer (zero-context)

- Discovery chain today: research `trade-routes` (era 4, `src/systems/tech-definitions-eras1-4.ts:21`) → train `caravan` (`src/systems/city-system.ts:1141`) → select it → "Establish Route" in the selected-unit panel (`src/ui/selected-unit-info.ts:73`, wired at `src/main.ts:2021` → `openEstablishRoutePanel`). Nothing announces any step.
- Routes live in `state.marketplace.tradeRoutes`; the only viewing surface is the marketplace panel (`src/ui/marketplace-panel.ts:217`). Routes have `fromCityId`, `toCityId`, `tripsRemaining` (8 + inn bonus, `src/systems/trade-system.ts:319`), and gold fields — read `src/systems/trade-system.ts` route creation (~line 289+) for exact field names before rendering.
- `canEstablishRoute` (`trade-system.ts:240`) returns `{ ok, reason }` — reasons exist but the establish-route panel only shows eligible cities; a caravan with zero eligible destinations gives no feedback.
- Advisor pattern: `src/ui/advisor-system.ts` — `AdvisorMessage` entries with a `trigger(state)` predicate; follow the existing entries (lines ~40-165). Advisors fire via `bus.emit('advisor:message', …)` toasts.
- Honesty bug to fix in passing: `trade-system.ts:259` reason says `'Requires a Naval Trader to cross water'` — **no such unit exists** (MR7 adds naval trade). Until then the message must not name a phantom unit.

---

### Task 1: Treasurer advisor teaches the chain

**Files:**
- Modify: `src/ui/advisor-system.ts` (two new entries)
- Test: `tests/ui/advisor-system.test.ts` (extend, following its existing trigger-predicate test idiom)

- [ ] **Step 1: Failing tests**

```ts
  it('prompts to train a caravan once trade-routes completes and none exists', () => {
    // fixture: currentPlayer has 'trade-routes' completed, no caravan units, no routes
    expect(triggerFor('train-first-caravan')(state)).toBe(true);
  });
  it('does not prompt before the tech or once a caravan exists', () => {
    expect(triggerFor('train-first-caravan')(stateWithoutTech)).toBe(false);
    expect(triggerFor('train-first-caravan')(stateWithCaravan)).toBe(false);
  });
  it('prompts to send an idle caravan', () => {
    // fixture: caravan exists, not committedToRouteId, player has ≥2 cities or a known friendly city
    expect(triggerFor('send-idle-caravan')(state)).toBe(true);
  });
```

(Adapt to the file's real advisor-entry lookup; if entries have no ids, add an
`id` field or export the array for tests — smallest change wins.)

- [ ] **Step 2: Implement** two treasurer entries (match the existing message idiom):

```ts
  {
    advisor: 'treasurer',
    id: 'train-first-caravan',
    message: 'Trade Routes researched! Train a Caravan in a city, then select it and choose Establish Route to earn gold each turn.',
    trigger: (state) => {
      const civ = state.civilizations[state.currentPlayer];
      if (!civ?.techState.completed.includes('trade-routes')) return false;
      const hasCaravan = Object.values(state.units).some(u => u.owner === state.currentPlayer && u.type === 'caravan');
      const hasRoute = (state.marketplace?.tradeRoutes ?? []).some(r => routeOwnedBy(state, r, state.currentPlayer));
      return !hasCaravan && !hasRoute;
    },
  },
  {
    advisor: 'treasurer',
    id: 'send-idle-caravan',
    message: 'You have an idle Caravan. Select it and tap Establish Route to start earning gold.',
    trigger: (state) => Object.values(state.units).some(u =>
      u.owner === state.currentPlayer && u.type === 'caravan' && !u.committedToRouteId),
  },
```

(`routeOwnedBy`: from-city owner check — write the tiny helper locally or
inline. Check how existing advisor entries deduplicate/once-only fire — follow
that mechanism so these don't nag every turn; if advisors are fire-once by id,
you're done; if not, gate `send-idle-caravan` on `state.turn % 10 === 0` like
any existing throttled entry — copy the file's own throttle idiom.)

- [ ] **Step 3:** Suite; commit: `feat(advisor): treasurer teaches the trade-route chain (#553)`

### Task 2: Routes in the treasury drawer

**Files:**
- Modify: `src/ui/treasury-drawer.ts` (read the file fully first — its render structure was not surveyed during planning; follow its existing section idiom)
- Test: `tests/ui/treasury-drawer.test.ts` (extend or create per existing UI-test idiom)

**Player truth table:**

| Before | Action | Immediate visible result |
|---|---|---|
| No routes | Open treasury drawer | "Trade Routes" section: "No active routes. Research Trade Routes, train a Caravan, and use Establish Route." (only the not-yet-done steps listed — see below) |
| 2 active routes | Open drawer | Two rows: "Riverton → Hillfort · +4🪙/turn · 6 trips left" |
| Route ends next turn | Reopen drawer | Row gone; empty state returns if none remain |

**Misleading-UI risk:** the empty-state instruction must not tell the player to
research a tech they already have. Build the instruction from the first
not-yet-satisfied step: no tech → "Research Trade Routes."; tech but no caravan
→ "Train a Caravan in a city."; caravan idle → "Select your Caravan and tap
Establish Route." Test all three variants.

- [ ] **Step 1: Failing tests** for the three empty-state variants + the
  populated-row rendering (assert city names, gold/turn, trips via `textContent`).
- [ ] **Step 2: Implement** — filter `state.marketplace?.tradeRoutes ?? []` to
  routes whose from-city owner is `state.currentPlayer`; resolve city names via
  `state.cities`; render rows with the drawer's existing row styling. Use the
  exact per-route gold field found in trade-system.ts (verify name; do not
  guess).
- [ ] **Step 3:** Suite; commit: `feat(treasury): visible trade-route roster with guided empty state (#553)`

### Task 3: Caravan panel says why routes are unavailable

**Files:**
- Modify: `src/ui/establish-route-panel.ts` (empty/ineligible list feedback), `src/ui/selected-unit-info.ts` (keep the Establish Route button always visible for caravans; never hide-without-explanation)
- Modify: `src/systems/trade-system.ts:259` — reason text `'Requires a Naval Trader to cross water'` → `'No land path to this city'` (MR7 will restore a naval mention when naval traders exist; leave the code comment `// MR7 (#553) reintroduces naval trade — update this reason then.`)
- Test: `tests/ui/establish-route-panel.test.ts` + the trade-system test asserting the reason string (grep `Naval Trader` in tests and update)

- [ ] **Step 1: Failing test** — panel with a caravan whose every known city
  fails `canEstablishRoute` renders each city row disabled with its `reason`
  text, and renders a heading line `No destinations available right now.`;
  panel with zero known other cities renders `Found or discover another city
  to trade with.`
- [ ] **Step 2: Implement** — `openEstablishRoutePanel` already calls
  `canEstablishRoute` per city (line ~50); render `check.reason` under
  ineligible rows via `textContent` instead of filtering the city out (keep
  eligible-first ordering). Update the reason string in trade-system.ts.
- [ ] **Step 3:** Suite + build; commit:
  `feat(trade): establish-route panel explains ineligible destinations (#553)`

### Task 4: Manual verification

- [ ] Dev server, solo: research trade-routes → treasurer toast appears; train
  caravan → idle-caravan toast; establish route → treasury drawer shows it
  with correct gold/trips; break relations/declare war → reopen establish
  panel and see the at-war reason on that city.
- [ ] Hot seat sanity: advisor messages appear only for the active player.
- [ ] Full suite + build; commit any fixes.

---

## Inline Dimension Review

- **Gameplay balance:** Zero mechanics change — visibility only. Route capacity, gold, and trips untouched.
- **Fun:** Trade routes are the economy's most tangible "number goes up" loop; making the chain teachable converts a dead feature into a visible income stream players chase.
- **New mechanics:** None (deliberate — MR7 carries the content).
- **Ages 7–43:** Advisor messages are step-by-step imperatives a child can follow; the guided empty state adapts to what's already done so it never patronizes the adult who knows the chain.
- **Play styles:** Builders/economists gain the most; warmongers see at-war reasons on destinations, making the diplomacy-trade link legible.
- **Difficulty modes:** Not challenge-coupled; guidance parity across modes.
- **AI usage:** AI already uses caravans via its `trade` role (`src/ai/ai-unit-roles.ts:7`) — unchanged; the human simply catches up to what the AI could already do.
- **UI:** Three existing surfaces extended in their own idioms (advisor entry, drawer section, panel rows); no new panel; disabled rows show reasons instead of vanishing (no silent filtering).
- **UX:** Each #553 complaint has a surface: "how to start" → advisor + guided empty state; "how to see" → treasury drawer; the panel's reason rows close the "why can't I" gap. Every step names the next control to touch.
- **Architecture:** Reads existing state only; the one shared eligibility helper (`canEstablishRoute`) stays the single source of reasons — UI renders, never re-derives.
- **Extensibility:** MR7's naval/air units inherit the drawer roster and reason rows for free; the guided empty state's step list is the place MR7 adds "or a Merchant Ship for sea routes."
- **Data:** No schema change; no migration.
- **SFX:** None new; route-established SFX (if any) unchanged — check `grep -rn "route" src/audio/sfx-catalog.ts` and note in PR.
- **Saved games:** Pure render-time derivation; old saves show their existing routes immediately.
- **Testing:** Trigger predicate positive/negative pairs, three empty-state variants (the misleading-UI risk), populated roster rows, ineligible-reason rows, phantom-unit message fix pinned by test.
- **Solo regressions:** Establish flow's happy path untouched (panel still lists eligible cities first); existing establish-route tests re-run.
- **Hot-seat regressions:** Advisor triggers and drawer filtering are `currentPlayer`-scoped (tested); no cross-player route visibility added.
- **Implementation correctness:** The only behavior change in system code is one string; everything else is additive UI with the reason source unchanged — reviewable surface is small and enumerated.
