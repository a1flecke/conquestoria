class MockElement {
  id = '';
  innerHTML = '';
  textContent = '';
  children: MockElement[] = [];
  style = { cssText: '' };

  appendChild(child: MockElement): MockElement {
    this.children.push(child);
    return child;
  }

  remove(): void {}

  addEventListener(): void {}
}

class MockDocument {
  createElement(): MockElement {
    return new MockElement();
  }

  getElementById(): MockElement | null {
    return null;
  }
}

export function installSavePanelDocumentMock(): HTMLElement {
  (globalThis as typeof globalThis & { document?: Document }).document = new MockDocument() as unknown as Document;
  return new MockElement() as unknown as HTMLElement;
}
