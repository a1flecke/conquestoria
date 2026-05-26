---
name: mr-b-wonders-ui-design
description: Design spec for MR-B fixing #278 (legendary wonders UI) and #281 (wonder popup inaccurate + data leak)
metadata:
  type: project
---

# MR-B — Wonders UI Data Safety & Redesign

**Issues:** #278, #281
**Depends on:** MR-A, MR-C (no shared files, but ship last for clean sequencing)
**Followed by:** nothing

## Problem Statement

Two overlapping problems in the Wonders feature:

1. **#281 — Data leak:** The Wonder Codex (`wonder-codex/presentation.ts`) shows ALL legendary wonders to ALL players by mapping `getLegendaryWonderDefinitions()` with no discovery gate. Natural wonders correctly use `isNaturalVisible`; legendary wonders have no equivalent. Players see the full roster including wonders they have never encountered.

2. **#281 — Broken notification contract:** The `wonder:legendary-ready` notification says "Open [City]'s Build list… Start Construction" but doesn't deep-link to that city. Players who open a different city's panel see nothing actionable. The notification is accurate but unnavigable.

3. **#278 — UI design debt:** The Legendary Wonders panel (`wonder-codex-panel.ts` / `wonder-codex-page.ts`) has no coherent information hierarchy: no clear primary CTA, dense quest step lists, styling inconsistent with the rest of the game.

---

## Fix 1 — Legendary wonder visibility gate

### New helper (`src/systems/legendary-wonder-intel.ts`)

```ts
export function isLegendaryWonderVisibleToPlayer(
  state: GameState,
  viewerId: string,
  wonderId: string,
): boolean
```

Returns `true` if any of:
- Player has a project for this wonder with `phase !== 'locked'` (i.e., `questing`, `ready_to_build`, `building`, `completed`, `lost_race`)
- Player has rival intel for this wonder (`state.legendaryWonderProjects` contains an entry with `ownerId !== viewerId` that the player has observed via spy or `wonder:legendary-race-revealed` event — check `getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId).has(wonderId)`)

The `locked` phase is a system-seeded placeholder — it exists before the player has any knowledge of the wonder and must remain hidden.

### Usage (`src/systems/wonder-codex/presentation.ts`)

In `visibleCatalogEntries`, replace the unconditional map:

```ts
// Before
const legendaryEntries = getLegendaryWonderDefinitions().map(definition => { ... });

// After
const legendaryEntries = getLegendaryWonderDefinitions()
  .filter(definition => isLegendaryWonderVisibleToPlayer(state, viewerId, definition.id))
  .map(definition => { ... });
```

### Empty state

If `legendaryEntries` is empty after filtering, the codex catalog renders a static inline message instead of the entry list:

```html
<p style="opacity:0.5;font-size:12px;padding:8px;">
  No legendary wonders discovered yet — complete quests and explore to uncover them.
</p>
```

This avoids polluting the `WonderCodexCatalogEntry` type with a synthetic placeholder. The check lives in the catalog render loop in `wonder-codex-panel.ts`.

---

## Fix 2 — Navigable wonder notification

### Type change (`src/ui/notification-log.ts`)

Add an optional navigation hint to `NotificationEntry`:

```ts
export interface NotificationEntry {
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
  linkedCityId?: string;  // NEW — if set, clicking navigates to this city panel
}
```

### Notification emit site (`src/ui/legendary-wonder-notifications.ts`)

In the `wonder:legendary-ready` case, include `linkedCityId`:

```ts
return {
  message: `${city.name} can start ${wonder?.name ?? event.wonderId}. Tap to open that city.`,
  type: 'info',
  turn: state.turn,
  linkedCityId: event.cityId,
};
```

### Notification log handler (`src/main.ts` or notification-routing.ts)

When the player taps a notification entry with `linkedCityId`, dispatch to the existing city panel open callback for that city ID. The notification log UI needs an `onClick` handler per entry — add `data-linked-city-id` attribute to the notification row DOM element and handle it in the log's click delegation.

---

## Fix 3 — Wonder codex UI redesign (#278)

The target component is `src/ui/wonder-codex-page.ts` (the detail page for a selected wonder) and `src/ui/wonder-codex-panel.ts` (the catalog sidebar).

### Design principles

1. **One primary CTA per card.** If `canStartBuild: true`, the "Start Construction" button uses `createGameButton('primary')`. All other states show no primary button (or a disabled ghost).
2. **Quest steps — compact inline, not collapsed.** Show quest steps as a small checklist (12px, 0.7 opacity) below the status line. Don't hide behind a collapsible — the steps ARE the gameplay content. Reduce visual noise by removing borders around individual steps.
3. **Status badge instead of status line.** Replace the multi-line state description with a single colored badge: `🔍 Questing`, `✅ Ready`, `🏗️ Building`, `🏆 Completed`, `❌ Lost Race`. Badge colors match the game's existing palette (gold for ready, green for completed, red for lost).
4. **Consistent card style.** Each wonder entry in the catalog sidebar uses `background: rgba(255,255,255,0.05); border-radius: 6px; padding: 8px` — matching the city panel's building list style.
5. **Rival intel badge.** If `rivalIntelCount > 0`, show a small amber badge `👁 N rivals building` below the wonder name in the catalog. Already computed as `rivalIntelBadgeLabel`.

### Specific changes

- `wonder-codex-page.ts`: Replace freeform status section with badge + compact quest checklist + conditional primary CTA.
- `wonder-codex-panel.ts`: Catalog sidebar entries use consistent card style with rival intel badge.
- `wonder-panel.ts`: This file handles the in-map wonder popup (on clicking a wonder tile). Verify it uses `createGameButton` — if any bare `<button>` elements exist, replace them per `ui-panels.md` rules.

### No changes to

- Wonder discovery ceremony, completion ceremony, or vignette files — those are separate presentation flows.
- The underlying data model — this is purely a rendering change.

---

## Tests

1. **Visibility gate — locked phase hidden:**
   - Setup state with a project in `locked` phase; assert `isLegendaryWonderVisibleToPlayer` returns false.
   - Transition to `questing`; assert returns true.

2. **Visibility gate — rival intel makes visible:**
   - No player project; rival intel entry exists for wonder; assert returns true.

3. **Codex catalog — undiscovered wonders absent:**
   - `visibleCatalogEntries` with no visible legendary wonders → catalog contains placeholder entry, not real wonder entries.

4. **Codex catalog — discovered wonder appears:**
   - Player project in `questing` phase → that wonder appears in catalog entries.

5. **Notification `linkedCityId` set on `wonder:legendary-ready`:**
   - Assert `getLegendaryWonderNotification` for `wonder:legendary-ready` event returns entry with `linkedCityId === event.cityId`.

6. **UI redesign — primary CTA only when `canStartBuild`:**
   - Render wonder codex page with `canStartBuild: false` → no primary button in DOM.
   - Render with `canStartBuild: true` → one primary button with label "Start Construction".
