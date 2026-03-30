import type { GameState, Unit, HexCoord, PersonalityTraits, SpyMissionType } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { getMovementRange, moveUnit } from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { getAvailableTechs, startResearch } from '@/systems/tech-system';
import { updateVisibility } from '@/systems/fog-of-war';
import { getCivDefinition } from '@/systems/civ-definitions';
import { chooseTech, chooseProduction } from './ai-strategy';
import { evaluateDiplomacy, evaluateMinorCivDiplomacy } from './ai-diplomacy';
import {
  declareWar,
  makePeace,
  proposeTreaty,
  modifyRelationship,
} from '@/systems/diplomacy-system';
import {
  canRecruitSpy,
  getAvailableMissions,
  recruitSpy,
  assignSpy,
  startMission,
} from '@/systems/espionage-system';

function getPersonality(civType: string): PersonalityTraits {
  const def = getCivDefinition(civType);
  return def?.personality ?? {
    traits: [],
    warLikelihood: 0.5,
    diplomacyFocus: 0.5,
    expansionDrive: 0.5,
  };
}

export function processAITurn(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = structuredClone(state);
  const civ = newState.civilizations[civId];
  if (!civ) return newState;

  const personality = getPersonality(civ.civType ?? 'generic');

  // --- Handle settlers: found cities ---
  const settlers = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type === 'settler');

  for (const settler of settlers) {
    const tile = newState.map.tiles[hexKey(settler.position)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && tile.terrain !== 'coast') {
      const city = foundCity(civId, settler.position, newState.map);
      newState.cities[city.id] = city;
      civ.cities.push(city.id);

      for (const ownedCoord of city.ownedTiles) {
        const key = hexKey(ownedCoord);
        if (newState.map.tiles[key]) {
          newState.map.tiles[key].owner = civId;
        }
      }

      delete newState.units[settler.id];
      civ.units = civ.units.filter(id => id !== settler.id);
      bus.emit('city:founded', { city });
      city.productionQueue = ['warrior'];
    }
  }

  // --- Handle military units: explore or attack ---
  const militaryUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type !== 'settler' && u.type !== 'worker');

  const unitPositions: Record<string, string> = {};
  for (const [id, unit] of Object.entries(newState.units)) {
    unitPositions[hexKey(unit.position)] = id;
  }

  for (const unit of militaryUnits) {
    if (unit.movementPointsLeft <= 0) continue;

    // Check for nearby enemies to attack
    const neighbors = hexNeighbors(unit.position);
    let attacked = false;
    for (const neighbor of neighbors) {
      const occupantId = unitPositions[hexKey(neighbor)];
      if (occupantId) {
        const occupant = newState.units[occupantId];
        if (occupant && occupant.owner !== civId) {
          const isBarbarian = occupant.owner === 'barbarian';
          const atWar = civ.diplomacy?.atWarWith.includes(occupant.owner) ?? false;
          if (!isBarbarian && !atWar) continue;
          const seed = newState.turn * 16807 + unit.id.charCodeAt(0);
          const result = resolveCombat(unit, occupant, newState.map, seed);
          if (!result.attackerSurvived) {
            delete newState.units[unit.id];
            civ.units = civ.units.filter(id => id !== unit.id);
          } else {
            newState.units[unit.id].health -= result.attackerDamage;
          }
          if (!result.defenderSurvived) {
            const defCivId = occupant.owner;
            delete newState.units[occupant.id];
            if (newState.civilizations[defCivId]) {
              newState.civilizations[defCivId].units =
                newState.civilizations[defCivId].units.filter(id => id !== occupant.id);
            }
          } else {
            newState.units[occupant.id].health -= result.defenderDamage;
          }
          bus.emit('combat:resolved', { result });
          attacked = true;
          break;
        }
      }
    }

    if (attacked) continue;

    // Explore: move toward unexplored territory
    const range = getMovementRange(unit, newState.map, unitPositions);
    if (range.length > 0) {
      const unexplored = range.filter(
        coord => civ.visibility.tiles[hexKey(coord)] !== 'visible',
      );
      const candidates = unexplored.length > 0 ? unexplored : range;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      newState.units[unit.id] = moveUnit(unit, target, 1);
      delete unitPositions[hexKey(unit.position)];
      unitPositions[hexKey(target)] = unit.id;
    }
  }

  // --- Handle research (personality-driven) ---
  if (!civ.techState.currentResearch) {
    const available = getAvailableTechs(civ.techState);
    if (available.length > 0) {
      const chosen = chooseTech(personality, available);
      newState.civilizations[civId].techState = startResearch(civ.techState, chosen.id);
      bus.emit('tech:started', { civId, techId: chosen.id });
    }
  }

  // --- Handle city production (personality-driven) ---
  const isUnderThreat = militaryUnits.length < civ.cities.length;
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (city && city.productionQueue.length === 0) {
      const availableItems = ['warrior', 'scout', 'granary', 'settler'];
      const chosen = chooseProduction(personality, availableItems, isUnderThreat, civ.cities.length);
      city.productionQueue = [chosen];
    }
  }

  // --- Handle diplomacy ---
  if (civ.diplomacy) {
    const selfStrength = militaryUnits.reduce((sum, u) => {
      const def = newState.units[u.id];
      return sum + (def?.health ?? 0);
    }, 0);

    const otherStrengths: Record<string, number> = {};
    for (const [otherId, otherCiv] of Object.entries(newState.civilizations)) {
      if (otherId === civId) continue;
      const otherMil = otherCiv.units
        .map(id => newState.units[id])
        .filter((u): u is Unit => u !== undefined && u.type === 'warrior');
      otherStrengths[otherId] = otherMil.reduce((sum, u) => sum + u.health, 0);
    }

    const decisions = evaluateDiplomacy(
      personality,
      civ.diplomacy,
      civ.techState.completed,
      newState.era,
      otherStrengths,
      selfStrength,
    );

    for (const decision of decisions) {
      switch (decision.action) {
        case 'declare_war':
          newState.civilizations[civId].diplomacy = declareWar(
            civ.diplomacy, decision.targetCiv, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = declareWar(
              newState.civilizations[decision.targetCiv].diplomacy, civId, newState.turn,
            );
          }
          bus.emit('diplomacy:war-declared', { attackerId: civId, defenderId: decision.targetCiv });
          break;
        case 'request_peace':
          newState.civilizations[civId].diplomacy = makePeace(
            civ.diplomacy, decision.targetCiv, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = makePeace(
              newState.civilizations[decision.targetCiv].diplomacy, civId, newState.turn,
            );
          }
          bus.emit('diplomacy:peace-made', { civA: civId, civB: decision.targetCiv });
          break;
        case 'non_aggression_pact':
        case 'trade_agreement':
        case 'open_borders':
        case 'alliance':
          newState.civilizations[civId].diplomacy = proposeTreaty(
            civ.diplomacy, decision.targetCiv, decision.action,
            decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
          );
          if (newState.civilizations[decision.targetCiv]?.diplomacy) {
            newState.civilizations[decision.targetCiv].diplomacy = proposeTreaty(
              newState.civilizations[decision.targetCiv].diplomacy, civId, decision.action,
              decision.action === 'non_aggression_pact' ? 10 : -1, newState.turn,
            );
          }
          bus.emit('diplomacy:treaty-accepted', { civA: civId, civB: decision.targetCiv, treaty: decision.action });
          break;
      }
    }
  }

  // --- Minor civ diplomacy ---
  if (newState.minorCivs) {
    const mcDecisions = evaluateMinorCivDiplomacy(
      personality, newState.minorCivs, civId, civ.gold,
    );
    for (const d of mcDecisions) {
      if (d.action === 'gift_gold') {
        const mc = newState.minorCivs[d.mcId];
        if (mc && civ.gold >= 25) {
          newState.civilizations[civId].gold -= 25;
          mc.diplomacy = modifyRelationship(mc.diplomacy, civId, 10);
        }
      }
    }
  }

  // AI espionage decisions
  if (shouldAiRecruitSpy(newState, civId)) {
    const espState = newState.espionage?.[civId];
    if (espState) {
      const { state: newEsp, spy } = recruitSpy(espState, civId, `ai-recruit-${newState.turn}-${civId}`);
      newState.espionage![civId] = newEsp;

      const target = chooseAiSpyTarget(newState, civId);
      if (target) {
        newState.espionage![civId] = assignSpy(
          newState.espionage![civId], spy.id, target.civId, target.cityId, target.position,
        );
      }
    }
  }

  // Start missions for stationed spies without active missions
  const espState = newState.espionage?.[civId];
  if (espState) {
    for (const spy of Object.values(espState.spies)) {
      if (spy.status === 'stationed' && !spy.currentMission) {
        const mission = chooseAiMission(newState, civId);
        if (mission) {
          newState.espionage![civId] = startMission(newState.espionage![civId], spy.id, mission);
        }
      }
    }
  }

  // Update AI visibility
  const civUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = civ.cities
    .map(id => newState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);

  return newState;
}

// --- AI Espionage Decision Functions ---

export function shouldAiRecruitSpy(state: GameState, aiCivId: string): boolean {
  const civ = state.civilizations[aiCivId];
  if (!civ) return false;
  const hasEspTech = civ.techState.completed.some(t => t.startsWith('espionage-'));
  if (!hasEspTech) return false;
  const espState = state.espionage?.[aiCivId];
  if (!espState) return false;
  return canRecruitSpy(espState);
}

export function chooseAiSpyTarget(
  state: GameState,
  aiCivId: string,
): { civId: string; cityId: string; position: HexCoord } | null {
  const aiDip = state.civilizations[aiCivId]?.diplomacy;
  if (!aiDip) return null;

  const targets: Array<{ civId: string; score: number }> = [];
  for (const [civId, relationship] of Object.entries(aiDip.relationships)) {
    if (civId === aiCivId) continue;
    const civ = state.civilizations[civId];
    if (!civ || civ.cities.length === 0) continue;
    let score = Math.abs(Math.min(0, relationship));
    if (aiDip.atWarWith.includes(civId)) score += 100;
    targets.push({ civId, score });
  }

  targets.sort((a, b) => b.score - a.score);
  if (targets.length === 0) return null;

  const bestCivId = targets[0].civId;
  const targetCiv = state.civilizations[bestCivId];
  const firstCityId = targetCiv.cities[0];
  const city = state.cities[firstCityId];
  if (!city) return null;

  return { civId: bestCivId, cityId: firstCityId, position: city.position };
}

export function chooseAiMission(
  state: GameState,
  aiCivId: string,
): SpyMissionType | null {
  const civ = state.civilizations[aiCivId];
  if (!civ) return null;
  const available = getAvailableMissions(civ.techState.completed);
  if (available.length === 0) return null;

  const preferredOrder: SpyMissionType[] = [
    'gather_intel', 'monitor_troops', 'monitor_diplomacy',
    'identify_resources', 'scout_area',
  ];
  for (const mission of preferredOrder) {
    if (available.includes(mission)) return mission;
  }
  return available[0];
}
