import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  Banner,
  Shadow,
  Humanoid,
  SpriteFrame,
} from './sprite-system';

export type UnitSpriteMotion = 'idle' | 'move-a' | 'move-b';
export type UnitSpriteProps = { palette: FactionPalette; svgOnly?: boolean; motion?: UnitSpriteMotion };

/* === CIVILIAN === */

export function SettlerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g transform="translate(36 78)">
        <circle r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="10" fill="none" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="-10" y1="0" x2="10" y2="0" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="0" y1="-10" x2="0" y2="10" stroke={P.wood.dark} strokeWidth="1" />
        <circle r="2" fill={P.metal.iron} />
      </g>
      <g transform="translate(78 56)">
        <rect x="-10" y="-10" width="20" height="18" rx="3" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-10,-6 L10,-6 M-10,-2 L10,-2 M-10,2 L10,2" stroke={P.ink.soft} strokeWidth="0.6" />
        <Banner x={9} y={-10} palette={palette} scale={0.8} />
      </g>
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.linen} pants={P.cloth.wool} accent={palette.mid} hair={P.ink.soft} />
      <line x1="48" y1="36" x2="44" y2="92" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
    </SpriteFrame>
  );
}

export function WorkerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} hair="#5a3a20"
        hat={<ellipse cx="0" cy="-40" rx="12" ry="3" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.6" />}
      />
      <g transform="translate(82 30) rotate(28)">
        <rect x="-1" y="0" width="2.4" height="46" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-5,46 L5,46 L4,58 L-4,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
      <rect x="58" y="74" width="8" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
    </SpriteFrame>
  );
}

/* === SCOUT FAMILY === */

export function ScoutSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth="#6b7a4a" pants={P.cloth.wool} accent={palette.mid} hair="#3a2a1a"
        hat={<path d="M-10,-38 Q0,-46 10,-38 L10,-34 L-10,-34 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(76 38)">
        <rect x="0" y="-2" width="14" height="4" rx="1" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="12" y="-3" width="3" height="6" fill={P.metal.gold} />
      </g>
      <Banner x={48} y={50} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function ScoutHoundSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={94} rx={24} />
      <g transform="translate(64 70)">
        <path d="M22,-4 Q32,-12 30,-22" stroke="#7a5a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="22" ry="12" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="20" ry="8" fill="#b88a5a" />
        <rect x="-12" y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-2"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="14"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="20"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-18" cy="-4" rx="11" ry="9" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-26,-3 L-32,2 L-26,4 Z" fill="#a07a4a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-14,-12 L-10,-18 L-8,-10 Z" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="-22" cy="-4" r="0.9" fill={P.ink.line} />
        <circle cx="-30" cy="2" r="1.2" fill={P.ink.line} />
        <rect x="-12" y="-6" width="14" height="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-5" cy="-4.5" r="1.3" fill={palette.trim} />
      </g>
    </SpriteFrame>
  );
}

export function WarHoundSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={94} rx={26} />
      <g transform="translate(64 70)">
        <path d="M22,-4 Q32,-8 28,-18" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="13" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="9" fill="#5a3a20" />
        <rect x="-10" y="-8" width="18" height="5" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <polygon points="-8,-8 -6,-12 -4,-8" fill={P.metal.iron} />
        <polygon points="-2,-8 0,-12 2,-8" fill={P.metal.iron} />
        <polygon points="4,-8 6,-12 8,-8" fill={P.metal.iron} />
        <rect x="-12" y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-3"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="13"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="20"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-18" cy="-4" rx="12" ry="10" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-28,-3 L-34,4 L-26,5 Z" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-14,-14 L-10,-20 L-7,-12 Z" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <polygon points="-30,4 -28,8 -26,4" fill={P.cloth.linen} />
        <circle cx="-22" cy="-5" r="1.4" fill={palette.bright} />
        <circle cx="-32" cy="2" r="1.2" fill={P.ink.line} />
      </g>
    </SpriteFrame>
  );
}

export function ShadowWardenSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint="#3a2858">
      <Shadow />
      <path d="M40,40 Q64,30 88,40 L96,98 Q64,108 32,98 Z" fill="#231833" stroke={P.ink.line} strokeWidth="1" />
      <path d="M48,42 Q64,36 80,42 L82,72 L46,72 Z" fill="#382656" stroke={P.ink.line} strokeWidth="0.8" />
      <Humanoid cx={64} cy={70} scale={0.95} cloth="transparent" pants="transparent" accent="transparent" skin={P.skin.cool} hair="#1a1020"
        hat={<path d="M-12,-38 Q0,-50 12,-38 L8,-30 L-8,-30 Z" fill="#1a1020" stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(86 64)">
        <rect x="-3" y="0" width="6" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="0" cy="4" r="2.5" fill={palette.bright} opacity="0.9" />
        <line x1="0" y1="-6" x2="0" y2="0" stroke={P.metal.iron} strokeWidth="0.8" />
      </g>
      <Banner x={42} y={48} palette={palette} scale={0.6} shape="square" />
    </SpriteFrame>
  );
}

/* === MELEE === */

export function WarriorSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a" />
      <g transform="translate(42 64)">
        <circle r="14" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="14" fill={palette.mid} opacity="0.85" />
        <circle r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-12,0 L12,0 M0,-12 L0,12" stroke={palette.dark} strokeWidth="1.2" />
      </g>
      <g transform="translate(86 38) rotate(15)">
        <rect x="-1.2" y="0" width="2.4" height="42" fill={P.wood.dark} />
        <path d="M-7,-6 L7,-6 L9,6 L-9,6 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-7,-6 L7,-6 L7,-2 L-7,-2 Z" fill={P.metal.shine} opacity="0.5" />
      </g>
    </SpriteFrame>
  );
}

export function SwordsmanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g transform="translate(64 70)">
        <ellipse cx="-6" cy="22" rx="4.5" ry="2.5" fill={P.metal.iron} />
        <ellipse cx="6" cy="22" rx="4.5" ry="2.5" fill={P.metal.iron} />
        <path d="M-9,4 Q-10,16 -7,22 L-3,22 Q-4,12 -3,4 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M9,4 Q10,16 7,22 L3,22 Q4,12 3,4 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M0,-22 C16,-20 18,-2 14,10 L-14,10 C-18,-2 -16,-20 0,-22 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <path d="M0,-22 C8,-18 9,-4 7,8 L-7,8 C-9,-4 -8,-18 0,-22 Z" fill={P.metal.shine} opacity="0.4" />
        <path d="M-6,-10 L6,-10 L8,14 L-8,14 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.8" />
        <circle cx="0" cy="2" r="3" fill={palette.trim} />
        <ellipse cx="-15" cy="-12" rx="5" ry="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="15" cy="-12" rx="5" ry="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <circle cx="0" cy="-30" r="9" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-10,-32 Q-9,-42 0,-43 Q9,-42 10,-32 L10,-26 L-10,-26 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-10" y="-29" width="20" height="3" fill={P.ink.line} />
        <rect x="-2" y="-29" width="4" height="3" fill={P.metal.shine} opacity="0.3" />
        <path d="M0,-43 Q-4,-52 0,-56 Q4,-52 0,-43 Z" fill={palette.bright} stroke={palette.dark} strokeWidth="0.6" />
      </g>
      <g transform="translate(86 30) rotate(20)">
        <rect x="-0.8" y="0" width="1.6" height="42" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-5" y="42" width="10" height="2" fill={P.metal.gold} />
        <rect x="-1.5" y="42" width="3" height="8" fill={P.wood.dark} />
        <circle cx="0" cy="52" r="2" fill={P.metal.gold} />
      </g>
      <g transform="translate(42 60)">
        <path d="M-8,-12 L8,-12 L10,4 Q0,18 -10,4 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-6,-10 L6,-10 L8,2 Q0,12 -8,2 Z" fill={palette.dark} opacity="0.6" />
      </g>
    </SpriteFrame>
  );
}

export function PikemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g transform="translate(48 8) rotate(-8)">
        <rect x="-1" y="0" width="2" height="100" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-3,0 L3,0 L4,-12 L0,-18 L-4,-12 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-3" y="-2" width="6" height="2" fill={P.metal.gold} />
      </g>
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a"
        hat={
          <g>
            <path d="M-11,-33 Q-10,-44 0,-44 Q10,-44 11,-33 L11,-28 L-11,-28 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
            <ellipse cx="0" cy="-44" rx="6" ry="2" fill={P.metal.iron} />
          </g>
        }
      />
    </SpriteFrame>
  );
}

/* === RANGED === */

export function ArcherSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth="#5a6e3a" pants={P.cloth.wool} accent={palette.mid} hair="#3a2a1a"
        hat={<path d="M-10,-38 Q0,-48 10,-38 L8,-32 L-8,-32 Z" fill="#3a4a20" stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(84 40)">
        <path d="M0,-22 Q12,0 0,22" fill="none" stroke={P.wood.dark} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="0" y1="-22" x2="0" y2="22" stroke={P.cloth.linen} strokeWidth="0.6" />
        <line x1="0" y1="0" x2="-10" y2="0" stroke={P.cloth.linen} strokeWidth="0.8" />
        <polygon points="-12,-1 -10,0 -12,1 -16,0" fill={P.metal.iron} />
      </g>
      <g transform="translate(48 56)">
        <rect x="-3" y="-10" width="6" height="20" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-2" y="-14" width="1.5" height="6" fill={P.cloth.linen} />
        <rect x="0" y="-14" width="1.5" height="6" fill={palette.mid} />
        <rect x="2" y="-14" width="1.5" height="6" fill={P.cloth.linen} />
      </g>
    </SpriteFrame>
  );
}

export function MusketeerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.dark} pants="#3a3022" accent={palette.bright} hair="#2a1a10"
        hat={
          <g>
            <path d="M-16,-36 L16,-36 L0,-46 Z" fill="#1a1410" stroke={P.ink.line} strokeWidth="0.8" />
            <ellipse cx="0" cy="-34" rx="14" ry="3" fill="#1a1410" />
            <rect x="-12" y="-37" width="24" height="2" fill={palette.trim} />
          </g>
        }
      />
      <g transform="translate(46 26) rotate(28)">
        <rect x="-1" y="0" width="2" height="56" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-2" y="0" width="4" height="6" fill={P.metal.iron} />
        <path d="M-4,52 L4,52 L3,62 L-3,62 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="0" y="0" width="2" height="2" fill={P.metal.shine} />
      </g>
      <ellipse cx="48" cy="76" rx="4" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={86} y={56} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

/* === NAVAL === */

export function GalleySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <Shadow cx={64} cy={96} rx={42} ry={6} />
      <path d="M16,80 Q64,72 112,80 Q104,98 64,100 Q24,98 16,80 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M22,82 Q64,76 106,82 Q100,90 64,92 Q28,90 22,82 Z" fill={P.wood.light} />
      <circle cx="36" cy="80" r="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="50" cy="78" r="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="64" cy="77" r="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="78" cy="78" r="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="92" cy="80" r="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="28" y1="86" x2="14" y2="96" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="46" y1="86" x2="36" y2="98" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="82" y1="86" x2="92" y2="98" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="100" y1="86" x2="114" y2="96" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="64" y1="78" x2="64" y2="20" stroke={P.wood.dark} strokeWidth="2" />
      <path d="M64,24 L96,40 L96,66 L64,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M64,24 L42,40 L42,66 L64,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="64" y="34" width="32" height="8" fill={palette.mid} opacity="0.8" />
      <rect x="42" y="34" width="22" height="8" fill={palette.mid} opacity="0.8" />
      <Banner x={64} y={20} palette={palette} scale={0.9} />
      <path d="M16,84 L4,90 L16,90 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

export function TriremeSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const oarRows = [0, 1, 2].map(row => (
    <g transform={`translate(0 ${82 + row * 4})`}>
      <line x1="28" y1="0" x2="14" y2={6 + row * 2} stroke={P.wood.dark} strokeWidth="1.6" />
      <line x1="46" y1="0" x2="36" y2={8 + row * 2} stroke={P.wood.dark} strokeWidth="1.6" />
      <line x1="82" y1="0" x2="92" y2={8 + row * 2} stroke={P.wood.dark} strokeWidth="1.6" />
      <line x1="100" y1="0" x2="114" y2={6 + row * 2} stroke={P.wood.dark} strokeWidth="1.6" />
    </g>
  )).join('');
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <Shadow cx={64} cy={98} rx={48} ry={7} />
      <path d="M10,86 Q64,76 118,86 Q108,104 64,106 Q20,104 10,86 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M16,80 Q64,70 112,80 Q102,90 64,92 Q26,90 16,80 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M22,76 Q64,68 106,76 L100,82 L28,82 Z" fill={P.wood.light} />
      {oarRows}
      <rect x="92" y="62" width="18" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="94" y="64" width="3" height="4" fill={P.ink.line} />
      <rect x="100" y="64" width="3" height="4" fill={P.ink.line} />
      <line x1="58" y1="76" x2="58" y2="14" stroke={P.wood.dark} strokeWidth="2.4" />
      <path d="M58,18 L98,38 L98,68 L58,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M58,18 L34,38 L34,68 L58,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="58" y="30" width="40" height="10" fill={palette.mid} opacity="0.85" />
      <rect x="34" y="30" width="24" height="10" fill={palette.mid} opacity="0.85" />
      <circle cx="78" cy="50" r="6" fill={palette.trim} stroke={palette.dark} strokeWidth="0.8" />
      <Banner x={58} y={16} palette={palette} scale={1} />
      <path d="M10,88 L-4,94 L10,96 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M10,90 L-2,94 L10,94 Z" fill={P.metal.gold} opacity="0.7" />
    </SpriteFrame>
  );
}

/* === SPY FAMILY (shared base) === */

function spyBase({ palette, hat, gadget, cloak = '#2a2a32', svgOnly = false }: {
  palette: FactionPalette; hat: string; gadget: string; cloak?: string; svgOnly?: boolean;
}): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint="#241a36">
      <Shadow />
      <path d="M44,40 Q64,36 84,40 L92,98 Q64,104 36,98 Z" fill={cloak} stroke={P.ink.line} strokeWidth="1" />
      <path d="M52,42 L60,98 M76,42 L68,98" stroke={P.ink.line} strokeWidth="0.5" opacity="0.6" />
      <Humanoid cx={64} cy={70} scale={0.95} cloth="transparent" pants="transparent" accent="transparent" skin={P.skin.warm} hair="#1a1410" hat={hat} />
      {gadget}
      <circle cx="58" cy="50" r="2" fill={palette.bright} stroke={palette.dark} strokeWidth="0.4" />
    </SpriteFrame>
  );
}

export function SpyScoutSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    hat: <path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill="#1a1410" />,
    gadget: <g transform="translate(82 56)"><circle r="5" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.6" /><circle r="3" fill={P.ground.water} /></g>,
  });
}

export function SpyInformantSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    hat: <ellipse cx="0" cy="-38" rx="14" ry="4" fill="#1a1410" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-6" width="8" height="12" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" /><line x1="-3" y1="-2" x2="3" y2="-2" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="1" x2="3" y2="1" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="4" x2="3" y2="4" stroke={P.ink.line} strokeWidth="0.5" /></g>,
  });
}

export function SpyAgentSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#1c1c24',
    hat: <path d="M-13,-36 L13,-36 L11,-40 L-11,-40 Z M-15,-36 L15,-36 L15,-34 L-15,-34 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-3" width="10" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="6" cy="0" r="1.4" fill={palette.bright} /></g>,
  });
}

export function SpyOperativeSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#16161c',
    hat: <path d="M-11,-40 Q0,-44 11,-40 L11,-30 L-11,-30 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 56)"><path d="M-2,-8 L2,-8 L2,4 L4,8 L-4,8 L-2,4 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="0" cy="-10" r="2" fill={palette.bright} /></g>,
  });
}

export function SpyHackerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#0e1820',
    hat: <path d="M-12,-40 Q0,-46 12,-40 L12,-28 L-12,-28 Z" fill="#0a0a10" />,
    gadget: (
      <g transform="translate(80 60)">
        <rect x="-7" y="-5" width="14" height="10" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-5" y="-3" width="10" height="6" fill={palette.bright} opacity="0.8" />
        <text x="0" y="1.2" fontSize="3" textAnchor="middle" fontFamily="monospace" fill="#0a0a10">01</text>
      </g>
    ),
  });
}

/* === S4b UNITS (placeholder sprites) === */

export function AxemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a"
        hat={<ellipse cx="0" cy="-38" rx="10" ry="4" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(84 36) rotate(20)">
        <rect x="-1" y="0" width="2" height="36" fill={P.wood.dark} />
        <path d="M-8,-2 L2,-2 L2,16 L-8,12 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-6,0 L0,0 L0,12 L-6,10 Z" fill={P.metal.shine} opacity="0.4" />
      </g>
      <g transform="translate(44 62)">
        <circle r="12" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="12" fill={palette.mid} opacity="0.7" />
        <circle r="2.5" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
    </SpriteFrame>
  );
}

export function SpearmanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g transform="translate(46 6) rotate(-5)">
        <rect x="-1" y="0" width="2" height="108" fill={P.wood.mid} />
        <path d="M-4,0 L4,0 L5,-14 L0,-20 L-5,-14 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-4" y="-2" width="8" height="2" fill={P.metal.gold} />
      </g>
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a"
        hat={<path d="M-10,-34 Q0,-42 10,-34 L10,-28 L-10,-28 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />}
      />
    </SpriteFrame>
  );
}

export function HorsemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={40} ry={8} />
      <g transform="translate(64 72)">
        <ellipse cx="0" cy="0" rx="32" ry="18" fill="#a07848" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="-4" rx="28" ry="12" fill="#b8925a" />
        <rect x="-24" y="10" width="8" height="20" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-10" y="12" width="8" height="22" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="10"  y="12" width="8" height="22" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="22"  y="10" width="8" height="20" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-26" cy="-8" rx="14" ry="12" fill="#a07848" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-36,-8 L-42,-2 L-36,0 Z" fill="#a07848" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-22,-20 L-18,-28 L-15,-18 Z" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-14" y="-8" width="28" height="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <Humanoid cx={64} cy={48} scale={0.85} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a" />
    </SpriteFrame>
  );
}

export function CavalrySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={42} ry={8} />
      <g transform="translate(64 72)">
        <ellipse cx="0" cy="0" rx="34" ry="18" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="-4" rx="30" ry="12" fill="#5a3a20" />
        <rect x="-26" y="10" width="8" height="20" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-12" y="12" width="8" height="22" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="10"  y="12" width="8" height="22" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="24"  y="10" width="8" height="20" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-28" cy="-8" rx="15" ry="13" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-38,-6 L-46,0 L-38,2 Z" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-24,-22 L-20,-30 L-16,-20 Z" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-14" y="-8" width="28" height="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <Humanoid cx={64} cy={44} scale={0.85} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} hair="#2a1a10"
        hat={<path d="M-10,-34 Q0,-42 10,-34 L10,-28 L-10,-28 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(80 28) rotate(15)">
        <rect x="-1" y="0" width="2" height="52" fill={P.wood.dark} />
        <path d="M-4,-4 L4,-4 L5,-14 L0,-20 L-5,-14 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
    </SpriteFrame>
  );
}

export function KnightSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={44} ry={9} />
      <g transform="translate(64 72)">
        <ellipse cx="0" cy="0" rx="36" ry="20" fill="#2a1a10" stroke={P.ink.line} strokeWidth="1.2" />
        <rect x="-18" y="-6" width="36" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="0" cy="-6" rx="34" ry="10" fill="#4a3020" />
        <rect x="-28" y="10" width="9" height="22" fill="#1a1008" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-12" y="12" width="9" height="24" fill="#1a1008" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="10"  y="12" width="9" height="24" fill="#1a1008" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="26"  y="10" width="9" height="22" fill="#1a1008" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-30" cy="-8" rx="16" ry="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M-42,-6 L-50,2 L-40,3 Z" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-26,-24 L-22,-34 L-18,-22 Z" fill="#1a1008" stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      <g transform="translate(64 44)">
        <path d="M-12,-2 Q-14,-16 0,-20 Q14,-16 12,-2 L12,12 L-12,12 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-8,-2 Q-8,-12 0,-16 Q8,-12 8,-2 L8,10 L-8,10 Z" fill={P.metal.shine} opacity="0.3" />
        <rect x="-3" y="-18" width="6" height="4" fill={palette.bright} />
        <circle cx="0" cy="-26" r="7" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="1" />
      </g>
      <g transform="translate(82 22) rotate(12)">
        <rect x="-1" y="0" width="2.5" height="54" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-4" y="54" width="8" height="2" fill={P.metal.gold} />
        <path d="M-3,54 L3,54 L2,62 L-2,62 Z" fill={P.wood.dark} />
        <Banner x={0} y={22} palette={palette} scale={0.8} />
      </g>
    </SpriteFrame>
  );
}

export function CrossbowmanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth="#4a5a2a" pants={P.cloth.wool} accent={palette.mid} hair="#3a2a1a"
        hat={<path d="M-10,-36 Q0,-46 10,-36 L8,-30 L-8,-30 Z" fill="#2a3a18" stroke={P.ink.line} strokeWidth="0.8" />}
      />
      <g transform="translate(80 46)">
        <rect x="-2" y="0" width="26" height="5" rx="1" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-6" y="1" width="6" height="4" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M0,-8 Q12,-4 24,0" fill="none" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M0,8 Q12,6 24,5" fill="none" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="0" y1="-8" x2="0" y2="8" stroke={P.cloth.linen} strokeWidth="0.8" />
        <line x1="14" y1="2" x2="0" y2="2" stroke={P.cloth.linen} strokeWidth="0.6" />
        <polygon points="-2,1 0,2 -2,3 -6,2" fill={P.metal.bronze} />
      </g>
      <g transform="translate(44 52)">
        <rect x="-2" y="-8" width="5" height="16" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
    </SpriteFrame>
  );
}

export function CatapultSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={98} rx={50} ry={7} />
      <g transform="translate(64 80)">
        <rect x="-48" y="-8" width="96" height="16" rx="2" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="-36" cy="8" r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
        <circle cx="-36" cy="8" r="4" fill={P.wood.dark} />
        <circle cx="36" cy="8" r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
        <circle cx="36" cy="8" r="4" fill={P.wood.dark} />
        <rect x="-6" y="-8" width="12" height="8" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
      <g transform="translate(64 30) rotate(-55)">
        <rect x="-3" y="0" width="6" height="50" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-12,-6 Q0,-14 12,-6 L8,2 L-8,2 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
      <g transform="translate(44 28)">
        <circle r="8" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
        <circle r="4" fill={P.stone.mid} />
      </g>
      <Banner x={88} y={48} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function BallistaSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={98} rx={44} ry={6} />
      <g transform="translate(64 82)">
        <rect x="-40" y="-6" width="80" height="12" rx="2" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="-28" cy="6" r="8" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="-28" cy="6" r="3" fill={P.wood.dark} />
        <circle cx="28" cy="6" r="8" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="28" cy="6" r="3" fill={P.wood.dark} />
      </g>
      <g transform="translate(64 64)">
        <rect x="-4" y="-14" width="8" height="14" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-24" y="-10" width="48" height="6" rx="1" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-20,-8 Q-10,-24 10,-28" fill="none" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
        <path d="M20,-8 Q10,-24 -10,-28" fill="none" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
        <line x1="-10" y1="-28" x2="10" y2="-28" stroke={P.cloth.linen} strokeWidth="0.8" />
      </g>
      <g transform="translate(64 48)">
        <rect x="-1" y="-18" width="2" height="18" fill={P.metal.iron} />
        <path d="M-3,-18 L3,-18 L2,-26 L0,-30 L-2,-26 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      <Banner x={88} y={54} palette={palette} scale={0.65} />
    </SpriteFrame>
  );
}
