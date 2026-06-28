import type { GameState } from '@/core/types';
import { isOpponentChallenge } from '@/core/opponent-challenge';
import {
  autoSave,
  initializeLegacyOpponentChallenge,
  normalizeLoadedState,
  rewriteLoadedSaveEntry,
  type LoadedSaveEntry,
} from '@/storage/save-manager';
import {
  showLegacyOpponentChallengePrompt,
} from '@/ui/legacy-opponent-challenge-prompt';

export type CampaignEntryCandidate =
  | { kind: 'stored'; loaded: LoadedSaveEntry }
  | { kind: 'import'; state: GameState };

export interface CampaignEntryDependencies {
  purposefulAIEnabled: boolean;
  persistStoredChoice: typeof rewriteLoadedSaveEntry;
  persistImport: typeof autoSave;
  showChallengePrompt: typeof showLegacyOpponentChallengePrompt;
  onReady: (state: GameState) => void;
}

export function beginCampaignEntry(
  candidate: CampaignEntryCandidate,
  invoker: HTMLButtonElement,
  dependencies: CampaignEntryDependencies,
): Promise<'entered' | 'cancelled'> {
  const rawState = candidate.kind === 'stored' ? candidate.loaded.state : candidate.state;
  const normalized = normalizeLoadedState(structuredClone(rawState));

  const enter = async (state: GameState): Promise<'entered'> => {
    if (candidate.kind === 'import') {
      await dependencies.persistImport(state);
    }
    dependencies.onReady(state);
    return 'entered';
  };

  if (!dependencies.purposefulAIEnabled || isOpponentChallenge(normalized.opponentChallenge)) {
    return enter(normalized);
  }

  return new Promise<'entered' | 'cancelled'>(resolve => {
    const savePanel = invoker.closest<HTMLElement>('#save-panel');
    const promptContainer = savePanel?.parentElement ?? document.body;
    dependencies.showChallengePrompt(promptContainer, {
      hotSeat: Boolean(normalized.hotSeat),
      returnFocusTo: invoker,
      onCancel: () => {
        resolve('cancelled');
      },
      onContinue: async challenge => {
        const migrated = initializeLegacyOpponentChallenge(normalized, challenge);
        if (candidate.kind === 'stored') {
          await dependencies.persistStoredChoice(candidate.loaded.source, migrated);
        } else {
          await dependencies.persistImport(migrated);
        }
        dependencies.onReady(migrated);
        resolve('entered');
      },
    });
  });
}
