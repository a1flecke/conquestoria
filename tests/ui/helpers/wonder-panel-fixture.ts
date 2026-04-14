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
  private _listeners: Map<string, Array<() => void>> = new Map();

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

  addEventListener(event: string, handler: () => void): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(handler);
  }

  click(): void {
    for (const handler of this._listeners.get('click') ?? []) {
      handler();
    }
  }

  querySelector(selector?: string): MockElement | null {
    if (!selector) {
      return null;
    }

    const idMatch = selector.match(/^#(.+)$/);
    if (idMatch) {
      // Return a shared element tracked by id so listeners registered on it survive
      const id = idMatch[1];
      const existing = this.children.find(c => c.id === id);
      if (existing) return existing;
      // Create a proxy element stored by id for later retrieval
      const el = new MockElement();
      el.id = id;
      this.children.push(el);
      return el;
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
  const current = node as { textContent?: string; children?: ArrayLike<unknown> };
  const childText = Array.from(current.children ?? []).map(collectText);
  return [current.textContent, ...childText].filter(Boolean).join(' ');
}

export function makeWonderPanelFixture(): { container: HTMLElement; city: City; state: GameState } {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    (globalThis as typeof globalThis & { document?: Document }).document = new MockDocument() as unknown as Document;
  }

  const state = makeLegendaryWonderFixture({ completedTechs: ['philosophy', 'pilgrimages'], resources: ['stone'] });
  const city = state.cities['city-river'];

  return {
    container: new MockElement() as unknown as HTMLElement,
    city,
    state,
  };
}
