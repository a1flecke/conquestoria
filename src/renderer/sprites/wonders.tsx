// S6 Legendary wonder sprites — player-built, city scale (192×192).
// Follows the same conventions as buildings.tsx: BuildingFrame wrapper,
// palette.* for faction identity, existing animation CSS class hooks only.
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  CATEGORY_TINTS,
  Banner,
  SpriteFrame,
  BuildingPlinth,
} from './sprite-system';

export type WonderSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

// Local copy of BuildingFrame (mirrors buildings.tsx, avoids circular import).
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

/* === PYRAMIDS === */
export function PyramidsSprite({ palette, svgOnly = false }: WonderSpriteProps): string {
  return (
    <BuildingFrame label="Pyramids" sub="Wonder · Legendary" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={176} color="#b89a5c" />
      {/* desert sand apron */}
      <rect x="18" y="120" width="156" height="24" fill={P.ground.sand} />
      <path d="M18,124 Q60,118 96,123 Q140,128 174,122" fill="none" stroke="#c8a85c" strokeWidth="1" opacity="0.6" />
      {/* back pyramid */}
      <path d="M23,130 L93,130 L88.92,120 L27.08,120 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M23,130 L58,130 L84.83,120 L27.08,120 Z" fill="#a9884c" opacity="0.35" />
      <path d="M28.83,120 L87.17,120 L83.08,110 L32.92,110 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M28.83,120 L58,120 L79,110 L32.92,110 Z" fill="#a9884c" opacity="0.35" />
      <path d="M34.67,110 L81.33,110 L77.25,100 L38.75,100 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M34.67,110 L58,110 L73.17,100 L38.75,100 Z" fill="#a9884c" opacity="0.35" />
      <path d="M40.5,100 L75.5,100 L71.42,90 L44.58,90 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M40.5,100 L58,100 L67.33,90 L44.58,90 Z" fill="#a9884c" opacity="0.35" />
      <path d="M46.33,90 L69.67,90 L65.58,80 L50.42,80 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M46.33,90 L58,90 L61.5,80 L50.42,80 Z" fill="#a9884c" opacity="0.35" />
      <path d="M52.17,80 L63.83,80 L59.75,70 L56.25,70 Z" fill="#d8be86" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M52.17,80 L58,80 L55.67,70 L56.25,70 Z" fill="#a9884c" opacity="0.35" />
      {/* right pyramid */}
      <path d="M107,132 L173,132 L169.15,122 L110.85,122 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M107,132 L140,132 L165.3,122 L110.85,122 Z" fill="#a07e44" opacity="0.35" />
      <path d="M112.5,122 L167.5,122 L163.65,112 L116.35,112 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M112.5,122 L140,122 L159.8,112 L116.35,112 Z" fill="#a07e44" opacity="0.35" />
      <path d="M118,112 L162,112 L158.15,102 L121.85,102 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M118,112 L140,112 L154.3,102 L121.85,102 Z" fill="#a07e44" opacity="0.35" />
      <path d="M123.5,102 L156.5,102 L152.65,92 L127.35,92 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M123.5,102 L140,102 L148.8,92 L127.35,92 Z" fill="#a07e44" opacity="0.35" />
      <path d="M129,92 L151,92 L147.15,82 L132.85,82 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M129,92 L140,92 L143.3,82 L132.85,82 Z" fill="#a07e44" opacity="0.35" />
      <path d="M134.5,82 L145.5,82 L141.65,72 L138.35,72 Z" fill="#d2b67c" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M134.5,82 L140,82 L137.8,72 L138.35,72 Z" fill="#a07e44" opacity="0.35" />
      {/* front hero pyramid */}
      <path d="M48,140 L152,140 L147.45,130 L52.55,130 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M48,140 L100,140 L142.9,130 L52.55,130 Z" fill="#b3924e" opacity="0.35" />
      <path d="M54.5,130 L145.5,130 L140.95,120 L59.05,120 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M54.5,130 L100,130 L136.4,120 L59.05,120 Z" fill="#b3924e" opacity="0.35" />
      <path d="M61,120 L139,120 L134.45,110 L65.55,110 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M61,120 L100,120 L129.9,110 L65.55,110 Z" fill="#b3924e" opacity="0.35" />
      <path d="M67.5,110 L132.5,110 L127.95,100 L72.05,100 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M67.5,110 L100,110 L123.4,100 L72.05,100 Z" fill="#b3924e" opacity="0.35" />
      <path d="M74,100 L126,100 L121.45,90 L78.55,90 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M74,100 L100,100 L116.9,90 L78.55,90 Z" fill="#b3924e" opacity="0.35" />
      <path d="M80.5,90 L119.5,90 L114.95,80 L85.05,80 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M80.5,90 L100,90 L110.4,80 L85.05,80 Z" fill="#b3924e" opacity="0.35" />
      <path d="M87,80 L113,80 L108.45,70 L91.55,70 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M87,80 L100,80 L103.9,70 L91.55,70 Z" fill="#b3924e" opacity="0.35" />
      <path d="M93.5,70 L106.5,70 L101.95,60 L98.05,60 Z" fill="#e2cb95" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M93.5,70 L100,70 L97.4,60 L98.05,60 Z" fill="#b3924e" opacity="0.35" />
      {/* gold capstone — pulses via .cq-glow */}
      <path className="cq-glow" d="M91,62 L109,62 L100,46 Z" fill="#ffe6a0" opacity="0.55" />
      <path d="M94,60 L106,60 L100,50 Z" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
      {/* construction ramp */}
      <path d="M100,140 L150,140 L120,86 L108,86 Z" fill="#c4a45c" stroke={P.ink.line} strokeWidth="0.6" opacity="0.85" />
      <line x1="112" y1="120" x2="140" y2="120" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.5" />
      <line x1="114" y1="108" x2="134" y2="108" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.5" />
      {/* construction dust drifting off the ramp — .cq-smoke */}
      <g transform="translate(116 94)"><ellipse className="cq-smoke" rx="4" ry="2.6" fill="#decaa0" opacity="0.5" /></g>
      <g transform="translate(110 100)"><ellipse className="cq-smoke cq-smoke--b" rx="3.4" ry="2.2" fill="#cdb88c" opacity="0.45" /></g>
      <g transform="translate(122 98)"><ellipse className="cq-smoke cq-smoke--c" rx="3" ry="2" fill="#decaa0" opacity="0.4" /></g>
      {/* workers hauling a block up the ramp — .cq-crowd-fig */}
      <g className="cq-crowd-fig" transform="translate(124 128)">
        <circle cx="0" cy="-6" r="2.2" fill={P.skin.deep} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-3,3 Q-3,-4 0,-4 Q3,-4 3,3 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(134 118)">
        <circle cx="0" cy="-6" r="2.2" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-3,3 Q-3,-4 0,-4 Q3,-4 3,3 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <rect x="118" y="130" width="9" height="7" fill="#cdbb95" stroke={P.ink.line} strokeWidth="0.5" />
      {/* faction obelisk */}
      <g transform="translate(36 140)">
        <path d="M-3,0 L3,0 L2,-34 L0,-40 L-2,-34 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <path d="M0,-40 L2,-34 L0,-34 Z" fill={palette.bright} />
        <rect x="-2" y="-26" width="4" height="2" fill={palette.trim} />
      </g>
      <Banner x={100} y={48} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}

/* === COLOSSEUM === */
export function ColosseumSprite({ palette, svgOnly = false }: WonderSpriteProps): string {
  return (
    <BuildingFrame label="Colosseum" sub="Wonder · Legendary" category="culture" svgOnly={svgOnly}>
      <BuildingPlinth w={172} color={P.stone.dark} />
      <ellipse cx="96" cy="104" rx="78" ry="50" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.2" />
      <ellipse cx="96" cy="104" rx="78" ry="50" fill="url(#stoneTexture)" opacity="0.5" />
      <ellipse cx="96" cy="98" rx="58" ry="34" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="96" cy="92" rx="38" ry="20" fill="#caa86a" stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="96" cy="90" rx="20" ry="9" fill={P.ground.sand} stroke={P.ink.line} strokeWidth="0.5" />
      {/* three arcade tiers */}
      <path d="M30.9,111.5 L30.9,95.5 Q30.9,86.92 36.9,86.92 Q42.9,86.92 42.9,95.5 L42.9,111.5 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M42.08,103.38 L42.08,87.38 Q42.08,78.81 48.08,78.81 Q54.08,78.81 54.08,87.38 L54.08,103.38 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M56.28,97.2 L56.28,81.2 Q56.28,72.62 62.28,72.62 Q68.28,72.62 68.28,81.2 L68.28,97.2 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M72.59,93.32 L72.59,77.32 Q72.59,68.75 78.59,68.75 Q84.59,68.75 84.59,77.32 L84.59,93.32 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M90,92 L90,76 Q90,67.43 96,67.43 Q102,67.43 102,76 L102,92 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M107.41,93.32 L107.41,77.32 Q107.41,68.75 113.41,68.75 Q119.41,68.75 119.41,77.32 L119.41,93.32 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M123.72,97.2 L123.72,81.2 Q123.72,72.62 129.72,72.62 Q135.72,72.62 135.72,81.2 L135.72,97.2 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M137.92,103.38 L137.92,87.38 Q137.92,78.81 143.92,78.81 Q149.92,78.81 149.92,87.38 L149.92,103.38 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M149.1,111.5 L149.1,95.5 Q149.1,86.92 155.1,86.92 Q161.1,86.92 161.1,95.5 L161.1,111.5 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M40.34,90.85 L40.34,78.85 Q40.34,71.71 45.34,71.71 Q50.34,71.71 50.34,78.85 L50.34,90.85 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M51.52,83.9 L51.52,71.9 Q51.52,64.76 56.52,64.76 Q61.52,64.76 61.52,71.9 L61.52,83.9 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M65.94,78.92 L65.94,66.92 Q65.94,59.78 70.94,59.78 Q75.94,59.78 75.94,66.92 L75.94,78.92 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M82.41,76.33 L82.41,64.33 Q82.41,57.19 87.41,57.19 Q92.41,57.19 92.41,64.33 L92.41,76.33 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M99.59,76.33 L99.59,64.33 Q99.59,57.19 104.59,57.19 Q109.59,57.19 109.59,64.33 L109.59,76.33 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M116.06,78.92 L116.06,66.92 Q116.06,59.78 121.06,59.78 Q126.06,59.78 126.06,66.92 L126.06,78.92 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M130.48,83.9 L130.48,71.9 Q130.48,64.76 135.48,64.76 Q140.48,64.76 140.48,71.9 L140.48,83.9 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M141.66,90.85 L141.66,78.85 Q141.66,71.71 146.66,71.71 Q151.66,71.71 151.66,78.85 L151.66,90.85 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M51.47,75.21 L51.47,66.21 Q51.47,60.5 55.47,60.5 Q59.47,60.5 59.47,66.21 L59.47,75.21 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M62.18,69.76 L62.18,60.76 Q62.18,55.04 66.18,55.04 Q70.18,55.04 70.18,60.76 L70.18,69.76 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M76.21,66.22 L76.21,57.22 Q76.21,51.51 80.21,51.51 Q84.21,51.51 84.21,57.22 L84.21,66.22 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M92,65 L92,56 Q92,50.29 96,50.29 Q100,50.29 100,56 L100,65 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M107.79,66.22 L107.79,57.22 Q107.79,51.51 111.79,51.51 Q115.79,51.51 115.79,57.22 L115.79,66.22 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M121.82,69.76 L121.82,60.76 Q121.82,55.04 125.82,55.04 Q129.82,55.04 129.82,60.76 L129.82,69.76 Z" fill={P.ink.line} opacity="0.78" />
      <path d="M132.53,75.21 L132.53,66.21 Q132.53,60.5 136.53,60.5 Q140.53,60.5 140.53,66.21 L140.53,75.21 Z" fill={P.ink.line} opacity="0.78" />
      {/* crown cornice */}
      <path d="M22,86 Q96,52 170,86" fill="none" stroke={P.stone.light} strokeWidth="3" />
      <path d="M22,86 Q96,52 170,86" fill="none" stroke={P.ink.line} strokeWidth="0.8" opacity="0.5" />
      {/* spectators on the rim — .cq-crowd-fig */}
      <g className="cq-crowd-fig" transform="translate(40 72.96)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(60 69.76)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(80 66.56)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(100 64.64)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(120 67.84)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <g className="cq-crowd-fig" transform="translate(140 71.04)">
        <circle cx="0" cy="0" r="1.8" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.3" />
        <path d="M-2.4,5 Q-2.4,-2 0,-2 Q2.4,-2 2.4,5 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={58} y={62} palette={palette} scale={0.72} />
      <Banner x={134} y={62} palette={palette} scale={0.72} shape="square" />
      {/* brazier flames flanking the arena — .cq-fire */}
      <g transform="translate(30 112)">
        <rect x="-2.5" y="0" width="5" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="0" cy="0" rx="5" ry="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <ellipse className="cq-fire" cx="0" cy="-4" rx="3.4" ry="5.4" fill="#ff9a3c" />
        <ellipse className="cq-fire" cx="0" cy="-4" rx="1.6" ry="3.2" fill="#ffe08a" />
      </g>
      <g transform="translate(162 112)">
        <rect x="-2.5" y="0" width="5" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="0" cy="0" rx="5" ry="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <ellipse className="cq-fire" cx="0" cy="-4" rx="3.4" ry="5.4" fill="#ff9a3c" />
        <ellipse className="cq-fire" cx="0" cy="-4" rx="1.6" ry="3.2" fill="#ffe08a" />
      </g>
    </BuildingFrame>
  );
}

/* === GREAT LIBRARY === */
export function GreatLibrarySprite({ palette, svgOnly = false }: WonderSpriteProps): string {
  return (
    <BuildingFrame label="Great Library" sub="Wonder · Legendary" category="science" svgOnly={svgOnly}>
      <BuildingPlinth w={166} />
      <rect x="30" y="138" width="132" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="40" y="132" width="112" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="48" y="60" width="96" height="74" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="48" y="60" width="96" height="74" fill="url(#stoneTexture)" opacity="0.5" />
      {/* doorway glow + scroll racks */}
      <rect className="cq-glow" x="80" y="84" width="32" height="50" rx="2" fill="#ffce6a" opacity="0.4" />
      <rect x="80" y="84" width="32" height="50" fill="#2a2418" stroke={P.ink.line} strokeWidth="0.9" />
      <circle cx="88" cy="92" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="88" cy="92" r="0.8" fill={P.ink.soft} />
      <circle cx="88" cy="102" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="88" cy="102" r="0.8" fill={P.ink.soft} />
      <circle cx="88" cy="112" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="88" cy="112" r="0.8" fill={P.ink.soft} />
      <circle cx="88" cy="122" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="88" cy="122" r="0.8" fill={P.ink.soft} />
      <circle cx="96" cy="92" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="96" cy="92" r="0.8" fill={P.ink.soft} />
      <circle cx="96" cy="102" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="96" cy="102" r="0.8" fill={P.ink.soft} />
      <circle cx="96" cy="112" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="96" cy="112" r="0.8" fill={P.ink.soft} />
      <circle cx="96" cy="122" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="96" cy="122" r="0.8" fill={P.ink.soft} />
      <circle cx="104" cy="92" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="104" cy="92" r="0.8" fill={P.ink.soft} />
      <circle cx="104" cy="102" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="104" cy="102" r="0.8" fill={P.ink.soft} />
      <circle cx="104" cy="112" r="2.4" fill="#c4a86a" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="104" cy="112" r="0.8" fill={P.ink.soft} />
      <circle cx="104" cy="122" r="2.4" fill="#d8c8a0" stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="104" cy="122" r="0.8" fill={P.ink.soft} />
      <path d="M80,84 L72,80 L72,132 L80,134 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M112,84 L120,80 L120,132 L112,134 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
      {/* fluted columns */}
      <ellipse cx="40" cy="62" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="34" y="62" width="12" height="70" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="37" y1="66" x2="37" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="40" y1="66" x2="40" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="43" y1="66" x2="43" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <rect x="32" y="130" width="16" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="60" cy="62" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="54" y="62" width="12" height="70" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="57" y1="66" x2="57" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="60" y1="66" x2="60" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="63" y1="66" x2="63" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <rect x="52" y="130" width="16" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="132" cy="62" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="126" y="62" width="12" height="70" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="129" y1="66" x2="129" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="132" y1="66" x2="132" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="135" y1="66" x2="135" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <rect x="124" y="130" width="16" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="152" cy="62" rx="7" ry="3" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="146" y="62" width="12" height="70" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="149" y1="66" x2="149" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="152" y1="66" x2="152" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <line x1="155" y1="66" x2="155" y2="130" stroke={P.stone.mid} strokeWidth="0.5" />
      <rect x="144" y="130" width="16" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      {/* entablature + pediment sunburst */}
      <rect x="30" y="52" width="132" height="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M26,52 L96,22 L166,52 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M26,52 L96,22 L166,52 Z" fill="url(#stoneTexture)" opacity="0.5" />
      <circle cx="96" cy="44" r="4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="101" y1="44" x2="91" y2="44" stroke={P.metal.gold} strokeWidth="0.6" />
      <line x1="99.54" y1="47.54" x2="92.46" y2="40.46" stroke={P.metal.gold} strokeWidth="0.6" />
      <line x1="96" y1="49" x2="96" y2="39" stroke={P.metal.gold} strokeWidth="0.6" />
      <line x1="92.46" y1="47.54" x2="99.54" y2="40.46" stroke={P.metal.gold} strokeWidth="0.6" />
      {/* reading-desk quill sparks (busy) */}
      <g transform="translate(58 120)">
        <rect x="-5" y="0" width="10" height="6" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.5" />
        <circle className="cq-spark" cx="4" cy="-2" r="1.2" fill="#ffd966" />
      </g>
      <g transform="translate(134 120)">
        <rect x="-5" y="0" width="10" height="6" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.5" />
        <circle className="cq-spark cq-spark--b" cx="-4" cy="-2" r="1.1" fill="#ffd966" />
      </g>
      <Banner x={96} y={22} palette={palette} scale={0.85} />
    </BuildingFrame>
  );
}

/* === LIGHTHOUSE === */
export function LighthouseSprite({ palette, svgOnly = false }: WonderSpriteProps): string {
  return (
    <BuildingFrame label="Lighthouse" sub="Wonder · Legendary" category="economy" svgOnly={svgOnly}>
      <ellipse cx="96" cy="168" rx="86" ry="16" fill="#000" opacity="0.22" />
      <path d="M22,150 Q40,138 64,144 Q86,138 110,146 Q140,138 170,152 L170,164 L22,164 Z" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,150 Q52,144 70,148 Q92,143 116,150" fill="none" stroke={P.stone.mid} strokeWidth="1.2" opacity="0.7" />
      <path d="M22,160 Q48,156 74,160 Q104,164 134,159 Q154,156 170,160 L170,164 L22,164 Z" fill={P.ground.water} opacity="0.85" />
      {/* tapered tower */}
      <path d="M80,148 L112,148 L108,96 L84,96 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M84,96 L108,96 L105,58 L87,58 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M80,148 L92,148 L90,96 L84,96 Z" fill={P.stone.mid} opacity="0.4" />
      <rect x="82.5" y="120" width="27" height="6" fill={palette.mid} opacity="0.9" />
      <rect x="85" y="78" width="22" height="5" fill={palette.mid} opacity="0.9" />
      <rect x="93" y="108" width="6" height="9" rx="2" fill={P.ink.line} />
      <rect x="93" y="70" width="6" height="8" rx="2" fill={P.ink.line} />
      {/* lamp room */}
      <rect x="85" y="44" width="22" height="16" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="85" y="44" width="22" height="16" fill="#2a2418" opacity="0.5" />
      <path d="M83,44 L109,44 L96,30 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.7" />
      <circle cx="96" cy="28" r="2" fill={P.metal.gold} />
      {/* light cone + throbbing beacon — .cq-beacon */}
      <path d="M96,52 L150,34 L150,70 Z" fill="#ffe6a0" opacity="0.18" />
      <path d="M96,52 L44,36 L44,68 Z" fill="#ffe6a0" opacity="0.12" />
      <circle className="cq-beacon" cx="96" cy="52" r="6" fill="#fff2c2" />
      <circle cx="96" cy="52" r="2.6" fill="#fff" />
      <Banner x={96} y={26} palette={palette} scale={0.78} />
    </BuildingFrame>
  );
}

/* === WRIGHT FLYER === */
// TODO(art): Replace: open-air wooden hangar at Kitty Hawk, canvas-and-spruce biplane on launching rail, dunes and ocean in background, two figures in period dress watching the first flight.
export function WrightFlyerSprite({ palette, svgOnly = false }: WonderSpriteProps): string {
  return (
    <BuildingFrame label="Wright Flyer" sub="Wonder · Legendary" category="military" svgOnly={svgOnly}>
      <BuildingPlinth w={160} />
      {/* sandy ground */}
      <rect x="16" y="130" width="160" height="20" fill={P.ground.sand} />
      {/* hangar structure */}
      <rect x="30" y="80" width="100" height="52" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
      {/* hangar roof arch */}
      <path d="M30,80 Q80,52 130,80" fill={P.thatch.shadow} stroke={P.ink.line} strokeWidth="1.2" />
      {/* hangar door opening */}
      <rect x="64" y="98" width="40" height="34" fill={P.ink.soft} opacity="0.5" />
      {/* biplane on launching rail */}
      {/* lower wing */}
      <rect x="38" y="102" width="90" height="4" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* upper wing */}
      <rect x="44" y="90" width="80" height="4" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* fuselage */}
      <rect x="74" y="91" width="30" height="16" rx="3" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* propeller */}
      <rect x="72" y="92" width="2" height="14" rx="1" fill={P.wood.dark} />
      {/* vertical struts between wings */}
      <rect x="54" y="91" width="2" height="12" fill={P.wood.mid} />
      <rect x="108" y="91" width="2" height="12" fill={P.wood.mid} />
      {/* rail */}
      <rect x="36" y="118" width="96" height="3" rx="1" fill={P.metal.iron} />
      {/* observer figures */}
      <ellipse cx="155" cy="124" rx="4" ry="8" fill={P.ink.line} />
      <ellipse cx="20" cy="125" rx="4" ry="7" fill={P.ink.line} />
      {/* sky birds */}
      <path d="M140,70 Q144,66 148,70" fill="none" stroke={P.ink.soft} strokeWidth="1" />
      <path d="M152,60 Q156,56 160,60" fill="none" stroke={P.ink.soft} strokeWidth="1" />
      <Banner x={96} y={22} palette={palette} scale={0.72} />
    </BuildingFrame>
  );
}
