import type { GameState, ResourceType } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';

/**
 * #1516 MR19 — grant real resource access in a test fixture.
 *
 * The retired instant market let fixtures write `marketplace.purchasedResources` as a shortcut. That
 * list no longer grants anything at runtime, so tests that need access must create a real source. A
 * completed resource outpost owned by the civilization is the smallest source that needs no city and
 * inherits the live tech-reveal and hostile-occupation rules.
 */
export function grantTestResourceAccess(
  state: GameState,
  civId: string,
  resources: readonly ResourceType[],
): void {
  const civ = state.civilizations[civId];
  if (!civ) throw new Error(`grantTestResourceAccess: unknown civilization ${civId}`);

  resources.forEach((resource, index) => {
    const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === resource);
    if (!definition) throw new Error(`grantTestResourceAccess: unknown resource ${resource}`);
    const coord = { q: 100 + index, r: 100 };
    state.map.tiles[hexKey(coord)] = {
      coord,
      terrain: 'grassland',
      elevation: 'lowland',
      resource,
      improvement: 'resource_outpost',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      owner: civId,
    } as never;
    if (!civ.techState.completed.includes(definition.tech)) {
      civ.techState.completed = [...civ.techState.completed, definition.tech];
    }
  });
}

/** Remove the outpost sources a previous `grantTestResourceAccess` added. */
export function revokeTestResourceAccess(
  state: GameState,
  civId: string,
  resources: readonly ResourceType[],
): void {
  const revoked = new Set<ResourceType>(resources);
  for (const [key, tile] of Object.entries(state.map.tiles)) {
    if (
      tile.owner === civId
      && tile.improvement === 'resource_outpost'
      && revoked.has(tile.resource as ResourceType)
    ) {
      delete state.map.tiles[key];
    }
  }
}
