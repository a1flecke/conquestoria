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
| `railway-expansion` tech | tech | all land units | ×2 speed on roads (not additive +N) | era 7+ |

**Why Road Corps and National Railway don't grant movement:** early drafts gave both +1 road movement, which stacked to +2 on roads for an era 3–8 overlap window. Both were revised to non-movement effects to respect this policy.

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

## Special Building Rules

Special buildings (those with `requiresBuildings` chain prereqs or `coastalRequired`) may have **two yield types** — the condition is the balancing constraint. No ceiling applies beyond common sense (compare to similar-era wonders for reference).

## Adding New Content — Checklist

When adding a new wonder, national project, or special building in any future era:

- [ ] Wonder: `civYieldBonus` no single key > 6; ≤ 2 keys; no per-city scaling (or add to allowlist)
- [ ] National project: single yield type preferred; total ≤ era ceiling; no `cityYieldBonus`; no per-city scaling (or add to allowlist)
- [ ] National project: AI/player availability uses the shared reserved-project set; UI labels its yields as empire-wide
- [ ] Wonder/project: definition-driven AI eligibility and global/self-competition tests cover the new entry without ID-specific AI branches
- [ ] Any movement bonus: update the stacking inventory table above; confirm total ≤ +2 empire-wide for affected unit class
- [ ] Run `yarn test` — `national-project-balance.test.ts` and `wonder-definitions.test.ts` will fail if ceilings are exceeded
