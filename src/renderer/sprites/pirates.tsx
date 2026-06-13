import {
  Banner,
  MATERIAL_PALETTE as P,
  Shadow,
  SpriteFrame,
} from './sprite-system';
import type { UnitSpriteProps } from './units';

function PiratePennant({ x, y, palette, scale = 1 }: { x: number; y: number; palette: UnitSpriteProps['palette']; scale?: number }): string {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <Banner palette={palette} shape="pennant" />
      <circle cx="6" cy="-7" r="2.4" fill={P.ink.line} />
      <path d="M3,-4 L9,-10 M3,-10 L9,-4" stroke={P.cloth.linen} strokeWidth="1" />
    </g>
  );
}

function Wake({ broad = false }: { broad?: boolean } = {}): string {
  return (
    <g fill="none" stroke={P.ground.water} strokeLinecap="round" opacity="0.8">
      <path d={broad ? 'M10,106 Q36,96 56,105 M72,105 Q94,96 120,106' : 'M18,104 Q38,97 55,103 M74,103 Q92,97 112,104'} strokeWidth="2.2" />
      <path d="M30,112 Q48,106 60,111 M68,111 Q82,106 98,112" stroke={P.cloth.linen} strokeWidth="1.4" opacity="0.7" />
    </g>
  );
}

export function PirateGalleySprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const oars = [26, 40, 54, 74, 88, 102].map((x, index) => (
    <line x1={x} y1={84 + (index % 2)} x2={x < 64 ? x - 13 : x + 13} y2="101" stroke={P.wood.dark} strokeWidth="2" strokeLinecap="round" />
  )).join('');
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="galley">
        <Shadow cx={64} cy={99} rx={45} ry={7} />
        <Wake />
        {oars}
        <path d="M12,80 Q64,72 116,80 L108,97 Q64,103 20,97 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.4" />
        <path d="M18,78 Q64,70 110,78 L104,87 Q64,93 24,87 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M22,86 Q64,92 106,86" fill="none" stroke={palette.mid} strokeWidth="4" opacity="0.85" />
        <path d="M12,82 L1,89 L13,91 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="61" y1="76" x2="61" y2="20" stroke={P.wood.dark} strokeWidth="2.6" />
        <path d="M61,24 L96,38 L92,70 L61,74 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M61,24 L38,40 L40,69 L61,74 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M61,43 L94,44 L92,55 L61,54 Z M40,44 L61,43 L61,54 L40,55 Z" fill={palette.mid} opacity="0.9" />
        <circle cx="76" cy="55" r="5" fill={P.ink.line} />
        <circle cx="74" cy="53" r="1" fill={P.cloth.linen} />
        <circle cx="78" cy="53" r="1" fill={P.cloth.linen} />
        <path d="M73,57 L79,57 M74,59 L78,55 M74,55 L78,59" stroke={P.cloth.linen} strokeWidth="0.8" />
        <rect x="88" y="67" width="16" height="12" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="91" y="69" width="3" height="4" fill={P.ink.line} />
        <rect x="98" y="69" width="3" height="4" fill={P.ink.line} />
        <PiratePennant x={61} y={20} palette={palette} scale={0.78} />
      </g>
    </SpriteFrame>
  );
}

export function PirateCorsairSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="corsair">
        <Shadow cx={64} cy={98} rx={48} ry={7} />
        <Wake />
        <path d="M8,84 Q62,73 120,80 Q110,100 64,103 Q22,101 8,84 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.4" />
        <path d="M16,79 Q64,70 112,77 L104,90 Q64,95 24,90 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M12,86 Q64,92 112,84" fill="none" stroke={palette.bright} strokeWidth="2" opacity="0.8" />
        <path d="M8,84 L-2,79 L2,90 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="47" y1="76" x2="47" y2="25" stroke={P.wood.dark} strokeWidth="2.4" />
        <line x1="77" y1="74" x2="77" y2="14" stroke={P.wood.dark} strokeWidth="2.6" />
        <line x1="27" y1="31" x2="72" y2="48" stroke={P.wood.dark} strokeWidth="1.8" />
        <line x1="55" y1="21" x2="108" y2="42" stroke={P.wood.dark} strokeWidth="2" />
        <path d="M30,32 L70,48 L48,68 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M58,22 L106,42 L79,68 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="1" />
        <path d="M58,22 L87,34 L78,48 Z" fill={palette.mid} opacity="0.9" />
        <path d="M31,32 L52,40 L47,51 Z" fill={palette.dark} opacity="0.9" />
        <circle cx="38" cy="82" r="2.4" fill={P.ink.line} stroke={P.metal.bronze} strokeWidth="0.8" />
        <circle cx="55" cy="80" r="2.4" fill={P.ink.line} stroke={P.metal.bronze} strokeWidth="0.8" />
        <circle cx="72" cy="80" r="2.4" fill={P.ink.line} stroke={P.metal.bronze} strokeWidth="0.8" />
        <rect x="94" y="62" width="17" height="16" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.9" />
        <path d="M94,62 L111,62 L108,57 L98,57 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.7" />
        <PiratePennant x={77} y={14} palette={palette} scale={0.82} />
      </g>
    </SpriteFrame>
  );
}

export function PirateFrigateSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const cannonPorts = [31, 46, 61, 76, 91].map(x => (
    <g><rect x={x - 3} y="84" width="6" height="5" rx="1" fill={P.ink.line} /><circle cx={x} cy="86.5" r="1.4" fill={P.metal.iron} /></g>
  )).join('');
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="frigate">
        <Shadow cx={64} cy={101} rx={53} ry={8} />
        <Wake broad />
        <path d="M6,81 Q64,70 122,80 L113,101 Q65,108 14,101 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M12,77 Q64,68 116,76 L109,91 Q64,97 19,91 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M11,91 Q64,99 116,90" fill="none" stroke={palette.mid} strokeWidth="3.2" />
        {cannonPorts}
        <path d="M6,82 L-4,87 L7,91 Z" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M99,55 L119,55 L116,78 L99,76 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
        <rect x="103" y="62" width="4" height="6" fill={P.ink.soft} />
        <rect x="110" y="62" width="4" height="6" fill={P.ink.soft} />
        <line x1="38" y1="76" x2="38" y2="25" stroke={P.wood.dark} strokeWidth="2" />
        <line x1="68" y1="75" x2="68" y2="12" stroke={P.wood.dark} strokeWidth="2.6" />
        <line x1="91" y1="73" x2="91" y2="27" stroke={P.wood.dark} strokeWidth="2" />
        <path d="M24,31 Q38,35 52,31 L49,65 Q38,69 27,65 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="1" />
        <path d="M50,20 Q68,25 87,20 L83,68 Q68,72 54,68 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M79,33 Q91,36 104,32 L101,65 Q91,68 82,65 Z" fill={P.cloth.wool} stroke={P.ink.line} strokeWidth="1" />
        <path d="M52,40 Q68,44 85,40 L84,53 Q68,57 53,53 Z" fill={palette.mid} opacity="0.92" />
        <circle cx="68" cy="47" r="5" fill={P.ink.line} />
        <path d="M64,43 L72,51 M64,51 L72,43" stroke={P.cloth.linen} strokeWidth="1.3" />
        <PiratePennant x={68} y={12} palette={palette} scale={0.9} />
      </g>
    </SpriteFrame>
  );
}

export function PirateIroncladSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  const rivets = [24, 38, 52, 66, 80, 94, 108].map(x => <circle cx={x} cy="92" r="1.4" fill={P.metal.shine} opacity="0.75" />).join('');
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="ironclad">
        <Shadow cx={64} cy={101} rx={52} ry={8} />
        <Wake broad />
        <path d="M8,78 L120,78 L114,100 Q64,107 14,100 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M14,78 L114,78 L106,86 L22,86 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M12,88 Q64,96 116,87" fill="none" stroke={palette.dark} strokeWidth="4" opacity="0.9" />
        {rivets}
        <path d="M8,82 L-2,87 L9,92 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="42" cy="72" rx="17" ry="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
        <rect x="31" y="64" width="22" height="9" rx="3" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <line x1="31" y1="68" x2="12" y2="61" stroke={P.metal.iron} strokeWidth="4" strokeLinecap="round" />
        <line x1="30" y1="71" x2="10" y2="68" stroke={P.metal.iron} strokeWidth="3" strokeLinecap="round" />
        <rect x="63" y="39" width="13" height="37" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
        <rect x="61" y="38" width="17" height="5" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M66,48 L73,48 M66,56 L73,56" stroke={P.metal.steel} strokeWidth="1.5" />
        <g opacity="0.65">
          <ellipse cx="70" cy="33" rx="7" ry="5" fill={P.stone.mid} />
          <ellipse cx="76" cy="28" rx="8" ry="6" fill={P.stone.light} />
          <ellipse cx="84" cy="23" rx="6" ry="4" fill={P.stone.mid} />
        </g>
        <path d="M82,60 L108,60 L112,78 L80,78 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <rect x="88" y="65" width="5" height="5" fill={P.ink.line} />
        <rect x="99" y="65" width="5" height="5" fill={P.ink.line} />
        <PiratePennant x={96} y={57} palette={palette} scale={0.68} />
      </g>
    </SpriteFrame>
  );
}

export function PirateFastAttackCraftSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="fast-attack-craft">
        <Shadow cx={65} cy={100} rx={49} ry={7} />
        <Wake broad />
        <path d="M7,85 L32,72 L112,72 L122,82 L104,99 L25,98 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M12,85 L36,77 L113,77 L118,82 L101,90 L24,91 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M20,92 L105,91" stroke={palette.mid} strokeWidth="4" />
        <path d="M7,85 L-3,88 L10,91 Z" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.7" />
        <path d="M45,55 L87,55 L100,73 L34,73 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
        <path d="M50,58 L62,58 L58,68 L43,68 Z M66,58 L81,58 L91,68 L67,68 Z" fill="#6da0b8" stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="61" y="38" width="4" height="17" fill={P.metal.iron} />
        <path d="M63,38 L78,45 L63,48 Z" fill={palette.mid} stroke={P.ink.line} strokeWidth="0.7" />
        <line x1="63" y1="41" x2="54" y2="34" stroke={P.metal.iron} strokeWidth="1.4" />
        <circle cx="53" cy="33" r="4" fill="none" stroke={P.metal.steel} strokeWidth="1.4" />
        <line x1="49" y1="33" x2="57" y2="33" stroke={P.metal.steel} strokeWidth="1" />
        <ellipse cx="93" cy="68" rx="10" ry="5" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="88" y="62" width="10" height="7" rx="2" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <line x1="98" y1="65" x2="114" y2="58" stroke={P.metal.iron} strokeWidth="3" strokeLinecap="round" />
        <rect x="30" y="73" width="12" height="5" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="105" y="73" width="8" height="5" fill={P.ink.soft} />
        <path d="M106,75 L116,69 M108,78 L119,74" stroke={P.metal.steel} strokeWidth="1.2" />
        <PiratePennant x={63} y={39} palette={palette} scale={0.54} />
      </g>
    </SpriteFrame>
  );
}

export function PirateMothershipSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return (
    <SpriteFrame svgOnly={svgOnly} hexTint={P.ground.water}>
      <g data-kind="naval" data-pirate-hull="mothership">
        <Shadow cx={64} cy={103} rx={57} ry={9} />
        <Wake broad />
        <path d="M4,77 L121,77 L124,88 L109,104 Q64,110 12,103 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.5" />
        <path d="M10,73 L114,73 L120,81 L18,86 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.9" />
        <path d="M11,91 Q64,100 116,91" fill="none" stroke={palette.mid} strokeWidth="5" opacity="0.9" />
        <path d="M4,79 L-4,86 L7,91 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="18" y="58" width="45" height="17" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <path d="M22,61 L58,61 L58,70 L22,70 Z" fill="#52798c" stroke={P.ink.line} strokeWidth="0.6" />
        <line x1="40" y1="58" x2="40" y2="38" stroke={P.metal.iron} strokeWidth="3" />
        <path d="M40,39 L29,31 M40,39 L52,31" stroke={P.metal.steel} strokeWidth="1.6" />
        <ellipse cx="40" cy="30" rx="13" ry="4" fill="none" stroke={P.metal.steel} strokeWidth="1.5" />
        <line x1="27" y1="30" x2="53" y2="30" stroke={P.metal.steel} strokeWidth="1" />
        <rect x="67" y="49" width="8" height="25" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1" />
        <rect x="66" y="48" width="10" height="4" fill={palette.dark} />
        <g opacity="0.55"><ellipse cx="71" cy="43" rx="6" ry="4" fill={P.stone.mid} /><ellipse cx="77" cy="38" rx="8" ry="5" fill={P.stone.light} /></g>
        <path d="M80,55 L116,55 L116,73 L80,73 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <circle cx="98" cy="64" r="12" fill="none" stroke={P.cloth.linen} strokeWidth="1.5" />
        <path d="M88,64 L108,64 M98,54 L98,74" stroke={P.cloth.linen} strokeWidth="1.2" />
        <path d="M78,49 L92,35 L95,36 L88,54" fill="none" stroke={P.metal.iron} strokeWidth="2.2" />
        <line x1="92" y1="35" x2="109" y2="43" stroke={P.metal.iron} strokeWidth="2" />
        <line x1="108" y1="43" x2="105" y2="55" stroke={P.wood.dark} strokeWidth="1.2" />
        <path d="M22,87 Q31,80 42,86 L40,94 L24,94 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M47,89 Q56,82 67,88 L65,96 L49,96 Z" fill={palette.dark} stroke={P.ink.line} strokeWidth="0.8" />
        <PiratePennant x={42} y={42} palette={palette} scale={0.7} />
      </g>
    </SpriteFrame>
  );
}
