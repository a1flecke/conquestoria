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

/* === S4b BUILDINGS (v3 design) === */

export function BronzeWorkshopSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Bronze Workshop" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="42" y="80" width="108" height="60" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="80" width="108" height="60" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M34,84 L158,84 L130,46 L62,46 Z" color="#d4903a" />
      {/* open arch entrance */}
      <path d="M70,140 L70,108 Q96,98 122,108 L122,140 Z" fill={P.ink.line} />
      {/* furnace glow — flickers via .cq-fire */}
      <g className="cq-fire">
        <ellipse cx="96" cy="124" rx="14" ry="9" fill="#e87a30" opacity="0.7" />
        <ellipse cx="96" cy="124" rx="9" ry="5" fill="#ffb84d" />
      </g>
      {/* workbench inside arch */}
      <rect x="80" y="118" width="32" height="3" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.4" />
      <circle cx="86" cy="116" r="2" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
      <circle cx="92" cy="116" r="1.6" fill={P.metal.bronze} />
      <rect x="98" y="114" width="6" height="3" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
      {/* hammering sparks (visible in busy state) */}
      <circle className="cq-spark" cx="90" cy="113" r="1.4" fill="#ffd966" />
      <circle className="cq-spark cq-spark--b" cx="100" cy="111" r="1.2" fill="#ffd966" />
      <circle className="cq-spark cq-spark--c" cx="106" cy="115" r="1.1" fill="#ffb84d" />
      {/* copper ingots stacked outside */}
      <rect x="46" y="132" width="14" height="3" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
      <rect x="48" y="129" width="10" height="3" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
      <rect x="50" y="126" width="6" height="3" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
      {/* hammer on wall */}
      <rect x="56" y="92" width="1.4" height="14" fill={P.wood.mid} />
      <rect x="52" y="88" width="9" height="5" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />
      {/* tongs on wall */}
      <line x1="136" y1="92" x2="132" y2="104" stroke={P.metal.iron} strokeWidth="1" />
      <line x1="140" y1="92" x2="136" y2="104" stroke={P.metal.iron} strokeWidth="1" />
      <Banner x={96} y={46} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

export function ArmorySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Armory" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      <rect x="38" y="68" width="116" height="72" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="38" y="68" width="116" height="72" fill="url(#stoneTexture)" opacity="0.7" />
      {/* battlements */}
      <rect x="38" y="60" width="116" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="42" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="62" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="82" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="102" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="122" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="142" y="54" width="10" height="10" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* crossed swords + shield on wall */}
      <g transform="translate(96 96)">
        <g transform="rotate(35)">
          <rect x="-0.8" y="-18" width="1.6" height="32" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="14" width="6" height="2" fill={P.metal.gold} />
          <rect x="-1" y="16" width="2" height="4" fill={P.wood.dark} />
        </g>
        <g transform="rotate(-35)">
          <rect x="-0.8" y="-18" width="1.6" height="32" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="14" width="6" height="2" fill={P.metal.gold} />
          <rect x="-1" y="16" width="2" height="4" fill={P.wood.dark} />
        </g>
        <path d="M-8,-8 L8,-8 L9,4 Q0,14 -9,4 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-1" y="-8" width="2" height="18" fill={palette.dark} />
        <rect x="-8" y="-3" width="16" height="2" fill={palette.dark} />
      </g>
      {/* iron-banded door */}
      <rect x="84" y="112" width="24" height="28" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="84" y="118" width="24" height="2" fill={P.metal.iron} />
      <rect x="84" y="128" width="24" height="2" fill={P.metal.iron} />
      <rect x="84" y="136" width="24" height="2" fill={P.metal.iron} />
      <circle cx="103" cy="126" r="1.4" fill={P.metal.iron} />
      {/* wall torches flanking the door — always-on flicker via .cq-fire */}
      <rect x="68" y="108" width="1.4" height="6" fill={P.wood.dark} />
      <g className="cq-fire">
        <ellipse cx="68.7" cy="106" rx="3" ry="4" fill="#ff8a3a" />
        <ellipse cx="68.7" cy="106" rx="1.6" ry="2.4" fill="#ffd966" />
      </g>
      <rect x="122.6" y="108" width="1.4" height="6" fill={P.wood.dark} />
      <g className="cq-fire">
        <ellipse cx="123.3" cy="106" rx="3" ry="4" fill="#ff8a3a" />
        <ellipse cx="123.3" cy="106" rx="1.6" ry="2.4" fill="#ffd966" />
      </g>
      {/* hammering sparks behind the door — visible in busy state */}
      <circle className="cq-spark" cx="90" cy="128" r="1.4" fill="#ffd966" />
      <circle className="cq-spark cq-spark--b" cx="103" cy="124" r="1.2" fill="#ffd966" />
      <circle className="cq-spark cq-spark--c" cx="96" cy="132" r="1.1" fill="#ffb84d" />
      <Banner x={50} y={50} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function RanchSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Ranch" sub="Food" category="food" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* grass patch inside fence */}
      <ellipse cx="86" cy="124" rx="56" ry="20" fill={P.ground.grass} stroke={P.ink.line} strokeWidth="0.5" />
      {/* barn in background */}
      <rect x="30" y="68" width="48" height="40" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,72 H78 M30,86 H78 M30,100 H78" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.6" />
      <ThatchRoof d="M24,72 L84,72 L70,42 L38,42 Z" />
      <rect x="48" y="86" width="12" height="22" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* fence */}
      <line x1="40" y1="118" x2="142" y2="118" stroke={P.wood.mid} strokeWidth="1.4" />
      <line x1="40" y1="128" x2="142" y2="128" stroke={P.wood.mid} strokeWidth="1.4" />
      <rect x="40" y="112" width="2.4" height="22" fill={P.wood.dark} />
      <rect x="62" y="112" width="2.4" height="22" fill={P.wood.dark} />
      <rect x="118" y="112" width="2.4" height="22" fill={P.wood.dark} />
      <rect x="140" y="112" width="2.4" height="22" fill={P.wood.dark} />
      {/* gate posts + ajar gate */}
      <rect x="92" y="108" width="2.4" height="26" fill={P.wood.dark} />
      <rect x="106" y="108" width="2.4" height="26" fill={P.wood.dark} />
      <line x1="108" y1="118" x2="120" y2="114" stroke={P.wood.mid} strokeWidth="1.2" />
      <line x1="108" y1="128" x2="120" y2="124" stroke={P.wood.mid} strokeWidth="1.2" />
      {/* horse grazing — head bobs via .cq-peek */}
      <g transform="translate(112 124)"><g className="cq-peek">
        <ellipse cx="0" cy="0" rx="14" ry="6" fill="#8a5a30" stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="-12" cy="-3" rx="6" ry="5" fill="#8a5a30" stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-17,-1 L-20,2 L-15,3 Z" fill="#8a5a30" stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="-10" y="4" width="2.4" height="8" fill="#5a3a1a" />
        <rect x="-2" y="4" width="2.4" height="8" fill="#5a3a1a" />
        <rect x="6" y="4" width="2.4" height="8" fill="#5a3a1a" />
        <rect x="11" y="4" width="2.4" height="8" fill="#5a3a1a" />
        <path d="M14,0 Q18,2 16,6" stroke="#5a3a1a" strokeWidth="2" fill="none" strokeLinecap="round" />
        <path d="M-9,-6 L-7,-10 L-5,-6 Z" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.3" />
        <circle cx="-14" cy="-3" r="0.6" fill={P.ink.line} />
      </g></g>
      <Banner x={54} y={44} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function CavalryAcademySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Cavalry Academy" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={170} />
      {/* training ring */}
      <ellipse cx="96" cy="118" rx="64" ry="22" fill={P.ground.grass} stroke={P.stone.mid} strokeWidth="2.4" />
      <ellipse cx="96" cy="118" rx="64" ry="22" fill="none" stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="96" cy="118" rx="58" ry="18" fill="none" stroke={P.stone.dark} strokeWidth="0.5" strokeDasharray="2 3" opacity="0.6" />
      {/* grandstand */}
      <rect x="156" y="100" width="22" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="156" y="106" width="22" height="6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="156" y="112" width="22" height="8" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* pennant pole */}
      <rect x="22" y="60" width="2.4" height="60" fill={P.wood.dark} />
      {/* horse + rider mid-drill — bobs via .cq-peek */}
      <g transform="translate(96 116)"><g className="cq-peek">
        <ellipse cx="0" cy="0" rx="16" ry="6" fill="#9a7050" stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="-14" cy="-4" rx="7" ry="5" fill="#9a7050" stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-20,-2 L-23,2 L-17,3 Z" fill="#9a7050" stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="-10" y="4" width="2.4" height="9" fill="#5a3820" />
        <rect x="-2" y="4" width="2.4" height="9" fill="#5a3820" />
        <rect x="6" y="4" width="2.4" height="9" fill="#5a3820" />
        <rect x="12" y="4" width="2.4" height="9" fill="#5a3820" />
        <path d="M-11,-9 L-9,-13 L-7,-7 L-5,-13 L-3,-9 Z" fill={P.ink.soft} />
        {/* rider — torso only, hips at saddle */}
        <rect x="-4" y="-10" width="8" height="6" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="0" cy="-14" r="3" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-3,-16 Q0,-19 3,-16 L3,-13 L-3,-13 Z" fill={P.metal.iron} />
      </g></g>
      <Banner x={23} y={60} palette={palette} scale={1.1} />
    </BuildingFrame>
  );
}

export function IronFoundrySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Iron Foundry" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      {/* main building */}
      <rect x="32" y="68" width="110" height="72" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="32" y="68" width="110" height="72" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M26,72 L150,72 L130,48 L46,48 Z" color="#3a2418" />
      {/* chimney */}
      <rect x="120" y="20" width="20" height="50" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="120" y="20" width="20" height="50" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="116" y="18" width="28" height="6" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* smoke plumes — rise via .cq-smoke */}
      <ellipse className="cq-smoke" cx="130" cy="14" rx="10" ry="6" fill="#888888" opacity="0.7" />
      <ellipse className="cq-smoke cq-smoke--b" cx="132" cy="14" rx="8" ry="5" fill="#888888" opacity="0.5" />
      <ellipse className="cq-smoke cq-smoke--c" cx="130" cy="14" rx="6" ry="4" fill="#a0a0a0" opacity="0.4" />
      {/* overhead beam with hanging chains */}
      <rect x="40" y="80" width="86" height="3" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M52,83 L54,87 L52,91 L54,95 L52,99 L54,103" stroke={P.metal.iron} strokeWidth="1.2" fill="none" />
      <path d="M70,83 L72,87 L70,91 L72,95 L70,99" stroke={P.metal.iron} strokeWidth="1.2" fill="none" />
      <path d="M108,83 L110,87 L108,91 L110,95 L108,99 L110,103" stroke={P.metal.iron} strokeWidth="1.2" fill="none" />
      {/* furnace door — molten glow flickers via .cq-fire */}
      <path d="M74,140 L74,114 Q88,104 102,114 L102,140 Z" fill={P.ink.line} />
      <g className="cq-fire">
        <ellipse cx="88" cy="124" rx="12" ry="9" fill="#f06020" opacity="0.85" />
        <ellipse cx="88" cy="124" rx="7" ry="5" fill="#ffd966" />
      </g>
      {/* iron ingots outside */}
      <rect x="118" y="132" width="18" height="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
      <rect x="120" y="129" width="14" height="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
      <Banner x={50} y={48} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

export function WarAcademySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="War Academy" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* main facade */}
      <rect x="34" y="62" width="124" height="78" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="34" y="62" width="124" height="78" fill="url(#stoneTexture)" opacity="0.6" />
      {/* entablature + pediment */}
      <rect x="30" y="56" width="132" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M26,56 L166,56 L156,44 L36,44 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M26,56 L166,56 L156,44 L36,44 Z" fill="url(#stoneTexture)" opacity="0.5" />
      {/* two columns flanking arch */}
      <g>
        <rect x="58" y="80" width="10" height="60" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="63" cy="80" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="63" cy="140" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="60" y1="86" x2="60" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
        <line x1="63" y1="86" x2="63" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
        <line x1="66" y1="86" x2="66" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
      </g>
      <g>
        <rect x="124" y="80" width="10" height="60" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="129" cy="80" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="129" cy="140" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="126" y1="86" x2="126" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
        <line x1="129" y1="86" x2="129" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
        <line x1="132" y1="86" x2="132" y2="136" stroke={P.stone.dark} strokeWidth="0.3" />
      </g>
      {/* central arch */}
      <path d="M80,140 L80,100 Q96,86 112,100 L112,140 Z" fill={P.ink.line} />
      {/* lit interior — pulses via .cq-glow */}
      <rect className="cq-glow" x="84" y="106" width="24" height="32" fill="#ffd966" opacity="0.25" />
      {/* crossed swords above arch */}
      <g transform="translate(96 76)">
        <g transform="rotate(35)">
          <rect x="-0.8" y="-12" width="1.6" height="22" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="10" width="6" height="2" fill={P.metal.gold} />
        </g>
        <g transform="rotate(-35)">
          <rect x="-0.8" y="-12" width="1.6" height="22" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x="-3" y="10" width="6" height="2" fill={P.metal.gold} />
        </g>
      </g>
      {/* training dummies in foreground */}
      <g transform="translate(28 132)">
        <rect x="-1.2" y="-10" width="2.4" height="18" fill={P.wood.mid} />
        <rect x="-7" y="-8" width="14" height="2.4" fill={P.wood.mid} />
        <ellipse cx="0" cy="-3" rx="5" ry="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="-4" y1="-3" x2="4" y2="-3" stroke={P.cloth.tunic} strokeWidth="0.4" />
      </g>
      <g transform="translate(164 132)">
        <rect x="-1.2" y="-10" width="2.4" height="18" fill={P.wood.mid} />
        <rect x="-7" y="-8" width="14" height="2.4" fill={P.wood.mid} />
        <ellipse cx="0" cy="-3" rx="5" ry="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="-4" y1="-3" x2="4" y2="-3" stroke={P.cloth.tunic} strokeWidth="0.4" />
      </g>
      <Banner x={96} y={42} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

export function MasonryWorksSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Masonry Works" sub="Production" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={160} color={P.stone.dark} />
      {/* stacked stone blocks — pyramid */}
      <g>
        <rect x="32" y="116" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="32" y="116" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
        <rect x="50" y="116" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="50" y="116" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
        <rect x="68" y="116" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="68" y="116" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
        <rect x="41" y="102" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="41" y="102" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
        <rect x="59" y="102" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="59" y="102" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
        <rect x="50" y="88" width="18" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="50" y="88" width="18" height="14" fill="url(#stoneTexture)" opacity="0.5" />
      </g>
      {/* scaffolding to right of stack */}
      <g>
        <rect x="100" y="60" width="2" height="78" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.3" />
        <rect x="148" y="60" width="2" height="78" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.3" />
        <rect x="100" y="78" width="50" height="2" fill={P.wood.mid} />
        <rect x="100" y="100" width="50" height="2" fill={P.wood.mid} />
        <rect x="100" y="122" width="50" height="2" fill={P.wood.mid} />
        <line x1="100" y1="60" x2="150" y2="80" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="100" y1="100" x2="150" y2="80" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="100" y1="100" x2="150" y2="122" stroke={P.wood.dark} strokeWidth="1" />
      </g>
      {/* unfinished block on scaffold */}
      <rect x="118" y="68" width="14" height="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="118" y="68" width="14" height="10" fill="url(#stoneTexture)" opacity="0.5" />
      {/* dust puff over the workface — rises via .cq-dust */}
      <ellipse className="cq-dust" cx="125" cy="68" rx="10" ry="5" fill="#d8c896" opacity="0" />
      {/* workbench + chisel */}
      <rect x="22" y="134" width="24" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="24" y="138" width="2" height="6" fill={P.wood.dark} />
      <rect x="42" y="138" width="2" height="6" fill={P.wood.dark} />
      <rect x="28" y="131" width="10" height="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.3" />
      <rect x="36" y="130" width="3" height="4" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.3" />
      <Banner x={132} y={56} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

export function SiegeWorkshopSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Siege Workshop" sub="Military" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* main barn */}
      <rect x="34" y="78" width="124" height="62" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
      <path d="M34,84 H158 M34,100 H158 M34,116 H158 M34,132 H158" stroke="#3a2010" strokeWidth="0.5" opacity="0.7" />
      <ThatchRoof d="M26,82 L166,82 L138,42 L54,42 Z" />
      {/* dark interior */}
      <rect x="76" y="110" width="40" height="30" fill={P.ink.line} />
      {/* sparks inside (visible in busy state) */}
      <circle className="cq-spark" cx="86" cy="124" r="1.4" fill="#ffd966" />
      <circle className="cq-spark cq-spark--b" cx="96" cy="120" r="1.2" fill="#ffd966" />
      <circle className="cq-spark cq-spark--c" cx="108" cy="128" r="1.1" fill="#ffb84d" />
      {/* double barn doors — swung open */}
      <g transform="translate(76 110)">
        <path d="M0,0 L-14,-4 L-14,30 L0,30 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="-12" y1="-2" x2="-12" y2="28" stroke="#3a2010" strokeWidth="0.5" />
      </g>
      <g transform="translate(116 110)">
        <path d="M0,0 L14,-4 L14,30 L0,30 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="12" y1="-2" x2="12" y2="28" stroke="#3a2010" strokeWidth="0.5" />
      </g>
      {/* catapult arm through opening */}
      <g transform="translate(94 130) rotate(-32)">
        <rect x="-2" y="-26" width="4" height="26" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="0" cy="-28" rx="5" ry="3" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="0" cy="-29" r="3" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      {/* partial wheel inside doorway */}
      <circle cx="106" cy="134" r="7" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="99" y1="134" x2="113" y2="134" stroke={P.wood.dark} strokeWidth="0.6" />
      <line x1="106" y1="127" x2="106" y2="141" stroke={P.wood.dark} strokeWidth="0.6" />
      <circle cx="106" cy="134" r="1.4" fill={P.ink.line} />
      {/* stone piles outside */}
      <circle cx="32" cy="138" r="5" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="42" cy="140" r="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="37" cy="132" r="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="156" cy="138" r="5" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="148" cy="140" r="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={42} palette={palette} scale={1} />
    </BuildingFrame>
  );
}

/* === CARAVANSERAI === */

export function CaravanseraiSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Caravanserai" sub="Economy" category="gold" svgOnly={svgOnly}>
      <BuildingPlinth w={160} color={P.stone.dark} />
      {/* sandy inner courtyard peeking above the wall */}
      <rect x="36" y="66" width="120" height="20" fill={P.ground.sand} />
      {/* camel head peeks over the inner wall — .cq-peek bob */}
      <g transform="translate(122 70)"><g className="cq-peek">
        <path d="M-2,14 Q-6,2 -3,-8 Q-1,-16 6,-18 Q12,-19 13,-13 L9,-10 Q4,-9 3,-3 Q2,6 4,14 Z" fill="#c8a878" stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="9" cy="-13" rx="5" ry="4" fill="#c8a878" stroke={P.ink.line} strokeWidth="0.7" />
        <ellipse cx="13" cy="-11" rx="2.6" ry="2" fill="#b89568" stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M5,-17 L4,-22 L8,-18 Z" fill="#b89568" stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="10" cy="-14" r="0.7" fill={P.ink.line} />
      </g></g>
      {/* main sandstone wall + crenellations */}
      <rect x="34" y="80" width="124" height="60" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="34" y="80" width="124" height="60" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="30" y="74" width="132" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="34" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="54" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="74" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="110" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="130" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="150" y="68" width="10" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* arched windows on each wing */}
      <path d="M48,140 L48,116 Q48,106 56,106 Q64,106 64,116 L64,140 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
      <path d="M51,140 L51,117 Q51,110 56,110 Q61,110 61,117 L61,140 Z" fill={P.ink.line} />
      <path d="M128,140 L128,116 Q128,106 136,106 Q144,106 144,116 L144,140 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
      <path d="M131,140 L131,117 Q131,110 136,110 Q141,110 141,117 L141,140 Z" fill={P.ink.line} />
      {/* central pointed gateway, wide enough for a loaded camel */}
      <path d="M74,140 L74,104 Q74,86 96,80 Q118,86 118,104 L118,140 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M80,140 L80,106 Q80,92 96,87 Q112,92 112,106 L112,140 Z" fill={P.ink.line} />
      <path d="M91,86 L101,86 L99,92 L93,92 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      {/* courtyard well in the foreground */}
      <g transform="translate(52 132)">
        <ellipse cx="0" cy="2" rx="11" ry="4" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.7" />
        <ellipse cx="0" cy="0" rx="11" ry="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <ellipse cx="0" cy="0" rx="6" ry="2.2" fill={P.ground.water} />
        <rect x="-1" y="-12" width="2" height="12" fill={P.wood.dark} />
        <rect x="-7" y="-13" width="14" height="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      {/* traders milling at the gate — bustle in the busy state (.cq-trade-fig) */}
      <g className="cq-trade-fig" transform="translate(86 138)">
        <circle cx="0" cy="-9" r="3" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-4,4 Q-4,-6 0,-6 Q4,-6 4,4 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g className="cq-trade-fig" transform="translate(104 139)">
        <circle cx="0" cy="-8" r="2.8" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-4,4 Q-4,-5 0,-5 Q4,-5 4,4 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g className="cq-trade-fig" transform="translate(70 140)">
        <circle cx="0" cy="-7" r="2.6" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-3.6,4 Q-3.6,-4 0,-4 Q3.6,-4 3.6,4 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <Banner x={62} y={66} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

/* === BANK === */

export function BankSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Bank" sub="Economy" category="gold" svgOnly={svgOnly}>
      <BuildingPlinth w={150} />
      {/* steps */}
      <rect x="36" y="134" width="120" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="44" y="128" width="104" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      {/* facade behind columns */}
      <rect x="52" y="72" width="88" height="58" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="52" y="72" width="88" height="58" fill="url(#stoneTexture)" opacity="0.5" />
      {/* four fluted columns */}
      <g>
        <ellipse cx="44" cy="74" rx="8" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="37" y="74" width="14" height="54" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="40" y1="78" x2="40" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="44" y1="78" x2="44" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="48" y1="78" x2="48" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <rect x="35" y="126" width="18" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <ellipse cx="66" cy="74" rx="8" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="59" y="74" width="14" height="54" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="62" y1="78" x2="62" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="66" y1="78" x2="66" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="70" y1="78" x2="70" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <rect x="57" y="126" width="18" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <ellipse cx="126" cy="74" rx="8" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="119" y="74" width="14" height="54" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="122" y1="78" x2="122" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="126" y1="78" x2="126" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="130" y1="78" x2="130" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <rect x="117" y="126" width="18" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <ellipse cx="148" cy="74" rx="8" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="141" y="74" width="14" height="54" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="144" y1="78" x2="144" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="148" y1="78" x2="148" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <line x1="152" y1="78" x2="152" y2="126" stroke={P.stone.mid} strokeWidth="0.5" />
        <rect x="139" y="126" width="18" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* entablature + triangular pediment */}
      <rect x="34" y="64" width="124" height="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M30,64 L96,34 L162,64 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,64 L96,34 L162,64 Z" fill="url(#stoneTexture)" opacity="0.5" />
      <circle cx="96" cy="55" r="4.5" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
      {/* vault interior glow — .cq-glow implies stored wealth */}
      <rect className="cq-glow" x="82" y="86" width="28" height="42" rx="2" fill={P.metal.gold} opacity="0.3" />
      {/* iron vault door + gear-wheel lock + gold rivets */}
      <rect x="84" y="88" width="24" height="42" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="84" y="96" width="24" height="2.4" fill={P.ink.soft} />
      <rect x="84" y="118" width="24" height="2.4" fill={P.ink.soft} />
      <circle cx="96" cy="109" r="8" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="96" cy="109" r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="104" y1="109" x2="88" y2="109" stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="101.66" y1="114.66" x2="90.34" y2="103.34" stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="96" y1="117" x2="96" y2="101" stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="90.34" y1="114.66" x2="101.66" y2="103.34" stroke={P.ink.line} strokeWidth="0.7" />
      <circle cx="89" cy="92" r="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="103" cy="92" r="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.3" />
      {/* stacked gold coins at the foot of the steps — glint when busy (.cq-coin-shimmer) */}
      <g className="cq-coin-shimmer" transform="translate(60 132)">
        <ellipse cx="0" cy="0" rx="7" ry="2.6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="0" cy="-2.8" rx="7" ry="2.6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="1" cy="-5.6" rx="7" ry="2.6" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      {/* patrons on the steps — bustle when busy (.cq-trade-fig) */}
      <g className="cq-trade-fig" transform="translate(118 132)">
        <circle cx="0" cy="-9" r="3" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-4,5 Q-4,-6 0,-6 Q4,-6 4,5 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g className="cq-trade-fig" transform="translate(132 137)">
        <circle cx="0" cy="-8" r="2.8" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.4" />
        <path d="M-3.6,4 Q-3.6,-5 0,-5 Q3.6,-5 3.6,4 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <Banner x={96} y={34} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

/* === STOCK EXCHANGE === */

export function StockExchangeSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Stock Exchange" sub="Economy" category="gold" svgOnly={svgOnly}>
      <BuildingPlinth w={170} />
      {/* main hall */}
      <rect x="26" y="86" width="140" height="54" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="26" y="86" width="140" height="54" fill="url(#stoneTexture)" opacity="0.5" />
      <rect x="22" y="80" width="148" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      {/* domed rotunda */}
      <rect x="78" y="58" width="36" height="22" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M76,60 Q96,30 116,60 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M76,60 Q96,42 116,60" fill="none" stroke={P.stone.light} strokeWidth="0.8" opacity="0.6" />
      <circle cx="96" cy="32" r="2.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
      {/* three tall arched windows, warm glow inside — .cq-glow */}
      <rect className="cq-glow" x="38" y="98" width="12" height="34" fill="#ffce6a" opacity="0.4" />
      <path d="M37,134 L37,108 Q37,98 44,98 Q51,98 51,108 L51,134 Z" fill="none" stroke={P.stone.dark} strokeWidth="1.4" />
      <line x1="44" y1="100" x2="44" y2="134" stroke={P.stone.dark} strokeWidth="0.6" />
      <rect className="cq-glow" x="90" y="98" width="12" height="34" fill="#ffce6a" opacity="0.4" />
      <path d="M89,134 L89,108 Q89,98 96,98 Q103,98 103,108 L103,134 Z" fill="none" stroke={P.stone.dark} strokeWidth="1.4" />
      <line x1="96" y1="100" x2="96" y2="134" stroke={P.stone.dark} strokeWidth="0.6" />
      <rect className="cq-glow" x="132" y="98" width="12" height="34" fill="#ffce6a" opacity="0.4" />
      <path d="M131,134 L131,108 Q131,98 138,98 Q145,98 145,108 L145,134 Z" fill="none" stroke={P.stone.dark} strokeWidth="1.4" />
      <line x1="138" y1="100" x2="138" y2="134" stroke={P.stone.dark} strokeWidth="0.6" />
      {/* exterior ledger / ticker boards with quill sparks */}
      <g transform="translate(34 96)">
        <rect x="0" y="0" width="26" height="20" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="3" y1="4" x2="23" y2="4" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="8" x2="23" y2="8" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="12" x2="23" y2="12" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="16" x2="23" y2="16" stroke={P.ink.soft} strokeWidth="0.6" />
        <circle className="cq-spark" cx="20" cy="5" r="1.3" fill="#ffd966" />
        <circle className="cq-spark cq-spark--b" cx="22" cy="11" r="1.1" fill="#ffd966" />
      </g>
      <g transform="translate(132 96)">
        <rect x="0" y="0" width="26" height="20" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="3" y1="4" x2="23" y2="4" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="8" x2="23" y2="8" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="12" x2="23" y2="12" stroke={P.ink.soft} strokeWidth="0.6" />
        <line x1="3" y1="16" x2="23" y2="16" stroke={P.ink.soft} strokeWidth="0.6" />
        <circle className="cq-spark cq-spark--c" cx="5" cy="6" r="1.2" fill="#ffb84d" />
      </g>
      {/* corner bell tower with a hanging bronze bell */}
      <rect x="150" y="52" width="20" height="34" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="150" y="52" width="20" height="34" fill="url(#stoneTexture)" opacity="0.5" />
      <path d="M148,52 L172,52 L160,40 Z" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <path d="M154,72 Q154,62 160,62 Q166,62 166,72 Z" fill={P.ink.line} />
      <path d="M157,70 Q157,64 160,64 Q163,64 163,70 L164,72 L156,72 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="160" cy="72" r="0.9" fill={P.metal.bronze} />
      {/* two haggling merchant silhouettes — bustle when busy (.cq-trade-fig) */}
      <g className="cq-trade-fig" transform="translate(70 130)">
        <circle cx="0" cy="-12" r="4" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-6,8 Q-6,-8 0,-8 Q6,-8 6,8 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M5,-6 Q12,-10 13,-15" fill="none" stroke={P.skin.warm} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g className="cq-trade-fig" transform="translate(108 130)">
        <circle cx="0" cy="-12" r="4" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-6,8 Q-6,-8 0,-8 Q6,-8 6,8 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-5,-6 Q-12,-9 -13,-14" fill="none" stroke={P.skin.cool} strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <Banner x={96} y={20} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

/* === ERA 6 BUILDINGS (placeholder art — replace with generate-sprite-prompt output) === */

// TODO(art): Replace with a full facade: arched entrance, display cases visible through windows, stone frieze, taxidermy skeleton silhouette on roof.
export function NaturalHistoryMuseumSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const columns = [40, 64, 88, 112, 136].map(x =>
    <rect x={x} y={72} width="10" height="60" rx="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
  ).join('');
  return (
    <BuildingFrame label="Natural History Museum" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={136} />
      {columns}
      {/* pediment */}
      <path d="M30,72 L96,38 L162,72 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* door */}
      <rect x="84" y="104" width="24" height="28" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* fossil spiral on pediment */}
      <path d="M96,54 Q104,50 108,56 Q112,62 108,68 Q100,72 94,66 Q88,60 92,54" fill="none" stroke={palette.mid} strokeWidth="2" />
      <Banner x={148} y={26} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a medical hall: red cross emblem over entrance, herb garden boxes at base, apothecary jars in ground-floor windows.
export function SurgeryGuildSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Surgery Guild" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={120} />
      {/* main building */}
      <rect x="52" y="72" width="88" height="60" rx="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M44,72 L96,42 L148,72 Z" color={palette.mid} />
      {/* red cross on facade */}
      <rect x="84" y="88" width="24" height="8" rx="2" fill="#cc2222" />
      <rect x="92" y="80" width="8" height="24" rx="2" fill="#cc2222" />
      {/* door */}
      <rect x="82" y="108" width="28" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={136} y={32} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a domed concert hall: grand portico columns, arched windows, golden chandeliers visible inside, ornate frieze.
export function ConcertHallSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const windows = [52, 88, 124].map(x =>
    <path d={`M${x},120 L${x},96 Q${x + 12},80 ${x + 24},96 L${x + 24},120 Z`}
      fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
  ).join('');
  return (
    <BuildingFrame label="Concert Hall" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={144} />
      {/* grand façade with arched windows */}
      <rect x="32" y="68" width="128" height="64" rx="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M24,68 L96,32 L168,68 Z" color={palette.mid} />
      {windows}
      {/* musical note on roof */}
      <circle cx="96" cy="50" r="5" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="101" y1="50" x2="101" y2="38" stroke={P.metal.gold} strokeWidth="2" />
      <Banner x={152} y={22} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a star-fort aerial view: angled bastions at cardinal points, central keep, moat ring, artillery emplacements on ramparts.
export function StarFortSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Star Fort" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={144} />
      {/* star-shaped walls from above perspective */}
      <path d="M96,44 L112,76 L148,80 L124,104 L132,140 L96,124 L60,140 L68,104 L44,80 L80,76 Z"
        fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.5" />
      {/* inner courtyard */}
      <circle cx="96" cy="92" r="24" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      {/* central tower */}
      <rect x="82" y="76" width="28" height="32" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      {/* flag */}
      <line x1="96" y1="64" x2="96" y2="76" stroke={P.ink.line} strokeWidth="1.5" />
      <path d="M96,64 L108,68 L96,72 Z" fill={palette.bright} />
      <Banner x={148} y={28} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a military academy: parade ground archway, colonnaded hall, officers' crest above entrance, stacked muskets flanking doors.
export function MilitaryAcademySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const merlonsLeft = [28, 36, 44].map(x => <rect x={x} y={52} width="6" height="10" rx="1" fill={P.stone.mid} />).join('');
  const merlonsRight = [134, 142, 150].map(x => <rect x={x} y={52} width="6" height="10" rx="1" fill={P.stone.mid} />).join('');
  return (
    <BuildingFrame label="Military Academy" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      {/* imposing main building */}
      <rect x="36" y="72" width="120" height="60" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* symmetrical towers */}
      <rect x="28" y="60" width="30" height="72" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="134" y="60" width="30" height="72" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      {/* battlements on towers */}
      {merlonsLeft}
      {merlonsRight}
      {/* main door */}
      <path d="M76,132 L76,104 Q96,90 116,104 L116,132 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* regimental crest */}
      <circle cx="96" cy="88" r="10" fill={palette.mid} stroke={P.metal.gold} strokeWidth="1.5" />
      <path d="M91,88 L96,82 L101,88 L96,94 Z" fill={P.metal.gold} />
      <Banner x={150} y={24} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a cipher bureau: narrow tall building, candlelit barred windows, wax-seal emblem above door, coded scroll pinned to wall visible inside.
export function GrandCipherBureauSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const bars = [58, 84, 110].map(x =>
    <g>
      <rect x={x} y="94" width="16" height="24" rx="1" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1={x + 8} y1="94" x2={x + 8} y2="118" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1={x} y1="106" x2={x + 16} y2="106" stroke={P.ink.line} strokeWidth="0.5" />
    </g>
  ).join('');
  return (
    <BuildingFrame label="Grand Cipher Bureau" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={136} />
      {/* austere government building */}
      <rect x="44" y="80" width="104" height="52" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M36,80 L96,48 L156,80 Z" color={palette.mid} />
      {/* narrow barred windows */}
      {bars}
      {/* cipher keyhole on door */}
      <rect x="84" y="108" width="24" height="24" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="96" cy="116" r="4" fill={palette.dark} stroke={P.metal.gold} strokeWidth="1" />
      <path d="M93,120 L99,120 L97,126 L95,126 Z" fill={P.metal.gold} />
      <Banner x={144} y={28} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// ERA 7 BUILDINGS

// TODO(art): Replace with a factory: brick industrial building, tall chimney stack with smoke, large gear or flywheel visible, iron-framed windows, steam exhaust pipes along roof.
export function FactorySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Factory" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      {/* main factory hall */}
      <rect x="28" y="80" width="136" height="60" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.2" />
      {/* chimney */}
      <rect x="88" y="36" width="16" height="46" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* smoke */}
      <circle cx="96" cy="30" r="8" fill="#888" opacity="0.5" />
      <circle cx="100" cy="22" r="6" fill="#888" opacity="0.4" />
      {/* iron-framed windows */}
      <rect x="40" y="92" width="24" height="20" rx="1" fill={palette.bright} stroke={P.metal.iron} strokeWidth="1.2" />
      <rect x="76" y="92" width="24" height="20" rx="1" fill={palette.bright} stroke={P.metal.iron} strokeWidth="1.2" />
      <rect x="112" y="92" width="24" height="20" rx="1" fill={palette.bright} stroke={P.metal.iron} strokeWidth="1.2" />
      {/* large gear on facade */}
      <circle cx="96" cy="118" r="10" fill="none" stroke={P.metal.iron} strokeWidth="2" />
      <circle cx="96" cy="118" r="3" fill={P.metal.iron} />
      {/* main door */}
      <rect x="80" y="116" width="32" height="24" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={24} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a steel mill: sprawling iron-clad building, blast furnace glowing orange, molten steel ladle crane visible above, heavy industrial smoke rising.
export function SteelMillSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Steel Mill" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={156} />
      {/* main mill building */}
      <rect x="24" y="84" width="144" height="56" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      {/* blast furnace cone */}
      <path d="M56,84 L56,52 L80,52 L80,84 Z" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* furnace glow */}
      <ellipse cx="68" cy="84" rx="14" ry="4" fill="#f97316" opacity="0.7" />
      {/* second chimney */}
      <rect x="110" y="44" width="14" height="42" rx="1" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* steel ladle/crane arm */}
      <line x1="130" y1="60" x2="160" y2="44" stroke={P.metal.shine} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="160" cy="44" r="5" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="1" />
      {/* iron plating detail */}
      <line x1="24" y1="100" x2="168" y2="100" stroke={P.metal.shine} strokeWidth="0.8" opacity="0.5" />
      <line x1="24" y1="116" x2="168" y2="116" stroke={P.metal.shine} strokeWidth="0.8" opacity="0.5" />
      {/* main gate */}
      <rect x="76" y="116" width="40" height="24" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={154} y={24} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a field hospital: white canvas tent or timber building with red cross banner, stretchers visible, medical lanterns hanging outside.
export function FieldHospitalSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Field Hospital" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      {/* main tent structure */}
      <path d="M36,140 L36,84 L96,48 L156,84 L156,140 Z"
        fill="#f5f0e8" stroke={P.ink.line} strokeWidth="1.2" />
      {/* tent ridge pole */}
      <line x1="96" y1="48" x2="96" y2="140" stroke={P.stone.dark} strokeWidth="1.5" strokeDasharray="4,2" />
      {/* red cross banner */}
      <rect x="78" y="60" width="36" height="36" rx="2" fill="white" stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="88" y="64" width="16" height="28" rx="1" fill="#e03030" />
      <rect x="82" y="70" width="28" height="16" rx="1" fill="#e03030" />
      {/* entrance flap */}
      <path d="M72,140 L80,100 L96,96 L112,100 L120,140" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* medical lanterns */}
      <circle cx="48" cy="90" r="6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="144" cy="90" r="6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={148} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a print shop: large letter-press machine visible through window, stacked papers and pamphlets, ink-stained aprons hanging, newspaper headlines posted.
export function PrintShopSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Print Shop" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={136} />
      {/* shop building */}
      <rect x="32" y="76" width="128" height="64" rx="2" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* TileRoof */}
      <TileRoof d="M24,76 L96,44 L168,76 Z" color={palette.mid} />
      {/* large window with press machine silhouette */}
      <rect x="48" y="88" width="48" height="36" rx="1" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      <rect x="60" y="96" width="24" height="20" rx="1" fill={P.ink.line} opacity="0.3" />
      {/* hanging newspaper sign */}
      <rect x="110" y="80" width="36" height="24" rx="1" fill="#f5f0e8" stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="116" y1="88" x2="140" y2="88" stroke={P.ink.line} strokeWidth="1" />
      <line x1="116" y1="93" x2="136" y2="93" stroke={P.ink.line} strokeWidth="1" />
      <line x1="116" y1="98" x2="138" y2="98" stroke={P.ink.line} strokeWidth="1" />
      {/* main door */}
      <rect x="76" y="116" width="40" height="24" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a census office: formal government building with grand entrance stairs, official seals on pillars, clerks visible through arched windows, pigeonhole document shelves inside.
export function CensusOfficeSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Census Office" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={136} />
      {/* main neoclassical building */}
      <rect x="32" y="80" width="128" height="60" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* TileRoof pediment */}
      <TileRoof d="M24,80 L96,48 L168,80 Z" color={palette.mid} />
      {/* columns (3) */}
      {[52, 88, 124].map(x =>
        <rect key={x} x={x} y={80} width="8" height="60" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      ).join('')}
      {/* government seal */}
      <circle cx="96" cy="64" r="8" fill={palette.mid} stroke={P.metal.gold} strokeWidth="1.5" />
      <path d="M96,58 L98,64 L104,64 L99,68 L101,74 L96,70 L91,74 L93,68 L88,64 L94,64 Z"
        fill={P.metal.gold} />
      {/* main door with steps */}
      <rect x="76" y="116" width="40" height="24" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a national railway hall: grand Victorian station building, iron-arched glass roof over train shed, locomotive smoke visible, passengers on platform.
export function NationalRailwaySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="National Railway" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* grand station facade */}
      <rect x="20" y="76" width="152" height="64" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* iron-arched glass roof */}
      <path d="M20,76 Q96,44 172,76" fill="none" stroke={P.metal.shine} strokeWidth="3" />
      <path d="M32,76 Q96,52 160,76" fill={palette.bright} stroke={P.metal.shine} strokeWidth="1.2" opacity="0.4" />
      {/* clock tower */}
      <rect x="82" y="36" width="28" height="42" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="96" cy="52" r="10" fill="#f5f0e8" stroke={P.ink.line} strokeWidth="1" />
      <line x1="96" y1="46" x2="96" y2="52" stroke={P.ink.line} strokeWidth="1.5" />
      <line x1="96" y1="52" x2="102" y2="56" stroke={P.ink.line} strokeWidth="1.5" />
      {/* arched windows */}
      {[36, 76, 116].map(x =>
        <path key={x} d={`M${x},108 L${x},92 Q${x + 16},80 ${x + 32},92 L${x + 32},108 Z`}
          fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      <Banner x={158} y={22} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a grand arsenal: fortified warehouse complex, stacked cannon barrels and crates visible, military flag above gate, thick stone walls with arched munitions bays.
export function GrandArsenalSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Grand Arsenal" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* main arsenal building — thick stone walls */}
      <rect x="20" y="72" width="152" height="68" rx="3" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.5" />
      {/* battlements */}
      {[24, 36, 48, 60, 72, 84, 96, 108, 120, 132, 144, 156].map(x =>
        <rect key={x} x={x} y={60} width="8" height="14" rx="1" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* munitions bay arches */}
      {[32, 76, 120].map(x =>
        <path key={x} d={`M${x},140 L${x},108 Q${x + 20},92 ${x + 40},108 L${x + 40},140 Z`}
          fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* cannon barrels protruding */}
      <rect x="24" y="92" width="20" height="8" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="148" y="92" width="20" height="8" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* flag */}
      <line x1="96" y1="44" x2="96" y2="60" stroke={P.ink.line} strokeWidth="1.5" />
      <path d="M96,44 L112,50 L96,56 Z" fill={palette.bright} />
      <Banner x={154} y={22} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a people's university: grand gothic or neoclassical campus building, lecture hall with illuminated windows, academic tower with observatory dome, students in courtyard.
export function PeoplesUniversitySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Peoples University" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={156} />
      {/* main hall */}
      <rect x="28" y="80" width="136" height="60" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* TileRoof */}
      <TileRoof d="M20,80 L96,44 L172,80 Z" color={palette.mid} />
      {/* academic tower with dome */}
      <rect x="74" y="36" width="44" height="46" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="36" rx="22" ry="10" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* illuminated windows */}
      {[40, 72, 104, 136].map(x =>
        <rect key={x} x={x} y={90} width="20" height="28" rx="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* double main door */}
      <rect x="68" y="116" width="56" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="116" x2="96" y2="140" stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={22} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with a colonial admin hall: neoclassical facade, empire flag above entrance, courier board with pinned maps, columned courtyard visible through archway.
export function ColonialAdministrationSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const cols = [50, 76, 102, 128].map(x =>
    <rect x={x} y={76} width="8" height="52" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
  ).join('');
  return (
    <BuildingFrame label="Colonial Administration" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={144} />
      {/* colonial government hall */}
      <rect x="36" y="76" width="120" height="56" rx="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* triangular pediment */}
      <TileRoof d="M28,76 L96,40 L164,76 Z" color={palette.mid} />
      {/* decorative columns */}
      {cols}
      {/* main entrance */}
      <rect x="80" y="108" width="32" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* imperial seal */}
      <circle cx="96" cy="56" r="8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="1" />
      <path d="M96,50 L98,56 L104,56 L99,60 L101,66 L96,62 L91,66 L93,60 L88,56 L94,56 Z"
        fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={152} y={22} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

/* === ERA 8 REGULAR BUILDINGS === */

// TODO(art): Replace with steel foundry: Bessemer converter vessel angled to pour, molten-steel splash, industrial brick walls, smokestacks, rail line entering loading bay.
export function SteelFoundrySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Steel Foundry" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={148} />
      <rect x="30" y="88" width="132" height="48" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.2" />
      {/* Bessemer converter */}
      <ellipse cx="78" cy="72" rx="22" ry="28" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
      <ellipse cx="78" cy="56" rx="14" ry="8" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
      {/* molten glow */}
      <ellipse cx="78" cy="62" rx="10" ry="5" fill={P.metal.gold} opacity="0.7" />
      {/* chimney stack */}
      <rect x="128" y="44" width="16" height="56" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="136" cy="44" rx="8" ry="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with telephone exchange: Victorian exchange hall, rows of switchboard operators at brass panels, overhead wiring, clock on the wall.
export function TelephoneExchangeSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Telephone Exchange" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="34" y="82" width="124" height="54" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M28,82 L96,50 L164,82 Z" color={palette.mid} />
      {/* telegraph poles visible outside */}
      <line x1="42" y1="50" x2="42" y2="84" stroke={P.metal.iron} strokeWidth="2" />
      <line x1="36" y1="58" x2="48" y2="58" stroke={P.metal.iron} strokeWidth="1.2" />
      <line x1="36" y1="64" x2="48" y2="64" stroke={P.metal.iron} strokeWidth="1.2" />
      {/* switchboard window suggestion */}
      {[50, 80, 110, 140].map(x =>
        <rect key={x} x={x} y={94} width="18" height="22" rx="1.5" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* door */}
      <rect x="80" y="114" width="32" height="22" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={150} y={24} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with labor hall: brick assembly hall, large arched windows, trade-union banner over entrance, speaker's podium visible inside, workers gathering outside.
export function LaborHallSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Labor Hall" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={144} />
      <rect x="32" y="80" width="128" height="56" rx="2" fill="#8b6040" stroke={P.ink.line} strokeWidth="1.2" />
      {/* arched windows */}
      {[50, 90, 130].map(x => (
        <rect key={x} x={x} y={90} width="22" height="32" rx="11" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.9" />
      )).join('')}
      {/* union banner over entry */}
      <rect x="70" y="72" width="52" height="12" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="72" y="74" width="48" height="8" rx="1" fill={palette.bright} opacity="0.6" />
      {/* door */}
      <rect x="82" y="112" width="28" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={150} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with opera house: grand neoclassical facade, wide pediment, triple arched entrance, masks-of-comedy-tragedy relief, gaslamp sconces.
export function OperaHouseSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const cols = [44, 68, 92, 116, 140].map(x =>
    <rect x={x} y={78} width="8" height="54" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
  ).join('');
  return (
    <BuildingFrame label="Opera House" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="28" y="78" width="136" height="58" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M20,78 L96,40 L172,78 Z" color={palette.mid} />
      {cols}
      {/* triple arched entry */}
      {[56, 84, 112].map(x =>
        <rect key={x} x={x} y={106} width="24" height="30" rx="12" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* decorative pediment seal */}
      <circle cx="96" cy="55" r="9" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="1" />
      <Banner x={152} y={22} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with bacteriology lab: Victorian laboratory interior, microscopes on benches, petri dishes, gas burners, high-arched skylight windows.
export function BacteriologyLabSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Bacteriology Lab" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      <rect x="32" y="80" width="128" height="56" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* skylight roof */}
      <TileRoof d="M24,80 L96,44 L168,80 Z" color={palette.mid} />
      {/* lab bench outline */}
      <rect x="44" y="100" width="104" height="18" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.9" />
      {/* microscope silhouettes */}
      {[58, 82, 106, 130].map(x =>
        <g key={x}>
          <rect x={x} y={90} width="6" height="12" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <ellipse cx={x + 3} cy={90} rx="4" ry="3" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        </g>
      ).join('')}
      {/* flask highlight */}
      <ellipse cx="96" cy="62" rx="8" ry="10" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" opacity="0.7" />
      <Banner x={150} y={22} palette={palette} scale={0.83} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with stock exchange tower: steel-frame skyscraper base, ticker-tape board, trading floor arched window, financiers in top hats at street level.
export function StockExchangeTowerSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Stock Exchange Tower" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={100} />
      {/* tower shaft */}
      <rect x="56" y="28" width="80" height="108" rx="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* steel spandrel bands */}
      {[48, 64, 80, 96, 112].map(y =>
        <rect key={y} x={58} y={y} width={76} height={4} fill={P.metal.iron} opacity="0.25" />
      ).join('')}
      {/* window grid */}
      {[36, 56, 76, 96].map(y =>
        [66, 84, 102, 120].map(x =>
          <rect key={`${x}-${y}`} x={x} y={y} width="12" height="14" rx="1" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.6" />
        )
      ).flat().join('')}
      {/* entrance arch */}
      <rect x="80" y="118" width="32" height="18" rx="10" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={118} y={16} palette={palette} scale={0.78} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with sanatorium: Victorian public health building, wide verandahs for fresh-air patients, ornate ironwork railings, nurses in uniform, well-tended gardens.
export function SanatoriumSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Sanatorium" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="24" y="82" width="144" height="54" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* pitched roof */}
      <TileRoof d="M18,82 L96,46 L174,82 Z" color={palette.mid} />
      {/* verandah rail */}
      <rect x="24" y="108" width="144" height="4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      {/* large airy windows */}
      {[36, 72, 108, 144].map(x =>
        <rect key={x} x={x} y={90} width="28" height="36" rx="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.9" />
      ).join('')}
      {/* cross symbol */}
      <rect x="90" y="52" width="12" height="28" rx="2" fill="white" stroke={P.ink.line} strokeWidth="0.9" />
      <rect x="82" y="60" width="28" height="10" rx="2" fill="white" stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={152} y={22} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with power station: brick turbine hall, generator drums, overhead crane, insulators on exterior, coal-hopper conveyor, chimney with red warning band.
export function PowerStationSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Power Station" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={148} />
      {/* main hall */}
      <rect x="28" y="72" width="136" height="64" rx="3" fill="#6a5a4a" stroke={P.ink.line} strokeWidth="1.2" />
      {/* large industrial windows */}
      {[36, 70, 104, 138].map(x =>
        <rect key={x} x={x} y={80} width="24" height="36" rx="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* chimney */}
      <rect x="148" y="32" width="14" height="52" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="146" y="32" width="18" height="6" rx="1" fill="#c03030" stroke={P.ink.line} strokeWidth="0.8" />
      {/* lightning bolt emblem */}
      <path d="M96,80 L88,98 L95,98 L86,116 L108,94 L100,94 Z"
        fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={152} y={22} palette={palette} scale={0.8} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with exhibition hall: Crystal-Palace-style iron-and-glass pavilion, pennant banners, crowds of visitors, industrial machinery on display inside.
export function ExhibitionHallSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Exhibition Hall" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* glass hall body */}
      <rect x="16" y="76" width="160" height="60" rx="4" fill={palette.bright} stroke={P.ink.line} strokeWidth="1.2" opacity="0.75" />
      {/* iron ribs */}
      {[32, 56, 80, 104, 128, 152].map(x =>
        <line key={x} x1={x} y1={76} x2={x} y2={136} stroke={P.metal.iron} strokeWidth="2" opacity="0.5" />
      ).join('')}
      {/* arched roof */}
      <path d="M16,76 Q96,36 176,76" fill="none" stroke={P.metal.iron} strokeWidth="2.5" />
      {/* pennant row */}
      {[36, 56, 76, 96, 116, 136, 156].map(x =>
        <path key={x} d={`M${x},62 L${x + 8},68 L${x},74 Z`} fill={palette.mid} />
      ).join('')}
      <Banner x={152} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

/* === ERA 8 NATIONAL PROJECT SPRITES === */

// TODO(art): Replace with world fair pavilion: ornate iron-lattice grand hall, international flags, fountain plaza, exhibition towers, fireworks burst above.
export function WorldFairSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="World Fair" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* central pavilion */}
      <rect x="44" y="68" width="104" height="68" rx="4" fill={palette.bright} stroke={P.ink.line} strokeWidth="1.4" opacity="0.8" />
      {/* iron lattice tower */}
      <path d="M96,28 L80,68 L112,68 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
      <path d="M96,28 L86,50 L106,50 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" opacity="0.7" />
      {/* flag row */}
      {[52, 72, 92, 112, 132].map(x =>
        <path key={x} d={`M${x},76 L${x + 10},82 L${x},88 Z`} fill={palette.mid} />
      ).join('')}
      {/* fountain base */}
      <ellipse cx="96" cy="136" rx="28" ry="6" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={16} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with national archives building: imposing neoclassical stone hall, Doric columns, carved frieze, archive shelves visible through tall windows, stone eagle above portico.
export function NationalArchivesBuildingSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const cols = [40, 64, 88, 112, 136].map(x =>
    <rect x={x} y={72} width="10" height="60" rx="3" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
  ).join('');
  return (
    <BuildingFrame label="National Archives" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={156} />
      <rect x="24" y="72" width="144" height="64" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.3" />
      <TileRoof d="M16,72 L96,34 L176,72 Z" color={palette.mid} />
      {cols}
      {/* carved pediment inscription area */}
      <rect x="48" y="50" width="96" height="16" rx="2" fill={P.stone.mid} opacity="0.4" />
      {/* large entry */}
      <rect x="76" y="110" width="40" height="26" rx="3" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={152} y={18} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with imperial general staff: severe military headquarters, iron gate, color-of-regiment flags, war-room windows with light, parade ground in foreground.
export function ImperialGeneralStaffSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Imperial General Staff" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="24" y="76" width="144" height="60" rx="2" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.3" />
      {/* parapet crenellations */}
      {[28, 44, 60, 120, 136, 152].map(x =>
        <rect key={x} x={x} y={68} width="12" height="10" rx="1" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.7" />
      ).join('')}
      {/* regimental flags */}
      {[36, 68, 124, 156].map(x => (
        <g key={x}>
          <line x1={x} y1="52" x2={x} y2="78" stroke={P.metal.iron} strokeWidth="2" />
          <path d={`M${x},52 L${x + 16},58 L${x},64 Z`} fill={palette.mid} />
        </g>
      )).join('')}
      {/* large portal */}
      <rect x="72" y="108" width="48" height="28" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      {/* iron portcullis bars */}
      {[80, 92, 104, 116].map(x =>
        <line key={x} x1={x} y1={108} x2={x} y2={136} stroke={P.metal.iron} strokeWidth="1.2" opacity="0.5" />
      ).join('')}
      <Banner x={152} y={18} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

/* === ERA 9 REGULAR BUILDING SPRITES === */

// TODO(art): Replace oil refinery: brick tower with pipe network, storage tanks, flare stack burning orange at top, steel catwalk.
export function OilRefinerySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Oil Refinery" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={148} />
      {/* distillation tower */}
      <rect x="72" y="44" width="24" height="92" rx="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.3" />
      {/* pipe band rings */}
      {[60, 76, 92, 108].map(y =>
        <rect key={y} x={70} y={y} width={28} height={4} rx="1" fill={P.metal.iron} opacity="0.6" />
      ).join('')}
      {/* storage tank */}
      <ellipse cx="36" cy="114" rx="22" ry="12" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <rect x="14" y="102" width="44" height="12" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="36" cy="102" rx="22" ry="10" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      {/* flare stack */}
      <rect x="138" y="56" width="8" height="80" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
      <path d="M138,56 Q142,44 146,56" fill={P.metal.gold} opacity="0.8" />
      <Banner x={150} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace assembly line: vast factory floor with conveyor belts, robotic arms overhead, workers in uniform, rows of identical products at end.
export function AssemblyLineSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Assembly Line" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      <rect x="16" y="72" width="160" height="64" rx="4" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.3" />
      {/* sawtooth industrial roof */}
      {[16, 48, 80, 112, 144].map(x =>
        <path key={x} d={`M${x},72 L${x + 32},72 L${x + 32},54 Z`} fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* conveyor belt row */}
      <rect x="24" y="110" width="144" height="10" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      {[36, 60, 84, 108, 132].map(x =>
        <ellipse key={x} cx={x} cy={115} rx="8" ry="5" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.7" />
      ).join('')}
      <Banner x={150} y={24} palette={palette} scale={0.83} />
    </BuildingFrame>
  );
}

// TODO(art): Replace radio station: tall lattice transmission tower, guy wires, brick transmitter building at base, glowing aerial array.
export function RadioStationSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Radio Station" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={136} />
      <rect x="40" y="86" width="112" height="50" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M34,86 L96,52 L158,86 Z" color={palette.mid} />
      {/* transmission tower */}
      <line x1="28" y1="28" x2="28" y2="88" stroke={P.metal.iron} strokeWidth="2.5" />
      {[40, 56, 72].map(y =>
        <line key={y} x1={20} y1={y} x2={36} y2={y} stroke={P.metal.iron} strokeWidth="1.2" />
      ).join('')}
      {/* guy wires */}
      <line x1="28" y1="40" x2="16" y2="88" stroke={P.metal.iron} strokeWidth="0.8" opacity="0.5" />
      <line x1="28" y1="40" x2="40" y2="88" stroke={P.metal.iron} strokeWidth="0.8" opacity="0.5" />
      {/* aerial glow */}
      <circle cx="28" cy="28" r="5" fill={P.metal.gold} opacity="0.7" />
      <Banner x={150} y={28} palette={palette} scale={0.83} />
    </BuildingFrame>
  );
}

// TODO(art): Replace airfield: flat concrete runway, biplane in hangar, windsock pole, control tower with observation deck.
export function AirfieldSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Airfield" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* runway surface */}
      <rect x="16" y="100" width="160" height="36" rx="4" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.2" />
      {/* runway markings */}
      {[30, 60, 90, 120, 150].map(x =>
        <rect key={x} x={x} y={114} width="16" height="6" rx="1" fill={P.stone.light} opacity="0.7" />
      ).join('')}
      {/* hangar */}
      <rect x="20" y="72" width="72" height="28" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M20,72 Q56,56 92,72" fill="none" stroke={P.metal.steel} strokeWidth="2" />
      {/* control tower */}
      <rect x="126" y="60" width="20" height="40" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="122" y="56" width="28" height="10" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.9" />
      {/* windsock */}
      <line x1="156" y1="58" x2="156" y2="80" stroke={P.metal.iron} strokeWidth="1.5" />
      <path d="M156,60 L166,64 L160,68 Z" fill={palette.bright} />
      <Banner x={148} y={24} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace film studio: large sound stage building, film reel marquee sign above entrance, klieg lights flanking doors, director's chair silhouette.
export function FilmStudioSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Film Studio" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="28" y="76" width="136" height="60" rx="4" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.3" />
      {/* marquee sign */}
      <rect x="48" y="64" width="96" height="18" rx="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      {[56, 70, 84, 98, 112, 126].map(x =>
        <circle key={x} cx={x} cy={73} r="3.5" fill={P.metal.gold} opacity="0.85" />
      ).join('')}
      {/* klieg lights */}
      <path d="M36,76 L28,60 L44,60 Z" fill={P.metal.gold} opacity="0.7" />
      <path d="M156,76 L148,60 L164,60 Z" fill={P.metal.gold} opacity="0.7" />
      {/* entrance */}
      <rect x="76" y="104" width="40" height="32" rx="3" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <Banner x={150} y={24} palette={palette} scale={0.83} />
    </BuildingFrame>
  );
}

// TODO(art): Replace national insurance: modern civic office, queuing citizens outside, frosted glass windows, official seal above door.
export function NationalInsuranceSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="National Insurance" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={144} />
      <rect x="32" y="80" width="128" height="56" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M26,80 L96,46 L166,80 Z" color={palette.mid} />
      {/* windows */}
      {[44, 76, 108, 140].map(x =>
        <rect key={x} x={x} y={94} width="20" height="26" rx="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* official seal */}
      <circle cx="96" cy="62" r="10" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="96" cy="62" r="6" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.7" />
      {/* door */}
      <rect x="78" y="112" width="36" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={152} y={22} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace hydroelectric dam: massive concrete arch spanning a river gorge, water sluice gates at base, power lines leaving the top.
export function HydroelectricDamSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Hydroelectric Dam" category="production" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* river bed */}
      <rect x="16" y="118" width="160" height="20" rx="2" fill="#3a6080" opacity="0.6" />
      {/* dam wall */}
      <path d="M16,44 L40,118 L152,118 L176,44 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.5" />
      {/* concrete texture lines */}
      {[58, 72, 86, 100].map(y =>
        <line key={y} x1={16 + (y - 44) * 0.4} y1={y} x2={176 - (y - 44) * 0.4} y2={y}
          stroke={P.stone.dark} strokeWidth="0.6" opacity="0.4" />
      ).join('')}
      {/* sluice gates */}
      {[52, 76, 100, 124, 148].map(x =>
        <rect key={x} x={x} y={100} width="12" height="18" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* power lines */}
      <line x1="64" y1="44" x2="52" y2="28" stroke={P.metal.steel} strokeWidth="1.2" />
      <line x1="96" y1="44" x2="96" y2="28" stroke={P.metal.steel} strokeWidth="1.2" />
      <line x1="128" y1="44" x2="140" y2="28" stroke={P.metal.steel} strokeWidth="1.2" />
      <Banner x={148} y={20} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

// TODO(art): Replace research institute: modernist campus building, large arched windows, chalkboard visible inside, telescope dome on roof.
export function ResearchInstituteSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Research Institute" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={148} />
      <rect x="30" y="76" width="132" height="60" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <TileRoof d="M22,76 L96,40 L170,76 Z" color={palette.mid} />
      {/* dome on roof */}
      <ellipse cx="96" cy="68" rx="22" ry="12" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="96" cy="64" rx="16" ry="8" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.9" opacity="0.8" />
      {/* tall arched windows */}
      {[42, 74, 106, 138].map(x =>
        <rect key={x} x={x} y={90} width="20" height="30" rx="10" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.9" />
      ).join('')}
      <Banner x={148} y={22} palette={palette} scale={0.83} />
    </BuildingFrame>
  );
}

// TODO(art): Replace tank depot: corrugated metal repair barn, ramp for tank access, spare tracks hanging on wall, guard post at entrance.
export function TankDepotSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Tank Depot" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="26" y="80" width="140" height="56" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.3" />
      {/* corrugated roof ridges */}
      {[26, 40, 54, 68, 82, 96, 110, 124, 138, 152].map(x =>
        <line key={x} x1={x} y1={80} x2={x} y2={136} stroke={P.stone.dark} strokeWidth="1.2" opacity="0.3" />
      ).join('')}
      {/* large vehicle door */}
      <rect x="46" y="90" width="80" height="46" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
      {/* door tracks */}
      <line x1="46" y1="92" x2="126" y2="92" stroke={P.metal.steel} strokeWidth="1.5" />
      {/* access ramp */}
      <path d="M46,136 L26,148 L166,148 L146,136 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <Banner x={148} y={26} palette={palette} scale={0.82} />
    </BuildingFrame>
  );
}

/* === ERA 9 NATIONAL PROJECT SPRITES === */

// TODO(art): Replace mobilization act: wartime poster wall, soldiers marching in formation, factory smokestacks behind, dramatic red and black color scheme.
export function MobilizationActSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Mobilization Act" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      {/* command headquarters building */}
      <rect x="28" y="72" width="136" height="64" rx="3" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1.4" />
      {/* crenellated parapet */}
      {[32, 48, 64, 112, 128, 144].map(x =>
        <rect key={x} x={x} y={64} width="12" height="10" rx="1" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.7" />
      ).join('')}
      {/* regimental flags */}
      <line x1="64" y1="36" x2="64" y2="72" stroke={P.metal.iron} strokeWidth="1.5" />
      <path d="M64,36 L84,44 L64,52 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="128" y1="36" x2="128" y2="72" stroke={P.metal.iron} strokeWidth="1.5" />
      <path d="M128,36 L148,44 L128,52 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.7" />
      {/* gate */}
      <rect x="78" y="108" width="36" height="28" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <Banner x={148} y={18} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace state broadcasting: modern broadcasting palace with tall antenna mast, lit transmission window, art-deco facade, state seal over entry arch.
export function StateBroadcastingSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="State Broadcasting" category="economy" svgOnly={svgOnly}>
      <BuildingPlinth w={152} />
      <rect x="28" y="76" width="136" height="60" rx="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.3" />
      <TileRoof d="M22,76 L96,38 L170,76 Z" color={palette.mid} />
      {/* antenna mast */}
      <line x1="96" y1="16" x2="96" y2="38" stroke={P.metal.iron} strokeWidth="2.5" />
      {[20, 26, 32].map(y =>
        <line key={y} x1={88} y1={y} x2={104} y2={y} stroke={P.metal.iron} strokeWidth="1.2" />
      ).join('')}
      {/* broadcast glow */}
      <circle cx="96" cy="16" r="5" fill={P.metal.gold} opacity="0.8" />
      {/* art-deco facade pillars */}
      {[38, 62, 130, 154].map(x =>
        <rect key={x} x={x} y={76} width="8" height="60" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      ).join('')}
      {/* large window */}
      <rect x="72" y="88" width="48" height="32" rx="3" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.9" opacity="0.85" />
      <Banner x={148} y={18} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}

// TODO(art): Replace with: Ring-mounted Krupp flak cannon on sandbag emplacement, four crew members at elevation and traverse wheels, brass shell casings at base, searchlight beam sweeping above.
export function AntiAirBatterySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Anti-Air Battery" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={120} />
      {/* sandbag emplacement ring */}
      <ellipse cx="96" cy="118" rx="52" ry="14" fill={P.ground.sand} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="96" cy="112" rx="48" ry="10" fill={P.ground.sand} stroke={P.ink.line} strokeWidth="0.8" />
      {/* cannon barrel pointing up-right */}
      <rect x="92" y="64" width="10" height="52" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2"
        transform="rotate(-30 96 100)" />
      {/* cannon base pivot */}
      <circle cx="96" cy="108" r="12" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      {/* crew silhouettes */}
      <ellipse cx="70" cy="106" rx="6" ry="10" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="122" cy="106" rx="6" ry="10" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* searchlight beam */}
      <path d="M140,80 L168,40 L178,56 L148,88 Z" fill={P.metal.gold} opacity="0.3" />
      <circle cx="140" cy="84" r="8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={60} y={50} palette={palette} scale={0.7} />
    </BuildingFrame>
  );
}

// TODO(art): Replace air force command: neoclassical military HQ, stone eagle with spread wings over portico, aviation wing crest carved above entrance, biplanes in formation silhouetted through tall arched window, parade ground in foreground.
export function AirForceCommandSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Air Force Command" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={140} />
      {/* main building body */}
      <rect x="28" y="50" width="136" height="80" rx="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.5" />
      {/* portico columns */}
      <rect x="50" y="50" width="8" height="80" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="80" y="50" width="8" height="80" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="104" y="50" width="8" height="80" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="134" y="50" width="8" height="80" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* pediment */}
      <path d="M28,50 L96,18 L164,50 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      {/* eagle crest in pediment */}
      <ellipse cx="96" cy="38" rx="12" ry="8" fill={palette.dark} />
      <path d="M84,36 L70,28 L82,34 Z" fill={palette.dark} />
      <path d="M108,36 L122,28 L110,34 Z" fill={palette.dark} />
      {/* arched window */}
      <path d="M72,60 L72,108 L120,108 L120,60 Q96,42 72,60 Z" fill={P.ground.water} opacity="0.4" stroke={P.ink.line} strokeWidth="0.8" />
      {/* biplane silhouettes in window */}
      <rect x="78" y="80" width="36" height="3" rx="1" fill={P.ink.soft} opacity="0.7" />
      <rect x="84" y="87" width="24" height="2" rx="1" fill={P.ink.soft} opacity="0.5" />
      <Banner x={96} y={20} palette={palette} scale={0.75} />
    </BuildingFrame>
  );
}

// TODO(art): Replace national census: bureaucratic civic hall, filing cabinet stacks visible through windows, long queuing desk inside, official census poster outside.
export function NationalCensusSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  const cols = [40, 66, 92, 118, 144].map(x =>
    <rect x={x} y={74} width="10" height="62" rx="3" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
  ).join('');
  return (
    <BuildingFrame label="National Census" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={156} />
      <rect x="26" y="74" width="140" height="62" rx="2" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.3" />
      <TileRoof d="M18,74 L96,36 L174,74 Z" color={palette.mid} />
      {cols}
      {/* data windows */}
      {[50, 86, 122].map(x =>
        <rect key={x} x={x} y={92} width="24" height="28" rx="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.8" />
      ).join('')}
      {/* entry door */}
      <rect x="78" y="112" width="36" height="24" rx="2" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={148} y={18} palette={palette} scale={0.88} />
    </BuildingFrame>
  );
}
