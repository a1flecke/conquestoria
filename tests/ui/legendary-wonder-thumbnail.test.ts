// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  createLegendaryWonderThumbnail,
  legendaryWonderIdFromQueueItem,
} from '@/renderer/wonders/legendary-wonder-art-thumbnail';
import { LEGENDARY_WONDER_ART_IDS } from '@/renderer/wonders/legendary-wonder-art-catalog';
import { resolveAppAssetUrl } from '@/renderer/asset-url';

describe('legendaryWonderIdFromQueueItem (#613)', () => {
  it('strips exactly one legendary: prefix', () => {
    expect(legendaryWonderIdFromQueueItem('legendary:crystal-palace')).toBe('crystal-palace');
  });

  it.each(['warrior', '', 'legendary:', 'crystal-palace', 'LEGENDARY:crystal-palace'])('rejects %j', itemId => {
    expect(legendaryWonderIdFromQueueItem(itemId)).toBeNull();
  });
});

describe('createLegendaryWonderThumbnail (#613)', () => {
  it.each(LEGENDARY_WONDER_ART_IDS)('%s gets a decorative, safe, local image', id => {
    const img = createLegendaryWonderThumbnail(id, 28)!;
    expect(img).toBeInstanceOf(HTMLImageElement);
    expect(img.getAttribute('src')).toBe(resolveAppAssetUrl(`images/wonders/art/${id}.png`));
    expect(img.getAttribute('alt')).toBe('');
    expect(img.getAttribute('aria-hidden')).toBe('true');
    expect(img.dataset.wonderArt).toBe(id);
    expect(img.width).toBe(28);
    expect(img.height).toBe(28);
    expect(img.getAttributeNames().filter(name => name.startsWith('on'))).toEqual([]);
  });

  it.each(['eiffel-tower', '', '__proto__', 'legendary:crystal-palace'])('returns null for %j', id => {
    expect(createLegendaryWonderThumbnail(id, 28)).toBeNull();
  });

  it.each([0, -4, Number.NaN, Number.POSITIVE_INFINITY])('returns null for size %s', size => {
    expect(createLegendaryWonderThumbnail('crystal-palace', size)).toBeNull();
  });

  it('composes with queue ids: art for an in-scope queue item, none for an out-of-scope or legacy one', () => {
    const forQueueItem = (itemId: string) => {
      const id = legendaryWonderIdFromQueueItem(itemId);
      return id ? createLegendaryWonderThumbnail(id, 20) : null;
    };
    expect(forQueueItem('legendary:suez-canal')).not.toBeNull();
    expect(forQueueItem('legendary:eiffel-tower')).toBeNull();
    expect(forQueueItem('legendary:nope')).toBeNull();
    expect(forQueueItem('warrior')).toBeNull();
  });
});
