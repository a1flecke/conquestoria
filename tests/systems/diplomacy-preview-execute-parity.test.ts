/**
 * #998 — diplomacy's `getAvailableActions` preview vs `applyDiplomaticAction`'s executor
 * switch. Found via this harness: `propose_embargo` and `propose_league` are both offered by
 * `getAvailableActions` (from era 2 / writing tech respectively — very early), but
 * `applyDiplomaticAction`'s switch has no case for either, so its `default: return state;`
 * makes them a complete, silent no-op. Also independently tracked as #1030 ("dead
 * action-surface entries") — this fix (removing the two from the offered set, #1030's own
 * "Option 2") closes both.
 */
import { describe, it, expect, vi } from 'vitest';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { getAvailableActions, applyDiplomaticAction, hasArmsControlTreaty } from '@/systems/diplomacy-system';
import { resolveCivilizationEra, TECH_TREE } from '@/systems/tech-definitions';
import { assertPreviewExecutable } from '../helpers/preview-execute-parity';

function metCivsAtRelationship(): GameState {
  const state = createNewGame(undefined, 'diplomacy-preview-parity', 'small');
  state.civilizations.player.techState.completed = TECH_TREE.filter(t => t.era <= 4).map(t => t.id);
  state.civilizations.player.diplomacy.relationships['ai-1'] = 10;
  state.civilizations['ai-1'].diplomacy.relationships.player = 10;
  state.civilizations.player.knownCivilizations = ['ai-1'];
  state.civilizations['ai-1'].knownCivilizations = ['player'];
  return state;
}

describe('#998 diplomacy preview⇒execute parity', () => {
  it('every action getAvailableActions offers is either applied or produces a communicated outcome', () => {
    const state = metCivsAtRelationship();
    const context = {
      completedTechs: state.civilizations.player.techState.completed,
      civilizationEra: resolveCivilizationEra(state.civilizations.player.techState.completed),
      hasArmsControlTreaty: hasArmsControlTreaty(state, 'player'),
    };
    const offered = getAvailableActions(state.civilizations.player.diplomacy, 'ai-1', context);
    // Sanity: the fixture is actually exercising something, not an empty offer list.
    expect(offered.length).toBeGreaterThan(0);

    assertPreviewExecutable([{
      label: 'diplomacy (player -> ai-1)',
      offered,
      describe: action => action,
      attempt: action => {
        // A proposal to an AI-controlled civ may be genuinely DECLINED (relationship/personality
        // consent) without changing state — that is a real, communicated outcome (a
        // 'diplomacy:*-declined' bus event), not a divergence. Only "changed nothing AND
        // emitted nothing at all" means the action had no execution path whatsoever.
        const bus = new EventBus();
        const emitSpy = vi.spyOn(bus, 'emit');
        const result = applyDiplomaticAction(state, 'player', 'ai-1', action, bus);
        const changedState = result !== state;
        const emittedSomething = emitSpy.mock.calls.length > 0;
        return changedState || emittedSomething
          ? { ok: true }
          : { ok: false, reason: 'applyDiplomaticAction changed nothing and emitted no event at all' };
      },
    }]);
  });
});
