# Legendary Wonder City Presence Design

**Issue:** [#217 - Bug: legendary wonder ui off](https://github.com/a1flecke/conquestoria/issues/217)
**Date:** 2026-05-22
**Stage:** 2C - City-First Legendary Presence

## Overview

Stage 2C makes legendary wonders feel like living city projects. Stage 1 made them reachable from the city build flow. Stage 2A gave wonders a shared visual catalog and Atlas foundation. Stage 2B added natural wonder discovery reveal moments. Stage 2C now focuses on legendary construction and completion presence, with the city production surface as the player's primary source of truth.

This stage remains presentation-first. It does not rebalance legendary wonder costs, rewards, eligibility, AI strategy, quest rules, race resolution, or save semantics. It presents existing legendary wonder state more clearly and gives completed legendary wonders a lasting, viewer-safe city presence.

---

## Goals

- Make city production the main living surface for legendary wonder construction.
- Show medallion identity, progress, ETA, construction milestone, race/recovery state, reward teaser, and queue continuity for active legendary wonders.
- Add a short, owner-only legendary completion ceremony.
- Render completed legendary wonders as mini landmarks around the host city.
- Support multiple completed legendary wonders in the same city with deterministic around-city slots.
- Show lost-race recovery clearly so recovered effort and resumed production are understandable.
- Add minimal, safe legendary state labels to the Wonder Atlas without turning Stage 2C into the full Atlas expansion.
- Preserve hot-seat and espionage privacy: no rich rival progress, city, reward, ceremony, or map landmark detail leaks through presentation.
- Keep the city production row compact enough for mobile while making deeper detail reachable through the Wonder Journal.

## Non-Goals

- Stage 2C does not add full Atlas lore, history, filtering, rival record pages, or a legacy archive. That is Stage 2D.
- Stage 2C does not add real video assets. That remains the Stage 3 video spike.
- Stage 2C does not add bespoke final legendary city landmark art beyond the small 2D landmark types needed for this slice. Deeper legendary city landmark variation belongs in Stage 2G; Stage 2E is natural-wonder spectacle only.
- Stage 2C does not change legendary wonder construction, quest, race, global uniqueness, AI, reward, or lost-race mechanics.
- Stage 2C does not persist completion ceremony queues or replay old ceremonies after reload.
- Stage 2C does not reveal rival information beyond existing earned-intel rules.
- Stage 2C does not add a new map input mode, landmark click target, or city-selection priority rule.

---

## Roadmap Placement

Stage 2C is the **City-First Legendary Presence** slice:

- city production identity and progress
- completion ceremony
- completed mini landmarks around the host city
- multiple-wonder city slotting
- minimal Atlas state labels
- lost-race recovery presentation

Deferred work is explicitly assigned:

- **Stage 2D: Full 2D Atlas Expansion** - owned legendary detail pages, completed/lost/underway archive, lore/history pages, richer filters, city-to-Atlas and Atlas-to-city review flows, and expanded 2D browsing surfaces.
- **Stage 2E: Natural Wonder Spectacle Expansion** - live-visible natural-wonder map spectacle, Codex/reveal recipe accents, Codex replay, and required sound mood metadata.
- **Stage 2F: Atlas Intel Records** - explicit viewer-scoped rival-known legendary records and safe known-rival Atlas pages after the intel model stores that knowledge.
- **Stage 2G: Legendary City Landmark Art Expansion** - richer completed legendary city landmark silhouettes, spectacle, variants, and multiple-wonder city readability.
- **Stage 2H: Natural Wonder Audio Stingers** - real natural-wonder stingers or loops that fill Stage 2E sound mood metadata.
- **Stage 3: Real Video Spike** - 3-5 second video or loop experiments, asset-size review, offline/PWA cost review, macOS/Tauri behavior review, and a production recommendation.

---

## Player Experience

When a player starts a legendary wonder, the city production area becomes the first place to understand the project. The active production row should feel distinct from normal units and buildings while still fitting the existing city UI. It shows:

- medallion identity
- human-readable wonder name
- construction progress and ETA
- invested production
- construction milestone copy such as `Foundation laid`, `Rising`, `Final works`, or `Nearly complete`
- quest-complete state when relevant
- coarse race/recovery state
- short reward teaser
- clear copy that the existing production queue resumes after the wonder
- a link or action to open the Wonder Journal for full detail

The city row should use progressive disclosure. The always-visible row shows identity, progress, ETA, milestone, and queue-continuity copy. Secondary details such as full reward text, complete quest history, and longer race explanations stay in the Journal or an expandable city detail area. On narrow screens, the row must stack cleanly without overlapping buttons, progress text, or medallions.

The Wonder Journal remains the deeper support surface. It explains quest steps, requirements, reward, race state, lost-race recovery, and construction status, but the player should not need to open it just to understand what the city is building.

When the owner completes a legendary wonder, they get a short skippable ceremony after production resolution and blocking UI settle. The ceremony confirms the wonder, host city, achievement line, reward summary, and `Reward active` state. The default action is `Continue`; secondary actions can open the host city or the Journal entry.

After completion, the host city gains a completed mini landmark in an around-city slot. If that same city completes more legendary wonders later, each completed wonder gets a stable slot. This makes cities visually transform through long-term accomplishments.

Lost races receive player-friendly recovery framing. The city should say `Effort recovered`, then explain carryover/refund and normal production resumption. Losing should feel like a strategic setback with preserved value, not like silent work deletion.

---

## UI And UX

### City Production States

The city surface should distinguish these visible states:

| State | Required presentation |
| --- | --- |
| `Ready` | Medallion identity, start action, cost/ETA preview, queue continuity copy. |
| `Building` | Progress, ETA, invested production, reward teaser, Journal link, and construction milestone copy. |
| `Building with intel` | Coarse race tension only, such as `Rival activity reported` or `Race at risk`, when existing intel allows it. Do not show exact rival progress unless an existing intel surface already permits that exact detail. |
| `Completed` | Completed badge, `Reward active` copy, production-resumed copy, and map landmark reference. |
| `Recovered` | Lost-race recovery framed as preserved effort, with refund/carryover and production-resumed copy. |
| `Blocked/Near` | Only where Stage 1 already surfaces the wonder, with missing requirement chips. |

Construction milestones are presentation labels derived from the owner's own progress:

- early progress: `Foundation laid`
- middle progress: `Rising`
- late progress: `Final works`
- near completion: `Nearly complete`

Milestone thresholds are deterministic: `Foundation laid` at 0-24% progress, `Rising` at 25-59%, `Final works` at 60-89%, and `Nearly complete` at 90% or higher.

If no earned rival intel exists, the city surface should avoid implying that the race is safe. Use neutral owner-only language such as `Construction underway`.

### Completion Ceremony

The owner-only completion ceremony includes:

- title: `Legendary Wonder Completed`
- wonder name
- host city
- short achievement line
- reward summary
- `Reward active`
- primary `Continue`
- secondary `Open City` or `Open Journal`
- immediate `Skip`
- reduced-motion static version

The ceremony resolves exactly once even if buttons are clicked repeatedly. It must wait until production resolution, movement animation, turn handoff, and other blocking UI are clear. It must not appear on another hot-seat player's screen.

Ceremony eligibility is explicit:

- AI completions never open a ceremony.
- A human completion opens a ceremony only when `state.currentPlayer === civId` and the viewer is in that player's safe viewing moment.
- If a human wonder completes while another hot-seat player is the active viewer, the ceremony waits until the owner is the active viewer or is skipped if the session cannot safely present it.
- Reconstructed save data and final-state scans never create old ceremonies.

### Map And Inspection

Completed landmarks are decorative by default. They must not steal unit, city, tile, movement, attack, or selection input. Host-city selection keeps priority.

City or tile inspection should mention completed legendary wonders when safely visible. Without inspection text, the mini landmark risks becoming decoration without understanding.

Around-city slots support multiple completed wonders:

- render up to 6 landmark positions around a city
- if more than 6 completed wonders exist, render the first 5 plus a `+N` medallion
- low zoom uses simplified silhouettes or compact markers
- reduced motion disables pulsing or animated effects
- landmark drawing must stay within the city visual footprint and must not obscure unit sprites, health bars, city labels, or primary selection affordances

### Atlas

The Wonder Atlas gets minimal safe legendary state labels only:

- `Available`
- `Under construction`
- `Completed`
- `Recovered`
- `Known rival completed`
- `Legendary wonder`

Labels are derived from existing state and viewer-safe helpers. Stage 2C must not add persistent Atlas state or full legendary detail pages.

`Known rival completed` appears only when existing notification, contact, or espionage rules already make that completion known to the viewer. It must not include host city, reward, progress, completion turn, map landmark, or owner detail unless another existing viewer-safe intel helper allows that exact detail.

---

## Privacy And Gameplay Rules

Owner-only rich detail is the default.

The owner may see:

- construction progress
- ETA
- reward summary
- host city
- ceremony
- completed landmarks for their own known/visible cities
- lost-race recovery details

Rivals may see only what existing contact, visibility, or espionage intel already permits. Stage 2C must not add a new global fame reveal. Rival views must not expose raw progress, reward details, host city, completion ceremony, Atlas detail, or map landmarks unless a viewer-safe helper says that detail is earned.

If a rival can see a city on the map but has not earned legendary wonder intel, Stage 2C does not show rich legendary landmark detail for that city. The world can become reactive later through explicit 2D or intel work; 2C prioritizes leakage safety.

Gameplay rules remain unchanged:

- no cost/reward changes
- no eligibility changes
- no quest/race rule changes
- no AI behavior changes
- no save-format change solely for presentation
- existing core systems remain authoritative for mutation

---

## Architecture

Stage 2C extends the existing wonder stack while keeping orchestration, visibility, and rendering boundaries explicit.

### City Presentation

`src/systems/legendary-wonder-presentation.ts` remains the shared city-facing presentation source. It should provide or be extended to provide:

- state labels
- progress
- ETA
- milestone copy
- race/recovery copy
- completed status
- reward summary
- queue metadata
- production-resumed copy where relevant

UI code renders these entries and calls existing mutation helpers. UI eligibility remains guidance, not authority.

Presentation helpers must not mutate the input `GameState`. If they need normalized legendary project data, they may call existing pure helpers that return a cloned or derived state, then return presentation entries from that derived state.

### Visual Catalog

`src/systems/wonder-visual-catalog.ts` gains richer legendary visual metadata:

- medallion identity
- completed-landmark type or shape
- palette tokens
- reduced-motion/static fallback

The catalog stores presentation identity only. It must not duplicate gameplay effects, rewards, requirements, or quest rules.

### Completion Ceremony Presentation

Add `src/systems/legendary-wonder-completion-presentation.ts`.

This helper builds owner-safe ceremony items from `wonder:legendary-completed` events plus safe state. It does not scan final state to invent ceremonies. If the event lacks required source fields, the event should be augmented at the mutation source.

Completion events must carry enough data for ceremonies and notifications:

- `civId`
- `cityId`
- `wonderId`
- `turnCompleted`

The implementation should augment `wonder:legendary-completed` with `turnCompleted` instead of asking the ceremony helper to discover timing by scanning `completedLegendaryWonders`. If the event is emitted before completed state is committed, the event payload is still the ceremony source of truth.

### Completion Queue And Ceremony UI

Add `src/ui/legendary-wonder-completion-queue.ts`.

This module owns:

- completion queueing
- blocking-UI checks
- ceremony sequencing
- repeat-click protection
- post-ceremony actions
- continuation to the next queued ceremony
- hot-seat viewer safety

`main.ts` only subscribes and delegates.

Add `src/ui/legendary-wonder-completion-ceremony.ts` for the skippable owner-only overlay. It should follow the same general interaction discipline as the natural wonder discovery ceremony while using legendary-specific copy and actions.

### Viewer-Safe Map Presentation

Add `src/systems/legendary-wonder-map-presentation.ts`.

This helper returns completed landmark entries visible to `state.currentPlayer`. It must not expose raw rival completed-wonder or project state directly to the renderer.

The renderer receives only ready-to-draw, viewer-safe landmark entries.

Map presentation entries should include only the drawing data the renderer needs: host city coordinate, wonder id, display-safe label or fallback label, visual id/type, completion ordering key, and viewer-safe ownership relationship. They should not include raw project objects, rival city objects, or full completed-wonder records.

### Renderer And Slots

Add `src/renderer/wonders/legendary-wonder-renderer.ts`.

This renderer draws completed legendary landmark entries around the host city. It does not decide visibility, ownership, completion truth, or intel truth.

Add a pure tested slot helper at `src/renderer/wonders/legendary-wonder-slots.ts`.

Slotting rules:

- sort by `turnCompleted`, then `wonderId`
- return stable slot indexes and offsets
- handle 1, 2, 3+, 6, and overflow cases
- support low-zoom simplification
- keep offsets deterministic across reloads and independent of object insertion order

### Atlas Presentation

`src/systems/wonder-atlas-presentation.ts` derives minimal legendary state labels from existing state and viewer-safe helpers. It stores no new Atlas state and does not render full legendary detail pages.

### City Capture And Raze

Completed wonder ownership and reward behavior remain governed by existing core systems.

Map landmark rendering appears only when the viewer can safely know the host city/wonder relationship. If the host city no longer exists, cannot be resolved, or cannot be shown safely, the map landmark is omitted while city, Journal, notification, or Atlas surfaces fall back to safe text.

---

## Data Flow

Construction flow:

1. The player starts construction through existing legendary wonder mutation helpers.
2. Existing city production queue state stores `legendary:<wonderId>` as active production.
3. City UI requests legendary presentation entries.
4. `legendary-wonder-presentation` derives city-safe state, progress, ETA, milestone, race/recovery copy, and queue continuity.
5. City UI renders the active legendary production state and refreshes immediately after actions.

Completion flow:

1. Existing production/race logic completes a legendary wonder and emits `wonder:legendary-completed` with `civId`, `cityId`, `wonderId`, and `turnCompleted`.
2. Existing notifications/logging continue to run.
3. `main.ts` delegates the event to the completion presentation/queue modules.
4. The presentation helper returns `null` unless the event is eligible for a human viewer whose active `state.currentPlayer` matches the event `civId`.
5. The queue waits for blocking UI to clear.
6. The ceremony resolves through `Continue`, `Open City`, `Open Journal`, or `Skip`.
7. The city panel, Atlas labels, and renderer refresh from derived state.

Map flow:

1. The render path asks the viewer-safe map presentation helper for completed landmark entries.
2. The helper returns only entries safe for `state.currentPlayer`.
3. Slot helper assigns stable around-city offsets.
4. Renderer draws simplified or detailed landmarks based on zoom and reduced-motion state.
5. Renderer does not mutate state or decide visibility.

Atlas flow:

1. Atlas requests entries for `state.currentPlayer`.
2. Atlas presentation derives minimal legendary labels from existing state.
3. Legendary entries remain compact and masked except for safe status labels.

---

## Error Handling And Edge Cases

- Unknown legendary wonder ids use safe fallback names/visuals.
- Missing visual metadata uses a safe fallback medallion and static landmark.
- Unknown or unsafe host city omits map landmark rendering.
- Captured or razed host cities do not leak hidden city/wonder relationships.
- Multiple completed wonders in one city use deterministic slots.
- More than 6 visible completed wonders use first 5 plus `+N` overflow.
- Lost-race recovery shows refund/carryover and production-resumed copy.
- Completion ceremonies are not reconstructed after reload.
- Repeat-clicks on ceremony actions resolve only once.
- Reduced-motion users receive static ceremonies and non-animated landmarks.
- Low zoom uses simplified markers or silhouettes.
- Hot-seat ceremonies display only when `state.currentPlayer` matches the completed wonder owner's `civId`.
- Human completion events that cannot be presented safely are dropped rather than shown to the wrong viewer.
- Rival Atlas, map, city, and notification surfaces never expose rich detail unless existing earned-intel rules allow it.

---

## Testing Requirements

### System And Presentation Tests

- City presentation returns correct labels for `Ready`, `Building`, `Completed`, `Recovered`, `Blocked`, and `Near`.
- Construction milestones are deterministic at threshold boundaries.
- ETA/progress/reward/queue metadata render from owned state.
- Lost-race recovery copy includes refund/carryover and production-resumed meaning.
- Completion presentation builds ceremony items from event payloads.
- Completion event typing includes `turnCompleted`, and tests prove ceremony timing comes from the event payload rather than a final-state scan.
- Completion presentation returns `null` for AI events, wrong-viewer events, stale/reconstructed state, missing event source data, and ineligible hot-seat viewers.
- Atlas presentation derives only minimal safe legendary labels.
- Atlas presentation negative tests prove rival progress, city, reward, and completion detail remain hidden without earned intel.
- Map presentation returns only viewer-safe completed landmark entries.

### UI Tests

- City production shows active legendary medallion, progress, ETA, milestone, race/recovery copy, reward teaser, and queue continuity.
- City production remains readable on narrow/mobile layouts without text, buttons, medallions, or progress bars overlapping.
- City production refreshes immediately after starting a legendary wonder.
- Completion/recovery states show production-resumed copy.
- Wonder Journal agrees with city state and remains the full-detail support surface.
- Completion ceremony renders owner-only title, wonder name, host city, reward summary, `Reward active`, `Continue`, secondary action, and `Skip`.
- Ceremony buttons resolve exactly once.
- Secondary ceremony action opens the correct city or Journal entry when the target exists; if the target is unavailable, it resolves like `Continue` and does not break the ceremony.
- Reduced-motion ceremony renders static content.
- Hot-seat tests prove another human player does not see the owner's completion ceremony.
- City or tile inspection mentions completed legendary wonders only when safely visible.

### Renderer And Input Tests

- Slot helper returns stable offsets for 1, 2, 3+, and 6 landmarks.
- Overflow renders first 5 plus `+N` when more than 6 completed wonders are visible.
- Slot sorting uses `turnCompleted`, then `wonderId`.
- Slot order remains stable after reload when completed wonder object insertion order changes.
- Renderer draws completed landmarks from viewer-safe entries only.
- Renderer keeps landmarks from obscuring units, city labels, health bars, and selection affordances.
- Low zoom uses simplified markers or silhouettes.
- Reduced motion disables animated landmark effects.
- Landmarks do not steal unit, city, movement, attack, tile, or selection input.
- Hidden/rival landmarks do not render without earned visibility.

### Regression And Verification

For Stage 2C implementation, run:

```bash
scripts/check-src-rule-violations.sh <changed src files>
./scripts/run-with-mise.sh yarn test --run <mirrored or smallest relevant tests>
./scripts/run-wonder-regressions.sh
./scripts/run-with-mise.sh yarn build
```

Before push, PR creation, or merge, also run:

```bash
./scripts/run-with-mise.sh yarn test
```

---

## Acceptance Criteria

Stage 2C is complete when:

- active legendary construction is clear from the city production surface
- active construction shows identity, progress, ETA, milestone, reward teaser, race/recovery copy, and queue continuity
- completed and recovered states show production-resumed meaning
- completion ceremonies are owner-only, skippable, reduced-motion safe, and hot-seat safe
- completed legendary wonders render as mini landmarks around the host city
- one city can safely display multiple completed legendary wonders through deterministic slots
- overflow beyond 6 visible landmarks is handled by a `+N` marker
- city/tile inspection explains completed landmarks when safely visible
- Atlas legendary entries show only minimal safe state labels
- rivals do not receive rich progress, city, reward, ceremony, Atlas, or map landmark detail without existing earned intel
- no gameplay costs, rewards, eligibility, AI, race rules, or save semantics are changed
- targeted tests, wonder regressions, build, and full tests pass
