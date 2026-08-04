# Claude Design Prompt: Conquestoria Sprites

**This file has no active prompt right now.** The last one — #769 batch 5, the FINAL batch (real,
distinct live-catalog sprites for `anti_tank_gun`, `mobile_aa`, `wwii_fighter`) — shipped
2026-08-04. All three now render their own bespoke `units.tsx` sprite function instead of aliasing
another unit's exact art. With this batch merged, **#769's own scope is fully complete** — the
audit script now reports only the 6 units owned by #708/#709/#711, none left for #769. Close #769
after confirming that (see the "Suggested first steps" / final-sweep note in git history for this
file, batch 5's drafting revision, for the exact close-out checklist).

The batch before that — #769 batch 4 (`global_air_cargo`, `stealth_bomber`) — shipped 2026-08-03
([PR #782](https://github.com/a1flecke/conquestoria/pull/782), commit `639449b1`). Both now render
their own bespoke `units.tsx` sprite function instead of aliasing another unit's exact art. Batch 3
(`freight_convoy`, `recon_aircraft`, `air_freighter`, `bomber`, `jet_freighter`) — merged into
`main` 2026-08-02 ([PR #780](https://github.com/a1flecke/conquestoria/pull/780), commit
`26e7705f`). Batch 2 (`frigate`, `destroyer`, `merchant_wagon`, drafted 2026-08-01 as [issue
#775](https://github.com/a1flecke/conquestoria/issues/775)) shipped 2026-08-01. Batch 1 (`chariot`,
`infantry`, `artillery`, `marine`, `cyber_unit`) shipped 2026-08-01 in PR #773 (merged).

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

A second round of this happened mid-batch-2 (2026-08-01): `anti_tank_gun` and `wwii_fighter`
landed on `main` from unrelated work with no owning-issue comment. Decision (2026-08-02): folded
into #769 as a new **Batch 5** (after batch 4) rather than silently added to batch 3/4. A third
round happened mid-batch-3 (2026-08-02, from #681 mechanized infantry): `mechanized_infantry` is
owned by #709, `mobile_aa` was unclaimed and got folded into Batch 5 alongside the first two. A
fourth round happened mid-batch-4 (2026-08-03, from #682 dreadnought construction): a rebase onto
`main` picked up `battleship`, owned by **#711** — out of #769's scope entirely, no batch action
needed. This confirms the pattern is not a one-time fluke: rebase onto `main` and re-run the audit
before *every* batch, not just when starting the arc.

**Before drafting any future #769 batch:**
1. Run the audit script (below) to get the live alias list — don't trust a roster pasted into an
   old prompt or issue body.
2. For every alias it reports, check whether the comment already on that catalog line names a
   different issue (`grep -B2 "<unit_id>:" src/renderer/sprites/sprite-catalog.ts`). If so, that
   issue owns it — don't add it to #769 without reconciling first (ask before assuming).
3. Only units with no other stated owner are genuinely #769's to batch — and even then, ask before
   silently folding a newly-discovered drift unit into an existing batch (see the
   `anti_tank_gun`/`wwii_fighter`/`mobile_aa` → Batch 5 precedent above).

## Audit before starting every batch

```bash
bash scripts/run-with-mise.sh yarn node scripts/audit-sprite-aliases.mjs
```

This re-derives the alias list directly from `sprite-catalog.ts` (not from this doc or any issue
body) and exits non-zero while any alias remains. As of batch 5 shipping (2026-08-04) it reports 6
total, all owned elsewhere and out of #769's scope: `beast_handler`/`war_elephant`/`cuirassier`
(owned by #708) and `armored_car`/`mechanized_infantry`/`battleship` (owned by #709/#711). #769
itself has 0 remaining — its scope is fully shipped. Cross-check its output against:
- `tests/renderer/sprites/sprite-catalog.test.ts` → `describe('#769 pending sprite-alias audit
  baseline', ...)` — the mechanically-enforced remaining-scope list for #769 specifically. A unit
  is only "done" when its row is deleted here — that deletion is the proof, not a checkbox in prose.
- Issue #769's body, for the batch grouping of whatever's left.

If the audit reports a unit not in either place, don't assume it's #769's — check for another
owning issue first (see "Durable note" above), then update both the baseline test and #769's plan
in the same PR.

---

## When a new sprite/terrain/prompt need comes up

Use the `.claude/skills/generate-sprite-prompt.md` skill for live-catalog (`units.tsx`/
`buildings.tsx`) sprites, or hand-write a v2-native prompt (see git history for #759 batch 1's
prompt as a template) for animation-hook rigging work. Append the new prompt to this file the same
way this one was — dated, scoped to the specific issue — and prune it back out once shipped rather
than leaving it to accumulate. Everything that has ever lived in this file (economy sprites,
terrain tiles, naval transports, legendary beasts, rail segments, both Era 13 batches, #759 batch
1, #769 batches 1 through 5) was pruned the same way, verified against actual source each time
before removal — the history is in git, not preserved here. #769 itself is fully shipped as of
batch 5 (2026-08-04) — its own scope is complete, though its "Durable note" above stays as a
process lesson for any future sprite-alias issue.
