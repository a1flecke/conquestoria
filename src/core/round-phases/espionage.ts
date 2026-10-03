import type { GameState } from '@/core/types';
import { applyResearchBonus, getTechById, getEffectiveTechCost } from '@/systems/tech-system';
import { refreshLastSeenPresentationsForCiv } from '@/systems/last-seen-presentation';
import { applyResearchCompletionConsequences } from '@/systems/tech-completion-system';
import { processEspionageTurn, processInterrogation, applyBuildingCI } from '@/systems/espionage-system';
import { processDetection } from '@/systems/detection-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Espionage for the round. Missions resolve (#1201: `processEspionageTurn` owns their consequences, including
 * flip_loyalty's city transfer and intercept_courier's route removal), detection runs, active interrogations
 * advance and apply the intel they extract (map hints and research progress), infiltrated spies' city vision
 * counts down and keeps the tile visible, embedded spies and buildings add counter-intelligence, and every civ's
 * last-seen presentation is re-snapshotted LAST so tiles spies revealed get a last-seen entry before they fall
 * back to fog.
 */
function runEspionage(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- Process espionage ---
  // #1201: processEspionageTurn owns flip_loyalty's city transfer and
  // intercept_courier's route removal (through the canonical city/trade transitions),
  // so no caller-side event glue is required here.
  newState = processEspionageTurn(newState, bus);
  newState = processDetection(newState, bus);

  // Process active interrogations and apply extracted intel to game state
  for (const [captorId, captorEsp] of Object.entries(newState.espionage ?? {})) {
    if (!captorEsp.activeInterrogations || Object.keys(captorEsp.activeInterrogations).length === 0) continue;
    const seed = `interro-${captorId}-${newState.turn}`;
    const { state: updatedEsp, newIntel } = processInterrogation(captorEsp, seed, newState);
    newState = { ...newState, espionage: { ...newState.espionage!, [captorId]: updatedEsp } };

    for (const intel of newIntel) {
      if (intel.type === 'map_area') {
        const tiles = intel.data.tiles as Array<{ q: number; r: number }>;
        if (newState.civilizations[captorId]?.visibility?.tiles) {
          for (const t of tiles) {
            newState.civilizations[captorId].visibility.tiles[`${t.q},${t.r}`] = 'fog';
          }
        }
      }
      if (intel.type === 'tech_hint') {
        const bonus = intel.data.researchBonus as number;
        const cap = newState.civilizations[captorId];
        if (cap) {
          const currentTechId = cap.techState.currentResearch;
          const currentTech = currentTechId ? getTechById(currentTechId) : undefined;
          const techCost = currentTech ? getEffectiveTechCost(currentTech, cap.techState.completed) : 0;
          const progressGain = techCost > 0 ? Math.floor(bonus * techCost) : 0;
          if (progressGain > 0) {
            const researchResult = applyResearchBonus(cap.techState, progressGain);
            newState = {
              ...newState,
              civilizations: {
                ...newState.civilizations,
                [captorId]: {
                  ...cap,
                  techState: researchResult.state,
                },
              },
            };
            if (researchResult.completedTech) {
              bus.emit('tech:completed', {
                civId: captorId,
                techId: researchResult.completedTech,
                carriedProgress: researchResult.carriedProgress,
                carriedIntoTechId: researchResult.carriedProgress > 0 ? researchResult.state.currentResearch : null,
              });
              newState = applyResearchCompletionConsequences(newState, captorId, researchResult.completedTech, bus);
            }
          }
        }
      }
    }

    if (newIntel.length > 0) {
      bus.emit('espionage:intel-extracted', { captorId, intel: newIntel });
    }
  }

  // Decrement city vision from infiltrated spies and keep tile visible while active
  {
    let espionage = newState.espionage ?? {};
    let civilizations = newState.civilizations;
    for (const [civId, civEsp] of Object.entries(espionage)) {
      let updatedSpies = civEsp.spies;
      let updatedVisibility = civilizations[civId]?.visibility;
      for (const [spyId, spy] of Object.entries(civEsp.spies)) {
        if (!spy.cityVisionTurnsLeft || spy.cityVisionTurnsLeft <= 0) continue;
        const newLeft = spy.cityVisionTurnsLeft - 1;
        updatedSpies = { ...updatedSpies, [spyId]: { ...spy, cityVisionTurnsLeft: newLeft } };
        if (spy.infiltrationCityId && updatedVisibility?.tiles) {
          const city = newState.cities[spy.infiltrationCityId];
          if (city) {
            updatedVisibility = {
              ...updatedVisibility,
              tiles: { ...updatedVisibility.tiles, [`${city.position.q},${city.position.r}`]: 'visible' },
            };
          }
        }
      }
      if (updatedSpies !== civEsp.spies) {
        espionage = { ...espionage, [civId]: { ...civEsp, spies: updatedSpies } };
      }
      if (updatedVisibility !== civilizations[civId]?.visibility) {
        civilizations = { ...civilizations, [civId]: { ...civilizations[civId], visibility: updatedVisibility! } };
      }
    }
    newState = { ...newState, espionage, civilizations };
  }

  // Embedded spy per-turn CI contribution
  {
    let espionage = newState.espionage ?? {};
    for (const [civId, civEsp] of Object.entries(espionage)) {
      let ci = civEsp.counterIntelligence;
      let changed = false;
      for (const spy of Object.values(civEsp.spies)) {
        if (spy.status !== 'embedded' || !spy.targetCityId) continue;
        const perTurnBonus = 2 + Math.floor(spy.experience * 0.1);
        ci = { ...ci, [spy.targetCityId]: Math.min(100, (ci[spy.targetCityId] ?? 0) + perTurnBonus) };
        changed = true;
      }
      if (changed) {
        espionage = { ...espionage, [civId]: { ...civEsp, counterIntelligence: ci } };
      }
    }
    newState = { ...newState, espionage };
  }

  // Building CI bonuses per turn (Intelligence Agency + Security Bureau)
  {
    let espionage = newState.espionage ?? {};
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      if (!espionage[civId]) continue;
      for (const cityId of civ.cities) {
        const city = newState.cities[cityId];
        if (!city) continue;
        const updated = applyBuildingCI(cityId, city, espionage[civId], civ.techState.completed);
        if (updated !== espionage[civId]) {
          espionage = { ...espionage, [civId]: updated };
        }
      }
    }
    newState = { ...newState, espionage };
  }

  // Re-snapshot all civs after espionage so spy-revealed tiles get lastSeen entries
  // before they transition back to fog. This must run after all visibility.tiles mutations
  // in the espionage block (processEspionageTurn, processDetection, spy city vision).
  for (const civId of Object.keys(newState.civilizations)) {
    newState = refreshLastSeenPresentationsForCiv(newState, civId);
  }
  return newState;
}

export const espionagePhase: RoundPhase = { id: 'espionage', run: runEspionage };
