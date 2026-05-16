import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderTerritoryFrontierInfo } from '@/ui/territory-frontier-info';
import type { TerritoryFrontierState } from '@/core/types';

class MockElement {
  children: MockElement[] = [];
  dataset: Record<string, string> = {};
  private ownText = '';

  get textContent(): string {
    return `${this.ownText}${this.children.map(child => child.textContent).join('')}`;
  }

  set textContent(value: string) {
    this.ownText = value;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }
}

describe('renderTerritoryFrontierInfo', () => {
  const originalDocument = globalThis.document;

  beforeEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: new MockDocument() as unknown as Document,
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true,
    });
  });

  it('renders a likely-to-flip frontier title and reason', () => {
    const frontier: TerritoryFrontierState = {
      coord: { q: 5, r: 5 },
      holderCivId: 'player',
      challengerCivId: 'ai-1',
      holderCityId: 'rome',
      challengerCityId: 'athens',
      progress: 8,
      trend: 'likely-to-flip',
      reason: 'ai-1 cultural pressure is challenging player.',
    };

    const panel = renderTerritoryFrontierInfo(frontier);

    expect((panel as unknown as MockElement).dataset.territoryFrontier).toBe('likely-to-flip');
    expect(panel.textContent).toContain('Border likely to shift');
    expect(panel.textContent).toContain(frontier.reason);
  });
});
