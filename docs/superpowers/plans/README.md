# Plan Guardrails

Use this checklist when writing or reviewing implementation plans for interactive UI, queueing, filtered catalogs, recommendation surfaces, or other player-visible derived views.

These sections are not ceremony. They exist to catch the exact failure mode where a feature "works in state" but still lies to the player, fails to refresh, or hides the wrong things.

## Required Plan Sections For Interactive UI

### 1. Player Truth Table

For each player-visible interaction, spell out:

- what the player sees before the action
- what the player clicks/taps
- what state changes internally
- what must visibly change immediately in the open panel or surface
- what must remain reachable

Minimum example:

| Before | Action | Immediate visible result |
|---|---|---|
| City panel shows queue A, B, C | Click `↑` on `C` | Queue rerenders as C, A, B and ETA/order text updates |
| Tech panel shows no active research | Click `Fire` | Current-research summary appears without closing the panel |

### 2. Misleading UI Risks

If the feature introduces a derived label or filtered surface such as `next layer`, `reachable`, `recommended`, `available now`, or `priority`, include a short section listing what would make the UI misleading.

Required questions:

- What must be true for an item to appear in this semantic group?
- What near-miss cases must stay out?
- Which negative tests prove the boundary?

Example:

- `banking` is **not** `next layer` if only one of two prerequisites is currently reachable.
- `Show all` is the fallback surface if the default focused view hides the full catalog.

### 3. Interaction Replay Checklist

Plans for interactive UI must include the replay path the tests will cover.

For queue/reorder work, cover at least:

- add first item
- add second item
- reorder
- remove
- repeat-click after the first mutation
- reopen or rerender behavior

If a second click could target stale DOM, the plan should call that out explicitly.

### 4. Queue And ETA Checklist

If the UI contains a player-visible queue, the plan must state:

- where the active item is shown
- where queued follow-ups are shown
- whether ETA/order text is displayed
- how ETA/order text changes after reorder/remove
- what happens if a queued item later becomes invalid

Do not treat queue array mutation alone as sufficient implementation detail.

### 5. Test Design Requirements

Interactive UI plans must include tests that assert the rendered experience, not just internal state.

Include:

- one test that performs the interaction and inspects the visible DOM/text afterward
- one negative test for any derived semantic helper
- one test proving all actionable items remain reachable when the panel is the only browse/action surface
- one test for queue order/ETA text if queue order matters to the player

## Review Checklist

Before implementation starts, ask:

- Does the plan say what visibly changes after each action?
- Does it identify misleading semantic edge cases?
- Does it prove repeated interactions still target the correct item?
- Does it preserve access to the full catalog when the default view is focused or filtered?
- Does it test what the player sees, not just what state changed?
