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

## Design Guardrails

- Favor kid-friendly generosity over tight economic punishment. Maintenance should be a late warning system for overbuilding, not a tax on obvious play.
- Keep all maintenance math deterministic. If the game decides which buildings or units are free, tests and UI must be able to explain the exact assignment.
- Keep the visible UI compact by default. Show net gold, support usage, and rush-buy reasons first; put detailed breakdown rows behind existing panel structure or a small details area.
- Use one economy resolver for turn processing, HUD projections, city panel text, AI checks, and rush-buy validation. UI must not reimplement maintenance rules.
- Separate projected economy from last resolved economy. The UI can recompute a projection from the current state; turn effects and notifications use the last resolved turn result stored in state.

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

Building support assignment order:

1. Exempt buildings are always `0 upkeep` and do not consume free support.
2. Remaining buildings are sorted by policy priority, then upkeep cost, then building id for stable ties.
3. Free support covers the first supported buildings in that ordered list.
4. Buildings outside support pay their configured upkeep.

This avoids a confusing outcome where an optional advanced building silently consumes support ahead of a basic building. The policy can later add metadata such as `maintenancePriority: 'core' | 'standard' | 'advanced'`, but the first implementation can derive priority from the explicit exempt list, pacing band, category, and configured upkeep.

Unit maintenance is empire-wide. Each civilization receives generous free unit support, plus explicit protection for basic defense.

Initial free unit support:

- Starter/exploration/expansion exemptions are applied first.
- Two combat-capable defender slots per owned city are free.
- Additional free support: `2 + cityCount * 2 + floor(totalPopulation / 3)`

Initial free or discounted unit behavior:

- Settlers, workers, and scouts are free.
- Defender slots are empire support capacity, not a garrison-position requirement. A child should not lose free support because a warrior is one tile away from a city.
- Defender slots apply to combat-capable owned units after starter exemptions.
- Basic early defenders are assigned to free defender slots before advanced, spy, naval, or specialized units.

Suggested unit upkeep:

- Exempt starter units: `0 gold/turn`
- Most regular military units: `1 gold/turn`
- Advanced, spy, naval, or specialized units: `2 gold/turn`

Unit support assignment order:

1. Exempt units such as settlers, workers, and scouts are `0 upkeep` and do not consume support.
2. Combat-capable units are sorted by defender priority, then upkeep cost, then unit id for stable ties.
3. `cityCount * 2` defender slots cover the first combat-capable units in that ordered list.
4. Remaining units are sorted by policy priority, upkeep cost, then unit id.
5. General free support covers the next units.
6. Units outside support pay their configured upkeep.

The resolver must return breakdown rows for city building upkeep and civilization unit upkeep so UI and tests do not have to re-derive the rules.

## Treasury Strain

The initial policy is soft pressure:

- Gold cannot go below `0`.
- Unpaid maintenance creates a computed treasury strain result for the turn.
- No unit disbanding, building shutdown, or negative gold is applied.

Economy math for a civilization:

- `startingGold` is the civilization's gold before this turn's economy application.
- `grossGoldIncome` is all positive and negative per-turn gold income before maintenance.
- `totalMaintenance` is building upkeep plus unit upkeep.
- `netGoldPerTurn = grossGoldIncome - totalMaintenance`
- `endingGold = max(0, startingGold + netGoldPerTurn)`
- `unpaidMaintenance = max(0, totalMaintenance - (startingGold + grossGoldIncome))`

If reserves cover a bad turn, `unpaidMaintenance` is `0`. The player sees a shrinking treasury through `netGoldPerTurn`, but strain only starts once the civilization cannot actually pay its bills.

Strain bands:

- `none`: all upkeep is paid.
- `low`: unpaid maintenance exists, but pressure is mild. The UI warns, and rush-buy can still work if the specific purchase is affordable and no stronger rule blocks it.
- `high`: unpaid maintenance crosses the high threshold. Rush-buy is fully disabled for the civilization. Disabled UI must give a reason such as "Rush-buy unavailable: treasury strain is too high."
- `critical`: unpaid maintenance crosses the critical threshold. Rush-buy remains disabled. Starting in Era 3, critical strain adds unrest pressure to owned cities.

Initial generous thresholds:

- `none`: `unpaidMaintenance === 0`
- `low`: unpaid maintenance is below both high thresholds.
- `high`: `unpaidMaintenance >= 5` or `unpaidMaintenance / max(1, totalMaintenance) >= 0.25`
- `critical`: `unpaidMaintenance >= 10` or `unpaidMaintenance / max(1, totalMaintenance) >= 0.5`

Treasury strain can affect spending immediately, including in Era 1 and Era 2. Treasury strain must not contribute to unrest or unhappiness until Era 3 or later.

The strain policy must be swappable. The initial implementation should use a policy shape such as `soft-pressure`, with thresholds and effects in one config object. Later policies may allow debt, scaling penalties, or forced cuts without changing UI callers or turn-manager flow.

## Unrest Integration

Treasury strain contributes to the existing faction/unrest pressure model, not a new happiness system. `computeUnrestPressure` should include an economy pressure component only when:

- the game era is `3` or later
- the owning civilization has `critical` treasury strain

Because `processFactionTurn` currently runs before city yield and economy resolution, unrest should read the last resolved economy status from the prior turn. A newly critical treasury creates notifications immediately and affects rush-buy immediately, then contributes unrest pressure on the next faction tick if it is still the last resolved status. This one-turn delay is easier to understand than a same-turn revolt from a bill the player just saw.

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

Buying should spend gold and complete the item through shared completion semantics. Add or extract a helper such as `completeCityProductionItem` so normal turn production and rush-buy use the same completion path. A bought building must be added to the city and placed in the city grid the same way turn production does. A bought unit must be created and registered the same way turn production does, including spy-unit side effects where applicable. Buying must emit or route the same player-visible completion behavior that normal production uses.

Rush-buy applies only to the active queue item. It must not buy follow-up queue entries or skip ahead in the queue.

Rush-buy validation uses the current projected economy result, not only the last resolved turn status. This lets the button recover immediately if the player deletes units, changes queues, gains gold, or otherwise fixes the economy before ending the turn.

## UI Contract

HUD:

- Show net gold rather than only gross city gold.
- Example: `42 (+5 net)`.
- Net gold must include city income, building maintenance, unit maintenance, and known per-turn gold from wonders, diplomacy, trade routes, and idle production where the current turn model can calculate them.
- If the current projection has treasury strain, the HUD should show a compact warning state.
- Avoid presenting a large accounting table in the HUD. Detailed breakdown belongs in the city panel and any future economy detail surface.

City panel:

- Show a city maintenance summary near yields or production.
- Example: `Maintenance: 1/6 support used, 0 gold/turn paid`.
- Built buildings should show upkeep when nonzero.
- Build options should show future upkeep, including `0 upkeep` for protected core items.
- Use child-friendly wording where possible: `Free support`, `Paid upkeep`, and `Treasury strain` are clearer than abstract terms like `capacity deficit`.

Rush-buy UI:

- The active production block should show `Buy now: X gold` when buying is available.
- Disabled buy controls must show the exact reason: no active production, insufficient gold, treasury strain too high, or wonders cannot be bought.
- After a successful buy, the panel must rerender immediately with the completed item, updated gold, queue state, and any new active production.

Notifications:

- When strain reaches `high`, notify the affected human player once per turn that rush-buy is unavailable due to treasury strain.
- When strain reaches `critical` in Era 3+, notify that treasury strain is increasing unrest pressure.
- Do not notify every city separately for the same treasury strain. Use one civilization-level warning per turn so the feature feels like guidance, not nagging.

## Architecture

Add a dedicated economy system, likely `src/systems/economy-system.ts`.

Core helpers:

- `calculateCityBuildingMaintenance(state, cityId)` returns city-local upkeep, free support, exempt buildings, paid buildings, and breakdown rows.
- `calculateCivUnitMaintenance(state, civId)` returns empire unit upkeep, free support, exempt units, paid units, free defender assignments, and breakdown rows.
- `calculateCivEconomy(state, civId, grossGoldIncome)` combines income, upkeep, net gold, unpaid maintenance, strain level, and rush-buy availability.
- `applyEconomyTurn(state, civId, economyResult)` applies gold with a `0` floor and stores the minimal resolved strain status needed by notifications and next-turn unrest.
- `projectCivEconomy(state, civId)` recomputes a best-effort projection for HUD, city panel, and rush-buy validation without mutating state.
- `getRushBuyQuote(state, civId, cityId)` returns availability, cost, and a disabled reason for the active item.
- `rushBuyActiveProduction(state, civId, cityId, bus)` validates the quote, spends gold, completes the item through shared production completion, and returns the next state plus a result object.

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
- economy unrest pressure amount for Era 3+ critical strain

State shape:

- Add a serializable optional field such as `economyStatusByCiv?: Record<string, EconomyStatus>`.
- `EconomyStatus` should include `turn`, `grossGoldIncome`, `buildingMaintenance`, `unitMaintenance`, `netGoldPerTurn`, `unpaidMaintenance`, and `strainLevel`.
- This field records the last resolved economy turn. It is not the only source for UI, because UI should use projections from the current state.
- Save migration should tolerate missing `economyStatusByCiv` by treating strain as `none`.

Turn manager integration:

1. Compute city yields as today.
2. Track gross gold income as today, including city yields and existing bonuses.
3. Add city building maintenance for each city owned by the civilization.
4. Add unit maintenance after city processing.
5. Apply net gold through the economy system instead of directly adding gross gold.
6. Store the resulting status in `economyStatusByCiv`.
7. On the next `processFactionTurn`, let Era 3+ cities read their owner's last resolved critical strain as one pressure source.

Rush-buy should live in the same economy/planning boundary rather than as a city-panel-only mutation. The UI calls a shared helper that validates the action, spends gold, completes the active item, updates state, and returns a result with a success message or disabled reason.

## Testing

System tests:

- City building maintenance honors core building exemptions.
- City building maintenance uses generous free support before charging paid upkeep.
- City building maintenance assigns support deterministically, with optional advanced buildings paying before protected core buildings.
- Unit maintenance exempts settlers, workers, and scouts.
- Unit maintenance grants two free combat defenders per city.
- Unit maintenance assigns defender support deterministically without requiring a unit to stand inside a city.
- Unit maintenance charges excess armies after exemptions and support.
- Turn processing applies net gold with a `0` floor.
- Reserves can pay a negative net turn without creating strain until maintenance cannot be paid.
- Unpaid maintenance produces `low`, `high`, and `critical` strain at configured thresholds.
- `high` and `critical` strain disable rush-buy.
- Critical strain from the prior resolved economy turn adds unrest pressure only in Era 3+.
- Critical strain does not add unrest pressure in Era 1 or Era 2.
- `none`, `low`, and `high` strain do not add unrest pressure even in Era 3+.

Rush-buy tests:

- Buying an active normal building spends gold, completes the building, places it in the grid, removes it from the queue, and rerenders the panel.
- Buying an active normal unit spends gold, creates the unit through the shared completion path, removes it from the queue, and rerenders the panel.
- Buying is rejected for `legendary:*`.
- Buying is rejected for future wonder-classified production items.
- Buying is rejected with explicit reasons for insufficient gold and high treasury strain.
- Rush-buy availability recalculates from current projected economy after gold or maintenance changes.

UI tests:

- HUD shows net gold after maintenance.
- HUD uses projected economy and does not require the player to end turn before seeing maintenance changes.
- City panel shows maintenance support and paid upkeep.
- Build options show future upkeep.
- Active production shows a buy button and cost when available.
- Disabled buy controls show the correct reason.
- Panel state updates immediately after a successful buy.
- Treasury strain notifications are civilization-level and do not spam once per city.

Acceptance criteria:

- A normal early game can build likely-needed buildings, explore, settle, and defend cities without punitive maintenance.
- Two defenders per city remain free.
- Players who overbuild optional buildings or maintain a large excess army see net gold shrink.
- High treasury strain disables rush-buy with a visible reason.
- Critical treasury strain contributes unrest pressure only from Era 3 onward.
- Wonders and `legendary:*` production can never be rush-bought.
