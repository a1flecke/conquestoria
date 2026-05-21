# Wonder Discovery Reveal Design

**Issue:** [#217 - Bug: legendary wonder ui off](https://github.com/a1flecke/conquestoria/issues/217)
**Date:** 2026-05-21
**Stage:** 2B - Discovery Reveal Moments

## Overview

Stage 2A gave wonders persistent identity through the Wonder Atlas, natural wonder medallions/vignettes, masked legendary slots, tile-integrated map landmarks, and map-to-Atlas deep links. Stage 2B adds the missing moment of discovery: when a human-controlled civilization finds a natural wonder for the first time, the game briefly celebrates it with a skippable full-screen ceremony, then anchors the discovery back to the world map.

This stage remains presentation-only. It does not change natural wonder placement, discovery rules, rewards, yields, AI behavior, save format, or legendary wonder construction.

---

## Goals

- Make natural wonder discovery feel like a major moment, not only a toast notification.
- Reuse Stage 2A visual identity: medallions, vignettes, visual catalog metadata, and Atlas integration.
- Play a full cinematic medallion-style ceremony for each human-controlled civ's first discovery of a natural wonder.
- Queue multiple discovery ceremonies one at a time.
- Let players skip the ceremony immediately.
- Finish every ceremony with a map tile pulse/highlight at the discovered coordinate.
- Preserve `Continue` as the primary/default action and provide `Open Atlas` as a secondary action.
- Respect reduced-motion settings with a static reveal card and instant map highlight.
- Keep AI discoveries and other-player discoveries from leaking through the ceremony layer.

## Non-Goals

- Stage 2B does not add real video assets. The API may be video-ready, but implementation uses CSS/SVG/game UI animation.
- Stage 2B does not add sound. Later work may add age-specific wonder discovery stings through an explicit audio hook.
- Stage 2B does not add full Atlas history/lore pages.
- Stage 2B does not change discovery bonuses or wonder effects.
- Stage 2B does not persist reveal queue state across reloads.
- Stage 2B does not add legendary wonder construction or completion ceremonies. That remains Stage 2C.

---

## Player Experience

When a human-controlled civ discovers a natural wonder for the first time, the game waits until the triggering action settles. Movement, visibility refresh, combat resolution, or other immediate action feedback must finish first. Then the reveal ceremony appears.

The ceremony uses a full-screen overlay with a darkened game backdrop. It opens with a cinematic medallion/vignette animation using the Stage 2A wonder visual identity. The player sees:

- title: `Natural Wonder Discovered`
- wonder name
- short flavor/reveal line
- effect summary
- discovery reward summary
- primary `Continue`
- secondary `Open Atlas`
- immediate `Skip` affordance

The reveal lasts about 3-5 seconds if the player lets it play. `Skip` resolves it immediately. `Continue` is the default action after the reveal has landed. `Open Atlas` is optional and opens the Wonder Atlas directly to the discovered wonder entry after the ceremony resolves.

Whether the player continues, skips, or opens the Atlas, the discovery should first anchor back to the world with a pulse/highlight at the discovered map tile. The pulse uses the actual event coordinate and existing map/camera systems. It does not select units, change city focus, alter ownership, mutate tile state, or change gameplay rules.

If multiple natural wonders are discovered in one action, ceremonies queue and play one at a time. The player can skip each ceremony individually.

In reduced-motion mode, the ceremony shows the same text and actions in a static reveal card. It uses an instant map highlight instead of animated medallion bloom or map pulse.

---

## Rules And Eligibility

Reveal eligibility is player-scoped:

- A reveal fires for each human-controlled civ the first time that civ discovers a natural wonder.
- A reveal does not require the wonder to be the first-ever world discovery.
- A reveal must not fire for AI discoveries.
- A reveal must not fire for another human civ unless that civ is the active viewer when its discovery event is being handled.
- A reveal must not fire from reconstructed save data, Atlas browsing, map deep-linking, or last-seen rendering.

The reveal item is derived from the discovery event and existing safe data:

- `wonder:discovered` event payload, including `civId`, `wonderId`, `position`, and `isFirstDiscoverer`
- current `GameState`
- existing natural wonder definitions
- Stage 2A `wonder-visual-catalog`
- optional `revealLine` metadata with the wonder description as fallback
- discovery reward summary from the natural wonder definition

The reveal must use the event `position` for the map pulse/highlight. It must not search hidden live map state to determine location or reveal terrain, ownership, units, cities, rival activity, or other hidden details.

The reveal queue is UI/session state only. If the player closes or reloads after discovery but before seeing a reveal, Stage 2B does not reconstruct old ceremonies from save state. This avoids replaying stale reveals and avoids adding save-format surface area.

---

## Architecture

Stage 2B adds a reveal layer on top of the existing discovery event path.

### Reveal Presentation Helper

Add a focused helper. The default module path is:

```text
src/systems/wonder-discovery-reveal.ts
```

Responsibilities:

- Convert eligible `wonder:discovered` events into viewer-safe reveal items.
- Use `wonder-visual-catalog` metadata for medallion/vignette identity.
- Use optional reveal-line metadata and fallback to the existing wonder description.
- Format effect and discovery reward summaries for display.
- Return `null` for AI discoveries, wrong-viewer discoveries, unknown wonder ids, or ineligible events.

This helper does not mutate state, grant rewards, emit events, or decide discovery truth.

Example reveal item shape:

```ts
interface WonderDiscoveryRevealItem {
  wonderId: string;
  civId: string;
  coord: HexCoord;
  name: string;
  title: 'Natural Wonder Discovered';
  revealLine: string;
  effectSummary: string;
  rewardSummary: string;
  visual: WonderVisualDefinition;
  motionAssetId: string | null;
}
```

`motionAssetId` is a future video-ready hook. Stage 2B sets it to `null` or a stable non-video id; no real video loading is required.

### Ceremony Overlay

Add a DOM UI module. The default module path is:

```text
src/ui/wonder-discovery-ceremony.ts
```

Responsibilities:

- Render the full-screen ceremony overlay.
- Use DOM-safe text APIs for all game-generated names/descriptions.
- Play the CSS/SVG/game UI medallion reveal when reduced motion is off.
- Render a static card when reduced motion is on.
- Expose `Continue`, `Open Atlas`, and `Skip`.
- Resolve exactly once, even if buttons are clicked repeatedly.
- Temporarily block underlying map input while visible.

The overlay must not directly mutate game state. It reports the selected resolution action to the coordinator.

### Reveal Queue Coordinator

Add a small queue module or main-level coordinator. The default module path is:

```text
src/ui/wonder-discovery-queue.ts
```

or an equivalent focused helper if the implementation can keep it isolated.

Responsibilities:

- Receive reveal items from the `wonder:discovered` listener.
- Queue multiple reveal items in event order.
- Wait until the triggering action has settled and no blocking UI should take precedence.
- Play one ceremony at a time.
- After each ceremony resolves, request a map pulse/highlight.
- If the player chose `Open Atlas`, open the Atlas to that wonder after the pulse/highlight request.
- Continue to the next queued reveal.

The queue must not stack overlays on top of city panels, combat previews, turn handoff screens, or other blocking UI. If another blocking UI is active, it waits until the UI is clear.

### Map Pulse / Highlight

Add a short render/highlight path using existing renderer/camera systems. This may extend the existing render highlight model or add a focused visual effect helper.

Responsibilities:

- Pulse/highlight the event coordinate after the ceremony resolves.
- Use Stage 2A wonder visual identity where practical.
- Respect reduced motion by showing an instant static highlight.
- Never change selected unit, movement range, city panel state, ownership, or tile state.

### Audio Hook

Stage 2B has no sound requirement. The design leaves an explicit hook for later age-specific wonder discovery stings, for example a callback/event name such as `wonderDiscoveryRevealStarted`. The hook must not play new audio in 2B.

---

## Data Flow

1. `processWonderDiscovery` mutates existing discovery state and emits `wonder:discovered`.
2. The existing `wonder:discovered` listener keeps current notification/log behavior.
3. The listener or nearby coordinator asks `wonder-discovery-reveal` to build a reveal item.
4. The helper returns `null` unless the event is eligible for the active human viewer.
5. Eligible reveal items are enqueued.
6. After the triggering action settles and blocking UI is clear, the queue opens `wonder-discovery-ceremony`.
7. Player waits, clicks `Continue`, clicks `Skip`, or clicks `Open Atlas`.
8. Ceremony resolves exactly once.
9. Coordinator requests map pulse/highlight at the event coordinate.
10. If `Open Atlas` was chosen, the Wonder Atlas opens directly to the discovered wonder entry.
11. Queue advances to the next reveal item.

---

## UI And UX Details

The ceremony should feel like the world briefly pauses to acknowledge discovery. It is intentionally more dramatic than a notification, but it must remain respectful of player flow.

Required overlay behavior:

- darkened game backdrop
- centered medallion/vignette
- `Natural Wonder Discovered` title
- wonder name as the main headline
- flavor/reveal line
- compact effect summary
- compact discovery reward summary
- primary `Continue`
- secondary `Open Atlas`
- immediate `Skip`
- keyboard-friendly close path through `Escape` or the same skip/continue behavior if existing UI patterns support it

Button behavior:

- `Continue` resolves the ceremony, then requests map pulse/highlight.
- `Skip` resolves immediately and still requests map pulse/highlight.
- `Open Atlas` resolves the ceremony, requests map pulse/highlight, then opens the Atlas entry.
- Repeat-clicks after the first resolution do nothing.

Reduced motion:

- no medallion bloom
- no animated map pulse
- same title, name, flavor, effect, reward, and actions
- instant map highlight still occurs

Blocking behavior:

- While the overlay is visible, map input is blocked.
- If another blocking UI is already active, the reveal waits rather than stacking.
- Closing/reopening unrelated panels must not replay an already resolved ceremony.

---

## Error Handling And Edge Cases

- Unknown natural wonder ids do not crash; they return `null` or a safe fallback reveal only if display can remain truthful.
- Missing visual metadata uses the Stage 2A fallback visual.
- Missing reveal line uses the wonder definition description.
- Missing event coordinate prevents the ceremony from being enqueued; Stage 2B does not scan hidden map state to recover it.
- If the Atlas cannot open, `Open Atlas` falls back to the same resolution as `Continue`.
- If the map pulse target is no longer renderable, the ceremony still resolves and no gameplay state changes.
- Multiple discoveries queue in event order and do not overlap.
- Reduced-motion mode must not rely on timers or animation completion to make the UI usable.

---

## Testing Requirements

### System / Presentation Tests

Add tests for the reveal helper:

- human-controlled active viewer discovery returns a reveal item
- AI discovery returns `null`
- wrong active viewer returns `null`
- same natural wonder discovered by two human civs can produce separate reveal items for each civ on its own turn
- reveal item uses event coordinate
- reveal item does not expose live hidden tile details
- reveal item includes name, reveal line or description fallback, effect summary, reward summary, and visual metadata
- unknown wonder id is handled safely
- `motionAssetId` exists as a future hook but does not require real video

### UI Tests

Add tests for the ceremony overlay:

- overlay renders title, wonder name, flavor, effect, reward, `Continue`, `Open Atlas`, and `Skip`
- `Continue` resolves once and requests map pulse/highlight
- `Skip` resolves once and requests map pulse/highlight
- `Open Atlas` resolves once, requests map pulse/highlight, and calls the Atlas callback
- repeat-clicking actions does not double-resolve
- reduced-motion rendering uses static mode
- dynamic text is inserted safely through DOM APIs

### Queue / Integration Tests

Add tests for the reveal queue/coordinator:

- multiple reveal items play one at a time in order
- no second overlay appears until the first resolves
- queue waits while blocking UI is active
- queue resumes after blocking UI clears
- AI discoveries do not enqueue
- existing notification/log behavior still occurs for `wonder:discovered`
- no gameplay state changes occur from showing or resolving the ceremony

### Renderer / Highlight Tests

Add tests for map pulse/highlight behavior:

- resolving a ceremony requests a pulse/highlight at the event coordinate
- reduced motion requests an instant static highlight
- pulse/highlight does not mutate selected unit, movement range, ownership, tile data, or city state
- missing/non-renderable coordinate resolves safely

### Required Checks

For Stage 2B implementation, run:

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

Stage 2B is complete when:

- discovering a natural wonder as a human-controlled active player shows a full discovery ceremony after the triggering action settles
- the ceremony is skippable immediately
- `Continue` is the primary/default action
- `Open Atlas` is available as a secondary action and opens the discovered wonder entry
- every ceremony resolves into a map pulse/highlight at the event coordinate
- multiple discoveries queue one at a time
- reduced-motion users receive a static reveal card and instant map highlight
- AI discoveries and other-player discoveries do not leak through ceremonies
- existing discovery rewards, notifications, logs, Atlas visibility, map landmarks, and discovery rules continue to work
- no save-format changes are required
- targeted tests, wonder regressions, build, and full test suite pass

---

## Later Roadmap Preservation

- **Stage 2C:** legendary construction and completion presence remains separate.
- **Stage 2D:** full 2D Atlas expansion remains separate.
- **Stage 3:** real video support remains a spike. Stage 2B leaves a video-ready metadata hook but must not ship video assets.
- **Deferred audio:** age-specific wonder discovery stings should be considered in a later audio pass. Stage 2B preserves a hook but does not implement sound.
