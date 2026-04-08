class MockElement {
  private _innerHTML = '';
  private listeners = new Map<string, Array<() => void>>();
  private ownerDocument: MockDocument;
  private _id = '';

  constructor(ownerDocument: MockDocument) {
    this.ownerDocument = ownerDocument;
  }

  set id(value: string) {
    this._id = value;
    if (value) {
      this.ownerDocument.registerElement(this);
    }
  }

  get id(): string {
    return this._id;
  }
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

  registerElement(element: MockElement): void {
    if (element.id) {
      this.elements.set(element.id, element);
    }
  }

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

export function collectRenderedText(root: { textContent?: string; innerHTML?: string; children?: Array<unknown> }): string {
  const ownText = [root.textContent ?? '', root.innerHTML ?? ''].filter(Boolean).join(' ');
  const childText = (root.children ?? [])
    .map(child => collectRenderedText(child as { textContent?: string; innerHTML?: string; children?: Array<unknown> }))
    .filter(Boolean)
    .join(' ');
  return [ownText, childText].filter(Boolean).join(' ');
}
