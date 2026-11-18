import type { GameState } from '@/core/types';
import { releaseCityMaterialCommitment } from './city-production-materials';
import { removeNationalProjectsHostedBy } from './national-project-system';

/**
 * Everything keyed to a city that must go when the city leaves the map, whoever removes it (a raze, a siege that
 * destroys it): its held material commitment, the national projects it hosts (the owner stops drawing their
 * empire-wide bonus and may rebuild them), its faith record, and any legendary wonder there: a project under way is
 * dropped, and a completed wonder is destroyed with its city, so its former owner stops drawing the bonus and the wonder
 * can be built again (#1755). A captured city keeps its wonder instead (`transferLegendaryWondersForCity`).
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
  const completed = next.completedLegendaryWonders;
  if (completed && Object.values(completed).some(entry => entry.cityId === cityId)) {
    next = {
      ...next,
      completedLegendaryWonders: Object.fromEntries(Object.entries(completed).filter(([, entry]) => entry.cityId !== cityId)),
    };
  }
  return next;
}
