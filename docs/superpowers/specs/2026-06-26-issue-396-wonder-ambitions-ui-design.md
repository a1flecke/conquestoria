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
- preserve every currently reachable wonder project from the selected city;
- distinguish ready, questing, building, completed, recovered, near, and blocked states at a glance;
- make quest progress visually scannable;
- explain construction race pressure and recovery without a glossary-style intro;
- keep hot-seat and viewer-scoped rival intel private.

## UX shape

The panel opens with a compact header:

- title: `🏛️ Legendary Wonders`;
- selected civilization and city;
- top close button using `createGameButton('Close', 'ghost')`.

Below the header is a “Best move right now” guidance strip when at least one recommended entry exists. It summarizes the highest-priority recommended wonder in one sentence and, when legal, shows the same primary action label as the card. This strip is guidance only; it must not be the only action surface.

The main content keeps the existing sections, but changes their presentation:

1. `Best fits right now`
   - Up to three recommended entries.
   - Full cards with stronger visual treatment.
   - Each card contains status chip, reward, quest checklist, race snapshot, missing requirements, and CTA when available.
2. `All ambitions in this city`
   - Every non-recommended selected-city entry remains reachable.
   - Cards may be more compact, but must still show status, reward, quest count, missing requirements or next step, and detail copy.
3. `In progress elsewhere`
   - Viewer-scoped rival intel cards remain separate.
   - Show only the safe intel already returned by `getLegendaryWonderIntelForViewer`.

The global “Eligibility / Quest / Construction Race” glossary blocks should be removed or collapsed into contextual copy on cards. The screen should teach through the current entries, not through abstract rules.

## Card contract

Each project card should have stable DOM markers so tests can assert the visible contract:

- `data-project-card="<wonderId>"` remains.
- `data-recommended-project="true"` remains for recommended cards.
- `data-wonder-status-chip="<visibleState>"` on the state chip.
- `data-wonder-quest-list="<wonderId>"` on the quest checklist container.
- `data-wonder-quest-step="<completed|pending>"` on each quest row.
- `data-wonder-reward-summary="<wonderId>"` on the reward row.
- `data-wonder-race-summary="<wonderId>"` on the race/recovery row.
- `data-wonder-start-build="<wonderId>"` on the primary CTA when present.

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

The UI should add small rendering helpers inside `src/ui/wonder-panel.ts` or a tightly scoped sibling module if the file becomes hard to read:

- `appendStatusChip(parent, entry)`;
- `appendQuestChecklist(parent, entry)`;
- `appendRewardRow(parent, entry)`;
- `appendRaceSummary(parent, entry)`;
- `appendGuidanceStrip(panel, recommendedEntry, callbacks, cityId)`;
- `appendProjectCard(...)`.

These helpers must only render presentation data. They must not recompute eligibility, recommendation ranking, rival intel visibility, or gameplay state.

Buttons must use `createGameButton`. Dynamic text must use `textContent` or `createTextNode`; do not introduce `innerHTML` with game-generated strings.

## Mobile and accessibility expectations

The panel remains full-screen and scrollable. Cards should stack in one column on narrow widths. Any internal row/grid treatment must degrade to stacked rows without horizontal overflow.

Touch targets must stay at least 44px tall by using `createGameButton`. Status chips are informational and not clickable. Color is never the only signal: each chip also has explicit text and quest rows have icons plus text.

## Error and empty states

If there are no selected-city entries, preserve the existing empty-state message but style it as a card with a short explanation:

- no known ambitions in this city;
- continue exploring, researching, or meeting conditions.

If a city or civilization lookup is missing, the panel may keep the fallback IDs but should not crash.

If a ready wonder has no `startActionLabel`, render it as informational only and do not create a button.

## Testing requirements

Update `tests/ui/wonder-panel.test.ts` or add a mirrored helper test to prove:

- state chips render for at least ready, questing, building, completed, recovered, near, and blocked states when fixtures can produce them;
- quest checklist rows differentiate completed and pending steps visually and semantically;
- recommended entries remain bounded to at most three and have `data-recommended-project="true"`;
- every selected-city wonder project still renders exactly once across recommended and all-city sections;
- lower-ranked ambitions remain reachable after the redesign;
- the start construction button calls `onStartBuild(cityId, wonderId)` and uses the existing selected city;
- the panel rerenders or remains current after a start action if the live caller already handles that refresh path;
- rival intel cards use viewer-scoped intel and do not leak to another hot-seat player;
- top close remains available;
- no unavailable action is represented as a dead primary CTA.

Run the mirrored UI test plus build:

- `./scripts/run-with-mise.sh yarn test --run tests/ui/wonder-panel.test.ts`
- `./scripts/run-with-mise.sh yarn build`

Before push or merge, run the full repo checks required by `AGENTS.md`.

## Out of scope

- Changing legendary wonder rules, quest definitions, recommendation ranking, or race math.
- Adding new wonder art or animation.
- Adding a separate Wonder Atlas flow.
- Replacing the city panel Legendary Wonders launcher.
