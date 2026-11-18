/**
 * #1755 (W1): a wonder follows its city.
 *
 * Every consumer of a completed legendary wonder (the empire and city yield bonuses, Navigator's Compass, Silk Road,
 * the lunar gateway, air defence, tactical grants, the atlas) reads `completedLegendaryWonders[id].ownerId` as the civ
 * that holds it now. Capture moved only the host city's in-progress project, so a conquered wonder kept paying its
 * former owner, gave the captor neither bonus, and showed the captor a "lost race" for a wonder standing in its city.
 *
 * One function moves everything that belongs to the city: the completed record and any project hosted there. Each
 * path that changes a city's owner calls it (capture, reconquest, loyalty flip, incitement, cession, secession).
 * A razed city is a separate case, not handled here. The record is never deleted: it is the Hall-of-Fame entry.
 */
type WonderOwnershipState = {
  completedLegendaryWonders?: Record<string, { ownerId: string; cityId: string; turnCompleted: number }>;
  legendaryWonderProjects?: Record<string, { wonderId: string; ownerId: string; cityId: string }>;
};

function projectKey(project: { wonderId: string; ownerId: string; cityId: string }): string {
  return `${project.wonderId}:${project.ownerId}:${project.cityId}`;
}

export function transferLegendaryWondersForCity<T extends WonderOwnershipState>(
  state: T,
  cityId: string,
  newOwnerId: string,
): T {
  let next = state;

  const completed = state.completedLegendaryWonders;
  if (completed && Object.values(completed).some(entry => entry.cityId === cityId && entry.ownerId !== newOwnerId)) {
    next = {
      ...next,
      completedLegendaryWonders: Object.fromEntries(Object.entries(completed).map(([wonderId, entry]) => [
        wonderId,
        entry.cityId === cityId ? { ...entry, ownerId: newOwnerId } : entry,
      ])),
    };
  }

  const projects = state.legendaryWonderProjects;
  if (projects && Object.values(projects).some(project => project.cityId === cityId && project.ownerId !== newOwnerId)) {
    next = {
      ...next,
      legendaryWonderProjects: Object.fromEntries(Object.entries(projects).map(([projectId, project]) => {
        if (project.cityId !== cityId) return [projectId, project];
        const moved = { ...project, ownerId: newOwnerId };
        return [projectKey(moved), moved];
      })),
    };
  }

  return next;
}
