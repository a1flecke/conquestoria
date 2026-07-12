# Game Balance Rules

Living reference for yield ceilings, movement stacking policy, and national project invariants. Tests in `tests/systems/national-project-balance.test.ts` and `tests/systems/wonder-definitions.test.ts` enforce these mechanically.

## Wonder Reward Ceilings

- `civYieldBonus` (empire-wide): any single yield key ≤ +6. No single key may exceed +6 at any era.
- `cityYieldBonus` (host city only): any single yield key ≤ +4.
- At most **2 keys** per yield bonus object.
- **No per-city or per-route scaling** (e.g., "+2 gold per coastal city" or "+1 gold per trade route") unless the wonder is in the allowlist below with a documented justification.

**Per-city/per-route wonder allowlist:** *(empty — add entries here with justification if a future wonder requires scaling)*

## National Project Reward Ceilings

National projects have stricter rules than wonders because every civ can build them (not first-come-first-served globally).

- Prefer a **single yield type** in `civYieldBonus`.
- If two yield types are used, **neither key may exceed +3**.
- `civYieldBonus` total (sum of all keys) must not exceed the era-scaled ceiling:
  - Era 1–2: ≤ 2
  - Era 3–4: ≤ 5
  - Era 5–6: ≤ 7
  - Era 7+: ≤ 9
- **No `cityYieldBonus`** on national projects — effects must be empire-wide.
- **No per-city or per-route scaling** unless in the allowlist below.
- National projects must have `uniquePerEmpire: true`.
- `nationalProject.homeEra` must be in range 1–12.

**Per-city/per-route national project allowlist:**
- `grand_bazaar` (era 2): "+1 gold per city" — justified because empire size is naturally ≤ 4 cities at era 2, capping actual gain at +4 gold.
- `colonial_administration` (era 6): "+2 gold per city beyond your 4th" — thematically rewards colonial expansion; self-limiting because additional cities require production investment; maximum ~+12 gold (10 cities × 2) but duration limited to 3 eras with fade.

## Movement Bonus Stacking Policy

Movement bonuses are the most easily broken stat — small integers stack to produce scout-speed armies. Before adding any movement bonus (to a tech, building, wonder, or national project):

1. List every currently active source of movement bonus for the same unit class.
2. Confirm the total stacked bonus for any unit in any single era does not exceed +2 movement from empire-wide sources.
3. Document the stacking analysis in a comment on the definition.

**Current movement bonus inventory** (update this table when adding new bonuses):

| Source | Type | Applies to | Bonus | Era active |
|---|---|---|---|---|
| `trade-winds` tech | tech | naval units | +1 move | era 6+ |
| Navigator's Compass wonder | wonder (special) | naval units | +1 move | era 5+ (permanent) |
| Road Corps national project | national project | — | (road construction speed, no movement) | era 3–5 |
| National Railway national project | national project | — | (trade route gold, no movement) | era 7–9 |
| `military-logistics` tech | tech | all land units | road entry cost 1 → 0.5 (not additive +N) | era 4+ |
| `railway-expansion` tech | tech | all land units | road entry cost 1 → 0.5 (not additive +N; does not stack with Military Logistics) | era 7+ |
| `gps-navigation` tech | tech | land units in own territory | ignores hills/forest extra cost (terrain cost 1) | era 12+ |

**Roads discount, they don't stack:** entering a `hasRoad` tile always costs 1 movement, or 0.5 if the moving unit's owner has `military-logistics` **or** `railway-expansion` — never both at once (0.5 is the floor, not 0.25). See `tests/systems/road-system.test.ts` for the explicit no-stack regression.

**Why Road Corps and National Railway don't grant movement:** early drafts gave both +1 road movement, which stacked to +2 on roads for an era 3–8 overlap window. Both were revised to non-movement effects to respect this policy.

## Happiness Inventory

Happiness reduces unrest pressure at 2 pressure per point
(`computeUnrestPressure` / `getUnrestPressureBreakdown` in
`faction-system.ts`). Unlike yields, happiness has no MR12-style ceiling rule
of its own yet — this table exists so future additions stay legible and
proportionate to what's already here.

| Source | Scope | Amount | Era active |
|---|---|---|---|
| Temple building | city | +1 | era 3+ (`philosophy`) |
| Amphitheater building | city | +1 | era 4+ (`drama-poetry`) |
| Monastery building | city | +1 | era 5+ (`monastic-orders`) |
| Concert Hall building | city | +1 | era 6+ (`baroque-music`) |
| Luxury resources (each type owned) | empire | +1 each | varies by resource |
| Beast-slayer's feast (Hunt crisis reward) | empire | +2 | temporary, 5 turns |

**Rule:** any new happiness source (building, wonder, tech, resource) must add
a row here and stay at +1 per single source unless a documented gameplay
reason requires more (matching the spirit of the wonder/national-project yield
ceilings above, applied to happiness).

## National Project Lifecycle Contract

- **Build window:** available during `homeEra` and `homeEra + 1` only. Hidden from production queue when `currentEra > homeEra + 1`.
- **Yield multiplier** based on `currentEra - eraBuilt`:
  - 0 or 1: 1.0 (full)
  - 2: 0.5 (fading)
  - ≥ 3: 0.0 (expired — building removed, `city:national-project-expired` event fired)
- A civ may not queue a national project it has already built or already queued in another city (`uniquePerEmpire: true`). All production and recommendation paths must use `getReservedNationalProjectKeys`.
- National-project `yields` are display/balance metadata only; `calculateCityYields` must not apply them to the host city. Active effects enter the economy exactly once through `getNationalProjectCivYieldBonus`.
- UI must show `(fading)` label when multiplier is 0.5.
- Build UI must label national-project yield numbers as empire-wide so they cannot be mistaken for host-city yields.

## National Project Production Discounts

MR12 added a second class of national-project effect distinct from `civYieldBonus`: empire-wide *production cost discounts* (e.g. Tribal Muster Ground: era-1/2 melee units train 10% cheaper). These are cost multipliers, not yields, so the yield ceilings above do not apply to them — but they have their own rules:

- Defined in `NP_PRODUCTION_DISCOUNTS` in `src/systems/city-system.ts`, a data table (`{ nationalProjectId, appliesTo, discount }`) consumed generically by `getNationalProjectDiscountMultiplier`. **Add a new discount by appending a row — never add another `if (project.id === '...')` branch to that function.** The whole point of the table is that a new discount NP requires zero changes to the resolver.
- `appliesTo` is either a `UnitClass` (checked via `UNIT_CLASS_BY_TYPE`, e.g. `'gunpowder'`, `'siege'`) or an explicit `UnitType[]` for discounts that don't map to one class (e.g. `ERA_1_2_MELEE_UNIT_TYPES`). Prefer the class form — it stays correct if new units are added to that class later; only use an explicit list when the discount's boundary is genuinely not a `UnitClass` (era-scoped melee is the only current example).
- Discounts are fade-scaled by the project's `fadeMultiplier` (same 1.0 / 0.5 / 0.0 curve as yields) and are **multiplicative** with building discounts and tech discounts — not `Math.min`'d like same-class building discounts are. See `tests/systems/city-system.test.ts` "MR12 — national-project production discounts" for the exact-value regression.
- `getProductionCostForItem` only computes this when callers pass `activeNationalProjects: ActiveNationalProjectRef[]` (from `getActiveNationalProjectsForCiv`). As of MR12 this is threaded through: `economy-system.ts` (rush-buy), `planning-system.ts` (idle-city recommendation), `quest-objective-system.ts` (caravan-queue-cost estimate), `ai-production.ts` (AI candidate scoring), and `city-panel.ts` (displayed cost). **Any new call site of `getProductionCostForItem` that can see a real city/civ must also pass `activeNationalProjects`, or a discount NP will silently not apply there** — there is no compiler or test error for a caller that simply omits the option, since it defaults to `[]`. When adding a new caller, check this list and add it, and prefer verifying the new caller's discounted cost in a test rather than assuming the default-`[]` path is fine.

## Special Building Rules

Special buildings (those with `requiresBuildings` chain prereqs or `coastalRequired`) may have **two yield types** — the condition is the balancing constraint. No ceiling applies beyond common sense (compare to similar-era wonders for reference).

## Adding New Content — Checklist

When adding a new wonder, national project, or special building in any future era:

- [ ] Wonder: `civYieldBonus` no single key > 6; ≤ 2 keys; no per-city scaling (or add to allowlist)
- [ ] National project: single yield type preferred; total ≤ era ceiling; no `cityYieldBonus`; no per-city scaling (or add to allowlist)
- [ ] National project: AI/player availability uses the shared reserved-project set; UI labels its yields as empire-wide
- [ ] Wonder/project: definition-driven AI eligibility and global/self-competition tests cover the new entry without ID-specific AI branches
- [ ] Any movement bonus: update the stacking inventory table above; confirm total ≤ +2 empire-wide for affected unit class
- [ ] National project production discount (new class, see above): append a row to `NP_PRODUCTION_DISCOUNTS`, don't branch; confirm every `getProductionCostForItem` caller in the list above still passes `activeNationalProjects`
- [ ] Run `yarn test` — `national-project-balance.test.ts` and `wonder-definitions.test.ts` will fail if ceilings are exceeded

## Pacing Regression Prevention

- Any MR that adds or activates a new economy-affecting bonus (tech yield, building
  yield, wonder yield, national-project yield) MUST re-run
  `tests/systems/pacing-audit.test.ts`'s full-catalog outlier gate before merging.
- If the change shifts a reference-economy era snapshot's output (see
  `tests/systems/pacing-reference-economy.test.ts`), the PR must include the updated
  snapshot numbers and a one-line justification, not just a passing test — this is the
  seam future MRs go through instead of silently drifting pacing the way MR4–6 did
  (see issue #481 for the incident this rule prevents).
- The reference-economy fixture (`tests/systems/helpers/pacing-reference-economy.ts`) computes
  two profiles per era: `'bounded'` (only buildings gated within the last `BUILDING_ERA_WINDOW`
  eras count as active production) and `'maximal'` (every eligible building regardless of era —
  a completionist player who builds everything, a real playstyle, not a corner case).
  `RESEARCH_OUTPUT_BY_ERA` targets **`'maximal'`**, not `'bounded'`: tuning against the lower
  bounded output would let a completionist empire blow through late-game tech far faster than
  the target window, which is exactly the "feels automatic" failure the pacing design doc warns
  against. Both profiles are pinned by `tests/systems/pacing-reference-economy.test.ts` so this
  tradeoff stays visible in one place — do not quietly change which profile `RESEARCH_OUTPUT_BY_ERA`
  targets without updating that file's comments and re-running the full outlier gate (era 10-12
  tech costs will shift; that cascade is expected, not a sign something broke).
- That same test file also gates the era-over-era output growth ratio (currently capped at 3x)
  for both profiles. This is a guardrail against a repeat of the MR13 review finding: a bug in
  building-eligibility logic can silently produce runaway output that only becomes visible once
  it cascades into hundreds of tech-cost changes. If you touch `eligibleBuildingIds` or either
  profile's derivation, this test should be the first thing you check.
