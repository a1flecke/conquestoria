import type { GameState } from '@/core/types';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { getCivLuxuryTechGold, getCivWonderTechGold, getCivRoutePartnerTechGold } from '@/systems/tech-yield-system';
import { isAtWar } from '@/systems/diplomacy-queries';
import { getLegendaryWonderCivYieldBonus } from '@/systems/legendary-wonder-system';
import type { CivTurn, CivIncome } from './types';

/**
 * Flat gold from wonders, luxury and wonder-count technologies, trade partners and alliances, added to the income.
 */
export function addGoldBonuses(state: GameState, turn: CivTurn, income: CivIncome): void {
  const { civId, civ, civDef } = turn;
  const { empireFlatTechYields } = income;

  const wonderCivBonuses = getLegendaryWonderCivYieldBonus(state, civId);
  income.totalGold += wonderCivBonuses.gold ?? 0;
  // NP food/production applied per-city above; NP gold handled in economy-system.ts to avoid double-counting
  income.totalGold += getCivLuxuryTechGold(civ.techState.completed, getCivHappinessFromResources(state, civId));
  income.totalGold += empireFlatTechYields.gold;

  // digital-art: +gold per completed legendary wonder this civ owns.
  const completedWonderCount = Object.values(state.completedLegendaryWonders ?? {})
    .filter(wonder => wonder.ownerId === civId).length;
  income.totalGold += getCivWonderTechGold(civ.techState.completed, completedWonderCount);

  // globalization: +gold per distinct peacetime foreign trade-route partner civ.
  const routePartnerCivIds = new Set<string>();
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const fromCity = state.cities[route.fromCityId];
    const toCity = state.cities[route.toCityId];
    let partnerCivId: string | undefined;
    if (fromCity?.owner === civId && route.foreignCivId) {
      partnerCivId = route.foreignCivId;
    } else if (toCity?.owner === civId && fromCity && fromCity.owner !== civId) {
      partnerCivId = fromCity.owner;
    }
    if (!partnerCivId) continue;
    if (!state.civilizations[partnerCivId]) continue;
    if (isAtWar(civ.diplomacy, partnerCivId)) continue;
    routePartnerCivIds.add(partnerCivId);
  }
  income.totalGold += getCivRoutePartnerTechGold(civ.techState.completed, routePartnerCivIds.size);
  if (civDef?.bonusEffect.type === 'allied_kingdoms') {
    const allianceCount = civ.diplomacy.treaties.filter(t => t.type === 'alliance').length;
    income.totalGold += allianceCount * civDef.bonusEffect.allianceYieldBonus;
  }
}
