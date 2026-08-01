# Claude Design Prompt: Conquestoria Sprites

**This file has no active prompt right now.** The last one — #769 batch 1 (real, distinct
live-catalog sprites for `chariot`, `infantry`, `artillery`, `marine`, `cyber_unit`) — shipped
2026-08-01. All 5 now render their own bespoke `units.tsx` sprite function instead of aliasing
another unit's exact art.

## Durable note: check for other issues owning the same units before scoping a batch

When #769 was filed, it audited `UNIT_SPRITE_CATALOG` and found 17 aliased units, without checking
whether any were already owned by a pre-existing tracked issue. They were: issue **#708** (part of
the larger #547 combat-roster initiative) already owned `chariot`/`beast_handler`/`war_elephant`/
`cuirassier`'s bespoke-sprite work, with its own design doc and implementation plan, before #769
was ever filed. This was discovered mid-batch-1 (2026-08-01) when a delivered sprite batch's own
authored comments correctly cited `#708` — because the generation prompt's reference files pulled
the live repo's existing `sprite-catalog.ts`, which already had `// #708 owns ...` comments on
those exact lines.

**Resolution**: `chariot` shipped under #769 (folding in that slice of #708's scope; #708's
comment was updated to reflect it). `beast_handler`/`war_elephant`/`cuirassier` remain #708's
scope, not #769's — removed from #769's batch plan. `armored_car` (a newly-added alias discovered
during the same reconciliation) belongs to issue #709, also not #769.

**Before drafting any future #769 batch:**
1. Run the audit script (below) to get the live alias list — don't trust a roster pasted into an
   old prompt or issue body.
2. For every alias it reports, check whether the comment already on that catalog line names a
   different issue (`grep -B2 "<unit_id>:" src/renderer/sprites/sprite-catalog.ts`). If so, that
   issue owns it — don't add it to #769 without reconciling first (ask before assuming).
3. Only units with no other stated owner are genuinely #769's to batch.

## Audit before starting every batch

Two new aliases (`cuirassier`, `armored_car`) landed on `main` between batch 1 being filed and
batch 1 shipping — added by a separate, actively-landing automated initiative (issue #547). This
is exactly the drift this audit step exists to catch:

```bash
bash scripts/run-with-mise.sh yarn node scripts/audit-sprite-aliases.mjs
```

This re-derives the alias list directly from `sprite-catalog.ts` (not from this doc or any issue
body) and exits non-zero while any alias remains. Cross-check its output against:
- `tests/renderer/sprites/sprite-catalog.test.ts` → `describe('#769 pending sprite-alias audit
  baseline', ...)` — the mechanically-enforced remaining-scope list for #769 specifically (10
  units as of 2026-08-01, batch 1 shipped, beast_handler/war_elephant/cuirassier/armored_car
  excluded as described above). A unit is only "done" when its row is deleted here — that
  deletion is the proof, not a checkbox in prose.
- Issue #769's body, for the batch grouping of whatever's left.

If the audit reports a unit not in either place, don't assume it's #769's — check for another
owning issue first (see "Durable note" above), then update both the baseline test and #769's plan
in the same PR.

## When a new sprite/terrain/prompt need comes up

Use the `.claude/skills/generate-sprite-prompt.md` skill for live-catalog (`units.tsx`/
`buildings.tsx`) sprites, or hand-write a v2-native prompt (see git history for #759 batch 1's
prompt as a template) for animation-hook rigging work. Append the new prompt to this file the same
way every prior prompt was — dated, scoped to the specific issue — and prune it back out once
shipped rather than leaving it to accumulate. Everything that has ever lived in this file (economy
sprites, terrain tiles, naval transports, legendary beasts, rail segments, both Era 13 batches,
#759 batch 1, #769 batch 1) was pruned the same way, verified against actual source each time
before removal — the history is in git, not preserved here.
