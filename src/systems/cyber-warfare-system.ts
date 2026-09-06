import type { GameState } from '@/core/types';
import { hexDistance } from './hex-utils';
import { isAtWar } from './diplomacy-system';
import { isAutonomyActivated } from './network-plan-system';
import { createSimulationRng } from './simulation-rng';

export interface CyberDrainEvent {
  cityId: string;
  cityName: string;
  drainerOwner: string;
  drainerUnitId: string;
  goldLost: number;
  blocked: boolean;
}

export interface CyberDrainResult {
  remainingGold: number;
  creditsByOwner: Record<string, number>;
  events: CyberDrainEvent[];
}

// #982: deterministic per-(gameId, turn, city, unit) roll. Was
// `turn*16807 + cityId.charCodeAt(0) + unitId.charCodeAt(0)` -- city ids all
// start with 'c' and unit ids all start with 'u', so `charCodeAt(0)` was
// identical for every city/unit pair in the game, and gameId was missing
// entirely. One roll per (city, enemy cyber unit) pair per invocation of
// processCyberDrain (itself once per civ per turn), so no ordinal is needed.
export function computeCyberDrainRoll(state: Pick<GameState, 'gameId' | 'turn'>, cityId: string, unitId: string): number {
  return createSimulationRng(state, { domain: 'cyber-drain', targetId: cityId, actorId: unitId })();
}

// Cyber Unit gold drain: -2 gold/turn per adjacent enemy city the owner is at war with,
// stolen (credited to the owner), not destroyed. Cyber Defense Center rolls to block it.
// `incomeSoFar` is this civ's accumulated turn income up to this point — the drain is
// capped so it never pushes that income below 0 (mirrors the pre-existing accumulator cap).
export function processCyberDrain(
  state: GameState,
  civId: string,
  incomeSoFar: number,
): CyberDrainResult {
  const civ = state.civilizations[civId];
  const events: CyberDrainEvent[] = [];
  const creditsByOwner: Record<string, number> = {};
  if (!civ) return { remainingGold: incomeSoFar, creditsByOwner, events };
  if (isAutonomyActivated(state, civId)) return { remainingGold: incomeSoFar, creditsByOwner, events };
  let remainingGold = incomeSoFar;

  for (const cityId of [...civ.cities].sort()) {
    const city = state.cities[cityId];
    if (!city) continue;

    const enemyCyberUnits = Object.values(state.units)
      .filter(u =>
        u.type === 'cyber_unit'
        && u.owner !== civId
        && !isAutonomyActivated(state, u.owner)
        && isAtWar(civ.diplomacy, u.owner)
        && hexDistance(u.position, city.position) === 1)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (enemyCyberUnits.length === 0) continue;

    const hasCDC = city.buildings.includes('cyber_defense_center');
    const hasHub = city.buildings.includes('signals_hub');
    const blockChance = hasCDC ? (hasHub ? 0.75 : 0.65) : 0;

    for (const cyberUnit of enemyCyberUnits) {
      const roll = computeCyberDrainRoll(state, city.id, cyberUnit.id);
      const blocked = blockChance > 0 && roll < blockChance;

      if (blocked) {
        events.push({
          cityId, cityName: city.name,
          drainerOwner: cyberUnit.owner, drainerUnitId: cyberUnit.id,
          goldLost: 0, blocked: true,
        });
        continue;
      }

      const amount = Math.min(2, Math.max(0, remainingGold));
      remainingGold -= amount;
      creditsByOwner[cyberUnit.owner] = (creditsByOwner[cyberUnit.owner] ?? 0) + amount;
      events.push({
        cityId, cityName: city.name,
        drainerOwner: cyberUnit.owner, drainerUnitId: cyberUnit.id,
        goldLost: amount, blocked: false,
      });
    }
  }

  return { remainingGold, creditsByOwner, events };
}
