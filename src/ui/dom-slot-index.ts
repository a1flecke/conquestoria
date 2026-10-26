/**
 * Lookup of the placeholder elements a panel fills with `textContent` after it sets `innerHTML` (the XSS-safe way to show game
 * strings). `root.querySelector('[data-x="id"]')` walks the whole subtree on every call, so a panel that fills one placeholder per
 * list row costs (rows x panel size): the city panel's full building catalogue took ~400 ms to build in a test and over 5 s on a CI
 * runner. This reads each attribute once and answers every later lookup from a Map.
 *
 * It matches `querySelector`: when several elements share a value, the first in document order wins. The index is a snapshot, so
 * it is only for placeholders that exist when the panel is built; an element inserted later must be looked up inside its own
 * (small) subtree instead.
 */
export function createSlotIndex(root: ParentNode): (attribute: string, value: string) => Element | null {
  const byAttribute = new Map<string, Map<string, Element>>();
  return (attribute, value) => {
    let slots = byAttribute.get(attribute);
    if (!slots) {
      slots = new Map();
      for (const el of root.querySelectorAll(`[${attribute}]`)) {
        const slotValue = el.getAttribute(attribute) ?? '';
        if (!slots.has(slotValue)) slots.set(slotValue, el);
      }
      byAttribute.set(attribute, slots);
    }
    return slots.get(value) ?? null;
  };
}
