import type { City, GameState } from '@/core/types';
import { makeLegendaryWonderFixture } from '../../systems/helpers/legendary-wonder-fixture';

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  style = { cssText: '', display: '', background: '' };
  dataset: Record<string, string> = {};
  id = '';
  textContent = '';
  innerHTML = '';

  constructor(tagName: string = 'div') {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  hasChildNodes(): boolean {
    return this.children.length > 0;
  }

  remove(): void {}

  addEventListener(): void {}

  querySelector(selector?: string): MockElement | null {
    if (!selector) {
      return null;
    }

    const idMatch = selector.match(/^#(.+)$/);
    if (idMatch) {
      return new MockElement();
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

    return null;
  }

  querySelectorAll(): MockElement[] {
    return [];
  }
}

class MockDocument {
  createElement(tag: string): MockElement {
    return new MockElement(tag);
  }
}

export function collectText(node: unknown): string {
  const current = node as { textContent?: string; children?: unknown[] };
  const childText = (current.children ?? []).map(collectText);
  return [current.textContent, ...childText].filter(Boolean).join(' ');
}

export function makeWonderPanelFixture(): { container: HTMLElement; city: City; state: GameState } {
  (globalThis as typeof globalThis & { document?: Document }).document = new MockDocument() as unknown as Document;

  const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy', 'pilgrimages'], resources: ['stone'] });
  const city = state.cities['city-river'];

  return {
    container: new MockElement() as unknown as HTMLElement,
    city,
    state,
  };
}
