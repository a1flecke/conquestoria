---
paths:
  - "src/**"
  - "docs/superpowers/specs/**"
  - "docs/superpowers/plans/**"
---

# Spec Fidelity

- When implementing from `docs/superpowers/specs/` or `docs/superpowers/plans/`, preserve the exact gameplay contract unless the user explicitly changes it.
- Do not broaden gated effects. If a mission, bonus, or trigger only applies under a stated condition, add a negative test proving the condition matters.
- Do not weaken conjunctive resolution rules. If the spec says a system resolves only when `A` and `B` are both true, add tests for `A without B`, `B without A`, and `A with B`.
- Treat UI contract words such as `show`, `surface`, `de-emphasize`, `recalculate ETA`, `refresh`, or `prompt` as real requirements, not polish. Add tests that assert the visible DOM/text behavior when those words appear in the spec or plan.
- If a spec uses semantic UI terms such as `next layer`, `reachable`, `recommended`, or `available now`, add at least one negative test proving items outside that semantic set are not surfaced.
- New hostile owners or factions such as `rebels` must get explicit AI or player interaction coverage.
- Before reporting review results, compare both the committed branch delta and the local uncommitted delta against the correct base branch.

## Specs Can Be Stale About Current Code

- A GitHub issue or `docs/superpowers/` spec is a snapshot from whenever it was written — it can describe code that has since been renamed, moved, superseded, or was never merged as described. Recurred across MR8–MR11: a spec claimed `digital-surveillance` gates spy missions (it doesn't, per a later comment in the file), claimed `codex-eternal` was a "non-bespoke" example (it is bespoke), and claimed two natural-wonder-only registries (`wonder-visual-catalog.ts`, `wonder-spectacle/recipes.ts`) needed legendary-wonder entries (they don't take legendary wonders at all).
- Before implementing any spec claim that describes *current* code state (a function's behavior, which registries need an entry, whether a system is wired a certain way), verify it directly against the actual file with grep/read — do not carry the claim forward into the implementation just because it's written down.
- If a verified claim turns out to be wrong, do not silently "fix" the spec's mistake by implementing what you now believe is correct without saying so — make the pragmatic, defensible call, and note the deviation (in the PR body or a code comment) so a reviewer can see the spec and the implementation intentionally disagree and why.

## Plan Docs Must Stay Synced With Merged Phases

The previous section is a reading-time caveat (verify before trusting). This one is the matching authoring-time obligation, added after three separate stale-plan-doc incidents hit the same file (`docs/superpowers/plans/2026-08-04-composition-root-decomposition.md`) inside about a week — see [#842](https://github.com/a1flecke/conquestoria/issues/842) for the incident history.

- When a PR completes a phase (or sub-phase) from a `docs/superpowers/plans/*.md` file, that same PR MUST update the plan doc: tick the phase's step checkboxes and add a status annotation to its `### Phase N — ...` header line (`✅ merged (#PR)` for a fully-landed phase).
- If only part of a phase landed (e.g. a lettered sub-phase like "14a" merged but the parent phase has more sub-phases left), do NOT mark the parent phase merged. Use an honest partial-progress annotation instead (e.g. `🟡 Phase 14a merged (#830); remaining sub-phases not started`) plus a short status paragraph naming what's outstanding — see `2026-08-04-composition-root-decomposition.md`'s Phase 14 for the pattern.
- This applies even when the phase's own PR body already states completion. The plan doc is what a fresh agent reads first — this repo has multiple concurrent agents with no shared memory across sessions, so a stale doc actively misleads rather than just being unhelpful. Don't rely on PR history alone to carry the "is this done" answer.
- Do not defer this to "someone will sync it later." That's exactly how it broke three times: a phase-completing PR landed without touching the plan doc, and no later PR was obligated to catch up until a dedicated drift-check PR eventually found it.
- Before starting any phase from an existing plan doc, verify its claimed status against the real PR history for that phase's tracking issue/arc number (`gh pr list --search "<number>"` or `git log --grep`) rather than trusting an unchecked box as proof the phase hasn't already shipped under a different PR — the doc can be behind reality in either direction.
