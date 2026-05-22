import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createIconLegendOverlay } from '@/ui/icon-legend';

class MockElement {
  children: MockElement[] = [];
  style: Record<string, string> = { cssText: '' };
  id = '';
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

describe('createIconLegendOverlay', () => {
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

  it('includes resource icon and name when viewer has the enabling tech', () => {
    // animal-husbandry reveals Horses (🐎, strategic)
    const overlay = createIconLegendOverlay(new Set(['animal-husbandry']));
    expect((overlay as unknown as MockElement).textContent).toContain('🐎');
    expect((overlay as unknown as MockElement).textContent).toContain('Horses');
  });

  it('omits the Resources section entirely when viewer has no resource techs', () => {
    const overlay = createIconLegendOverlay(new Set());
    expect((overlay as unknown as MockElement).textContent).not.toContain('Resources');
    expect((overlay as unknown as MockElement).textContent).not.toContain('🐎');
    expect((overlay as unknown as MockElement).textContent).not.toContain('Horses');
  });
});
