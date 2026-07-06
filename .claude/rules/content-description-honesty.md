# Content Description Honesty

Living reference for keeping `Tech.unlocks`, `Building.description`, and `UNIT_DESCRIPTIONS` strings truthful about what the game actually does. Grew out of MR12 (#471), which found ~40 era 1–4 tech texts and several building descriptions naming buildings, units, or mechanics that either don't exist, aren't gated the way the text implies, or were never implemented at all (a tech named a building unlocked by a much later tech; a building claimed a mechanic the code never checked; a national-project description implied a combat bonus no code ever computed).

## Why This Recurs

Unlike wonders and national projects (which have `.claude/rules/wonder-content.md` and `.claude/rules/game-balance.md` with mechanically-enforced ceilings and collision checks), general tech/building/unit description text has no structural check tying prose to behavior — a description is just a string literal. It is easy to write a plausible-sounding effect while implementing something narrower (or nothing), and nothing fails until a human re-reads the text against the code, which is exactly what the MR12 audit did retroactively.

## The Guardrail That Exists, and Its Known Limit

- `tests/systems/description-honesty.test.ts` denylists the exact phrases removed in MR12 (`"decisive edge"`, `"eliminates maintenance costs"`, `"Market Manipulation"`, etc.) across every `Tech.unlocks`, `Building.description`, and `UNIT_DESCRIPTIONS` string.
- **This is a tripwire for regressions of already-known bad phrases, not a general honesty checker.** It will not catch a brand-new description in MR13+ that invents a new plausible-sounding but unimplemented mechanic in different words. Do not treat a passing `description-honesty.test.ts` run as proof that new text is honest — it only proves new text doesn't repeat old mistakes verbatim.
- `tests/systems/tech-unlocks-consistency.test.ts` catches a narrower, fully mechanical class of dishonesty: `unlocks` text of the literal form `"Unlock <Name> building/unit"` where `<Name>` doesn't correspond to a building/unit actually gated by that tech, and `unlocks` strings that exactly match a real building/unit name (entity names belong in `unlocksUnits`/`unlocksBuildings`, not `unlocks`). This is generic and durable but only fires for that specific phrasing pattern.

## Checklist For Any New Or Edited Description

When writing or editing a `Tech.unlocks` entry, `Building.description`, or `UNIT_DESCRIPTIONS` string that names a concrete effect (a percentage, a named building/unit, a combat bonus, a discount, a defensive mechanic):

- [ ] Grep the codebase for the mechanism the text claims (a discount table, a yield modifier, a combat-modifier row, a building-gate check) and confirm it actually exists and is wired to the entity you're describing — not just a similarly-named entity elsewhere.
- [ ] If the mechanism doesn't exist yet: either implement it in the same change, or rewrite the text to describe only what is real (see `.claude/rules/wonder-content.md`'s and `game-balance.md`'s "no per-city/per-route scaling unless implemented" pattern — same principle, applied to prose instead of yields).
- [ ] Add a positive test asserting the claimed effect is real (a discount-multiplier assertion, a modifier-delta assertion, etc.) — do not rely on `description-honesty.test.ts` to validate new text; it only guards against reusing removed phrases.
- [ ] If the text names another entity (a building, unit, or tech), verify that entity's actual gating tech/era matches what the text implies — a tech whose text promises "Concert Hall" when Concert Hall is gated by a much later tech is exactly the MR12 bug class.
- [ ] If you knowingly leave a description that intentionally doesn't map to a mechanic (rare — e.g. a deliberately deferred feature note), say so in a comment near the definition so the next author doesn't "fix" it into a new dead promise, and consider whether it needs a denylist entry so it can never resurface as a real claim.
