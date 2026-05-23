# Wonder Codex Atlas Expansion Design

**Issue:** [#217 - Bug: legendary wonder ui off](https://github.com/a1flecke/conquestoria/issues/217)  
**Date:** 2026-05-23  
**Stage:** 2D - Full 2D Illustrated Wonder Codex

## Overview

Stage 2D turns the Wonder Atlas into an immersive illustrated codex focused on fun, learning, story, and spectacle. The Atlas should feel like a beautiful in-game reference and memory book, not an optimization dashboard.

This stage covers authored codex content for every current natural and legendary wonder, but player-visible pages remain viewer-safe. Content coverage and page visibility are separate contracts:

- content files must cover every defined natural and legendary wonder
- presentation exposes only discovered natural wonders and viewer-safe legendary wonder pages

Stage 2D does not change wonder placement, yields, legendary construction, questing, race rules, rewards, AI strategy, save semantics, or platform behavior.

## Goals

- Replace the practical Atlas detail area with an immersive illustrated codex overlay launched from the existing Atlas entry point.
- Cover all current natural and legendary wonders with strict authored codex content.
- Use a hybrid content model: authored museum-label text plus structured campaign/status sections derived from viewer-safe state.
- Make desktop/wide screens feel rich by default.
- Make mobile/narrow screens catalog-first, then expandable reader pages.
- Generate related-content links through conventions and tests, not hand-maintained one-off references.
- Keep browser/PWA and macOS/Tauri behavior shared through the same UI and presentation modules.
- Update roadmap and plan files as part of Stage 2D implementation so deferred work is not lost.

## Non-Goals

- Stage 2D does not add rival-known legendary records or a new viewer-scoped rival wonder intel model.
- Stage 2D does not add richer bespoke landmark art beyond existing visual catalog use. That remains Stage 2E.
- Stage 2D does not add real 3-5 second videos. That remains Stage 3.
- Stage 2D does not reveal undiscovered natural wonders.
- Stage 2D does not reveal rival city, progress, reward, completion, or legendary project details.
- Stage 2D does not create browser-only or macOS-only UX paths.

## Roadmap Placement

Stage 2D is the **Full 2D Illustrated Wonder Codex** slice:

- immersive codex overlay
- strict content coverage for all current natural and legendary wonders
- authored museum-label content
- viewer-safe status sections
- responsive desktop/mobile presentation
- convention-driven related links
- roadmap updates for deferred work

Deferred work must be recorded in the relevant roadmap/spec/plan files during implementation:

- **Stage 2E: Landmark Art Expansion** - richer bespoke landmark silhouettes, variants, and per-wonder map/codex art depth.
- **Stage 2F: Atlas Intel Records** - explicit viewer-scoped rival-known legendary records, including safe `known rival started/completed` pages after the intel model stores that knowledge.
- **Stage 3: Real Video Spike** - 3-5 second video or loop experiments, asset-size review, offline/PWA review, macOS/Tauri review, and production recommendation.

## Player Experience

The player opens the existing Wonder Atlas control and enters a codex overlay. The overlay is for browsing, learning, and enjoying the world. It may include actions such as `View on Map` or `Open City`, but those are supporting links, not the main purpose.

The codex page style is **museum label**: clear, evocative, and educational. It should explain what the wonder is, why it matters, and how it fits the player’s campaign without reading like a strategy guide.

Each visible page includes:

- large 2D visual area using existing wonder visual identity
- title and subtitle
- authored lead paragraph
- learning/story text
- viewer-safe status section
- natural wonder effect or legendary reward summary from authoritative gameplay definitions
- location or host-city links only when viewer-safe
- related wonders generated from shared conventions

Desktop/wide screens open into a rich reader by default. Mobile/narrow screens open catalog-first, then transition to a reader page after the player selects a wonder. Mobile reader pages show core story/status first and expose secondary detail through expandable sections.

## Visibility Contract

Strict content coverage does not mean every page is visible to every player.

Natural wonder rules:

- every natural wonder definition must have codex content
- discovered natural wonders produce visible codex pages for the discovering viewer
- undiscovered natural wonders remain absent
- undiscovered natural wonders must not appear as silhouettes, disabled cards, count leaks, or placeholder pages

Legendary wonder rules:

- every legendary wonder definition must have codex content
- owned ready/building/completed/recovered legendary wonders may produce visible pages from viewer-safe owner state
- masked legendary aspirations may remain visible as category entries only if they do not imply false availability or reveal hidden state
- rival-known legendary records are deferred to Stage 2F
- raw rival projects, cities, rewards, progress, completion turns, and host-city relationships must not appear in Stage 2D codex view models

## First Selection Rules

Desktop/wide mode:

- if opened with `initialWonderId` and that wonder is visible to the viewer, select it
- otherwise select the first visible entry by stable catalog sort
- if no entries are visible, show a codex empty state

Mobile/narrow mode:

- if opened with `initialWonderId` and that wonder is visible to the viewer, open directly to its reader page
- otherwise open catalog-first
- if no entries are visible, show a catalog empty state

Stable catalog sort must be deterministic across reloads and independent of object insertion order.

## Architecture

Stage 2D adds a separated codex package under `src/systems/wonder-codex/`.

### Content And Types

`src/systems/wonder-codex/types.ts` defines:

- strict codex content types
- allowed tag unions
- visual tone values
- required section kinds
- status hook contracts
- related-content seed tags

`src/systems/wonder-codex/natural-content.ts` contains authored codex content for all natural wonders.

`src/systems/wonder-codex/legendary-content.ts` contains authored codex content for all legendary wonders.

`src/systems/wonder-codex/content.ts` aggregates content, exports lookup helpers, and provides complete lists for tests and presentation.

Codex content is presentation-only. Gameplay definitions remain authoritative for yields, effects, rewards, requirements, construction, questing, and placement.

### Required Content Fields

Every codex entry must include:

- `id`
- `kind`
- `title`
- `subtitle`
- `authoredLead`
- `learningText`
- `visualTone`
- `tags`
- `sections`
- `statusHooks`
- `relatedSeedTags`

No generated fallback is allowed for missing authored content. Tests must fail if a new wonder definition lacks a complete codex entry.

### Related Content

`src/systems/wonder-codex/related.ts` derives related entries from conventions:

- shared tags
- wonder kind
- era or broad chronology when available
- terrain/city/building/reward themes where encoded as tags
- visual tone

Related links must be deterministic, valid, and exclude the current wonder. Manual overrides are out of scope unless a later spec proves they are needed.

### Presentation Boundary

`src/systems/wonder-codex/presentation.ts` is the privacy boundary. It builds `WonderCodexViewModel` objects from:

- `GameState`
- natural wonder definitions
- legendary wonder definitions
- codex content
- visual catalog
- viewer-safe discovery, project, completion, and city state
- related-content helper output

UI modules consume only view models. UI must not inspect raw `completedLegendaryWonders`, `legendaryWonderProjects`, rival civilizations, hidden map tiles, or live rival city objects.

### UI Modules

`src/ui/wonder-codex-panel.ts` owns:

- immersive overlay shell
- desktop catalog drawer plus reader layout
- mobile catalog-first flow
- selected wonder state
- responsive mode option for deterministic tests
- close behavior and secondary action wiring

`src/ui/wonder-codex-page.ts` owns render-only reader page content:

- illustration area
- title/subtitle
- authored lead
- learning text
- status/effect/reward sections
- expandable sections on mobile
- related links
- safe actions

The existing `createWonderAtlasPanel` remains the public entry point and delegates to the codex shell. Stage 2D must not maintain an old Atlas implementation and a separate new Codex implementation that can drift apart.

### Platform Parity

Browser/PWA and macOS/Tauri use the same system and UI modules. Stage 2D must not directly import Tauri APIs or branch on macOS/Tauri globals. If a platform capability is needed later, it must enter through the existing platform layer.

## Data Flow

1. Player opens the existing Atlas entry point.
2. `createWonderAtlasPanel` delegates to the codex overlay.
3. Codex UI requests a `WonderCodexViewModel` for `state.currentPlayer`.
4. Presentation derives visible catalog entries and optional selected page from viewer-safe state.
5. Desktop renders catalog drawer and rich selected page.
6. Mobile renders catalog-first unless a safe deep link selects a page.
7. Selecting a catalog entry rebuilds or updates the selected page model.
8. `View on Map` and `Open City` actions are emitted through callbacks without mutating gameplay state inside codex UI.

## Player Truth Table

| Before | Action | State change | Immediate visible result | Must remain reachable |
| --- | --- | --- | --- | --- |
| Desktop Atlas opens with visible entries | Open Atlas | None | Rich reader selects `initialWonderId` or first stable visible entry | Catalog drawer, close, visible related entries |
| Mobile Atlas opens without deep link | Open Atlas | None | Catalog list appears first | Every visible catalog item |
| Mobile catalog shows entries | Tap an entry | UI selection only | Reader page opens with core story and expandable sections | Back/catalog action |
| Reader page has related links | Tap related wonder | UI selection only | Reader updates to related page if visible | Previous catalog and close |
| Discovered natural wonder page | Tap `View on Map` | None in gameplay state | Callback receives safe coord/id and panel can close or remain per UI wiring | Atlas can reopen |
| Owned legendary page with host city | Tap `Open City` | None in codex UI | Callback receives safe city id | Atlas entry point remains usable |

## Misleading UI Risks

- `Visible page` must mean viewer-safe, not merely present in authored content.
- `Available` must mean buildable according to city/legendary presentation, not just a raw project phase.
- `Related` must mean conventionally related through valid tags, not arbitrary neighboring data.
- `Completed` must not be shown for rival wonders until Stage 2F adds explicit viewer-scoped intel.
- `All wonders covered` must mean content coverage, not visible page count.

Negative tests must prove near misses stay out of each semantic group.

## Error Handling And Edge Cases

- Missing codex content is a test failure, not a runtime fallback.
- Missing visual catalog metadata may use existing safe visual fallback, but content coverage tests should still require codex content.
- Unknown wonder IDs in codex content are test failures.
- Duplicate codex IDs are test failures.
- Empty or placeholder text is a test failure.
- If no visible entries exist, the codex shows an empty state without leaking hidden counts.
- If `initialWonderId` is not visible to the viewer, the codex falls back to stable first visible entry or empty state.
- If a related entry is not visible to the viewer, it does not render as an actionable link.
- If a host city is missing or unsafe, no city action is rendered.

## Testing Requirements

### System Contract Tests

Add `tests/systems/wonder-codex/content.test.ts`:

- natural wonder definition IDs exactly match natural codex content IDs
- legendary wonder definition IDs exactly match legendary codex content IDs
- every codex entry has all required authored fields
- no duplicate IDs
- no unknown IDs
- no empty strings
- no placeholder text such as `TODO`, `TBD`, `lorem`, or `placeholder`
- every entry has required tags from typed allowed unions
- every entry declares required section metadata
- every entry has status hooks required by its wonder kind

Add `tests/systems/wonder-codex/related.test.ts`:

- related IDs always resolve to existing codex entries
- related IDs never include self
- related output is deterministic
- related output does not depend on object insertion order
- tag conventions produce valid related entries where compatible entries exist
- adding a new tag requires updating allowed unions and related-link tests

### Presentation And Privacy Tests

Add `tests/systems/wonder-codex/presentation.test.ts`:

- discovered natural wonders produce visible codex pages
- undiscovered natural wonders remain absent
- natural content coverage does not leak undiscovered natural pages
- owned legendary ready/building/completed/recovered pages expose only owner-safe status
- rival legendary completion/project data remains hidden in Stage 2D
- `initialWonderId` selection follows desktop and mobile rules
- view models contain render-safe data, not raw project or completion objects
- invisible related entries are omitted from actionable related links

### UI Tests

Add `tests/ui/wonder-codex-panel.test.ts`:

- existing `createWonderAtlasPanel` opens or delegates to the codex shell
- every visible catalog item is reachable
- selecting any visible item updates the reader
- desktop/wide mode renders rich default sections
- mobile/narrow mode starts catalog-first without deep link
- mobile/narrow mode opens reader directly with a safe deep link
- mobile expandable sections reveal secondary detail
- no visible entry is silently hidden behind filters without a reachable catalog route

Add `tests/ui/wonder-codex-page.test.ts`:

- renders authored lead and learning text
- renders status/effect/reward from view model
- renders related links only from valid visible related entries
- does not render rival-hidden city, progress, reward, completion, or host detail
- repeat selection updates visible text without stale DOM

### Regression Rules

- Rendered UI contracts require rendered UI tests.
- New wonder definitions must fail tests until codex content is complete.
- New codex tags must fail tests until allowed unions and related conventions are updated.
- Responsive behavior must be tested through explicit mode or width options.
- Existing Atlas tests must be updated to protect the old public entry point.
- Roadmap/spec/plan updates for deferred Stage 2E, Stage 2F, and Stage 3 work are required in the implementation branch.

## Acceptance Criteria

Stage 2D is complete when:

- the existing Atlas entry point opens the immersive codex overlay
- all current natural wonders have strict codex content
- all current legendary wonders have strict codex content
- discovered natural wonders render visible codex pages
- undiscovered natural wonders remain hidden
- owned legendary wonder states render safe codex pages where appropriate
- rival-known legendary records remain deferred and do not leak
- desktop renders a rich illustrated reader by default
- mobile opens catalog-first unless safely deep-linked
- mobile reader sections are expandable
- related links are convention-driven, valid, deterministic, and viewer-safe
- browser/PWA and macOS/Tauri share the same code path
- deferred roadmap items are documented in relevant plan/spec files
- targeted system/UI tests, build, and full tests pass
