# Spec Fidelity

- When implementing from `docs/superpowers/specs/` or `docs/superpowers/plans/`, preserve the exact gameplay contract unless the user explicitly changes it.
- Do not broaden gated effects. If a mission, bonus, or trigger only applies under a stated condition, add a negative test proving the condition matters.
- Do not weaken conjunctive resolution rules. If the spec says a system resolves only when `A` and `B` are both true, add tests for `A without B`, `B without A`, and `A with B`.
- Treat UI contract words such as `show`, `surface`, `de-emphasize`, `recalculate ETA`, `refresh`, or `prompt` as real requirements, not polish. Add tests that assert the visible DOM/text behavior when those words appear in the spec or plan.
- If a spec uses semantic UI terms such as `next layer`, `reachable`, `recommended`, or `available now`, add at least one negative test proving items outside that semantic set are not surfaced.
- New hostile owners or factions such as `rebels` must get explicit AI or player interaction coverage.
- Before reporting review results, compare both the committed branch delta and the local uncommitted delta against the correct base branch.
