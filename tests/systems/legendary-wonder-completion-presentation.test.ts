import { describe, expect, it } from 'vitest';
import { buildLegendaryWonderCompletionCeremonyItem } from '@/systems/legendary-wonder-completion-presentation';
import { makeLegendaryWonderFixture } from './helpers/legendary-wonder-fixture';

describe('legendary-wonder-completion-presentation', () => {
  it('builds owner-safe ceremony items from event payloads', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
    });

    expect(item).toMatchObject({
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
      title: 'Legendary Wonder Completed',
      name: 'Oracle of Delphi',
      cityName: 'city-river',
      rewardActiveLabel: 'Reward active',
    });
  });

  it('includes a silent supported legendary completion video preview for the owner', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'starvault-observatory',
      turnCompleted: 42,
    });

    expect(item?.videoPreview).toMatchObject({
      id: 'video-starvault-paranal-observatory',
      wonderId: 'starvault-observatory',
      surface: 'legendary-completion',
      audio: 'silent',
    });
  });

  it('includes a Stage 3B silent legendary completion video preview for the owner', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
    });

    expect(item?.videoPreview).toMatchObject({
      id: 'video-oracle-of-delphi-melies',
      wonderId: 'oracle-of-delphi',
      surface: 'legendary-completion',
      audio: 'silent',
    });
  });

  it('does not invent video previews for unsupported legendary completions', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'internet',
      turnCompleted: 42,
    });

    expect(item?.videoPreview).toBeUndefined();
  });

  it('includes a Stage 3C silent legendary completion video preview for the owner', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'player';

    const item = buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'ironroot-foundry',
      turnCompleted: 72,
    });

    expect(item?.videoPreview).toMatchObject({
      id: 'video-ironroot-foundry-steel-forging',
      wonderId: 'ironroot-foundry',
      surface: 'legendary-completion',
      audio: 'silent',
    });
  });

  it('returns null for wrong-viewer and unknown-wonder events', () => {
    const state = makeLegendaryWonderFixture({ completedTechs: [], resources: [] });
    state.currentPlayer = 'ai-1';

    expect(buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'oracle-of-delphi',
      turnCompleted: 42,
    })).toBeNull();

    state.currentPlayer = 'player';
    expect(buildLegendaryWonderCompletionCeremonyItem(state, {
      civId: 'player',
      cityId: 'city-river',
      wonderId: 'missing-wonder',
      turnCompleted: 42,
    })).toBeNull();
  });
});
