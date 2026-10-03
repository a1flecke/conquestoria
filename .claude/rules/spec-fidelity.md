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

## Plan And Spec Lifecycle (#1024)

**Authority.** Source, tests and the canonical rules (`CLAUDE.md`, `AGENTS.md`, `.claude/rules/**`) describe what
exists. A plan or spec under `docs/superpowers/` describes *intended* or *historical* work, and it is only as current
as its last edit. Git history is the archive for delivered implementation plans; the active tree keeps only what
has a defensible reason to be there. Docs that remain are not "ignored" — they are the ones that earned their place.

**Where things live.** `docs/superpowers/{plans,specs}/` holds exactly the files listed in
`docs/docs-lifecycle-manifest.json`:

| Category | Meaning | In the tree? |
|---|---|---|
| `active` | Owned by an **open** issue (lists it); describes current/future work | yes |
| `durable-reference` | Cited by source, tests or rules for rationale that is *not* restated there (lists the citing files) | yes |
| `delivered-stale` / `superseded` / `abandoned` | The work shipped, was replaced, or was dropped | **no** — listed under `deleted`, recoverable from git history |

A durable decision that outlives its plan is **promoted**, not left as a "plan": into a `.claude/rules/` entry, a
current invariant doc under `docs/`, or the code comment/test that needs it (the wonder-codex source ledger is now
`docs/wonder-codex-source-ledger.md` for exactly this reason: it is a tested artifact, not a plan).

**Enforcement (offline, deterministic).** `node scripts/docs-lifecycle.mjs check`, run by
`tests/hooks/docs-lifecycle.test.sh` in the hooks job, fails when: a plan/spec is unclassified; a file classified
as delivered/superseded/abandoned still exists (or reappears); an `active` entry has no issue, or its recorded issue is
CLOSED; a `durable-reference`'s citing file is gone or no longer mentions it; any file names a `docs/superpowers/…`
path that does not exist; or an asset under `docs/superpowers/` is orphaned. The check never calls GitHub. Run
`node scripts/docs-lifecycle.mjs refresh` (uses `gh`) to update issue-state snapshots; `propose` prints the evidence
and a proposed category for every file.

**Authoring rules.**
- A new plan/spec is added to the manifest as `active` with the open issue that owns it, in the same PR.
- **The PR that completes the last phase of a plan deletes the plan** (and its manifest entry; add it under `deleted`
  as `delivered-stale`) — do not leave a "✅ merged" annotation behind. While phases remain, keep the plan honest:
  tick completed steps and annotate the phase header (`✅ merged (#PR)`, or `🟡 Phase 14a merged (#830); remaining
  sub-phases not started` for a partial phase — never mark a parent phase merged while a sub-phase is outstanding).
- Before starting a phase from an existing plan, verify its claimed status against the real PR history for its
  tracking issue (`gh pr list --search "<number>"` or `git log --grep`) rather than trusting an unchecked box.
- Code comments and rules should cite a durable doc (or an issue/PR number) — never a plan that will be deleted.
