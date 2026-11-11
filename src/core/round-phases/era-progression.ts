import type { GameState } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { checkEraAdvancement, processMinorCivEraUpgrade } from '@/systems/minor-civ-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { expireNationalProjects } from '@/systems/national-project-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { grantFreeTech } from '@/systems/tech-system';
import { applyResearchCompletionConsequences } from '@/systems/tech-completion-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Era bookkeeping after the round's production: the world age moves when the check says so (`era:advanced`);
 * expired national projects are removed and announced; queued national projects past their build window are
 * dequeued; each civ whose own era rose this round is announced against the round-start baseline
 * `context.previousEraByCiv`; minor-civ era upgrades run every round because local pressure is derived from nearby
 * and target civilizations, not only from aggregate World Age.
 */
function runEraProgression(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus, previousEraByCiv } = context;
  // --- Era advancement check ---
  const newEra = checkEraAdvancement(newState);
  if (newEra > newState.era) {
    newState.era = newEra;
    bus.emit('era:advanced', { era: newEra });
  }

  const { state: afterExpiry, expired } = expireNationalProjects(newState);
  newState = afterExpiry;
  for (const item of expired) bus.emit('city:national-project-expired', item);
  for (const cityId of Object.keys(newState.cities)) {
      const city = newState.cities[cityId];
      if (!city) continue;
      const staleNPs = city.productionQueue.filter((item: string) => {
        const bldg = BUILDINGS[item];
        const owner = newState.civilizations[city.owner];
        return bldg?.nationalProject && owner && resolveCivilizationEra(owner.techState.completed) > bldg.nationalProject.homeEra + 1;
      });
      if (staleNPs.length === 0) continue;
      newState = {
        ...newState,
        cities: {
          ...newState.cities,
          [cityId]: {
            ...city,
            productionQueue: city.productionQueue.filter((item: string) => {
              const bldg = BUILDINGS[item];
              const owner = newState.civilizations[city.owner];
              return !(bldg?.nationalProject && owner && resolveCivilizationEra(owner.techState.completed) > bldg.nationalProject.homeEra + 1);
            }),
          },
        },
      };
      for (const buildingId of staleNPs) {
        bus.emit('city:national-project-dequeued', { civId: city.owner, cityId, buildingId });
      }
    }

  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    const era = resolveCivilizationEra(civ.techState.completed);
    if (era > (previousEraByCiv[civId] ?? era)) {
      bus.emit('civilization:era-advanced', { civId, previousEra: previousEraByCiv[civId]!, era });
      // Babylon "Cradle of Knowledge" (#1692 A3): one free technology per era entered. Judged against the
      // round-start baseline, so the free technology can never trigger a second grant in the same round.
      if (resolveCivDefinition(newState, civ.civType ?? '')?.bonusEffect.type === 'free_tech_on_era' && !civ.isEliminated) {
        const grant = grantFreeTech(civ.techState);
        if (grant.grantedTech) {
          newState = {
            ...newState,
            civilizations: { ...newState.civilizations, [civId]: { ...civ, techState: grant.state } },
          };
          bus.emit('tech:completed', { civId, techId: grant.grantedTech });
          newState = applyResearchCompletionConsequences(newState, civId, grant.grantedTech, bus);
        }
      }
    }
  }
  // Local minor-civ pressure is derived from nearby/target civilizations, so it
  // must be checked every round rather than only when aggregate World Age moves.
  for (const mc of Object.values(newState.minorCivs)) {
    processMinorCivEraUpgrade(newState, mc);
  }
  return newState;
}

export const eraProgressionPhase: RoundPhase = { id: 'era-progression', run: runEraProgression };
