import { describe, expect, it, vi } from 'vitest';
import { createCityCapturePanel } from '@/ui/city-capture-panel';

class MockElement {
  children: MockElement[] = [];
  style = { cssText: '' };
  dataset: Record<string, string> = {};
  id = '';
  textContent = '';
  type = '';
  private listeners = new Map<string, Array<() => void>>();

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  addEventListener(event: string, handler: () => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), handler]);
  }

  click(): void {
    for (const handler of this.listeners.get('click') ?? []) {
      handler();
    }
  }

  remove(): void {}

  querySelector<T extends MockElement = MockElement>(selector: string): T | null {
    const action = selector === '[data-action="occupy"]'
      ? 'occupy'
      : selector === '[data-action="raze"]'
        ? 'raze'
        : null;
    if (!action) return null;

    const search = (node: MockElement): MockElement | null => {
      if (node.dataset.action === action) return node;
      for (const child of node.children) {
        const match = search(child);
        if (match) return match;
      }
      return null;
    };

    return search(this) as T | null;
  }
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }

  getElementById(): MockElement | null {
    return null;
  }
}

function collectText(node: MockElement): string {
  return [node.textContent, ...node.children.map(collectText)].join(' ').trim();
}

describe('city-capture-panel', () => {
  it('uses a minimal document shim in the non-DOM panel test environment', () => {
    if (typeof document === 'undefined') {
      (globalThis as typeof globalThis & { document?: Document }).document = new MockDocument() as unknown as Document;
    }
  });

  it('shows occupy and raze outcomes for a newly conquered city', () => {
    const container = document.createElement('div');
    const panel = createCityCapturePanel(container, {
      cityName: 'Athens',
      occupiedPopulation: 3,
      razeGold: 53,
      onOccupy: () => {},
      onRaze: () => {},
    });

    const rendered = collectText(panel as unknown as MockElement);
    expect(rendered).toContain('Occupy');
    expect(rendered).toContain('Raze');
    expect(rendered).toContain('Population 3');
    expect(rendered).toContain('53 gold');
  });

  it('calls the selected callback exactly once', () => {
    const container = document.createElement('div');
    const onOccupy = vi.fn();
    const onRaze = vi.fn();
    const panel = createCityCapturePanel(container, {
      cityName: 'Athens',
      occupiedPopulation: 3,
      razeGold: 53,
      onOccupy,
      onRaze,
    });

    (panel as unknown as MockElement).querySelector('[data-action="occupy"]')?.click();

    expect(onOccupy).toHaveBeenCalledTimes(1);
    expect(onRaze).not.toHaveBeenCalled();
  });
});
