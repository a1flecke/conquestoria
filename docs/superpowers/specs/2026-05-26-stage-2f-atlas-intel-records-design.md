# Stage 2F: Atlas Intel Records Design

Date: 2026-05-26

## Context

Stage 2D made the Wonder Atlas/Codex the browsing surface for natural and legendary wonders. Stage 2E added natural-wonder spectacle and replay. Stage 2F adds explicit viewer-scoped rival legendary wonder records so the Atlas can become a safe memory of wonder intel the player has earned.

Existing code already has `legendaryWonderIntel` for spy-observed rival starts. That ledger is viewer-scoped, but its current `intelLevel: 'started'` shape is too narrow and current cleanup removes entries when the live project stops building. Stage 2F must preserve intel as historical memory and must not enrich rival Atlas pages from hidden live rival state.

## Goals

- Show safe rival legendary wonder intel in the Atlas/Codex when the current viewer has earned it.
- Keep one catalog entry per legendary wonder, with a scanable known-rival-activity badge/count when records exist.
- Render a current-best rival intel summary and compact explicit event log on the wonder page.
- Add known rival completion records for human viewers who know the completing rival.
- Preserve started rival intel historically after live projects stop building, are lost, are abandoned, or are sanitized.
- Keep all rival detail viewer-scoped so hot-seat players never see another player's intel.
- Establish a discriminated union that can accept future tiers such as host-known, progress-known, reward-known, or map-location-known without weakening privacy.

## Non-Goals

- No rival map navigation, city-open action, or "center last known area" action.
- No reward summary from rival completion intel alone.
- No exact rival progress bars, invested production, quest steps, or live phase details.
- No legendary city landmark art changes; that remains Stage 2G.
- No audio or video work; those remain Stage 2H and Stage 3.
- No AI-facing Atlas memory unless a future AI system explicitly needs it.

## Product Behavior

The Atlas/Codex remains one entry per legendary wonder. If the current viewer has rival intel for that wonder, the catalog entry shows a small known-rival-activity badge/count such as `Known rival activity` or `2 records`.

Owned state has display priority. If the viewer has their own available, building, completed, or recovered state for a legendary wonder, the catalog state label keeps that owned label and rival intel appears only as a secondary badge/section. If the viewer has no owned state for that wonder, the state label summarizes explicit rival intel:

- `Known rival completed` when the viewer has completed rival intel
- `Spotted rival project` when the viewer has only started rival intel
- `Legendary wonder` when the viewer has no owned state and no rival intel

The page shows owner-only status first for the viewer's own projects and completions, then a rival intel area when explicit records exist. The rival area reads like a compact journal, not a command center:

- current-best rival summary first
- compact event log sorted by turn
- no rival buttons or actions
- no map jump, city open, reward reveal, progress bar, or quest checklist

Suggested copy:

- `Spotted rival project`
- `Last known: under construction`
- `Known rival completed`
- `Learned on turn 58`

If the player has started and completed intel for the same rival and wonder, completion is the best-known summary while the event log still includes the earlier start. If multiple rivals are known for the same wonder, each rival appears as a separate compact row under that wonder page.

Started intel can show the owner and host city name stored in the earned spy snapshot. It must not enable map navigation or read the live city. If that project later leaves active state and no later explicit outcome is known, the Atlas preserves it as historical intel with `Last known: under construction`.

Completed rival intel from contact shows only wonder, owner, and completion turn by default. It does not show host city, reward summary, progress, quest history, map coordinate, or action target unless a future explicit tier stores that exact detail.

## Data Model

`legendaryWonderIntel` remains the single persistent source for rival Atlas knowledge:

```ts
legendaryWonderIntel?: Record<string, LegendaryWonderIntelEntry[]>;
```

`LegendaryWonderIntelEntry` becomes a discriminated union. Each union member contains only the fields that tier may reveal.

Required Stage 2F entries:

- `kind: 'started'`
  - stable event identity based on project key plus reveal turn
  - viewer-safe spy snapshot
  - stores project key, wonder ID, rival civ ID/name, host city ID/name, revealed turn
  - displays owner and city name from the snapshot
  - treats city ID as internal snapshot identity only; it must not create a rival city action or map target
  - never displays live progress, quest steps, reward, or map action
- `kind: 'completed'`
  - stable event identity based on wonder ID, rival civ ID, and completion turn
  - known/contacted rival completion record
  - stores wonder ID, rival civ ID/name, completion turn, and learned turn
  - does not store city ID, city name, reward summary, progress, quest steps, map coordinate, or action target

Existing `intelLevel: 'started'` save records must remain compatible. They may be normalized to the new `kind: 'started'` shape while preserving the same snapshot fields and deriving the stable event identity from `projectKey` and `revealedTurn`. The normalization path must not require a live project to exist.

Future tiers should be added as new union members rather than optional fields on a loose shared object. Candidate future tiers include:

- `host-known`
- `progress-known`
- `reward-known`
- `map-location-known`

Each future tier must define exactly which fields are allowed, how it is earned, and negative tests proving disallowed fields remain hidden.

## Architecture

The Atlas/Codex presentation layer must not inspect hidden rival state to enrich rival records. It may use:

- `state.legendaryWonderIntel[viewerId]`
- owned projects and completions for `viewerId`
- public definition/content data needed to name the wonder, render existing catalog art, and show educational/history content already available for that legendary wonder

It must not use these sources for rival details unless the exact detail is already present in the viewer's explicit intel record:

- rival `legendaryWonderProjects`
- rival city objects
- rival completed city IDs
- rival production progress
- rival quest steps
- rival gameplay reward summaries or effect details
- another viewer's `legendaryWonderIntel`

Add or update a systems/presentation helper that folds the current viewer's explicit records into:

- per-wonder catalog badge/count
- current-best safe status label
- safe status lines
- compact event log rows

The helper must expose rival city names only as plain text from started snapshots. It must not expose rival city IDs, map coordinates, action targets, or callable action data in Atlas/Codex page view models.

UI DOM code should render this view model and should not duplicate privacy logic. This keeps leakage tests close to the presentation helper and makes future tiers easier to add.

Owner-only Atlas/Codex behavior stays separate. The viewer's own projects and completions can still show richer labels, rewards, and owned city actions through existing safe owned-state paths.

## Intel Creation Rules

Started intel:

- Created when an observer has earned spy-based rival start knowledge.
- Keeps existing owner and host city snapshot behavior.
- Stored under the observer/viewer civ ID.
- Historical record survives after the live project stops building.

Completed intel:

- Created in canonical legendary-wonder system/helper code when a rival completes a legendary wonder.
- Recorded for human viewers who pass `shouldListMajorCivForViewer(state, viewerId, completingCivId)`.
- Not recorded for viewers who do not know the completing rival.
- Not recorded as rival intel for the completing civ.
- Stores only wonder ID, rival civ ID/name, completion turn, and learned turn.
- AI viewers do not need records unless a future player-facing or AI-facing system requires them.

The UI must not create persistent intel records while rendering notifications or pages. Event listeners may display notifications, but persistent intel belongs in the canonical gameplay/system path.

## Cleanup And Compatibility

Stage 2F must change the current cleanup behavior. Intel cleanup may remove malformed entries, unknown wonder IDs, and exact duplicate records for the same explicit event, but it must not remove valid historical records just because no live project is currently building.

Valid started records remain valid when:

- the rival loses the race
- the rival abandons or stops building
- another civ completes the same wonder
- project seeding/sanitization removes the live project
- the game is saved and loaded later

Deduplication must preserve one coherent timeline. Exact duplicate records with the same stable event identity collapse to one record. Distinct started and completed events for the same wonder/rival must both remain, so the page can summarize the completed state while still showing the earlier spotted-start event.

## Hot-Seat Privacy

All rival records are stored under the viewer civ ID. A hot-seat player sees only records under their own civ ID.

Human player A's started or completed intel must never appear in human player B's Atlas unless B earned or was granted a separate record. Current-player refresh must swap the visible badge/count, summary, event log, and page status without retaining the previous player's DOM state.

## UI/UX Details

Catalog:

- keep one legendary catalog item per wonder
- show a small badge/count only when the current viewer has rival records for that wonder
- do not create separate catalog items per rival record
- keep owned state labels visually primary; rival badges are secondary

Page:

- show the viewer's own status lines first
- show rival intel as a compact journal section beneath owned/current status
- group multiple rival records for the same wonder on the same page
- sort event rows by learned/revealed/completion turn, then by rival name for deterministic rendering
- show no rival action buttons in Stage 2F

The rival section should feel like "what my people have learned" rather than "what I can exploit right now." It is story, memory, and situational awareness, not gameplay efficiency.

### Player Truth Table

| Situation | Visible Atlas/Codex behavior | Must not happen |
|---|---|---|
| Viewer has no owned state and no rival intel | Legendary entry remains `Legendary wonder`; no rival badge or journal section | Do not infer from hidden rival projects or completions |
| Viewer has started rival intel only | Entry shows secondary known-rival badge and a `Spotted rival project` / `Last known: under construction` journal row | Do not show progress, quest steps, reward, map action, or live phase |
| Viewer has completed rival intel only | Entry can show `Known rival completed`; journal row names the rival and completion turn | Do not show host city, reward, map action, or completed city ID |
| Viewer has both started and completed intel for the same rival/wonder | Summary prefers completion; event log shows both the start and completion events in turn order | Do not delete the start event or duplicate rows for the same event identity |
| Viewer has own wonder state and rival intel for the same wonder | Owned label remains primary; rival intel is secondary badge/section | Do not replace owned `Available`, `Under construction`, `Completed`, or `Recovered` with rival status |
| Hot-seat current player changes | Badge/count, summary, and event log rerender from the new `currentPlayer` only | Do not leave previous player's rival rows in the DOM or view model |

## Testing Requirements

Core/system tests:

- started intel survives after a project leaves `building`, is lost, or is sanitized.
- completed rival intel is recorded for human viewers who know the completing rival.
- completed rival intel is not recorded for humans who do not know the completing rival.
- completed rival intel is not recorded for the completing civ as rival intel.
- hot-seat viewers receive separate records when they independently qualify.

Presentation tests:

- Atlas/Codex show started rival intel from explicit records.
- Atlas/Codex show completed rival intel from explicit records.
- owned state labels take priority over rival status labels when both exist.
- Atlas/Codex do not infer rival completion from `completedLegendaryWonders` alone.
- Atlas/Codex do not infer rival progress, city, reward, quest text, or action targets from `legendaryWonderProjects`.
- serialized view models do not contain hidden rival city IDs, progress values, quest text, gameplay reward summaries, action targets, or another viewer's intel.
- started intel may render the snapshot city name as text while still omitting the internal city ID from the page action model and rendered rival controls.
- legacy `intelLevel: 'started'` records render safely after normalization.

UI tests:

- catalog badge/count appears only for the current viewer's rival intel.
- selected page renders current-best summary and event log.
- no rival map/city action is rendered.
- current-player refresh swaps visible intel in hot-seat.
- completed-only rival intel does not render a reward summary, host city, or city action.

Persistence tests:

- new discriminated intel records round-trip through JSON/save shape.
- legacy started records remain compatible or are normalized safely.
- duplicate records with the same stable event identity dedupe without removing distinct started and completed events.

Required verification for implementation:

- targeted legendary wonder system tests
- targeted Atlas/Codex presentation tests
- relevant UI panel tests
- `scripts/check-src-rule-violations.sh` for changed `src/` files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

## Acceptance Criteria

- A viewer with explicit started intel sees a known-rival badge and a safe started journal row for that wonder.
- A viewer with explicit completed intel sees a known-rival badge and a safe completed journal row for that wonder.
- A viewer without explicit rival intel sees no rival badge, rival summary, or rival event row even if hidden live rival projects or completions exist.
- Completed rival intel from contact records only owner and turn-level completion knowledge by default.
- Started rival intel remains available as historical memory after project cleanup.
- Owned status labels remain primary when owned state and rival intel both exist.
- Hot-seat player switching cannot leak one human player's rival records to another human player.
- The new data model is a discriminated union that can be extended by future intel tiers without changing existing privacy guarantees.
