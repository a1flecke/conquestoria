import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  CATEGORY_TINTS,
  Banner,
  SpriteFrame,
  BuildingPlinth,
} from './sprite-system';

export type BuildingSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

function ThatchRoof({ d, color = P.thatch.straw, shadow = P.thatch.shadow }: { d: string; color?: string; shadow?: string }): string {
  return (
    <g>
      <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={d} fill={shadow} opacity="0.18" />
    </g>
  );
}

function TileRoof({ d, color }: { d: string; color: string }): string {
  return <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />;
}

function BuildingFrame({
  children, label, sub, category, svgOnly,
}: {
  children: string | string[]; label?: string; sub?: string; category?: string; svgOnly?: boolean;
}): string {
  const defs = `<defs>
    <pattern id="thatchPattern" width="6" height="4" patternUnits="userSpaceOnUse">
      <path d="M0,2 Q3,-1 6,2" stroke="${P.thatch.shadow}" stroke-width="0.5" fill="none"/>
    </pattern>
    <pattern id="tilePattern" width="6" height="3" patternUnits="userSpaceOnUse">
      <path d="M0,0 H6 M0,3 H6" stroke="${P.ink.line}" stroke-width="0.3"/>
    </pattern>
    <pattern id="stoneTexture" width="8" height="6" patternUnits="userSpaceOnUse">
      <path d="M0,3 H8 M2,0 V3 M5,3 V6 M0,6 H8" stroke="${P.stone.dark}" stroke-width="0.4" opacity="0.4"/>
    </pattern>
  </defs>`;
  const ring = category
    ? `<circle cx="96" cy="166" r="80" fill="none" stroke="${CATEGORY_TINTS[category] ?? '#888'}" stroke-width="2" opacity="0.18"/>`
    : '';
  const childStr = Array.isArray(children) ? children.join('') : (children ?? '');
  return SpriteFrame({ size: 192, svgOnly, label, sub, hexTint: '#000', children: defs + ring + childStr });
}

/* === FOOD === */

export function GranarySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Granary" sub="Food" category="food" svgOnly={svgOnly}>
      <BuildingPlinth />
      <ellipse cx="80" cy="62" rx="32" ry="10" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="1" />
      <rect x="48" y="62" width="64" height="74" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="1" />
      <rect x="48" y="62" width="64" height="74" fill="url(#stoneTexture)" opacity="0.6" />
      <line x1="48" y1="80" x2="112" y2="80" stroke={P.wood.dark} strokeWidth="1.4" />
      <line x1="48" y1="100" x2="112" y2="100" stroke={P.wood.dark} strokeWidth="1.4" />
      <line x1="48" y1="120" x2="112" y2="120" stroke={P.wood.dark} strokeWidth="1.4" />
      <ThatchRoof d="M48,62 Q80,18 112,62 Z" />
      <rect x="68" y="108" width="20" height="28" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="78" y1="108" x2="78" y2="136" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="108" y="100" width="40" height="36" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="108" y="100" width="40" height="36" fill="url(#stoneTexture)" opacity="0.6" />
      <ThatchRoof d="M104,100 L152,100 L144,84 L112,84 Z" />
      <ellipse cx="56" cy="142" rx="10" ry="6" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="74" cy="142" rx="9" ry="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={80} y={20} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

export function HerbalistSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Herbalist" sub="Food" category="food" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="42" y="80" width="108" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M42,84 H150 M42,108 H150 M42,128 H150" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
      <ThatchRoof d="M34,84 L158,84 L130,42 L62,42 Z" />
      <line x1="50" y1="86" x2="50" y2="96" stroke="#5a8a3a" strokeWidth="2" />
      <circle cx="50" cy="98" r="3" fill="#7eaf5e" />
      <line x1="62" y1="86" x2="62" y2="98" stroke="#7a4a8a" strokeWidth="2" />
      <circle cx="62" cy="100" r="3" fill="#9a6abf" />
      <line x1="138" y1="86" x2="138" y2="96" stroke="#5a8a3a" strokeWidth="2" />
      <circle cx="138" cy="98" r="3" fill="#7eaf5e" />
      <path d="M88,140 L88,108 Q96,102 104,108 L104,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="100" cy="124" r="1" fill={P.metal.gold} />
      <ellipse cx="60" cy="140" rx="8" ry="3" fill={P.stone.dark} />
      <rect x="54" y="130" width="12" height="10" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="120" y="138" width="26" height="6" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="124" cy="136" r="2" fill="#7eaf5e" />
      <circle cx="132" cy="136" r="2" fill="#9ac76a" />
      <circle cx="140" cy="136" r="2" fill="#7eaf5e" />
      <Banner x={96} y={42} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function AqueductSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const arches = [0, 1, 2, 3].map(i => (
    <g transform={`translate(${28 + i * 36} 80)`}>
      <path d="M0,56 L0,18 Q14,0 28,18 L28,56 Z" fill={P.ink.soft} opacity="0.45" />
      <path d="M0,18 Q14,0 28,18" fill="none" stroke={P.ink.line} strokeWidth="0.8" />
    </g>
  )).join('');
  return (
    <BuildingFrame label="Aqueduct" sub="Food" category="food" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      <rect x="20" y="60" width="152" height="76" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="20" y="60" width="152" height="76" fill="url(#stoneTexture)" opacity="0.6" />
      {arches}
      <rect x="16" y="50" width="160" height="12" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="20" y="52" width="152" height="6" fill={P.ground.water} />
      <path d="M20,55 Q40,52 60,55 T100,55 T140,55 T172,55" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.6" />
      <rect x="172" y="62" width="4" height="76" fill={P.ground.water} opacity="0.7" />
      <ellipse cx="174" cy="140" rx="10" ry="3" fill={P.ground.water} />
      <Banner x={32} y={48} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

/* === PRODUCTION === */

export function WorkshopSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Workshop" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="42" y="80" width="108" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M42,84 H150 M42,100 H150 M42,116 H150 M42,132 H150" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M34,84 L158,84 L130,42 L62,42 Z" />
      <path d="M70,140 L70,100 L122,100 L122,140 Z" fill={P.ink.line} />
      <rect x="74" y="104" width="20" height="20" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="78" y1="138" x2="86" y2="124" stroke={P.wood.dark} strokeWidth="1.2" />
      <line x1="92" y1="138" x2="86" y2="124" stroke={P.wood.dark} strokeWidth="1.2" />
      <rect x="80" y="120" width="14" height="3" fill={P.wood.mid} />
      <ellipse cx="138" cy="138" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="138" cy="134" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={42} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function ForgeSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Forge" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="42" y="76" width="108" height="64" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="76" width="108" height="64" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M34,80 L158,80 L130,40 L62,40 Z" color="#8a4030" />
      <rect x="120" y="22" width="22" height="40" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="118" y="20" width="26" height="6" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="138" cy="14" rx="8" ry="5" fill="#8a8a8a" opacity="0.6" />
      <ellipse cx="148" cy="6" rx="6" ry="4" fill="#8a8a8a" opacity="0.4" />
      <path d="M62,140 L62,100 L100,100 L100,140 Z" fill={P.ink.line} />
      <ellipse cx="81" cy="120" rx="14" ry="10" fill="#ff8a3a" />
      <ellipse cx="81" cy="120" rx="9" ry="6" fill="#ffd966" />
      <path d="M118,128 L142,128 L138,124 L122,124 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="126" y="128" width="8" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="120" y="134" width="20" height="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={56} y={40} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function LumbermillSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const spokes = [0, 1, 2, 3, 4, 5, 6, 7].map(i => (
    <line x1="0" y1="0" x2={Math.cos(i * Math.PI / 4) * 22} y2={Math.sin(i * Math.PI / 4) * 22} stroke={P.wood.dark} strokeWidth="1.4" />
  )).join('');
  return (
    <BuildingFrame label="Lumbermill" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      <rect x="36" y="84" width="108" height="56" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M36,90 H144 M36,104 H144 M36,118 H144 M36,132 H144" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M28,84 L152,84 L124,46 L56,46 Z" color="#7a5a3a" shadow="#4a3220" />
      <g transform="translate(150 110)">
        <circle r="22" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
        <circle r="22" fill="none" stroke={P.wood.dark} strokeWidth="1" />
        {spokes}
        <circle r="3" fill={P.metal.iron} />
      </g>
      <rect x="120" y="134" width="58" height="6" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="48" cy="138" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="48" cy="134" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="48" cy="130" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={88} y={48} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function QuarrySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Quarry" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={160} color={P.stone.dark} />
      <ellipse cx="96" cy="120" rx="64" ry="20" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="116" rx="50" ry="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="96" cy="112" rx="36" ry="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="32" y="98" width="20" height="18" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="32" y="98" width="20" height="18" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="36" y="84" width="14" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="142" y="100" width="22" height="20" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="142" y="100" width="22" height="20" fill="url(#stoneTexture)" opacity="0.6" />
      <line x1="112" y1="120" x2="138" y2="60" stroke={P.wood.dark} strokeWidth="2.5" />
      <line x1="138" y1="60" x2="124" y2="84" stroke="#3a2a1a" strokeWidth="0.8" />
      <rect x="120" y="84" width="8" height="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <g transform="translate(60 90) rotate(-25)">
        <rect x="-1" y="0" width="2" height="20" fill={P.wood.dark} />
        <path d="M-10,-2 L10,-2 L8,2 L-8,2 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      <Banner x={96} y={68} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

/* === SCIENCE === */

export function LibrarySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const columns = [0, 1, 2, 3].map(i => (
    <g transform={`translate(${48 + i * 30} 0)`}>
      <rect x="-3" y="80" width="6" height="56" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="80" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="132" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
    </g>
  )).join('');
  return (
    <BuildingFrame label="Library" sub="Science" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      <rect x="38" y="74" width="116" height="66" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="38" y="74" width="116" height="66" fill="url(#stoneTexture)" opacity="0.4" />
      {columns}
      <TileRoof d="M30,78 L162,78 L96,38 Z" color="#6a8a4a" />
      <circle cx="96" cy="60" r="6" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="91" y1="58" x2="101" y2="58" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="91" y1="60" x2="101" y2="60" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="91" y1="62" x2="101" y2="62" stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M30,140 L162,140 L156,146 L36,146 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={40} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function ArchiveSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const windows = [0, 1, 2, 3].map(i => (
    <rect x={52 + i * 25} y="84" width="6" height="22" fill={P.ink.line} />
  )).join('');
  return (
    <BuildingFrame label="Archive" sub="Science" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="42" y="68" width="108" height="72" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="68" width="108" height="72" fill="url(#stoneTexture)" opacity="0.7" />
      {windows}
      <path d="M34,72 L158,72 L96,40 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M34,72 L158,72 L96,40 Z" fill="url(#stoneTexture)" opacity="0.5" />
      <ellipse cx="96" cy="58" rx="14" ry="3" fill={P.stone.dark} />
      <rect x="86" y="56" width="20" height="2" fill={P.stone.dark} />
      <path d="M84,140 L84,114 Q96,108 108,114 L108,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="103" cy="128" r="1.4" fill={P.metal.gold} />
      <Banner x={96} y={42} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function ObservatorySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Observatory" sub="Science" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={120} />
      <rect x="56" y="80" width="80" height="60" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="56" y="80" width="80" height="60" fill="url(#stoneTexture)" opacity="0.6" />
      <path d="M56,82 Q96,30 136,82 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M56,82 Q96,40 136,82" fill="none" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
      <path d="M68,72 Q96,40 124,72" fill="none" stroke={P.ink.line} strokeWidth="0.5" opacity="0.4" />
      <path d="M88,72 L104,72 L100,40 L92,40 Z" fill={P.ink.line} />
      <g transform="translate(96 50) rotate(-25)">
        <rect x="-2" y="-22" width="4" height="34" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-3" y="-24" width="6" height="3" fill={P.metal.gold} />
      </g>
      <g fill="#ffd966">
        <circle cx="32" cy="36" r="1.2" />
        <circle cx="160" cy="50" r="1.4" />
        <circle cx="48" cy="20" r="1" />
        <circle cx="142" cy="22" r="1" />
      </g>
      <path d="M86,140 L86,116 Q96,110 106,116 L106,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={56} y={70} palette={palette} scale={0.7} />
    </BuildingFrame>
  );
}

/* === ECONOMY === */

export function MarketplaceSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Marketplace" sub="Economy" category="gold" svgOnly={svgOnly}>
      <BuildingPlinth w={170} />
      <rect x="20" y="120" width="152" height="20" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.5" />
      <g>
        <line x1="36" y1="60" x2="36" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <line x1="80" y1="60" x2="80" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <path d="M28,60 L88,60 L92,80 L24,80 Z" fill="#c4413a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M24,80 L92,80 L88,86 L28,86 Z" fill="#8a2820" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="36" y="86" width="44" height="34" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="46" cy="96" rx="6" ry="3" fill={P.wood.mid} />
        <circle cx="44" cy="93" r="2" fill="#e85a4e" />
        <circle cx="48" cy="93" r="2" fill="#e85a4e" />
        <circle cx="46" cy="91" r="2" fill="#ffb84d" />
        <ellipse cx="68" cy="96" rx="6" ry="3" fill={P.wood.mid} />
        <circle cx="66" cy="93" r="2" fill="#7eaf5e" />
        <circle cx="70" cy="93" r="2" fill="#7eaf5e" />
      </g>
      <g>
        <line x1="100" y1="64" x2="100" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <line x1="156" y1="64" x2="156" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <path d="M92,64 L164,64 L168,84 L88,84 Z" fill="#3a6e94" stroke={P.ink.line} strokeWidth="1" />
        <path d="M88,84 L168,84 L164,90 L92,90 Z" fill="#1c4564" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="100" y="90" width="56" height="32" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="116" cy="104" rx="5" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="130" cy="104" rx="5" ry="6" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="144" cy="104" rx="5" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="138" cy="118" r="2" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="142" cy="116" r="2" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={96} y={56} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function HarborSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Harbor" sub="Economy" category="gold" svgOnly={svgOnly}>
      <rect x="0" y="100" width="192" height="60" fill={P.ground.water} />
      <path d="M0,108 Q24,104 48,108 T96,108 T144,108 T192,108" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.6" />
      <path d="M0,118 Q24,114 48,118 T96,118 T144,118 T192,118" stroke="#fff" strokeWidth="0.5" fill="none" opacity="0.4" />
      <rect x="20" y="96" width="120" height="14" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M20,96 H140 M30,96 V110 M50,96 V110 M70,96 V110 M90,96 V110 M110,96 V110 M130,96 V110" stroke={P.wood.dark} strokeWidth="0.5" />
      <rect x="20" y="60" width="60" height="40" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <ThatchRoof d="M14,60 L86,60 L70,36 L30,36 Z" />
      <rect x="42" y="76" width="16" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <g transform="translate(150 110)">
        <path d="M-22,0 Q0,-6 22,0 Q18,10 0,12 Q-18,10 -22,0 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <line x1="0" y1="-6" x2="0" y2="-30" stroke={P.wood.dark} strokeWidth="1.5" />
        <path d="M0,-26 L14,-18 L14,-8 L0,-6 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      <rect x="92" y="86" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="106" y="86" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="99" y="76" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={50} y={36} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function DockSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Dock" sub="Food" category="food" svgOnly={svgOnly}>
      {/* water background */}
      <rect x="0" y="118" width="192" height="42" fill={P.ground.water} />

      {/* animated wave line 1 */}
      <path d="M0,124 Q24,120 48,124 T96,124 T144,124 T192,124" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.5">
        <animate attributeName="d"
          values="M0,124 Q24,120 48,124 T96,124 T144,124 T192,124;M0,126 Q24,122 48,126 T96,122 T144,126 T192,126;M0,124 Q24,120 48,124 T96,124 T144,124 T192,124"
          dur="3s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* animated wave line 2 */}
      <path d="M0,132 Q24,128 48,132 T96,132 T144,132 T192,132" stroke="#fff" strokeWidth="0.4" fill="none" opacity="0.3">
        <animate attributeName="d"
          values="M0,132 Q24,128 48,132 T96,132 T144,132 T192,132;M0,130 Q24,134 48,130 T96,134 T144,130 T192,130;M0,132 Q24,128 48,132 T96,132 T144,132 T192,132"
          dur="3s" begin="1.5s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* pier planks */}
      <rect x="60" y="90" width="72" height="34" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M60,90 H132 M60,100 H132 M60,110 H132 M60,120 H132" stroke={P.wood.dark} strokeWidth="0.6" />

      {/* pier posts into water */}
      <line x1="72"  y1="120" x2="72"  y2="160" stroke={P.wood.dark} strokeWidth="3" />
      <line x1="96"  y1="120" x2="96"  y2="160" stroke={P.wood.dark} strokeWidth="3" />
      <line x1="120" y1="120" x2="120" y2="160" stroke={P.wood.dark} strokeWidth="3" />

      {/* small boat with rocking animation — pivot at waterline centre (146, 116) */}
      <g transform="translate(146 116)">
        <animateTransform attributeName="transform"
          type="rotate"
          values="0 0 0;1.5 0 0;0 0 0;-1.5 0 0;0 0 0"
          dur="4s" begin="0.8s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
          additive="sum" />
        <path d="M-16,-4 Q6,-8 16,-4 Q12,6 0,8 Q-12,6 -16,-4 Z" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
        <line x1="0" y1="-8" x2="0" y2="-28" stroke={P.wood.dark} strokeWidth="1.5" />
        <path d="M0,-26 L14,-18 L14,-8 L0,-8 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      </g>

      {/* civ banner */}
      <Banner x={96} y={62} palette={palette} scale={0.7} />
    </BuildingFrame>
  );
}

/* === MILITARY === */

export function BarracksSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Barracks" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      <rect x="30" y="80" width="132" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,86 H162 M30,100 H162 M30,114 H162 M30,128 H162" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M22,84 L170,84 L140,46 L52,46 Z" color="#5a3a20" shadow="#2a1810" />
      <line x1="44" y1="120" x2="44" y2="140" stroke={P.wood.dark} strokeWidth="2" />
      <circle cx="44" cy="116" r="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="38" y="120" width="12" height="8" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="32" y1="124" x2="56" y2="124" stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="84" y="100" width="24" height="40" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="100" x2="96" y2="140" stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M88,80 L104,80 L106,90 Q96,98 86,90 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="140" y1="84" x2="148" y2="140" stroke={P.wood.mid} strokeWidth="1.2" />
      <line x1="146" y1="84" x2="142" y2="140" stroke={P.wood.mid} strokeWidth="1.2" />
      <path d="M139,84 L142,76 L145,84" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      <path d="M145,84 L148,76 L151,84" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      <Banner x={96} y={46} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

export function WallsSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const merlons = Array.from({ length: 9 }).map((_, i) => (
    <rect x={14 + i * 20} y="68" width="10" height="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
  )).join('');
  const merlonTextures = Array.from({ length: 9 }).map((_, i) => (
    <rect x={14 + i * 20} y="68" width="10" height="14" fill="url(#stoneTexture)" opacity="0.7" />
  )).join('');
  const towerMerlons = [0, 1, 2, 3].map(i => (
    <rect x={70 + i * 14} y="20" width="8" height="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
  )).join('');
  return (
    <BuildingFrame label="Walls" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={170} color={P.stone.dark} />
      <rect x="14" y="80" width="164" height="60" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="14" y="80" width="164" height="60" fill="url(#stoneTexture)" opacity="0.7" />
      {merlons}
      {merlonTextures}
      <rect x="74" y="40" width="44" height="100" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="74" y="40" width="44" height="100" fill="url(#stoneTexture)" opacity="0.7" />
      <rect x="70" y="34" width="52" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {towerMerlons}
      <rect x="94" y="70" width="4" height="14" fill={P.ink.line} />
      <rect x="94" y="100" width="4" height="14" fill={P.ink.line} />
      <path d="M84,140 L84,118 Q96,108 108,118 L108,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="118" x2="96" y2="140" stroke={P.ink.soft} strokeWidth="0.6" />
      <Banner x={96} y={20} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

export function StableSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Stable" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      <rect x="30" y="86" width="132" height="54" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,92 H162 M30,108 H162 M30,124 H162" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M22,90 L170,90 L140,52 L52,52 Z" />
      <path d="M88,72 Q96,60 104,72 L100,80 L92,80 Z" fill="none" stroke={P.metal.iron} strokeWidth="2.4" />
      <rect x="46" y="106" width="22" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="46" y1="118" x2="68" y2="118" stroke={P.wood.mid} strokeWidth="0.6" />
      <rect x="124" y="106" width="22" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="124" y1="118" x2="146" y2="118" stroke={P.wood.mid} strokeWidth="0.6" />
      <g transform="translate(96 116)">
        <ellipse cx="0" cy="6" rx="14" ry="10" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="0" cy="10" rx="6" ry="4" fill="#3a2a1a" />
        <path d="M-10,-6 L-6,-12 L-2,-4 Z" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M2,-4 L6,-12 L10,-6 Z" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-4" cy="2" r="0.8" fill={P.ink.line} />
        <circle cx="4" cy="2" r="0.8" fill={P.ink.line} />
        <path d="M-2,-6 Q0,-14 4,-12" stroke="#3a2a1a" strokeWidth="2" fill="none" />
      </g>
      <rect x="156" y="128" width="14" height="12" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={52} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

/* === CULTURE === */

export function TempleSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const columns = [0, 1, 2, 3].map(i => (
    <g transform={`translate(${50 + i * 28} 0)`}>
      <rect x="-3" y="76" width="6" height="60" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="76" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="132" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
    </g>
  )).join('');
  return (
    <BuildingFrame label="Temple" sub="Culture" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      <rect x="40" y="74" width="112" height="62" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="40" y="74" width="112" height="62" fill="url(#stoneTexture)" opacity="0.4" />
      {columns}
      <TileRoof d="M32,78 L160,78 L96,38 Z" color="#9a6abf" />
      <ellipse cx="96" cy="62" rx="10" ry="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="96" cy="62" r="3" fill={P.metal.gold} />
      <circle cx="96" cy="62" r="1.4" fill={P.ink.line} />
      <path d="M28,140 L164,140 L158,146 L34,146 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={40} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function MonumentSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Monument" sub="Culture" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={100} />
      <path d="M84,40 L108,40 L112,140 L80,140 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M84,40 L108,40 L112,140 L80,140 Z" fill="url(#stoneTexture)" opacity="0.6" />
      <path d="M84,40 L96,28 L108,40 Z" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      <g fill={P.ink.line}>
        <circle cx="96" cy="60" r="2" />
        <rect x="92" y="68" width="8" height="2" />
        <rect x="94" y="78" width="4" height="6" />
        <path d="M92,90 L100,90 L96,96 Z" />
        <rect x="92" y="102" width="8" height="2" />
        <rect x="94" y="110" width="4" height="6" />
      </g>
      <Banner x={120} y={60} palette={palette} scale={0.9} />
      <rect x="40" y="124" width="30" height="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="42" y="127" width="2" height="10" fill={P.wood.dark} />
      <rect x="66" y="127" width="2" height="10" fill={P.wood.dark} />
    </BuildingFrame>
  );
}

export function AmphitheaterSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const arches = [-3, -2, -1, 0, 1, 2, 3].map(i => (
    <path d={`M${96 + i * 20 - 7},${110 + Math.abs(i) * 1.5} L${96 + i * 20 - 7},${102 + Math.abs(i) * 1.5} Q${96 + i * 20},${94 + Math.abs(i) * 1.5} ${96 + i * 20 + 7},${102 + Math.abs(i) * 1.5} L${96 + i * 20 + 7},${110 + Math.abs(i) * 1.5} Z`} fill={P.ink.soft} opacity="0.6" stroke={P.ink.line} strokeWidth="0.5" />
  )).join('');
  const secondTierWindows = [-2, -1, 0, 1, 2].map(i => (
    <rect x={92 + i * 22 - 4} y={66 + Math.abs(i) * 3} width="8" height="14" fill={P.ink.line} opacity="0.8" />
  )).join('');
  return (
    <BuildingFrame label="Amphitheater" sub="Culture" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={170} />
      <ellipse cx="96" cy="110" rx="78" ry="36" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="110" rx="78" ry="36" fill="url(#stoneTexture)" opacity="0.5" />
      {arches}
      <path d="M28,90 Q96,52 164,90 L164,108 Q96,76 28,108 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M28,90 Q96,52 164,90 L164,108 Q96,76 28,108 Z" fill="url(#stoneTexture)" opacity="0.6" />
      {secondTierWindows}
      <ellipse cx="96" cy="118" rx="34" ry="10" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="96" cy="116" rx="22" ry="5" fill={P.stone.dark} />
      <circle cx="88" cy="116" r="1.6" fill={P.ink.line} />
      <circle cx="100" cy="118" r="1.6" fill={P.ink.line} />
      <Banner x={96} y={50} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function ShrineSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Shrine" sub="Culture" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={100} />
      <rect x="68" y="92" width="56" height="48" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="68" y="92" width="56" height="48" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M62,94 L130,94 L96,62 Z" color="#9a6abf" />
      <path d="M86,140 L86,114 Q96,104 106,114 L106,140 Z" fill={P.ink.line} />
      <rect x="94" y="124" width="4" height="12" fill={P.cloth.linen} />
      <ellipse cx="96" cy="122" rx="2" ry="3" fill="#ffd966" />
      <ellipse cx="96" cy="142" rx="10" ry="3" fill={P.stone.dark} />
      <ellipse cx="96" cy="140" rx="8" ry="2" fill={P.metal.bronze} />
      <line x1="60" y1="64" x2="132" y2="64" stroke={P.wood.dark} strokeWidth="0.6" />
      <rect x="64" y="64" width="6" height="8" fill="#c4413a" />
      <rect x="74" y="64" width="6" height="8" fill="#3a6e94" />
      <rect x="84" y="64" width="6" height="8" fill="#7eaf5e" />
      <rect x="106" y="64" width="6" height="8" fill="#ffb84d" />
      <rect x="116" y="64" width="6" height="8" fill="#9a6abf" />
      <Banner x={130} y={70} palette={palette} scale={0.7} />
    </BuildingFrame>
  );
}

export function ForumSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const flanking = [34, 158].map((x, i) => (
    <g transform={`translate(${x} 0)`}>
      <rect x="-3" y="80" width="6" height="38" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="78" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="-5" y="118" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
    </g>
  )).join('');
  return (
    <BuildingFrame label="Forum" sub="Culture" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={170} />
      <rect x="20" y="116" width="152" height="24" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M50,116 V140 M80,116 V140 M110,116 V140 M140,116 V140 M20,128 H172" stroke={P.stone.dark} strokeWidth="0.4" />
      <rect x="78" y="92" width="36" height="24" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="78" y="92" width="36" height="24" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="74" y="88" width="44" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="92" y="64" width="8" height="24" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="96" cy="60" r="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M88,80 L92,72 M104,80 L100,72" stroke={P.cloth.linen} strokeWidth="3" />
      {flanking}
      <Banner x={96} y={52} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

/* === ESPIONAGE === */

export function SafehouseSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Safehouse" sub="Espionage" category="espionage" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      <rect x="42" y="72" width="108" height="68" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="72" width="108" height="68" fill="url(#stoneTexture)" opacity="0.5" />
      <ThatchRoof d="M34,74 L158,74 L130,40 L62,40 Z" color="#5a3a20" shadow="#2a1810" />
      <rect x="56" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="63" y1="92" x2="63" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="80" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="87" y1="92" x2="87" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="122" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="129" y1="92" x2="129" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="92" y="110" width="16" height="30" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="116" cy="138" r="1.6" fill={palette.bright} />
      <line x1="146" y1="74" x2="146" y2="140" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="74" x2="142" y2="140" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="92" x2="146" y2="92" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="106" x2="146" y2="106" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="120" x2="146" y2="120" stroke={P.wood.dark} strokeWidth="1" />
    </BuildingFrame>
  );
}

export function IntelAgencySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const windowsA = [0, 1, 2, 3].map(i => (
    <rect x={46 + i * 28} y="78" width="20" height="14" fill="#0a0a14" stroke={P.ink.line} strokeWidth="0.5" />
  )).join('');
  const windowsB = [0, 1, 2, 3].map(i => (
    <rect x={46 + i * 28} y="100" width="20" height="14" fill="#0a0a14" stroke={P.ink.line} strokeWidth="0.5" />
  )).join('');
  return (
    <BuildingFrame label="Intelligence Agency" sub="Espionage" category="espionage" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      <rect x="36" y="62" width="120" height="78" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="36" y="62" width="120" height="78" fill="url(#stoneTexture)" opacity="0.7" />
      {windowsA}
      {windowsB}
      <rect x="74" y="100" width="20" height="14" fill={palette.bright} opacity="0.7" />
      <line x1="96" y1="62" x2="96" y2="20" stroke={P.metal.iron} strokeWidth="1.4" />
      <line x1="96" y1="34" x2="86" y2="28" stroke={P.metal.iron} strokeWidth="0.8" />
      <line x1="96" y1="34" x2="106" y2="28" stroke={P.metal.iron} strokeWidth="0.8" />
      <circle cx="96" cy="20" r="2" fill={palette.bright} />
      <rect x="32" y="56" width="128" height="8" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="84" y="118" width="24" height="22" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="96" cy="124" rx="6" ry="3" fill={palette.trim} />
      <circle cx="96" cy="124" r="1.6" fill={P.ink.line} />
      <Banner x={132} y={56} palette={palette} scale={0.7} shape="square" />
    </BuildingFrame>
  );
}

export function SecurityBureauSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const slitsA = [0, 1, 2, 3, 4].map(i => (
    <rect x={36 + i * 26} y="92" width="14" height="4" fill={P.ink.line} />
  )).join('');
  const slitsB = [0, 1, 2, 3, 4].map(i => (
    <rect x={36 + i * 26} y="108" width="14" height="4" fill={P.ink.line} />
  )).join('');
  return (
    <BuildingFrame label="Security Bureau" sub="Espionage" category="espionage" svgOnly={svgOnly}>
      <BuildingPlinth w={170} color={P.stone.dark} />
      <rect x="22" y="72" width="148" height="68" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="22" y="72" width="148" height="68" fill="url(#stoneTexture)" opacity="0.7" />
      {slitsA}
      {slitsB}
      <rect x="138" y="36" width="18" height="40" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="134" y="32" width="26" height="8" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="147" cy="36" r="4" fill={palette.bright} />
      <path d="M147,36 L180,20 L180,52 Z" fill={palette.bright} opacity="0.4" />
      <circle cx="32" cy="80" r="4" fill={P.ink.line} stroke={P.metal.iron} strokeWidth="0.8" />
      <circle cx="32" cy="80" r="1.5" fill={palette.bright} />
      <circle cx="160" cy="80" r="4" fill={P.ink.line} stroke={P.metal.iron} strokeWidth="0.8" />
      <circle cx="160" cy="80" r="1.5" fill={palette.bright} />
      <rect x="80" y="116" width="32" height="24" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="116" x2="96" y2="140" stroke={P.metal.shine} strokeWidth="0.5" />
      <circle cx="86" cy="128" r="1.4" fill={P.metal.gold} />
      <circle cx="106" cy="128" r="1.4" fill={P.metal.gold} />
      <Banner x={56} y={56} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}
