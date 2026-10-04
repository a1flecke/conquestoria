// src/ui/notification-routes/empire-routes.ts
// #1250: a civ's own internal affairs — unrest and breakaway transitions, treasury strain and a dropped
// production item. Every router here sinks only to the owning civ.
import type { GameEvents, GameState, ProductionDropReason } from '@/core/types';
import { CONCESSION_IMMUNITY_TURNS, getCityAppeaseCost } from '@/systems/faction-commands';
import { REVOLT_UNREST_TURNS, BREAKAWAY_REVOLT_TURNS } from '@/systems/faction-unrest-model';
import { describeDroppedProductionItem } from '@/systems/city-production-presentation';
import type { NotificationSink } from './notification-sink';

type FactionTransitionEvent =
  | { type: 'faction:unrest-started'; cityId: string; owner: string }
  | { type: 'faction:revolt-started'; cityId: string; owner: string }
  | { type: 'faction:unrest-resolved'; cityId: string; owner: string }
  | { type: 'faction:breakaway-started'; cityId: string; oldOwner: string; breakawayId: string }
  | { type: 'faction:breakaway-established'; civId: string; originOwnerId: string }
  | { type: 'faction:critical-status'; cityId: string; owner: string; status: 'unrest' | 'revolt' | 'breakaway'; breakawayId?: string }
  | { type: 'faction:concession-made'; cityId: string; owner: string; concessionType: 'charter' };

export function routeFactionTransition(
  state: GameState,
  event: FactionTransitionEvent,
  sink: NotificationSink,
): void {
  if (event.type === 'faction:unrest-started') {
    const city = state.cities[event.cityId];
    if (!city) return;
    const appeaseCost = getCityAppeaseCost(city);
    // #919 MR3: era/tech-aware option list — never suggest an action the civ cannot take
    // in its current tech state (the old copy promised "happiness improvements" a full
    // era before any happiness building exists).
    const completedTechs = state.civilizations[event.owner]?.techState?.completed ?? [];
    const options = [
      'garrison a military unit',
      `spend ${appeaseCost}🪙 to appease`,
      ...(completedTechs.includes('magistracy') ? ['build a Courthouse'] : []),
      ...(completedTechs.includes('philosophy') ? ['build a happiness building'] : []),
    ];
    sink(
      event.owner,
      `${city.name} is slipping into unrest. Stabilize within ${REVOLT_UNREST_TURNS} turns or rebels will spawn. Options: ${options.join(', ')}.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:revolt-started') {
    const city = state.cities[event.cityId];
    if (!city) return;
    sink(
      event.owner,
      `${city.name} is in open revolt! Rebels have spawned. Defeat them and reduce pressure to restore order. After ${BREAKAWAY_REVOLT_TURNS} turns of revolt the city may break away permanently.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:unrest-resolved') {
    const city = state.cities[event.cityId];
    sink(event.owner, `${city?.name ?? 'A city'} has stabilized.`, 'success');
    return;
  }

  if (event.type === 'faction:breakaway-started') {
    const city = state.cities[event.cityId];
    const breakaway = state.civilizations[event.breakawayId];
    const turnsLeft = breakaway?.breakaway
      ? Math.max(0, breakaway.breakaway.establishesOnTurn - state.turn)
      : 0;
    sink(
      event.oldOwner,
      `${city?.name ?? 'A city'} has broken away. Recapture or reabsorb it before it becomes established${turnsLeft > 0 ? ` in ${turnsLeft} turns` : ''}.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:critical-status') {
    const city = state.cities[event.cityId];
    if (event.status === 'unrest') {
      sink(event.owner, `${city?.name ?? 'A city'} remains in unrest. Stabilize it before revolt spreads.`, 'warning');
      return;
    }
    if (event.status === 'revolt') {
      sink(event.owner, `${city?.name ?? 'A city'} remains in open revolt. Defeat nearby rebels and reduce pressure.`, 'warning');
      return;
    }
    const breakaway = event.breakawayId ? state.civilizations[event.breakawayId] : undefined;
    const turnsLeft = breakaway?.breakaway
      ? Math.max(0, breakaway.breakaway.establishesOnTurn - state.turn)
      : 0;
    sink(
      event.owner,
      `${city?.name ?? 'A city'} is still in secession${turnsLeft > 0 ? ` (${turnsLeft} turns before establishment)` : ''}.`,
      'warning',
    );
    return;
  }

  if (event.type === 'faction:concession-made') {
    const city = state.cities[event.cityId];
    sink(
      event.owner,
      `${city?.name ?? 'A city'} has been granted a charter — immune to unrest for ${CONCESSION_IMMUNITY_TURNS} turns.`,
      'success',
    );
    return;
  }

  const civ = state.civilizations[event.civId];
  const city = civ?.breakaway ? state.cities[civ.breakaway.originCityId] : undefined;
  sink(event.originOwnerId, `${city?.name ?? civ?.name ?? 'A breakaway state'} is now an established civilization.`, 'warning');
}

export function routeEconomyTreasuryStrain(
  state: GameState,
  event: GameEvents['economy:treasury-strain'],
  sink: NotificationSink,
): void {
  const civ = state.civilizations[event.civId];
  if (!civ) return;
  sink(event.civId, formatEconomyTreasuryStrainMessage(state, event), 'warning');
}

export function formatEconomyTreasuryStrainMessage(
  state: GameState,
  event: GameEvents['economy:treasury-strain'],
): string {
  const maintenanceNote = event.unpaidMaintenance > 0
    ? ` ${event.unpaidMaintenance} maintenance went unpaid.`
    : '';
  if (event.level === 'low') {
    return `Treasury strain (${event.netGoldPerTurn}/turn).${maintenanceNote} Rush buy is still available if you can afford it.`;
  }

  const unrestNote = state.era >= 3
    ? ' Unhappiness pressure is rising.'
    : '';
  const label = event.level === 'critical' ? 'Critical treasury strain' : 'Treasury strain is high';
  return `${label} (${event.netGoldPerTurn}/turn).${maintenanceNote} Rush buy is unavailable until the budget recovers.${unrestNote}`;
}

export function routeDroppedProductionItem(
  state: GameState,
  event: { cityId: string; itemId: string; itemKind: 'building' | 'unit'; reason: ProductionDropReason },
  sink: NotificationSink,
): void {
  const city = state.cities[event.cityId];
  if (!city) return;
  const message = describeDroppedProductionItem(
    { itemId: event.itemId, itemKind: event.itemKind, reason: event.reason },
    city.name,
  );
  sink(city.owner, message, 'warning');
}
