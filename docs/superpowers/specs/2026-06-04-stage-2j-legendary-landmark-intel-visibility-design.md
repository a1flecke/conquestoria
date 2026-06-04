# Stage 2J Legendary Landmark Intel Visibility Design

**Date:** 2026-06-04
**Status:** Draft for review
**Related roadmap:** `docs/superpowers/specs/2026-05-21-wonder-atlas-and-map-identity-design.md`
**Builds on:** Stage 2F Atlas Intel Records, Stage 2G Legendary City Landmarks, Stage 2I Bespoke Legendary Landmarks, Stage 2K City Renderer Layer Architecture

## Purpose

Stage 2J lets the player see rival legendary landmarks only when the player has explicitly earned host/location intel. Earlier stages deliberately kept rival legendary completions as safe journal knowledge: the player could know that a rival completed a wonder without knowing where it was built. This stage adds the missing middle tier without weakening those privacy promises.

The selected design is conservative for map and preview visibility. Existing `started` intel may continue to show a rival host city name as plain text because that snapshot already exists. Existing `completed` intel remains completion-only. Neither existing tier can create a rival map landmark, host-city action, or landmark preview by itself. A new explicit `host-location-known` intel tier is required before known-rival landmark surfaces can know where a rival wonder belongs, but completed landmark preview/map rendering also requires completed rival intel for the same wonder and rival. This avoids the misleading and less fun outcome where spying on a started rival project immediately paints it as a finished landmark.

## Goals

- Add a new viewer-scoped `host-location-known` legendary wonder intel tier.
- Render known-rival legendary landmarks only from paired `host-location-known` and `completed` rival records.
- Keep existing `started` intel as text-only host-name knowledge.
- Keep existing `completed` intel from revealing host city, map coordinate, landmark preview, reward, progress, or action targets.
- Preserve hot-seat privacy by reading only `state.legendaryWonderIntel[viewerId]`.
- Extend existing Stage 2G landmark metadata and Stage 2I bespoke rendering rather than creating a rival-only art path.
- Make the map renderer consume the same viewer-safe `LegendaryWonderMapEntry` shape for owned and known-rival landmarks.
- Add negative tests proving partial knowledge is insufficient.

## Non-Goals

- No retroactive migration of old `started` records into map-capable location intel.
- No rival city opening action.
- No rival reward, quest, progress, production, active construction ghost, or project phase detail.
- No new spy mission UI, espionage mission design, or AI strategy.
- No new art assets, audio/SFX, video, service-worker, PWA, Tauri, storage, or platform behavior.
- No change to natural-wonder audio, natural-wonder Atlas behavior, or owned legendary wonder presentation.
- No location inference from live rival city objects, hidden `completedLegendaryWonders`, or hidden `legendaryWonderProjects` during rendering.

## Product Behavior

The player experience has three clear knowledge levels.

`completed` rival intel says only that a rival completed a legendary wonder. The Codex may show `Known rival completed` and a journal row naming the rival and turn. It must not show a host city, coordinate, map button, landmark preview, or reward line.

`started` rival intel says a rival project was spotted. The Codex may show the stored rival city name as text, for example `Rival began Oracle of Delphi in Rival Harbor on turn 41`. This remains a historical spy snapshot. It does not become a map target or landmark preview.

`host-location-known` rival intel says the viewer has explicitly learned the host city/location for a rival legendary wonder. By itself, this tier is host/location knowledge, not completion knowledge. The Codex may show a passive known-host line or event copy, but a compact known-rival landmark preview and known-rival map landmark entry appear only when a completed rival intel record also exists for the same viewer, wonder, and rival. The map marker is informational and decorative. It does not add an action target beyond existing tile/city inspection behavior.

## Player Truth Table

| Situation | Visible behavior | Must not happen |
|---|---|---|
| Viewer has completed rival intel only | Codex shows known-rival completion text | No host city, map marker, landmark preview, reward, progress, or city action |
| Viewer has started rival intel only | Codex event row may name the stored host city as text | No map marker, map action, preview, live city lookup, or coordinate |
| Viewer has host-location-known intel only | Codex can show known host/location as intel text | No landmark preview, map marker, reward, progress, active ghost, quest text, production, or rival city action |
| Viewer has completed plus host-location-known intel | Summary prefers completed status and adds host/location preview as earned location knowledge | Do not infer missing fields from completion record |
| Viewer has own state and rival location intel for same wonder | Owned label and owned actions remain primary; rival location appears as secondary intel | Do not replace owned status or owned city preview |
| Hot-seat current player changes | Rival location marker/preview swaps to new viewer's records only | Do not retain previous viewer's DOM rows or map entries |

## Data Model

Extend `LegendaryWonderIntelKind` with:

```ts
export type LegendaryWonderIntelKind = 'started' | 'completed' | 'host-location-known';
```

Add a new union member:

```ts
export interface LegendaryWonderHostLocationIntelEntry {
  kind: 'host-location-known';
  eventId: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
  source: 'spy-location' | 'map-intel' | 'debug-grant';
}
```

`cityId` is a snapshot identity for deduplication and text only. It must not be emitted as a Codex action target or used to open a rival city. `coord` is the only field that can support map placement, and it is allowed only because this tier explicitly stores location knowledge.

Existing `started` and legacy `intelLevel: 'started'` records remain valid and normalize as they do today. They are not upgraded to `host-location-known` unless a new explicit record exists. Exact duplicate host-location records dedupe by stable `eventId`; distinct started, completed, and host-location records for the same wonder/rival/city may coexist.

## Intel Creation Rules

Stage 2J should add helper functions for constructing and recording host-location intel, and the first implementation should keep earning rules narrow.

Create `host-location-known` intel only in a canonical system path when all of these are true:

- the viewer has earned the location tier through the event source being implemented
- the target wonder ID is a real legendary wonder
- the rival civ is not the viewer
- the host city snapshot includes a city ID, city name, and axial coordinate
- the coordinate is stored as snapshot data on the intel record at creation time

The first implementation grants the location tier from the existing stationed-spy rival-start observation path. That path already identifies the observer, rival civ, target city ID, target city name, and legendary wonder at the canonical moment the start intel is earned. Stage 2J records a separate `host-location-known` event there by snapshotting the host city's current axial coordinate. Existing saves and pre-2J `started` records are not upgraded.

Do not create host-location records from rendering, Codex opening, map scanning, or hidden completed-wonder state. UI may display and route records; it must not mint them.

## Presentation Architecture

Add or extend system presentation helpers rather than duplicating privacy logic in UI.

`src/systems/legendary-wonder-intel.ts` owns normalization, sanitization, dedupe, and construction helpers for the new union member.

`src/systems/legendary-wonder-intel-presentation.ts` owns rival intel summaries. It may expose a safe location view containing `wonderId`, `civName`, `cityName`, `coord`, `learnedTurn`, and copy labels. It must not expose rival `cityId` in page actions.

`src/systems/legendary-wonder-landmark-presentation.ts` should add a known-rival helper that converts paired completion-plus-host-location intel into `LegendaryWonderLandmarkView` or a sibling safe view. It must draw from intel records and static landmark metadata only.

`src/systems/legendary-wonder-map-presentation.ts` should add known-rival map entries by reading explicit host-location records paired with completed rival records, not live rival city data. Known-rival map entries should use `relationship: 'known-rival'`, the stored coordinate, the stored city name for labels, and completed landmark metadata. They must not produce under-construction ghosts.

`src/systems/wonder-codex/presentation.ts` should add known-rival landmark preview data only when the selected page has paired completion-plus-host-location intel. Owned previews stay primary and unchanged.

UI modules render the resulting view models. They should not inspect raw rival projects, completed city IDs, or rival city objects.

## Map And Visibility Contract

Map placement requires an explicit stored coordinate and viewer map knowledge of that coordinate. A known-rival landmark may render when:

- the viewer has a `host-location-known` record for that wonder/rival/city
- the viewer also has a `completed` rival intel record for the same wonder and rival
- the coordinate in the record is at least known to the viewer as `visible` or `fog`
- the coordinate is within the camera's visible screen area

The map renderer must still be passive. It consumes safe entries from `getLegendaryWonderMapEntries(state, viewerId)` and draws the existing landmark medallion path. It must not decide whether the player earned intel.

If a coordinate is currently `unexplored` for the viewer, no map marker renders even if a malformed record exists. If the coordinate is fogged, the marker may render as remembered intel because paired completion-plus-location records are already earned knowledge, but it must not read live rival city state.

## UI And UX

Catalog entries keep one row per legendary wonder. A wonder with rival host/location intel may reuse the existing rival activity badge/count; it should not create a separate map-oriented catalog item.

Codex pages should show:

- owned state and owned landmark preview first, when present
- rival summary and event log next
- a passive known-host line when host-location intel exists before completion
- a compact `Known rival landmark` preview only when paired completion-plus-host-location intel exists
- copy such as `Known host: Rival Harbor` and `Location learned on turn 62`

Codex pages must not show rival `Open City`, `View on Map`, or reward actions in this slice. Any separate design that adds a rival map action must define an explicit action contract with tests.

Territory or tile inspection may list a known-rival legendary landmark when the inspected coordinate matches paired completion-plus-host-location intel for the current viewer. It should render as informational text and compact preview only.

## Privacy And Failure Modes

- Completed intel alone is insufficient.
- Started intel alone is insufficient for map/preview surfaces.
- Host-location intel alone is insufficient for completed landmark preview/map surfaces.
- Hidden live rival city data is never used to fill missing intel fields.
- Viewer A's host-location record never appears for viewer B.
- Malformed records with unknown wonder IDs, missing city names, invalid coordinates, or self-rival civ IDs are sanitized away.
- Unsupported or missing landmark metadata falls back through existing defensive landmark metadata paths, but catalog tests should keep authored definitions valid.

## Testing Requirements

System and intel tests:

- new `host-location-known` entries normalize and sanitize.
- malformed host-location records are removed.
- duplicate host-location event IDs dedupe.
- started and completed records for the same wonder/rival remain distinct from host-location records.
- existing legacy started records do not become map-capable.
- self-rival host-location records are rejected.

Presentation tests:

- completed-only rival intel does not produce host/location landmark preview or map entries.
- started-only rival intel may render city name text but does not produce preview or map entries.
- host-location-known intel alone produces safe known-host text without rival city action targets.
- paired host-location-known plus completed intel produces safe Codex preview data without rival city action targets.
- paired host-location-known plus completed intel produces known-rival map entries only from stored coordinates.
- hidden `completedLegendaryWonders` and rival city objects do not enrich missing host-location records.
- hot-seat viewer switching swaps known-rival previews and map entries by viewer.
- serialized view models do not contain rival `cityId` action targets, progress, quest steps, reward summaries, production, or live project fields.

Renderer and UI tests:

- known-rival map entries draw through the same landmark renderer path as owned completed landmarks.
- known-rival entries do not draw construction ghosts.
- city label, production badge, status badge, and owned landmarks remain ordered according to Stage 2K pass tests.
- Codex/Atlas UI renders the known-rival preview only when the view model contains it.
- inspection text appears only for matching current-viewer location intel.

Verification:

- targeted legendary-wonder intel, map presentation, Codex presentation, renderer, and UI/inspection tests
- `scripts/check-src-rule-violations.sh` for changed `src/` files
- `./scripts/run-wonder-regressions.sh`
- `./scripts/run-with-mise.sh yarn build`
- `./scripts/run-with-mise.sh yarn test`

## Acceptance Criteria

- New host/location intel is represented as an explicit discriminated union member.
- Existing completed intel alone still reveals no host, location, preview, or map marker.
- Existing started intel remains text-only unless a separate host-location record exists.
- Known-rival landmark previews and map entries render only from `host-location-known` records.
- Map entries use stored coordinates and viewer visibility, never hidden live rival city/completion state.
- Owned wonder state stays primary when owned and rival intel coexist.
- Hot-seat privacy tests prove viewer-scoped records do not leak.
- Wonder regressions, build, and full tests pass before merge.
