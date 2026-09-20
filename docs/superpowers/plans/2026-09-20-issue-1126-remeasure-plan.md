# #1126 — Re-measure and reconcile long-horizon super-linear cost post-#1127: implementation plan

Companion design doc: `docs/superpowers/specs/2026-09-20-issue-1126-remeasure-design.md`
(§4: Case D — no code fix, documentation-only reconciliation).

## Scope

This is a documentation-only change. No `src/` file is touched, so no TDD red/green cycle applies
in the usual sense — the "test" here is that the evidence in the design doc is real (already
gathered, §2) and that the doc edits do not misrepresent it.

## Steps

1. **`.claude/rules/ai-simulation.md`** — replace the "Runtime" paragraph (lines ~45-56) so it
   names #1094 (not #1126) as the tracked dominant cost, and states #1126 is closed as fully
   attributed rather than fixed. **DONE** in this session — see the diff.
2. **`tests/simulation/long-horizon/campaign-scenarios.ts`** — replace the file-header comment's
   #1126 forward-reference (currently "tracked separately as #1126") with the resolved
   attribution to #1094, and note #1129/#1130's measured effect on the growth ratio, plus a
   pointer to the new design doc for the call-count re-measurement. **DONE** in this session.
3. **Verify no other file references #1126 as an open/unattributed hotspot** in a way this change
   would make stale. `grep -rn "#1126" --include='*.md' --include='*.ts' .claude/rules docs
   src tests` and confirm every hit is either historical (a past-tense "attributed by #1126" is
   fine) or already updated by steps 1-2.
4. **`yarn test`** is not expected to be affected (no `src/` change) — run it anyway as a sanity
   check before opening the PR, since the pre-push hook requires it regardless.
5. **`yarn build`** — same, sanity check only.
6. Post evidence comments to GitHub issues #1126 and #1125 (the actual measured tables from the
   design doc's §2), then close #1126. Leave #1125 open with an honest status update (target not
   met, but every previously-unattributed cost in its scope is now attributed to #1094).
7. Open one PR titled to reflect the docs-only, no-fix nature of this change (avoid implying a
   performance fix landed). PR body must include `Pre-PR inline code review` findings per the
   Sol-review step below.
8. Merge via this repo's established rebase-merge-with-admin-bypass workflow once required
   non-build checks are green (per this project's PR merge workflow memory — admin bypass is
   needed because a solo-maintainer repo can't get a second human reviewer).

## Stop conditions

- If grep in step 3 finds a file this plan didn't anticipate that asserts something about #1126
  being open/unfixed in a way that would become misleading (e.g. a test asserting on issue state,
  which doesn't exist in this repo, or a `KNOWN_CAMPAIGN_GAPS` entry citing #1126 — checked: none
  does, `known-campaign-gaps.ts` only cites #1094/#1066/#1093/#1107/#1108, never #1126), update
  that file too before opening the PR.
- If `yarn test` or `yarn build` fails, investigate — a docs-only diff failing either would
  indicate a workspace/toolchain problem unrelated to this change, not a reason to route around
  the gate.

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

Same conclusion as the design doc's own review pass (§ Mandatory review there): this plan touches
only two markdown/comment doc surfaces, no production code, no test code, no save shape. Every
dimension not gameplay/AI/testing is inspected and confirmed unaffected by construction (a
plan whose only steps are prose edits to `.md`/`.ts`-comment content cannot touch gameplay,
UI, data, SFX, or saves). The AI/testing dimensions were genuinely engaged during design (see the
design doc's own review pass) rather than during this plan, which just sequences the doc edits.

No findings.
