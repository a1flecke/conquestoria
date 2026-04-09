import type { GameState } from '@/core/types';
import { makeAutoExploreFixture } from '../../systems/helpers/auto-explore-fixture';

export function makeDesktopControlFixture(options: { autoExploreActive?: boolean } = {}): {
  state: GameState;
  container: HTMLDivElement;
  unitId: string;
} {
  const { state, unitId } = makeAutoExploreFixture({ safeFogNorth: true });
  if (!options.autoExploreActive) {
    delete (state.units[unitId] as any).automation;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);

  return { state, container, unitId };
}
