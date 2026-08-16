import { describe, it, expect } from 'vitest';
import { applyPersistedUserSettings, applyCouncilTalkLevelOverride } from '@/storage/settings-merge';
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

describe('applyCouncilTalkLevelOverride', () => {
  it("overrides a freshly constructed game's default councilTalkLevel with the persisted preference", () => {
    // Unlike applyPersistedUserSettings, a brand-new game always has SOME
    // default councilTalkLevel already (createNewGame sets 'normal') -- this
    // helper must override it unconditionally, not skip because one is present.
    const state = stateWith('normal');

    const merged = applyCouncilTalkLevelOverride(state, 'chatty');

    expect(merged.settings.councilTalkLevel).toBe('chatty');
  });

  it('returns the state unchanged when no councilTalkLevel is persisted', () => {
    const state = stateWith('normal');

    const merged = applyCouncilTalkLevelOverride(state, undefined);

    expect(merged).toBe(state);
  });

  it('does not mutate the state it is given', () => {
    const state = stateWith('normal');

    applyCouncilTalkLevelOverride(state, 'chatty');

    expect(state.settings.councilTalkLevel).toBe('normal');
  });
});
