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
      <g className="cq-sprite-figure">
        <g data-kind="beast-serpent">
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
      <g className="cq-sprite-figure">
        <g data-kind="beast-serpent">
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
      </g>
    </SpriteFrame>
  );
}

const ROC = {
  feather: '#5a6b8a',
  featherDark: '#3c4a63',
  beak: '#d9a23a',
  spark: '#9ed0ff',
};

export function StormRocSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      {/* smaller, more transparent shadow positioned lower — suggests the roc flies high */}
      <Shadow cx={60} cy={110} rx={22} ry={4} opacity={0.18} />
      <g className="cq-sprite-figure">
        <g data-kind="beast-winged">
          <g className="cq-hover-body">
            <g className="cq-wing-l">
              <path d="M58,60 Q34,40 16,48 Q30,56 34,64 Q44,62 58,66 Z" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
              <path d="M22,48 l6,4 M30,46 l5,5 M38,48 l4,5" stroke={ROC.featherDark} strokeWidth="1.5" />
            </g>
            <g className="cq-wing-r">
              <path d="M70,60 Q94,40 112,48 Q98,56 94,64 Q84,62 70,66 Z" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
              <path d="M106,48 l-6,4 M98,46 l-5,5 M90,48 l-4,5" stroke={ROC.featherDark} strokeWidth="1.5" />
            </g>
            {/* body, tail, head */}
            <ellipse cx="64" cy="64" rx="12" ry="16" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M60,78 L56,92 L64,84 L72,92 L68,78 Z" fill={ROC.featherDark} />
            <circle cx="64" cy="48" r="8" fill={ROC.feather} stroke={P.ink.line} strokeWidth="1.5" />
            <path d="M64,50 L72,54 L64,57 Z" fill={ROC.beak} />
            <circle cx="61" cy="47" r="1.8" fill="#ffd34d" />
            {/* storm sparks */}
            <path d="M40,42 l-3,6 4,-1 -3,6 M90,40 l-3,6 4,-1 -3,6" fill="none" stroke={ROC.spark} strokeWidth="1.5" strokeLinecap="round" />
          </g>
        </g>
      </g>
    </SpriteFrame>
  );
}

const HYDRA = {
  scale: '#4a6b4a',
  scaleDark: '#2f4a2f',
  belly: '#7e9a6a',
  eye: '#e0d34d',
};

const DRAGON = {
  scale:    '#1c1c2e',
  scaleDark:'#0d0d1a',
  accent:   '#7a1a1a',
  belly:    '#c8860a',
  wing:     '#d45a0a',
  horn:     '#e8e0cc',
  fire:     '#ff7c2a',
  eye:      '#fff4c8',
};

export function AncientDragonSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g className="cq-shadow-detached">
        <Shadow cx={60} cy={115} rx={34} ry={6} opacity={0.28} />
      </g>
      <g className="cq-sprite-figure">
        <g data-kind="beast-winged">
          <g className="cq-hover-body">
            <g className="cq-wing-l">
              <path d="M60,56 C44,38 26,34 8,40 Q16,50 22,60 Q36,54 50,61 Z" fill={DRAGON.wing} stroke={P.ink.line} strokeWidth="1.2" />
              <path d="M60,56 L26,40 M26,40 L8,40 M26,40 L22,60 M26,40 L50,61" stroke={DRAGON.scaleDark} strokeWidth="1.4" strokeLinecap="round" />
              <path d="M60,56 C44,38 26,34 8,40" stroke={DRAGON.scale} strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d="M60,56 C44,38 26,34 8,40" stroke={DRAGON.accent} strokeWidth="0.8" fill="none" strokeLinecap="round" />
            </g>
            <g className="cq-wing-r">
              <path d="M68,56 C84,38 102,34 120,40 Q112,50 106,60 Q92,54 78,61 Z" fill={DRAGON.wing} stroke={P.ink.line} strokeWidth="1.2" />
              <path d="M68,56 L102,40 M102,40 L120,40 M102,40 L106,60 M102,40 L78,61" stroke={DRAGON.scaleDark} strokeWidth="1.4" strokeLinecap="round" />
              <path d="M68,56 C84,38 102,34 120,40" stroke={DRAGON.scale} strokeWidth="2.6" fill="none" strokeLinecap="round" />
              <path d="M68,56 C84,38 102,34 120,40" stroke={DRAGON.accent} strokeWidth="0.8" fill="none" strokeLinecap="round" />
            </g>
            {/* spiked tail */}
            <path d="M72,64 C64,80 50,90 36,100" stroke={DRAGON.scale} strokeWidth="10" strokeLinecap="round" fill="none" />
            <path d="M72,64 C64,80 50,90 36,100" stroke={DRAGON.scaleDark} strokeWidth="4" strokeLinecap="round" fill="none" />
            <path d="M62,76 l-4,-6 5,3 Z M52,86 l-4,-6 5,3 Z" fill={DRAGON.horn} stroke={P.ink.line} strokeWidth="0.5" />
            {/* hind legs */}
            <path d="M80,66 q8,4 7,14" stroke={DRAGON.scaleDark} strokeWidth="7" strokeLinecap="round" fill="none" />
            <path d="M70,72 q12,2 13,15" stroke={DRAGON.scale} strokeWidth="9" strokeLinecap="round" fill="none" />
            <path d="M82,86 q-3,3 -5,6 M82,86 q0,3 0,6 M82,86 q3,3 4,6" stroke={DRAGON.scale} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* torso */}
            <path d="M46,58 Q44,46 58,44 Q76,42 84,52 Q90,63 82,75 Q72,86 56,84 Q44,80 44,68 Z" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1.4" />
            <path d="M56,44 Q74,42 84,52" stroke={DRAGON.accent} strokeWidth="1.1" fill="none" strokeLinecap="round" />
            {/* belly plates */}
            <ellipse cx="53" cy="64" rx="9" ry="4.5" fill={DRAGON.belly} stroke={P.ink.line} strokeWidth="0.6" />
            <ellipse cx="54" cy="72" rx="8" ry="4" fill={DRAGON.belly} stroke={P.ink.line} strokeWidth="0.6" />
            <ellipse cx="58" cy="79" rx="6.5" ry="3.5" fill={DRAGON.belly} stroke={P.ink.line} strokeWidth="0.6" />
            {/* front legs */}
            <path d="M54,76 q-4,8 -3,14" stroke={DRAGON.scale} strokeWidth="8" strokeLinecap="round" fill="none" />
            <path d="M51,90 q-3,3 -5,6 M51,90 q0,3 0,6 M51,90 q3,3 4,6" stroke={DRAGON.scale} strokeWidth="2.5" strokeLinecap="round" fill="none" />
            {/* neck + head */}
            <path d="M60,56 C62,44 73,38 86,38 C82,46 80,50 76,56 Z" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1.3" />
            <path d="M60,54 C65,45 75,40 85,40" stroke={DRAGON.accent} strokeWidth="1" fill="none" strokeLinecap="round" />
            <path d="M84,40 Q88,30 98,32 Q107,34 107,42 Q105,49 96,50 L88,49 Q82,46 84,40 Z" fill={DRAGON.scale} stroke={P.ink.line} strokeWidth="1.3" />
            {/* horns */}
            <path d="M97,33 Q93,21 84,17 Q93,17 100,26 Q102,30 101,34 Z" fill={DRAGON.horn} stroke={P.ink.line} strokeWidth="0.8" />
            <path d="M88,34 Q85,29 80,25 Q85,25 89,28 Q92,30 92,35 Z" fill={DRAGON.horn} stroke={P.ink.line} strokeWidth="0.8" />
            {/* eye */}
            <circle cx="93" cy="42" r="3.4" fill={DRAGON.fire} />
            <circle cx="93" cy="42" r="1.8" fill={DRAGON.eye} />
            {/* jaw ember */}
            <ellipse cx="104" cy="49" rx="5" ry="3.5" fill={DRAGON.fire} opacity="0.55" />
            <ellipse cx="106" cy="49" rx="3" ry="2.2" fill={DRAGON.eye} opacity="0.6" />
          </g>
        </g>
      </g>
    </SpriteFrame>
  );
}

export function SwampHydraSprite({ svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={95} rx={26} />
      <g className="cq-sprite-figure">
        <g data-kind="beast-serpent">
        {/* squat body in the mire */}
        <ellipse cx="64" cy="80" rx="26" ry="14" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.5" />
        <ellipse cx="64" cy="86" rx="20" ry="7" fill={HYDRA.belly} opacity="0.6" />
        {/* three weaving necks + heads, phase-offset */}
        <g className="cq-segment-1">
          <path d="M52,72 Q40,56 44,44" fill="none" stroke={HYDRA.scale} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="44" cy="42" rx="7" ry="6" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.2" />
          <path d="M38,42 L26,44 L38,46 Z" fill={HYDRA.scaleDark} />
          <circle cx="42" cy="40" r="1.6" fill={HYDRA.eye} />
        </g>
        <g className="cq-segment-2">
          <path d="M64,70 Q64,52 64,40" fill="none" stroke={HYDRA.scale} strokeWidth="8" strokeLinecap="round" />
          <ellipse cx="64" cy="37" rx="7" ry="6" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.2" />
          <path d="M70,37 L82,39 L70,41 Z" fill={HYDRA.scaleDark} />
          <circle cx="66" cy="35" r="1.6" fill={HYDRA.eye} />
        </g>
        <g className="cq-segment-3">
          <path d="M76,72 Q88,56 84,44" fill="none" stroke={HYDRA.scale} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="84" cy="42" rx="7" ry="6" fill={HYDRA.scale} stroke={P.ink.line} strokeWidth="1.2" />
          <path d="M90,42 L102,44 L90,46 Z" fill={HYDRA.scaleDark} />
          <circle cx="86" cy="40" r="1.6" fill={HYDRA.eye} />
        </g>
        {/* marsh bubbles */}
        <circle cx="40" cy="92" r="2" fill="#9ec79e" opacity="0.6" />
        <circle cx="90" cy="90" r="1.5" fill="#9ec79e" opacity="0.6" />
        </g>
      </g>
    </SpriteFrame>
  );
}
