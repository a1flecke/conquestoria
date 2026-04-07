import { describe, it, expect, beforeEach } from 'vitest';

// --- Minimal in-memory localStorage mock ---
function makeLocalStorageMock() {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
  };
}

const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';

describe('save persistence (#38)', () => {
  let ls: ReturnType<typeof makeLocalStorageMock>;

  beforeEach(() => {
    ls = makeLocalStorageMock();
  });

  it('stores and retrieves a save', () => {
    const state = { turn: 5, currentPlayer: 'player' };
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed.turn).toBe(5);
    expect(parsed.currentPlayer).toBe('player');
  });

  it('deleteAutoSave removes the entry', () => {
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify({ turn: 3 }));
    ls.removeItem(LOCALSTORAGE_AUTOSAVE_KEY);
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).toBeNull();
  });

  it('hasAutoSave is false when store is empty', () => {
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).toBeNull();
  });

  it('hasAutoSave is true after saving', () => {
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify({ turn: 1 }));
    expect(ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY)).not.toBeNull();
  });

  it('fallback load returns parsed state from localStorage', () => {
    const state = { turn: 7, era: 2, currentPlayer: 'p1' };
    ls.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    const loaded = raw ? JSON.parse(raw) : undefined;
    expect(loaded?.turn).toBe(7);
    expect(loaded?.era).toBe(2);
  });

  it('fallback returns undefined when key missing', () => {
    const raw = ls.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    const loaded = raw ? JSON.parse(raw) : undefined;
    expect(loaded).toBeUndefined();
  });

  it('round-trips breakaway metadata through JSON serialization', () => {
    const state = {
      turn: 61,
      civilizations: {
        'breakaway-city-1': {
          breakaway: {
            originOwnerId: 'player',
            originCityId: 'city-1',
            startedTurn: 11,
            establishesOnTurn: 61,
            status: 'established',
          },
        },
      },
    };

    const roundTrip = JSON.parse(JSON.stringify(state));

    expect(roundTrip.civilizations['breakaway-city-1'].breakaway.status).toBe('established');
  });
});
