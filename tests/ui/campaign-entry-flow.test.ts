// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { beginCampaignEntry, type CampaignEntryDependencies } from '@/ui/campaign-entry-flow';
import { showLegacyOpponentChallengePrompt } from '@/ui/legacy-opponent-challenge-prompt';
import { normalizeLoadedState } from '@/storage/save-manager';

function makeState(seed: string, challenge: 'explorer' | 'standard' | 'veteran' | null = 'standard') {
  const state = createNewGame(undefined, seed, 'small');
  if (challenge === null) delete state.opponentChallenge;
  else state.opponentChallenge = challenge;
  return state;
}

function makeInvoker(): HTMLButtonElement {
  const savePanel = document.createElement('div');
  savePanel.id = 'save-panel';
  const button = document.createElement('button');
  button.dataset.slotId = 'slot-legacy';
  savePanel.appendChild(button);
  document.body.appendChild(savePanel);
  button.focus();
  return button;
}

function makeDependencies(
  overrides: Partial<CampaignEntryDependencies> = {},
): CampaignEntryDependencies {
  return {
    persistStoredChoice: vi.fn(async () => {}),
    persistImport: vi.fn(async () => {}),
    showChallengePrompt: showLegacyOpponentChallengePrompt,
    onReady: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  document.body.replaceChildren();
});

describe('campaign entry flow', () => {
  it('enters a modern stored campaign without rewriting it', async () => {
    const state = makeState('modern-stored');
    const dependencies = makeDependencies();

    const result = await beginCampaignEntry({
      kind: 'stored',
      loaded: {
        state: normalizeLoadedState(state),
        source: { id: 'slot-modern', kind: 'manual' },
      },
    }, makeInvoker(), dependencies);

    expect(result).toBe('entered');
    expect(dependencies.persistStoredChoice).not.toHaveBeenCalled();
    expect(dependencies.onReady).toHaveBeenCalledWith(expect.objectContaining({
      opponentChallenge: 'standard',
    }));
  });

  it('does not start a legacy campaign until exact-source persistence succeeds', async () => {
    const state = makeState('legacy-retry', null);
    const persistStoredChoice = vi.fn()
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce(undefined);
    const onReady = vi.fn();
    const entry = beginCampaignEntry({
      kind: 'stored',
      loaded: {
        state: normalizeLoadedState(state),
        source: { id: 'slot-legacy', kind: 'manual' },
      },
    }, makeInvoker(), makeDependencies({ persistStoredChoice, onReady }));

    document.querySelector<HTMLButtonElement>('[data-challenge="standard"]')!.click();
    document.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
    await vi.waitFor(() => expect(document.body.textContent).toContain('Could not save your choice'));
    expect(onReady).not.toHaveBeenCalled();
    expect(persistStoredChoice).toHaveBeenCalledWith(
      { id: 'slot-legacy', kind: 'manual' },
      expect.objectContaining({
        opponentChallenge: 'standard',
        opponentAI: expect.objectContaining({ migrationGraceRoundsRemaining: 2 }),
      }),
    );

    document.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();
    await expect(entry).resolves.toBe('entered');
    expect(onReady).toHaveBeenCalledTimes(1);
  });

  it('cancels without persisting or entering and restores invoking focus', async () => {
    const invoker = makeInvoker();
    const dependencies = makeDependencies();
    const entry = beginCampaignEntry({
      kind: 'stored',
      loaded: {
        state: normalizeLoadedState(makeState('legacy-cancel', null)),
        source: { id: 'slot-legacy', kind: 'manual' },
      },
    }, invoker, dependencies);

    document.querySelector<HTMLButtonElement>('[data-action="cancel"]')!.click();

    await expect(entry).resolves.toBe('cancelled');
    expect(dependencies.persistStoredChoice).not.toHaveBeenCalled();
    expect(dependencies.onReady).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(invoker);
    expect(document.querySelector('#save-panel')).not.toBeNull();
  });

  it('autosaves a valid imported campaign before entering it', async () => {
    const callOrder: string[] = [];
    const persistImport = vi.fn(async () => {
      callOrder.push('persist');
    });
    const onReady = vi.fn(() => {
      callOrder.push('ready');
    });

    const result = await beginCampaignEntry(
      { kind: 'import', state: makeState('modern-import') },
      makeInvoker(),
      makeDependencies({ persistImport, onReady }),
    );

    expect(result).toBe('entered');
    expect(callOrder).toEqual(['persist', 'ready']);
  });

  it('prompts and autosaves a legacy or invalid imported campaign before entry', async () => {
    for (const invalidValue of [undefined, 'impossible'] as const) {
      document.body.replaceChildren();
      const state = makeState(`legacy-import-${String(invalidValue)}`, null);
      if (invalidValue) (state as any).opponentChallenge = invalidValue;
      const dependencies = makeDependencies();
      const entry = beginCampaignEntry(
        { kind: 'import', state },
        makeInvoker(),
        dependencies,
      );

      document.querySelector<HTMLButtonElement>('[data-challenge="explorer"]')!.click();
      document.querySelector<HTMLButtonElement>('[data-action="continue"]')!.click();

      await expect(entry).resolves.toBe('entered');
      expect(dependencies.persistImport).toHaveBeenCalledWith(expect.objectContaining({
        opponentChallenge: 'explorer',
      }));
      expect(dependencies.onReady).toHaveBeenCalledTimes(1);
    }
  });

});
