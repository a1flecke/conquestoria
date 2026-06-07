/* Building sprites — one component per building.
 * 192x192 viewBox. Each building plants a footprint (ground rect or plinth)
 * and stacks its silhouette above. Roof color encodes category for instant
 * read at a distance. Faction shows up on banners + pennants only — buildings
 * stay neutral so they read as part of the world.
 */

const { SPRITE, SpriteFrame, Banner, BuildingPlinth, factionAccent } = window;
const P = SPRITE.PALETTE;

/* Common roof builders */
function ThatchRoof({ d, color = P.thatch.straw, shadow = P.thatch.shadow }) {
  return (
    <g>
      <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={d} fill="url(#thatchPattern)" opacity="0.5" />
      <path d={d} fill={shadow} opacity="0.18" />
    </g>
  );
}

function TileRoof({ d, color }) {
  return (
    <g>
      <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={d} fill="url(#tilePattern)" opacity="0.45" />
    </g>
  );
}

function BuildingFrame({ children, label, sub, category, state = 'idle' }) {
  return (
    <SpriteFrame size={192} state={state} kind="building" label={label} sub={sub} hexTint="#000">
      <defs>
        <pattern id="thatchPattern" width="6" height="4" patternUnits="userSpaceOnUse">
          <path d="M0,2 Q3,-1 6,2" stroke={P.thatch.shadow} strokeWidth="0.5" fill="none" />
        </pattern>
        <pattern id="tilePattern" width="6" height="3" patternUnits="userSpaceOnUse">
          <path d="M0,0 H6 M0,3 H6" stroke={P.ink.line} strokeWidth="0.3" />
          <path d="M0,1.5 L1.5,0 M3,3 L4.5,1.5" stroke={P.ink.line} strokeWidth="0.3" />
        </pattern>
        <pattern id="stoneTexture" width="8" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,3 H8 M2,0 V3 M5,3 V6 M0,6 H8" stroke={P.stone.dark} strokeWidth="0.4" opacity="0.4" />
        </pattern>
      </defs>
      {/* category accent ring on hex */}
      {category && (
        <circle cx="96" cy="166" r="80" fill="none" stroke={SPRITE.CATEGORY_TINTS[category]} strokeWidth="2" opacity="0.18" />
      )}
      {children}
    </SpriteFrame>
  );
}

/* === FOOD === */

function GranarySprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Granary" sub="Food" category="food">
      <BuildingPlinth />
      {/* main silo (cylinder) */}
      <ellipse cx="80" cy="62" rx="32" ry="10" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="1" />
      <rect x="48" y="62" width="64" height="74" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="1" />
      <rect x="48" y="62" width="64" height="74" fill="url(#stoneTexture)" opacity="0.6" />
      {/* hoops */}
      <line x1="48" y1="80" x2="112" y2="80" stroke={P.wood.dark} strokeWidth="1.4" />
      <line x1="48" y1="100" x2="112" y2="100" stroke={P.wood.dark} strokeWidth="1.4" />
      <line x1="48" y1="120" x2="112" y2="120" stroke={P.wood.dark} strokeWidth="1.4" />
      {/* conical thatch top */}
      <ThatchRoof d="M48,62 Q80,18 112,62 Z" />
      {/* loading door */}
      <rect x="68" y="108" width="20" height="28" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="78" y1="108" x2="78" y2="136" stroke={P.ink.line} strokeWidth="0.5" />
      {/* attached stone shed */}
      <rect x="108" y="100" width="40" height="36" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="108" y="100" width="40" height="36" fill="url(#stoneTexture)" opacity="0.6" />
      <ThatchRoof d="M104,100 L152,100 L144,84 L112,84 Z" />
      {/* sacks */}
      <ellipse cx="56" cy="142" rx="10" ry="6" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="74" cy="142" rx="9" ry="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={80} y={20} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function HerbalistSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Herbalist" sub="Food" category="food">
      <BuildingPlinth w={140} />
      {/* hut */}
      <rect x="42" y="80" width="108" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M42,84 H150 M42,108 H150 M42,128 H150" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
      <ThatchRoof d="M34,84 L158,84 L130,42 L62,42 Z" />
      {/* drying herbs hanging from eaves */}
      <line x1="50" y1="86" x2="50" y2="96" stroke="#5a8a3a" strokeWidth="2" />
      <circle cx="50" cy="98" r="3" fill="#7eaf5e" />
      <line x1="62" y1="86" x2="62" y2="98" stroke="#7a4a8a" strokeWidth="2" />
      <circle cx="62" cy="100" r="3" fill="#9a6abf" />
      <line x1="138" y1="86" x2="138" y2="96" stroke="#5a8a3a" strokeWidth="2" />
      <circle cx="138" cy="98" r="3" fill="#7eaf5e" />
      {/* door */}
      <path d="M88,140 L88,108 Q96,102 104,108 L104,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="100" cy="124" r="1" fill={P.metal.gold} />
      {/* mortar + pestle on porch */}
      <ellipse cx="60" cy="140" rx="8" ry="3" fill={P.stone.dark} />
      <rect x="54" y="130" width="12" height="10" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      {/* herb garden tile */}
      <rect x="120" y="138" width="26" height="6" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="124" cy="136" r="2" fill="#7eaf5e" />
      <circle cx="132" cy="136" r="2" fill="#9ac76a" />
      <circle cx="140" cy="136" r="2" fill="#7eaf5e" />
      <Banner x={96} y={42} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

function AqueductSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Aqueduct" sub="Food" category="food">
      <BuildingPlinth w={160} />
      {/* arched stone aqueduct */}
      <rect x="20" y="60" width="152" height="76" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="20" y="60" width="152" height="76" fill="url(#stoneTexture)" opacity="0.6" />
      {/* arches */}
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${28 + i*36} 80)`}>
          <path d="M0,56 L0,18 Q14,0 28,18 L28,56 Z" fill={P.ink.soft} opacity="0.45" />
          <path d="M0,18 Q14,0 28,18" fill="none" stroke={P.ink.line} strokeWidth="0.8" />
        </g>
      ))}
      {/* top channel water */}
      <rect x="16" y="50" width="160" height="12" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="20" y="52" width="152" height="6" fill={P.ground.water} />
      <path d="M20,55 Q40,52 60,55 T100,55 T140,55 T172,55" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.6" />
      {/* falling water at end */}
      <rect x="172" y="62" width="4" height="76" fill={P.ground.water} opacity="0.7" />
      <ellipse cx="174" cy="140" rx="10" ry="3" fill={P.ground.water} />
      <Banner x={32} y={48} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

/* === PRODUCTION === */

function WorkshopSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Workshop" sub="Production" category="production">
      <BuildingPlinth w={140} />
      <rect x="42" y="80" width="108" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M42,84 H150 M42,100 H150 M42,116 H150 M42,132 H150" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M34,84 L158,84 L130,42 L62,42 Z" />
      {/* large workshop opening */}
      <path d="M70,140 L70,100 L122,100 L122,140 Z" fill={P.ink.line} />
      <rect x="74" y="104" width="20" height="20" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.5" />
      {/* sparks (busy) */}
      <circle className="cq-spark" cx="84" cy="116" r="1.6" fill="#ffd966" />
      <circle className="cq-spark cq-spark--b" cx="100" cy="118" r="1.4" fill="#ffd966" />
      <circle className="cq-spark cq-spark--c" cx="112" cy="112" r="1.3" fill="#ffb84d" />
      {/* sawhorse */}
      <line x1="78" y1="138" x2="86" y2="124" stroke={P.wood.dark} strokeWidth="1.2" />
      <line x1="92" y1="138" x2="86" y2="124" stroke={P.wood.dark} strokeWidth="1.2" />
      <rect x="80" y="120" width="14" height="3" fill={P.wood.mid} />
      {/* logs */}
      <ellipse cx="138" cy="138" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="138" cy="134" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={42} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

function ForgeSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Forge" sub="Production" category="production">
      <BuildingPlinth w={140} />
      <rect x="42" y="76" width="108" height="64" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="76" width="108" height="64" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M34,80 L158,80 L130,40 L62,40 Z" color="#8a4030" />
      {/* chimney */}
      <rect x="120" y="22" width="22" height="40" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="118" y="20" width="26" height="6" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* smoke */}
      <ellipse className="cq-smoke" cx="138" cy="14" rx="8" ry="5" fill="#8a8a8a" opacity="0.6" />
      <ellipse className="cq-smoke cq-smoke--b" cx="148" cy="6" rx="6" ry="4" fill="#8a8a8a" opacity="0.4" />
      <ellipse className="cq-smoke cq-smoke--c" cx="142" cy="10" rx="5" ry="3.5" fill="#a0a0a0" opacity="0.5" />
      {/* glowing forge mouth */}
      <path d="M62,140 L62,100 L100,100 L100,140 Z" fill={P.ink.line} />
      <g className="cq-fire">
        <ellipse cx="81" cy="120" rx="14" ry="10" fill="#ff8a3a" />
        <ellipse cx="81" cy="120" rx="9" ry="6" fill="#ffd966" />
      </g>
      {/* anvil */}
      <path d="M118,128 L142,128 L138,124 L122,124 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="126" y="128" width="8" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="120" y="134" width="20" height="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={56} y={40} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

function LumbermillSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Lumbermill" sub="Production" category="production">
      <BuildingPlinth w={150} />
      <rect x="36" y="84" width="108" height="56" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M36,90 H144 M36,104 H144 M36,118 H144 M36,132 H144" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M28,84 L152,84 L124,46 L56,46 Z" color="#7a5a3a" shadow="#4a3220" />
      {/* water wheel */}
      <g transform="translate(150 110)">
        <g className="cq-wheel">
        <circle r="22" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
        <circle r="22" fill="none" stroke={P.wood.dark} strokeWidth="1" />
        {[0,1,2,3,4,5,6,7].map(i => (
          <line key={i} x1="0" y1="0" x2={Math.cos(i*Math.PI/4)*22} y2={Math.sin(i*Math.PI/4)*22} stroke={P.wood.dark} strokeWidth="1.4" />
        ))}
        <circle r="3" fill={P.metal.iron} />
        </g>
      </g>
      {/* water trough */}
      <rect x="120" y="134" width="58" height="6" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.5" />
      <line className="cq-water-stream" x1="124" y1="137" x2="176" y2="137" stroke="#fff" strokeWidth="0.8" opacity="0.6" />
      {/* logs stack */}
      <ellipse cx="48" cy="138" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="48" cy="134" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="48" cy="130" rx="8" ry="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={88} y={48} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

function QuarrySprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Quarry" sub="Production" category="production">
      <BuildingPlinth w={160} color={P.stone.dark} />
      {/* terraced pit */}
      <ellipse cx="96" cy="120" rx="64" ry="20" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="116" rx="50" ry="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="96" cy="112" rx="36" ry="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      {/* stone blocks staged */}
      <rect x="32" y="98" width="20" height="18" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="32" y="98" width="20" height="18" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="36" y="84" width="14" height="14" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="142" y="100" width="22" height="20" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="142" y="100" width="22" height="20" fill="url(#stoneTexture)" opacity="0.6" />
      {/* crane / lever */}
      <line x1="112" y1="120" x2="138" y2="60" stroke={P.wood.dark} strokeWidth="2.5" />
      <line x1="138" y1="60" x2="124" y2="84" stroke="#3a2a1a" strokeWidth="0.8" />
      <rect x="120" y="84" width="8" height="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* pickaxe */}
      <g transform="translate(60 90) rotate(-25)">
        <rect x="-1" y="0" width="2" height="20" fill={P.wood.dark} />
        <path d="M-10,-2 L10,-2 L8,2 L-8,2 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      {/* dust puff (busy) */}
      <ellipse className="cq-dust" cx="96" cy="106" rx="10" ry="5" fill="#d8c896" opacity="0" />
      <Banner x={96} y={68} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

/* === SCIENCE === */

function LibrarySprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Library" sub="Science" category="science">
      <BuildingPlinth w={150} />
      <rect x="38" y="74" width="116" height="66" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="38" y="74" width="116" height="66" fill="url(#stoneTexture)" opacity="0.4" />
      {/* columns */}
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${48 + i*30} 0)`}>
          <rect x="-3" y="80" width="6" height="56" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-5" y="80" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-5" y="132" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
      ))}
      <TileRoof d="M30,78 L162,78 L96,38 Z" color="#6a8a4a" />
      {/* lit interior glow */}
      <rect className="cq-glow" x="46" y="100" width="100" height="34" fill="#ffd966" opacity="0.2" />
      {/* pediment scroll */}
      <circle cx="96" cy="60" r="6" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="91" y1="58" x2="101" y2="58" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="91" y1="60" x2="101" y2="60" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="91" y1="62" x2="101" y2="62" stroke={P.ink.line} strokeWidth="0.5" />
      {/* steps */}
      <path d="M30,140 L162,140 L156,146 L36,146 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={40} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function ArchiveSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Archive" sub="Science" category="science">
      <BuildingPlinth w={140} />
      <rect x="42" y="68" width="108" height="72" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="68" width="108" height="72" fill="url(#stoneTexture)" opacity="0.7" />
      {/* tall narrow windows */}
      {[0,1,2,3].map(i => (
        <g key={i}>
          <rect x={52 + i*25} y="84" width="6" height="22" fill={P.ink.line} />
          <rect className="cq-glow" x={52 + i*25} y="84" width="6" height="22" fill="#ffd966" opacity="0.4" />
        </g>
      ))}
      {/* pediment */}
      <path d="M34,72 L158,72 L96,40 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M34,72 L158,72 L96,40 Z" fill="url(#stoneTexture)" opacity="0.5" />
      {/* scroll relief */}
      <ellipse cx="96" cy="58" rx="14" ry="3" fill={P.stone.dark} />
      <rect x="86" y="56" width="20" height="2" fill={P.stone.dark} />
      {/* doorway */}
      <path d="M84,140 L84,114 Q96,108 108,114 L108,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="103" cy="128" r="1.4" fill={P.metal.gold} />
      <Banner x={96} y={42} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function ObservatorySprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Observatory" sub="Science" category="science">
      <BuildingPlinth w={120} />
      <rect x="56" y="80" width="80" height="60" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="56" y="80" width="80" height="60" fill="url(#stoneTexture)" opacity="0.6" />
      {/* dome */}
      <path d="M56,82 Q96,30 136,82 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M56,82 Q96,40 136,82" fill="none" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
      <path d="M68,72 Q96,40 124,72" fill="none" stroke={P.ink.line} strokeWidth="0.5" opacity="0.4" />
      {/* dome slit glow */}
      <ellipse className="cq-glow" cx="96" cy="56" rx="4" ry="14" fill="#5fb4d4" opacity="0.5" />
      {/* dome slit + telescope */}
      <path d="M88,72 L104,72 L100,40 L92,40 Z" fill={P.ink.line} />
      <g transform="translate(96 50) rotate(-25)">
        <rect x="-2" y="-22" width="4" height="34" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-3" y="-24" width="6" height="3" fill={P.metal.gold} />
      </g>
      {/* stars */}
      <g fill="#ffd966">
        <circle cx="32" cy="36" r="1.2" />
        <circle cx="160" cy="50" r="1.4" />
        <circle cx="48" cy="20" r="1" />
        <circle cx="142" cy="22" r="1" />
      </g>
      {/* doorway */}
      <path d="M86,140 L86,116 Q96,110 106,116 L106,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={56} y={70} faction={faction} scale={0.7} />
    </BuildingFrame>
  );
}

/* === ECONOMY === */

function MarketplaceSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Marketplace" sub="Economy" category="gold">
      <BuildingPlinth w={170} />
      {/* ground tiles */}
      <rect x="20" y="120" width="152" height="20" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.5" />
      {/* awning A (red) */}
      <g>
        <line x1="36" y1="60" x2="36" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <line x1="80" y1="60" x2="80" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <path d="M28,60 L88,60 L92,80 L24,80 Z" fill="#c4413a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M24,80 L92,80 L88,86 L28,86 Z" fill="#8a2820" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="36" y="86" width="44" height="34" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        {/* fruit baskets */}
        <ellipse cx="46" cy="96" rx="6" ry="3" fill={P.wood.mid} />
        <circle cx="44" cy="93" r="2" fill="#e85a4e" />
        <circle cx="48" cy="93" r="2" fill="#e85a4e" />
        <circle cx="46" cy="91" r="2" fill="#ffb84d" />
        <ellipse cx="68" cy="96" rx="6" ry="3" fill={P.wood.mid} />
        <circle cx="66" cy="93" r="2" fill="#7eaf5e" />
        <circle cx="70" cy="93" r="2" fill="#7eaf5e" />
      </g>
      {/* awning B (blue) */}
      <g>
        <line x1="100" y1="64" x2="100" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <line x1="156" y1="64" x2="156" y2="124" stroke={P.wood.dark} strokeWidth="1.6" />
        <path d="M92,64 L164,64 L168,84 L88,84 Z" fill="#3a6e94" stroke={P.ink.line} strokeWidth="1" />
        <path d="M88,84 L168,84 L164,90 L92,90 Z" fill="#1c4564" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="100" y="90" width="56" height="32" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        {/* pots */}
        <ellipse cx="116" cy="104" rx="5" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="130" cy="104" rx="5" ry="6" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="144" cy="104" rx="5" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        {/* coins */}
        <circle className="cq-shimmer" cx="138" cy="118" r="2" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
        <circle className="cq-shimmer" cx="142" cy="116" r="2" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={96} y={56} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function HarborSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Harbor" sub="Economy" category="gold">
      {/* water */}
      <rect x="0" y="100" width="192" height="60" fill={P.ground.water} />
      <path d="M0,108 Q24,104 48,108 T96,108 T144,108 T192,108" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.6" />
      <path d="M0,118 Q24,114 48,118 T96,118 T144,118 T192,118" stroke="#fff" strokeWidth="0.5" fill="none" opacity="0.4" />
      {/* dock */}
      <rect x="20" y="96" width="120" height="14" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M20,96 H140 M30,96 V110 M50,96 V110 M70,96 V110 M90,96 V110 M110,96 V110 M130,96 V110" stroke={P.wood.dark} strokeWidth="0.5" />
      {/* warehouse on left */}
      <rect x="20" y="60" width="60" height="40" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <ThatchRoof d="M14,60 L86,60 L70,36 L30,36 Z" />
      <rect x="42" y="76" width="16" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* moored boat */}
      <g transform="translate(150 110)">
        <path d="M-22,0 Q0,-6 22,0 Q18,10 0,12 Q-18,10 -22,0 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <line x1="0" y1="-6" x2="0" y2="-30" stroke={P.wood.dark} strokeWidth="1.5" />
        <path d="M0,-26 L14,-18 L14,-8 L0,-6 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
      {/* crates */}
      <rect x="92" y="86" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="106" y="86" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="99" y="76" width="12" height="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={50} y={36} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

/* === MILITARY === */

function BarracksSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Barracks" sub="Military" category="military">
      <BuildingPlinth w={160} />
      <rect x="30" y="80" width="132" height="60" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,86 H162 M30,100 H162 M30,114 H162 M30,128 H162" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M22,84 L170,84 L140,46 L52,46 Z" color="#5a3a20" shadow="#2a1810" />
      {/* training dummy outside */}
      <line x1="44" y1="120" x2="44" y2="140" stroke={P.wood.dark} strokeWidth="2" />
      <circle cx="44" cy="116" r="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="38" y="120" width="12" height="8" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="32" y1="124" x2="56" y2="124" stroke={P.ink.line} strokeWidth="0.6" />
      {/* big door */}
      <rect x="84" y="100" width="24" height="40" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="100" x2="96" y2="140" stroke={P.ink.line} strokeWidth="0.6" />
      {/* shield over door */}
      <path d="M88,80 L104,80 L106,90 Q96,98 86,90 Z" fill={f.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {/* spear stack */}
      <line x1="140" y1="84" x2="148" y2="140" stroke={P.wood.mid} strokeWidth="1.2" />
      <line x1="146" y1="84" x2="142" y2="140" stroke={P.wood.mid} strokeWidth="1.2" />
      <path d="M139,84 L142,76 L145,84" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      <path d="M145,84 L148,76 L151,84" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      <Banner x={96} y={46} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function WallsSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Walls" sub="Military" category="military">
      <BuildingPlinth w={170} color={P.stone.dark} />
      {/* battlement wall */}
      <rect x="14" y="80" width="164" height="60" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="14" y="80" width="164" height="60" fill="url(#stoneTexture)" opacity="0.7" />
      {/* crenellations */}
      {Array.from({length:9}).map((_,i)=>(
        <rect key={i} x={14 + i*20} y="68" width="10" height="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      ))}
      {Array.from({length:9}).map((_,i)=>(
        <rect key={i} x={14 + i*20} y="68" width="10" height="14" fill="url(#stoneTexture)" opacity="0.7" />
      ))}
      {/* tower */}
      <rect x="74" y="40" width="44" height="100" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="74" y="40" width="44" height="100" fill="url(#stoneTexture)" opacity="0.7" />
      <rect x="70" y="34" width="52" height="8" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {[0,1,2,3].map(i => (
        <rect key={i} x={70 + i*14} y="20" width="8" height="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      ))}
      {/* tower torches (busy) */}
      <g className="cq-fire">
        <ellipse cx="78" cy="48" rx="3" ry="5" fill="#ffd966" opacity="0.85" />
      </g>
      <g className="cq-fire">
        <ellipse cx="114" cy="48" rx="3" ry="5" fill="#ffd966" opacity="0.85" />
      </g>
      {/* arrow slit */}
      <rect x="94" y="70" width="4" height="14" fill={P.ink.line} />
      <rect x="94" y="100" width="4" height="14" fill={P.ink.line} />
      {/* gate */}
      <path d="M84,140 L84,118 Q96,108 108,118 L108,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="118" x2="96" y2="140" stroke={P.ink.soft} strokeWidth="0.6" />
      <Banner x={96} y={20} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function StableSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Stable" sub="Military" category="military">
      <BuildingPlinth w={160} />
      <rect x="30" y="86" width="132" height="54" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M30,92 H162 M30,108 H162 M30,124 H162" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
      <ThatchRoof d="M22,90 L170,90 L140,52 L52,52 Z" />
      {/* horseshoe over door */}
      <path d="M88,72 Q96,60 104,72 L100,80 L92,80 Z" fill="none" stroke={P.metal.iron} strokeWidth="2.4" />
      {/* stall doors (two) */}
      <rect x="46" y="106" width="22" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="46" y1="118" x2="68" y2="118" stroke={P.wood.mid} strokeWidth="0.6" />
      <rect x="124" y="106" width="22" height="34" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="124" y1="118" x2="146" y2="118" stroke={P.wood.mid} strokeWidth="0.6" />
      {/* center: horse head peeking */}
      <g transform="translate(96 116)"><g className="cq-peek">
        <ellipse cx="0" cy="6" rx="14" ry="10" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="0" cy="10" rx="6" ry="4" fill="#3a2a1a" />
        <path d="M-10,-6 L-6,-12 L-2,-4 Z" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M2,-4 L6,-12 L10,-6 Z" fill="#5a3a20" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-4" cy="2" r="0.8" fill={P.ink.line} />
        <circle cx="4" cy="2" r="0.8" fill={P.ink.line} />
        <path d="M-2,-6 Q0,-14 4,-12" stroke="#3a2a1a" strokeWidth="2" fill="none" />
      </g></g>
      {/* hay bale */}
      <rect x="156" y="128" width="14" height="12" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={52} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

/* === CULTURE === */

function TempleSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Temple" sub="Culture" category="culture">
      <BuildingPlinth w={150} />
      <rect x="40" y="74" width="112" height="62" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="40" y="74" width="112" height="62" fill="url(#stoneTexture)" opacity="0.4" />
      {[0,1,2,3].map(i => (
        <g key={i} transform={`translate(${50 + i*28} 0)`}>
          <rect x="-3" y="76" width="6" height="60" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-5" y="76" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-5" y="132" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
      ))}
      <TileRoof d="M32,78 L160,78 L96,38 Z" color="#9a6abf" />
      {/* eye motif */}
      <ellipse cx="96" cy="62" rx="10" ry="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="96" cy="62" r="3" fill={P.metal.gold} />
      <circle cx="96" cy="62" r="1.4" fill={P.ink.line} />
      {/* incense smoke */}
      <ellipse className="cq-smoke" cx="68" cy="112" rx="4" ry="2.4" fill="#d4d4d4" opacity="0.6" />
      <ellipse className="cq-smoke cq-smoke--b" cx="124" cy="112" rx="4" ry="2.4" fill="#d4d4d4" opacity="0.6" />
      {/* steps */}
      <path d="M28,140 L164,140 L158,146 L34,146 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={40} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function MonumentSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Monument" sub="Culture" category="culture">
      <BuildingPlinth w={100} />
      {/* obelisk */}
      <path d="M84,40 L108,40 L112,140 L80,140 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M84,40 L108,40 L112,140 L80,140 Z" fill="url(#stoneTexture)" opacity="0.6" />
      <path className="cq-shimmer" d="M84,40 L96,28 L108,40 Z" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
      {/* glyphs */}
      <g fill={P.ink.line}>
        <circle cx="96" cy="60" r="2" />
        <rect x="92" y="68" width="8" height="2" />
        <rect x="94" y="78" width="4" height="6" />
        <path d="M92,90 L100,90 L96,96 Z" />
        <rect x="92" y="102" width="8" height="2" />
        <rect x="94" y="110" width="4" height="6" />
      </g>
      <Banner x={120} y={60} faction={faction} scale={0.9} />
      {/* bench */}
      <rect x="40" y="124" width="30" height="3" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="42" y="127" width="2" height="10" fill={P.wood.dark} />
      <rect x="66" y="127" width="2" height="10" fill={P.wood.dark} />
    </BuildingFrame>
  );
}

function AmphitheaterSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Amphitheater" sub="Culture" category="culture">
      <BuildingPlinth w={170} />
      {/* outer ring */}
      <ellipse cx="96" cy="110" rx="78" ry="36" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="110" rx="78" ry="36" fill="url(#stoneTexture)" opacity="0.5" />
      {/* arches around the front */}
      {[-3,-2,-1,0,1,2,3].map((i)=>(
        <path key={i} d={`M${96+i*20-7},${110+Math.abs(i)*1.5} L${96+i*20-7},${102+Math.abs(i)*1.5} Q${96+i*20},${94+Math.abs(i)*1.5} ${96+i*20+7},${102+Math.abs(i)*1.5} L${96+i*20+7},${110+Math.abs(i)*1.5} Z`} fill={P.ink.soft} opacity="0.6" stroke={P.ink.line} strokeWidth="0.5" />
      ))}
      {/* second tier */}
      <path d="M28,90 Q96,52 164,90 L164,108 Q96,76 28,108 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M28,90 Q96,52 164,90 L164,108 Q96,76 28,108 Z" fill="url(#stoneTexture)" opacity="0.6" />
      {[-2,-1,0,1,2].map((i)=>(
        <rect key={i} x={92 + i*22 -4} y={66 + Math.abs(i)*3} width="8" height="14" fill={P.ink.line} opacity="0.8" />
      ))}
      {/* stage area / inner pit (visible center) */}
      <ellipse cx="96" cy="118" rx="34" ry="10" fill={P.ground.dirt} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="96" cy="116" rx="22" ry="5" fill={P.stone.dark} />
      {/* tiny figures */}
      <circle className="cq-crowd-fig" cx="88" cy="116" r="1.6" fill={P.ink.line} />
      <circle className="cq-crowd-fig" cx="100" cy="118" r="1.6" fill={P.ink.line} />
      <circle className="cq-crowd-fig" cx="76" cy="120" r="1.4" fill={P.ink.line} />
      <circle className="cq-crowd-fig" cx="112" cy="116" r="1.4" fill={P.ink.line} />
      <Banner x={96} y={50} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function ShrineSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Shrine" sub="Culture" category="culture">
      <BuildingPlinth w={100} />
      {/* small stone hut */}
      <rect x="68" y="92" width="56" height="48" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="68" y="92" width="56" height="48" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M62,94 L130,94 L96,62 Z" color="#9a6abf" />
      {/* arched doorway */}
      <path d="M86,140 L86,114 Q96,104 106,114 L106,140 Z" fill={P.ink.line} />
      {/* candle inside */}
      <rect x="94" y="124" width="4" height="12" fill={P.cloth.linen} />
      <ellipse className="cq-candle" cx="96" cy="122" rx="2" ry="3" fill="#ffd966" />
      {/* offering bowl */}
      <ellipse cx="96" cy="142" rx="10" ry="3" fill={P.stone.dark} />
      <ellipse cx="96" cy="140" rx="8" ry="2" fill={P.metal.bronze} />
      {/* prayer flags */}
      <line x1="60" y1="64" x2="132" y2="64" stroke={P.wood.dark} strokeWidth="0.6" />
      <rect x="64" y="64" width="6" height="8" fill="#c4413a" />
      <rect x="74" y="64" width="6" height="8" fill="#3a6e94" />
      <rect x="84" y="64" width="6" height="8" fill="#7eaf5e" />
      <rect x="106" y="64" width="6" height="8" fill="#ffb84d" />
      <rect x="116" y="64" width="6" height="8" fill="#9a6abf" />
      <Banner x={130} y={70} faction={faction} scale={0.7} />
    </BuildingFrame>
  );
}

function ForumSprite({ faction = 'imperials', state = 'idle' }) {
  return (
    <BuildingFrame state={state} label="Forum" sub="Culture" category="culture">
      <BuildingPlinth w={170} />
      {/* paved plaza */}
      <rect x="20" y="116" width="152" height="24" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M50,116 V140 M80,116 V140 M110,116 V140 M140,116 V140 M20,128 H172" stroke={P.stone.dark} strokeWidth="0.4" />
      {/* central rostrum */}
      <rect x="78" y="92" width="36" height="24" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="78" y="92" width="36" height="24" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="74" y="88" width="44" height="6" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      {/* statue on top */}
      <rect x="92" y="64" width="8" height="24" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="96" cy="60" r="5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M88,80 L92,72 M104,80 L100,72" stroke={P.cloth.linen} strokeWidth="3" />
      {/* flanking columns */}
      {[34, 158].map((x,i) => (
        <g key={i} transform={`translate(${x} 0)`}>
          <rect x="-3" y="80" width="6" height="38" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-5" y="78" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-5" y="118" width="10" height="4" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
        </g>
      ))}
      <Banner x={96} y={52} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

/* === ESPIONAGE === */

function SafehouseSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Safehouse" sub="Espionage" category="espionage">
      <BuildingPlinth w={150} />
      <rect x="42" y="72" width="108" height="68" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="1" />
      <rect x="42" y="72" width="108" height="68" fill="url(#stoneTexture)" opacity="0.5" />
      <ThatchRoof d="M34,74 L158,74 L130,40 L62,40 Z" color="#5a3a20" shadow="#2a1810" />
      {/* shuttered windows — closed */}
      <rect x="56" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="63" y1="92" x2="63" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="80" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="87" y1="92" x2="87" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="122" y="92" width="14" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="129" y1="92" x2="129" y2="106" stroke={P.ink.line} strokeWidth="0.5" />
      {/* unmarked door */}
      <rect x="92" y="110" width="16" height="30" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* tiny mark by door */}
      <circle className="cq-mark" cx="116" cy="138" r="1.6" fill={f.bright} />
      {/* ladder up to roof */}
      <line x1="146" y1="74" x2="146" y2="140" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="74" x2="142" y2="140" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="92" x2="146" y2="92" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="106" x2="146" y2="106" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="142" y1="120" x2="146" y2="120" stroke={P.wood.dark} strokeWidth="1" />
      {/* NO faction banner — that's the joke */}
    </BuildingFrame>
  );
}

function IntelAgencySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Intelligence Agency" sub="Espionage" category="espionage">
      <BuildingPlinth w={160} />
      <rect x="36" y="62" width="120" height="78" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="36" y="62" width="120" height="78" fill="url(#stoneTexture)" opacity="0.7" />
      {/* dark glass windows */}
      {[0,1,2,3].map(i => (
        <rect key={`a${i}`} x={46 + i*28} y="78" width="20" height="14" fill="#0a0a14" stroke={P.ink.line} strokeWidth="0.5" />
      ))}
      {[0,1,2,3].map(i => (
        <rect key={`b${i}`} x={46 + i*28} y="100" width="20" height="14" fill="#0a0a14" stroke={P.ink.line} strokeWidth="0.5" />
      ))}
      {/* one window glowing */}
      <rect className="cq-glow" x="74" y="100" width="20" height="14" fill={f.bright} opacity="0.7" />
      {/* radio antenna */}
      <line x1="96" y1="62" x2="96" y2="20" stroke={P.metal.iron} strokeWidth="1.4" />
      <line x1="96" y1="34" x2="86" y2="28" stroke={P.metal.iron} strokeWidth="0.8" />
      <line x1="96" y1="34" x2="106" y2="28" stroke={P.metal.iron} strokeWidth="0.8" />
      <circle className="cq-beacon" cx="96" cy="20" r="2" fill={f.bright} />
      {/* roof */}
      <rect x="32" y="56" width="128" height="8" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* doorway with eye seal */}
      <rect x="84" y="118" width="24" height="22" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="96" cy="124" rx="6" ry="3" fill={f.trim} />
      <circle cx="96" cy="124" r="1.6" fill={P.ink.line} />
      {/* small banner */}
      <Banner x={132} y={56} faction={faction} scale={0.7} shape="square" />
    </BuildingFrame>
  );
}

function SecurityBureauSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Security Bureau" sub="Espionage" category="espionage">
      <BuildingPlinth w={170} color={P.stone.dark} />
      {/* fortified bunker */}
      <rect x="22" y="72" width="148" height="68" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="22" y="72" width="148" height="68" fill="url(#stoneTexture)" opacity="0.7" />
      {/* slit windows */}
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={36 + i*26} y="92" width="14" height="4" fill={P.ink.line} />
      ))}
      {/* second band */}
      {[0,1,2,3,4].map(i => (
        <rect key={i} x={36 + i*26} y="108" width="14" height="4" fill={P.ink.line} />
      ))}
      {/* spotlight tower */}
      <rect x="138" y="36" width="18" height="40" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="134" y="32" width="26" height="8" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="147" cy="36" r="4" fill={f.bright} />
      <path className="cq-spotlight" d="M147,36 L185,16 L185,56 Z" fill={f.bright} opacity="0.35" />
      {/* corner cameras */}
      <circle cx="32" cy="80" r="4" fill={P.ink.line} stroke={P.metal.iron} strokeWidth="0.8" />
      <circle className="cq-camera-led" cx="32" cy="80" r="1.5" fill={f.bright} />
      <circle cx="160" cy="80" r="4" fill={P.ink.line} stroke={P.metal.iron} strokeWidth="0.8" />
      <circle className="cq-camera-led" cx="160" cy="80" r="1.5" fill={f.bright} />
      {/* heavy gate */}
      <rect x="80" y="116" width="32" height="24" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="96" y1="116" x2="96" y2="140" stroke={P.metal.shine} strokeWidth="0.5" />
      <circle cx="86" cy="128" r="1.4" fill={P.metal.gold} />
      <circle cx="106" cy="128" r="1.4" fill={P.metal.gold} />
      {/* faction emblem on roof */}
      <Banner x={56} y={56} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

/* === MR 3 BUILDINGS === */

function DockSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Dock" sub="Economy" category="economy">
      <BuildingPlinth w={160} color={P.stone.dark} />
      {/* water surface */}
      <rect x="20" y="128" width="152" height="20" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M20,132 Q60,128 100,132 Q140,136 172,132" fill="none" stroke="#fff" strokeWidth="0.6" opacity="0.4" />
      {/* pier planks */}
      <rect x="58" y="88" width="76" height="42" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      {[0,1,2,3,4,5].map(i => (
        <line key={i} x1="58" y1={90 + i * 7} x2="134" y2={90 + i * 7} stroke={P.wood.dark} strokeWidth="0.5" />
      ))}
      {/* pilings */}
      <rect x="64" y="106" width="6" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="88" y="106" width="6" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="112" y="106" width="6" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      {/* bollards */}
      <rect x="130" y="100" width="6" height="12" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="56" y="100" width="6" height="12" rx="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* rope */}
      <path d="M56,106 Q96,100 136,106" fill="none" stroke={P.cloth.linen} strokeWidth="1.2" strokeLinecap="round" />
      {/* dock house */}
      <rect x="36" y="72" width="50" height="40" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
      <ThatchRoof d="M30,76 L92,76 L78,50 L44,50 Z" />
      <rect x="54" y="88" width="14" height="24" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="38" y="78" width="10" height="8" fill={P.ink.line} opacity="0.4" />
      <Banner x={96} y={50} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function BronzeWorkshopSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Bronze Workshop" sub="Production" category="production">
      <BuildingPlinth w={150} />
      <rect x="34" y="78" width="124" height="62" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="34" y="78" width="124" height="62" fill="url(#stoneTexture)" opacity="0.5" />
      <TileRoof d="M26,82 L166,82 L144,48 L48,48 Z" color="#7a4a20" />
      {/* chimney with glow */}
      <rect x="110" y="36" width="14" height="46" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="117" cy="36" rx="7" ry="3" fill={P.stone.dark} />
      <g className="cq-smoke">
        <ellipse cx="117" cy="28" rx="5" ry="4" fill="#9a9a9a" opacity="0.6" />
        <ellipse cx="120" cy="18" rx="4" ry="3" fill="#8a8a8a" opacity="0.5" />
      </g>
      {/* forge glow */}
      <g className="cq-fire">
        <ellipse cx="64" cy="128" rx="12" ry="6" fill="#e07020" opacity="0.9" />
        <ellipse cx="64" cy="128" rx="6" ry="3" fill="#ffd966" opacity="0.8" />
      </g>
      {/* anvil */}
      <rect x="50" y="122" width="28" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="54" y="118" width="20" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      {/* bronze tools on rack */}
      <line x1="120" y1="88" x2="116" y2="104" stroke={P.metal.bronze} strokeWidth="2" />
      <line x1="128" y1="88" x2="132" y2="104" stroke={P.metal.bronze} strokeWidth="2" />
      <line x1="138" y1="90" x2="136" y2="104" stroke={P.metal.bronze} strokeWidth="2" />
      {/* door */}
      <rect x="80" y="102" width="24" height="38" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="92" y1="102" x2="92" y2="140" stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={48} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function ArmorySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Armory" sub="Military" category="military">
      <BuildingPlinth w={155} color={P.stone.dark} />
      <rect x="32" y="76" width="128" height="64" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <rect x="32" y="76" width="128" height="64" fill="url(#stoneTexture)" opacity="0.6" />
      <TileRoof d="M24,80 L168,80 L148,44 L44,44 Z" color={P.metal.iron} />
      {/* crenellations */}
      {Array.from({length:7}).map((_,i) => (
        <rect key={i} x={24 + i*22} y="68" width="10" height="14" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      ))}
      {/* weapon racks */}
      {/* sword rack */}
      <line x1="52" y1="82" x2="52" y2="104" stroke={P.wood.dark} strokeWidth="1.5" />
      <line x1="44" y1="86" x2="60" y2="86" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="46" y1="78" x2="44" y2="90" stroke={P.metal.steel} strokeWidth="1.4" />
      <line x1="50" y1="76" x2="48" y2="90" stroke={P.metal.steel} strokeWidth="1.4" />
      <line x1="54" y1="76" x2="56" y2="90" stroke={P.metal.steel} strokeWidth="1.4" />
      <line x1="58" y1="78" x2="60" y2="90" stroke={P.metal.steel} strokeWidth="1.4" />
      {/* shield wall */}
      <path d="M110,82 L126,82 L128,96 Q118,106 108,96 Z" fill={f.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M130,82 L146,82 L148,96 Q138,106 128,96 Z" fill={f.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="118" cy="92" r="2" fill={P.metal.gold} />
      <circle cx="138" cy="92" r="2" fill={P.metal.gold} />
      {/* entrance */}
      <path d="M82,140 L82,114 Q96,104 110,114 L110,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="88" cy="126" r="2" fill={P.metal.gold} />
      <Banner x={96} y={44} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function RanchSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Ranch" sub="Food" category="food">
      <BuildingPlinth w={160} color={P.ground.grass} />
      {/* pasture ground */}
      <ellipse cx="96" cy="150" rx="76" ry="16" fill="#5a8a3a" opacity="0.35" />
      {/* fence enclosure */}
      {[0,1,2,3,4,5,6,7].map(i => (
        <rect key={i} x={22 + i*20} y="96" width="4" height="44" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      ))}
      <rect x="22" y="96" width="136" height="5" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="22" y="114" width="136" height="5" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="22" y="132" width="136" height="5" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.5" />
      {/* gate */}
      <rect x="84" y="94" width="24" height="44" fill="none" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="84" y1="94" x2="108" y2="138" stroke={P.wood.dark} strokeWidth="0.7" />
      <line x1="108" y1="94" x2="84" y2="138" stroke={P.wood.dark} strokeWidth="0.7" />
      {/* barn */}
      <rect x="38" y="60" width="80" height="42" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M34,64 L118,64 L96,30 L56,30 Z" fill="#8a3a20" stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="74" y="76" width="16" height="26" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* hay bale */}
      <ellipse cx="145" cy="126" rx="12" ry="14" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.7" />
      <ellipse cx="145" cy="126" rx="8" ry="10" fill={P.thatch.shadow} opacity="0.3" />
      <Banner x={96} y={30} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function CavalryAcademySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Cavalry Academy" sub="Military" category="military">
      <BuildingPlinth w={160} />
      <rect x="30" y="74" width="132" height="56" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M30,80 H162 M30,100 H162 M30,120 H162" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
      <ThatchRoof d="M22,78 L170,78 L140,40 L52,40 Z" />
      {/* horseshoe arch over entrance */}
      <path d="M80,68 Q96,54 112,68 L108,78 L84,78 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M80,68 Q96,56 112,68" fill="none" stroke={P.metal.gold} strokeWidth="1.5" />
      {/* stall doors */}
      <rect x="40" y="100" width="24" height="30" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="40" y1="114" x2="64" y2="114" stroke={P.wood.mid} strokeWidth="0.5" />
      <rect x="128" y="100" width="24" height="30" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="128" y1="114" x2="152" y2="114" stroke={P.wood.mid} strokeWidth="0.5" />
      {/* pennant track/jump bar */}
      <line x1="36" y1="72" x2="156" y2="72" stroke={P.wood.mid} strokeWidth="1.5" />
      <line x1="36" y1="62" x2="36" y2="74" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="156" y1="62" x2="156" y2="74" stroke={P.wood.dark} strokeWidth="2" />
      {/* main door */}
      <rect x="82" y="92" width="28" height="38" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <Banner x={96} y={40} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function IronFoundrySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Iron Foundry" sub="Production" category="production">
      <BuildingPlinth w={158} color={P.stone.dark} />
      <rect x="34" y="80" width="124" height="60" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="1" />
      <rect x="34" y="80" width="124" height="60" fill="url(#stoneTexture)" opacity="0.7" />
      <TileRoof d="M26,84 L166,84 L144,50 L48,50 Z" color={P.metal.iron} />
      {/* two chimneys */}
      <rect x="52" y="30" width="16" height="54" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="60" cy="30" rx="8" ry="3.5" fill="#1a1a1a" />
      <rect x="120" y="38" width="14" height="46" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <ellipse cx="127" cy="38" rx="7" ry="3" fill="#1a1a1a" />
      {/* smoke */}
      <g className="cq-smoke">
        <ellipse cx="60" cy="20" rx="7" ry="5" fill="#5a5a5a" opacity="0.7" />
        <ellipse cx="55" cy="10" rx="5" ry="4" fill="#6a6a6a" opacity="0.5" />
        <ellipse cx="127" cy="28" rx="6" ry="4" fill="#5a5a5a" opacity="0.6" />
      </g>
      {/* molten glow in furnace mouth */}
      <g className="cq-fire">
        <ellipse cx="96" cy="134" rx="20" ry="8" fill="#e05010" opacity="0.95" />
        <ellipse cx="96" cy="134" rx="12" ry="5" fill="#ffa020" opacity="0.85" />
        <ellipse cx="96" cy="134" rx="6" ry="3" fill="#ffd966" opacity="0.9" />
      </g>
      {/* furnace mouth arch */}
      <path d="M70,140 L70,118 Q96,104 122,118 L122,140 Z" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* iron bars stacked */}
      <rect x="36" y="106" width="24" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="36" y="114" width="24" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <rect x="36" y="122" width="24" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={50} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function WarAcademySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="War Academy" sub="Military" category="military">
      <BuildingPlinth w={162} color={P.stone.mid} />
      <rect x="30" y="70" width="132" height="70" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="30" y="70" width="132" height="70" fill="url(#stoneTexture)" opacity="0.5" />
      <TileRoof d="M22,74 L170,74 L148,34 L44,34 Z" color="#4a2a10" />
      {/* columns */}
      {[52, 76, 100, 124, 148].map(x => (
        <g key={x}>
          <rect x={x - 4} y="66" width="8" height="74" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx={x} cy="66" rx="6" ry="3" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
        </g>
      ))}
      {/* pediment */}
      <path d="M22,74 L170,74 L170,68 L22,68 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      {/* training ground inside — crossed swords emblem */}
      <line x1="84" y1="96" x2="108" y2="120" stroke={P.metal.steel} strokeWidth="2.5" strokeLinecap="round" />
      <line x1="108" y1="96" x2="84" y2="120" stroke={P.metal.steel} strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="96" cy="108" r="6" fill={f.mid} stroke={f.dark} strokeWidth="1" />
      {/* main door */}
      <rect x="80" y="108" width="32" height="32" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M80,108 L96,96 L112,108 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={96} y={34} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function MasonryWorksSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Masonry Works" sub="Production" category="production">
      <BuildingPlinth w={158} color={P.stone.mid} />
      {/* stone blocks yard */}
      <rect x="32" y="106" width="40" height="20" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
      <rect x="32" y="96" width="40" height="12" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.7" />
      <rect x="32" y="106" width="40" height="20" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="36" y="88" width="28" height="10" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
      {/* scattered blocks */}
      <rect x="130" y="110" width="22" height="16" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="130" y="110" width="22" height="16" fill="url(#stoneTexture)" opacity="0.6" />
      <rect x="132" y="100" width="18" height="12" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      {/* workshop building */}
      <rect x="52" y="68" width="88" height="56" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
      <TileRoof d="M44,72 L148,72 L132,38 L60,38 Z" color="#6a5030" />
      {/* chisel and mallet tools hanging */}
      <line x1="68" y1="74" x2="60" y2="96" stroke={P.metal.steel} strokeWidth="2" />
      <rect x="56" y="74" width="8" height="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="84" y1="74" x2="80" y2="92" stroke={P.wood.dark} strokeWidth="3" strokeLinecap="round" />
      <ellipse cx="80" cy="73" rx="6" ry="4" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* door */}
      <rect x="86" y="94" width="20" height="30" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
      <Banner x={96} y={38} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function SiegeWorkshopSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Siege Workshop" sub="Military" category="military">
      <BuildingPlinth w={166} />
      <rect x="26" y="72" width="140" height="68" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
      <path d="M26,78 H166 M26,100 H166 M26,122 H166" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
      <ThatchRoof d="M18,76 L174,76 L150,34 L42,34 Z" color="#5a3a10" shadow="#2a1808" />
      {/* large main door — wide for siege engine access */}
      <rect x="68" y="100" width="56" height="40" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <line x1="96" y1="100" x2="96" y2="140" stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M68,100 L96,88 L124,100 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* catapult wheel visible inside */}
      <circle cx="82" cy="124" r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="82" y1="114" x2="82" y2="134" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="72" y1="124" x2="92" y2="124" stroke={P.wood.dark} strokeWidth="1" />
      <circle cx="110" cy="124" r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <line x1="110" y1="114" x2="110" y2="134" stroke={P.wood.dark} strokeWidth="1" />
      <line x1="100" y1="124" x2="120" y2="124" stroke={P.wood.dark} strokeWidth="1" />
      {/* rope spool on wall */}
      <circle cx="38" cy="100" r="10" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="38" cy="100" r="4" fill={P.wood.dark} />
      {/* lumber stack */}
      {[0,1,2].map(i => (
        <rect key={i} x={142} y={106 + i*8} width="20" height="6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.4" />
      ))}
      <Banner x={96} y={34} faction={faction} scale={1} />
    </BuildingFrame>
  );
}

function CaravanseraiSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Caravanserai" sub="Economy" category="economy">
      <BuildingPlinth w={160} color="#c8a870" />
      {/* courtyard walls */}
      <rect x="28" y="62" width="136" height="80" fill="#e8c890" stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="28" y="62" width="136" height="80" fill="url(#stoneTexture)" opacity="0.35" />
      {/* inner courtyard */}
      <rect x="52" y="80" width="88" height="48" fill="#d4b070" opacity="0.7" />
      {/* arched gate (center) */}
      <path d="M80,142 L80,112 Q96,96 112,112 L112,142 Z" fill="#8a6830" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M80,112 Q96,98 112,112" fill="none" stroke="#c8a028" strokeWidth="1.5" />
      {/* corner towers */}
      <rect x="28" y="56" width="24" height="30" fill="#d4b080" stroke={P.ink.line} strokeWidth="0.7" />
      <rect x="140" y="56" width="24" height="30" fill="#d4b080" stroke={P.ink.line} strokeWidth="0.7" />
      {/* crenellations on towers */}
      {[0,1].map(i => <rect key={`left-${i}`} x={32 + i*10} y="48" width="8" height="10" fill="#d4b080" stroke={P.ink.line} strokeWidth="0.5" />)}
      {[0,1].map(i => <rect key={`right-${i}`} x={144 + i*10} y="48" width="8" height="10" fill="#d4b080" stroke={P.ink.line} strokeWidth="0.5" />)}
      {/* well in courtyard */}
      <circle cx="96" cy="100" r="8" fill={P.stone.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <circle cx="96" cy="100" r="5" fill={P.ground.water} />
      <rect x="92" y="88" width="8" height="4" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.4" />
      {/* merchant sacks */}
      <ellipse cx="60" cy="130" rx="8" ry="6" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="74" cy="132" rx="6" ry="5" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={96} y={48} faction={faction} scale={0.9} />
    </BuildingFrame>
  );
}

function BankSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Bank" sub="Economy" category="economy">
      <BuildingPlinth w={158} color={P.stone.dark} />
      <rect x="32" y="72" width="128" height="68" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="32" y="72" width="128" height="68" fill="url(#stoneTexture)" opacity="0.4" />
      {/* classical pediment */}
      <rect x="24" y="66" width="144" height="10" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.7" />
      <path d="M24,66 L96,30 L168,66 Z" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M24,66 L96,30 L168,66 Z" fill="url(#stoneTexture)" opacity="0.4" />
      {/* columns */}
      {[52, 78, 104, 130].map(x => (
        <g key={x}>
          <rect x={x - 5} y="66" width="10" height="74" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx={x} cy="66" rx="7" ry="3.5" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.4" />
          <rect x={x - 7} y="138" width="14" height="4" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.3" />
        </g>
      ))}
      {/* heavy vault door */}
      <path d="M78,140 L78,112 Q96,98 114,112 L114,140 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="96" cy="122" r="6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="96" cy="122" r="3" fill={P.metal.shine} />
      {/* gold coins on steps */}
      <ellipse cx="60" cy="142" rx="7" ry="3" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
      <ellipse cx="132" cy="142" rx="7" ry="3" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
      {/* gold emblem in pediment — two horizontal bars suggest a currency symbol */}
      <circle cx="96" cy="50" r="8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
      <line x1="92" y1="48" x2="100" y2="48" stroke={P.ink.line} strokeWidth="1.5" />
      <line x1="92" y1="52" x2="100" y2="52" stroke={P.ink.line} strokeWidth="1.5" />
    </BuildingFrame>
  );
}

function StockExchangeSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <BuildingFrame state={state} label="Stock Exchange" sub="Economy" category="economy">
      <BuildingPlinth w={164} color={P.stone.dark} />
      <rect x="28" y="66" width="136" height="74" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1" />
      <rect x="28" y="66" width="136" height="74" fill="url(#stoneTexture)" opacity="0.35" />
      {/* domed roof */}
      <ellipse cx="96" cy="46" rx="52" ry="26" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="96" cy="46" rx="46" ry="20" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="96" cy="32" r="6" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.6" />
      {/* columns flanking entrance */}
      {[44, 64, 116, 136].map(x => (
        <rect key={x} x={x - 4} y="62" width="8" height="78" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.4" />
      ))}
      {/* trading floor window grid */}
      {[0,1,2].flatMap(c => [0,1].map(r => (
        <rect key={`${c}${r}`} x={50 + c*22} y={82 + r*20} width="16" height="14" fill={P.ink.line} opacity="0.35" stroke={P.stone.mid} strokeWidth="0.4" />
      )))}
      {/* ticker board on facade — rising trend line instead of text */}
      <rect x="60" y="108" width="72" height="18" fill="#1a2a1a" stroke={P.metal.gold} strokeWidth="0.8" />
      <path d="M66,120 L78,115 L90,117 L102,110 L116,105 L126,108" stroke="#5aff5a" strokeWidth="1.5" fill="none" />
      {/* entrance */}
      <path d="M80,140 L80,116 Q96,104 112,116 L112,140 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      {/* faction banner */}
      <Banner x={96} y={32} faction={faction} scale={0.8} />
    </BuildingFrame>
  );
}

Object.assign(window, {
  GranarySprite, HerbalistSprite, AqueductSprite,
  WorkshopSprite, ForgeSprite, LumbermillSprite, QuarrySprite,
  LibrarySprite, ArchiveSprite, ObservatorySprite,
  MarketplaceSprite, HarborSprite,
  BarracksSprite, WallsSprite, StableSprite,
  TempleSprite, MonumentSprite, AmphitheaterSprite, ShrineSprite, ForumSprite,
  SafehouseSprite, IntelAgencySprite, SecurityBureauSprite,
  DockSprite, BronzeWorkshopSprite, ArmorySprite, RanchSprite,
  CavalryAcademySprite, IronFoundrySprite, WarAcademySprite, MasonryWorksSprite,
  SiegeWorkshopSprite, CaravanseraiSprite, BankSprite, StockExchangeSprite,
});
