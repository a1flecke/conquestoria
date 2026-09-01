# #886 — Rich Great General biographies and facts (design)

Deferred from #544 §33.E. Enriches the **existing** authored Great General roster
with concise, sourced educational content. No new roster members, no new
mechanics, no new UI.

## Goals

For each authored historical General, answer in plain language a 7–43-year-old can
follow: who was this person, why are they remembered, 2–4 interesting facts, and
what context helps. For authored fantasy/lore Generals, give a lore-consistent
profile that is unmistakably not presented as real history.

## Non-goals

- No new General candidates (this is enrichment only; controversial *new*
  candidates would need maintainer review per #544 §13).
- No gameplay mechanics tied to profile content (#885 owns unique mechanics).
- No campaign chronicle / Hall of Fame (#887).
- No portraits / audio / visual effects (#889).
- No new biography screen or modal. The rich content is surfaced only through
  **one collapsed `<details>` block** added to the *existing* selected-unit panel
  (`src/ui/selected-unit-info.ts`), directly mirroring that file's existing
  "Role details" `<details>` pattern — no new panel, no layout change, no visual
  tuning. This is the minimal wiring `.claude/rules/end-to-end-wiring.md`
  requires (a helper with no consumer is a bug); everything richer (a dedicated
  detail surface, campaign chronicle) is left to #887.

## Data model

New static module `src/systems/great-general-profiles.ts`. **Not** a field on
`GeneralDefinition` — keeping the identity interface untouched means:

- `GeneratedGeneralIdentity` (from #888) structurally cannot carry a profile, so
  the "generated officers stay fact-free" guarantee is free and permanent.
- Zero save-shape impact: `generatedGenerals` is the only persisted General data,
  its `isValidGeneratedGeneral` validator ignores unknown keys, and authored
  entries are looked up by id — profiles never touch a save.
- Editorial content and mechanical identity stay decoupled (#885 / #887 can
  evolve independently).

```ts
export interface GeneralSourceNote {
  title: string;        // non-empty
  publisher: string;    // non-empty; the authoritative body
  sourceUrl: string;    // https, parseable
  accessed: string;     // YYYY-MM-DD
}

export interface GeneralProfile {
  kind: 'historical' | 'lore';
  summary: string;              // 1–3 sentences, clear first sentence
  facts: string[];              // 2–4 items, one plain sentence each
  context?: string;             // optional short paragraph
  sources: GeneralSourceNote[]; // historical: >= 2; lore: may be []
  loreWork?: string;            // lore only; names the source fiction. Absent
                                // for the explicitly game-original entries.
}

export function getGeneralProfile(generalId: string | undefined): GeneralProfile | undefined;
```

`GENERAL_PROFILES` is typed `Record<string, GeneralProfile | undefined>` so the
resolver's `undefined` branch is type-checked, not just true by luck.

Shape mirrors the repo's existing `WonderCodexFactSource` (`title` / `publisher` /
`sourceUrl`), plus `accessed` because these are living web references.

Length bounds (enforced by the test): summary <= 340 chars, each fact <= 200,
`context` <= 320.

The short `descriptor` on `GeneralDefinition` is unchanged — it stays the
compact chooser one-liner. Profiles are the richer layer surfaced in the
selected-unit `<details>` (below) and reusable by #887.

## UI integration (minimal, existing surface only)

`src/ui/selected-unit-info.ts` already renders a Great General's
`portraitIcon` / `name` / `era` / `descriptor` when one is selected, and already
uses a collapsed `<details>` ("Role details") elsewhere in the same function.
This PR adds one more collapsed `<details>` right after the descriptor line:

- `<summary>` = `Who was {name}?` (historical) / `About {name}` (lore).
- body = `summary`, then each `fact` as a `• ` row, then `context`, then a
  `From: {loreWork}` line for lore entries.
- `sources` are **never rendered** — provenance for audit only.
- All text via `textContent` (XSS-safe per `ui-panels.md`). No markdown parser.
- Collapsed by default: no forced reading for younger players, no compact-panel
  overflow, opt-in depth for history-minded players.
- Generated officers (#888) have no profile, so `getGeneralProfile` returns
  `undefined` and the whole block is skipped — no `<details>`, behaviour
  unchanged.
- No difficulty / play-style / AI branching: it is display of the selected
  unit's own General, identical in solo and hot-seat, and AI never reads it.

## Roster classification (34 authored entries)

- **Historical (18):** ramesses, caesar, alexander, genghis (allowed per §13),
  nebuchadnezzar, cyrus, chandragupta, hannibal, yuefei, shaka, wellington,
  napoleon, frederick (chosen over a WWII figure by §13), suvorov, mehmed,
  cuauhtemoc, tokugawa, elcid (real person, legend-embellished — profile
  separates record from legend).
- **Lore (16):** ragnar (reclassified — legendary/literary, historicity
  unproven; `loreWork` = Norse saga tradition, plus 2 sources documenting the
  legend and the historicity debate), boromir, eomer, merry, ugluk, gwydion,
  hornedking, okoye, lancelot, haldir, oreius, thessaly (game-original), and the
  4 `gen_universal_*` generics (game-original).

`thessaly` and the 4 universal generics have `loreWork` absent (game-original)
and `sources: []` — the completeness test permits this for that explicit set
only.

## Source policy

Authoritative only: national museums/archives, Encyclopaedia Britannica,
university/scholarly history projects, reputable military-history institutions,
primary-source collections. Wikipedia for orientation only, never a cited source.
Each historical profile carries >= 2 sources. Source notes are provenance, not
player-facing copy.

## Disputed claims

Hedged in the fact text itself, e.g. Nebuchadnezzar's Hanging Gardens ("later
writers credited him... no archaeological trace"), Shaka's reforms and
sensationalised source tradition, Suvorov's "never lost a battle" tradition,
Chandragupta's Jain-tradition abdication, El Cid as a later literary hero,
Ragnar's non-existence as a single person.

## Tests (`tests/systems/great-general-profiles.test.ts`)

Catalog-derived, so a new authored roster entry fails loudly until content is
added:

- Every authored General id has a `getGeneralProfile` entry; no stray keys;
  `EXPECTED_KIND` covers exactly the roster; `kind` matches it.
- summary non-empty, no control chars, no double-spaces, no `http(s)://`,
  length <= 340, starts with a capital.
- 2–4 facts; each non-empty, trimmed, no control chars, no `http(s)://`,
  ends with `.`, length <= 200.
- `context` (when present) same cleanliness checks, length <= 320.
- historical → `sources.length >= 2`, `loreWork` absent.
- lore → `loreWork` present, OR id in `GAME_ORIGINAL_LORE_IDS` (which then also
  requires `sources: []`).
- every `sourceUrl` parses via `new URL()`, is `https:`, unique within a
  profile; every source `title` / `publisher` non-empty; `accessed` a valid
  `YYYY-MM-DD`.
- **whole-catalog** (not just historical) uniqueness: no two profiles share a
  summary, a fact string, or a context string.
- generated identities resolve with no profile; `getGeneralProfile` on a
  `generated:` id / `undefined` / `''` / unknown id returns `undefined`.
- `resolveGeneralDefinition` behaviour unchanged (re-asserted).
- **no file under `src/ai` or `src/storage`, and not `turn-manager.ts`,
  references the profiles module** (AI/#888 Phase 22 + no save coupling), and
  `getGeneralProfile` **has at least one real `src/` consumer** (dead-code
  guard).

`tests/ui/selected-unit-info.test.ts` adds: historical General renders a
`<details>` with the `Who was …?` summary, summary text, and a fact, and no
`http`; lore General renders the `From: {loreWork}` line and no `http`;
generated officer renders name + descriptor but **no** biography `<details>`.

## Docs

New `.claude/rules/great-general-content.md`: historical-vs-lore policy, source
bar, length guidance, generated officers stay fact-free, profiles are
non-mechanical, no new historical figure without design approval.
