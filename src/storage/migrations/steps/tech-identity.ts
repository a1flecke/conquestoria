import type { GameState } from '@/core/types';

/**
 * Schema 1 — the era-13 foundation step: give a legacy save a stable `gameId`
 * and rewrite every persisted technology id that was renamed at that boundary.
 *
 * Also the home of `remapPersistedTechId`, which is public API (re-exported from
 * `save-migrations.ts`) because callers outside migration need the same mapping.
 */

export function stableLegacyGameId(state: GameState): string {
  const tileFingerprint = Object.entries(state.map?.tiles ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tileId, tile]) => [tileId, tile.coord.q, tile.coord.r, tile.terrain, tile.resource ?? ''].join(':'))
    .join('|');
  const source = `${state.currentPlayer}|${state.turn}|${tileFingerprint}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

export function remapPersistedTechId(techId: string): string {
  return techId === 'quantum-computing' ? 'cloud-computing' : techId;
}

function remapTechIds(techIds: readonly string[], excluded: ReadonlySet<string> = new Set()): string[] {
  const remapped: string[] = [];
  const seen = new Set(excluded);
  for (const techId of techIds) {
    const mapped = remapPersistedTechId(techId);
    if (seen.has(mapped)) continue;
    seen.add(mapped);
    remapped.push(mapped);
  }
  return remapped;
}

function remapPersistedTechReferences(state: GameState): GameState {
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => {
    if (!civilization.techState) return [civId, civilization];
    const completed = remapTechIds(Array.isArray(civilization.techState.completed) ? civilization.techState.completed : []);
    const currentResearch = typeof civilization.techState.currentResearch === 'string'
      ? remapPersistedTechId(civilization.techState.currentResearch)
      : null;
    const currentIsCompleted = currentResearch !== null && completed.includes(currentResearch);
    const excluded = new Set([...completed, ...(currentIsCompleted || !currentResearch ? [] : [currentResearch])]);
    return [civId, {
      ...civilization,
      techState: {
        ...civilization.techState,
        completed,
        currentResearch: currentIsCompleted ? null : currentResearch,
        researchQueue: remapTechIds(Array.isArray(civilization.techState.researchQueue) ? civilization.techState.researchQueue : [], excluded),
        researchProgress: currentIsCompleted ? 0 : (civilization.techState.researchProgress ?? 0),
      },
    }];
  }));

  const opponentAI = state.opponentAI
    ? {
      ...state.opponentAI,
      majorCivs: Object.fromEntries(Object.entries(state.opponentAI.majorCivs).map(([civId, portfolio]) => [civId, {
        ...portfolio,
        researchTargetTechId: portfolio.researchTargetTechId
          ? remapPersistedTechId(portfolio.researchTargetTechId)
          : null,
      }])),
    }
    : undefined;

  const espionage = state.espionage
    ? Object.fromEntries(Object.entries(state.espionage).map(([civId, civState]) => [civId, {
      ...civState,
      spies: Object.fromEntries(Object.entries(civState.spies).map(([spyId, spy]) => [spyId, {
        ...spy,
        ...(spy.stolenTechFrom ? {
          stolenTechFrom: Object.fromEntries(Object.entries(spy.stolenTechFrom).map(([targetCivId, techIds]) => [
            targetCivId,
            remapTechIds(techIds),
          ])),
        } : {}),
      }])),
    }]))
    : undefined;

  return { ...state, civilizations, ...(opponentAI ? { opponentAI } : {}), ...(espionage ? { espionage } : {}) };
}

export function migrateToEra13Foundation(state: GameState): GameState {
  const withStableIdentity = state.gameId ? state : { ...state, gameId: stableLegacyGameId(state) };
  return remapPersistedTechReferences(withStableIdentity);
}
