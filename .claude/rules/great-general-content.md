# Great General Content Rules

How to add or edit **authored** Great General roster content. Grew out of #886,
which added a sourced biography, 2–4 facts, and provenance notes to every entry in
`GENERAL_DEFINITIONS`.

Two separate layers, do not merge them:

| Layer | File | Purpose |
|---|---|---|
| `descriptor` (one line) | `src/systems/great-general-definitions.ts` | Compact chooser / HUD surfaces. Keep it a single sentence. |
| `GeneralProfile` (rich) | `src/systems/great-general-profiles.ts` | Biography, facts, context, source notes. Rendered in one collapsed `<details>` in `src/ui/selected-unit-info.ts` (`summary` + facts + `context` + `From: {loreWork}`; **`sources` never shown**). #887 Hall of Fame is a further planned consumer. Never rendered in a compact/always-visible panel. |

Do **not** move biography prose into `descriptor`, and do not delete the concise
`descriptor` when adding a profile.

Length bounds (enforced by `great-general-profiles.test.ts`): `summary` <= 340
chars, each `fact` <= 200 (one sentence, ends with `.`), `context` <= 320. No
`http(s)://` in any player-facing string. Every `summary` / `fact` / `context`
must be unique across the whole catalog — no copy-paste between Generals.

## Profiles are static, non-mechanical, save-free

- `GeneralProfile` lives only in `great-general-profiles.ts`. It is **not** a
  field on `GeneralDefinition` — that keeps it off `GeneratedGeneralIdentity`
  (#888), so generated officers structurally cannot carry one, and keeps it out
  of every save (`generatedGenerals` is the only persisted General data).
- Nothing in a profile may affect gameplay. No bonuses, traits, cooldowns, unit
  or civ modifiers keyed off profile content. Unique General mechanics are
  **#885's** scope and must stay independent of this data.
- Adding a profile requires **no** save migration and **no** `SAVE_VERSION` bump.
  If that ever stops being true, you are doing it wrong.

## Historical vs lore

Every authored entry is classified in `EXPECTED_KIND` in
`tests/systems/great-general-profiles.test.ts`. A new roster entry fails that test
until it is classified there **and** given a profile.

### `kind: 'historical'` — a real person

- Plain language a 7-to-43-year-old can follow. Clear first sentence. Neutral
  tone: no hero-worship, no demonising, no nationalist framing, no glorifying
  atrocity, no sanitising away major context. No gratuitous gore, no body counts.
- 1 summary (<= ~400 chars), 2–4 facts (one sentence each, <= ~240 chars),
  optional short `context` paragraph.
- **>= 2 authoritative sources.** In rough priority order: national
  museum / archive / historical institution; Encyclopaedia Britannica;
  university / scholarly history project; reputable military-history institution;
  primary-source collection. **Not acceptable as a cited source:** biography
  blogs, SEO history sites, listicles, fandom wikis, social media,
  AI-generated articles. Wikipedia is fine for orientation but must **not** be a
  cited `sourceNote`.
- Verify every concrete claim (a date, a named battle, a rank, a "first",
  a tactic) against a source before writing it. Add or adjust a fact to match
  what the source actually says — do not keep a vivid claim you cannot support.
- Disputed / legendary material: hedge in the fact text itself —
  "later writers credited…", "according to tradition…", "traditionally said…".
  Do not present contested legend as settled fact. Examples already in the file:
  Nebuchadnezzar's Hanging Gardens, Shaka's reforms and sensationalised source
  tradition, Suvorov's undefeated record, Chandragupta's abdication, El Cid as a
  later literary hero.
- Avoid quotes. If one is genuinely essential, keep it very short and verify its
  provenance; never use a recognisable apocryphal quote.

### `kind: 'lore'` — a fictional or legendary figure

- Use only established canon: the source fiction, the civ definition, existing
  authored descriptions, canonical game-world docs. Do **not** invent sweeping
  new canon.
- Set `loreWork` to the source fiction (e.g. `J.R.R. Tolkien, "The Lord of the
  Rings"`). `sources` is normally `[]`. **No fabricated external citations.**
  Where a legendary figure has a real scholarly literature about the legend
  itself (Ragnar Lothbrok), you may cite authoritative sources that discuss the
  legend and its historicity — but the entry stays `kind: 'lore'`.
- Never present lore as real history. Where a book and a famous film adaptation
  differ (Haldir, Oreius), say so.
- The handful of entries original to this game (the Atlantis admiral, the
  `gen_universal_*` fallbacks) have no external work to cite: omit `loreWork`,
  keep `sources: []`, and add the id to `GAME_ORIGINAL_LORE_IDS`. Keep these
  short and honest about being placeholders.

## Roster governance (from #544 §13, still in force)

- **No Nazi figures.** Germany intentionally uses Frederick the Great.
- **Genghis Khan is allowed.**
- **#886 does not add new candidates** — it enriches the existing roster only. A
  materially controversial *new* historical figure needs maintainer review before
  being added. If you think a *current* roster entry is problematic, report it
  separately; do not silently remove or swap it.

## Rendering safety

Profile text is plain data. Any future surface that displays it must use
`textContent` / `createTextNode()` (never `innerHTML`), must not introduce a
markdown parser for General facts, and must not surface raw `sourceUrl`s as
player-facing copy — source notes are provenance for audit.

## Presentation identity: one resolver, original crest art (#889)

A General's *look* is a third layer, separate from `descriptor` and `GeneralProfile`:

| Layer | File | Purpose |
|---|---|---|
| presentation identity | `src/systems/great-general-presentation.ts` (`getGeneralPresentation`, `getGeneralIdentityForUnit`) | Which crest (emblem, field shape, two colours, era pips) a General is drawn with. Pure data derived from the definition, never persisted. |
| crest art | `src/ui/general-portrait-glyphs.ts` + `src/ui/general-portrait.ts` (`createGeneralPortrait`) | Original geometric vector emblems drawn for this game, rendered with `createElementNS` (never `innerHTML`). |

- **Every surface asks the one resolver.** The candidate chooser, the selected-unit panel, the command previews (Rally / Seize / Last
  Stand, incl. the Final Command notice) and the Hall of Fame (view-model `presentation`, then the card) all render
  `getGeneralPresentation(definition)`. Do not read `portraitIcon` for display any more; it survives only as `fallbackIcon`, shown if a
  crest cannot be drawn, and in saves.
- **A new authored General needs one `AUTHORED_CRESTS` row.** `great-general-presentation.test.ts` fails when a roster id has no row, when a
  row is stale, and when two Generals share `(motif, shape, primary colour)`. A new motif is one entry in `GENERAL_GLYPHS`.
- **Generated officers (#888)** take their emblem and colours from their culture family and their era tier from `era`; they never carry an
  authored crest (`source: 'generated'`).
- **Honesty.** These are heraldic crests, not portraits or likenesses, and nothing player-facing or in the docs may call them historical
  imagery or hand-painted art. A real painted portrait set replaces the resolver's output, not the four surfaces.
- **Retirement moment.** `general:retired` carries `generalDefinitionId`; the registrar queues one `GeneralRetirementMomentItem` for the
  *viewing* owner through `CeremonyCoordinator.enqueueGeneralRetirement` (queued behind other ceremonies, deduped, dropped on a hot-seat
  handoff, no-op after victory). The ceremony has no animation and no audio of its own, so reduced motion and mute need no special case.

### Ability moments (#889)

Rally, Seize the Moment and Last Stand are visible moments, not silent state changes. The whole thing is presentation: nothing
here changes a mechanic, a charge, a cooldown or a save.

| Piece | Where | Rule |
|---|---|---|
| What happened | `describeGeneralAbilityMoment(kind, before, after, generalUnitId)` (`src/systems/great-general-ability-presentation.ts`, contract in `src/core/types/general-presentation.ts`) | Derived from the markers the command itself wrote on units (`rallyProtectedThisRound`, `seizeGrantedBy`, `lastStandHold`), so a command that changed nothing is `null` and is never celebrated. Colours come from the one presentation resolver. |
| Announced | `general:command-used` on the bus, emitted by the controller **after** `session.commit` (`selection-commands-general.ts`, `map-pending-intent.ts`) | Only the viewing owner's moment is shown (`register-general-presentation.ts`); a hot-seat handoff drops the map effect (`isPresentationSuppressed`); the toast is own-input feedback. |
| Drawn | `RenderLoop.playGeneralAbility` -> `playEffect` -> `src/renderer/general-ability-effects.ts` | Each ability has its own shape (rally rings and a plus mark, seize rays, last-stand closing ring and hex shield, final command gold double ring). Reduced motion draws one steady ring. The timeline owns time; the drawing reads only `progress`. |
| Held | `drawLastStandHoldMarkers` | A steady outline under every **visible** stack holding a live `lastStandHold`. State-derived (no new data), so it vanishes on expiry or the one survival save. A rival's hold appears only where its units are already visible. |
| Survival save | `general:last-stand-held`, emitted by `applyCombatOutcomeToState` when a bus is given | Every executor, human or AI. The owner is told in words; a rival's save is an effect only where the viewer can see the hex, with no name or text. |
| Heard | `SfxDirector` (`general:command-used`, `general:last-stand-held`, `general:retired`) with `GENERAL_COMMAND_SFX` (`src/audio/sfx-catalog.ts`) | Four cues, one per ability plus one shared by Final Command and retirement (a Final Command plays the final cue *instead of* the ability cue). The command and retirement cues are heard only by the owning seat while it is the viewing seat; the survival save is heard only where the viewer can see the hex. All gating, mute and volume are the existing `canPresentTo` + mixer path; the cues are Kenney CC0 derivatives built by `scripts/generate-general-command-sfx.sh` (`src/audio/general-command-audio-sources.ts`, `AUDIO-CREDITS.md`). Recruitment stays silent on purpose. |

Known gap, deliberate: an AI General's Rally / Seize / Last Stand *activation* has no transient effect, because the AI issues
commands as pure state transitions with no bus. Its Last Stand hold is still drawn (state-derived) and its survival save is
announced. Giving the AI activation a moment means emitting from the AI round with viewer gating; do not copy the human
controller's emit into AI code.

A new ability adds a `GeneralAbilityKind`, its effect in `general-ability-effects.ts` (a distinct shape, plus the static
variant), and a `touchedUnits` row; never a General-ID branch.

### Portrait images (#889)

Some Generals also have a small portrait drawn inside their crest (`src/systems/great-general-portraits.ts`, one catalog row per General,
files in `public/images/generals/`). A General with no row keeps the emblem; generated officers never get a portrait.

- **Sources, and only these.** (a) A **public-domain** artwork on Wikimedia Commons where a good small-size portrait exists (a painting or
  engraving, not a photo of a bust, mosaic or relief). (b) Otherwise an image **generated from an original description** with DeepAI's
  text-to-image tool: imaginary or placeholder commanders, and historical figures whose surviving images are busts, mosaics or stylised
  reliefs that do not read as people at 40 px (Caesar, Alexander, Hannibal, Ramesses, Nebuchadnezzar and others). Never CC BY-SA / NC /
  unknown-licence files (photos of statues and reliefs included), never fan art or film stills. A prompt names no existing character or
  person; for a figure with no authentic portrait it describes a type ("Roman general with a laurel wreath"), and the provenance says no
  likeness is intended. Prompts that fail repeatedly are dropped rather than shipped wrong. The generator is recorded per image: Oreius
  (a centaur the free tool would not draw) was generated by the project owner with ChatGPT image generation on a paid plan, from a
  chest-up prompt, and is shipped as a non-commercial hobby game; if the project ever becomes commercial, re-check that image's terms.
  Every authored General now has a portrait; `great-general-portraits.test.ts` fails if a new one is added without a decision here.
- **Every downloaded image is security-scanned before use**, and only the tool's own re-encode ships. `python3 -I
  scripts/portrait-pixelate/portrait_pixelate.py scan <file>` rejects anything over 8 MB, anything that is not a plain PNG/JPEG by magic
  bytes, decode errors, decompression bombs, animated files and **data appended after the image** (and runs ClamAV when installed);
  `build <spec>` runs that scan first, then crops, softens and palette-limits to 96 px / 64 colours and writes a fresh PNG from decoded
  pixels, which drops EXIF/XMP/ICC and anything hidden. The original is **never committed**; its SHA-256, URL, author, licence, scan
  result and (for generated images) the prompt go in `design/general-portraits/<id>.provenance.json`. Specs live in
  `scripts/portrait-pixelate/specs/`; run with `PORTRAIT_SOURCES_DIR` pointing at the folder of originals.
- **Pinned by `tests/systems/great-general-portraits.test.ts`:** every catalog row has a plain 96x96 PNG under 40 KB with no extra chunks
  and no trailing bytes, a provenance record whose output hash matches the shipped file, public-domain rows cite a Commons file and say
  "Public domain" (never share-alike), generated rows record a prompt that names no existing character, and no file or record exists
  without a catalog row.
- **Honesty.** These are illustrations after historical artworks (many were made long after the person lived) or generated images of
  imaginary people; the provenance says "not a verified likeness" and nothing player-facing may claim a likeness.
- **DeepAI terms were not fully reviewed:** its FAQ says commercial use is permitted and outputs are public domain / user-owned, but its
  terms page could not be retrieved on 2026-10-15. Confirm with DeepAI before release; to replace an image, regenerate and re-run the tool.
