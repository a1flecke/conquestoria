class MockElement {
  private _innerHTML = '';
  private listeners = new Map<string, Array<() => void>>();
  private ownerDocument: MockDocument;

  constructor(ownerDocument: MockDocument) {
    this.ownerDocument = ownerDocument;
  }

  id = '';
  textContent = '';
  children: MockElement[] = [];
  style = { cssText: '' };
  value = '';

  set innerHTML(value: string) {
    this._innerHTML = value;
    this.ownerDocument.registerMarkup(value);
  }

  get innerHTML(): string {
    return this._innerHTML;
  }

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  remove(): void {}

  addEventListener(type: string, listener: () => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  click(): void {
    for (const listener of this.listeners.get('click') ?? []) {
      listener();
    }
  }
}

class MockDocument {
  private elements = new Map<string, MockElement>();

  registerMarkup(markup: string): void {
    const idPattern = /id="([^"]+)"/g;
    for (const match of markup.matchAll(idPattern)) {
      const id = match[1];
      if (!this.elements.has(id)) {
        const element = new MockElement(this);
        element.id = id;
        this.elements.set(id, element);
      }
    }
  }

  createElement(): MockElement {
    return new MockElement(this);
  }

  getElementById(id: string): MockElement | null {
    return this.elements.get(id) ?? null;
  }
}

export function installSavePanelDocumentMock(): HTMLElement {
  const document = new MockDocument();
  (globalThis as typeof globalThis & { document?: Document }).document = document as unknown as Document;
  return new MockElement(document) as unknown as HTMLElement;
}
