/* Unit sprites — one component per unit type.
 * All units take {faction, scale, animate} and render a 128x128 SpriteFrame.
 * Faction tint shows up on banner + cloth accents.
 */

const { SPRITE, Humanoid, SpriteFrame, Banner, Shadow, factionAccent } = window;
const P = SPRITE.PALETTE;

/* === CIVILIAN === */

function SettlerSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="civilian">
      <Shadow />
      {/* ox-cart wheel hint behind */}
      <g transform="translate(36 78)">
        <circle r="10" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="10" fill="none" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="-10" y1="0" x2="10" y2="0" stroke={P.wood.dark} strokeWidth="1" />
        <line x1="0" y1="-10" x2="0" y2="10" stroke={P.wood.dark} strokeWidth="1" />
        <circle r="2" fill={P.metal.iron} />
      </g>
      {/* bundle on back */}
      <g transform="translate(78 56)">
        <rect x="-10" y="-10" width="20" height="18" rx="3" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-10,-6 L10,-6 M-10,-2 L10,-2 M-10,2 L10,2" stroke={P.ink.soft} strokeWidth="0.6" />
        <Banner x={9} y={-10} faction={faction} scale={0.8} />
      </g>
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.linen} pants={P.cloth.wool} accent={f.mid} hair={P.ink.soft} />
      {/* walking staff */}
      <line x1="48" y1="36" x2="44" y2="92" stroke={P.wood.mid} strokeWidth="2.5" strokeLinecap="round" />
    </SpriteFrame>
  );
}

function WorkerSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="civilian">
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={f.mid} hair="#5a3a20" hat={
        <ellipse cx="0" cy="-40" rx="12" ry="3" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.6" />
      } />
      {/* shovel held diagonally */}
      <g transform="translate(76 42) rotate(28)"><g className="cq-weapon">
        <rect x="-1" y="0" width="2.4" height="46" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-5,46 L5,46 L4,58 L-4,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      </g></g>
      {/* tool belt pouch */}
      <rect x="58" y="74" width="8" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
    </SpriteFrame>
  );
}

/* === SCOUT FAMILY === */

function ScoutSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="civilian">
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth="#6b7a4a" pants={P.cloth.wool} accent={f.mid} hair="#3a2a1a" hat={
        <path d="M-10,-38 Q0,-46 10,-38 L10,-34 L-10,-34 Z" fill={f.dark} stroke={P.ink.line} strokeWidth="0.8" />
      } />
      {/* spyglass / hand at brow */}
      <g transform="translate(76 38)">
        <rect x="0" y="-2" width="14" height="4" rx="1" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="12" y="-3" width="3" height="6" fill={P.metal.gold} />
      </g>
      <Banner x={48} y={50} faction={faction} scale={0.7} />
    </SpriteFrame>
  );
}

function ScoutHoundSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="hound">
      <Shadow cx={64} cy={94} rx={24} />
      {/* dog body, side-3/4 */}
      <g transform="translate(64 70)">
        {/* tail */}
        <path d="M22,-4 Q32,-12 30,-22" stroke="#7a5a3a" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* body */}
        <ellipse cx="4" cy="0" rx="22" ry="12" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="20" ry="8" fill="#b88a5a" />
        {/* legs */}
        <rect x="-12" y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-2"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="14"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="20"  y="6" width="5" height="14" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        {/* head */}
        <ellipse cx="-18" cy="-4" rx="11" ry="9" fill="#a07a4a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-26,-3 L-32,2 L-26,4 Z" fill="#a07a4a" stroke={P.ink.line} strokeWidth="0.8" />
        {/* ear */}
        <path d="M-14,-12 L-10,-18 L-8,-10 Z" fill="#7a5a3a" stroke={P.ink.line} strokeWidth="0.6" />
        {/* eye, nose */}
        <circle cx="-22" cy="-4" r="0.9" fill={P.ink.line} />
        <circle cx="-30" cy="2" r="1.2" fill={P.ink.line} />
        {/* faction collar */}
        <rect x="-12" y="-6" width="14" height="3" fill={f.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <circle cx="-5" cy="-4.5" r="1.3" fill={f.trim} />
      </g>
    </SpriteFrame>
  );
}

function WarHoundSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="hound">
      <Shadow cx={64} cy={94} rx={26} />
      <g transform="translate(64 70)">
        <path d="M22,-4 Q32,-8 28,-18" stroke="#2a1a10" strokeWidth="4" fill="none" strokeLinecap="round" />
        <ellipse cx="4" cy="0" rx="24" ry="13" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <ellipse cx="4" cy="-3" rx="22" ry="9" fill="#5a3a20" />
        {/* spiked collar plates */}
        <rect x="-10" y="-8" width="18" height="5" fill={f.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <polygon points="-8,-8 -6,-12 -4,-8" fill={P.metal.iron} />
        <polygon points="-2,-8 0,-12 2,-8" fill={P.metal.iron} />
        <polygon points="4,-8 6,-12 8,-8" fill={P.metal.iron} />
        {/* legs (heavier) */}
        <rect x="-12" y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-3"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="13"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="20"  y="6" width="6" height="14" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        <ellipse cx="-18" cy="-4" rx="12" ry="10" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="1" />
        <path d="M-28,-3 L-34,4 L-26,5 Z" fill="#3a2a1a" stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-14,-14 L-10,-20 L-7,-12 Z" fill="#2a1a10" stroke={P.ink.line} strokeWidth="0.6" />
        {/* fang */}
        <polygon points="-30,4 -28,8 -26,4" fill={P.cloth.linen} />
        {/* glowing eye */}
        <circle cx="-22" cy="-5" r="1.4" fill={f.bright} />
        <circle cx="-32" cy="2" r="1.2" fill={P.ink.line} />
      </g>
    </SpriteFrame>
  );
}

function ShadowWardenSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="spy" hexTint="#3a2858">
      <Shadow />
      {/* cloak around figure */}
      <path d="M40,40 Q64,30 88,40 L96,98 Q64,108 32,98 Z" fill="#231833" stroke={P.ink.line} strokeWidth="1" />
      <path d="M48,42 Q64,36 80,42 L82,72 L46,72 Z" fill="#382656" stroke={P.ink.line} strokeWidth="0.8" />
      <Humanoid cx={64} cy={70} scale={0.95} cloth="transparent" pants="transparent" accent="transparent" skin={P.skin.cool} hair="#1a1020" hat={
        <path d="M-12,-38 Q0,-50 12,-38 L8,-30 L-8,-30 Z" fill="#1a1020" stroke={P.ink.line} strokeWidth="0.8" />
      } />
      {/* lantern */}
      <g transform="translate(86 64)">
        <rect x="-3" y="0" width="6" height="8" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <circle cx="0" cy="4" r="2.5" fill={f.bright} opacity="0.9" />
        <line x1="0" y1="-6" x2="0" y2="0" stroke={P.metal.iron} strokeWidth="0.8" />
      </g>
      <Banner x={42} y={48} faction={faction} scale={0.6} shape="square" />
    </SpriteFrame>
  );
}

/* === MELEE === */

function WarriorSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="melee">
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={f.mid} pants={P.cloth.wool} accent={f.dark} hair="#3a2a1a" />
      {/* round shield, left */}
      <g transform="translate(42 64)">
        <circle r="14" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
        <circle r="14" fill={f.mid} opacity="0.85" />
        <circle r="3" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-12,0 L12,0 M0,-12 L0,12" stroke={f.dark} strokeWidth="1.2" />
      </g>
      {/* club / axe right */}
      <g transform="translate(80 44) rotate(15)"><g className="cq-weapon">
        <rect x="-1.2" y="0" width="2.4" height="42" fill={P.wood.dark} />
        <path d="M-7,-6 L7,-6 L9,6 L-9,6 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M-7,-6 L7,-6 L7,-2 L-7,-2 Z" fill={P.metal.shine} opacity="0.5" />
      </g></g>
    </SpriteFrame>
  );
}

function SwordsmanSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="melee">
      <Shadow />
      {/* armored body */}
      <g transform="translate(64 70)">
        {/* legs greaves */}
        <ellipse cx="-6" cy="22" rx="4.5" ry="2.5" fill={P.metal.iron} />
        <ellipse cx="6" cy="22" rx="4.5" ry="2.5" fill={P.metal.iron} />
        <path d="M-9,4 Q-10,16 -7,22 L-3,22 Q-4,12 -3,4 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <path d="M9,4 Q10,16 7,22 L3,22 Q4,12 3,4 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        {/* breastplate */}
        <path d="M0,-22 C16,-20 18,-2 14,10 L-14,10 C-18,-2 -16,-20 0,-22 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="1" />
        <path d="M0,-22 C8,-18 9,-4 7,8 L-7,8 C-9,-4 -8,-18 0,-22 Z" fill={P.metal.shine} opacity="0.4" />
        {/* tabard */}
        <path d="M-6,-10 L6,-10 L8,14 L-8,14 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.8" />
        <circle cx="0" cy="2" r="3" fill={f.trim} />
        {/* shoulder pauldrons */}
        <ellipse cx="-15" cy="-12" rx="5" ry="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <ellipse cx="15" cy="-12" rx="5" ry="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        {/* head + helm */}
        <circle cx="0" cy="-30" r="9" fill={P.skin.warm} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-10,-32 Q-9,-42 0,-43 Q9,-42 10,-32 L10,-26 L-10,-26 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-10" y="-29" width="20" height="3" fill={P.ink.line} />
        <rect x="-2" y="-29" width="4" height="3" fill={P.metal.shine} opacity="0.3" />
        {/* plume */}
        <path d="M0,-43 Q-4,-52 0,-56 Q4,-52 0,-43 Z" fill={f.bright} stroke={f.dark} strokeWidth="0.6" />
      </g>
      {/* sword right hand */}
      <g transform="translate(80 36) rotate(20)"><g className="cq-weapon">
        <rect x="-0.8" y="0" width="1.6" height="42" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-5" y="42" width="10" height="2" fill={P.metal.gold} />
        <rect x="-1.5" y="42" width="3" height="8" fill={P.wood.dark} />
        <circle cx="0" cy="52" r="2" fill={P.metal.gold} />
      </g></g>
      {/* kite shield left */}
      <g transform="translate(42 60)">
        <path d="M-8,-12 L8,-12 L10,4 Q0,18 -10,4 Z" fill={f.mid} stroke={P.ink.line} strokeWidth="1" />
        <path d="M-6,-10 L6,-10 L8,2 Q0,12 -8,2 Z" fill={f.dark} opacity="0.6" />
      </g>
    </SpriteFrame>
  );
}

function PikemanSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="melee">
      <Shadow />
      {/* pike — extends past frame */}
      <g transform="translate(54 22) rotate(-8)"><g className="cq-weapon">
        <rect x="-1" y="0" width="2" height="100" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.5" />
        <path d="M-3,0 L3,0 L4,-12 L0,-18 L-4,-12 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
        <rect x="-3" y="-2" width="6" height="2" fill={P.metal.gold} />
      </g></g>
      <Humanoid cx={64} cy={70} scale={1} cloth={f.mid} pants={P.cloth.wool} accent={f.dark} hair="#3a2a1a" hat={
        <g>
          <path d="M-11,-33 Q-10,-44 0,-44 Q10,-44 11,-33 L11,-28 L-11,-28 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="0" cy="-44" rx="6" ry="2" fill={P.metal.iron} />
        </g>
      } />
    </SpriteFrame>
  );
}

/* === RANGED === */

function ArcherSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="ranged">
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth="#5a6e3a" pants={P.cloth.wool} accent={f.mid} hair="#3a2a1a" hat={
        <path d="M-10,-38 Q0,-48 10,-38 L8,-32 L-8,-32 Z" fill="#3a4a20" stroke={P.ink.line} strokeWidth="0.8" />
      } />
      {/* bow held vertically */}
      <g transform="translate(78 56)"><g className="cq-weapon">
        <path d="M0,-22 Q12,0 0,22" fill="none" stroke={P.wood.dark} strokeWidth="2.4" strokeLinecap="round" />
        <line x1="0" y1="-22" x2="0" y2="22" stroke={P.cloth.linen} strokeWidth="0.6" />
        <line x1="0" y1="0" x2="-10" y2="0" stroke={P.cloth.linen} strokeWidth="0.8" />
        <polygon points="-12,-1 -10,0 -12,1 -16,0" fill={P.metal.iron} />
      </g></g>
      {/* quiver */}
      <g transform="translate(48 56)">
        <rect x="-3" y="-10" width="6" height="20" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="-2" y="-14" width="1.5" height="6" fill={P.cloth.linen} />
        <rect x="0" y="-14" width="1.5" height="6" fill={f.mid} />
        <rect x="2" y="-14" width="1.5" height="6" fill={P.cloth.linen} />
      </g>
    </SpriteFrame>
  );
}

function MusketeerSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="ranged">
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={f.dark} pants="#3a3022" accent={f.bright} hair="#2a1a10" hat={
        <g>
          {/* tricorn */}
          <path d="M-16,-36 L16,-36 L0,-46 Z" fill="#1a1410" stroke={P.ink.line} strokeWidth="0.8" />
          <ellipse cx="0" cy="-34" rx="14" ry="3" fill="#1a1410" />
          <rect x="-12" y="-37" width="24" height="2" fill={f.trim} />
        </g>
      } />
      {/* musket vertical — grip at right hand, muzzle pointing up-forward */}
      <g transform="translate(92 38) rotate(20)"><g className="cq-weapon">
        <rect x="-1" y="0" width="2" height="56" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
        <rect x="-2" y="0" width="4" height="6" fill={P.metal.iron} />
        <path d="M-4,52 L4,52 L3,62 L-3,62 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.6" />
        <rect x="0" y="0" width="2" height="2" fill={P.metal.shine} />
      </g></g>
      {/* muzzle flash (visible on attack) — at the muzzle end */}
      <g transform="translate(92 38)"><g className="cq-muzzle-flash">
        <circle r="6" fill="#ffd966" />
        <circle r="3" fill="#fff" />
        <path d="M0,-9 L2,-3 L8,-2 L3,1 L4,7 L0,4 L-4,7 L-3,1 L-8,-2 L-2,-3 Z" fill="#ffd966" opacity="0.9" />
      </g></g>
      {/* powder horn */}
      <ellipse cx="48" cy="76" rx="4" ry="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
      <Banner x={86} y={56} faction={faction} scale={0.7} />
    </SpriteFrame>
  );
}

/* === NAVAL === */

function GalleySprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={96} rx={42} ry={6} />
      {/* hull */}
      <path d="M16,80 Q64,72 112,80 Q104,98 64,100 Q24,98 16,80 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M22,82 Q64,76 106,82 Q100,90 64,92 Q28,90 22,82 Z" fill={P.wood.light} />
      {/* shields along rail */}
      <circle cx="36" cy="80" r="4" fill={f.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="50" cy="78" r="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="64" cy="77" r="4" fill={f.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="78" cy="78" r="4" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="92" cy="80" r="4" fill={f.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* oars */}
      <line x1="28" y1="86" x2="14" y2="96" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="46" y1="86" x2="36" y2="98" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="82" y1="86" x2="92" y2="98" stroke={P.wood.dark} strokeWidth="2" />
      <line x1="100" y1="86" x2="114" y2="96" stroke={P.wood.dark} strokeWidth="2" />
      {/* mast + sail */}
      <line x1="64" y1="78" x2="64" y2="20" stroke={P.wood.dark} strokeWidth="2" />
      <path d="M64,24 L96,40 L96,66 L64,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M64,24 L42,40 L42,66 L64,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="64" y="34" width="32" height="8" fill={f.mid} opacity="0.8" />
      <rect x="42" y="34" width="22" height="8" fill={f.mid} opacity="0.8" />
      <Banner x={64} y={20} faction={faction} scale={0.9} />
      {/* ram */}
      <path d="M16,84 L4,90 L16,90 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

function TriremeSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={98} rx={48} ry={7} />
      {/* lower hull */}
      <path d="M10,86 Q64,76 118,86 Q108,104 64,106 Q20,104 10,86 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      {/* upper hull */}
      <path d="M16,80 Q64,70 112,80 Q102,90 64,92 Q26,90 16,80 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M22,76 Q64,68 106,76 L100,82 L28,82 Z" fill={P.wood.light} />
      {/* three rows of oars */}
      {[0,1,2].map(row => (
        <g key={row} transform={`translate(0 ${82 + row*4})`}>
          <line x1="28" y1="0" x2="14" y2={6 + row*2} stroke={P.wood.dark} strokeWidth="1.6" />
          <line x1="46" y1="0" x2="36" y2={8 + row*2} stroke={P.wood.dark} strokeWidth="1.6" />
          <line x1="82" y1="0" x2="92" y2={8 + row*2} stroke={P.wood.dark} strokeWidth="1.6" />
          <line x1="100" y1="0" x2="114" y2={6 + row*2} stroke={P.wood.dark} strokeWidth="1.6" />
        </g>
      ))}
      {/* castle aft */}
      {/* volley flashes (visible on attack) */}
      <g transform="translate(28 82)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="2" fill="#fff" /></g></g>
      <g transform="translate(100 82)"><g className="cq-muzzle-flash"><circle r="4" fill="#ffd966" /><circle r="2" fill="#fff" /></g></g>
      <rect x="92" y="62" width="18" height="14" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <rect x="94" y="64" width="3" height="4" fill={P.ink.line} />
      <rect x="100" y="64" width="3" height="4" fill={P.ink.line} />
      {/* mast */}
      <line x1="58" y1="76" x2="58" y2="14" stroke={P.wood.dark} strokeWidth="2.4" />
      <path d="M58,18 L98,38 L98,68 L58,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M58,18 L34,38 L34,68 L58,72 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="58" y="30" width="40" height="10" fill={f.mid} opacity="0.85" />
      <rect x="34" y="30" width="24" height="10" fill={f.mid} opacity="0.85" />
      <circle cx="78" cy="50" r="6" fill={f.trim} stroke={f.dark} strokeWidth="0.8" />
      <Banner x={58} y={16} faction={faction} scale={1} />
      {/* bronze ram */}
      <path d="M10,88 L-4,94 L10,96 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M10,90 L-2,94 L10,94 Z" fill={P.metal.gold} opacity="0.7" />
    </SpriteFrame>
  );
}

/* === SPIES — modern silhouette, even in early eras (they "appear from era") === */

function spyBase({ faction, hat, gadget, cloak = '#2a2a32', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="spy" hexTint="#241a36">
      <Shadow />
      {/* long coat */}
      <path d="M44,40 Q64,36 84,40 L92,98 Q64,104 36,98 Z" fill={cloak} stroke={P.ink.line} strokeWidth="1" />
      <path d="M52,42 L60,98 M76,42 L68,98" stroke={P.ink.line} strokeWidth="0.5" opacity="0.6" />
      <Humanoid cx={64} cy={70} scale={0.95} cloth="transparent" pants="transparent" accent="transparent" skin={P.skin.warm} hair="#1a1410" hat={hat} />
      {gadget}
      {/* faction pin on lapel */}
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrame>
  );
}

function SpyScoutSprite({ faction = 'imperials', state = 'idle' }) {
  return spyBase({
    faction, state,
    hat: <path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill="#1a1410" />,
    gadget: <g transform="translate(82 56)"><circle r="5" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.6" /><circle r="3" fill={P.ground.water} /></g>,
  });
}

function SpyInformantSprite({ faction = 'imperials', state = 'idle' }) {
  return spyBase({
    faction, state,
    hat: <ellipse cx="0" cy="-38" rx="14" ry="4" fill="#1a1410" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-6" width="8" height="12" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" /><line x1="-3" y1="-2" x2="3" y2="-2" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="1" x2="3" y2="1" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="4" x2="3" y2="4" stroke={P.ink.line} strokeWidth="0.5" /></g>,
  });
}

function SpyAgentSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return spyBase({
    faction, state,
    cloak: '#1c1c24',
    hat: <path d="M-13,-36 L13,-36 L11,-40 L-11,-40 Z M-15,-36 L15,-36 L15,-34 L-15,-34 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-3" width="10" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="6" cy="0" r="1.4" fill={f.bright} /></g>,
  });
}

function SpyOperativeSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return spyBase({
    faction, state,
    cloak: '#16161c',
    hat: <path d="M-11,-40 Q0,-44 11,-40 L11,-30 L-11,-30 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 56)"><path d="M-2,-8 L2,-8 L2,4 L4,8 L-4,8 L-2,4 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="0" cy="-10" r="2" fill={f.bright} /></g>,
  });
}

function SpyHackerSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return spyBase({
    faction, state,
    cloak: '#0e1820',
    hat: <path d="M-12,-40 Q0,-46 12,-40 L12,-28 L-12,-28 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(80 60)">
      <rect x="-7" y="-5" width="14" height="10" rx="1" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-5" y="-3" width="10" height="6" fill={f.bright} opacity="0.8" />
      <text x="0" y="1.2" fontSize="3" textAnchor="middle" fontFamily="monospace" fill="#0a0a10">01</text>
    </g>,
  });
}

/* === LATE-ERA NAVAL (Eras 3–5) === */

function CarrackSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={99} rx={47} ry={7} />
      {/* HULL — broad and high */}
      <path d="M10,82 Q64,72 118,82 Q110,103 64,106 Q18,103 10,82 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M18,78 Q64,70 110,78 L104,91 Q64,97 24,91 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M26,76 Q64,70 102,76 L98,82 L30,82 Z" fill={P.wood.light} />
      <path d="M14,85 Q64,93 114,85" fill="none" stroke={P.wood.dark} strokeWidth="1.1" opacity="0.7" />
      {/* mooring ropes */}
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
      <path d="M41,44 Q64,48 89,44 L88,57 Q64,61 42,57 Z" fill={f.mid} opacity="0.9" />
      <circle cx="64.5" cy="50" r="5" fill={f.trim} stroke={f.dark} strokeWidth="0.6" />
      <Banner x={64} y={16} faction={faction} scale={0.9} />
      {/* bronze ram + anchor hook */}
      <path d="M10,84 L0,90 L10,92 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
      <path d="M13,93 Q9,99 13,101" fill="none" stroke={P.metal.bronze} strokeWidth="1.4" strokeLinecap="round" />
    </SpriteFrame>
  );
}

function GalleonSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={101} rx={51} ry={8} />
      {/* HULL — widest */}
      <path d="M8,84 Q64,72 120,82 Q116,104 64,107 Q14,104 8,84 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M14,80 Q64,70 114,78 L108,92 Q64,98 20,92 Z" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M22,76 Q64,70 106,74 L102,80 L26,80 Z" fill={P.wood.light} />
      <path d="M12,85 Q64,93 116,83" fill="none" stroke={P.metal.gold} strokeWidth="1" opacity="0.55" />
      {/* hull gun ports */}
      <circle cx="40" cy="86" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="56" cy="87" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="72" cy="87" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="88" cy="86" r="2" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.5" />
      {/* FORECASTLE (left) */}
      <path d="M14,62 L30,62 L30,79 L14,80 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
      <path d="M14,62 L30,62 L30,65 L14,65 Z" fill={P.wood.mid} />
      {/* STERN CASTLE (right) */}
      <path d="M96,54 L118,54 L116,80 L96,78 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1" />
      <path d="M96,54 L118,54 L118,58 L96,58 Z" fill={P.wood.mid} />
      <rect x="100" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
      <rect x="106" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
      <rect x="111" y="62" width="4" height="6" fill={P.ink.soft} stroke={P.ink.line} strokeWidth="0.4" />
      {/* stern lantern */}
      <g transform="translate(116 50)"><g className="cq-glow"><circle r="2.4" fill={P.metal.gold} stroke={P.ink.line} strokeWidth="0.5" /></g></g>
      {/* FOREMAST (shorter) */}
      <line x1="40" y1="74" x2="40" y2="24" stroke={P.wood.dark} strokeWidth="2.2" />
      <line x1="26" y1="32" x2="54" y2="32" stroke={P.wood.dark} strokeWidth="1.6" strokeLinecap="round" />
      <path className="cq-sail" d="M27,33 Q40,36 53,33 L51,62 Q40,65 29,62 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M28,44 Q40,47 52,44 L51,53 Q40,56 29,53 Z" fill={f.mid} opacity="0.9" />
      {/* MAINMAST (taller) */}
      <line x1="72" y1="74" x2="72" y2="12" stroke={P.wood.dark} strokeWidth="2.4" />
      <line x1="54" y1="22" x2="92" y2="22" stroke={P.wood.dark} strokeWidth="1.8" strokeLinecap="round" />
      <path className="cq-sail" d="M55,23 Q72,27 91,23 L88,66 Q72,70 58,66 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path d="M57,40 Q72,44 89,40 L88,53 Q72,57 58,53 Z" fill={f.mid} opacity="0.9" />
      <circle cx="72.5" cy="46" r="5" fill={f.trim} stroke={f.dark} strokeWidth="0.6" />
      <Banner x={72} y={12} faction={faction} scale={1} />
      {/* prow figurehead */}
      <path d="M8,84 L-2,81 L1,89 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

function SteamshipSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={99} rx={45} ry={7} />
      {/* HULL — flat-topped, iron-banded */}
      <path d="M14,80 L114,80 Q118,95 108,100 L20,100 Q10,95 14,80 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="1.2" />
      <path d="M20,80 L108,80 L104,86 L24,86 Z" fill={P.wood.mid} />
      <rect x="16" y="81" width="96" height="3" fill={P.metal.iron} opacity="0.85" />
      {/* iron rivets */}
      <circle cx="30" cy="91" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="46" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="62" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="78" cy="92" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      <circle cx="94" cy="91" r="2" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="0.5" />
      {/* small MAST + sail (left of stack) */}
      <line x1="46" y1="80" x2="46" y2="34" stroke={P.wood.dark} strokeWidth="2" />
      <path className="cq-sail" d="M46,36 L64,48 L64,66 L46,70 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <path className="cq-sail" d="M46,36 L30,48 L30,66 L46,70 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="1" />
      <rect x="46" y="46" width="18" height="6" fill={f.mid} opacity="0.85" />
      <rect x="30" y="46" width="16" height="6" fill={f.mid} opacity="0.85" />
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
      {/* side PADDLE WHEEL (right) */}
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
      <Banner x={46} y={34} faction={faction} scale={0.75} />
      {/* bronze prow */}
      <path d="M14,82 L4,86 L14,90 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

function TroopTransportSprite({ faction = 'imperials', state = 'idle' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame state={state} kind="naval" hexTint={P.ground.water}>
      <Shadow cx={64} cy={101} rx={51} ry={8} />
      {/* HULL — iron grey, flat barge */}
      <path d="M10,78 L118,78 L116,98 Q64,105 12,98 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="1.2" />
      <line x1="12" y1="87" x2="116" y2="87" stroke={P.ink.line} strokeWidth="0.5" opacity="0.5" />
      <line x1="40" y1="79" x2="40" y2="100" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
      <line x1="64" y1="79" x2="64" y2="101" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
      <line x1="88" y1="79" x2="88" y2="100" stroke={P.ink.line} strokeWidth="0.5" opacity="0.35" />
      {/* armoured inner deck */}
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
      {/* two SMOKESTACKS */}
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
      {/* signal flag at the bow */}
      <line x1="22" y1="60" x2="22" y2="72" stroke={P.wood.dark} strokeWidth="1.2" />
      <rect x="22" y="58" width="10" height="6" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
      {/* faction shield emblem on the bow */}
      <g transform="translate(20 82)">
        <rect x="-6" y="-6" width="12" height="13" rx="3" fill={f.mid} stroke={P.ink.line} strokeWidth="0.8" />
        <circle cx="0" cy="0" r="3" fill={f.trim} stroke={f.dark} strokeWidth="0.5" />
      </g>
      {/* bronze prow */}
      <path d="M10,80 L0,84 L10,88 Z" fill={P.metal.bronze} stroke={P.ink.line} strokeWidth="0.6" />
    </SpriteFrame>
  );
}

Object.assign(window, {
  SettlerSprite, WorkerSprite, ScoutSprite, ScoutHoundSprite, WarHoundSprite, ShadowWardenSprite,
  WarriorSprite, SwordsmanSprite, PikemanSprite, ArcherSprite, MusketeerSprite,
  GalleySprite, TriremeSprite,
  CarrackSprite, GalleonSprite, SteamshipSprite, TroopTransportSprite,
  SpyScoutSprite, SpyInformantSprite, SpyAgentSprite, SpyOperativeSprite, SpyHackerSprite,
});
