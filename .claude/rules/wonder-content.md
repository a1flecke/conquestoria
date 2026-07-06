# Wonder Content Rules

Living reference for legendary-wonder and natural-wonder correctness invariants. Every rule below is enforced by a generic test that loops over the *current* roster — a new wonder is automatically checked, not just the ones that already exist. See `tests/systems/legendary-wonder-definitions.test.ts`, `tests/systems/wonder-definitions.test.ts`, `tests/systems/city-territory-system.test.ts`, and `tests/systems/city-work-system.test.ts`.

These came out of MR10 (#469), where four legendary wonders had `requiredTechs` pointing at the wrong era, two entities collided on display name, `research_count` quest steps had no baseline, and one natural wonder's terrain was permanently unworkable. Each was individually fixable but none was *mechanically checkable* until these tests existed — so the next wonder that ships with the same class of bug fails CI instead of shipping broken.

## Legendary Wonder Gating

- **Tech era must not exceed wonder era.** Legendary-wonder availability is tech-gated only — there is no separate era check anywhere in the eligibility path (`getEligibleLegendaryWonders` in `legendary-wonder-system.ts`). If any `requiredTechs` entry belongs to a later era than the wonder's own `era` field, the wonder is unbuildable in its own display era (or worse, in the eras immediately after it too).
  - Enforced by: `legendary-wonder-definitions.test.ts` → `no wonder requires a tech from a later era than the wonder itself`.
  - When adding a wonder: look up the era of every tech you put in `requiredTechs` before finalizing (`grep "id: '<tech-id>'" src/systems/tech-definitions-eras*.ts`), and confirm `max(techEra) <= wonder.era`.

## Display Name Collisions

- **A wonder's name must not collide with any building, tech, or trainable unit name.** Players see wonder names in notifications, the wonder codex, council advice, and the build queue — a collision (e.g. a national project also called "Manhattan Project") makes those surfaces ambiguous.
  - Enforced by: `wonder-definitions.test.ts` → `no legendary or natural wonder shares its display name with a building, tech, or trainable unit`.
  - This check is intentionally scoped to *wonders* colliding with something else — a tech sharing a name with the building it unlocks (e.g. "Blast Furnace" tech → `blast_furnace` building) is a deliberate, harmless convention elsewhere in this codebase and is not flagged.
  - When adding a wonder: grep the exact display name across `src/systems/city-system.ts` (BUILDINGS), `src/systems/tech-definitions-eras*.ts`, and `TRAINABLE_UNITS` before finalizing.

## research_count Quest Steps

- **Baselines are automatic — don't fight them.** Any quest step with `type: 'research_count'` gets a baseline snapshot (current matching-tech count) the moment its project enters `questing`, via `createLegendaryWonderProject` in `legendary-wonder-system.ts`. Evaluation and the displayed progress text both read `getResearchCountProgress(project, step, civ)`, which subtracts the baseline — so a civ that already had 20 techs done before questing started can't instantly satisfy "complete 4 technologies."
  - This is structural: a new wonder with a `research_count` step gets baseline treatment for free, with no extra wiring required.
  - Description text convention: phrase these steps as "Complete N **more** X technologies" (not "Complete N X technologies") — the baseline means the target is always relative, never a lifetime total. `getDefaultQuestStepDescription`'s auto-generated text does not add "more" automatically — if you write an explicit `description`, add it yourself.

## Natural Wonder Terrain

- **A natural wonder's terrain must be both claimable and workable.** Territory claim (`canClaimTile` in `city-territory-system.ts`) and city-work eligibility (`isWorkableTerrain` in `city-work-system.ts`) both blanket-exclude `ocean` terrain by default; a wonder placed there needs the explicit `tile.wonder != null` exception both functions already carry. If a *new* terrain type ever gains a similar blanket exclusion, any wonder using that terrain needs the same treatment.
  - Enforced by: `city-territory-system.test.ts` → `every natural wonder terrain is claimable when a wonder occupies the tile`, and `city-work-system.test.ts` → `every natural wonder terrain is workable when a wonder occupies the tile`.
  - When adding a natural wonder on a terrain not already covered by an existing wonder: run these two tests first — if they fail, the terrain has a blanket exclusion that needs the `tile.wonder`-aware exception, same pattern as the `ocean` case.

## Codex Source Ledger Sync

- **`docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md` is a hand-maintained mirror of `src/systems/wonder-codex/sources.ts` and is NOT derived from code.** If a new legendary wonder gets a `legendary-content.ts` entry with a new fact-source id (or reuses one that already exists but the wonder itself is new), the ledger needs two additions: a "Baseline Source Inventory" row for any *new* fact source, and a "Per-Entry Ledger Requirement" row for the wonder itself, in the exact `| \`id\` | \`factSourceIds\` | \`imageSourceId\` | localPath | license | attribution |` shape already used by every other row.
  - Enforced by: `tests/systems/wonder-codex/sources.test.ts` → `keeps the human-readable source ledger in sync with source ids` and `keeps one completed ledger row per codex entry`. Both do literal substring matching against the raw markdown file — there is no fuzzy matching, so exact ids/URLs/paths must appear verbatim.
  - This file is easy to forget because it lives under `docs/`, not `src/` or `tests/`, so it doesn't show up when you're grepping for wonder wiring points. When adding wonder codex content, treat the ledger update as a required 7th file alongside the six presentation registries (definitions, roster, landmark catalog, bespoke assets, codex content, codex sources).

## Recommended-List Ranking Is Era-Ascending Within A State Tier (by design)

- **`getLegendaryWonderPresentationForCity` sorts entries by `visibleState` priority (ready > building > recovered > questing > near > blocked > completed), then by `era` ascending, then by name** before `wonder-panel.ts`'s `recommendedEntries` slices the top 3. This is intentional, not incidental array order — when two wonders are equally "near" or "questing," the lower-era (more attainable) one is recommended first.
  - Concretely: adding new low-era wonders can legitimately bump a higher-era wonder that was previously in the top-3 out of "recommended," if both land in the same `visibleState` tier. This happened in MR11 — a pre-existing `wonder-panel.test.ts` test hardcoded "Grand Canal (era 4) appears in the recommended section," and 3 new era-1/2 wonders (also `near`, missing 2 requirements each) legitimately outranked it. This is the sort working as designed, not a bug — do not "fix" it by changing the sort.
  - When adding a wonder: search `tests/ui/wonder-panel.test.ts` (and any other test asserting a specific wonder shows up in a bounded "top N" / "recommended" list) for hardcoded assumptions your new lower-era wonder(s) might now outrank. Neutralize your new wonder(s) in that test's fixture (mark completed-elsewhere so they don't compete) rather than changing the ranking logic to preserve an old assertion.

## Adding a New Wonder — Checklist

- [ ] `requiredTechs`: confirm every tech's era ≤ the wonder's own `era`.
- [ ] Display name: grep it across buildings, techs, and trainable units — zero hits.
- [ ] `research_count` steps: write descriptions as "Complete N more X" — baseline handling is automatic, no code change needed.
- [ ] Natural wonders only: if the `validTerrain` is a terrain no existing wonder uses, run the claim/work tests above before assuming the yield is earnable.
- [ ] Codex content: if you add fact sources or codex entries, update the ledger doc (`docs/superpowers/specs/2026-05-23-wonder-codex-atlas-source-ledger.md`) in the same change — see "Codex Source Ledger Sync" above.
- [ ] Search `tests/ui/wonder-panel.test.ts` for hardcoded "appears in recommended/top-N" assumptions your new wonder(s) might displace — see "Recommended-List Ranking Is Era-Ascending Within A State Tier" above.
- [ ] Run `yarn test` — the four generic tests above will fail loudly if any of the above is missed.
