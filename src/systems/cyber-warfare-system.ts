import type { GameState } from '@/core/types';
import { hexDistance } from './hex-utils';
import { isAtWar } from './diplomacy-system';

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

// Deterministic per-(turn, city, unit) roll in [0, 1) — same LCG shape used elsewhere
// in turn-manager (e.g. barbarian spawns): no Math.random(), reproducible from state.
export function computeCyberDrainRoll(turn: number, cityId: string, unitId: string): number {
  let s = Math.abs(turn * 16807 + cityId.charCodeAt(0) + unitId.charCodeAt(0));
  s = (s * 48271) % 2147483647;
  return s / 2147483647;
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

  let remainingGold = incomeSoFar;

  for (const cityId of [...civ.cities].sort()) {
    const city = state.cities[cityId];
    if (!city) continue;

    const enemyCyberUnits = Object.values(state.units)
      .filter(u =>
        u.type === 'cyber_unit'
        && u.owner !== civId
        && isAtWar(civ.diplomacy, u.owner)
        && hexDistance(u.position, city.position) === 1)
      .sort((a, b) => a.id.localeCompare(b.id));
    if (enemyCyberUnits.length === 0) continue;

    const hasCDC = city.buildings.includes('cyber_defense_center');
    const hasHub = city.buildings.includes('signals_hub');
    const blockChance = hasCDC ? (hasHub ? 0.75 : 0.65) : 0;

    for (const cyberUnit of enemyCyberUnits) {
      const roll = computeCyberDrainRoll(state.turn, city.id, cyberUnit.id);
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
