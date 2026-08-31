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

## Great General Rich Profiles (#886)

`GENERAL_PROFILES` in `src/systems/great-general-profiles.ts` carries the
educational `summary` / `facts` / `context` / `sources` content merged onto
`GENERAL_DEFINITIONS`. `tests/systems/great-general-profiles.test.ts` is the
structural guardrail (every roster id has a profile; length bounds; 2–4 facts;
`https` + parseable + unique source URLs; no duplicate summary/fact across two
Generals; generated officers carry none). It cannot judge whether a *new*
historical claim is accurate — that stays a human research step.

When adding or editing a General profile:

- [ ] **Provenance is explicit.** Every authored entry sets `provenance`:
      `'historical'` (real person), `'legendary'` (saga/tradition figure whose
      existence is debated), `'lore'` (fictional character from a named
      external setting), or `'archetype'` (the nation-neutral universal
      fallback pool). `historical`/`legendary` → `GeneralHistoricalProfile`;
      `lore`/`archetype` → `GeneralLoreProfile`.
- [ ] **Historical facts are sourced.** Prefer museums / national historical
      institutions, then Encyclopaedia Britannica, then university/scholarly
      projects. Avoid SEO history sites, fandom pages, listicles, and
      AI-generated articles. Wikipedia is orientation only, not a cited
      substantive source. Put the real supporting URL in a `GeneralSourceNote`
      (`https`), and record in its `notes` exactly which claims it backs.
- [ ] **Disputed = hedged.** Legend, later tradition, contested attributions,
      and unreliable ancient casualty/number claims are worded as such
      ("later accounts credit…", "traditionally linked to…"), never as settled
      fact.
- [ ] **Neutral tone, age 7–43.** Clear first sentence; no worshipful or
      demonising language, no nationalist framing, no gratuitous gore, no
      jargon without context. Do not sanitise away major context (e.g. the
      civilian toll of a massacre) and do not turn a profile into a
      controversy essay.
- [ ] **Fiction is not history.** `lore`/`archetype` entries draw only from the
      named `setting` and carry no external `sources`. Never present invented
      material as real history.
- [ ] **Generated officers stay fact-free.** #888 `GeneratedGeneralIdentity`
      records get no profile — the resolver returns them with
      `historicalProfile`/`loreProfile` absent, by design.
- [ ] **Content is non-mechanical.** A profile grants no gameplay effect;
      #885 owns unique General mechanics, #887 owns dynamic campaign history.
      Keep `summary` short (it renders in the compact selected-unit panel);
      `facts` / `context` / `sources` are inert typed data for a future detail
      surface.
- [ ] **No new roster members here.** #886 enriches the existing roster only.
      A materially controversial new candidate needs maintainer review
      (contract §13: no Nazi roster; Genghis Khan allowed).
