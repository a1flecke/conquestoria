# Cost Dynamics Design

Issue: https://github.com/a1flecke/conquestoria/issues/158

## Purpose

Add recurring maintenance and coin-based rush-buying so gold becomes a meaningful strategic resource. The system should slow players who spam units and optional buildings, while keeping early play generous and fun for younger players. Normal expansion, core city development, exploration, and basic defense should feel supported rather than punished.

## Goals

- Model that units and buildings cost money to maintain.
- Make maintenance mostly invisible during normal early play, then increasingly relevant when a player overbuilds or fields an oversized army.
- Let players spend gold to immediately complete normal units and buildings as a "rush order" action.
- Never allow rush-buying wonders or `legendary:*` production.
- Keep treasury policy flexible so the game can later switch from soft pressure to debt or forced cuts without rewriting turn processing.
- Surface maintenance, net gold, strain, and rush-buy reasons clearly in the live UI.

## Non-Goals

- Do not add a separate happiness system.
- Do not disband units, disable buildings, or allow negative gold in the initial implementation.
- Do not make queue skipping a rush-buy feature; buying applies only to the active production item.
- Do not tune final balance from this spec. The numbers below are starting values and must live in one configurable policy module.

## Maintenance Model

Building maintenance is city-local. Each city receives generous free building support, and likely-needed early buildings are free or protected by that support. Paid building upkeep should mainly appear when a city stacks optional, specialized, or advanced buildings beyond normal development.

Initial free building support:

- `4 + floor(population / 2) + maturityBonus`
- Suggested maturity bonuses: `outpost: 0`, `village: 1`, `town: 2`, `city: 3`, `metropolis: 4`

Initial free or exempt building IDs:

- `city-center`
- `herbalist`
- `workshop`
- `shrine`
- `barracks`
- `library`
- `granary`

The exempt list is intentionally data-driven. It represents "you likely need these buildings" and can be changed independently from the recommendation UI. If future recommendation logic introduces a stronger source of truth for core city needs, the economy policy can consume that metadata instead.

Suggested building upkeep:

- Exempt/core buildings: `0 gold/turn`
- Most normal buildings: `1 gold/turn`
- Advanced or high-impact buildings: `2 gold/turn`

Unit maintenance is empire-wide. Each civilization receives generous free unit support, plus explicit protection for basic defense.

Initial free unit support:

- Starter/exploration/expansion exemptions are applied first.
- Two defender or combat units per owned city are free.
- Additional free support: `2 + cityCount * 2 + floor(totalPopulation / 3)`

Initial free or discounted unit behavior:

- Settlers, workers, and scouts are free.
- The first two combat-capable defender units per city are free for that civilization.
- Basic early defenders should be selected before advanced units when assigning free defender slots.

Suggested unit upkeep:

- Exempt starter units: `0 gold/turn`
- Most regular military units: `1 gold/turn`
- Advanced, spy, naval, or specialized units: `2 gold/turn`

The resolver must return breakdown rows for city building upkeep and civilization unit upkeep so UI and tests do not have to re-derive the rules.

## Treasury Strain

The initial policy is soft pressure:

- Gold cannot go below `0`.
- Unpaid maintenance creates a computed treasury strain result for the turn.
- No unit disbanding, building shutdown, or negative gold is applied.

Strain bands:

- `none`: all upkeep is paid.
- `low`: some upkeep is unpaid, but pressure is mild. The UI warns, and rush-buy can still work if the specific purchase is affordable and no stronger rule blocks it.
- `high`: rush-buy is fully disabled for the civilization. Disabled UI must give a reason such as "Rush-buy unavailable: treasury strain is too high."
- `critical`: rush-buy remains disabled. Starting in Era 3, critical strain adds unrest pressure to owned cities.

Treasury strain can affect spending immediately, including in Era 1 and Era 2. Treasury strain must not contribute to unrest or unhappiness until Era 3 or later.

The strain policy must be swappable. The initial implementation should use a policy shape such as `soft-pressure`, with thresholds and effects in one config object. Later policies may allow debt, scaling penalties, or forced cuts without changing UI callers or turn-manager flow.

## Unrest Integration

Treasury strain contributes to the existing faction/unrest pressure model, not a new happiness system. `computeUnrestPressure` should include an economy pressure component only when:

- the game era is `3` or later
- the owning civilization has `critical` treasury strain

Era 1 and Era 2 tests must prove that even critical treasury strain does not add unrest pressure. Era 3+ tests must prove that critical strain adds pressure while `none`, `low`, and `high` do not.

## Rush-Buy

Rush-buy is a city action for the active production item.

Allowed:

- Active normal unit
- Active normal building

Blocked:

- No active production
- Insufficient gold
- `high` or `critical` treasury strain
- Any `legendary:*` queue item
- Any current or future production item classified as a wonder

Initial cost formula:

- `ceil(remainingProduction * 2.5)`
- minimum cost: `10 gold`
- remaining production is `max(0, totalProductionCost - productionProgress)`

Buying should spend gold and complete the item through shared completion semantics. A bought building must be added to the city and placed in the city grid the same way turn production does. A bought unit must be created and registered the same way turn production does, including spy-unit side effects where applicable. Buying must emit or route the same player-visible completion behavior that normal production uses.

Rush-buy applies only to the active queue item. It must not buy follow-up queue entries or skip ahead in the queue.

## UI Contract

HUD:

- Show net gold rather than only gross city gold.
- Example: `42 (+5 net)`.
- Net gold must include city income, building maintenance, unit maintenance, and known per-turn gold from wonders, diplomacy, trade routes, and idle production where the current turn model can calculate them.
- If the civilization has treasury strain, the HUD should show a compact warning state.

City panel:

- Show a city maintenance summary near yields or production.
- Example: `Maintenance: 1/6 support used, 0 gold/turn paid`.
- Built buildings should show upkeep when nonzero.
- Build options should show future upkeep, including `0 upkeep` for protected core items.

Rush-buy UI:

- The active production block should show `Buy now: X gold` when buying is available.
- Disabled buy controls must show the exact reason: no active production, insufficient gold, treasury strain too high, or wonders cannot be bought.
- After a successful buy, the panel must rerender immediately with the completed item, updated gold, queue state, and any new active production.

Notifications:

- When strain reaches `high`, notify the affected human player once per turn that rush-buy is unavailable due to treasury strain.
- When strain reaches `critical` in Era 3+, notify that treasury strain is increasing unrest pressure.

## Architecture

Add a dedicated economy system, likely `src/systems/economy-system.ts`.

Core helpers:

- `calculateCityBuildingMaintenance(state, cityId)` returns city-local upkeep, free support, exempt buildings, paid buildings, and breakdown rows.
- `calculateCivUnitMaintenance(state, civId)` returns empire unit upkeep, free support, exempt units, paid units, free defender assignments, and breakdown rows.
- `calculateCivEconomy(state, civId, grossGoldIncome)` combines income, upkeep, net gold, unpaid maintenance, strain level, and rush-buy availability.
- `applyEconomyTurn(state, civId, economyResult)` applies gold with a `0` floor and exposes the strain result needed by UI, notifications, and unrest.

Policy configuration should live in one place:

- free building support formula
- maturity bonuses
- free unit support formula
- free/exempt buildings
- free/exempt unit types
- defender slot count per city
- per-building upkeep values
- per-unit upkeep values
- rush-buy cost formula
- strain thresholds
- active treasury policy mode

Turn manager integration:

1. Compute city yields as today.
2. Track gross gold income as today, including city yields and existing bonuses.
3. Add city building maintenance for each city owned by the civilization.
4. Add unit maintenance after city processing.
5. Apply net gold through the economy system instead of directly adding gross gold.
6. Make the resulting strain available to the faction/unrest system for Era 3+ pressure.

Rush-buy should live in the same economy/planning boundary rather than as a city-panel-only mutation. The UI calls a shared helper that validates the action, spends gold, completes the active item, updates state, and returns a result with a success message or disabled reason.

## Testing

System tests:

- City building maintenance honors core building exemptions.
- City building maintenance uses generous free support before charging paid upkeep.
- Unit maintenance exempts settlers, workers, and scouts.
- Unit maintenance grants two free combat defenders per city.
- Unit maintenance charges excess armies after exemptions and support.
- Turn processing applies net gold with a `0` floor.
- Unpaid maintenance produces `low`, `high`, and `critical` strain at configured thresholds.
- `high` and `critical` strain disable rush-buy.
- Critical strain adds unrest pressure only in Era 3+.
- Critical strain does not add unrest pressure in Era 1 or Era 2.

Rush-buy tests:

- Buying an active normal building spends gold, completes the building, places it in the grid, removes it from the queue, and rerenders the panel.
- Buying an active normal unit spends gold, creates the unit through the shared completion path, removes it from the queue, and rerenders the panel.
- Buying is rejected for `legendary:*`.
- Buying is rejected for future wonder-classified production items.
- Buying is rejected with explicit reasons for insufficient gold and high treasury strain.

UI tests:

- HUD shows net gold after maintenance.
- City panel shows maintenance support and paid upkeep.
- Build options show future upkeep.
- Active production shows a buy button and cost when available.
- Disabled buy controls show the correct reason.
- Panel state updates immediately after a successful buy.

Acceptance criteria:

- A normal early game can build likely-needed buildings, explore, settle, and defend cities without punitive maintenance.
- Two defenders per city remain free.
- Players who overbuild optional buildings or maintain a large excess army see net gold shrink.
- High treasury strain disables rush-buy with a visible reason.
- Critical treasury strain contributes unrest pressure only from Era 3 onward.
- Wonders and `legendary:*` production can never be rush-bought.
