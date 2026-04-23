import type { GameState } from '@/core/types';
import { makeBreakawayFixture } from '../../systems/helpers/breakaway-fixture';

class MockElement {
  children: MockElement[] = [];
  style = { cssText: '' };
  dataset: Record<string, string> = {};
  id = '';
  textContent = '';
  innerHTML = '';

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  querySelector(selector?: string): MockElement | null {
    if (!selector) {
      return null;
    }
    const dataTextMatch = selector.match(/^\[data-text="(.+)"\]$/);
    if (dataTextMatch) {
      const key = dataTextMatch[1];
      const parent = this;
      return {
        ...new MockElement(),
        set textContent(value: string) {
          parent.innerHTML = parent.innerHTML.replace(
            new RegExp(`(<[^>]*data-text="${key}"[^>]*>)(.*?)(</[^>]+>)`),
            `$1${value}$3`,
          );
        },
        get textContent() {
          return '';
        },
      } as MockElement;
    }
    if (selector === '#diplo-close') {
      return new MockElement();
    }
    return null;
  }

  querySelectorAll(): MockElement[] {
    return [];
  }

  addEventListener(): void {}
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }
}

function ensureDocument(): Document {
  if (typeof document !== 'undefined' && typeof document.createElement === 'function') {
    return document;
  }
  const mockDocument = new MockDocument() as unknown as Document;
  (globalThis as typeof globalThis & { document?: Document }).document = mockDocument;
  return mockDocument;
}

export function makeDiplomacyFixture({
  currentPlayer = 'player',
  includeBreakaway = true,
  includeThirdCiv = false,
  relationship = 70,
  gold = 250,
}: {
  currentPlayer?: string;
  includeBreakaway?: boolean;
  includeThirdCiv?: boolean;
  relationship?: number;
  gold?: number;
} = {}): { container: HTMLElement; state: GameState } {
  const activeDocument = ensureDocument();

  const base = includeBreakaway
    ? makeBreakawayFixture({ turn: 10, breakawayStartedTurn: 10, includeThirdCiv })
    : makeBreakawayFixture();
  const state = base.state;
  state.currentPlayer = currentPlayer;
  state.pendingDiplomacyRequests = [];

  if (currentPlayer === 'player-2') {
    state.civilizations['player-2'] = {
      ...state.civilizations.player,
      id: 'player-2',
      name: 'Player Two',
      cities: [],
      units: [],
      diplomacy: {
        ...state.civilizations.player.diplomacy,
        relationships: { ...state.civilizations.player.diplomacy.relationships },
      },
    };
  }

  state.civilizations[currentPlayer].gold = gold;

  const breakaway = Object.values(state.civilizations).find(civ => civ.breakaway);
  if (breakaway?.breakaway) {
    breakaway.breakaway.originOwnerId = currentPlayer;
    state.civilizations[currentPlayer].diplomacy.relationships[breakaway.id] = relationship;
    breakaway.diplomacy.relationships[currentPlayer] = relationship;
  }

  return {
    container: activeDocument.createElement('div'),
    state,
  };
}
