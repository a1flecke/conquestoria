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

// #710 fallback silhouettes. Native-v2 counterparts are registered only after the
// committed review gate; these remain the durable minor-civ/unknown-faction path.
//
// These use the same role anatomy as the review-only v2 art.  Do not turn the
// aircraft into single-path arrows, or the carrier into a deck rectangle: the
// fallback is player-visible for minor civilizations and deserves the full read.
export function ParatrooperSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      {/* Open canopy, suspension lines, harness, pack, then a complete body: the
          silhouette must read as an airborne paratrooper at a glance. */}
      <g className="cq-parachute-canopy">
        <path d="M25,38 Q64,8 103,38 L96,44 Q64,33 32,44 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M32,39 Q43,20 53,37 M53,37 Q64,17 75,37 M75,37 Q85,20 96,39" fill="none" stroke={palette.mid} strokeWidth="2.3" />
      </g>
      <g className="cq-parachute-lines" fill="none" stroke={P.ink.soft} strokeWidth="1">
        <line x1="32" y1="43" x2="52" y2="63" /><line x1="45" y1="40" x2="57" y2="63" />
        <line x1="58" y1="38" x2="61" y2="63" /><line x1="70" y1="38" x2="67" y2="63" />
        <line x1="83" y1="40" x2="72" y2="63" /><line x1="96" y1="43" x2="77" y2="63" />
      </g>
      <g className="cq-paratrooper-body">
        <g className="cq-paratrooper-pack"><rect x="44" y="59" width="17" height="24" rx="3" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" /><path d="M47,65h11M47,72h11" stroke={palette.mid} strokeWidth="1.6" /></g>
        <g className="cq-paratrooper-harness"><path d="M54,62 L64,77 L75,62 M54,62 L75,62" fill="none" stroke={P.metal.iron} strokeWidth="2.2" /><circle cx="64" cy="77" r="2" fill={palette.bright} stroke={P.ink.line} strokeWidth=".6" /></g>
        <path d="M64,58 Q76,60 76,78 L71,87 L56,87 L51,78 Q51,60 64,58 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="1" />
        <g className="cq-leg-l"><path d="M57,84 L63,84 L61,103 L53,103 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth=".8" /><ellipse cx="56" cy="103" rx="5" ry="2.5" fill={P.wood.dark} /></g>
        <g className="cq-leg-r"><path d="M65,84 L71,84 L76,101 L68,103 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth=".8" /><ellipse cx="72" cy="103" rx="5" ry="2.5" fill={P.wood.dark} /></g>
        <g className="cq-arm-l"><path d="M55,66 Q45,74 49,84" fill="none" stroke={P.cloth.wool} strokeWidth="6" strokeLinecap="round" /><circle cx="49" cy="84" r="2.6" fill={P.skin.warm} /></g>
        <g className="cq-arm-r"><path d="M73,66 Q83,71 81,81" fill="none" stroke={P.cloth.wool} strokeWidth="6" strokeLinecap="round" /><circle cx="81" cy="81" r="2.6" fill={P.skin.warm} /></g>
        <circle cx="64" cy="52" r="9" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="1" /><path d="M54,52 Q55,41 64,41 Q73,41 74,52 L71,55 L57,55 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".8" />
        <g className="cq-paratrooper-rifle"><path d="M75,79 L103,71" stroke={P.wood.dark} strokeWidth="4" strokeLinecap="round" /><path d="M96,70 L109,67" stroke={P.metal.steel} strokeWidth="2.4" strokeLinecap="round" /><path d="M83,76 L80,87" stroke={P.wood.dark} strokeWidth="3" strokeLinecap="round" /></g>
      </g>
      <Banner x={35} y={30} palette={palette} scale={.46} />
    </SpriteFrame>
  );
}

export function NavalStrikeAircraftSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={105} rx={42} ry={4} />
      <g className="cq-strike-fuselage"><path d="M21,64 Q33,55 80,56 L101,59 Q111,60 114,64 Q111,68 101,69 L80,72 Q33,73 21,64 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" /><path d="M27,63 Q58,59 101,62" fill="none" stroke={P.metal.shine} strokeWidth="1.4" opacity=".75" /></g>
      <g className="cq-strike-wing"><path d="M57,62 L47,42 L58,43 L83,60 L89,55 L86,64 L89,73 L83,68 L58,85 L47,86 L57,66 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" /><path d="M50,47 L77,61 M50,81 L77,67" stroke={palette.mid} strokeWidth="2.2" /></g>
      <g className="cq-strike-cockpit"><path d="M77,58 Q92,57 101,63 Q92,68 77,67 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth=".8" opacity=".8" /></g>
      <g className="cq-strike-tail"><path d="M31,64 L17,52 L23,49 L41,59 L41,69 L23,79 L17,76 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".9" /></g>
      <g className="cq-strike-tailhook"><path d="M30,70 Q20,78 26,86 Q31,89 34,84" fill="none" stroke={P.metal.steel} strokeWidth="2" strokeLinecap="round" /></g>
      <g className="cq-naval-strike-torpedo"><path d="M56,79 L91,79 L99,83 L91,87 L56,87 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".7" /><path d="M62,80h24" stroke={P.metal.shine} strokeWidth="1" /><path d="M97,81 L104,83 L97,85 Z" fill={palette.bright} /></g>
      <Banner x={38} y={34} palette={palette} scale={.44} />
    </SpriteFrame>
  );
}

export function MaritimePatrolAircraftSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={105} rx={47} ry={4} />
      <g className="cq-patrol-fuselage"><path d="M17,64 Q32,54 98,57 L106,59 Q113,60 115,64 Q113,68 106,69 L98,71 Q32,74 17,64 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" /><path d="M24,63 Q60,59 104,62" fill="none" stroke={P.metal.shine} strokeWidth="1.3" opacity=".7" /></g>
      <g className="cq-patrol-wing"><path d="M51,61 L42,39 L56,41 L82,59 L92,55 L88,64 L92,73 L82,69 L56,87 L42,89 L51,67 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" /><path d="M46,46 L77,61 M46,82 L77,67" stroke={palette.mid} strokeWidth="2" /></g>
      <g className="cq-patrol-nacelle-l"><ellipse cx="55" cy="50" rx="12" ry="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".8" /><circle cx="44" cy="50" r="4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth=".6" /></g>
      <g className="cq-patrol-nacelle-r"><ellipse cx="55" cy="78" rx="12" ry="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth=".8" /><circle cx="44" cy="78" r="4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth=".6" /></g>
      <g className="cq-patrol-prop-l"><path d="M42,39v22M31,50h22" stroke={P.ink.soft} strokeWidth="1.6" strokeLinecap="round" /></g><g className="cq-patrol-prop-r"><path d="M42,67v22M31,78h22" stroke={P.ink.soft} strokeWidth="1.6" strokeLinecap="round" /></g>
      <g className="cq-patrol-radar-dome"><path d="M72,72 Q82,63 92,72 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth=".8" /><path d="M76,73 Q82,81 88,73" fill="none" stroke={P.metal.steel} strokeWidth="1.2" /></g>
      <Banner x={27} y={39} palette={palette} scale={.42} />
    </SpriteFrame>
  );
}

export function SupercarrierSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={106} rx={57} ry={7} />
      <g className="cq-supercarrier-wake"><path d="M12,101 Q64,115 116,101 M18,107 Q64,119 110,107" fill="none" stroke={P.ground.water} strokeWidth="2.4" opacity=".8" /></g>
      <g className="cq-supercarrier-hull"><path d="M10,84 L21,73 L106,73 L121,84 L111,102 Q64,111 18,102 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.3" /><path d="M18,91 Q64,101 113,91" fill="none" stroke={P.metal.steel} strokeWidth="2" /></g>
      <g className="cq-supercarrier-bow"><path d="M106,73 L121,84 L111,102 L98,91 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth=".8" /></g>
      <g className="cq-supercarrier-deck"><path d="M15,72 L35,55 L110,60 L116,75 L98,87 L28,84 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" /><path d="M28,75 L87,70 L99,73" fill="none" stroke={palette.bright} strokeWidth="1.8" strokeDasharray="5 3" /></g>
      <g className="cq-supercarrier-aircraft" fill={palette.mid} stroke={P.ink.line} strokeWidth=".5"><path d="M38,64 L47,67 L38,70 L41,67 Z" /><path d="M57,68 L66,70 L57,73 L60,70 Z" /><path d="M76,62 L85,65 L76,68 L79,65 Z" /></g>
      <g className="cq-supercarrier-island"><path d="M82,60 L87,39 L103,43 L106,70 L91,72 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" /><path d="M89,50h10M88,57h11" stroke={palette.bright} strokeWidth="1.4" /></g>
      <g className="cq-supercarrier-mast"><line x1="94" y1="41" x2="94" y2="22" stroke={P.metal.iron} strokeWidth="2" /><path d="M95,24 L110,29 L95,34 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth=".6" /></g>
      <Banner x={110} y={28} palette={palette} scale={.48} />
    </SpriteFrame>
  );
}

export function GreatGeneralSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <g className="cq-general-standard"><line x1="37" y1="27" x2="37" y2="93" stroke={P.wood.dark} strokeWidth="2.4" /><path d="M38,29 H61 L53,37 L61,45 H38 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth=".7" /><circle cx="37" cy="25" r="3" fill={P.metal.gold} stroke={P.ink.line} strokeWidth=".5" /></g>
      <g className="cq-general-body">
        <g className="cq-general-leg-l"><path d="M56,82 L63,82 L61,103 L53,103 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth=".8" /><ellipse cx="56" cy="103" rx="5" ry="2.5" fill={P.wood.dark} /></g>
        <g className="cq-general-leg-r"><path d="M65,82 L72,82 L77,101 L68,103 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth=".8" /><ellipse cx="73" cy="103" rx="5" ry="2.5" fill={P.wood.dark} /></g>
        <path d="M64,56 Q77,58 77,80 L72,88 L55,88 L50,80 Q50,58 64,56 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" /><path d="M53,74h22" stroke={palette.mid} strokeWidth="2.4" /><circle cx="64" cy="51" r="9" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="1" /><path d="M55,51 Q56,39 64,39 Q73,39 74,51 L71,54 L57,54 Z" fill={P.ink.soft} />
        <g className="cq-general-arm-l"><path d="M54,65 Q46,69 48,76 Q52,82 57,79" fill="none" stroke={P.ink.line} strokeWidth="8" strokeLinecap="round" /><path d="M54,65 Q46,69 48,76 Q52,82 57,79" fill="none" stroke={P.cloth.linen} strokeWidth="5.5" strokeLinecap="round" /><circle cx="57" cy="79" r="2.7" fill={P.skin.warm} stroke={P.ink.line} strokeWidth=".5" /></g>
        <g className="cq-general-arm-r"><path d="M74,65 Q82,69 80,76 Q76,82 71,79" fill="none" stroke={P.ink.line} strokeWidth="8" strokeLinecap="round" /><path d="M74,65 Q82,69 80,76 Q76,82 71,79" fill="none" stroke={P.cloth.linen} strokeWidth="5.5" strokeLinecap="round" /><circle cx="71" cy="79" r="2.7" fill={P.skin.warm} stroke={P.ink.line} strokeWidth=".5" /></g>
        <g className="cq-general-map"><path d="M52,76 L64,72 L76,76 L76,87 L64,83 L52,87 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" /><path d="M60,74v10M68,74v10" stroke={palette.mid} strokeWidth="1.1" /></g>
      </g>
      <Banner x={30} y={25} palette={palette} scale={.42} />
    </SpriteFrame>
  );
}

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
      {/* PICKAXE over the right shoulder — .cq-tool digs down on the work action,
         grip pivot at (82,30). NOT .cq-weapon: civilians never do a combat swing. */}
      <g transform="translate(82 30) rotate(28)">
        <g className="cq-tool" style="transform-origin: 82px 30px; transform-box: view-box;">
          <rect x="-1" y="0" width="2.4" height="46" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M-5,46 L5,46 L4,58 L-4,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        </g>
      </g>
      {/* dirt mound where the pick strikes; dust kicked up on the work action (.cq-work-dust) */}
      <rect x="58" y="74" width="8" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <g className="cq-work-dust">
        <ellipse cx="62" cy="76" rx="6" ry="2.6" fill={P.ground.dirt} />
      </g>
    </SpriteFrame>
  );
}

// #594 MR7: replaces the WorkerSprite-reuse placeholder. Robed civilian carrying a
// scripture book (distinct silhouette from WorkerSprite's tool-carrying pose) --
// accent flows through palette.mid per the FactionPalette contract, not a fixed color,
// so the sash reads as "belongs to your civ" the same way SettlerSprite's banner does.
export function MissionarySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.linen} pants={P.cloth.linen} accent={palette.mid} hair={P.ink.soft}
        hat={<path d="M-8,-40 Q0,-46 8,-40 L8,-36 Q0,-39 -8,-36 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />}
      />
      <g transform="translate(80 60) rotate(-8)">
        <rect x="-8" y="-6" width="16" height="12" rx="1" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="0" y1="-6" x2="0" y2="6" stroke={P.metal.gold} strokeWidth="1" />
        <line x1="-6" y1="-3" x2="-1" y2="-3" stroke={P.metal.gold} strokeWidth="0.6" />
        <line x1="1" y1="-3" x2="6" y2="-3" stroke={P.metal.gold} strokeWidth="0.6" />
        <line x1="-6" y1="1" x2="-1" y2="1" stroke={P.metal.gold} strokeWidth="0.6" />
        <line x1="1" y1="1" x2="6" y2="1" stroke={P.metal.gold} strokeWidth="0.6" />
      </g>
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

// #708: handler and hound are a command/support silhouette, not an armored war hound.
export function BeastHandlerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={66} cy={98} rx={42} />
      <g transform="translate(70 78)">
        <path d="M-21,-5 Q1,-21 24,-8 Q34,0 26,12 Q0,20 -23,9 Z" fill="#7b5737" stroke={P.ink.line} strokeWidth="1.1" />
        <path d="M-15,-4 Q0,-12 18,-5" stroke={palette.mid} strokeWidth="3.8" fill="none" />
        <rect x="-18" y="7" width="7" height="16" fill="#4a3020" /><rect x="-3" y="8" width="7" height="16" fill="#4a3020" /><rect x="13" y="7" width="7" height="16" fill="#4a3020" /><rect x="24" y="5" width="7" height="16" fill="#4a3020" />
        <path d="M-20,-4 Q-33,-14 -38,-25" stroke={P.wood.dark} strokeWidth="4" fill="none" strokeLinecap="round" />
        <path d="M23,-12 Q36,-23 45,-9 L42,5 L29,8 L21,1 Z" fill="#8a5a3c" stroke={P.ink.line} strokeWidth="0.9" /><path d="M27,-13 L31,-25 L37,-13 M36,-14 L43,-22 L42,-8" stroke={P.wood.dark} strokeWidth="1.8" fill="none" /><circle cx="37" cy="-5" r="1.4" fill={palette.bright} /><path d="M42,1 L50,4 L42,5 Z" fill={P.ink.soft} />
      </g>
      <Humanoid cx={35} cy={70} scale={0.75} cloth={P.cloth.linen} pants={P.cloth.wool} accent={palette.mid} hair={P.ink.soft} />
      <line x1="47" y1="42" x2="47" y2="94" stroke={P.wood.dark} strokeWidth="2.8" strokeLinecap="round" /><path d="M47,43 L40,35 M47,43 L54,35" stroke={P.metal.bronze} strokeWidth="1.8" /><path d="M48,75 Q60,88 71,78" stroke={palette.bright} strokeWidth="1.8" fill="none" /><circle cx="62" cy="80" r="5" fill="none" stroke={palette.bright} strokeWidth="1.2" /><path d="M56,80h12M62,74v12" stroke={palette.trim} strokeWidth="0.9" />
    </SpriteFrame>
  );
}

// #708: broad tusks, howdah, and rider make the heavy shock role readable at map scale.
export function WarElephantSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={65} cy={100} rx={46} ry={8} />
      <g transform="translate(58 75)">
        <path d="M-30,-5 Q-3,-27 31,-13 Q43,-4 33,18 Q3,31 -31,15 Z" fill="#8a8b80" stroke={P.ink.line} strokeWidth="1.25" /><path d="M-22,-9 Q2,-22 29,-10 L27,2 Q2,9 -25,1 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" /><path d="M-18,-5 Q3,-15 24,-7" stroke={palette.bright} strokeWidth="1.6" fill="none" />
        <rect x="-9" y="-30" width="29" height="20" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" /><rect x="-6" y="-27" width="23" height="4" fill={palette.mid} /><circle cx="0" cy="-34" r="3" fill={P.skin.deep} /><circle cx="10" cy="-34" r="3" fill={P.skin.warm} />
        <rect x="-25" y="13" width="10" height="22" rx="2" fill="#68695f" /><rect x="-8" y="14" width="10" height="22" rx="2" fill="#68695f" /><rect x="14" y="14" width="10" height="22" rx="2" fill="#68695f" /><rect x="27" y="13" width="10" height="22" rx="2" fill="#68695f" />
        <path d="M33,-23 Q11,-25 11,-6 Q14,9 30,7 Z" fill="#73746d" stroke={P.ink.line} strokeWidth="0.8" /><ellipse cx="33" cy="-5" rx="16" ry="15" fill="#8a8b80" stroke={P.ink.line} strokeWidth="1" /><path d="M37,-12 L48,-21 L51,-5 Z" fill="#68695f" /><path d="M37,-8 L51,-12 L55,-2 L38,2 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" /><path d="M46,1 Q60,12 53,27" stroke="#68695f" strokeWidth="8" fill="none" strokeLinecap="round" /><path d="M42,7 Q58,8 61,19 M48,4 Q64,2 68,12" stroke={P.cloth.linen} strokeWidth="3" fill="none" strokeLinecap="round" />
      </g>
      <g transform="translate(76 34)"><line x1="0" y1="0" x2="0" y2="39" stroke={P.wood.dark} strokeWidth="2.2" /><path d="M0,2 L18,8 L0,16 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="8" cy="9" r="2.3" fill={palette.bright} /></g>
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
      <Humanoid cx={64} cy={70} scale={1} cloth={palette.mid} pants={P.cloth.wool} accent={palette.bright} hair="#3a2a1a"
        hat={<path d="M-10,-38 Q0,-48 10,-38 L8,-32 L-8,-32 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />}
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

// #769 de-alias: frigate previously reused TriremeSprite verbatim. Frigate is an
// era-6 age-of-sail warship — three-masted, square-rigged, with a painted gunport
// stripe and cannon along the hull and a bowsprit at the bow, so it reads as a real
// sailing warship rather than an ancient oared galley.
export function FrigateSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={100} rx={48} ry={7} />
        {/* BOWSPRIT — spar projecting forward from the bow (left); a jib sail
            rides it. A silhouette element the Trireme does not have. */}
        <line x1="18" y1="84" x2="-2" y2="70" stroke={P.wood.dark} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="1" y1="70" x2="40" y2="26" stroke={P.wood.dark} strokeWidth="0.8" opacity="0.7" />
        <path className="cq-sail" d="M2,71 L28,50 L15,79 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.8" />
        {/* HULL — a real sailing hull, no oar rows / oar blades */}
        <path d="M14,86 Q64,78 114,84 Q112,104 64,106 Q18,104 14,86 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M20,82 Q64,76 110,82 L106,92 Q64,97 24,92 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M18,90 Q64,96 110,90" fill="none" stroke={P.wood.dark} strokeWidth="1" opacity="0.6" />
        {/* painted GUNPORT STRIPE — faction-accent band */}
        <rect x="24" y="83.5" width="84" height="6" fill={palette.mid} opacity="0.9" />
        {/* gunports — alternating dark squares */}
        <rect x="30" y="84" width="5" height="5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="42" y="84" width="5" height="5" fill={P.ink.line} />
        <rect x="54" y="84" width="5" height="5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="66" y="84" width="5" height="5" fill={P.ink.line} />
        <rect x="78" y="84" width="5" height="5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="90" y="84" width="5" height="5" fill={P.ink.line} />
        {/* cannon barrel tips (iron) poking through the ports */}
        <rect x="33" y="88.6" width="4" height="2.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="49" y="88.9" width="4" height="2.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="65" y="89" width="4" height="2.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="81" y="88.9" width="4" height="2.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="97" y="88.6" width="4" height="2.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        {/* THREE MASTS — fore, main (tallest), mizzen */}
        <line x1="40" y1="82" x2="40" y2="24" stroke={P.wood.dark} strokeWidth="2.2" />
        <line x1="64" y1="82" x2="64" y2="12" stroke={P.wood.dark} strokeWidth="2.5" />
        <line x1="88" y1="80" x2="88" y2="30" stroke={P.wood.dark} strokeWidth="2" />
        {/* yards */}
        <line x1="28" y1="30" x2="52" y2="30" stroke={P.wood.dark} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="49" y1="20" x2="79" y2="20" stroke={P.wood.dark} strokeWidth="1.8" strokeLinecap="round" />
        <line x1="78" y1="38" x2="98" y2="38" stroke={P.wood.dark} strokeWidth="1.5" strokeLinecap="round" />
        {/* SQUARE-RIGGED SAILS — cq-sail billow, mainmast tallest */}
        <path className="cq-sail" d="M28,31 Q40,34 52,31 L50,58 Q40,61 30,58 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path className="cq-sail" d="M49,21 Q64,26 79,21 L76,62 Q64,66 52,62 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path className="cq-sail" d="M78,39 Q88,41 98,39 L96,60 Q88,63 80,60 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        {/* faction reef-band across the mainsail */}
        <path d="M51,40 Q64,44 77,40 L76,50 Q64,54 52,50 Z" fill={palette.mid} opacity="0.85" />
        {/* raised QUARTERDECK at the stern (right) */}
        <path d="M97,72 L116,74 L114,84 L99,82 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M97,72 L116,74 L116,76 L97,74 Z" fill={P.wood.mid} />
        <line x1="99" y1="74" x2="114" y2="76" stroke={P.ink.soft} strokeWidth="0.6" opacity="0.5" />
        {/* faction Banner mounted on the quarterdeck */}
        <Banner x={101} y={72} palette={palette} scale={0.8} />
        {/* stern ENSIGN — spanker gaff off the mizzen, palette.trim, cq-cape flutter */}
        <line x1="88" y1="34" x2="104" y2="44" stroke={P.wood.dark} strokeWidth="1.2" />
        <path className="cq-cape" d="M88,40 L104,44 L102,52 L88,49 Z" fill={palette.trim} stroke={palette.dark} strokeWidth="0.6" />
        {/* bronze cathead at the prow (left) */}
        <path d="M14,88 L4,92 L14,95 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      </g>
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

/* === TRADE ROUTES OVERHAUL (#553 MR1/4) — NAVAL TRADER LINE (Eras 5-11) === */
/* Civilian trade hulls — no gunports, no combat rigging. Visible cargo (barrels,
   crates, containers) distinguishes them at a glance from the naval combat line above. */

export function NavalTraderSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={97} rx={42} ry={7} />
        {/* HULL — modest wooden merchantman */}
        <path d="M16,84 Q64,76 112,84 Q106,102 64,105 Q22,102 16,84 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M22,80 Q64,74 106,80 L100,90 Q64,95 28,90 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M28,77 Q64,72 100,77 L96,82 L32,82 Z" fill={P.wood.light} />
        <path d="M20,88 Q64,94 108,88" fill="none" stroke={P.wood.dark} strokeWidth="1.1" opacity="0.7" />
        <line x1="30" y1="76" x2="98" y2="76" stroke={P.wood.dark} strokeWidth="1" opacity="0.5" />
        {/* small aft cabin (stern, right) — no gun ports */}
        <path d="M88,64 L108,64 L106,80 L90,80 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M88,64 L108,64 L108,67 L88,67 Z" fill={P.wood.mid} />
        <rect x="94" y="70" width="6" height="8" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
        {/* MAST + yard */}
        <line x1="58" y1="80" x2="58" y2="20" stroke={P.wood.dark} strokeWidth="2.4" />
        <line x1="36" y1="28" x2="80" y2="28" stroke={P.wood.dark} strokeWidth="1.8" strokeLinecap="round" />
        {/* single large SQUARE SAIL */}
        <path className="cq-sail" d="M37,29 Q58,33 81,29 L78,68 Q58,72 40,68 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M35,45 Q58,49 83,45 L81,58 Q58,62 37,58 Z" fill={palette.mid} opacity="0.9" />
        <circle cx="58.5" cy="51" r="5" fill={palette.trim} stroke={palette.dark} strokeWidth="0.6" />
        <Banner x={58} y={20} palette={palette} scale={0.6} />
        {/* cargo barrels on aft deck — reads "trade ship" at a glance */}
        <g transform="translate(78 90)">
          <rect x="-5" y="-8" width="10" height="14" rx="3" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="0" cy="-8" rx="5" ry="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
          <line x1="-5" y1="-3" x2="5" y2="-3" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
          <line x1="-5" y1="1" x2="5" y2="1" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
        </g>
        <g transform="translate(70 93) scale(0.82)">
          <rect x="-5" y="-8" width="10" height="14" rx="3" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="0" cy="-8" rx="5" ry="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
          <line x1="-5" y1="-3" x2="5" y2="-3" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
        </g>
        {/* crates near bow */}
        <g transform="translate(38 92)">
          <rect x="-6" y="-8" width="12" height="9" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.7" />
          <path d="M-6,-8 L0,-4 L6,-8 M-6,1 L0,-3 L6,1" stroke={P.ink.line} strokeWidth="0.4" opacity="0.6" />
        </g>
        {/* bow figurehead — carved mermaid, torso fused against the stem */}
        <g transform="translate(20 76) rotate(8)">
          <path d="M-2.6,-13.6 Q-8,-11 -8,-5 Q-7.6,-2 -5.6,-0.4" fill="none" stroke={P.wood.dark} strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
          <path d="M-2.6,-13.4 C-4.4,-10.6 -4.6,-6.6 -3,-2.6 C-2,0 0.4,1 2,-0.8 C3,-2.4 3,-6.6 1.8,-10 C1.2,-12 -0.6,-14.4 -2.6,-13.4 Z" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.7" />
          <path d="M-2.2,-9 Q-4.2,-6 -3,-1.6" fill="none" stroke={P.wood.mid} strokeWidth="0.8" strokeLinecap="round" />
          <path d="M2,-0.8 C4.4,1 8,1.6 10.6,4.6 C7.6,3.6 5.4,4 4,6 C6.4,6.4 8.6,8.6 10,12 C5.6,10 2.4,7 0,4 C-1.6,2 -1,0.4 2,-0.8 Z" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.7" />
          <path d="M2.4,1.6 Q4.6,3.4 4.4,6" fill="none" stroke={P.skin.deep} strokeWidth="0.5" opacity="0.7" />
          <circle cx="-1.4" cy="-16" r="3" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M-4,-18 Q-1.4,-21.4 1.4,-18.4 Q0.4,-16.6 -1.4,-16.4 Q-3,-16.6 -4,-18 Z" fill={P.wood.dark} />
          <circle cx="-2" cy="-16.2" r="0.45" fill={P.ink.line} />
        </g>
      </g>
    </SpriteFrame>
  );
}

export function SteamshipTraderSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={99} rx={44} ry={7} />
        {/* HULL — iron/steel, flat-topped, no gunports */}
        <path d="M22,82 L114,82 Q118,97 108,102 L28,102 Q10,100 10,90 Q10,84 22,82 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M26,82 L108,82 L104,88 L22,88 Q17,86 18,83 Q21,82 26,82 Z" fill={P.metal.steel} />
        <rect x="24" y="83" width="88" height="2.4" fill={P.metal.shine} opacity="0.55" />
        <circle cx="30" cy="93" r="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="46" cy="94" r="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="62" cy="94.5" r="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="78" cy="94" r="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="94" cy="93" r="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
        {/* cargo hatches, clear of the funnel base */}
        <rect x="27" y="74" width="16" height="8" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <rect x="70" y="74" width="16" height="8" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <path d="M27,74 L43,74 M70,74 L86,74" stroke={P.ink.line} strokeWidth="0.4" opacity="0.5" />
        {/* FUNNEL — base flush with the deck, centered on the beam */}
        <rect x="52" y="42" width="12" height="41" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="51" y="42" width="14" height="3" fill={P.metal.bronze} />
        <rect x="53.5" y="52" width="9" height="1.8" fill={P.ink.soft} opacity="0.6" />
        <g transform="translate(58 40)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="5" ry="4" fill={P.stone.light} opacity="0.6" />
          <ellipse className="cq-smoke cq-smoke--b" cx="2.5" cy="-2" rx="6" ry="5" fill={P.stone.mid} opacity="0.4" />
          <ellipse className="cq-smoke cq-smoke--c" cx="-2" cy="-1" rx="4" ry="3.4" fill={P.stone.light} opacity="0.5" />
        </g>
        {/* small aft mast + faction banner — no separate signal flag (avoids a redundant
            second pennant at the same anchor point) */}
        <line x1="88" y1="82" x2="88" y2="48" stroke={P.wood.dark} strokeWidth="2" />
        <Banner x={88} y={48} palette={palette} scale={0.6} />
        {/* riveted bow plate, flush with the hull curve (no jutting point) */}
        <path d="M11,86 Q10,97 20,102" fill="none" stroke={P.ink.line} strokeWidth="1" opacity="0.55" />
        <circle cx="13" cy="90" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="14.6" cy="96" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
    </SpriteFrame>
  );
}

export function CargoFreighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={100} rx={48} ry={7} />
        {/* HULL — long, boxy steel */}
        <path d="M20,80 L118,80 Q122,96 110,102 L26,102 Q8,99 8,88 Q8,82 20,80 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M24,80 L112,80 L108,86 L20,86 Q16,84 17,81 Q19,80 24,80 Z" fill={P.metal.iron} />
        <rect x="22" y="81" width="90" height="2.4" fill={P.metal.shine} opacity="0.5" />
        <rect x="20" y="90" width="98" height="3" fill={P.metal.iron} opacity="0.6" />
        <circle cx="30" cy="96" r="1.8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="46" cy="97" r="1.8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="64" cy="97.5" r="1.8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="82" cy="97" r="1.8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="98" cy="96" r="1.8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        {/* cargo crates, mixed tones */}
        <rect x="26" y="70" width="14" height="10" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <rect x="41" y="72" width="12" height="8" rx="1" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.7" />
        <rect x="92" y="71" width="14" height="9" rx="1" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <rect x="26" y="60" width="12" height="9" rx="1" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.7" />
        {/* cargo derricks — swing with the sail-billow animation class */}
        <g transform="translate(60 80)">
          <line x1="0" y1="0" x2="0" y2="-34" stroke={P.metal.iron} strokeWidth="2.2" />
          <path className="cq-sail" d="M0,-32 L20,-10" fill="none" stroke={P.metal.iron} strokeWidth="2" />
          <line x1="0" y1="-34" x2="-6" y2="-28" stroke={P.metal.iron} strokeWidth="1.4" />
        </g>
        <g transform="translate(78 80)">
          <line x1="0" y1="0" x2="0" y2="-30" stroke={P.metal.iron} strokeWidth="2.2" />
          <path className="cq-sail" d="M0,-28 L-18,-8" fill="none" stroke={P.metal.iron} strokeWidth="2" />
          <line x1="0" y1="-30" x2="6" y2="-25" stroke={P.metal.iron} strokeWidth="1.4" />
        </g>
        {/* FUNNEL */}
        <rect x="98" y="46" width="13" height="34" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="97" y="46" width="15" height="3" fill={P.metal.bronze} />
        <g transform="translate(104.5 44)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="5" ry="4" fill={P.stone.light} opacity="0.6" />
          <ellipse className="cq-smoke cq-smoke--b" cx="2.5" cy="-2" rx="6" ry="5" fill={P.stone.mid} opacity="0.4" />
          <ellipse className="cq-smoke cq-smoke--c" cx="-2" cy="-1" rx="4" ry="3.4" fill={P.stone.light} opacity="0.5" />
        </g>
        {/* signal mast + faction banner */}
        <line x1="30" y1="80" x2="30" y2="52" stroke={P.wood.dark} strokeWidth="2" />
        <Banner x={30} y={52} palette={palette} scale={0.65} />
        {/* riveted bow plate, flush with hull curve */}
        <path d="M9,86 Q8,96 20,102" fill="none" stroke={P.ink.line} strokeWidth="1" opacity="0.5" />
        <circle cx="11" cy="89" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="12.6" cy="96" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
    </SpriteFrame>
  );
}

export function ContainerShipSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={103} rx={52} ry={7} />
        {/* HULL — long, low, wide; cleanest silhouette of the four tiers */}
        <path d="M12,88 L120,88 Q124,99 114,104 L20,104 Q4,101 6,93 Q7,89 12,88 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
        <rect x="14" y="89" width="98" height="2" fill={P.metal.shine} opacity="0.5" />
        <rect x="10" y="97" width="106" height="3" fill={P.metal.iron} opacity="0.6" />
        {/* bottom row of containers — mostly neutral tones, one faction-colored */}
        <rect x="14" y="76" width="14" height="11" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="29" y="76" width="14" height="11" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="44" y="76" width="14" height="11" fill={palette.mid} stroke={palette.dark} strokeWidth="0.8" />
        <rect x="59" y="76" width="14" height="11" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="74" y="76" width="14" height="11" fill={P.hud.mil} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="89" y="76" width="8" height="11" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
        {/* top row, offset for stacking depth */}
        <rect x="20" y="64" width="14" height="11" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="35" y="64" width="14" height="11" fill={palette.trim} stroke={palette.dark} strokeWidth="0.8" />
        <rect x="50" y="64" width="14" height="11" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="65" y="64" width="14" height="11" fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M14,81.5 L97,81.5 M20,69.5 L79,69.5" stroke={P.ink.line} strokeWidth="0.35" opacity="0.35" />
        {/* forward bridge / superstructure */}
        <path d="M98,50 L116,50 L116,88 L98,88 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <path d="M98,50 L116,50 L116,53 L98,53 Z" fill={P.metal.steel} />
        <rect x="101" y="58" width="4" height="4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="108" y="58" width="4" height="4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="101" y="66" width="4" height="4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
        <rect x="108" y="66" width="4" height="4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
        {/* faction banner atop bridge */}
        <Banner x={107} y={50} palette={palette} scale={0.6} />
        {/* riveted bow, flush, no jutting point */}
        <path d="M7,90 Q6,99 20,104" fill="none" stroke={P.ink.line} strokeWidth="1" opacity="0.5" />
        <circle cx="9" cy="93" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="10.6" cy="99" r="1.4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.4" />
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

export function SpyIntelligenceOfficerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#141419',
    hat: <path d="M-12,-40 Q0,-45 12,-40 L12,-31 L-12,-31 Z M-14,-31 L14,-31 L14,-29 L-14,-29 Z" fill="#0a0a10" />,
    gadget: (
      <g transform="translate(82 58)">
        <rect x="-5" y="-6" width="10" height="8" rx="0.5" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
        <line x1="-3" y1="-3" x2="3" y2="-3" stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="-3" y1="0" x2="3" y2="0" stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="4" cy="4" r="1.6" fill={palette.bright} stroke={palette.dark} strokeWidth="0.4" />
      </g>
    ),
  });
}

export function SpyStationChiefSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    svgOnly,
    cloak: '#101014',
    hat: <path d="M-12,-41 Q0,-47 12,-41 L12,-30 L-12,-30 Z M-15,-30 L15,-30 L15,-28 L-15,-28 Z" fill="#0a0a10" />,
    gadget: (
      <g transform="translate(81 57)">
        <rect x="-6" y="-7" width="12" height="10" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-6" y="-7" width="12" height="3" fill={palette.bright} opacity="0.7" />
        <circle cx="0" cy="1" r="1.4" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
    ),
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

// #769 de-alias: cyber_unit previously reused SpyHackerSprite verbatim. It is a distinct
// unit type — a non-combat economic saboteur (strength 0, capturable) that drains gold from
// ADJACENT cities from range, so it reads as a STANDING technical specialist with a portable
// field laptop (glowing screen, backpack radio + antenna) rather than SpyHacker's cloaked infiltrator.
export function CyberUnitSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const screen = '#00c8ff';
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint="#10202c">
      <g data-kind="civilian">
        <Shadow cx={62} cy={100} rx={22} ry={5} />
        {/* backpack field radio + antenna (the "kit" that makes it a cyber operative) */}
        <g transform="translate(40 66)">
          <rect x="-8" y="-8" width="14" height="22" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <rect x="-8" y="-8" width="14" height="4" fill={P.metal.steel} />
          <rect x="-6" y="1" width="10" height="3" fill={palette.mid} />
          <line x1="4" y1="-8" x2="10" y2="-30" stroke={P.metal.steel} strokeWidth="1.4" />
          <circle cx="10" cy="-31" r="2.2" fill={palette.bright} className="cq-glow" />
        </g>
        {/* STANDING operative, hunched over a rugged field laptop — bespectacled "army nerd" */}
        <Humanoid cx={60} cy={80} scale={0.95} cloth={palette.mid} pants="#454b38" accent={palette.dark} skin={P.skin.warm} hair="#2a1a0a"
          hat={
            <g>
              <path d="M-9,-33 Q-9,-39 0,-39 Q9,-39 9,-33 L9,-31 L-9,-31 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" />
              <path d="M-9,-31 L-15,-30 L-9,-28 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.5" />
              {/* glasses — the "nerd" tell */}
              <g stroke={P.metal.iron} strokeWidth="0.8" fill="none">
                <rect x="-6" y="-25.5" width="4.6" height="3.4" rx="0.8" />
                <rect x="1.4" y="-25.5" width="4.6" height="3.4" rx="0.8" />
                <line x1="-1.4" y1="-24" x2="1.4" y2="-24" />
              </g>
            </g>
          }
        />
        {/* both arms bent forward, cradling the laptop */}
        <path d="M50,73 Q56,80 63,82" fill="none" stroke={palette.mid} strokeWidth="5" strokeLinecap="round" />
        <path d="M74,73 Q70,80 66,82" fill="none" stroke={palette.mid} strokeWidth="5" strokeLinecap="round" />
        {/* rugged portable laptop with a glowing screen */}
        <g transform="translate(64 82)">
          <path d="M-16,4 L16,4 L20,10 L-20,10 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <rect x="-15" y="5.5" width="30" height="2.6" fill={P.stone.dark} />
          <g transform="rotate(-13 -14 4)">
            <rect x="-16" y="-14" width="30" height="18" rx="1.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
            <g className="cq-glow"><rect x="-13" y="-11" width="24" height="12" rx="1" fill={screen} opacity="0.9" /></g>
            <line x1="-10" y1="-8" x2="6" y2="-8" stroke="#06303f" strokeWidth="1" />
            <line x1="-10" y1="-5" x2="2" y2="-5" stroke="#06303f" strokeWidth="1" />
            <line x1="-10" y1="-2" x2="8" y2="-2" stroke="#06303f" strokeWidth="1" />
          </g>
          {/* team status LED */}
          <circle cx="17" cy="7" r="1.4" fill={palette.bright} className="cq-glow" />
        </g>
        {/* cable from the laptop to the backpack radio */}
        <path d="M48,86 Q42,82 44,72" fill="none" stroke={P.ink.soft} strokeWidth="1.6" />
        {/* hands on the device */}
        <circle cx="52" cy="83" r="2.4" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="76" cy="83" r="2.4" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
    </SpriteFrame>
  );
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

// #708 de-alias: chariot previously reused HorsemanSprite verbatim. A chariot is a
// two-wheeled cart with a STANDING driver pulled by a harnessed horse — the pair of
// large spoked wheels is the silhouette differentiator from a single mounted rider.
export function ChariotSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="melee">
        <Shadow cx={58} cy={99} rx={46} ry={7} />
        {/* HORSE in harness — head to the right, pulling the cart (no rider on its back) */}
        <g transform="translate(88 76)">
          <rect x="-13" y="4" width="5" height="18" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="9" y="4" width="5" height="18" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
          <ellipse cx="0" cy="0" rx="25" ry="12" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
          <ellipse cx="-1" cy="-3" rx="23" ry="8" fill="#b88a5a" />
          <rect x="-18" y="4" width="5" height="18" fill="#8a6a44" stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="14" y="4" width="5" height="18" fill="#8a6a44" stroke={P.ink.line} strokeWidth="0.6" />
          <ellipse cx="-15.5" cy="22.5" rx="3.2" ry="1.8" fill="#5e3f24" stroke={P.ink.line} strokeWidth="0.4" />
          <ellipse cx="16.5" cy="22.5" rx="3.2" ry="1.8" fill="#5e3f24" stroke={P.ink.line} strokeWidth="0.4" />
          <path d="M-24,-6 Q-33,-3 -30,8" fill="none" stroke="#7a5a3a" strokeWidth="3" strokeLinecap="round" />
          <path d="M16,-6 Q26,-16 29,-24 L35,-21 Q33,-9 24,-2 Z" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
          <path d="M28,-25 Q39,-25 41,-17 Q41,-13 35,-12 L28,-14 Z" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
          <ellipse cx="40" cy="-15" rx="4" ry="3.2" fill="#b88a5a" stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M29,-24 L30,-31 L33,-24 Z" fill="#8a6a44" stroke={P.ink.line} strokeWidth="0.5" />
          <path d="M19,-8 Q26,-20 30,-26 L32,-24 Q27,-15 23,-5 Z" fill="#7a5a3a" />
          <circle cx="36" cy="-18" r="0.8" fill={P.ink.line} />
          {/* leather harness collar — marks this as a draft horse, not a mount */}
          <path d="M21,-8 Q29,-14 29,-22" fill="none" stroke={P.wood.dark} strokeWidth="2.2" strokeLinecap="round" />
          <path d="M19,-1 Q27,-5 29,-13" fill="none" stroke={P.wood.dark} strokeWidth="2" strokeLinecap="round" />
        </g>
        {/* TRACES + draft pole from the harness back to the cart */}
        <line x1="52" y1="72" x2="74" y2="72" stroke={P.wood.mid} strokeWidth="2.2" strokeLinecap="round" />
        <line x1="54" y1="66" x2="72" y2="64" stroke={P.wood.dark} strokeWidth="1.6" strokeLinecap="round" />
        <line x1="54" y1="78" x2="72" y2="80" stroke={P.wood.dark} strokeWidth="1.6" strokeLinecap="round" />
        {/* axle + far wheel (behind the bed, smaller + darker) */}
        <rect x="26" y="80" width="34" height="3" fill={P.wood.dark} />
        <g transform="translate(34 84)">
          <circle r="13" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
          <circle r="13" fill="none" stroke={P.wood.mid} strokeWidth="1.4" />
          <g className="cq-wheel" style="animation-duration:3s">
            <line x1="-13" y1="0" x2="13" y2="0" stroke={P.wood.mid} strokeWidth="1" />
            <line x1="0" y1="-13" x2="0" y2="13" stroke={P.wood.mid} strokeWidth="1" />
            <line x1="-9.2" y1="-9.2" x2="9.2" y2="9.2" stroke={P.wood.mid} strokeWidth="1" />
            <line x1="-9.2" y1="9.2" x2="9.2" y2="-9.2" stroke={P.wood.mid} strokeWidth="1" />
          </g>
          <circle r="2.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        {/* DRIVER standing in the bed — legs occluded by the basket drawn next */}
        <Humanoid cx={40} cy={52} scale={0.62} cloth={palette.mid} pants={P.cloth.wool} accent={palette.dark} skin={P.skin.warm} hair="#3a2a1a"
          hat={<path d="M-9,-34 Q0,-40 9,-34 L9,-30 L-9,-30 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.5" />}
        />
        {/* CART BED — geometric basket, wood + bronze trim + curved front hoop */}
        <path d="M20,58 L52,58 Q57,58 57,64 L57,74 Q57,80 51,80 L26,80 Q20,80 20,74 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M20,58 L52,58 Q57,58 57,64 L57,66 L20,66 Z" fill={P.wood.light} />
        <line x1="23" y1="70" x2="54" y2="70" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
        <line x1="23" y1="74" x2="52" y2="74" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
        <rect x="20" y="57" width="37" height="2.6" fill={P.metal.bronze} />
        <path d="M55,58 Q64,54 61,44" fill="none" stroke={P.wood.dark} strokeWidth="2.4" strokeLinecap="round" />
        {/* small round shield on the cart front — team color */}
        <g transform="translate(54 68)">
          <circle r="7" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
          <circle r="7" fill="none" stroke={palette.dark} strokeWidth="1.4" />
          <circle r="1.8" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
        </g>
        {/* near wheel (front, large) — the key silhouette differentiator vs a mounted rider */}
        <g transform="translate(48 84)">
          <circle r="15" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.5" />
          <circle r="15" fill="none" stroke={P.wood.dark} strokeWidth="1.6" />
          <g className="cq-wheel" style="animation-duration:3s">
            <line x1="-15" y1="0" x2="15" y2="0" stroke={P.wood.dark} strokeWidth="1.4" />
            <line x1="0" y1="-15" x2="0" y2="15" stroke={P.wood.dark} strokeWidth="1.4" />
            <line x1="-10.6" y1="-10.6" x2="10.6" y2="10.6" stroke={P.wood.dark} strokeWidth="1.4" />
            <line x1="-10.6" y1="10.6" x2="10.6" y2="-10.6" stroke={P.wood.dark} strokeWidth="1.4" />
          </g>
          <circle r="3.4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <circle r="1.4" fill={P.metal.steel} />
        </g>
        {/* spear raised forward over the team */}
        <g transform="translate(50 54) rotate(30)">
          <g className="cq-weapon" style="transform-origin: 50px 54px; transform-box: view-box;">
            <rect x="-1" y="-30" width="2" height="58" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
            <path d="M-3,-30 L3,-30 L4,-40 L0,-46 L-4,-40 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
            <rect x="-3" y="-31" width="6" height="2" fill={P.metal.gold} />
          </g>
        </g>
        <Banner x={20} y={44} palette={palette} scale={0.62} />
      </g>
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

// #708: an early-modern breastplate and sabre distinguish Cuirassier from the lance-bearing Knight.
export function CuirassierSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={98} rx={37} />
      <g transform="translate(58 80)">
        <path d="M-28,-4 Q-3,-24 28,-11 Q42,-1 31,16 Q2,27 -30,12 Z" fill="#5e3f24" stroke={P.ink.line} strokeWidth="1.1" /><path d="M-18,-12 Q1,-20 24,-10 L21,-2 Q2,4 -20,-3 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" /><path d="M-14,-8 Q2,-14 19,-7" stroke={palette.mid} strokeWidth="2" fill="none" />
        <rect x="-23" y="6" width="8" height="19" fill="#3a2010" /><rect x="-7" y="7" width="8" height="19" fill="#3a2010" /><rect x="11" y="6" width="8" height="19" fill="#3a2010" /><rect x="24" y="5" width="8" height="19" fill="#3a2010" />
        <path d="M30,-14 Q42,-28 54,-10 L50,6 L36,8 L28,0 Z" fill="#5a3a1a" stroke={P.ink.line} strokeWidth="0.9" /><path d="M40,-14 L45,-26 L49,-12 M48,-13 L56,-21 L54,-7" stroke="#2a1a10" strokeWidth="2.5" fill="none" /><path d="M46,-8 L60,-11 L63,-2 L49,3 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" /><path d="M20,-7 Q30,-20 39,-25 Q35,-10 45,1" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" /><path d="M-26,-3 Q-39,-12 -43,-27" stroke="#2a1a10" strokeWidth="4.5" fill="none" strokeLinecap="round" /><path d="M-13,-15 L7,-19 L17,-11 L9,-5 L-14,-7 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
      <g transform="translate(62 58)"><path d="M0,-16 Q12,-12 13,9 L8,22 L-10,22 L-13,7 Q-10,-10 0,-16 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" /><path d="M-10,5 L10,5 L8,16 L-8,16 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" /><circle cx="0" cy="-23" r="8" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.8" /><path d="M-10,-25 Q0,-35 10,-25 L8,-17 L-8,-17 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" /><path d="M4,0 L17,1" stroke={P.skin.warm} strokeWidth="2.3" strokeLinecap="round" /></g>
      <g transform="translate(79 59) rotate(-32)"><rect x="-1.3" y="-37" width="2.6" height="37" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.5" /><rect x="-7" y="-2" width="14" height="2.8" fill={P.metal.gold} /><circle cx="0" cy="2" r="2" fill={palette.bright} /></g>
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

// #711: Counterweight siege engine, intentionally tall and open-frame rather than the
// Catapult's low torsion silhouette. Native V2 art owns stateful beam and wheel motion;
// this remains the durable Canvas and unknown-faction fallback.
export function TrebuchetSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={64} cy={102} rx={46} ry={6} />
        <g className="cq-trebuchet-carriage">
          <path d="M18,87 L102,87 L98,97 L23,97 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
          <path d="M24,87 L97,87 L94,91 L27,91 Z" fill={P.wood.mid} />
          {[31, 47, 79, 95].map(x => <g key={x} transform={`translate(${x} 98)`}>
            <circle r="7.5" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
            <g className="cq-trebuchet-wheel">
              <path d="M-6.5,0H6.5 M0,-6.5V6.5 M-4.7,-4.7L4.7,4.7 M4.7,-4.7L-4.7,4.7" stroke={P.metal.iron} strokeWidth="0.8" />
            </g>
            <circle r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          </g>).join('')}
        </g>
        <g className="cq-trebuchet-a-frame">
          <path d="M42,88 L57,43 L72,88 M47,74 H67" fill="none" stroke={P.wood.dark} strokeWidth="4.4" strokeLinecap="round" />
          <path d="M45,88 L59,48 L69,88" fill="none" stroke={P.wood.mid} strokeWidth="1.1" />
          <path d="M45,75 L68,62 M48,86 L70,75" stroke={P.wood.dark} strokeWidth="1.2" opacity="0.75" />
        </g>
        <g className="cq-trebuchet-counterweight">
          <path d="M35,55 L52,52 L51,70 L39,73 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
          <path d="M38,57 L49,55 M39,64 L50,62" stroke={P.stone.dark} strokeWidth="0.8" opacity="0.8" />
          <line x1="45" y1="54" x2="58" y2="48" stroke={P.metal.iron} strokeWidth="1.2" />
        </g>
        <g className="cq-trebuchet-beam" transform="translate(58 48) rotate(-17)">
          <rect x="-29" y="-2.8" width="66" height="5.6" rx="2" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
          <rect x="-28" y="-2.8" width="35" height="1.7" fill={P.wood.light} opacity="0.7" />
          <circle r="4.3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
          <g className="cq-trebuchet-sling">
            <path d="M33,0 Q40,9 43,17 M36,1 Q46,7 52,14" fill="none" stroke={P.cloth.linen} strokeWidth="1.25" />
            <path d="M43,17 Q48,20 53,15 Q48,13 43,17 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.45" />
          </g>
        </g>
        <Banner x={31} y={50} palette={palette} scale={0.52} />
      </g>
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

// #769 de-alias: artillery previously reused CannonSprite verbatim. As a later-era
// siege piece (bombard range 2 vs cannon's shorter reach) it must read as bigger and
// more mechanically complex: larger wheeled carriage, a longer slender barrel angled
// up for indirect fire, a visible elevation screw, and an ammo crate with shells.
export function ArtillerySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={66} cy={100} rx={46} ry={7} />
        {/* trail spade — rear leg of the carriage */}
        <path d="M16,99 L40,86 L44,90 L22,103 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        {/* carriage frame with a team-color band */}
        <path d="M38,78 L94,78 L98,90 L44,90 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="42" y="80" width="54" height="3" fill={palette.mid} />
        {/* rear wheel — large spoked, wood + iron rim */}
        <g transform="translate(52 92)">
          <circle r="16" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.6" />
          <circle r="16" fill="none" stroke={P.metal.iron} strokeWidth="2.4" />
          <g className="cq-wheel" style="animation-duration:3.6s">
            <line x1="-16" y1="0" x2="16" y2="0" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="0" y1="-16" x2="0" y2="16" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="-11.3" y1="-11.3" x2="11.3" y2="11.3" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="-11.3" y1="11.3" x2="11.3" y2="-11.3" stroke={P.wood.mid} strokeWidth="1.4" />
          </g>
          <circle r="3.6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <circle r="1.4" fill={P.metal.steel} />
        </g>
        {/* elevation block + screw — the "more advanced than a muzzle-loader" detail */}
        <rect x="58" y="66" width="14" height="15" rx="2" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="56" y1="82" x2="56" y2="68" stroke={P.metal.steel} strokeWidth="2.2" />
        <circle cx="56" cy="67" r="2.6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        {/* long slender barrel angled up for indirect fire — recoil cylinder + breech */}
        <g transform="translate(66 74) rotate(-30)">
          <rect x="-4" y="-9.5" width="42" height="4" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-8" y="-4.5" width="72" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <rect x="-8" y="-4.5" width="72" height="3.5" rx="3" fill={P.metal.steel} />
          <rect x="-11" y="-6" width="13" height="12" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <circle cx="-4" cy="0" r="2.4" fill={P.ink.soft} />
          <ellipse cx="64" cy="0" rx="4" ry="4.6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="64" cy="0" rx="2" ry="2.6" fill="#111" />
        </g>
        {/* front wheel — drawn over the barrel base for depth */}
        <g transform="translate(86 92)">
          <circle r="16" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.6" />
          <circle r="16" fill="none" stroke={P.metal.iron} strokeWidth="2.4" />
          <g className="cq-wheel" style="animation-duration:3.6s">
            <line x1="-16" y1="0" x2="16" y2="0" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="0" y1="-16" x2="0" y2="16" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="-11.3" y1="-11.3" x2="11.3" y2="11.3" stroke={P.wood.mid} strokeWidth="1.4" />
            <line x1="-11.3" y1="11.3" x2="11.3" y2="-11.3" stroke={P.wood.mid} strokeWidth="1.4" />
          </g>
          <circle r="3.6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <circle r="1.4" fill={P.metal.steel} />
        </g>
        {/* muzzle flash at the barrel tip */}
        <g transform="translate(121 42)"><g className="cq-muzzle-flash"><circle r="6" fill="#ffd966" /><circle r="3" fill="#fff" /></g></g>
        {/* ammunition crate staged behind the gun (left) */}
        <g transform="translate(24 99)">
          <rect x="-9" y="-7" width="18" height="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-9,-3 H9 M0,-7 V3" stroke={P.wood.dark} strokeWidth="0.6" />
          <rect x="-9" y="-7" width="18" height="2.4" fill={P.metal.bronze} opacity="0.7" />
        </g>
        <Banner x={40} y={60} palette={palette} scale={0.62} />
      </g>
    </SpriteFrame>
  );
}

// #711: Saturation-fire truck. The rectangular tube bank and six-wheel chassis make it
// unambiguously different from the towed, single-barrel ArtillerySprite.
export function RocketArtillerySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={65} cy={103} rx={48} ry={6} />
        <g className="cq-rocket-artillery-chassis">
          <path d="M18,83 L32,70 L83,70 L105,83 L101,96 L22,96 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.25" />
          <path d="M34,72 L48,59 L70,59 L82,72 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
          <path d="M40,69 L51,61 L63,61 L60,69 Z" fill={palette.mid} opacity="0.72" />
          <rect x="30" y="85" width="66" height="4" rx="1.5" fill={palette.dark} opacity="0.62" />
          {[29, 48, 76, 96].map(x => <g key={x} transform={`translate(${x} 97)`}>
            <circle r="8.5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
            <g className="cq-rocket-artillery-wheel"><circle r="5.5" fill="none" stroke={P.metal.steel} strokeWidth="1.5" /><path d="M-5.5,0H5.5 M0,-5.5V5.5" stroke={P.metal.steel} strokeWidth="0.8" /></g>
            <circle r="2" fill={P.metal.iron} />
          </g>).join('')}
        </g>
        <g className="cq-rocket-artillery-stabilizer">
          <path d="M27,91 L17,103 M94,91 L105,103" stroke={P.metal.steel} strokeWidth="3" strokeLinecap="round" />
          <path d="M13,103 H22 M101,103 H110" stroke={P.metal.iron} strokeWidth="2.4" strokeLinecap="round" />
        </g>
        <g className="cq-rocket-artillery-rack" transform="translate(62 60) rotate(-17)">
          <rect x="-25" y="-17" width="58" height="31" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.15" />
          <rect x="-22" y="-14" width="52" height="5" fill={P.metal.steel} opacity="0.9" />
          <g className="cq-rocket-artillery-tubes">
            {[[-16, -8], [-4, -8], [8, -8], [20, -8], [-16, 4], [-4, 4], [8, 4], [20, 4]].map(([x, y]) => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><ellipse rx="4.2" ry="3.1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.55" /><ellipse rx="2.1" ry="1.5" fill={P.ink.soft} /></g>).join('')}
          </g>
          <rect x="-27" y="14" width="11" height="4" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        <g className="cq-rocket-artillery-crate" transform="translate(17 95)">
          <rect x="-8" y="-8" width="16" height="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.75" />
          <path d="M-8,-4H8 M0,-8V2" stroke={P.wood.dark} strokeWidth="0.7" />
        </g>
        <Banner x={32} y={53} palette={palette} scale={0.47} />
      </g>
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

// #769 de-alias: marine previously reused RiflemanSprite verbatim. Marine is coastal
// assault infantry with a MELEE attack profile — so it reads as a leaner amphibious
// trooper in olive combat fatigues lunging with a bayonet-fixed rifle (not the rifleman's
// static vertical carry), with a flotation/plate-carrier vest signalling "coastal assault."
export function MarineSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="melee">
        <Shadow cx={62} cy={100} rx={22} ry={5} />
        {/* lean, forward-crouched amphibious assault stance in olive combat fatigues */}
        <g transform="rotate(-9 60 78)">
          <Humanoid cx={60} cy={78} scale={0.94} cloth="#5b6248" pants="#454b38" accent="#3a3f2c" skin={P.skin.cool} hair="#2a1a0a"
            hat={
              <g>
                {/* rounded amphibious combat helmet with a team-color band + chin strap */}
                <path d="M-10,-33 Q-10,-44 0,-44 Q10,-44 10,-33 L10,-31 Q0,-34 -10,-31 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
                <path d="M-11,-31 Q0,-34 11,-31 L10,-28 Q0,-31 -10,-28 Z" fill={P.ink.soft} />
                <path d="M-10,-33 Q0,-36 10,-33 L10,-31 Q0,-33.5 -10,-31 Z" fill={palette.mid} />
                <path d="M-9,-30 Q-8,-25 -4,-24" fill="none" stroke={P.ink.soft} strokeWidth="1" />
              </g>
            }
          />
          {/* flotation / plate-carrier vest — linen with a team-color trim band */}
          <g transform="translate(60 68)">
            <path d="M-11,-8 Q0,-11 11,-8 L12,10 L-12,10 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.9" />
            <rect x="-12" y="-2" width="24" height="2.4" fill={palette.mid} />
            <line x1="0" y1="-9" x2="0" y2="10" stroke={P.ink.soft} strokeWidth="0.8" />
            <rect x="-9" y="3" width="6" height="6" rx="1" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
            <rect x="3" y="3" width="6" height="6" rx="1" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
          </g>
          {/* sheathed combat knife on the thigh */}
          <g transform="translate(49 87) rotate(18)"><rect x="-1.4" y="0" width="2.8" height="8" rx="1" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" /><rect x="-1" y="-3" width="2" height="3" fill={P.metal.shine} /></g>
        </g>
        {/* bayonet-fixed rifle thrust FORWARD as a melee weapon (not aimed for fire) */}
        <g transform="translate(58 76) rotate(-6)">
          <g className="cq-weapon" style="transform-origin: 58px 76px; transform-box: view-box;">
            <rect x="-14" y="-2.5" width="16" height="5" rx="1.5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
            <rect x="2" y="-2" width="22" height="4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
            <rect x="24" y="-1.5" width="18" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
            <path d="M42,-1.5 L62,-1 L42,1.5 Z" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.6" />
            <path d="M-2,2 L2,2 L1,8 L-3,8 Z" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
          </g>
        </g>
        {/* bare forearms (sleeves rolled) gripping the rifle */}
        <path d="M56,71 Q57,75 60,77" fill="none" stroke={P.skin.cool} strokeWidth="3.4" strokeLinecap="round" />
        <path d="M62,71 Q72,70 78,68" fill="none" stroke={P.skin.cool} strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="60" cy="77" r="2.4" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="79" cy="68" r="2.4" fill={P.skin.cool} stroke={P.ink.line} strokeWidth="0.5" />
        <Banner x={102} y={34} palette={palette} scale={0.6} />
      </g>
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

// #769 de-alias: destroyer previously reused IroncladSprite verbatim. Destroyer is
// an era-10 modern warship — long, low, lean welded-steel hull, enclosed forward gun
// turret, radar lattice mast, and torpedo tubes, so it reads as decades past the
// riveted, boxy Ironclad rather than a recolor of it.
export function DestroyerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval">
        <Shadow cx={64} cy={100} rx={52} ry={6.5} />
        {/* HULL — long, low, lean with real freeboard; smooth welded plating,
            a continuous deck edge at ~y80 (no rivet lines) */}
        <path d="M6,84 L114,79 Q123,84 121,92 L116,99 L20,100 Q7,98 6,89 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M12,82 L112,78 L109,82 L15,85 Z" fill={P.metal.iron} />
        <path d="M9,93 Q64,98 118,92" fill="none" stroke={P.metal.iron} strokeWidth="2.4" opacity="0.7" />
        {/* faction pennant-number stripe near the bow */}
        <rect x="20" y="86" width="18" height="3.2" fill={palette.mid} />
        <rect x="24" y="86.6" width="2" height="2" fill={palette.trim} />
        <rect x="29" y="86.6" width="2" height="2" fill={palette.trim} />
        {/* continuous 01-DECK — the base every superstructure fitting mounts on */}
        <path d="M28,72 L102,72 L100,80 L30,80 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
        <rect x="30" y="72" width="70" height="1.6" fill={P.metal.steel} />
        {/* forward enclosed GUN TURRET on the foredeck, barrel over the bow */}
        <rect x="20" y="73" width="15" height="7" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M20,73 Q27.5,67 35,73 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
        <rect x="6" y="74.6" width="16" height="2.8" rx="1.2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        {/* BRIDGE superstructure on the 01-deck */}
        <rect x="48" y="58" width="20" height="14" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <rect x="52" y="51" width="12" height="7" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="50" y="61" width="16" height="2.4" fill={P.ink.line} opacity="0.75" />
        <rect x="53" y="53" width="10" height="2" fill={P.ink.line} opacity="0.6" />
        {/* RADAR LATTICE MAST rising from the bridge top */}
        <line x1="58" y1="51" x2="58" y2="30" stroke={P.metal.iron} strokeWidth="1.6" />
        <path d="M54,50 L62,43 M62,50 L54,43 M54,43 L62,36 M62,43 L54,36 M55,36 L61,31" fill="none" stroke={P.metal.iron} strokeWidth="0.7" />
        <rect x="50" y="29" width="16" height="2.2" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" />
        <circle cx="58" cy="26" r="1.6" fill={palette.bright} />
        {/* single thin raked FUNNEL, base flush with the 01-deck */}
        <path d="M74,72 L82,72 L86,55 L80,55 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <path d="M80,55 L86,55 L86.6,52 L80.6,52 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.4" />
        {/* turbine exhaust — cq-smoke wisp */}
        <g transform="translate(83 51)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="4" ry="3" fill={P.stone.light} opacity="0.6" />
          <ellipse className="cq-smoke cq-smoke--b" cx="2" cy="-1" rx="5" ry="4" fill={P.stone.mid} opacity="0.4" />
          <ellipse className="cq-smoke cq-smoke--c" cx="-1" cy="0" rx="3" ry="2.4" fill={P.stone.light} opacity="0.5" />
        </g>
        {/* angled TORPEDO TUBES resting on the 01-deck, aft */}
        <g transform="translate(93 73)">
          <rect x="-9" y="0" width="20" height="2.6" rx="1.3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-9" y="3" width="20" height="2.6" rx="1.3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <circle cx="11" cy="1.3" r="1" fill={P.ink.line} />
          <circle cx="11" cy="4.3" r="1" fill={P.ink.line} />
        </g>
        {/* faction Banner on a short jackstaff, base on the foredeck */}
        <Banner x={39} y={72} palette={palette} scale={0.5} />
        {/* stern ENSIGN — staff rises from the deck, flag hugging the staff
            (palette.trim, cq-cape flutter) */}
        <line x1="110" y1="80" x2="110" y2="62" stroke={P.metal.iron} strokeWidth="1.4" />
        <path className="cq-cape" d="M110,63 L122,66 L116,70 L121,74 L110,73 Z" fill={palette.trim} stroke={palette.dark} strokeWidth="0.5" />
      </g>
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

// #769 de-alias: merchant_wagon previously reused CaravanSprite verbatim. Merchant
// Wagon is the wheeled successor to the walking pack-donkey Caravan — two large
// spoked wheels (the silhouette Caravan lacks entirely), a harnessed draft horse
// pulling ahead of the cart, and a driver seated on a raised bench holding the reins
// instead of walking alongside.
export function MerchantWagonSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="civilian">
        <Shadow cx={62} cy={96} rx={46} ry={6} />
        {/* DRAFT HORSE in harness, ahead of the cart (right), pulling forward */}
        <g transform="translate(94 60)">
          <rect x="-7" y="14" width="4.5" height="21" fill="#6b4f2f" stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="9" y="14" width="4.5" height="21" fill="#6b4f2f" stroke={P.ink.line} strokeWidth="0.5" />
          <path d="M-17,-1 Q-24,5 -22,17 L-18,16 Q-19,6 -14,1 Z" fill="#4a341c" stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx="0" cy="4" rx="18" ry="11" fill="#7a5a34" stroke={P.ink.line} strokeWidth="1" />
          <ellipse cx="-1" cy="1" rx="16" ry="7" fill="#8a6a3a" />
          <path d="M13,-1 Q21,-9 21,-17 L15,-19 Q9,-9 7,-2 Z" fill="#7a5a34" stroke={P.ink.line} strokeWidth="1" />
          <path d="M16,-17 Q25,-21 28,-16 L26,-6 Q19,-6 15,-11 Z" fill="#7a5a34" stroke={P.ink.line} strokeWidth="1" />
          <ellipse cx="27" cy="-12" rx="3.6" ry="2.6" fill="#8a6a3a" stroke={P.ink.line} strokeWidth="0.6" />
          <circle cx="25" cy="-14" r="0.8" fill={P.ink.line} />
          <path d="M15,-18 L16,-24 L20,-19 Z" fill="#6b4f2f" stroke={P.ink.line} strokeWidth="0.5" />
          <path d="M11,-14 Q15,-21 20,-19 Q14,-10 13,-1 Z" fill="#4a341c" />
          <rect x="-3" y="14" width="5" height="22" fill="#7a5a34" stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="7" y="14" width="5" height="22" fill="#7a5a34" stroke={P.ink.line} strokeWidth="0.6" />
          <ellipse cx="-0.5" cy="36" rx="3" ry="1.6" fill="#3a2a18" />
          <ellipse cx="9.5" cy="36" rx="3" ry="1.6" fill="#3a2a18" />
          {/* harness collar — faction accent */}
          <path d="M9,-2 Q15,-7 16,-15" fill="none" stroke={palette.mid} strokeWidth="2.6" />
        </g>
        {/* harness traces / draw-shaft linking horse to cart */}
        <line x1="76" y1="70" x2="90" y2="62" stroke={P.wood.dark} strokeWidth="1.8" />
        <line x1="76" y1="76" x2="92" y2="68" stroke={P.wood.dark} strokeWidth="1.8" />
        {/* wooden AXLE / undercarriage */}
        <rect x="24" y="80" width="48" height="3.6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        {/* two large spoked WHEELS (wood.dark rims) — Caravan has none */}
        <g transform="translate(30 82)">
          <circle r="13" fill="none" stroke={P.wood.dark} strokeWidth="3.4" />
          <circle r="10" fill="none" stroke={P.wood.dark} strokeWidth="1" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="-8.5" y1="-8.5" x2="8.5" y2="8.5" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="-8.5" y1="8.5" x2="8.5" y2="-8.5" stroke={P.wood.dark} strokeWidth="1.4" />
          <circle r="2.6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        <g transform="translate(66 82)">
          <circle r="13" fill="none" stroke={P.wood.dark} strokeWidth="3.4" />
          <circle r="10" fill="none" stroke={P.wood.dark} strokeWidth="1" />
          <line x1="-12" y1="0" x2="12" y2="0" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="0" y1="-12" x2="0" y2="12" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="-8.5" y1="-8.5" x2="8.5" y2="8.5" stroke={P.wood.dark} strokeWidth="1.4" />
          <line x1="-8.5" y1="8.5" x2="8.5" y2="-8.5" stroke={P.wood.dark} strokeWidth="1.4" />
          <circle r="2.6" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        {/* CART BODY */}
        <path d="M18,79 L74,79 L72,58 L22,58 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M22,58 L72,58 L72,62 L22,62 Z" fill={P.wood.light} />
        <line x1="20" y1="71" x2="73" y2="71" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.6" />
        <line x1="34" y1="62" x2="33" y2="79" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        <line x1="48" y1="62" x2="48" y2="79" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        <line x1="60" y1="62" x2="61" y2="79" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        {/* CARGO BED — crates (wood.light) + linen sack: 3 stacked shapes */}
        <rect x="26" y="46" width="15" height="14" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M26,52 H41 M33.5,46 V60" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.7" />
        <rect x="42" y="44" width="13" height="16" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M42,52 H55 M48.5,44 V60" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.7" />
        <path d="M56,60 L56,52 Q56,45 63,45 Q70,45 70,52 L70,60 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M60,45 Q63,49 66,45" fill="none" stroke={P.ink.soft} strokeWidth="0.5" opacity="0.6" />
        {/* WORK = delivering goods: coin glint at the cargo bed (.cq-deliver) */}
        <g className="cq-deliver">
          <ellipse cx="47" cy="40" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx="47" cy="37.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx="55" cy="41" rx="3.2" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
        </g>
        {/* DRIVER'S BENCH raised at the front */}
        <rect x="65" y="52" width="11" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        {/* DRIVER seated on the bench, holding the reins */}
        <g transform="translate(69 44)">
          <path d="M0,4 L9,7 L9,10 L1,10 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
          <path d="M-3,-8 Q4,-10 6,-3 L5,6 L-4,6 Z" fill={P.cloth.tunic} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-3,-6 L6,-3" fill="none" stroke={palette.mid} strokeWidth="2" />
          <path d="M4,-4 Q10,-3 13,0" fill="none" stroke={P.cloth.tunic} strokeWidth="3" strokeLinecap="round" />
          <circle cx="13.4" cy="0.6" r="1.6" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.5" />
          <circle cx="0" cy="-13" r="5.4" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.8" />
          <path d="M-7,-15 Q0,-20 7,-15 Q4,-13 0,-13 Q-4,-13 -7,-15 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        {/* reins from the driver's hand to the horse's mouth */}
        <path d="M83,45 Q100,42 119,48" fill="none" stroke="#3a2a18" strokeWidth="1" opacity="0.85" />
        {/* faction Banner on a short staff at the wagon rear (left) */}
        <Banner x={20} y={56} palette={palette} scale={0.62} />
      </g>
    </SpriteFrame>
  );
}

// #769 de-alias (batch 3): freight_convoy previously reused CaravanSprite verbatim —
// an ancient walking pack-donkey with no wheels at all. Freight Convoy is the era-10
// (highway-network) motor-freight successor to the horse-drawn Merchant Wagon: a
// highway flatbed TRUCK — rubber tyres (no spoked wheels, no draft animal), a cab with
// a windshield + headlight, an exhaust stack, and a strapped-down deck of crates. The
// visible cargo + coin-glint keep the "trade route" read shared with Caravan/Merchant
// Wagon; the motorised silhouette places it three eras later.
export function FreightConvoySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="civilian">
        <Shadow cx={62} cy={96} rx={48} ry={6} />
        {/* CHASSIS rail */}
        <rect x="14" y="80" width="92" height="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        {/* rubber TYRES — solid, no spokes; steel hub + centre nut */}
        <g transform="translate(32 86)">
          <circle r="10.5" fill="#26221c" stroke={P.ink.line} strokeWidth="1" />
          <circle r="4.6" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <circle r="1.4" fill={P.metal.iron} />
        </g>
        <g transform="translate(56 86)">
          <circle r="10.5" fill="#26221c" stroke={P.ink.line} strokeWidth="1" />
          <circle r="4.6" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <circle r="1.4" fill={P.metal.iron} />
        </g>
        <g transform="translate(98 86)">
          <circle r="10.5" fill="#26221c" stroke={P.ink.line} strokeWidth="1" />
          <circle r="4.6" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <circle r="1.4" fill={P.metal.iron} />
        </g>
        {/* exhaust stack behind the cab + drifting smoke */}
        <rect x="79" y="42" width="3.4" height="18" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <g transform="translate(80.5 41)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="4" ry="3.2" fill={P.stone.light} opacity="0.6" />
          <ellipse className="cq-smoke cq-smoke--b" cx="1.5" cy="0" rx="5" ry="4" fill={P.stone.mid} opacity="0.45" />
        </g>
        {/* FLATBED deck */}
        <rect x="14" y="68" width="66" height="12" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.9" />
        <rect x="14" y="68" width="66" height="3" fill={P.wood.light} />
        <line x1="30" y1="71" x2="30" y2="80" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        <line x1="48" y1="71" x2="48" y2="80" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        <line x1="64" y1="71" x2="64" y2="80" stroke={P.wood.dark} strokeWidth="0.5" opacity="0.5" />
        {/* CARGO — crates + linen sack strapped to the deck */}
        <rect x="20" y="50" width="16" height="18" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M20,56 H36 M28,50 V68" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.7" />
        <rect x="38" y="46" width="15" height="22" fill={P.wood.light} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M38,55 H53 M45.5,46 V68" stroke={P.wood.dark} strokeWidth="0.6" opacity="0.7" />
        <path d="M56,68 L56,56 Q56,47 64,47 Q72,47 72,56 L72,68 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M60,47 Q64,51 68,47" fill="none" stroke={P.ink.soft} strokeWidth="0.5" opacity="0.6" />
        {/* tie-down strap across the load */}
        <line x1="16" y1="58" x2="76" y2="58" stroke={P.ink.soft} strokeWidth="1.4" opacity="0.8" />
        {/* WORK = delivering goods: coin glint above the deck (.cq-deliver) */}
        <g className="cq-deliver">
          <ellipse cx="44" cy="42" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx="44" cy="39.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
          <ellipse cx="52" cy="43" rx="3.2" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
        </g>
        {/* CAB — faction-coloured, windshield glass, door, grille, headlight */}
        <rect x="82" y="56" width="24" height="24" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M83,56 L88,45 L104,45 L106,56 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M89,55 L91,47 L102,47 L103,55 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M90,54 L92,48 L95,48 Z" fill={P.metal.shine} opacity="0.4" />
        <line x1="95" y1="57" x2="95" y2="79" stroke={P.ink.line} strokeWidth="0.5" opacity="0.6" />
        <rect x="90" y="66" width="3" height="1.6" fill={P.ink.soft} />
        <rect x="104" y="60" width="4" height="14" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
        <line x1="104" y1="64" x2="108" y2="64" stroke={P.ink.line} strokeWidth="0.4" opacity="0.6" />
        <line x1="104" y1="68" x2="108" y2="68" stroke={P.ink.line} strokeWidth="0.4" opacity="0.6" />
        <rect x="104" y="76" width="6" height="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <g transform="translate(107 66)"><g className="cq-glow"><circle r="2.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" /></g></g>
        {/* faction Banner on a short staff at the truck rear (left) */}
        <Banner x={94} y={45} palette={palette} scale={0.55} />
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

// #769 de-alias: infantry previously reused MachineGunnerSprite verbatim. Per its
// in-game text ("modern line infantry... current infantry apex") it must read as a
// LATER-era upgrade: rounded combat helmet + tactical vest, rifle held two-handed at
// the ready (NOT a tripod-mounted belt-fed gun), standing/mobile — not crouched.
export function InfantrySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={62} cy={100} rx={22} ry={5} />
        <Humanoid cx={60} cy={78} scale={1} cloth={palette.dark} pants="#3a3a2e" accent={palette.mid} skin={P.skin.warm} hair="#2a1a0a"
          hat={
            <g>
              {/* modern rounded combat helmet (not a WWI Brodie/Stahlhelm) */}
              <path d="M-11,-33 Q-11,-45 0,-45 Q11,-45 11,-33 L11,-31 Q0,-34 -11,-31 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
              <path d="M-11,-33 Q0,-36 11,-33 L11,-31 L-11,-31 Z" fill={P.metal.steel} opacity="0.5" />
              <path d="M-12,-31 Q0,-34 12,-31 L11,-28 Q0,-31 -11,-28 Z" fill={P.ink.soft} />
            </g>
          }
        />
        {/* tactical vest with pouches over the torso */}
        <g transform="translate(60 66)">
          <rect x="-13" y="-6" width="26" height="20" rx="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
          <rect x="-13" y="-6" width="26" height="4" fill={palette.dark} />
          <rect x="-11" y="2" width="7" height="8" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="-2" y="2" width="7" height="8" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="7" y="2" width="5" height="8" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
          <path d="M-5,-6 L5,-6 L3,-1 L-3,-1 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="0.5" />
        </g>
        {/* both forearms bent to grip the rifle — connects gun to the body */}
        <path d="M55,66 Q57,74 60,79" fill="none" stroke={palette.dark} strokeWidth="5" strokeLinecap="round" />
        <path d="M62,66 Q72,67 80,71" fill="none" stroke={palette.dark} strokeWidth="5" strokeLinecap="round" />
        {/* RIFLE gripped two-handed, muzzle up — NOT tripod-mounted; recoils + flashes on attack */}
        <g transform="translate(60 80) rotate(-20)">
          <g className="cq-weapon" style="transform-origin: 60px 80px; transform-box: view-box;">
            <rect x="-18" y="-3" width="20" height="6" rx="1.5" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.7" />
            <rect x="0" y="-4" width="24" height="6" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
            <rect x="24" y="-2.5" width="22" height="3" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
            <rect x="46" y="-3" width="4" height="4" rx="1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
            <path d="M6,2 L14,2 L13,13 L7,13 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
            <path d="M-2,2 L2,2 L1,9 L-3,9 Z" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
            <rect x="16" y="-6" width="2.5" height="3" fill={P.metal.iron} />
            <g transform="translate(52 -1)"><g className="cq-muzzle-flash"><circle r="5" fill="#ffd966" /><circle r="2.5" fill="#fff" /></g></g>
          </g>
        </g>
        {/* hands on the rifle */}
        <circle cx="60" cy="80" r="2.6" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="81" cy="72" r="2.6" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.6" />
        <Banner x={100} y={30} palette={palette} scale={0.65} />
      </g>
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

// #711: Mature three-turret capital ship. The long hull, low bridge, and rangefinder
// distinguish it from the two-turret pre-dreadnought while remaining map-readable.
export function BattleshipSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="naval">
        <Shadow cx={64} cy={105} rx={53} ry={7} />
        <g className="cq-battleship-wake">
          <path d="M12,101 Q63,114 117,101 M19,107 Q65,118 110,107" fill="none" stroke={P.ground.water} strokeWidth="2.4" opacity="0.82" />
        </g>
        <g className="cq-battleship-hull">
          <path d="M10,87 L25,74 L105,74 L119,87 L110,102 Q65,110 19,102 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.35" />
          <path d="M19,89 Q64,100 113,89 L110,96 Q64,106 20,96 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.65" />
          <path d="M17,94 Q64,104 112,94" fill="none" stroke={palette.mid} strokeWidth="2.2" opacity="0.68" />
          <path d="M106,75 L119,87 L110,102 L97,91 Z" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.65" />
        </g>
        <g className="cq-battleship-turret-fore" transform="translate(40 72)">
          <ellipse rx="12" ry="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <path d="M4,-2 L25,-8 M4,2 L25,-3" stroke={P.metal.steel} strokeWidth="2.8" strokeLinecap="round" />
          <g transform="translate(26 -5)"><g className="cq-muzzle-flash"><circle r="3.5" fill="#ffd966" /><circle r="1.5" fill="#fff" /></g></g>
        </g>
        <g className="cq-battleship-turret-mid" transform="translate(64 65)">
          <ellipse rx="12" ry="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <path d="M4,-2 L25,-8 M4,2 L25,-3" stroke={P.metal.steel} strokeWidth="2.8" strokeLinecap="round" />
          <g transform="translate(26 -5)"><g className="cq-muzzle-flash"><circle r="3.5" fill="#ffd966" /><circle r="1.5" fill="#fff" /></g></g>
        </g>
        <g className="cq-battleship-turret-aft" transform="translate(85 72)">
          <ellipse rx="12" ry="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <path d="M4,-2 L25,-8 M4,2 L25,-3" stroke={P.metal.steel} strokeWidth="2.8" strokeLinecap="round" />
          <g transform="translate(26 -5)"><g className="cq-muzzle-flash"><circle r="3.5" fill="#ffd966" /><circle r="1.5" fill="#fff" /></g></g>
        </g>
        <g className="cq-battleship-bridge">
          <path d="M52,70 L57,48 L75,48 L80,70 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
          <path d="M58,54 L72,54 L75,61 L55,61 Z" fill={palette.bright} opacity="0.75" />
          <rect x="62" y="42" width="4" height="8" fill={P.metal.iron} />
        </g>
        <g className="cq-battleship-rangefinder">
          <line x1="64" y1="47" x2="64" y2="27" stroke={P.metal.iron} strokeWidth="2" />
          <path d="M55,30 H73 L70,34 H58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.65" />
          <path d="M65,29 L78,34 L65,39 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
        </g>
        <Banner x={65} y={25} palette={palette} scale={0.52} />
      </g>
    </SpriteFrame>
  );
}

// #711: Fleet-air-defense cruiser. Closed VLS cells and paired radar arrays deliberately
// replace the Battleship's heavy-turret profile; no missile is drawn as map-state art.
export function MissileCruiserSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="naval">
        <Shadow cx={64} cy={105} rx={50} ry={6.5} />
        <g className="cq-missile-cruiser-wake"><path d="M14,101 Q63,113 115,101 M23,107 Q65,117 108,107" fill="none" stroke={P.ground.water} strokeWidth="2.2" opacity="0.82" /></g>
        <g className="cq-missile-cruiser-hull">
          <path d="M12,88 L30,76 L102,76 L117,88 L108,102 Q64,109 20,102 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.3" />
          <path d="M18,91 Q64,100 112,90 L108,97 Q64,105 21,97 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.7" />
          <path d="M19,95 Q64,104 109,95" fill="none" stroke={palette.mid} strokeWidth="2" opacity="0.65" />
          <path d="M102,76 L117,88 L108,102 L97,91 Z" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.65" />
        </g>
        <g className="cq-missile-cruiser-vls" transform="translate(38 71)">
          <rect x="-17" y="-9" width="35" height="18" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
          {[-10, 0, 10].map(x => [-4, 4].map(y => <g key={`${x}-${y}`} transform={`translate(${x} ${y})`}><rect x="-3.4" y="-2.4" width="6.8" height="4.8" rx="0.7" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.4" /></g>).join('')).join('')}
        </g>
        <g className="cq-missile-cruiser-bridge">
          <path d="M57,76 L64,51 L82,56 L88,76 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
          <path d="M65,57 L78,60 L80,65 L62,64 Z" fill={palette.bright} opacity="0.78" />
          <path d="M58,70 H87" stroke={P.metal.shine} strokeWidth="1" />
        </g>
        <g className="cq-missile-cruiser-radar-forward">
          <line x1="69" y1="55" x2="69" y2="34" stroke={P.metal.iron} strokeWidth="1.8" />
          <path d="M60,36 H77 L74,41 H62 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.55" />
        </g>
        <g className="cq-missile-cruiser-radar-aft">
          <line x1="82" y1="63" x2="82" y2="43" stroke={P.metal.iron} strokeWidth="1.7" />
          <path d="M75,45 H90 L88,50 H77 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.55" />
        </g>
        <Banner x={70} y={32} palette={palette} scale={0.48} />
      </g>
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

// #709 industrial visual batch: four-wheel reconnaissance car, deliberately distinct
// from TankSprite's WWI rhomboid tracks. The small turret and pennant retain the
// faction read without turning a scouting vehicle into a second main battle tank.
export function ArmoredCarSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={103} rx={42} ry={6} />
      <g className="cq-armored-car-body">
        <path d="M18,86 L31,70 L83,70 L104,84 L101,96 L23,96 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.3" />
        <path d="M36,72 L51,57 L76,57 L88,72 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
        <path d="M43,69 L53,59 L65,59 L62,69 Z" fill={palette.mid} opacity="0.78" />
        <path d="M65,69 L68,59 L76,59 L84,70 Z" fill={P.metal.shine} opacity="0.45" />
        <rect x="50" y="78" width="32" height="7" rx="2" fill={palette.dark} opacity="0.68" />
        <g className="cq-armored-car-turret" style="transform-origin: 72px 60px; transform-box: view-box;">
          <ellipse cx="70" cy="61" rx="13" ry="7" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <g className="cq-weapon" style="--pivot-x:70px;--pivot-y:61px">
            <rect x="68" y="58" width="35" height="5" rx="1.5" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
            <g transform="translate(105 60)"><g className="cq-muzzle-flash"><circle r="3.5" fill="#ffd966" /><circle r="1.6" fill="#fff" /></g></g>
          </g>
          <path d="M70,55 L70,45" stroke={P.metal.iron} strokeWidth="1.4" />
          <path d="M71,45 L80,48 L71,51 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.5" />
        </g>
      </g>
      {[36, 82].map(x => <g key={x} transform={`translate(${x} 96)`}><circle r="12" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" /><g className="cq-wheel"><circle r="8" fill="none" stroke={P.metal.steel} strokeWidth="2" /><path d="M-8,0H8M0,-8V8" stroke={P.metal.steel} strokeWidth="1" /></g><circle r="3" fill={P.metal.iron} /></g>).join('')}
      <Banner x={28} y={63} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}

// #709: infantry ride inside a carrier; the vehicle is deliberately larger than the
// hatch-mounted rider so fallback/minor-civ rendering keeps the approved visual story.
export function MechanizedInfantrySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={69} cy={104} rx={53} ry={7} />
      <g className="cq-mech-carrier"><path d="M15,87 L31,68 L96,68 L116,82 L113,101 L19,101 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.3" /><path d="M34,72 L50,56 L87,56 L102,72 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" /><rect x="43" y="80" width="54" height="7" rx="2" fill={palette.mid} opacity="0.72" /><ellipse cx="70" cy="61" rx="13" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />{[31, 54, 84, 105].map(x => <g key={x} transform={`translate(${x} 101)`}><circle r="10" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" /><g className="cq-wheel"><circle r="6" fill="none" stroke={P.metal.steel} strokeWidth="1.7" /><path d="M-6,0H6M0,-6V6" stroke={P.metal.steel} strokeWidth="0.8" /></g></g>).join('')}</g>
      <g className="cq-mech-soldier cq-mech-rider"><path d="M62,56 Q70,49 78,56 L80,68 L61,68 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" /><circle cx="70" cy="47" r="7" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="0.7" /><path d="M62,47 Q63,37 70,37 Q77,37 78,47 L77,51 L63,51 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" /><g className="cq-arm-l"><path d="M64,58 Q72,66 79,68" fill="none" stroke={palette.dark} strokeWidth="4" strokeLinecap="round" /></g><g className="cq-arm-r"><path d="M77,57 Q83,62 88,66" fill="none" stroke={palette.dark} strokeWidth="4" strokeLinecap="round" /></g><g className="cq-weapon"><g transform="translate(79 68) rotate(-12)"><rect x="-8" y="-2.5" width="30" height="5" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><rect x="19" y="-1.5" width="18" height="3" fill={P.metal.steel} /><g transform="translate(39 0)"><g className="cq-muzzle-flash"><circle r="3.2" fill="#ffd966" /><circle r="1.4" fill="#fff" /></g></g></g></g></g>
      <Banner x={28} y={60} palette={palette} scale={0.44} />
    </SpriteFrame>
  );
}

// #709: late-era main battle tank — low hull, broad continuous tracks, turret and a
// long cannon. This intentionally advances beyond the WWI TankSprite's rhomboid hull.
export function MainBattleTankSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={104} rx={51} ry={7} />
      <g className="cq-mbt-body">
        <path d="M12,87 L30,74 L96,75 L115,87 L110,101 L17,101 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.4" />
        <path d="M29,80 L98,80 L105,91 L23,91 Z" fill={palette.mid} opacity="0.56" />
        <g className="cq-mbt-tracks"><path d="M18,91 Q23,83 40,84 L99,84 Q110,85 112,96 Q107,106 96,106 L31,106 Q18,104 18,91 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />{[34, 51, 69, 87, 102].map(x => <circle key={x} cx={x} cy="96" r="6" fill={P.metal.iron} stroke={P.metal.steel} strokeWidth="1" />).join('')}</g>
        <g className="cq-mbt-turret" style="transform-origin: 71px 70px; transform-box: view-box;"><path d="M46,77 Q48,60 69,57 Q88,58 94,76 L87,83 L52,83 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" /><ellipse cx="68" cy="63" rx="8" ry="5" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" /><g className="cq-weapon" style="--pivot-x:74px;--pivot-y:70px"><rect x="73" y="67" width="42" height="6" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><rect x="108" y="68" width="10" height="4" fill={P.metal.steel} /><g transform="translate(120 70)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="1.8" fill="#fff" /></g></g></g></g>
      </g>
      <Banner x={38} y={65} palette={palette} scale={0.52} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 5): anti_tank_gun previously reused TankSprite verbatim — a
// tracked, armored rhomboid hull. An anti-tank gun is a TOWED emplaced gun, so this
// draws in the CannonSprite/ArtillerySprite wheeled-carriage family (no tracks, no
// armored hull), but stays a distinct 4th silhouette via its gun shield, split trail,
// crouched crew and a low direct-fire barrel with a muzzle brake (vs. Cannon's standing
// gunner + horizontal barrel and Artillery's single trail spade + steep indirect barrel).
export function AntiTankGunSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={66} cy={104} rx={46} ry={6} />
        {/* split trail — two spread carriage legs to the rear-left for firing stability */}
        <path d="M50,84 L17,93 L21,97 L52,88 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M50,86 L20,104 L24,107 L53,90 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <path d="M14,90 L23,92 L20,98 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M17,101 L26,103 L23,109 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        {/* axle */}
        <rect x="44" y="78" width="26" height="8" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="44" y="78" width="26" height="3" fill={P.metal.steel} />
        {/* far carriage wheel */}
        <g transform="translate(51 90)">
          <circle r="11" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.5" />
          <circle r="11" fill="none" stroke={P.metal.iron} strokeWidth="2" />
          <g className="cq-wheel" style="animation-duration:3.4s">
            <line x1="-9.6" y1="0" x2="9.6" y2="0" stroke={P.wood.mid} strokeWidth="1.2" />
            <line x1="0" y1="-9.6" x2="0" y2="9.6" stroke={P.wood.mid} strokeWidth="1.2" />
            <line x1="-6.8" y1="-6.8" x2="6.8" y2="6.8" stroke={P.wood.mid} strokeWidth="1.1" />
            <line x1="-6.8" y1="6.8" x2="6.8" y2="-6.8" stroke={P.wood.mid} strokeWidth="1.1" />
          </g>
          <circle r="3.1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <circle r="1.4" fill={P.metal.steel} />
        </g>
        {/* crouched loading crew behind the shield */}
        <Humanoid cx={39} cy={78} scale={0.6} cloth={P.cloth.wool} pants={P.cloth.wool} accent={palette.mid} skin={P.skin.warm} hair="#3a2a1a" />
        {/* gun shield — angled armored plate with a livery band and a barrel notch */}
        <path d="M58,50 L74,55 L74,92 L58,88 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.3" />
        <path d="M58,50 L74,55 L74,62 L58,57 Z" fill={palette.mid} />
        <path d="M61,66 L71,68 L71,74 L61,72 Z" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
        <line x1="58" y1="79" x2="74" y2="83" stroke={P.ink.line} strokeWidth="0.5" opacity="0.4" />
        {/* long low direct-fire barrel + breech + muzzle brake */}
        <g transform="translate(63 69) rotate(-8)">
          <rect x="-12" y="-5" width="10" height="10" rx="1.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <rect x="-4" y="-3.4" width="46" height="6.8" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <rect x="-4" y="-3.4" width="46" height="2.4" rx="2" fill={P.metal.steel} />
          <rect x="40" y="-5" width="11" height="10" rx="1.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
          <rect x="43.4" y="-5" width="1.6" height="10" fill={P.ink.line} opacity="0.55" />
          <rect x="47" y="-5" width="1.6" height="10" fill={P.ink.line} opacity="0.55" />
        </g>
        {/* near carriage wheel — drawn over the shield foot for depth */}
        <g transform="translate(66 92)">
          <circle r="12" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.5" />
          <circle r="12" fill="none" stroke={P.metal.iron} strokeWidth="2" />
          <g className="cq-wheel" style="animation-duration:3.4s">
            <line x1="-10.6" y1="0" x2="10.6" y2="0" stroke={P.wood.mid} strokeWidth="1.2" />
            <line x1="0" y1="-10.6" x2="0" y2="10.6" stroke={P.wood.mid} strokeWidth="1.2" />
            <line x1="-7.5" y1="-7.5" x2="7.5" y2="7.5" stroke={P.wood.mid} strokeWidth="1.1" />
            <line x1="-7.5" y1="7.5" x2="7.5" y2="-7.5" stroke={P.wood.mid} strokeWidth="1.1" />
          </g>
          <circle r="3.4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <circle r="1.6" fill={P.metal.steel} />
        </g>
        {/* muzzle flash at the barrel tip */}
        <g transform="translate(113 62)"><g className="cq-muzzle-flash"><circle r="6" fill="#ffd966" /><circle r="3" fill="#fff" /></g></g>
        <Banner x={66} y={36} palette={palette} scale={0.62} />
      </g>
    </SpriteFrame>
  );
}

// #769 de-alias (batch 5): mobile_aa previously reused TankSprite verbatim. It is a
// SELF-PROPELLED anti-aircraft vehicle, so this reads as a low tracked chassis with an
// OPEN-TOP gun mount, a quad autocannon angled sharply UP (anti-air, not the donor's
// forward-level sponson), and a small radar/sight dish that pulses (.cq-glow) to sell its
// air-defense support role — no closed rhomboid hull, and no towed trail like AntiTankGun.
export function MobileAaSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <g data-kind="ranged">
        <Shadow cx={62} cy={108} rx={48} ry={6} />
        {/* track run + road wheels + end sprockets */}
        <rect x="14" y="90" width="94" height="16" rx="8" fill="#2a2620" stroke={P.ink.line} strokeWidth="1.3" />
        <rect x="18" y="91" width="86" height="3.4" rx="1.7" fill={P.metal.iron} opacity="0.5" />
        {[26, 40, 54, 68, 82, 96].map(x =>
          <g key={x}><circle cx={x} cy="98.5" r="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" /><circle cx={x} cy="98.5" r="1.8" fill={P.metal.steel} /></g>
        ).join('')}
        <circle cx="16.5" cy="98.5" r="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="105.5" cy="98.5" r="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        {/* low hull with a livery band + indicator light */}
        <path d="M22,90 L28,73 L96,73 L104,90 Z" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1.3" />
        <path d="M96,73 L104,90 L96,90 Z" fill={P.ink.soft} opacity="0.5" />
        <rect x="30" y="83" width="64" height="4" fill={palette.mid} />
        <circle cx="90" cy="79" r="2" fill={palette.bright} stroke={P.ink.line} strokeWidth="0.5" />
        {/* rear exhaust stack rooted on the hull top + drifting smoke */}
        <rect x="29" y="65" width="3.4" height="9" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <g transform="translate(30.7 64)">
          <ellipse className="cq-smoke" cx="0" cy="0" rx="3" ry="2.4" fill={P.stone.light} opacity="0.6" />
          <ellipse className="cq-smoke cq-smoke--b" cx="1.2" cy="0" rx="4" ry="3.2" fill={P.stone.mid} opacity="0.42" />
        </g>
        {/* open-top gun tub (back wall only — no closed turret) */}
        <path d="M46,74 Q46,63 63,63 Q80,63 80,74 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.1" />
        <path d="M49,72 Q49,66 63,66" fill="none" stroke={P.metal.shine} strokeWidth="0.7" opacity="0.35" />
        <ellipse cx="63" cy="74" rx="17" ry="4.2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
        <ellipse cx="63" cy="74" rx="12" ry="2.4" fill={P.ink.soft} opacity="0.6" />
        {/* radar / sight dish on a post rooted to the hull — pulses ("watching the sky") */}
        <g transform="translate(45 73)">
          <rect x="-2.6" y="-2.4" width="5.2" height="4.4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-1.1" y="-11" width="2.2" height="9" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <g className="cq-glow">
            <ellipse cx="0" cy="-13" rx="5" ry="2.4" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.6" />
            <ellipse cx="0" cy="-13" rx="2.2" ry="1" fill={P.metal.shine} opacity="0.7" />
            <circle cx="0" cy="-13" r="1" fill={P.metal.shine} />
          </g>
        </g>
        {/* quad autocannon angled sharply upward */}
        <g transform="translate(63 70) rotate(-53)">
          <rect x="-6" y="-6.5" width="9" height="13" rx="1.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
          <rect x="0" y="-6.4" width="34" height="2.3" rx="1.1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="0" y="-2.7" width="34" height="2.3" rx="1.1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="0" y="1" width="34" height="2.3" rx="1.1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
          <rect x="0" y="4.7" width="34" height="2.3" rx="1.1" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
          <g transform="translate(35 0)"><g className="cq-muzzle-flash"><circle r="4.4" fill="#ffd966" /><circle r="2.2" fill="#fff" /></g></g>
        </g>
        <Banner x={25} y={58} palette={palette} scale={0.55} />
      </g>
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

// #769 de-alias (batch 3): air_freighter previously reused BiplaneSprite — a WWI
// double-winged biplane. Air Freighter is the era-9 (air-superiority) cargo hauler,
// drawn in a shallow 3/4 bank nose-right so BOTH wings show as a swept V: a fat
// aluminium fuselage, two propeller engines (vertical spinning-prop discs), a tail fin.
export function AirFreighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={112} rx={44} ry={5} />
      {/* FAR wing (upper, swept back) + engine/prop */}
      <path d="M72,50 L26,34 L36,39 L74,53 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.1" />
      <circle cx="50" cy="42" r="3.2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" /><circle cx="50" cy="42" r="1.3" fill={palette.trim} />
      <g transform="translate(52 43)">
        <rect x="-2" y="-4" width="18" height="8" rx="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
        <ellipse cx="17" cy="0" rx="2.2" ry="8" fill={P.metal.shine} opacity="0.3" />
        <ellipse cx="17" cy="0" rx="1.1" ry="4" fill={P.metal.shine} opacity="0.55" />
        <circle cx="15" cy="0" r="1.5" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* TAIL FIN + stabiliser (rear, left) */}
      <path d="M28,52 L20,26 L40,52 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M28,54 L10,49 L16,55 L28,57 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      {/* FUSELAGE — fat aluminium tube, rounded nose right */}
      <path d="M20,50 L34,45 L98,46 Q110,47 110,53 Q110,59 98,60 L40,59 Q26,58 20,54 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M102,47 Q110,48 110,53 L102,53 Z" fill={P.metal.shine} opacity="0.35" />
      <rect x="24" y="51" width="84" height="3.4" fill={palette.mid} opacity="0.9" />
      <path d="M96,47 L104,48 L103,51 L95,50 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="54" cy="51.4" r="1.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.3" />
      <circle cx="62" cy="51.4" r="1.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.3" />
      <rect x="70" y="47" width="9" height="9" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* NEAR wing (lower, swept back) + engine/prop — over the fuselage */}
      <path d="M72,56 L26,72 L36,74 L74,59 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.1" />
      <circle cx="50" cy="66" r="3.2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" /><circle cx="50" cy="66" r="1.3" fill={palette.trim} />
      <g transform="translate(52 65)">
        <rect x="-2" y="-4" width="18" height="8" rx="4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
        <ellipse cx="17" cy="0" rx="2.2" ry="8" fill={P.metal.shine} opacity="0.3" />
        <ellipse cx="17" cy="0" rx="1.1" ry="4" fill={P.metal.shine} opacity="0.55" />
        <circle cx="15" cy="0" r="1.5" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* WORK = delivering goods: coin glint above the cargo door (.cq-deliver) */}
      <g className="cq-deliver">
        <ellipse cx="74" cy="40" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="74" cy="37.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="82" cy="41" rx="3.2" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={64} y={20} palette={palette} scale={0.55} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 3): recon_aircraft previously reused BiplaneSprite — three
// eras too early. Recon Aircraft is an era-10 (jet-aviation) UNARMED reconnaissance
// jet, drawn in a shallow 3/4 bank nose-right (both thin high-aspect wings visible),
// with a T-tail, a glazed nose sensor dome and a belly CAMERA POD — no weapons.
export function ReconAircraftSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={112} rx={40} ry={4} />
      {/* FAR wing (upper) */}
      <path d="M70,52 L24,40 L30,43 L72,55 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="48" cy="47" r="2.4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* T-TAIL */}
      <path d="M28,50 L22,24 L36,50 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M16,26 L36,26 L36,30 L16,30 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.7" />
      {/* FUSELAGE — slim, pointed nose right */}
      <path d="M22,50 L36,45 L96,47 L110,52 L96,57 L40,56 Q28,55 22,52 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M22,51 L40,48 L40,53 L22,53 Z" fill={palette.bright} opacity="0.4" />
      {/* NEAR wing (lower) */}
      <path d="M70,55 L24,68 L30,70 L72,58 Z" fill={palette.bright} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="48" cy="63" r="2.4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* belly CAMERA POD — glowing lens */}
      <ellipse cx="60" cy="58" rx="7" ry="4.2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <g transform="translate(60 59)"><g className="cq-glow"><circle r="2.4" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.5" /><circle r="0.9" fill={P.metal.shine} opacity="0.8" /></g></g>
      {/* NOSE sensor dome */}
      <ellipse cx="106" cy="52" rx="6" ry="4.4" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="1" />
      <ellipse cx="108" cy="50.5" rx="1.8" ry="1.2" fill={P.metal.shine} opacity="0.6" />
      <Banner x={64} y={18} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 3): bomber previously reused JetFighterSprite verbatim — a
// small single-seat swept-wing fighter. Bomber is the era-10 (nuclear-weapons) heavy
// strategic bomber, drawn in a shallow 3/4 bank nose-right (both swept wings visible),
// carrying FOUR podded engines, a belly bomb-bay and a tall swept tail — big and slow.
export function BomberSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={114} rx={50} ry={5} />
      {/* FAR wing (upper) + two pods */}
      <path d="M74,52 L22,30 L34,35 L78,55 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <g fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8"><rect x="46" y="40" width="17" height="7" rx="3.5" /><rect x="32" y="34" width="15" height="6" rx="3" /></g>
      <circle cx="54" cy="43" r="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" /><circle cx="54" cy="43" r="1.2" fill={palette.bright} />
      {/* TALL SWEPT TAIL FIN + stab */}
      <path d="M30,50 L16,16 L42,50 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.1" />
      <path d="M30,50 L22,26 L34,50 Z" fill={P.metal.steel} opacity="0.4" />
      <path d="M30,52 L8,46 L14,53 L30,56 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
      {/* FUSELAGE — long heavy iron tube, pointed nose right */}
      <path d="M16,48 L34,42 L98,43 L116,52 L98,61 L40,60 Q24,59 16,54 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.3" />
      <path d="M100,44 L116,52 L100,52 Z" fill={P.metal.iron} />
      <path d="M92,46 L104,49 L102,52 L91,50 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" />
      {/* NEAR wing (lower) + two pods */}
      <path d="M74,57 L22,80 L34,82 L78,60 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <g fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8"><rect x="46" y="66" width="17" height="7" rx="3.5" /><rect x="32" y="74" width="15" height="6" rx="3" /></g>
      <circle cx="54" cy="70" r="3" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" /><circle cx="54" cy="70" r="1.2" fill={palette.bright} />
      {/* belly BOMB-BAY */}
      <rect x="56" y="57" width="20" height="7" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
      <line x1="66" y1="57" x2="66" y2="64" stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={64} y={10} palette={palette} scale={0.55} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 3): jet_freighter previously reused JetFighterSprite verbatim —
// the same fighter silhouette as jet_fighter/wwii_fighter, with no cargo identity. Jet
// Freighter is the era-10 (jet-aviation) civilian cargo JET, drawn in a shallow 3/4
// bank nose-right (both swept wings visible), with a white liveried fuselage + cabin
// windows, two underslung engine pods, a large faction tail fin and a cargo door.
export function JetFreighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={112} rx={46} ry={5} />
      {/* FAR wing (upper) + engine pod */}
      <path d="M72,52 L28,34 L40,39 L74,55 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
      <g transform="translate(50 42)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      {/* TALL faction TAIL FIN + stab */}
      <path d="M30,52 L20,20 L40,52 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="28" cy="36" r="2.4" fill={palette.trim} stroke={palette.dark} strokeWidth="0.5" />
      <path d="M30,54 L10,48 L16,54 L30,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      {/* FUSELAGE — white tube, rounded nose right */}
      <path d="M18,50 L34,44 L100,45 Q112,46 112,53 Q112,59 100,60 L40,60 Q26,59 18,54 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M104,47 Q112,48 112,53 L104,53 Z" fill={P.metal.shine} opacity="0.3" />
      <rect x="24" y="51" width="84" height="3.4" fill={palette.mid} opacity="0.9" />
      <path d="M98,47 L106,48 L105,51 L97,50 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" />
      <g fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.3"><circle cx="46" cy="51.4" r="1.1" /><circle cx="54" cy="51.4" r="1.1" /><circle cx="62" cy="51.4" r="1.1" /><circle cx="90" cy="51.4" r="1.1" /></g>
      <rect x="72" y="46" width="10" height="10" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* NEAR wing (lower) + engine pod */}
      <path d="M72,57 L28,78 L40,80 L74,60 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
      <g transform="translate(50 68)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      {/* WORK = delivering goods: coin glint above the cargo door (.cq-deliver) */}
      <g className="cq-deliver">
        <ellipse cx="77" cy="39" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="77" cy="36.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="85" cy="40" rx="3.2" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={64} y={14} palette={palette} scale={0.55} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 4): global_air_cargo previously reused JetFighterSprite — the
// small single-seat fighter. Global Air Cargo is the era-12 (digital-economy, 🌐) final
// rung of the air trade line, one generation past JetFreighter: a far bigger WHALE-BODY
// hauler with a bulbous upper cargo deck, FOUR engine pods, an AUTONOMOUS nose sensor
// (no cockpit glazing) and a spine-mounted comms-GLOBE beacon — the "global network" cue.
export function GlobalAirCargoSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={114} rx={52} ry={5} />
      {/* FAR wing (upper) + two engine pods */}
      <path d="M76,52 L20,30 L34,36 L78,55 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
      <g transform="translate(42 40) scale(0.8)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      <g transform="translate(58 42) scale(0.8)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      {/* faction TAIL FIN + roundel + stabiliser (rear, left) */}
      <path d="M28,52 L18,20 L40,52 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <circle cx="28" cy="36" r="2.4" fill={palette.trim} stroke={palette.dark} strokeWidth="0.5" />
      <path d="M28,55 L8,48 L16,55 L28,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
      {/* FUSELAGE lower tube + bulbous upper cargo deck (whale-body) — metallic livery */}
      <path d="M14,58 L30,50 L98,49 Q116,50 116,58 Q116,66 98,67 L34,66 Q18,65 14,60 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M36,53 Q46,31 74,30 Q100,31 106,53 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M41,50 Q52,35 72,34" fill="none" stroke={P.metal.shine} strokeWidth="0.7" opacity="0.4" />
      {/* faction band */}
      <rect x="20" y="57" width="90" height="3.4" fill={palette.mid} opacity="0.9" />
      {/* sparse cabin windows (automated freighter) */}
      <g fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.3"><circle cx="50" cy="51.4" r="1.1" /><circle cx="58" cy="51.4" r="1.1" /><circle cx="66" cy="51.4" r="1.1" /></g>
      {/* cargo door on flank */}
      <rect x="74" y="46" width="10" height="10" rx="1" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
      {/* upswing nose cargo-door seam */}
      <path d="M102,40 Q107,52 104,66" fill="none" stroke={P.ink.line} strokeWidth="0.6" opacity="0.55" />
      {/* AUTONOMOUS nose sensor blister (no cockpit) — glowing eye */}
      <ellipse cx="109" cy="56" rx="5" ry="4.4" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="1" />
      <g transform="translate(110 55)"><g className="cq-glow"><circle r="2.2" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.5" /><circle r="0.8" fill={P.metal.shine} opacity="0.8" /></g></g>
      {/* NEAR wing (lower) + two engine pods over the fuselage */}
      <path d="M76,58 L20,80 L34,82 L78,61 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
      <g transform="translate(42 70) scale(0.8)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      <g transform="translate(58 72) scale(0.8)"><rect x="-8" y="-4" width="18" height="9" rx="4.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" /><ellipse cx="10" cy="0.5" rx="2.2" ry="4.2" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="0.5" /></g>
      {/* spine COMMS-GLOBE beacon + orbit arc — the "global network" identity (🌐) */}
      <line x1="72" y1="31" x2="72" y2="25" stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M60,23 Q72,13 84,23" fill="none" stroke={palette.bright} strokeWidth="0.7" opacity="0.55" />
      <g transform="translate(72 21)"><g className="cq-glow"><circle r="4" fill={P.ground.water} stroke={P.ink.line} strokeWidth="0.6" /><ellipse cx="0" cy="0" rx="4" ry="1.5" fill="none" stroke={P.metal.shine} strokeWidth="0.6" opacity="0.85" /><ellipse cx="0" cy="0" rx="1.5" ry="4" fill="none" stroke={P.metal.shine} strokeWidth="0.6" opacity="0.85" /></g></g>
      {/* WORK = delivering goods: coin glint above the cargo door (.cq-deliver) */}
      <g className="cq-deliver">
        <ellipse cx="80" cy="40" rx="4.5" ry="1.8" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="80" cy="37.8" rx="4.5" ry="1.8" fill="#e8c64a" stroke={P.ink.line} strokeWidth="0.5" />
        <ellipse cx="88" cy="41" rx="3.2" ry="1.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.4" />
      </g>
      <Banner x={64} y={9} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 4): stealth_bomber previously reused JetFighterSprite — a
// conventional fuselage-and-wings fighter. Stealth Bomber is the era-12 (stealth-technology,
// 🛩️) low-observable strategic bomber. Its whole identity is stealth: a genuine tailless
// FLYING WING — one continuous faceted planform with a sawtooth trailing edge, NO vertical
// fin and NO separate fuselage — a silhouette family shared by no other aircraft in the
// catalog. Belly bomb-bay (bombard); a pulsing radar-cloak shimmer reads its evasion identity.
export function StealthBomberSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const wing = 'M112,64 L42,38 L68,52 L56,57 L66,64 L56,71 L68,76 L42,90 Z';
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={112} rx={50} ry={4} />
      {/* radar-cloak shimmer — a ghost of the planform, pulsing (evasion identity) */}
      <g className="cq-glow"><path d={wing} fill="none" stroke={palette.bright} strokeWidth="1.6" opacity="0.5" /></g>
      {/* one continuous faceted FLYING WING — no fuselage, no tail fin */}
      <path d={wing} fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M112,64 L42,38 L68,52 L66,64 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M112,64 L42,90 L68,76 L66,64 Z" fill="#3a4149" stroke={P.ink.line} strokeWidth="0.5" />
      {/* faceted panel lines */}
      <line x1="112" y1="64" x2="66" y2="64" stroke={P.ink.line} strokeWidth="0.5" opacity="0.7" />
      <line x1="94" y1="56" x2="60" y2="50" stroke={P.ink.line} strokeWidth="0.4" opacity="0.4" />
      <line x1="94" y1="72" x2="60" y2="78" stroke={P.ink.line} strokeWidth="0.4" opacity="0.4" />
      <line x1="78" y1="60" x2="72" y2="52" stroke={P.ink.line} strokeWidth="0.4" opacity="0.35" />
      <line x1="78" y1="68" x2="72" y2="76" stroke={P.ink.line} strokeWidth="0.4" opacity="0.35" />
      {/* faction leading-edge accents */}
      <path d="M112,64 L42,38" fill="none" stroke={palette.mid} strokeWidth="2" opacity="0.9" strokeLinecap="round" />
      <path d="M112,64 L42,90" fill="none" stroke={palette.mid} strokeWidth="2" opacity="0.9" strokeLinecap="round" />
      {/* blended low cockpit bump (no glass bubble) */}
      <path d="M97,60 L86,58 L84,64 L95,66 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" />
      <path d="M95,61 L88,60 L87,63 Z" fill={P.metal.shine} opacity="0.35" />
      {/* belly BOMB-BAY centerline slot (bombard) */}
      <rect x="66" y="62.6" width="24" height="3" fill="#25292f" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="78" y1="62.6" x2="78" y2="65.6" stroke={P.ink.line} strokeWidth="0.4" opacity="0.7" />
      {/* faction chevron marking */}
      <path d="M70,48 L78,50 L74,54 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.4" />
      <Banner x={64} y={22} palette={palette} scale={0.46} />
    </SpriteFrame>
  );
}

// #769 de-alias (batch 5): wwii_fighter previously reused JetFighterSprite — a swept
// delta jet with an afterburner glow. This is a WWII single-engine PROPELLER fighter
// (F4U/F6F/P-51 family), one generation past the WWI BiplaneSprite and one before the
// jet. Drawn as a SIDE PROFILE facing right, ~5° nose-up and banked slightly toward the
// viewer so both wings show: spinning propeller disc (not a jet nose cone), radial
// cowling, bubble canopy, straight tapered wings, and NO afterburner.
export function WwiiFighterSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={110} rx={40} ry={5} />
      <g transform="rotate(-5 64 64)">
        {/* far wing — foreshortened, sweeping up-back behind the fuselage */}
        <path d="M66,59 L52,61 L37,44 Q35,41 40,43 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <g transform="translate(48 51)"><circle r="3.1" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.5" /><circle r="1.8" fill={palette.trim} /><circle r="0.8" fill={palette.dark} /></g>
        {/* horizontal stabilizer + vertical tail fin */}
        <path d="M24,66 L7,62 L7,65 L24,68 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.9" />
        <path d="M22,67 L15,45 L21,45 L33,64 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.1" />
        <path d="M17,49 L20,47 L27,58 L24,59 Z" fill={palette.mid} opacity="0.85" />
        {/* fuselage — tapered, tail-left to cowl-right */}
        <path d="M20,69 Q24,65 44,63 L74,57 Q86,55 93,60 Q86,65 74,64 L44,71 Q26,72 20,69 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M27,66.5 L74,60 Q85,58.5 91,60.6 Q85,60 74,61.6 L29,68 Z" fill={P.metal.shine} opacity="0.25" />
        <rect x="49" y="62" width="20" height="3" fill={palette.mid} />
        <g transform="translate(40 63.5)"><circle r="4" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.6" /><circle r="2.4" fill={palette.trim} /><circle r="1" fill={palette.dark} /></g>
        {/* bubble canopy */}
        <path d="M54,58 L60,49 L72,48.5 L77,57 Z" fill={P.cloth.dye} stroke={P.ink.line} strokeWidth="1" />
        <path d="M58,57 L62,50 L70,49.6 L73,56 Z" fill={palette.bright} opacity="0.5" />
        <line x1="66" y1="49" x2="66" y2="57" stroke={P.ink.line} strokeWidth="0.4" opacity="0.5" />
        {/* radial piston-engine cowling */}
        <path d="M83,58 Q92,55 96,60 Q92,66 83,64 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.1" />
        <circle cx="88" cy="60" r="6.5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="88" cy="60" r="3" fill={P.ink.soft} />
        {/* spinner + spinning propeller disc */}
        <g transform="translate(99 59)">
          <g className="cq-wheel" style="animation-duration:0.25s">
            <ellipse cx="0" cy="0" rx="2.2" ry="20" fill={P.ink.line} opacity="0.22" />
            <rect x="-1.3" y="-20" width="2.6" height="40" rx="1.3" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.5" />
          </g>
          <circle r="2.6" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.6" />
        </g>
        {/* near wing — broad, sweeping down toward the viewer, in front of the fuselage */}
        <path d="M72,64 L48,67 L57,90 Q59,93 61,90 L69,78 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M72,64 L48,67 L53,79 L70,74 Z" fill={P.metal.shine} opacity="0.22" />
        <g transform="translate(60 76)"><circle r="3.6" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.6" /><circle r="2.2" fill={palette.trim} /><circle r="0.9" fill={palette.dark} /></g>
        <Banner x={17} y={38} palette={palette} scale={0.5} />
      </g>
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

/* === ERA 13 file-local helpers (same convention as mountedRider / spyBase) === */

// One ducted-fan ring. Shared by CombatDrone and DroneController's micro-drone.
function ductedFan(x: number, y: number, r = 7.5): string {
  const b = r - 3;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={r} fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
      <circle r={b} fill="#181830" stroke={P.metal.steel} strokeWidth="0.7" />
      <path d={`M0,0 L0,${-b} M0,0 L${b * 0.87},${b * 0.5} M0,0 L${-b * 0.87},${b * 0.5}`}
        stroke={P.metal.steel} strokeWidth="0.9" strokeLinecap="round" opacity="0.85" />
      <circle r="1.2" fill={P.metal.steel} />
    </g>
  );
}

// Enclosed visor helmet, drawn in Humanoid head-local coords (head centre 0,-30).
function helmetVisor(palette: FactionPalette): string {
  return (
    <g>
      <path d="M-10,-31 Q-11,-42 0,-43 Q11,-42 10,-31 L9,-26 L-9,-26 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.9" />
      <path d="M-8,-34 Q0,-38 8,-34 L7,-29 L-7,-29 Z" fill="#0a0a20" stroke={P.ink.line} strokeWidth="0.6" />
      <line className="cq-glow" x1="-6" y1="-31.5" x2="6" y2="-31.5" stroke={palette.bright} strokeWidth="0.9" />
    </g>
  );
}

// Miniature CombatDrone for the DroneController's companion.
function microDrone(x: number, y: number, palette: FactionPalette): string {
  return (
    <g transform={`translate(${x} ${y}) scale(0.82)`}>
      <line x1="-6" y1="0" x2="-11" y2="-3" stroke={P.metal.iron} strokeWidth="2" strokeLinecap="round" />
      <line x1="6" y1="0" x2="11" y2="-3" stroke={P.metal.iron} strokeWidth="2" strokeLinecap="round" />
      <circle cx="-12" cy="-3" r="3.4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
      <circle cx="-12" cy="-3" r="1.9" fill="#181830" />
      <circle cx="12" cy="-3" r="3.4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
      <circle cx="12" cy="-3" r="1.9" fill="#181830" />
      <path d="M-6,-3 L4,-3 L8,1 L4,5 L-6,5 L-9,1 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
      <circle cx="5" cy="1" r="3" fill="#0a0a20" stroke={P.ink.line} strokeWidth="0.6" />
      <circle className="cq-glow" cx="5" cy="1" r="1.6" fill="#00aaff" />
    </g>
  );
}

/* === SPRITE 1 — CombatDroneSprite  (air · replaces JetFighterSprite) ===
   Dominant: boxy chassis + glowing cyan sensor eye. Quadcopter ducted fans
   (not swept wings) + a slung payload pod read as quieter supporting detail. */
export function CombatDroneSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow cx={64} cy={108} rx={34} ry={4} />
      {/* rear sensor whisker */}
      <line x1="42" y1="52" x2="24" y2="40" stroke={P.metal.steel} strokeWidth="1.2" strokeLinecap="round" />
      <circle cx="24" cy="40" r="1.5" fill={palette.bright} />
      {/* struts chassis -> fans */}
      <line x1="52" y1="54" x2="32" y2="44" stroke={P.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="76" y1="54" x2="96" y2="44" stroke={P.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="52" y1="66" x2="36" y2="78" stroke={P.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      <line x1="76" y1="66" x2="92" y2="78" stroke={P.metal.iron} strokeWidth="3.4" strokeLinecap="round" />
      {/* ducted fans — supporting */}
      {ductedFan(30, 42)}
      {ductedFan(98, 42)}
      {ductedFan(36, 80)}
      {ductedFan(92, 80)}
      {/* payload pod underneath */}
      <g transform="translate(60 72)">
        <rect x="-9" y="0" width="18" height="9" rx="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-9" y="0" width="18" height="2.4" fill={P.metal.steel} />
        <circle className="cq-glow" cx="7" cy="5" r="1.5" fill={palette.bright} />
      </g>
      {/* CHASSIS — dominant solid mass */}
      <path d="M44,50 L74,48 L86,59 L74,70 L44,70 L38,60 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M44,50 L74,48 L80,53 L44,55 Z" fill={P.metal.shine} opacity="0.16" />
      <line x1="48" y1="54" x2="72" y2="53" stroke={P.metal.steel} strokeWidth="0.7" opacity="0.75" />
      <line x1="46" y1="65" x2="74" y2="65" stroke={P.metal.steel} strokeWidth="0.7" opacity="0.75" />
      <rect x="44" y="58" width="30" height="2.2" fill={palette.trim} opacity="0.9" />
      {/* SENSOR EYE — single dominant read at 32px */}
      <circle cx="82" cy="59" r="8.4" fill="#0a0a20" stroke={P.ink.line} strokeWidth="1" />
      <circle className="cq-glow" cx="82" cy="59" r="4.6" fill="#00aaff" />
      <circle cx="80" cy="57" r="1.4" fill="#b8d4e8" />
      {/* ATTACK — payload muzzle flash forward of the pod */}
      <g transform="translate(96 68)"><g className="cq-muzzle-flash">
        <circle r="4" fill="#ffd966" />
        <circle r="2" fill="#fff" />
      </g></g>
      <Banner x={58} y={38} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}

/* === SPRITE 2 — AutonomousFrigateSprite  (naval · replaces IroncladSprite) ===
   Dominant: low, angular faceted stealth hull (vs Ironclad's rounded riveted
   slab). Slim sensor mast + one remote turret; no smokestack, no crew. */
export function AutonomousFrigateSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <Shadow cx={64} cy={100} rx={48} ry={6} />
      {/* bow (right) + stern (left) wake — white curved lines */}
      <path d="M104,91 Q118,89 125,95" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.5" strokeLinecap="round" />
      <path d="M100,96 Q115,96 122,101" fill="none" stroke="#fff" strokeWidth="1" opacity="0.32" strokeLinecap="round" />
      <path d="M22,92 Q9,92 2,98" fill="none" stroke="#fff" strokeWidth="1" opacity="0.3" strokeLinecap="round" />
      {/* HULL — faceted stealth wedge (dominant) */}
      <path d="M14,82 L92,79 L120,90 L98,98 L20,98 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M14,82 L34,90 L20,98 Z" fill={palette.dark} opacity="0.55" stroke={P.ink.line} strokeWidth="0.5" />
      <path d="M92,79 L120,90 L98,98 L84,90 Z" fill={palette.dark} opacity="0.42" stroke={P.ink.line} strokeWidth="0.5" />
      <line x1="34" y1="90" x2="84" y2="90" stroke={P.metal.steel} strokeWidth="0.7" opacity="0.7" />
      <line x1="50" y1="81" x2="58" y2="90" stroke={P.metal.steel} strokeWidth="0.6" opacity="0.6" />
      <line x1="74" y1="80" x2="82" y2="90" stroke={P.metal.steel} strokeWidth="0.6" opacity="0.6" />
      {/* waterline stripe */}
      <line x1="22" y1="96" x2="98" y2="96" stroke={palette.bright} strokeWidth="1.4" opacity="0.4" />
      {/* faceted low deckhouse */}
      <path d="M46,79 L78,77 L82,68 L58,64 L44,72 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M58,64 L82,68 L78,77 L64,74 Z" fill={palette.dark} opacity="0.45" />
      <line x1="50" y1="72" x2="74" y2="70" stroke={P.metal.steel} strokeWidth="0.6" opacity="0.7" />
      {/* remote turret amidships — low box on ring mount */}
      <g transform="translate(52 66)">
        <ellipse cx="0" cy="2.5" rx="7" ry="2.4" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.7" />
        <path d="M-5,1.5 L5,1.5 L4,-4.5 L-4,-4.5 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <circle className="cq-glow" cx="0" cy="-1.5" r="1.4" fill={palette.bright} />
      </g>
      {/* SENSOR MAST + phased-array panel (replaces the smokestack) */}
      <line x1="72" y1="66" x2="72" y2="36" stroke={P.metal.steel} strokeWidth="2.2" />
      <g transform="translate(72 37)">
        <rect x="-6" y="-8" width="12" height="12" rx="1" fill="#112244" stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="-4" y1="-5" x2="4" y2="-5" stroke="#00aaff" strokeWidth="0.7" opacity="0.9" />
        <line x1="-4" y1="-2" x2="4" y2="-2" stroke="#00aaff" strokeWidth="0.7" opacity="0.65" />
        <line className="cq-glow" x1="-4" y1="1" x2="4" y2="1" stroke="#00aaff" strokeWidth="0.7" />
      </g>
      {/* ATTACK — turret muzzle flash */}
      <g transform="translate(52 60)"><g className="cq-muzzle-flash">
        <circle r="4" fill="#ffd966" />
        <circle r="2" fill="#fff" />
      </g></g>
      <Banner x={72} y={30} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}

/* === SPRITE 3 — ExosuitInfantrySprite  (humanoid · replaces MachineGunnerSprite) ===
   Dominant: segmented armored torso shell over a visible person. Hydraulic
   struts + enclosed visor helmet + bulky rifle as supporting detail. */
export function ExosuitInfantrySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      {/* power unit backpack between the shoulders */}
      <g transform="translate(55 50)">
        <rect x="-7" y="-8" width="14" height="18" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-7" y="-8" width="14" height="3" fill={P.metal.steel} />
        <circle className="cq-glow" cx="0" cy="4" r="1.6" fill="#00ff44" />
      </g>
      {/* person inside */}
      <Humanoid cx={64} cy={70} scale={1.05} cloth={P.cloth.wool} pants="#3a3628" accent={palette.dark} skin={P.skin.warm} hair="#2a1a10"
        hat={helmetVisor(palette)}
      />
      {/* leg greaves + knee pistons */}
      <g>
        <rect x="52" y="84" width="8" height="16" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="51" y="82" width="10" height="4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="56" cy="84" r="1.7" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <rect x="68" y="84" width="8" height="16" rx="2" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="67" y="82" width="10" height="4" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="72" cy="84" r="1.7" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* TORSO PLATE — dominant */}
      <path d="M50,52 Q64,48 78,52 L80,74 Q64,80 48,74 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M50,52 Q64,48 78,52 L79,60 Q64,56 49,60 Z" fill={P.metal.shine} opacity="0.18" />
      <line x1="64" y1="50" x2="64" y2="78" stroke={P.metal.steel} strokeWidth="0.8" opacity="0.7" />
      <line x1="50" y1="62" x2="78" y2="62" stroke={P.metal.steel} strokeWidth="0.8" opacity="0.7" />
      <path d="M56,68 L72,68 L70,74 L58,74 Z" fill={palette.dark} opacity="0.5" />
      {/* shoulder pauldrons + arm struts */}
      <g>
        <ellipse cx="47" cy="56" rx="7" ry="6" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="47" cy="55" rx="5" ry="3.4" fill={P.metal.shine} opacity="0.2" />
        <rect x="44" y="60" width="3" height="18" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="45.5" cy="68" r="1.7" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      <g>
        <ellipse cx="81" cy="56" rx="7" ry="6" fill={palette.mid} stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="81" cy="55" rx="5" ry="3.4" fill={P.metal.shine} opacity="0.2" />
        <rect x="81" y="60" width="3" height="16" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="82.5" cy="67" r="1.7" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.5" />
      </g>
      {/* WEAPON — bulky braced rifle. Static: gun units fire via muzzle flash +
          body recoil (cq2-attack-body), never the melee overhead swing. */}
      <g transform="translate(84 74) rotate(-24)">
          <rect x="-22" y="-3" width="34" height="7" rx="1.5" fill="#181830" stroke={P.ink.line} strokeWidth="0.8" />
          <rect x="-22" y="-3" width="34" height="2" fill={P.metal.steel} opacity="0.6" />
          <rect x="10" y="-1.5" width="11" height="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <rect x="-16" y="4" width="5" height="8" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
          <circle className="cq-glow" cx="-18" cy="0" r="1.4" fill={palette.bright} />
      </g>
      {/* ATTACK — rifle muzzle flash at the barrel tip (only fires on data-state=attack) */}
      <g transform="translate(104 65)"><g className="cq-muzzle-flash">
        <circle r="3.6" fill="#ffd966" />
        <circle r="1.8" fill="#fff" />
      </g></g>
      <Banner x={42} y={40} palette={palette} scale={0.6} />
    </SpriteFrame>
  );
}

/* === SPRITE 4 — PropagandistSprite  (humanoid civilian · replaces MissionarySprite) ===
   Dominant: bare-headed modern-dress civilian (vs Missionary's robed hood).
   Held speaker/projector rig + broadcast arcs replace the swinging censer. */
export function PropagandistSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      {/* modern civilian — no hat/hood, muted vest */}
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.wool} pants="#3a3628" accent={palette.mid} skin={P.skin.warm} hair="#2a1a10" />
      {/* open collar / zip line — reads as a modern jacket */}
      <path d="M58,50 L64,60 L70,50" fill="none" stroke={palette.dark} strokeWidth="1.1" />
      <line x1="64" y1="52" x2="64" y2="70" stroke={palette.dark} strokeWidth="0.7" opacity="0.7" />
      {/* broadcast arcs from the speaker */}
      <g className="cq-glow" transform="translate(93 58)">
        <path d="M2,-8 Q10,-2 2,8" fill="none" stroke={palette.bright} strokeWidth="1.2" opacity="0.75" />
        <path d="M6,-13 Q18,-2 6,13" fill="none" stroke={palette.bright} strokeWidth="1" opacity="0.4" />
      </g>
      {/* SPEAKER / PROJECTOR — held out, right hand */}
      <g transform="translate(84 58) rotate(-10)">
        <rect x="-8" y="-10" width="16" height="21" rx="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="-8" y="-10" width="16" height="3" fill={P.metal.steel} />
        <rect x="-6" y="-8" width="4" height="2" fill={palette.trim} />
        <circle cx="0" cy="2" r="6.2" fill="#0a0a20" stroke={P.ink.line} strokeWidth="0.9" />
        <circle className="cq-glow" cx="0" cy="2" r="6.2" fill="none" stroke={palette.bright} strokeWidth="1.4" />
        <circle cx="0" cy="2" r="2.2" fill={P.metal.iron} stroke={P.metal.steel} strokeWidth="0.5" />
      </g>
      <Banner x={48} y={44} palette={palette} scale={0.55} />
    </SpriteFrame>
  );
}

/* === SPRITE 5 — DroneControllerSprite  (humanoid · replaces SpyHackerSprite) ===
   Dominant: open-stance field technician in a wool vest (no cloak). Signature
   supporting detail: a companion micro-drone + a glowing tablet control rig. */
export function DroneControllerSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      {/* field-tech figure — wool vest, soft cap, no cloak */}
      <Humanoid cx={64} cy={70} scale={0.95} cloth={P.cloth.wool} pants="#3a3628" accent={palette.mid} skin={P.skin.warm} hair="#2a1a10"
        hat={<path d="M-9,-37 Q0,-42 9,-37 L10,-34 L-10,-34 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" />}
      />
      {/* CONTROL RIG — held in both hands */}
      <g transform="translate(64 71)">
        <rect x="-13" y="-5" width="26" height="14" rx="2" fill="#0a0a20" stroke={P.ink.line} strokeWidth="1" />
        <rect x="-11" y="-3" width="22" height="10" rx="1" fill="#112244" />
        <rect className="cq-glow" x="-11" y="-3" width="22" height="10" rx="1" fill={palette.bright} opacity="0.22" />
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#00aaff" strokeWidth="0.8" opacity="0.9" />
        <line x1="-8" y1="3.2" x2="3" y2="3.2" stroke="#00aaff" strokeWidth="0.8" opacity="0.65" />
        {/* whip antenna */}
        <line x1="11" y1="-5" x2="21" y2="-21" stroke={P.metal.steel} strokeWidth="1.2" strokeLinecap="round" />
        <circle className="cq-glow" cx="21" cy="-21" r="1.6" fill={palette.bright} />
      </g>
      {/* MICRO-DRONE companion — above the right shoulder (the signature read) */}
      {microDrone(93, 33, palette)}
      {/* ATTACK — the companion drone fires a spark */}
      <g transform="translate(101 33)"><g className="cq-muzzle-flash">
        <circle r="2.6" fill="#ffd966" />
        <circle r="1.3" fill="#fff" />
      </g></g>
      <Banner x={44} y={46} palette={palette} scale={0.5} />
    </SpriteFrame>
  );
}
