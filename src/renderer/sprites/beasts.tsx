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

const WOLF = {
  fur: '#7d8a99',
  furDark: '#55606e',
  belly: '#aab4c0',
  eye: '#d8b13a',
};

export function DireWolfSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={26} />
      <g className="cq-sprite-figure">
        <rect className="cq-leg-l" x="48" y="86" width="6" height="14" rx="3" fill={WOLF.furDark} />
        <rect className="cq-leg-r" x="58" y="86" width="6" height="14" rx="3" fill={WOLF.fur} />
        <rect className="cq-leg-l" x="74" y="86" width="6" height="14" rx="3" fill={WOLF.furDark} />
        <rect className="cq-leg-r" x="82" y="86" width="6" height="14" rx="3" fill={WOLF.fur} />
        {/* lean body, low head, raised hackles */}
        <path d="M44,80 Q42,64 58,62 Q76,58 88,66 L96,60 Q104,58 106,64 Q108,70 100,73 L92,76 Q90,84 76,86 Q56,90 44,80 Z"
          fill={WOLF.fur} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M56,64 Q66,58 80,62" fill="none" stroke={WOLF.furDark} strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="66" cy="82" rx="18" ry="6" fill={WOLF.belly} opacity="0.5" />
        {/* muzzle, fangs, ear, eye, tail */}
        <path d="M104,66 L112,68 L105,71 Z" fill={WOLF.furDark} />
        <path d="M104,70 l2,3 M107,70 l2,3" stroke="#e8e0cc" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M94,58 L97,50 L101,58 Z" fill={WOLF.furDark} />
        <circle cx="98" cy="63" r="2.2" fill={WOLF.eye} />
        <path d="M44,78 Q34,74 33,64" fill="none" stroke={WOLF.fur} strokeWidth="4" strokeLinecap="round" />
      </g>
    </SpriteFrame>
  );
}

const BASILISK = {
  scale: '#2f7d4f',
  scaleDark: '#1d5535',
  frill: '#46b878',
  eye: '#9aedc0',
};

export function EmeraldBasiliskSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={26} />
      <g className="cq-sprite-figure">
        {/* low splayed legs */}
        <rect className="cq-leg-l" x="46" y="88" width="7" height="11" rx="3" fill={BASILISK.scaleDark} />
        <rect className="cq-leg-r" x="60" y="88" width="7" height="11" rx="3" fill={BASILISK.scale} />
        <rect className="cq-leg-l" x="78" y="88" width="7" height="11" rx="3" fill={BASILISK.scaleDark} />
        <rect className="cq-leg-r" x="90" y="88" width="7" height="11" rx="3" fill={BASILISK.scale} />
        {/* long low body + curling tail */}
        <path d="M36,84 Q30,72 42,70 Q40,60 52,62 Q50,52 64,56 Q78,52 86,62 Q100,60 104,70 Q112,74 108,82 Q104,90 88,90 L52,90 Q40,92 36,84 Z"
          fill={BASILISK.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M36,84 Q22,86 20,76 Q19,68 28,68" fill="none" stroke={BASILISK.scale} strokeWidth="5" strokeLinecap="round" />
        {/* dorsal frill */}
        <path d="M48,64 L52,54 L58,62 L64,50 L70,60 L78,52 L84,62" fill={BASILISK.frill} stroke={BASILISK.scaleDark} strokeWidth="1" />
        {/* head with unblinking gem eye */}
        <ellipse cx="104" cy="74" rx="11" ry="8" fill={BASILISK.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M113,73 L120,75 L113,78 Z" fill={BASILISK.scaleDark} />
        <circle cx="106" cy="71" r="3" fill={BASILISK.eye} />
        <circle cx="106" cy="71" r="1.2" fill={P.ink.line} />
        {/* scale texture */}
        <path d="M52,74 q4,-3 8,0 M62,70 q4,-3 8,0 M72,74 q4,-3 8,0" fill="none" stroke={BASILISK.scaleDark} strokeWidth="1" />
      </g>
    </SpriteFrame>
  );
}

const SERPENT = {
  scale: '#2e6e8c',
  scaleDark: '#1c4a61',
  fin: '#5ec0d8',
  eye: '#ffd34d',
};

export function SeaSerpentSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={30} />
      <g data-kind="beast-serpent" className="cq-sprite-figure">
        {/* three coils breaking the water, phase-offset segments */}
        <g className="cq-segment-1">
          <path d="M28,84 Q36,62 48,84" fill="none" stroke={SERPENT.scale} strokeWidth="11" strokeLinecap="round" />
        </g>
        <g className="cq-segment-2">
          <path d="M52,84 Q62,58 74,84" fill="none" stroke={SERPENT.scale} strokeWidth="13" strokeLinecap="round" />
          <path d="M58,68 L62,58 L66,68" fill={SERPENT.fin} />
        </g>
        <g className="cq-segment-3">
          <path d="M78,84 Q88,64 98,82" fill="none" stroke={SERPENT.scale} strokeWidth="11" strokeLinecap="round" />
        </g>
        {/* head rearing */}
        <g className="cq-segment-4">
          <path d="M98,82 Q108,70 104,56 Q102,46 92,48" fill="none" stroke={SERPENT.scale} strokeWidth="10" strokeLinecap="round" />
          <ellipse cx="91" cy="49" rx="9" ry="7" fill={SERPENT.scale} stroke={P.ink.line} strokeWidth="1.5" />
          <path d="M83,50 L76,52 L83,55 Z" fill={SERPENT.scaleDark} />
          <circle cx="89" cy="47" r="2.4" fill={SERPENT.eye} />
          <path d="M92,42 L95,34 L98,43" fill={SERPENT.fin} />
        </g>
        {/* waterline froth */}
        <path d="M24,86 Q40,82 56,86 Q72,90 88,86 Q100,83 108,86" fill="none" stroke="#bfe6f2" strokeWidth="2" opacity="0.7" />
      </g>
    </SpriteFrame>
  );
}

const WURM = {
  hide: '#b08a52',
  hideDark: '#84653a',
  maw: '#5e2f2a',
  tooth: '#e8e0cc',
};

export function DuneWurmSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={26} />
      <g data-kind="beast-serpent" className="cq-sprite-figure">
        {/* erupting body arc */}
        <g className="cq-segment-1">
          <path d="M40,92 Q44,60 64,52 Q84,46 92,66 Q96,78 90,92" fill="none" stroke={WURM.hide} strokeWidth="16" strokeLinecap="round" />
          <path d="M46,80 q6,-2 10,2 M54,66 q6,-2 10,2 M70,54 q6,-2 10,2" fill="none" stroke={WURM.hideDark} strokeWidth="2" />
        </g>
        {/* tri-split maw */}
        <g className="cq-segment-2">
          <path d="M58,50 L50,34 L64,44 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M64,44 L66,28 L74,44 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M74,44 L86,34 L78,50 Z" fill={WURM.maw} stroke={WURM.hideDark} strokeWidth="1.5" />
          <path d="M58,46 l3,-4 M66,40 l2,-5 M76,46 l3,-4" stroke={WURM.tooth} strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* sand spray */}
        <path d="M34,92 q4,-8 0,-14 M104,92 q-4,-8 0,-14 M44,94 q2,-5 -1,-9" fill="none" stroke="#dcc88e" strokeWidth="2" strokeLinecap="round" opacity="0.8" />
      </g>
    </SpriteFrame>
  );
}
