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

export function TransportSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <Shadow cx={64} cy={98} rx={44} ry={7} />
      <path d="M14,84 Q64,74 114,84 Q106,101 64,104 Q22,101 14,84 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M22,78 Q64,70 106,78 L100,88 Q64,94 28,88 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,76 Q64,70 98,76 L94,82 L34,82 Z" fill={P.wood.light} />
      <rect x="32" y="66" width="18" height="13" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="54" y="64" width="16" height="15" rx="2" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="76" y="67" width="18" height="12" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M34,68 L48,78 M48,68 L34,78" stroke={P.wood.dark} strokeWidth="0.8" />
      <path d="M56,68 L68,76 M68,68 L56,76" stroke={P.ink.soft} strokeWidth="0.7" />
      <line x1="62" y1="76" x2="62" y2="18" stroke={P.wood.dark} strokeWidth="2.4" />
      <path d="M62,22 L96,42 L96,68 L62,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M62,22 L40,42 L40,68 L62,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="62" y="34" width="34" height="9" fill={palette.mid} opacity="0.82" />
      <rect x="40" y="34" width="22" height="9" fill={palette.mid} opacity="0.82" />
      <path d="M18,88 Q64,96 110,88" fill="none" stroke={P.metal.bronze} strokeWidth="1" opacity="0.8" />
      <Banner x={62} y={18} palette={palette} scale={0.85} />
      <path d="M14,86 L3,92 L14,92 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

/* === NAVAL TRANSPORT TIER (Eras 3–5) === */

export function CarrackSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={99} rx={47} ry={7} />
        {/* HULL — broad and high, x 10–118 */}
        <path d="M10,82 Q64,72 118,82 Q110,103 64,106 Q18,103 10,82 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M18,78 Q64,70 110,78 L104,91 Q64,97 24,91 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M26,76 Q64,70 102,76 L98,82 L30,82 Z" fill={P.wood.light} />
        <path d="M14,85 Q64,93 114,85" fill="none" stroke={P.wood.dark} strokeWidth="1.1" opacity="0.7" />
        {/* three mooring ropes along the hull side */}
        <line x1="50" y1="82" x2="45" y2="92" stroke={P.wood.dark} strokeWidth="0.8" />
        <line x1="64" y1="83" x2="59" y2="93" stroke={P.wood.dark} strokeWidth="0.8" />
        <line x1="78" y1="82" x2="73" y2="92" stroke={P.wood.dark} strokeWidth="0.8" />
        {/* raised FORECASTLE at the bow (left) */}
        <path d="M20,60 L40,60 L40,78 L20,78 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M20,60 L40,60 L40,63 L20,63 Z" fill={P.wood.mid} />
        <path d="M20,60 L20,56 L25,56 L25,60 M30,60 L30,56 L35,56 L35,60" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="27" y="66" width="6" height="8" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
        {/* MAST + yard */}
        <line x1="64" y1="76" x2="64" y2="16" stroke={P.wood.dark} strokeWidth="2.5" />
        <line x1="38" y1="26" x2="92" y2="26" stroke={P.wood.dark} strokeWidth="2" strokeLinecap="round" />
        {/* single large SQUARE SAIL */}
        <path className="cq-sail" d="M40,27 Q64,31 90,27 L87,70 Q64,74 43,70 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M41,44 Q64,48 89,44 L88,57 Q64,61 42,57 Z" fill={palette.mid} opacity="0.9" />
        <circle cx="64.5" cy="50" r="5" fill={palette.trim} stroke={palette.dark} strokeWidth="0.6" />
        <Banner x={64} y={16} palette={palette} scale={0.9} />
        {/* bronze ram + anchor hook at the prow (left) */}
        <path d="M10,84 L0,90 L10,92 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M13,93 Q9,99 13,101" fill="none" stroke={P.metal.bronze} strokeWidth="1.4" strokeLinecap="round" />
      </g>
    </SpriteFrame>
  );
}

export function GalleonSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={101} rx={51} ry={8} />
        {/* HULL — widest, x 8–120 */}
        <path d="M8,84 Q64,72 120,82 Q116,104 64,107 Q14,104 8,84 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M14,80 Q64,70 114,78 L108,92 Q64,98 20,92 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M22,76 Q64,70 106,74 L102,80 L26,80 Z" fill={P.wood.light} />
        <path d="M12,85 Q64,93 116,83" fill="none" stroke={P.metal.gold} strokeWidth="1" opacity="0.55" />
        {/* hull port-holes */}
        <circle cx="40" cy="86" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="56" cy="87" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="72" cy="87" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="88" cy="86" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        {/* FORECASTLE (left) */}
        <path d="M14,62 L30,62 L30,79 L14,80 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M14,62 L30,62 L30,65 L14,65 Z" fill={P.wood.mid} />
        {/* STERN CASTLE (right) — taller, raises the rear deck */}
        <path d="M96,54 L118,54 L116,80 L96,78 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M96,54 L118,54 L118,58 L96,58 Z" fill={P.wood.mid} />
        <rect x="100" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="106" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="111" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
        {/* stern lantern — gold, pulsing */}
        <g transform="translate(116 50)"><g className="cq-glow"><circle r="2.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" /></g></g>
        {/* FOREMAST (shorter) + square sail */}
        <line x1="40" y1="74" x2="40" y2="24" stroke={P.wood.dark} strokeWidth="2.2" />
        <line x1="26" y1="32" x2="54" y2="32" stroke={P.wood.dark} strokeWidth="1.6" strokeLinecap="round" />
        <path className="cq-sail" d="M27,33 Q40,36 53,33 L51,62 Q40,65 29,62 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M28,44 Q40,47 52,44 L51,53 Q40,56 29,53 Z" fill={palette.mid} opacity="0.9" />
        {/* MAINMAST (taller) + larger sail */}
        <line x1="72" y1="74" x2="72" y2="12" stroke={P.wood.dark} strokeWidth="2.4" />
        <line x1="54" y1="22" x2="92" y2="22" stroke={P.wood.dark} strokeWidth="1.8" strokeLinecap="round" />
        <path className="cq-sail" d="M55,23 Q72,27 91,23 L88,66 Q72,70 58,66 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M57,40 Q72,44 89,40 L88,53 Q72,57 58,53 Z" fill={palette.mid} opacity="0.9" />
        <circle cx="72.5" cy="46" r="5" fill={palette.trim} stroke={palette.dark} strokeWidth="0.6" />
        <Banner x={72} y={12} palette={palette} scale={1} />
        {/* prow figurehead wedge (left) */}
        <path d="M8,84 L-2,81 L1,89 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
    </SpriteFrame>
  );
}

export function SteamshipSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={99} rx={45} ry={7} />
        {/* HULL — flat-topped, iron-banded */}
        <path d="M14,80 L114,80 Q118,95 108,100 L20,100 Q10,95 14,80 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M20,80 L108,80 L104,86 L24,86 Z" fill={P.wood.mid} />
        <rect x="16" y="81" width="96" height="3" fill={P.metal.iron} opacity="0.85" />
        {/* iron hull rivets */}
        <circle cx="30" cy="91" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="46" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="62" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="78" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="94" cy="91" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
        {/* small MAST + reduced sail (left of stack) */}
        <line x1="46" y1="80" x2="46" y2="34" stroke={P.wood.dark} strokeWidth="2" />
        <path className="cq-sail" d="M46,36 L64,48 L64,66 L46,70 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path className="cq-sail" d="M46,36 L30,48 L30,66 L46,70 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <rect x="46" y="46" width="18" height="6" fill={palette.mid} opacity="0.85" />
        <rect x="30" y="46" width="16" height="6" fill={palette.mid} opacity="0.85" />
        {/* central SMOKESTACK */}
        <rect x="60" y="42" width="8" height="24" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="59" y="42" width="10" height="3" fill={P.metal.bronze} />
        <rect x="60.5" y="51" width="7" height="1.6" fill={P.ink.soft} opacity="0.6" />
        {/* drifting smoke */}
        <g transform="translate(64 40)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="5" ry="4" fill={P.stone.light} opacity="0.7" />
          <ellipse className="cq-smoke cq-smoke--b" cx="2" cy="0" rx="6" ry="5" fill={P.stone.mid} opacity="0.5" />
          <ellipse className="cq-smoke cq-smoke--c" cx="-2" cy="0" rx="4" ry="3.4" fill={P.stone.light} opacity="0.6" />
        </g>
        {/* side PADDLE WHEEL (right) — spokes spin, top half housed */}
        <g transform="translate(101 88)">
          <circle r="13" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
          <g className="cq-wheel">
            <line x1="-13" y1="0" x2="13" y2="0" stroke={P.wood.light} strokeWidth="1.4" />
            <line x1="0" y1="-13" x2="0" y2="13" stroke={P.wood.light} strokeWidth="1.4" />
            <line x1="-9.2" y1="-9.2" x2="9.2" y2="9.2" stroke={P.wood.light} strokeWidth="1.4" />
            <line x1="-9.2" y1="9.2" x2="9.2" y2="-9.2" stroke={P.wood.light} strokeWidth="1.4" />
          </g>
          <circle r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M-14,0 A14,14 0 0 1 14,0 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
          <rect x="-14" y="-1" width="28" height="2" fill={P.metal.iron} opacity="0.8" />
        </g>
        <Banner x={46} y={34} palette={palette} scale={0.75} />
        {/* bronze prow (left) */}
        <path d="M14,82 L4,86 L14,90 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
    </SpriteFrame>
  );
}

export function TroopTransportSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={101} rx={51} ry={8} />
        {/* HULL — iron grey, flat barge */}
        <path d="M10,78 L118,78 L116,98 Q64,105 12,98 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
        <line x1="12" y1="87" x2="116" y2="87" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
        <line x1="40" y1="79" x2="40" y2="100" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
        <line x1="64" y1="79" x2="64" y2="101" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
        <line x1="88" y1="79" x2="88" y2="100" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
        {/* armoured inner deck (stone) */}
        <path d="M18,70 L110,70 L106,78 L22,78 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
        {/* hull rivets */}
        <circle cx="28" cy="92" r="1.6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="48" cy="93" r="1.6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="80" cy="93" r="1.6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="100" cy="92" r="1.6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
        {/* troop-deck hatches */}
        <rect x="30" y="66" width="12" height="6" rx="1" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="46" y="66" width="12" height="6" rx="1" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="62" y="66" width="12" height="6" rx="1" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        {/* two SMOKESTACKS — different heights */}
        <rect x="52" y="42" width="8" height="30" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="51" y="42" width="10" height="3" fill={P.metal.steel} />
        <rect x="68" y="48" width="8" height="24" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="67" y="48" width="10" height="3" fill={P.metal.steel} />
        <g transform="translate(56 40)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="5" ry="4" fill={P.stone.mid} opacity="0.65" />
          <ellipse className="cq-smoke cq-smoke--c" cx="2" cy="0" rx="4" ry="3" fill={P.stone.light} opacity="0.5" />
        </g>
        <g transform="translate(72 46)">
          <ellipse className="cq-smoke cq-smoke--b" cx="0" cy="0" rx="5" ry="4" fill={P.stone.mid} opacity="0.6" />
          <ellipse className="cq-smoke" cx="-2" cy="0" rx="3.4" ry="2.8" fill={P.stone.light} opacity="0.5" />
        </g>
        {/* signal flag at the bow — short pole, no mast */}
        <line x1="22" y1="60" x2="22" y2="72" stroke={P.wood.dark} strokeWidth="1.2" />
        <rect x="22" y="58" width="10" height="6" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" />
        {/* faction shield emblem on the bow */}
        <g transform="translate(20 82)">
          <rect x="-6" y="-6" width="12" height="13" rx="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
          <circle cx="0" cy="0" r="3" fill={palette.trim} stroke={palette.dark} strokeWidth="0.5" />
        </g>
        {/* bronze prow (left) */}
        <path d="M10,80 L0,84 L10,88 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
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

/* === Helpers (file-local) === */

function mountedRider({
  cx, cy, scale = 0.85, cloth, accent,
  skin = P.skin.warm, hair = '#3a2a1a', hat = '',
}: {
  cx: number; cy: number; scale?: number;
  cloth: string; accent: string;
  skin?: string; hair?: string; hat?: string;
}): string {
  const t = `translate(${cx} ${cy}) scale(${scale})`;
  return (
    <g transform={t}>
      <path d="M-7,6 Q-8,13 -4,14 L-1,14 Q-2,10 -1,6 Z" fill={cloth} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M7,6 Q8,13 4,14 L1,14 Q2,10 1,6 Z" fill={cloth} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M0,-18 C12,-16 14,-2 10,7 L-10,7 C-14,-2 -12,-16 0,-18 Z" fill={cloth} stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="-10" y="5" width="20" height="2.6" fill={accent} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="-12" cy="-2" rx="3.6" ry="8" fill={cloth} stroke={P.ink.line} strokeWidth="0.7" transform="rotate(-14 -12 -2)" />
      <ellipse cx="12"  cy="-2" rx="3.6" ry="8" fill={cloth} stroke={P.ink.line} strokeWidth="0.7" transform="rotate(14 12 -2)" />
      <circle cx="-14" cy="5" r="2.2" fill={skin} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="14"  cy="5" r="2.2" fill={skin} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="-2.6" y="-22" width="5.2" height="5" fill={skin} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="0" cy="-26" r="8" fill={skin} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M-8,-28 Q-6,-36 0,-36 Q6,-36 8,-28 Q8,-26 6,-25 L-6,-25 Q-8,-26 -8,-28 Z" fill={hair} />
      <circle cx="-2.3" cy="-26" r="0.7" fill={P.ink.line} />
      <circle cx="2.3"  cy="-26" r="0.7" fill={P.ink.line} />
      {hat}
    </g>
  );
}

function dangleBoot({ x, y, cloth }: { x: number; y: number; cloth: string }): string {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-1.4" y="-10" width="2.8" height="9" fill={cloth} stroke={P.ink.line} strokeWidth="0.4" />
      <ellipse cx="0" cy="0" rx="3.6" ry="2" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.4" />
      <path d="M-3,-2 Q0,-4 3,-2" stroke={P.metal.iron} strokeWidth="0.6" fill="none" />
    </g>
  );
}

/* === S4b UNITS (v3 design) === */

export function AxemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.dark} hair="#3a2a1a" />
      {/* round hide shield — left hand */}
      <g transform="translate(46 70)">
        <circle r="11" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="11" fill={palette.mid} opacity="0.45" />
        <circle r="11" fill="none" stroke={P.wood.dark} strokeWidth="0.8" strokeDasharray="2 2" opacity="0.7" />
        <circle r="2.4" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* axe — outer translates to right hand; inner pivots at grip */}
      <g transform="translate(79 76) rotate(-20)">
        <g className="cq-weapon" style="transform-origin: 79px 76px; transform-box: view-box;">
          <rect x="-1.2" y="-32" width="2.4" height="32" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-1.6" y="-2" width="3.2" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
          <path d="M-2,-32 L10,-38 L12,-32 L10,-26 L-2,-28 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-2,-32 L8,-36 L10,-32 L8,-28 L-2,-29 Z" fill={P.metal.shine} opacity="0.4" />
        </g>
      </g>
      <Banner x={52} y={48} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function SpearmanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      {/* spear — left hand at (49, 76); haft extends up and down from grip */}
      <g transform="translate(49 76) rotate(-8)">
        <g className="cq-weapon" style="transform-origin: 49px 76px; transform-box: view-box;">
          <rect x="-1" y="-68" width="2" height="100" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-1.6" y="-4" width="3.2" height="8" fill={P.ink.soft} />
          <path d="M-4,-68 L4,-68 L5,-78 L0,-86 L-5,-78 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <rect x="-3" y="-70" width="6" height="2" fill={P.metal.gold} />
        </g>
      </g>
      <Humanoid
        cx={64} cy={70} scale={1}
        cloth={P.cloth.linen} pants={P.cloth.wool} accent={palette.mid} hair="#3a2a1a"
        hat={<path d="M-9,-36 Q0,-44 9,-36 L9,-32 L-9,-32 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />}
      />
      {/* large round shield — right hand */}
      <g transform="translate(80 66)">
        <circle r="15" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="15" fill="none" stroke={palette.dark} strokeWidth="2.2" />
        <circle r="3.4" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-12,0 L12,0" stroke={palette.dark} strokeWidth="0.6" opacity="0.7" />
      </g>
      <Banner x={36} y={36} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function HorsemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={26} />
      <g transform="translate(64 80)">
        <path d="M28,-2 Q36,2 32,12" stroke="#7a5a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="-6" y="2" width="5" height="16" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="22" y="2" width="5" height="16" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="0" cy="0" rx="28" ry="14" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="-3" rx="26" ry="9" fill="#b88a5a" />
        <rect x="-10" y="-8" width="18" height="6" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-10" y="-8" width="18" height="2" fill={palette.dark} />
        <rect x="-18" y="2" width="5" height="16" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="14" y="2" width="5" height="16" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-22" cy="-5" rx="12" ry="10" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-32,-2 L-36,4 L-28,4 Z" fill="#a07a4a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-14,-12 L-12,-18 L-8,-14 L-4,-18 L-2,-12 Z" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-18,-13 L-16,-19 L-14,-12 Z" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-26" cy="-5" r="0.8" fill={P.ink.line} />
      </g>
      {mountedRider({
        cx: 64, cy: 60, scale: 0.85,
        cloth: P.cloth.tunic, accent: palette.bright, hair: '#3a2a1a',
        hat: <path d="M-8,-32 Q0,-38 8,-32 L8,-28 L-8,-28 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />,
      })}
      {dangleBoot({ x: 56, y: 86, cloth: palette.dark })}
      {/* short sword — rider's right hand at world (76, 64); pivots at hand */}
      <g transform="translate(76 64) rotate(25)">
        <g className="cq-weapon" style="transform-origin: 76px 64px; transform-box: view-box;">
          <rect x="-0.8" y="-22" width="1.6" height="22" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="-2" width="6" height="2" fill={P.metal.gold} />
          <rect x="-1" y="0" width="2" height="5" fill={P.wood.dark} />
        </g>
      </g>
      <Banner x={42} y={34} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function CavalrySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={28} />
      <g transform="translate(64 80)">
        <path d="M30,-3 Q38,2 34,14" stroke="#4a2810" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="-8" y="2" width="6" height="18" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="22" y="2" width="6" height="18" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="0" cy="0" rx="30" ry="16" fill="#7a5830" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="-4" rx="28" ry="10" fill="#8a6a3a" />
        <path d="M-20,-9 Q0,-15 22,-9 L22,-5 L-20,-5 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-20" y="2" width="6" height="18" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="14" y="2" width="6" height="18" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-24" cy="-6" rx="12" ry="10" fill="#7a5830" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-34,-3 L-38,4 L-30,5 Z" fill="#7a5830" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-16,-13 L-14,-20 L-10,-15 L-6,-20 L-4,-13 Z" fill={P.ink.line} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-20,-14 L-18,-19 L-16,-13 Z" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-28" cy="-6" r="0.8" fill={P.ink.line} />
      </g>
      {mountedRider({
        cx: 64, cy: 58, scale: 0.9,
        cloth: P.metal.steel, accent: palette.dark, hair: '#2a1a10',
        hat: (
          <g>
            <path d="M-8,-28 Q0,-40 8,-28 L8,-26 L-8,-26 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
            <path d="M-8,-28 Q0,-40 8,-28" fill="none" stroke={P.metal.shine} strokeWidth="0.5" opacity="0.4" />
            <rect x="-2" y="-40" width="4" height="2.4" fill={palette.bright} />
          </g>
        ),
      })}
      {dangleBoot({ x: 54, y: 86, cloth: P.metal.iron })}
      {/* iron sword — rider's right hand at world (77, 63); ready-forward pose */}
      <g transform="translate(77 63) rotate(45)">
        <g className="cq-weapon" style="transform-origin: 77px 63px; transform-box: view-box;">
          <rect x="-0.8" y="-24" width="1.6" height="24" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="-2" width="6" height="2" fill={P.metal.gold} />
          <rect x="-1" y="0" width="2" height="5" fill={P.wood.dark} />
        </g>
      </g>
      <Banner x={42} y={28} palette={palette} scale={0.75} />
    </SpriteFrame>
  );
}

export function KnightSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={98} rx={30} />
      <g transform="translate(64 80)">
        <path d="M32,-4 Q40,2 36,14" stroke="#2a1606" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        <rect x="-10" y="4" width="6" height="18" fill="#3a2010" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="22" y="4" width="6" height="18" fill="#3a2010" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="0" cy="0" rx="32" ry="18" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="-4" rx="30" ry="12" fill="#6a4a26" />
        <ellipse cx="0" cy="0" rx="32" ry="18" fill={palette.dark} opacity="0.5" />
        <path d="M-22,-2 Q0,-12 22,-2 L24,4 L-24,4 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-12,0 L-8,8 M0,-2 L0,8 M12,0 L8,8" stroke={palette.dark} strokeWidth="0.6" />
        <rect x="-22" y="4" width="6" height="18" fill="#3a2010" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="14" y="4" width="6" height="18" fill="#3a2010" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-24" cy="-7" rx="13" ry="10" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="1" />
        <rect x="-32" y="-9" width="14" height="6" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-36,-3 L-40,4 L-32,5 Z" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-20,-14 L-18,-19 L-16,-13 Z" fill="#3a2010" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-30" cy="-7" r="0.8" fill={P.ink.line} />
      </g>
      {mountedRider({
        cx: 64, cy: 54, scale: 0.95,
        cloth: P.metal.steel, accent: palette.bright, hair: '#2a1a10',
        hat: (
          <g>
            <path d="M-9,-36 L9,-36 L10,-26 L-10,-26 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
            <rect x="-9" y="-30" width="18" height="2.2" fill={P.ink.line} />
            <rect x="-1" y="-30" width="2" height="2.2" fill={P.metal.shine} opacity="0.7" />
            <path d="M-10,-36 Q0,-42 10,-36" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
            <path d="M-2,-42 L0,-50 L2,-42 Z" fill={palette.trim} />
          </g>
        ),
      })}
      {dangleBoot({ x: 52, y: 88, cloth: P.metal.iron })}
      {/* couched lance — right hand at world (77, 59); pivots at grip */}
      <g transform="translate(77 59) rotate(15)">
        <g className="cq-weapon" style="transform-origin: 77px 59px; transform-box: view-box;">
          <rect x="-6" y="-1.2" width="92" height="2.4" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
          <path d="M86,-2 L96,0 L86,2 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="0" y="-4" width="2" height="8" fill={palette.mid} />
          <rect x="8" y="-4" width="2" height="8" fill={palette.bright} />
          <rect x="-2" y="-3.5" width="3" height="7" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.3" />
        </g>
      </g>
      {/* heraldic shield — left hand */}
      <g transform="translate(42 60)">
        <path d="M-10,-10 L10,-10 L11,4 Q0,16 -11,4 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-10,-10 L10,-10 L11,4 Q0,16 -11,4 Z" fill="none" stroke={palette.dark} strokeWidth="1.2" />
        <rect x="-1.4" y="-9" width="2.8" height="20" fill={palette.dark} />
        <rect x="-8" y="-3" width="16" height="2.8" fill={palette.dark} />
      </g>
    </SpriteFrame>
  );
}

export function CrossbowmanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid
        cx={64} cy={70} scale={1}
        cloth={palette.dark} pants="#3a3022" accent={palette.bright} skin={P.skin.warm} hair="#2a1a10"
        hat={<path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />}
      />
      {/* quiver on back */}
      <g transform="translate(50 56)">
        <rect x="-3" y="-12" width="6" height="18" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-2" y="-16" width="1.4" height="6" fill={P.metal.iron} />
        <rect x="0" y="-16" width="1.4" height="6" fill={P.metal.iron} />
        <rect x="2" y="-16" width="1.4" height="6" fill={P.metal.iron} />
      </g>
      {/* crossbow — right hand at world (79, 76); cq-draw translates during attack */}
      <g transform="translate(79 76)">
        <g className="cq-weapon" style="transform-origin: 79px 76px; transform-box: view-box;">
          <path d="M22,0 Q22,-12 32,-22" fill="none" stroke={P.metal.iron} strokeWidth="2.6" strokeLinecap="round" />
          <path d="M22,0 Q22,12 32,22" fill="none" stroke={P.metal.iron} strokeWidth="2.6" strokeLinecap="round" />
          <line x1="32" y1="-22" x2="-4" y2="0" stroke={P.cloth.linen} strokeWidth="0.6" />
          <line x1="32" y1="22" x2="-4" y2="0" stroke={P.cloth.linen} strokeWidth="0.6" />
          <rect x="-6" y="-2" width="28" height="5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
          <line x1="-6" y1="0" x2="22" y2="0" stroke={P.ink.line} strokeWidth="0.4" opacity="0.6" />
          <line x1="-4" y1="0" x2="14" y2="0" stroke={P.metal.iron} strokeWidth="1.1" />
          <path d="M-6,-1 L-4,0 L-6,1 Z" fill={P.metal.iron} />
          <rect x="0" y="3" width="3" height="3" fill={P.metal.iron} />
          <path d="M22,3 L28,7 L22,7 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-2" y="-3" width="2.4" height="7" fill={P.ink.soft} />
        </g>
      </g>
      {/* muzzle flash at prod tip */}
      <g transform="translate(111 54)"><g className="cq-muzzle-flash">
        <circle r="4" fill="#ffd966" />
        <circle r="2" fill="#fff" />
      </g></g>
      <Banner x={92} y={36} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

export function CatapultSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={38} ry={6} />
      {/* base frame */}
      <rect x="24" y="78" width="80" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="24" y="78" width="80" height="3" fill={P.wood.mid} />
      <circle cx="34" cy="94" r="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="34" cy="94" r="2" fill={P.ink.line} />
      <line x1="28" y1="94" x2="40" y2="94" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="34" y1="88" x2="34" y2="100" stroke={P.wood.dark} strokeWidth="0.8" />
      <circle cx="94" cy="94" r="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="94" cy="94" r="2" fill={P.ink.line} />
      <line x1="88" y1="94" x2="100" y2="94" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="94" y1="88" x2="94" y2="100" stroke={P.wood.dark} strokeWidth="0.8" />
      <rect x="38" y="46" width="5" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="78" y="46" width="5" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="34" y="44" width="52" height="4" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
      {/* throwing arm — wrapped in cq-weapon, pivot at torsion axle */}
      <g transform="translate(60 78) rotate(-55)">
        <g className="cq-weapon" style="transform-origin: 60px 78px; transform-box: view-box;">
          <rect x="-2" y="-50" width="4" height="50" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="0" cy="-52" rx="6" ry="4" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
          <circle cx="0" cy="-54" r="3.5" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
      </g>
      {/* torsion rope coil */}
      <ellipse cx="60" cy="78" rx="7" ry="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="55" y1="78" x2="65" y2="78" stroke={P.ink.line} strokeWidth="0.4" />
      <line x1="55" y1="76" x2="65" y2="76" stroke={P.ink.line} strokeWidth="0.4" />
      {/* crew */}
      <g transform="translate(18 80)">
        <circle cx="0" cy="-8" r="3.5" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-3,-10 Q0,-13 3,-10 L3,-7 L-3,-7 Z" fill="#3a2a1a" />
        <rect x="-3.5" y="-5" width="7" height="9" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-3.5" y="-5" width="7" height="2" fill={palette.mid} />
      </g>
      <g transform="translate(110 80)">
        <circle cx="0" cy="-8" r="3.5" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-3,-10 Q0,-13 3,-10 L3,-7 L-3,-7 Z" fill="#3a2a1a" />
        <rect x="-3.5" y="-5" width="7" height="9" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-3.5" y="-5" width="7" height="2" fill={palette.mid} />
      </g>
      <Banner x={82} y={32} palette={palette} scale={0.8} />
    </SpriteFrame>
  );
}

export function BallistaSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={30} ry={5} />
      <line x1="52" y1="92" x2="46" y2="76" stroke={P.wood.dark} strokeWidth="3" strokeLinecap="round" />
      <line x1="76" y1="92" x2="82" y2="76" stroke={P.wood.dark} strokeWidth="3" strokeLinecap="round" />
      <line x1="64" y1="90" x2="64" y2="76" stroke={P.wood.dark} strokeWidth="2.5" />
      <ellipse cx="64" cy="74" rx="12" ry="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="64" cy="73" rx="10" ry="2" fill={P.metal.steel} />
      <g transform="translate(64 64)">
        <rect x="-30" y="-7" width="60" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <rect x="-22" y="-7" width="3" height="14" fill={P.metal.iron} />
        <rect x="6" y="-7" width="3" height="14" fill={P.metal.iron} />
        <rect x="20" y="-7" width="3" height="14" fill={P.metal.iron} />
        <path d="M30,-2 Q44,-14 42,-22" fill="none" stroke={P.metal.iron} strokeWidth="3" strokeLinecap="round" />
        <path d="M30,2 Q44,14 42,22" fill="none" stroke={P.metal.iron} strokeWidth="3" strokeLinecap="round" />
        <line x1="42" y1="-22" x2="-4" y2="0" stroke={P.cloth.linen} strokeWidth="0.8" />
        <line x1="42" y1="22" x2="-4" y2="0" stroke={P.cloth.linen} strokeWidth="0.8" />
        <line x1="-4" y1="0" x2="30" y2="0" stroke={P.metal.iron} strokeWidth="1.8" />
        <path d="M30,-2.4 L38,0 L30,2.4 Z" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-4,-1.6 L-8,-3 L-8,3 L-4,1.6 Z" fill={P.metal.iron} />
        <rect x="-32" y="-3" width="4" height="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="-30" cy="0" r="2.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Humanoid
        cx={30} cy={80} scale={0.65}
        cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#3a2a1a"
      />
      <path d="M33,76 Q36,68 42,64" stroke={P.skin.warm} strokeWidth="2.8" fill="none" strokeLinecap="round" />
      <circle cx="42" cy="64" r="1.8" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.4" />
      <g transform="translate(102 64)"><g className="cq-muzzle-flash">
        <circle r="4" fill="#ffd966" />
        <circle r="2" fill="#fff" />
      </g></g>
      <Banner x={96} y={32} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

/* === CANNON === */

export function CannonSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={96} rx={36} ry={6} />
      {/* carriage frame */}
      <rect x="22" y="80" width="84" height="12" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="22" y="80" width="84" height="3" fill={P.wood.mid} />
      {/* rear wheel */}
      <circle cx="38" cy="94" r="9" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.5" />
      <circle cx="38" cy="94" r="3.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="29" y1="94" x2="47" y2="94" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="38" y1="85" x2="38" y2="103" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="31" y1="87" x2="45" y2="101" stroke={P.wood.dark} strokeWidth="0.7" />
      <line x1="45" y1="87" x2="31" y2="101" stroke={P.wood.dark} strokeWidth="0.7" />
      {/* front wheel */}
      <circle cx="96" cy="94" r="9" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.5" />
      <circle cx="96" cy="94" r="3.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="87" y1="94" x2="105" y2="94" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="96" y1="85" x2="96" y2="103" stroke={P.wood.dark} strokeWidth="0.8" />
      <line x1="89" y1="87" x2="103" y2="101" stroke={P.wood.dark} strokeWidth="0.7" />
      <line x1="103" y1="87" x2="89" y2="101" stroke={P.wood.dark} strokeWidth="0.7" />
      {/* barrel pivot block */}
      <rect x="44" y="72" width="12" height="12" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" rx="2" />
      {/* cannon barrel — angled slightly up */}
      <g transform="translate(50 78) rotate(-12)">
        <rect x="-6" y="-6" width="64" height="12" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" rx="6" />
        <rect x="-6" y="-6" width="64" height="5" fill={P.metal.steel} rx="4" />
        <ellipse cx="-5" cy="0" rx="7" ry="7" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="-5" cy="0" rx="5" ry="5" fill={P.metal.steel} />
        <ellipse cx="58" cy="0" rx="5" ry="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="58" cy="0" rx="3" ry="3" fill="#111" />
        <rect x="0" y="-7.5" width="4" height="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* vent fuse */}
      <path d="M50,68 Q54,62 60,58" fill="none" stroke="#c87941" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="60" cy="58" r="2" fill="#e8a020" />
      {/* muzzle flash */}
      <g transform="translate(104 75)"><g className="cq-muzzle-flash">
        <circle r="6" fill="#ffd966" />
        <circle r="3" fill="#fff" />
      </g></g>
      {/* gunner */}
      <Humanoid
        cx={24} cy={80} scale={0.65}
        cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#3a2a1a"
      />
      <Banner x={80} y={30} palette={palette} scale={0.75} />
    </SpriteFrame>
  );
}

/* === GRENADIER === */

export function GrenadierSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={100} rx={22} ry={5} />
      {/* grenadier body */}
      <Humanoid
        cx={56} cy={82} scale={1.0}
        cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} skin={P.skin.warm} hair="#3a2a1a"
      />
      {/* bandolier of grenades across chest */}
      <path d="M46,68 Q56,72 66,68" fill="none" stroke={P.metal.iron} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="49" cy="70" r="3" fill="#4a3a28" stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="56" cy="71" r="3" fill="#4a3a28" stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="63" cy="70" r="3" fill="#4a3a28" stroke={P.ink.line} strokeWidth="0.8" />
      {/* throwing arm raised */}
      <line x1="66" y1="70" x2="80" y2="52" stroke={P.skin.warm} strokeWidth="4" strokeLinecap="round" />
      {/* grenade in hand */}
      <circle cx="82" cy="49" r="7" fill="#4a3a28" stroke={P.ink.line} strokeWidth="1" />
      <rect x="79" y="42" width="6" height="5" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* fuse spark */}
      <path d="M82,42 Q86,36 90,32" fill="none" stroke="#e8a020" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="90" cy="32" r="2.5" fill="#ffd966" />
      <Banner x={100} y={28} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

/* === RIFLEMAN === */
// TODO(art): Replace with industrial-era rifleman: peaked shako hat, dark uniform coat, rifled musket held at carry, cartridge box on belt, unit stands at attention.
export function RiflemanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={100} rx={22} ry={5} />
      <Humanoid
        cx={56} cy={82} scale={1.0}
        cloth={palette.dark} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#2a1a0a"
      />
      {/* shako hat */}
      <rect x="44" y="26" width="26" height="16" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <rect x="42" y="40" width="30" height="3" rx="1" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* rifled musket — held vertically at carry */}
      <rect x="72" y="38" width="5" height="52" rx="1.5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="73" y="36" width="3" height="10" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      {/* bayonet */}
      <line x1="74.5" y1="36" x2="74.5" y2="22" stroke={P.metal.shine} strokeWidth="2.5" strokeLinecap="round" />
      <Banner x={100} y={28} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

/* === IRONCLAD === */
// TODO(art): Replace with industrial ironclad warship: riveted iron hull with steam smokestack, gun ports along sides, paddle wheels or screw propeller visible at stern, low profile silhouette.
export function IroncladSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={102} rx={36} ry={6} />
      {/* armored hull */}
      <path d="M18,90 L28,80 L100,80 L110,90 L110,100 L18,100 Z"
        fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
      {/* riveted iron plating lines */}
      <line x1="18" y1="84" x2="110" y2="84" stroke={P.metal.iron} strokeWidth="0.8" opacity="0.6" />
      <line x1="18" y1="88" x2="110" y2="88" stroke={P.metal.iron} strokeWidth="0.8" opacity="0.6" />
      {/* smokestack with steam */}
      <rect x="58" y="56" width="12" height="26" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="64" cy="54" rx="8" ry="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <path d="M60,52 Q55,42 58,36 Q63,30 60,24" fill="none" stroke="#d8d0c0" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
      <path d="M68,50 Q72,40 70,34 Q67,28 70,22" fill="none" stroke="#d8d0c0" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      {/* gun turret / cannon port */}
      <rect x="30" y="74" width="18" height="8" rx="1" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="82" y="74" width="18" height="8" rx="1" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={100} y={30} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

/* === CARAVAN === */

export function CaravanSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={94} rx={30} ry={6} />
      {/* lead rope — merchant hand to donkey muzzle, drawn under the donkey */}
      <path d="M40,78 Q64,70 92,66" fill="none" stroke={P.wood.dark} strokeWidth="1.2" strokeLinecap="round" opacity="0.85" />
      {/* DONKEY — stocky quadruped, head to the right */}
      <g transform="translate(62 74)">
        <rect x="-14" y="8" width="5" height="18" fill="#6f5436" stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="16" y="8" width="5" height="18" fill="#6f5436" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="-15" cy="-1" rx="13" ry="13" fill="#9a7550" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="0" cy="0" rx="24" ry="14" fill="#9a7550" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="-2" cy="-3" rx="22" ry="9" fill="#ab8560" />
        <path d="M-26,-4 Q-32,2 -29,9" fill="none" stroke="#6f5436" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M-29,9 L-31,13 L-27,13 Z" fill="#5e3f24" />
        <rect x="-9" y="9" width="5.4" height="18" fill="#9a7550" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="10" y="9" width="5.4" height="18" fill="#9a7550" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-6.3" cy="27" rx="3.2" ry="1.8" fill="#5e3f24" stroke={P.ink.line} strokeWidth="0.4" />
        <ellipse cx="12.7" cy="27" rx="3.2" ry="1.8" fill="#5e3f24" stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M16,-6 Q24,-12 26,-12 L31,-8 Q30,-2 22,2 Z" fill="#9a7550" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="29" cy="-9" rx="8.5" ry="7" fill="#9a7550" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="35" cy="-6" rx="4.5" ry="3.6" fill="#ab8560" stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="37" cy="-6" r="0.7" fill={P.ink.line} />
        <path d="M24,-15 Q22,-26 26,-28 Q28,-22 27,-14 Z" fill="#9a7550" stroke={P.ink.line} strokeWidth="0.7" />
        <path d="M30,-15 Q31,-26 35,-26 Q35,-20 33,-13 Z" fill="#8a6748" stroke={P.ink.line} strokeWidth="0.7" />
        <circle cx="31" cy="-11" r="0.8" fill={P.ink.line} />
        <path d="M20,-12 L21,-17 L23,-12 L25,-16 L26,-11 Z" fill="#6f5436" />
        {/* saddle blanket (faction cloth) + linen saddlebags + strapped crate */}
        <path d="M-16,-10 Q-2,-16 12,-10 L13,-2 L-17,-2 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.8" />
        <rect x="-17" y="-3" width="30" height="2.2" fill={palette.dark} />
        <rect x="-15" y="-1" width="14" height="17" rx="6" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="2" y="-1" width="14" height="17" rx="6" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-9.5" y="-2" width="2.6" height="18" fill={P.wood.dark} />
        <rect x="7.5" y="-2" width="2.6" height="18" fill={P.wood.dark} />
        <path d="M-13,7 Q-8,10 -3,7" fill="none" stroke="#cabfa0" strokeWidth="0.6" />
        <path d="M4,7 Q9,10 14,7" fill="none" stroke="#cabfa0" strokeWidth="0.6" />
        <g transform="translate(-2 -24)">
          <rect x="-9" y="0" width="18" height="14" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-9,5 H9 M0,0 V14" stroke={P.wood.dark} strokeWidth="0.6" />
          <rect x="-9" y="3" width="18" height="2" fill={P.wood.dark} opacity="0.7" />
        </g>
      </g>
      <Banner x={56} y={42} palette={palette} scale={0.65} />
      {/* MERCHANT walking alongside, holding the lead rope */}
      <Humanoid cx={30} cy={80} scale={0.62} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#3a2a1a"
        hat={<path d="M-8,-34 Q0,-42 8,-34 Q9,-31 6,-30 L-6,-30 Q-9,-31 -8,-34 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.6" />}
      />
      <path d="M34,76 Q39,76 41,78" fill="none" stroke={P.skin.warm} strokeWidth="2.4" strokeLinecap="round" />
      {/* WORK action = delivering goods: coins glint at the merchant's feet (.cq-deliver) */}
      <g className="cq-deliver">
        <ellipse cx="24" cy="90" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="24" cy="87.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="34" cy="91" rx="3.4" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
    </SpriteFrame>
  );
}

/* === EXPEDITION === */

export function ExpeditionSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={92} rx={22} />
      {/* rolled map tucked under the left arm */}
      <g transform="translate(43 74) rotate(-18)">
        <rect x="-11" y="-3.4" width="22" height="6.8" rx="3.4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
        <ellipse cx="-11" cy="0" rx="2.2" ry="3.4" fill="#d8ccae" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="11" cy="0" rx="2.2" ry="3.4" fill="#d8ccae" stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-2" y="-3.6" width="3" height="7.2" fill={P.wood.dark} />
      </g>
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#3a2a1a"
        hat={
          <g>
            <ellipse cx="0" cy="-34" rx="15" ry="4" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
            <path d="M-9,-34 Q-8,-46 0,-46 Q8,-46 9,-34 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
            <rect x="-9" y="-38" width="18" height="2.6" fill={palette.mid} />
            <path d="M-15,-34 Q0,-31 15,-34" fill="none" stroke="#3a2616" strokeWidth="0.6" />
          </g>
        }
      />
      {/* WORK action = prospecting: dust kicked up where the pick strikes (.cq-work-dust) */}
      <g className="cq-work-dust">
        <ellipse cx="92" cy="88" rx="6" ry="2.6" fill={P.ground.dirt} />
      </g>
      {/* PICKAXE over the right shoulder — .cq-tool digs down on the work action,
         grip pivot at hand (79,76). NOT .cq-weapon: civilians never do a combat swing. */}
      <g transform="translate(79 76) rotate(-38)">
        <g className="cq-tool" style="transform-origin: 79px 76px; transform-box: view-box;">
          <rect x="-1.4" y="-40" width="2.8" height="40" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-1.8" y="-2" width="3.6" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
          <path d="M-12,-44 Q-2,-48 0,-42 Q2,-48 12,-44 Q4,-39 0,-40 Q-4,-39 -12,-44 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-10,-44 Q-2,-46 0,-43 Q-4,-43 -10,-44 Z" fill={P.metal.shine} opacity="0.4" />
        </g>
      </g>
      <Banner x={50} y={48} palette={palette} scale={0.58} />
    </SpriteFrame>
  );
}

/* === MACHINE GUNNER === */
// TODO(art): Replace with era-8 machine gunner: prone crew pair + tripod-mounted Maxim gun, sandbag emplacement, industrial-era uniforms, belt-feed ammo box beside tripod.
export function MachineGunnerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={102} rx={32} ry={6} />
      {/* sandbag emplacement */}
      <ellipse cx="64" cy="100" rx="38" ry="8" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="64" cy="96" rx="28" ry="6" fill="#b8a070" stroke={P.ink.line} strokeWidth="0.8" />
      {/* tripod legs */}
      <line x1="64" y1="72" x2="44" y2="96" stroke={P.metal.iron} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="64" y1="72" x2="84" y2="96" stroke={P.metal.iron} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="64" y1="72" x2="64" y2="96" stroke={P.metal.iron} strokeWidth="2" strokeLinecap="round" />
      {/* gun barrel */}
      <rect x="44" y="68" width="50" height="8" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <rect x="88" y="70" width="20" height="4" rx="1.5" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      {/* gunner — prone/crouching silhouette */}
      <Humanoid cx={46} cy={84} scale={0.72} cloth={palette.dark} pants={palette.dark} accent={palette.mid} skin={P.skin.warm} hair="#2a1a0a" />
      <Banner x={100} y={30} palette={palette} scale={0.65} />
    </SpriteFrame>
  );
}

/* === PRE-DREADNOUGHT === */
// TODO(art): Replace with era-8 pre-dreadnought: wide steel battleship profile, two revolving turrets fore and aft, tall tripod mast, painted waterline hull, coal smoke from stacks.
export function PreDreadnoughtSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={104} rx={42} ry={7} />
      {/* armored hull — wide battleship profile */}
      <path d="M14,92 L24,80 L104,80 L114,92 L114,104 L14,104 Z"
        fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.5" />
      {/* belt armor stripe */}
      <rect x="14" y="88" width="100" height="4" fill={P.metal.iron} opacity="0.5" />
      {/* fore turret */}
      <rect x="28" y="70" width="24" height="12" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <rect x="26" y="74" width="14" height="5" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.7" />
      {/* aft turret */}
      <rect x="76" y="70" width="24" height="12" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <rect x="88" y="74" width="14" height="5" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.7" />
      {/* twin smokestacks */}
      <rect x="52" y="48" width="8" height="34" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <rect x="68" y="48" width="8" height="34" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      {/* smoke plume */}
      <path d="M56,46 Q52,36 54,28" fill="none" stroke="#c8c0b0" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
      <path d="M72,46 Q76,36 74,30" fill="none" stroke="#c8c0b0" strokeWidth="2.5" strokeLinecap="round" opacity="0.5" />
      {/* tripod mast */}
      <line x1="64" y1="78" x2="64" y2="36" stroke={P.metal.iron} strokeWidth="2" />
      <line x1="64" y1="50" x2="54" y2="58" stroke={P.metal.iron} strokeWidth="1.2" />
      <line x1="64" y1="50" x2="74" y2="58" stroke={P.metal.iron} strokeWidth="1.2" />
      <Banner x={60} y={22} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

// TODO(art): Replace tank: low-profile WWI-era rhomboid hull with tracks wrapping sides, riveted armor plates, forward cannon sponson, commander hatch open.
export function TankSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={106} rx={44} ry={6} />
      {/* rhomboid hull */}
      <path d="M10,90 L24,68 L104,68 L118,90 L118,106 L10,106 Z"
        fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.5" />
      {/* track sponsons */}
      <ellipse cx="30" cy="96" rx="20" ry="12" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="98" cy="96" rx="20" ry="12" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      {/* track tread marks */}
      {[16, 24, 32, 40].map(x =>
        <rect key={x} x={x} y={90} width="4" height="12" rx="1" fill={P.metal.steel} opacity="0.5" />
      ).join('')}
      {[84, 92, 100, 108].map(x =>
        <rect key={x} x={x} y={90} width="4" height="12" rx="1" fill={P.metal.steel} opacity="0.5" />
      ).join('')}
      {/* forward sponson cannon */}
      <rect x="8" y="78" width="28" height="10" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <rect x="2" y="80" width="12" height="6" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      {/* commander hatch */}
      <ellipse cx="76" cy="68" rx="10" ry="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <Banner x={74} y={46} palette={palette} scale={0.72} />
    </SpriteFrame>
  );
}

// TODO(art): Replace submarine: cigar-shaped pressure hull, conning tower with periscope, hydroplane fins, foamy wake at bow.
export function SubmarineSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={104} rx={48} ry={6} />
      {/* pressure hull — cigar shape */}
      <ellipse cx="64" cy="94" rx="52" ry="14" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.5" />
      {/* waterline stripe */}
      <ellipse cx="64" cy="94" rx="52" ry="6" fill={P.metal.iron} opacity="0.35" />
      {/* conning tower */}
      <rect x="50" y="70" width="28" height="26" rx="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      {/* periscope */}
      <rect x="60" y="48" width="4" height="24" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="56" y="46" width="12" height="4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* hydroplane fins */}
      <path d="M14,88 L6,80 L18,88" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      <path d="M114,88 L122,80 L110,88" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={60} y={48} palette={palette} scale={0.65} />
    </SpriteFrame>
  );
}

// TODO(art): Replace with: Tethered hydrogen envelope — oval gas bag with faction-colored panels, rope net holding wicker gondola basket, observer with binoculars leaning out, tether line descending off-canvas.
export function ObservationBalloonSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      {/* envelope — oval hydrogen bag */}
      <ellipse cx="64" cy="52" rx="38" ry="46" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.5" />
      {/* panel lines */}
      <line x1="64" y1="6" x2="64" y2="98" stroke={P.ink.soft} strokeWidth="0.8" opacity="0.5" />
      <line x1="26" y1="52" x2="102" y2="52" stroke={P.ink.soft} strokeWidth="0.8" opacity="0.5" />
      {/* rope net */}
      <ellipse cx="64" cy="52" rx="38" ry="46" fill="none" stroke={P.wood.dark} strokeWidth="0.9" strokeDasharray="4 6" />
      {/* gondola basket */}
      <rect x="48" y="96" width="32" height="18" rx="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <line x1="48" y1="102" x2="80" y2="102" stroke={P.wood.dark} strokeWidth="0.7" />
      {/* tether lines from basket to ground */}
      <line x1="56" y1="114" x2="52" y2="124" stroke={P.ink.soft} strokeWidth="0.8" />
      <line x1="72" y1="114" x2="76" y2="124" stroke={P.ink.soft} strokeWidth="0.8" />
      <Banner x={64} y={10} palette={palette} scale={0.7} />
    </SpriteFrame>
  );
}

// TODO(art): Replace with: WWI biplane — double canvas wings with wooden strut bracing and taut wire, round radial engine cowling, open cockpit with goggled pilot, roundel in faction color on upper wing, propeller motion blur.
export function BiplaneSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={110} rx={52} ry={5} />
      {/* fuselage */}
      <rect x="48" y="54" width="32" height="16" rx="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1.2" />
      {/* upper wing */}
      <rect x="8" y="48" width="112" height="10" rx="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* lower wing */}
      <rect x="18" y="68" width="92" height="8" rx="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      {/* struts */}
      <line x1="36" y1="58" x2="32" y2="68" stroke={P.wood.mid} strokeWidth="1.5" />
      <line x1="92" y1="58" x2="96" y2="68" stroke={P.wood.mid} strokeWidth="1.5" />
      {/* engine cowling */}
      <circle cx="64" cy="62" r="10" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      {/* propeller */}
      <rect x="60" y="38" width="8" height="28" rx="2" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
      {/* tail */}
      <path d="M80,60 L112,54 L112,70 L80,66 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      {/* rudder */}
      <path d="M108,44 L116,44 L116,76 L108,76 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={64} y={20} palette={palette} scale={0.65} />
    </SpriteFrame>
  );
}

export function JetFighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={110} rx={48} ry={4} />
      {/* fuselage — sleek tapered body */}
      <path d="M64,30 L72,58 L70,80 L58,80 L56,58 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* swept wings */}
      <path d="M64,55 L8,78 L12,88 L64,68 L116,88 L120,78 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      {/* tail fins */}
      <path d="M58,80 L40,100 L56,94 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <path d="M70,80 L88,100 L72,94 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      {/* nose cone */}
      <path d="M64,30 L60,44 L68,44 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      {/* cockpit */}
      <ellipse cx="64" cy="52" rx="6" ry="8" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="1" />
      {/* afterburner glow */}
      <ellipse cx="64" cy="88" rx="5" ry="10" fill="#ff6600" opacity="0.7" />
      <Banner x={64} y={16} palette={palette} scale={0.6} />
    </SpriteFrame>
  );
}

export function CarrierSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={108} rx={60} ry={7} />
      {/* hull — tapered bow/stern */}
      <path d="M6,90 L14,80 L114,80 L122,90 L114,104 L14,104 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.4" />
      {/* waterline stripe */}
      <path d="M10,96 L118,96" stroke={palette.bright} strokeWidth="1.2" opacity="0.6" />
      {/* flight deck — wide flat surface */}
      <rect x="6" y="62" width="116" height="20" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* deck edge markings — port and starboard yellow lines */}
      <line x1="6" y1="64" x2="122" y2="64" stroke="#ffd700" strokeWidth="1" />
      <line x1="6" y1="80" x2="122" y2="80" stroke="#ffd700" strokeWidth="1" />
      {/* island superstructure (to starboard — right side) */}
      <rect x="90" y="38" width="26" height="26" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <rect x="92" y="44" width="22" height="8" rx="1" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
      {/* radar mast */}
      <line x1="103" y1="38" x2="103" y2="20" stroke={P.metal.iron} strokeWidth="2" />
      {/* radar dish */}
      <path d="M95,22 L111,22 Q111,30 103,33 Q95,30 95,22 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      {/* rotating radar bar */}
      <line x1="90" y1="24" x2="116" y2="24" stroke={P.metal.iron} strokeWidth="1" />
      {/* 3 aircraft silhouettes on deck */}
      <path d="M18,68 L30,68 L24,63 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M40,70 L52,70 L46,65 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M62,67 L74,67 L68,62 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      {/* bow wake */}
      <path d="M6,92 Q10,98 20,102" stroke="white" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M6,96 Q10,102 18,106" stroke="white" strokeWidth="1" fill="none" opacity="0.4" />
      {/* stern wake */}
      <path d="M122,92 Q118,99 110,104" stroke="white" strokeWidth="1.5" fill="none" opacity="0.6" />
      <Banner x={103} y={12} palette={palette} scale={0.52} />
    </SpriteFrame>
  );
}

// Era 11 units
export function AttackHelicopterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={112} rx={50} ry={5} />
      {/* fuselage — stubby armored body */}
      <path d="M46,54 L48,42 L80,42 L82,54 L82,90 L80,96 L48,96 L46,90 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* cockpit bubble — front */}
      <path d="M48,54 L48,70 L64,76 L80,70 L80,54 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="1" opacity="0.85" />
      {/* main rotor mast */}
      <rect x="62" y="28" width="4" height="14" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* main rotor blades — span the full width */}
      <path d="M4,34 L64,30 L124,34" stroke={P.metal.steel} strokeWidth="3" strokeLinecap="round" fill="none" />
      <path d="M64,30 L64,10" stroke={P.metal.steel} strokeWidth="3" strokeLinecap="round" />
      {/* tail boom */}
      <path d="M80,76 L118,82 L118,88 L80,90 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* tail rotor */}
      <line x1="118" y1="76" x2="118" y2="96" stroke={P.metal.steel} strokeWidth="2.5" />
      {/* stub wings with missile pylons */}
      <rect x="28" y="68" width="20" height="6" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="80" y="68" width="20" height="6" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      {/* missiles on pylons */}
      <rect x="26" y="72" width="8" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="36" y="72" width="8" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="80" y="72" width="8" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="90" y="72" width="8" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      {/* exhaust vents */}
      <rect x="78" y="44" width="6" height="4" rx="1" fill="#cc5500" opacity="0.75" />
      <Banner x={64} y={16} palette={palette} scale={0.52} />
    </SpriteFrame>
  );
}

export function MissileSubmarineSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={106} rx={58} ry={6} />
      {/* hull — smooth teardrop submarine body */}
      <path d="M8,78 Q6,86 8,94 Q32,110 64,110 Q96,110 120,94 Q122,86 120,78 Q96,66 64,66 Q32,66 8,78 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.4" />
      {/* waterline stripe */}
      <path d="M10,87 Q64,92 118,87" stroke={palette.bright} strokeWidth="1.2" opacity="0.55" />
      {/* sail / conning tower */}
      <rect x="52" y="50" width="24" height="22" rx="3" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <rect x="56" y="44" width="16" height="8" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* periscope */}
      <line x1="66" y1="30" x2="66" y2="44" stroke={P.metal.iron} strokeWidth="2" />
      <rect x="62" y="28" width="8" height="5" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      {/* SLBM missile silos on hull — 3 silos */}
      <rect x="28" y="66" width="7" height="10" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="40" y="66" width="7" height="10" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="83" y="66" width="7" height="10" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      {/* torpedo tubes at bow */}
      <circle cx="16" cy="82" r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="16" cy="90" r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* bow wake bubbles */}
      <path d="M8,80 Q4,86 8,92" stroke="white" strokeWidth="1.4" fill="none" opacity="0.55" />
      {/* stern propeller */}
      <path d="M114,80 Q122,86 114,92" stroke={P.metal.iron} strokeWidth="2" fill="none" />
      <path d="M114,83 Q110,86 114,90" stroke={P.metal.iron} strokeWidth="2.5" fill="none" />
      <Banner x={64} y={32} palette={palette} scale={0.52} />
    </SpriteFrame>
  );
}
