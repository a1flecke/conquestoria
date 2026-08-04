import { describe, it, expect } from 'vitest';
import { applyPersistedUserSettings } from '@/storage/settings-merge';
import type { GameState } from '@/core/types';

function stateWith(councilTalkLevel?: GameState['settings']['councilTalkLevel']): GameState {
  return { settings: { ...(councilTalkLevel ? { councilTalkLevel } : {}) } } as unknown as GameState;
}

function persistedWith(councilTalkLevel?: GameState['settings']['councilTalkLevel']): GameState['settings'] {
  return { ...(councilTalkLevel ? { councilTalkLevel } : {}) } as unknown as GameState['settings'];
}

describe('applyPersistedUserSettings', () => {
  it("keeps the save's own councilTalkLevel over the machine-level preference", () => {
    const state = stateWith('quiet');

    const merged = applyPersistedUserSettings(state, persistedWith('chatty'));

    expect(merged.settings.councilTalkLevel).toBe('quiet');
    expect(merged).toBe(state);
  });

  it('falls back to the persisted user preference when the save has none', () => {
    const merged = applyPersistedUserSettings(stateWith(), persistedWith('chatty'));

    expect(merged.settings.councilTalkLevel).toBe('chatty');
  });

  it("falls back to 'normal' when neither the save nor the user has a preference", () => {
    expect(applyPersistedUserSettings(stateWith(), undefined).settings.councilTalkLevel).toBe('normal');
    expect(applyPersistedUserSettings(stateWith(), persistedWith()).settings.councilTalkLevel).toBe('normal');
  });

  it('does not mutate the state it is given', () => {
    const state = stateWith();

    applyPersistedUserSettings(state, persistedWith('chatty'));

    expect(state.settings.councilTalkLevel).toBeUndefined();
  });
});
