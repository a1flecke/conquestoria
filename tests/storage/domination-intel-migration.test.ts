import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';

describe('Domination intelligence migration', () => {
  it('initializes an empty ledger for a pre-MR2 save without inferring historical defeats', () => {
    const legacy = createNewGame('egypt', 'domination-intel-legacy');
    delete legacy.dominationIntel;
    legacy.saveSchemaVersion = 28;

    const loaded = normalizeLoadedState(legacy);

    expect(loaded.dominationIntel).toEqual({});
  });

  it('preserves valid earned history while dropping malformed observers and reports', () => {
    const current = createNewGame('egypt', 'domination-intel-repair');
    current.turn = 12;
    current.dominationIntel = {
      player: {
        defeatsByCivId: {
          'breakaway-that-no-longer-exists': {
            civId: 'breakaway-that-no-longer-exists',
            civName: 'Former Breakaway',
            observedTurn: 4,
            defeatedById: null,
            source: 'witness',
          },
          malformed: {
            civId: 'not-the-map-key',
            civName: 'Forged',
            observedTurn: Number.NaN,
            defeatedById: 'ai-1',
            source: 'participant',
          },
        },
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: 8,
            contenderRole: 'independent',
            directVassalIds: ['ai-2', 'ai-2', 'player'],
            defeatedCivIds: ['gone-civ', 'gone-civ'],
          },
          future: {
            contenderId: 'future',
            observedTurn: 13,
            contenderRole: 'independent',
            directVassalIds: [],
            defeatedCivIds: [],
          },
          malformed: {
            contenderId: 'malformed',
            observedTurn: 4,
            contenderRole: 'emperor',
            directVassalIds: 'ai-2',
            defeatedCivIds: [],
          },
        },
      },
      'missing-observer': {
        defeatsByCivId: {},
        reportsByContenderId: {},
      },
    } as unknown as NonNullable<typeof current.dominationIntel>;

    const loaded = normalizeLoadedState(current);

    expect(loaded.dominationIntel).toEqual({
      player: {
        defeatsByCivId: {
          'breakaway-that-no-longer-exists': {
            civId: 'breakaway-that-no-longer-exists',
            civName: 'Former Breakaway',
            observedTurn: 4,
            defeatedById: null,
            source: 'witness',
          },
        },
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: 8,
            contenderRole: 'independent',
            directVassalIds: ['ai-2', 'player'],
            defeatedCivIds: ['gone-civ'],
          },
        },
      },
    });
  });

  it('does not reconstruct hidden historical defeats when repairing malformed data', () => {
    const current = createNewGame('egypt', 'domination-intel-no-backfill');
    current.dominationIntel = [] as unknown as NonNullable<typeof current.dominationIntel>;

    const loaded = normalizeLoadedState(current);

    expect(loaded.dominationIntel).toEqual({});
  });

  it('drops records for non-major observers and impossible self-referential reports', () => {
    const current = createNewGame('egypt', 'domination-intel-repair-owner-kind');
    current.dominationIntel = {
      rebels: {
        defeatsByCivId: {},
        reportsByContenderId: {},
      },
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: current.turn,
            contenderRole: 'independent',
            directVassalIds: ['ai-1', 'ai-2'],
            defeatedCivIds: ['ai-1', 'ai-2', 'beasts'],
          },
        },
      },
    } as unknown as NonNullable<typeof current.dominationIntel>;

    const loaded = normalizeLoadedState(current);

    expect(loaded.dominationIntel).toEqual({
      player: {
        defeatsByCivId: {},
        reportsByContenderId: {
          'ai-1': {
            contenderId: 'ai-1',
            observedTurn: current.turn,
            contenderRole: 'independent',
            directVassalIds: ['ai-2'],
            defeatedCivIds: [],
          },
        },
      },
    });
  });
});
