import type { GameState } from '@/core/types';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import {
  getCivLuxuryTechGold,
  getCivRoutePartnerTechGold,
  getCivWonderTechGold,
} from '@/systems/tech-yield-system';
import { getCivWideGoldCredits } from '@/systems/economy-system';
import { isAtWar } from '@/systems/diplomacy-queries';
import { getLegendaryWonderCivYieldBonus } from '@/systems/legendary-wonder-system';
import type { CivTurn, CivIncome } from './types';

/**
 * Flat gold from wonders, luxury and wonder-count technologies, trade partners and alliances, added to the income.
 *
 * This step must credit EVERY civ-wide gold source the economy projection displays: the economy
 * phase settles `grossGoldByCiv` (what the per-civ steps credited), so an income the projection
 * promises but no step credits is a phantom that never reaches the treasury while every economy
 * surface (city panel, HUD projection, rush-buy strain gate) claims it is being paid. NP civ-wide
 * gold, the Tithes boon, postal-service road gold, connected-city rail gold and the Imperial Levy
 * were exactly that until they were credited here, through the one `economy-system` helper that
 * reads the same functions the projection reads.
 */
export function addGoldBonuses(state: GameState, turn: CivTurn, income: CivIncome): void {
  const { civId, civ, civDef } = turn;
  const { empireFlatTechYields } = income;

  const wonderCivBonuses = getLegendaryWonderCivYieldBonus(state, civId);
  income.totalGold += wonderCivBonuses.gold ?? 0;
  // NP food/production applied per-city in city-production.ts; NP gold credited once here —
  // the projection (economy-system.ts) also counts it, but the round settles this credit.
  income.totalGold += getCivLuxuryTechGold(civ.techState.completed, getCivHappinessFromResources(state, civId));
  income.totalGold += empireFlatTechYields.gold;
  // The five civ-wide credits (NP gold, Tithes, roads, connected cities, Imperial Levy) —
  // computed by the projection's own module so display and settlement cannot drift.
  income.totalGold += getCivWideGoldCredits(state, civId);

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