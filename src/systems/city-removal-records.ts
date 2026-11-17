import type { GameState } from '@/core/types';
import { releaseCityMaterialCommitment } from './city-production-materials';
import { removeNationalProjectsHostedBy } from './national-project-system';

/**
 * Everything keyed to a city that must go when the city leaves the map, whoever removes it (a raze, a siege that
 * destroys it): its held material commitment, the national projects it hosts (the owner stops drawing their
 * empire-wide bonus and may rebuild them), its faith record and any legendary-wonder project under way there.
 * Call it while the city still exists; the caller then deletes the city and resolves its units.
 */
export function releaseRecordsOfRemovedCity(state: GameState, cityId: string): GameState {
  let next = removeNationalProjectsHostedBy(releaseCityMaterialCommitment(state, cityId), cityId);
  if (next.cityFaith?.[cityId]) {
    const { [cityId]: _faith, ...cityFaith } = next.cityFaith;
    next = { ...next, cityFaith };
  }
  const projects = Object.entries(next.legendaryWonderProjects ?? {});
  if (projects.some(([, project]) => project.cityId === cityId)) {
    next = {
      ...next,
      legendaryWonderProjects: Object.fromEntries(projects.filter(([, project]) => project.cityId !== cityId)),
    };
  }
  return next;
}
