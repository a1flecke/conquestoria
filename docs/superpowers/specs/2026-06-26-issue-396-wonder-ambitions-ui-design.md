# Issue #396 Wonder Ambitions UI Design

Status: selected design for review. No implementation has been done in this branch.

Issue: <https://github.com/a1flecke/conquestoria/issues/396>

Selected direction: **Option A hybrid** — guided cards as the primary surface, lightweight quest timeline/checklist from Option B, and compact all-ambitions reachability from Option C.

Visual reference:

![Guided cards mockup](assets/issue-396-wonder-ambitions-option-a-guided-cards.svg)

## Goal

Redesign the Wonder Ambitions panel so it tells the player what to do next, why it matters, and what is blocking each ambition without reading like an unstyled rules dump.

The new screen must:

- match the visual language of newer panels: cards, chips, icons, gold CTAs, and touch-sized actions;
- preserve every selected-city wonder project, including near and blocked ambitions, so the panel remains a complete catalog;
- distinguish ready, questing, building, completed, recovered, near, and blocked states at a glance;
- make quest progress visually scannable;
- explain construction race pressure and recovery without a glossary-style intro;
- keep hot-seat and viewer-scoped rival intel private.

## UX shape

The panel opens with a compact header:

- title: `🏛️ Legendary Wonders`;
- selected civilization and city;
- top close button using `createGameButton('Close', 'ghost')`.

Below the header is a “Best move right now” guidance strip when at least one recommended entry exists. It summarizes the highest-priority recommended wonder in one sentence. If that entry can start construction, the strip includes a duplicate primary CTA using the same `entry.canStartBuild` and `entry.startActionLabel` contract as the card and calls `onStartBuild(cityId, entry.wonderId)`. If the entry cannot start construction, the strip must show next-step copy only and must not render a dead or disabled primary CTA. This strip is guidance only; it must not be the only action surface.

The main content keeps the existing sections, but changes their presentation:

1. `Best fits right now`
   - Up to three recommended entries.
   - The membership and order come from the existing presentation order; UI code must not invent a second recommendation algorithm.
   - Full cards with stronger visual treatment.
   - Each card contains status chip, reward, quest checklist, race snapshot, missing requirements, and CTA when available.
2. `All ambitions in this city`
   - Every non-recommended selected-city entry remains reachable.
   - Cards use a compact layout, but must still show status, reward, quest count, missing requirements or next-step copy, and detail copy.
3. `In progress elsewhere`
   - Viewer-scoped rival intel cards remain separate.
   - Show only the safe intel already returned by `getLegendaryWonderIntelForViewer`.

The global “Eligibility / Quest / Construction Race” glossary blocks must be removed or collapsed into contextual copy on cards. The screen must teach through the current entries, not through abstract rules.

## Card contract

Each project card must have stable DOM markers so tests can assert the visible contract:

- `data-project-card="<wonderId>"` remains.
- `data-recommended-project="true"` remains for recommended cards.
- `data-wonder-status-chip="<visibleState>"` on the state chip.
- `data-wonder-best-fit-chip="<wonderId>"` on the `Best fit` chip for recommended cards.
- `data-wonder-quest-list="<wonderId>"` on the quest checklist container.
- `data-wonder-quest-step="<completed|pending>"` on each quest row.
- `data-wonder-reward-summary="<wonderId>"` on the reward row.
- `data-wonder-race-summary="<wonderId>"` on the race/recovery row.
- `data-wonder-start-build="<wonderId>"` on the primary CTA when present.
- `data-wonder-guidance="<wonderId>"` on the guidance strip when rendered.
- `data-wonder-guidance-start-build="<wonderId>"` on the guidance-strip CTA when `entry.canStartBuild` is true.

Recommended cards use a gold accent border and a `Best fit` chip. Non-recommended cards use subtler borders but still have clear state chips.

Status chip styling:

- `ready`: green/gold positive chip, label `Ready to build`.
- `questing`: amber chip, label `Quest in progress`.
- `building`: blue/gold chip, label `Under construction`.
- `completed`: green chip, label `Completed`.
- `recovered`: muted amber chip, label `Race lost`.
- `near`: neutral chip, label `Available soon`.
- `blocked`: red/muted chip, label `Blocked`.

Quest rows use icon-led labels:

- completed: `✓`;
- pending: `○`;

The first implementation uses only completed versus pending quest rows. It must not invent a per-step “blocked” state in UI code unless the presentation layer later exposes that semantic directly.

## Data flow and architecture

Keep gameplay and recommendation semantics in the existing presentation layer:

- `getLegendaryWonderPresentationForCity(state, state.currentPlayer, cityId)` remains the source for project entries.
- `entry.visibleState`, `entry.canStartBuild`, `entry.startActionLabel`, `entry.questSteps`, `entry.missingRequirements`, `entry.rewardSummary`, and race/recovery labels drive rendering.
- `getLegendaryWonderIntelForViewer(state, state.currentPlayer)` remains the only source for rival intel.

The UI must add small rendering helpers inside `src/ui/wonder-panel.ts`. If the resulting file becomes hard to scan, move those helpers into a tightly scoped sibling module in the same implementation PR:

- `appendStatusChip(parent, entry)`;
- `appendQuestChecklist(parent, entry)`;
- `appendRewardRow(parent, entry)`;
- `appendRaceSummary(parent, entry)`;
- `appendGuidanceStrip(panel, recommendedEntry, callbacks, cityId)`;
- `appendProjectCard(...)`.

These helpers must only render presentation data. They must not recompute eligibility, recommendation ranking, rival intel visibility, or gameplay state.

Buttons must use `createGameButton`. Dynamic text must use `textContent` or `createTextNode`; do not introduce `innerHTML` with game-generated strings. Styling can stay inline to match current panel patterns, but repeated chip/card style strings must be held in small local constants so the visual system is consistent and the file does not devolve into one-off CSS fragments.

## Player truth table

| Before | Player action | Internal state path | Immediate visible result |
| --- | --- | --- | --- |
| A ready recommended wonder appears in the guidance strip and card | Click guidance-strip `Start Construction` | Calls `onStartBuild(cityId, wonderId)` with the selected city | Live caller must close or rerender the Wonder Ambitions panel so the open surface no longer shows the same wonder as startable. Existing queued production continuity copy remains visible before the click. |
| A ready recommended wonder appears in its card | Click card `Start Construction` | Calls `onStartBuild(cityId, wonderId)` with the selected city | Same visible refresh contract as the guidance CTA; the callback must not silently target another city. |
| A questing or near wonder is shown | Read card / no start action available | No mutation | Card shows quest count, pending quest rows, missing requirements or next-step copy, and no primary start CTA. |
| A lower-ranked ambition is outside the recommended set | Scroll to `All ambitions in this city` | No mutation | The ambition remains visible exactly once with status, reward, quest count, and missing/next-step copy. |
| Rival wonder intel exists for the current viewer | Open panel | Reads viewer-scoped intel only | Rival section shows safe started-intel cards; another hot-seat player without intel sees no leaked rival card. |

## Misleading UI risks

- `Best fits right now` is a recommendation surface, not a complete catalog. Tests must prove lower-ranked entries remain visible in `All ambitions in this city`.
- `Best move right now` must not imply buildability unless `entry.canStartBuild` is true. A recommended-but-questing or recommended-but-near entry gets next-step copy, not a start button.
- `Available soon` and `Blocked` are presentation states from `entry.visibleState`; UI code must not relabel them by rechecking techs, resources, city terrain, or quest prose.
- Quest rows show only completed versus pending. The design intentionally does not claim per-step blocked semantics.
- Rival intel must never render from live rival project objects; it only renders the viewer-safe entries returned by `getLegendaryWonderIntelForViewer`.

## Mobile and accessibility expectations

The panel remains full-screen and scrollable. Cards must stack in one column on narrow widths. Any internal row/grid treatment must degrade to stacked rows without horizontal overflow.

Touch targets must stay at least 44px tall by using `createGameButton`. Status chips are informational and not clickable. Color is never the only signal: each chip also has explicit text and quest rows have icons plus text. Emoji and icons are decorative aids; every icon-led row also needs text that explains the same meaning.

The focus order must remain simple: top close, guidance CTA if present, card CTAs in visual order, bottom close. The panel must not introduce keyboard traps or scroll-only hidden actions.

## Error and empty states

If there are no selected-city entries, preserve the existing empty-state message but style it as a card with a short explanation:

- no known ambitions in this city;
- continue exploring, researching, or meeting conditions.

If a city or civilization lookup is missing, the panel renders the fallback IDs and must not crash.

If a ready wonder has no `startActionLabel`, render it as informational only and do not create a button.

If the highest recommended entry has missing presentation data, render the card from the available fields and skip only the missing optional row. Do not hide the whole card unless the entry itself is invalid.

## Testing requirements

Update `tests/ui/wonder-panel.test.ts` or add a mirrored helper test to prove:

- state chips render for ready, questing, building, completed, recovered, near, and blocked states using fixture states; if a state cannot be produced through existing game-state factories, extract a narrow render helper and test that helper with fabricated presentation entries;
- quest checklist rows differentiate completed and pending steps visually and semantically;
- the guidance strip renders for the highest-priority recommended entry and its CTA calls `onStartBuild(cityId, wonderId)` only when `canStartBuild` is true;
- the guidance strip does not render a start CTA for a recommended entry that is questing, near, blocked, building, completed, or recovered;
- recommended entries remain bounded to at most three and have `data-recommended-project="true"`;
- every selected-city wonder project still renders exactly once across recommended and all-city sections, including near and blocked entries;
- lower-ranked ambitions remain reachable after the redesign, with a negative assertion that recommended-count truncation does not hide the remaining catalog;
- the start construction button calls `onStartBuild(cityId, wonderId)` and uses the existing selected city;
- after a start action, the live caller either closes the panel or rerenders it from updated state so the same start CTA cannot be clicked again from stale DOM;
- starting a wonder preserves existing queued production behavior and the card continues to explain queue continuity before the click;
- rival intel cards use viewer-scoped intel and do not leak to another hot-seat player;
- top close remains available;
- no unavailable action is represented as a dead primary CTA;
- dynamic game text is rendered through `textContent` or `createTextNode`, not `innerHTML`.

Run the mirrored UI test plus build:

- `./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts`
- `./scripts/run-with-mise.sh yarn build`

Before push or merge, run the full repo checks required by `AGENTS.md`.

## Out of scope

- Changing legendary wonder rules, quest definitions, recommendation ranking, or race math.
- Adding new wonder art or animation.
- Adding a separate Wonder Atlas flow.
- Replacing the city panel Legendary Wonders launcher.
