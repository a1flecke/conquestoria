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
