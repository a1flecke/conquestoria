# Cost Dynamics Drift Reconciliation Design

Issue: https://github.com/a1flecke/conquestoria/issues/158

## Purpose

The merged cost-dynamics MVP added maintenance, treasury strain, rush-buying, UI hints, notifications, and unrest integration. This follow-up reconciles that implementation with the approved design contract where it drifted. The goal is not to redesign the economy; it is to make the shipped feature honest, teachable, kid-friendly, and extensible.

## Goals

- Restore the approved four-band treasury strain model: `none`, `low`, `high`, `critical`.
- Base strain on unpaid maintenance, not merely negative projected income.
- Keep early play generous: reserves can cover bad turns without creating strain, likely-needed buildings stay protected, and two defenders per city stay free.
- Disable rush-buy at `high` and `critical` strain with a clear reason.
- Make only `critical` strain contribute to unrest, and only from Era 3 onward.
- Align free-support assignment with the player-facing explanation that basic needs are protected before optional or advanced extras.
- Move rush-buy execution into the economy system so UI, turn logic, tests, and future AI/tooling use one canonical path.
- Bring the HUD and city panel into full visible alignment with the approved UI contract.
- Add regression coverage that proves the drift is fixed.

## Non-Goals

- Do not add debt, forced unit disbanding, building shutdown, or negative gold.
- Do not add a full economy detail screen.
- Do not retune final balance beyond restoring the approved thresholds and priority policy.
- Do not add a separate happiness system.
- Do not let rush-buy skip the queue, buy follow-up items, or buy wonders.

## Current Drift To Correct

The merged implementation is useful but differs from the approved plan in several ways:

- It uses `stable | strained | critical` instead of `none | low | high | critical`.
- It treats some negative-income cases as critical strain even when the original contract tied strain to unpaid maintenance.
- It disables rush-buy only at `critical`; the approved design disables it at `high` and `critical`.
- It applies Era 3 unrest pressure for `strained`, while the approved design allows unrest pressure only for `critical`.
- Free support currently favors higher-upkeep or stronger items first, which can protect advanced optional content before basic needs.
- Rush-buy execution lives in `src/main.ts` instead of a shared economy-system helper.
- The city panel and HUD surface a reduced version of the approved wording and breakdown.
- Tests do not fully prove the approved strain bands, support priority, rush-buy edge cases, or visible UI contract.

## Economy Contract

The economy system is the single source of truth for:

- maintenance policy
- city building support assignment
- civilization unit support assignment
- projected economy
- resolved economy status
- treasury strain thresholds
- rush-buy quotes
- rush-buy execution

The public strain type should be:

```ts
export type TreasuryStrainLevel = 'none' | 'low' | 'high' | 'critical';
```

Compatibility aliases are acceptable only inside migration or normalization helpers. Callers, tests, stored status written after this change, and all player-visible labels must use the new type names. The implementation should avoid keeping `stable` or `strained` as active gameplay labels after this reconciliation.

The economy system should expose focused helpers with these responsibilities:

- `calculateCityBuildingMaintenance(state, cityId)`: city-local building support, paid upkeep, and row-level explanation.
- `calculateCivUnitMaintenance(state, civId)`: empire unit support, defender slot assignment, paid upkeep, and row-level explanation.
- `projectCivEconomy(state, civId)`: current-state projection for HUD, city panel, rush-buy quotes, and AI/tooling decisions. It must not mutate state.
- `calculateCivEconomy(state, civId, grossGoldIncome?)`: resolved economy math for turn processing.
- `applyEconomyTurn(state, civId, result)`: applies gold with a `0` floor and stores normalized last resolved economy status.
- `getRushBuyQuote(state, civId, cityId)`: returns availability, cost, active item, and a stable disabled reason.
- `rushBuyActiveProduction(state, civId, cityId, bus)`: validates the quote, spends gold, and completes only the active item through shared production completion.

Resolved status stored in `GameState.economyStatusByCiv` must include at least:

```ts
interface EconomyStatus {
  turn: number;
  grossGoldIncome: number;
  buildingMaintenance: number;
  unitMaintenance: number;
  netGoldPerTurn: number;
  unpaidMaintenance: number;
  strainLevel: TreasuryStrainLevel;
}
```

The implementation may retain additional breakdown data in projected results, but saved resolved status should stay compact and serializable.

## Strain Semantics

Treasury strain is computed from unpaid maintenance:

- `startingGold` is the civilization's gold before economy application.
- `grossGoldIncome` is all per-turn gold before maintenance.
- `totalMaintenance = buildingMaintenance + unitMaintenance`.
- `netGoldPerTurn = grossGoldIncome - totalMaintenance`.
- `endingGold = max(0, startingGold + netGoldPerTurn)`.
- `unpaidMaintenance = max(0, totalMaintenance - (startingGold + grossGoldIncome))`.

If reserves cover the turn, `unpaidMaintenance` is `0` and strain is `none`, even when `netGoldPerTurn` is negative. The player sees the shrinking treasury through projected net gold, but the game does not apply strain until the civilization cannot pay its bills.

Initial generous thresholds:

- `none`: `unpaidMaintenance === 0`
- `low`: unpaid maintenance exists but is below both high thresholds
- `high`: `unpaidMaintenance >= 5` or `unpaidMaintenance / max(1, totalMaintenance) >= 0.25`
- `critical`: `unpaidMaintenance >= 10` or `unpaidMaintenance / max(1, totalMaintenance) >= 0.5`

Effects:

- `none`: no warning, no spending block, no unrest pressure
- `low`: warning only; rush-buy can still work if the specific purchase is affordable
- `high`: rush-buy is fully disabled; no unrest pressure
- `critical`: rush-buy is fully disabled; from Era 3 onward, contributes unrest pressure on the next faction tick using last resolved economy status

Current-state projection and resolved turn application use the same strain thresholds. Projection lets the UI recover immediately after the player gains gold, removes upkeep, or otherwise fixes the budget. Resolved status records what actually happened at turn processing time for notifications and next-turn unrest pressure.

## Save Compatibility

Older saves and in-progress local games may contain no economy status or the merged MVP status shape. The reconciliation must tolerate both.

- Missing `economyStatusByCiv` means every civilization has `none` strain until the next projection or economy turn recomputes status.
- Existing `stable` status normalizes to `none`.
- Existing `strained` status should not automatically become `high`. In the merged MVP, `strained` could mean negative net income while reserves still covered bills, so it normalizes through the new unpaid-maintenance calculation.
- Existing `critical` status also normalizes through unpaid maintenance when numeric fields are available. This prevents old "large deficit plus low treasury" critical labels from creating Era 3 unrest when no maintenance was actually unpaid.
- Missing `turn`, `grossGoldIncome`, `buildingMaintenance`, `unitMaintenance`, `netGoldPerTurn`, or `unpaidMaintenance` fields should default to `0` except `turn`, which should default to the current game turn when normalization occurs.
- If old numeric status data includes `maintenanceGoldPerTurn` but not separate building/unit maintenance, use it as `buildingMaintenance` and `0` unit maintenance for normalization only. The next economy turn writes the correct split.
- If old status data lacks enough numeric maintenance data to prove unpaid maintenance, normalize to `none`. Current-state projection and the next economy turn will restore any real strain without surprising the player from stale save metadata.

Save compatibility must not require a one-time destructive migration. Normalization can happen in economy helper reads and in save loading as long as subsequent writes use the new compact `EconomyStatus` shape.

## Maintenance Support Priority

The support policy should match the explanation a younger player can understand:

> Basic needs are protected. Fancy extras can cost upkeep.

### Buildings

Core exempt buildings always cost `0` and do not consume free support:

- `city-center`
- `herbalist`
- `workshop`
- `shrine`
- `barracks`
- `library`
- `granary`

Remaining buildings consume free support in deterministic policy order:

1. starter/core-adjacent content
2. food, production, and economy buildings
3. standard buildings
4. advanced, security, naval, specialist, or other high-impact buildings
5. configured upkeep
6. building id for stable ties

Buildings outside support pay configured upkeep.

### Units

Settlers, workers, and scouts are free and do not consume support.

Each city grants two free combat-capable defender slots. These slots are empire support capacity, not garrison-position checks. A warrior one tile away from the city should not lose free support.

Defender slots are assigned in deterministic policy order:

1. basic early defenders such as warriors and archers
2. ordinary non-specialist melee/ranged military
3. advanced non-specialist military such as musketeers or late-era direct combat units
4. spy, naval, hound, unique tactical, or other specialist units
5. configured upkeep
6. unit id for stable ties

General free support then protects remaining ordinary units before advanced or specialized units. Units outside all free support pay configured upkeep.

This may charge a stronger advanced unit while a basic warrior stays free. That is intentional because the feature should penalize overbuilding advanced or optional capacity, not normal defense.

The exact priority groups should live in economy policy data, not in scattered string comparisons. Tests should include at least one advanced high-upkeep unit competing with a basic warrior or archer to prove the priority policy is real.

## Rush-Buy Contract

Rush-buy remains a city action for only the active production item.

Allowed:

- active normal unit
- active normal building

Blocked:

- no active production
- city is not owned by the acting civilization
- insufficient gold
- `high` treasury strain
- `critical` treasury strain
- any `legendary:*` item
- any wonder-classified item
- unknown or invalid active production item

The UI asks for a quote and then asks the economy system to execute:

```ts
getRushBuyQuote(state, civId, cityId)
rushBuyActiveProduction(state, civId, cityId, bus)
```

`rushBuyActiveProduction` owns validation and mutation. It must spend gold, complete only the active item, advance the queue, reset production progress for the next active item, and use the same production-completion helper normal turn production uses. Bought buildings must use the same city/grid placement semantics as normal completion. Bought units must use the same unit creation and side-effect semantics as normal completion, including espionage records for `spy_*` units and any other side effects already owned by normal production completion.

The result object should contain the updated state on success, a stable reason on failure, the item label when known, and the gold cost when applicable. UI callers should not duplicate economy validation or production mutation.

Rush-buy quote and execution must agree. If the quote says an action is unavailable, execution must return the same disabled reason when called against the same state. If state changes between quote and execution, execution revalidates against the new state and returns the new correct result.

Rush-buy must not create negative gold. Gold is spent before completion is applied only as part of a single returned state update; if completion cannot be applied, the helper returns failure and preserves the original state.

## Unrest Integration

Treasury strain contributes to the existing faction pressure model only when both conditions are true:

- the game era is `3` or later
- the owner's last resolved economy status is `critical`

`none`, `low`, and `high` must not add unrest pressure, including in Era 3 or later. Era 1 and Era 2 must ignore even `critical` strain for unrest purposes.

The system should keep the existing one-turn timing: faction processing reads last resolved economy status from the prior economy tick. Rush-buy and notifications can react to the current projection immediately, but cities should not revolt in the same turn because a new bill was just shown to the player.

## UI And UX Contract

The UI must teach the mechanic without making the economy feel like a punishment screen.

### HUD

The HUD shows current gold plus projected net gold:

```text
💰 42 (+5 net)
```

When strain exists, append a compact status:

- `low`: `Treasury strain`
- `high`: `Rush-buy blocked`
- `critical`: `Critical strain`

The projection must use current state. The player should not need to end the turn to see maintenance and support changes reflected in the HUD.

### City Panel

The city panel should show a compact maintenance summary:

```text
Free support: 3/6 buildings
Paid upkeep: 1 gold/turn
```

Built buildings should show upkeep when nonzero. Build options should show future upkeep, including `0 upkeep` for protected core items. The build and unit catalogs must remain reachable; maintenance labeling must not hide lower-ranked options.

The active production block should show:

- `Buy now: X gold` when rush-buy is available
- a disabled reason when rush-buy is unavailable

Required disabled reasons:

- no active production
- not enough gold
- treasury strain too high
- wonders cannot be bought
- only the owner can buy production
- this production item cannot be bought

After a successful buy, the open city panel must rerender immediately with updated gold, completed item state, shifted queue, production progress, and recalculated rush-buy quote for the next active item.

### Notifications

Treasury strain notifications are civilization-level and once per civ turn.

- `high`: notify that rush-buy is unavailable because treasury strain is too high.
- `critical`: notify that treasury strain is critical; in Era 3 or later the message should mention unrest pressure.

Notifications should not fire once per city for the same economy status.

Before Era 3, critical notifications must not mention unrest pressure. They should explain the spending impact only, so younger players are not warned about a consequence that cannot happen yet.

## Queue And ETA Requirements

Rush-buy touches the active production item, so it must preserve the existing queue UX:

- The active item remains in the current production block.
- Follow-up items remain in the production queue block with their existing order and ETA text.
- Buying the active item shifts the next queued item into the active block.
- The new active item starts with `0` production progress unless existing production-completion semantics define carryover for that item type.
- ETA/order text recalculates after buy, reorder, and remove actions.
- If the active item is unknown, obsolete, or invalid by existing production rules, rush-buy returns `invalid-active-item` and normal queue handling remains responsible for dequeueing or filtering.
- A stale buy button from before rerender must not be able to buy a second item.

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Still reachable |
|---|---|---|---|---|
| HUD shows gross-looking gold without strain | Add or complete enough paid upkeep to reduce net gold | Projection recalculates from current state | HUD shows `(+N net)` or `(-N net)` with strain label only when unpaid maintenance exists | City panel breakdown |
| Treasury has enough reserves for a negative net turn | End turn | Gold decreases but all upkeep is paid | Gold shrinks; strain remains `none` | Rush-buy if affordable |
| Projected strain is `low` | View active production | Quote allows purchase if gold is enough | Button remains available; UI shows warning elsewhere | Normal queue actions |
| Projected strain is `high` | View active production | Quote rejects rush-buy | Disabled reason says treasury strain is too high | Queue, normal production, economy recovery |
| Projected strain is `critical` in Era 2 | End turn | Last resolved status is critical | Rush-buy blocked; no unrest pressure from economy | Era progression and recovery |
| Projected strain is `critical` in Era 2 | Notification routes | Civ-level warning emitted | Message mentions critical strain and rush-buy block, not unrest | City panels and normal production |
| Last resolved strain is `critical` in Era 3 | Process faction turn | Economy pressure contributes to city unrest pressure | Existing unrest UI/notifications handle any resulting unrest | City stabilization tools |
| Active item is a normal building | Click `Buy now` | Gold spent; active item completes through shared helper | City panel rerenders with building complete and next quote | Build catalog and queue |
| Active item is `legendary:*` | View production block | Quote rejects purchase | Disabled reason says wonders cannot be bought | Legendary wonder surface |
| Active item quote was available but state changed before click | Click stale or delayed buy button | Execution revalidates current state | Either buy succeeds for the current active item or a current disabled reason appears | Queue and build catalog |

## Misleading UI Risks

- `Treasury strain` is misleading if reserves can still pay the bill. Negative net gold alone is not strain.
- `Free support` is misleading if exempt buildings consume support. Exempt core buildings must show `0 upkeep` and remain outside support usage.
- `Two defenders per city free` is misleading if position matters. Defender slots are empire-wide support capacity.
- `Rush-buy blocked` is misleading at `low`; only `high` and `critical` block buying.
- `Critical strain` is misleading before Era 3 if it implies unrest. Pre-Era 3 messages should not say it affects unrest.
- Future upkeep is misleading if build options hide `0 upkeep`; players need to see when a core item is protected.
- Buy buttons are misleading if stale DOM can buy twice. Successful buy must rerender the panel before another click can target the old item.
- Critical notifications are misleading before Era 3 if they mention unrest pressure. The same strain level has different messaging before and after Era 3.
- Support priority is misleading if UI labels imply "best value" rather than "protected basics." The city panel should avoid wording such as "optimized" or "best" for free support assignment.

## Interaction Replay Checklist

Tests for the city panel should replay:

- open panel with no active production and see no active buy action
- add the first production item and see an active buy quote
- add a second production item and see the queue remain visible
- buy the active item and see the panel rerender with the next item active
- click buy again after rerender and verify it targets the new active item, not stale DOM
- remove or reorder queued follow-up items after a buy and verify ETA/order text remains correct
- reopen the city panel and see completed building/unit state plus recalculated upkeep

## Testing Requirements

System tests must prove:

- `none`, `low`, `high`, and `critical` thresholds.
- Reserves covering a negative net turn produce `none`.
- `low` does not block rush-buy.
- `high` and `critical` block rush-buy.
- Core/basic building priority beats high-upkeep advanced priority.
- Basic defender priority beats advanced/specialized unit priority.
- Two defender slots per city do not depend on unit position.
- Rush-buy completes active normal buildings through the shared helper.
- Rush-buy completes active normal units through the shared helper.
- Rush-buy rejects no active production, not-owner, insufficient gold, high strain, critical strain, wonders, `legendary:*`, and invalid active items.
- Rush-buy quote and execution return matching disabled reasons for the same state.
- Rush-buy revalidates changed state at execution time and never spends gold on a failed completion.
- Era 1 and Era 2 critical strain does not affect unrest.
- Era 3 critical strain affects unrest.
- Era 3 `none`, `low`, and `high` do not affect unrest.
- Notifications fire once per civ turn for high or critical strain and do not spam per city.
- Critical notifications before Era 3 do not mention unrest; Era 3+ critical notifications do mention unrest pressure.
- Missing and old-shape economy status values normalize safely.
- Save persistence keeps working when economy status is missing, old-shaped, or newly shaped.

UI tests must prove:

- HUD shows projected net gold after maintenance.
- HUD updates from current projection without waiting for end turn.
- HUD labels `low`, `high`, and `critical` correctly.
- City panel shows `Free support` and `Paid upkeep`.
- Built buildings show upkeep when nonzero.
- Build options show future upkeep, including `0 upkeep`.
- Disabled rush-buy reasons are visible.
- Successful rush-buy rerenders the panel immediately.
- The full build and unit catalogs remain reachable.

## Acceptance Criteria

- Normal early play can build likely-needed buildings, explore, settle, and defend cities without punitive maintenance.
- Two defenders per city remain free.
- Players who overbuild optional buildings or maintain large excess armies see net gold shrink and eventually lose rush-buy access.
- Strain starts only when maintenance cannot actually be paid.
- `high` and `critical` strain disable rush-buy with a visible reason.
- `critical` strain contributes unrest pressure only from Era 3 onward.
- Wonders and `legendary:*` production can never be rush-bought.
- Economy policy remains centralized and flexible enough for future debt, scaling penalties, or forced-cut policies.

## Implementation Notes For The Follow-Up Plan

The implementation plan should target these file areas:

- `src/core/types.ts` for the strain/status type contract.
- `src/systems/economy-system.ts` for policy, breakdowns, projections, rush-buy quote, and rush-buy execution.
- `src/systems/city-system.ts` only if shared production completion needs additional extraction or signature cleanup.
- `src/core/turn-manager.ts` for resolved economy status, net gold application, and notifications.
- `src/systems/faction-system.ts` for critical-only Era 3+ pressure.
- `src/ui/hud-economy.ts` or the existing HUD formatting location for HUD text, with tests deciding whether a helper split is worth it.
- `src/ui/city-panel.ts` for visible support, upkeep, future upkeep, and rush-buy reasons.
- `src/main.ts` to remove inline rush-buy mutation and call the shared helper.
- `src/ui/notification-routing.ts` for high/critical warning wording.

The plan should use TDD for each drift correction, keep commits small, run targeted tests after each task, include save-persistence coverage for economy status normalization, then run source rule checks, build, and the full test suite before pushing or opening a PR.
