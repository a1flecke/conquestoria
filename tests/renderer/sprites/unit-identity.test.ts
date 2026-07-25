import { describe, expect, it } from 'vitest';
import { ArcherSprite } from '@/renderer/sprites/units';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { getUnitSpriteV2 } from '@/renderer/sprites/v2';

describe('unit sprite ownership identity', () => {
  it('uses the owning faction palette rather than fixed green clothing for archers', () => {
    const imperials = derivePalette('#b53026');
    const vikings = derivePalette('#1d4a8c');
    const imperialArcher = ArcherSprite({ palette: imperials, svgOnly: true });
    const vikingArcher = ArcherSprite({ palette: vikings, svgOnly: true });

    expect(imperialArcher).toContain(imperials.mid);
    expect(vikingArcher).toContain(vikings.mid);
    expect(imperialArcher).not.toContain('#5a6e3a');
    expect(vikingArcher).not.toContain('#5a6e3a');
    expect(imperialArcher).not.toContain('#3a4a20');
    expect(vikingArcher).not.toContain('#3a4a20');
  });

  it('serializes ownership-colored archer clothing for the DOM overlay', () => {
    for (const faction of ['imperials', 'vikings', 'pharaohs', 'hellenes', 'khanate', 'shogunate']) {
      const archer = getUnitSpriteV2('archer', faction);

      expect(archer).not.toContain('#5a6e3a');
      expect(archer).not.toContain('#3a4a20');
    }
  });
});
