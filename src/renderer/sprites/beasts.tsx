import {
  MATERIAL_PALETTE as P,
  Shadow,
  SpriteFrame,
} from './sprite-system';
import type { UnitSpriteProps } from './units';

/**
 * Legendary beasts use fixed palettes — they have no faction owner, so the
 * `palette` prop is accepted (catalog contract) but intentionally unused.
 * No Banner — beasts fly no flag.
 */

const BOAR = {
  hide: '#6b4a32',
  hideDark: '#4d3422',
  belly: '#8a6a4e',
  tusk: '#e8e0cc',
  eye: '#c43b2e',
};

export function GiantBoarSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={26} />
      {/* hind legs */}
      <rect x="44" y="78" width="8" height="18" rx="3" fill={BOAR.hideDark} />
      <rect x="55" y="78" width="8" height="18" rx="3" fill={BOAR.hide} />
      {/* front legs */}
      <rect x="74" y="78" width="8" height="18" rx="3" fill={BOAR.hideDark} />
      <rect x="84" y="78" width="8" height="18" rx="3" fill={BOAR.hide} />
      {/* massive body */}
      <ellipse cx="66" cy="68" rx="30" ry="20" fill={BOAR.hide} stroke={P.ink.line} strokeWidth="1.5" />
      <ellipse cx="66" cy="76" rx="26" ry="11" fill={BOAR.belly} opacity="0.7" />
      {/* bristle ridge */}
      <path d="M40,58 Q50,46 66,48 Q82,46 92,56" fill="none" stroke={BOAR.hideDark} strokeWidth="5" strokeLinecap="round" />
      {/* head */}
      <ellipse cx="92" cy="64" rx="14" ry="12" fill={BOAR.hide} stroke={P.ink.line} strokeWidth="1.5" />
      {/* snout */}
      <rect x="100" y="62" width="12" height="9" rx="4" fill={BOAR.hideDark} />
      {/* tusks */}
      <path d="M102,72 Q108,80 114,74" fill="none" stroke={BOAR.tusk} strokeWidth="3.5" strokeLinecap="round" />
      <path d="M100,70 Q105,77 110,72" fill="none" stroke={BOAR.tusk} strokeWidth="3" strokeLinecap="round" />
      {/* glowing eye */}
      <circle cx="94" cy="60" r="2.5" fill={BOAR.eye} />
      {/* ear */}
      <path d="M86,52 L90,44 L95,52 Z" fill={BOAR.hideDark} />
      {/* tail */}
      <path d="M37,64 Q30,60 32,54" fill="none" stroke={BOAR.hideDark} strokeWidth="2.5" strokeLinecap="round" />
    </SpriteFrame>
  );
}
