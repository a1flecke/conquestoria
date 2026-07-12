# MR5 — Wonder Blocked-State Actionability (#555) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task inline (this repo forbids subagents — see CLAUDE.md Agent Policy). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A "Blocked" wonder always tells the player exactly what to do next; build requirements are visible *while questing* so quest completion never dead-ends; and a generic test guarantees no wonder can require a resource that cannot exist at its own era.

**Architecture:** Upgrade `getMissingRequirements` (`src/systems/legendary-wonder-presentation.ts:142`) from `string[]` to structured entries with per-kind guidance text, render the guidance in the wonder panel for `blocked` and `questing` states, and widen the era-gating test net in `tests/systems/legendary-wonder-definitions.test.ts` to cover `requiredResources`.

**Tech Stack:** TypeScript, vitest.

## Global Constraints

- All commands via `bash scripts/run-with-mise.sh yarn <cmd>`; green build+test before push.
- Do NOT change the recommended-list ranking (era-ascending within state tier is by design — `.claude/rules/wonder-content.md`).
- Catalog panels must keep the full actionable catalog reachable; recommendation sections may be bounded (existing rule — unchanged here).
- `textContent` for dynamic strings.

## Background for the implementer (zero-context)

- Legendary wonders have a quest phase; completing all quest steps moves the
  project to `ready_to_build`. But **starting construction additionally
  requires** `getEligibleLegendaryWonders` (`src/systems/legendary-wonder-system.ts:386`):
  required techs + required resources (via `getOwnedResources(state, cityId)`) +
  city requirement (`'river' | 'coastal' | 'any'`). A quest-complete wonder
  missing a resource maps to `visibleState: 'blocked'`
  (`legendary-wonder-presentation.ts:209`), and the panel shows only
  `Missing: Stone.` (`src/ui/wonder-panel-view.ts:158-159`) with no path
  forward — the #555 dead end.
- `getMissingRequirements` (presentation.ts:142) currently returns display
  strings: tech names, resource names, `'River city'`/`'Coastal city'`,
  `'Already completed elsewhere'`, `'Already under construction in another
  city'`, `'Requirements unavailable'`. `isNearEligible` (line 173) and
  `HARD_BLOCKING_REQUIREMENTS` do string matching on these — you will convert
  them to match on the structured `kind`.
- `wonder-panel.ts:154` filters `blocked` out of its compact/recommended list;
  the full catalog section still shows blocked entries (verify while there).

---

### Task 1: Structured missing requirements with guidance

**Files:**
- Modify: `src/systems/legendary-wonder-presentation.ts` (`getMissingRequirements`, `isNearEligible`, `HARD_BLOCKING_REQUIREMENTS`, the `LegendaryWonderPresentationEntry.missingRequirements` field type)
- Test: `tests/systems/legendary-wonder-presentation.test.ts` (extend)

**Interfaces:**
- Produces:

```ts
export interface MissingRequirement {
  kind: 'tech' | 'resource' | 'city' | 'exclusivity' | 'unavailable';
  label: string;      // 'Stone', 'Mathematics', 'Coastal city', …
  guidance: string;   // player-actionable next step, full sentence
}
```

`missingRequirements: MissingRequirement[]` on the presentation entry. Keep a
convenience `missingRequirementLabels: string[]` if existing tests/UI lean on
the strings — prefer migrating them; add the convenience field only if >5 call
sites would otherwise change (check with `grep -rn "missingRequirements" src tests`).

Guidance strings by kind (exact copy):
- tech: `Research ${label} to unlock this wonder.`
- resource: `Acquire ${label}: work a ${label} tile in this city's territory, or secure it with an Expedition outpost or the marketplace.`
- city `'River city'`: `This wonder needs a city on a river — start it in one, or found one.`
- city `'Coastal city'`: `This wonder needs a coastal city — start it in one, or found one.`
- exclusivity (completed elsewhere): `Another civilization completed it first — this wonder is lost to history.`
- exclusivity (your other city building it): `Your city ${otherCityName} is already building it.` (fetch the other city's name inside `hasSameOwnerActiveBuild`'s caller — extend that helper to return the city id, then look up the name)
- unavailable: `Requirements could not be determined.`

- [ ] **Step 1: Failing tests**

```ts
describe('structured missing requirements (#555)', () => {
  it('a quest-complete wonder missing a resource explains how to get it', () => {
    // fixture: project phase ready_to_build; civ has techs; city lacks 'stone'
    const entries = getLegendaryWonderPresentationForCity(state, civId, cityId);
    const entry = entries.find(e => e.wonderId === wonderId)!;
    expect(entry.visibleState).toBe('blocked');
    const missing = entry.missingRequirements.find(m => m.kind === 'resource')!;
    expect(missing.label).toBe('Stone');
    expect(missing.guidance).toContain('Expedition outpost');
  });

  it('near-eligibility still treats completed-elsewhere as hard-blocking', () => {
    // fixture: wonder completed by another civ; one missing tech
    const entry = entries.find(e => e.wonderId === wonderId)!;
    expect(entry.visibleState).toBe('blocked'); // not 'near'
  });
});
```

(Reuse this test file's existing state fixtures — read its helpers first; it
already builds questing/ready projects for other cases.)

- [ ] **Step 2: Implement** — rebuild `getMissingRequirements` to emit the
  structured entries; convert `HARD_BLOCKING_REQUIREMENTS` from a string set
  to `kind === 'exclusivity' || kind === 'unavailable'` checks inside
  `isNearEligible`. Update every consumer the compiler flags (`yarn build`
  lists them; expected: `wonder-panel-view.ts`, `wonder-panel.ts`, possibly
  council/advisor formatters — `grep -rn "missingRequirements" src`).
- [ ] **Step 3:** Suite + build green; commit:
  `feat(wonders): structured missing requirements with player guidance (#555)`

### Task 2: Render guidance in blocked and questing states

**Files:**
- Modify: `src/ui/wonder-panel-view.ts` (the `Missing: …` block at lines ~158-181)
- Test: `tests/ui/wonder-panel.test.ts` (extend)

**Player truth table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Wonder card shows "Blocked" + "Missing: Stone." | (passive) | Card shows "Missing: Stone — Acquire Stone: work a Stone tile in this city's territory, or secure it with an Expedition outpost or the marketplace." |
| Wonder in questing, city lacks Stone | Open wonder panel | Quest card ALSO shows a "Build requirements" line listing Stone with the same guidance, so the player works both in parallel |
| Wonder blocked because another civ finished it | (passive) | Card reads "lost to history" — clearly terminal, no false hope |

**Misleading-UI risks (required section):** the guidance must only appear for
requirements that are actually missing *for this city* — a wonder viewed from
city A must not show city B's deficits. Negative test: same wonder, two
cities, resource present in B only → A shows the resource guidance, B does not.

- [ ] **Step 1: Failing UI tests**

```ts
  it('blocked card renders per-requirement guidance text', () => {
    renderWonderPanel(...);
    expect(container.textContent).toContain('Acquire Stone');
    expect(container.textContent).toContain('Expedition outpost');
  });

  it('questing card surfaces missing build requirements alongside quest steps', () => {
    expect(container.textContent).toContain('Build requirements');
    expect(container.textContent).toContain('Stone');
  });

  it('guidance is city-scoped', () => { /* two-city negative per above */ });
```

- [ ] **Step 2: Implement** — in `wonder-panel-view.ts`, replace the joined
  `Missing: a, b.` paragraph with one line per requirement:
  `${label} — ${guidance}` (textContent, one `<p data-role="missing-req">`
  each). For `questing` entries with nonempty `missingRequirements`, add a
  `Build requirements` sub-block after the quest steps using the same rows.
  Keep the compact one-line summary (line ~180) as labels-only.
- [ ] **Step 3:** Suite green (watch for wonder-panel tests hardcoding the old
  `Missing:` string — update them); commit:
  `feat(wonders): actionable blocked/questing requirement guidance (#555)`

### Task 3: Era-gating test net widened to resources

**Files:**
- Modify: `tests/systems/legendary-wonder-definitions.test.ts`
- Possibly modify: `src/systems/legendary-wonder-definitions.ts` (if any wonder fails the new gate — fix the data, era-matching the MR10 precedent)

- [ ] **Step 1: Add the generic test**

```ts
  it('no wonder requires a resource that cannot exist by the wonder\'s own era', () => {
    for (const def of getLegendaryWonderDefinitions()) {
      for (const resourceId of def.requiredResources) {
        const resource = RESOURCE_DEFINITIONS.find(r => r.id === resourceId);
        expect(resource, `${def.id} requires unknown resource ${resourceId}`).toBeTruthy();
        const revealTech = resource!.tech ? getTechById(resource!.tech) : null;
        const revealEra = revealTech?.era ?? 1;
        expect(revealEra, `${def.id} (era ${def.era}) requires ${resourceId} revealed at era ${revealEra}`)
          .toBeLessThanOrEqual(def.era);
      }
    }
  });
```

(Import paths: `RESOURCE_DEFINITIONS` from `@/systems/resource-definitions`,
`getTechById` from the tech system — grep its export location. Match the
file's existing loop-over-roster test idiom.)

- [ ] **Step 2:** Run it. If a wonder fails, fix its `requiredResources` or
  `era` in the definitions (prefer swapping to an era-appropriate resource;
  note the change in the PR body). Commit:
  `test(wonders): resources must be obtainable by the wonder's era (#555)`

### Task 4: Verify against the reported save + docs

- [ ] Manual: dev server; reach/emulate the screenshot state (wonder
  quest-complete, missing a requirement). Confirm the card explains the
  blocker and the fix path; confirm the recommended section does not surface
  it as startable.
- [ ] Append to `.claude/rules/wonder-content.md` checklist:
  `- [ ] requiredResources: every resource's reveal-tech era ≤ the wonder's era (generic test enforces).`
  and a line in the Natural/Legendary gating section noting the structured
  `MissingRequirement` contract (new requirement kinds need a guidance string —
  the compiler enforces via the union).
- [ ] Full suite + build; commit: `docs(wonders): blocked-state guidance + era-resource rule (#555)`

---

## Inline Dimension Review

- **Gameplay balance:** No mechanics change — eligibility rules are untouched; only their legibility changes. The era-resource test may force data fixes that make a wonder *actually obtainable* at its era (balance-positive, matches MR10 precedent).
- **Fun:** Quest chains ending in an unexplained wall is invested-effort-punished — the worst kind of unfun. Guidance turns the wall into the next quest ("get Stone"), which is the fantasy the feature intends.
- **New mechanics:** None. Presentation contract only.
- **Ages 7–43:** Guidance is written as full instructive sentences ("work a Stone tile…") rather than requirement codes; a young player gets a to-do, an adult gets it at a glance. "Lost to history" gives honest closure instead of a stale carrot.
- **Play styles:** Wonder-racers get the biggest win (they hit this state most); warmongers see "lost to history" and redirect production without wasted panel study.
- **Difficulty modes:** Not challenge-coupled; identical text across modes (information fairness — hiding guidance on veteran would be fake difficulty).
- **AI usage:** AI eligibility paths (`getEligibleLegendaryWonders`) are untouched — AI never read the display strings. Zero AI behavior change (verify the AI wonder tests still pass).
- **UI:** Extends existing card blocks in `wonder-panel-view.ts`; per-row `data-role` hooks keep tests precise; compact summary stays terse to avoid crowding the recommended cards.
- **UX:** The #555 complaint is verbatim "Cannot actually start on it, it is blocked" — every blocked card now answers "why" and "what next", and questing cards prevent the dead end from forming at all.
- **Architecture:** Structured requirements replace string-matching (`HARD_BLOCKING_REQUIREMENTS` string set was fragile — a wording tweak would have silently broken near-eligibility). Kind-based logic is refactor-safe.
- **Extensibility:** New requirement kinds are a union extension the compiler walks you through; guidance lives with the requirement (one place), so councils/advisors can reuse it later.
- **Data:** No state-schema change; possible wonder-definition data fixes are content corrections covered by the new generic test forever.
- **SFX:** None.
- **Saved games:** Presentation derives from state each render — old saves with already-blocked projects immediately gain guidance; nothing to migrate.
- **Testing:** Structured-shape tests, city-scoped negative test, questing-surface test, hard-block near-eligibility regression, and a roster-generic era gate that covers every FUTURE wonder automatically (the MR10 lesson).
- **Solo regressions:** Wonder panel/presentation suites re-run; ranking untouched (explicit constraint), so the MR11 recommended-list tests stay valid.
- **Hot-seat regressions:** All reads are viewer-city-scoped (`civId`/`cityId` params) — the two-city negative test doubles as the privacy check; no cross-player data added.
- **Implementation correctness:** Compiler-driven consumer migration (type change forces every read site to be visited); the only judgment call — which strings count as hard-blocking — becomes an explicit `kind` check with a regression test.
