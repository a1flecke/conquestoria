# Spec Fidelity

- When implementing from `docs/superpowers/specs/` or `docs/superpowers/plans/`, preserve the exact gameplay contract unless the user explicitly changes it.
- Do not broaden gated effects. If a mission, bonus, or trigger only applies under a stated condition, add a negative test proving the condition matters.
- Do not weaken conjunctive resolution rules. If the spec says a system resolves only when `A` and `B` are both true, add tests for `A without B`, `B without A`, and `A with B`.
- New hostile owners or factions such as `rebels` must get explicit AI or player interaction coverage.
- Before reporting review results, compare both the committed branch delta and the local uncommitted delta against the correct base branch.
