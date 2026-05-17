/* Conquestoria sprite system — shared tokens, primitives, and helpers.
 * All sprites are SVG, drawn top-down with a slight 3/4 lean so figures read
 * as people, not stickers. Each unit sprite renders inside a 128 viewBox
 * (units sit on a 96 footprint), each building inside 192 (sits on 160).
 *
 * Palette tokens are exported on window.SPRITE so other files can read them.
 */

const PALETTE = {
  factions: {
    imperials: { name: 'Imperials',  dark: '#7a1a18', mid: '#b53026', bright: '#e85a4e', trim: '#f3d27a' },
    vikings:   { name: 'Vikings',    dark: '#0e2a4d', mid: '#1d4a8c', bright: '#3f7fc9', trim: '#cdd9e5' },
    pharaohs:  { name: 'Pharaohs',   dark: '#7a5a16', mid: '#d4a13c', bright: '#f0c460', trim: '#2c2014' },
    hellenes:  { name: 'Hellenes',   dark: '#13452a', mid: '#2c8a5a', bright: '#56b481', trim: '#f3eddb' },
    khanate:   { name: 'Khanate',    dark: '#3a1f0a', mid: '#7a3a14', bright: '#c46a2a', trim: '#1c1410' },
    shogunate: { name: 'Shogunate',  dark: '#2a2438', mid: '#5b4a7a', bright: '#9c83c4', trim: '#e6dfd0' },
  },
  skin:   { warm: '#d4a373', cool: '#b08968', deep: '#8a5a3c' },
  cloth:  { tunic: '#c19a6b', linen: '#e6dcc6', wool: '#7a6e5b', dye: '#5b4a7a' },
  metal:  { iron: '#5a6068', steel: '#8a929b', bronze: '#b8895a', gold: '#d4a13c', shine: '#e8edf2' },
  wood:   { light: '#c19a6b', mid: '#8a6a3a', dark: '#5e3f24' },
  stone:  { light: '#c4b8a4', mid: '#9a8e78', dark: '#6a5e4a' },
  thatch: { straw: '#d6b46a', shadow: '#8a6a3a' },
  ground: { grass: '#7ea860', dirt: '#a08260', sand: '#d8c896', water: '#3a6e94' },
  ink:    { line: '#1f1a14', soft: '#3a3228' },
  hud:    { food: '#7bb850', prod: '#c98a3a', gold: '#e8c64a', sci: '#5fb4d4', cult: '#c46db4', mil: '#c4413a', esp: '#7a5ec4' },
};

const CATEGORY_TINTS = {
  food: PALETTE.hud.food, production: PALETTE.hud.prod, gold: PALETTE.hud.gold,
  science: PALETTE.hud.sci, culture: PALETTE.hud.cult, military: PALETTE.hud.mil, espionage: PALETTE.hud.esp,
  economy: PALETTE.hud.gold,
};

/* Hex footprint base — every sprite sits on this so they ground to the tile */
function HexBase({ size = 96, tint = '#000', opacity = 0.18, ring = true }) {
  const w = size, h = size * 0.866;
  const cx = w / 2, cy = h / 2;
  const r = w / 2 - 2;
  const pts = Array.from({ length: 6 }).map((_, i) => {
    const a = Math.PI / 6 + (Math.PI / 3) * i;
    return `${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`;
  }).join(' ');
  return (
    <g>
      <ellipse cx={cx} cy={cy + 4} rx={r * 0.78} ry={r * 0.32} fill={tint} opacity={opacity} />
      {ring && <polygon points={pts} fill="none" stroke={tint} strokeOpacity="0.25" strokeWidth="1.2" strokeDasharray="2 3" />}
    </g>
  );
}

/* Faction banner — small pennant tag stamped on the sprite */
function Banner({ x = 0, y = 0, faction, scale = 1, shape = 'pennant' }) {
  const f = PALETTE.factions[faction] || PALETTE.factions.imperials;
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-0.6" y="-12" width="1.4" height="18" fill={PALETTE.wood.dark} />
      {shape === 'pennant' ? (
        <path className="cq-banner-cloth" d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
      ) : (
        <rect className="cq-banner-cloth" x="0" y="-12" width="12" height="9" fill={f.mid} stroke={f.dark} strokeWidth="0.6" />
      )}
      <circle cx="5" cy="-7" r="1.6" fill={f.trim} />
    </g>
  );
}

/* Drop a soft ground shadow under the figure */
function Shadow({ cx = 64, cy = 92, rx = 18, ry = 5, opacity = 0.35 }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity={opacity} />;
}

/* Reusable body silhouette — used by most human units.
 * Top-down 3/4: head circle + torso teardrop + two legs peeking out.
 * Tunic color is `cloth`, accent (belt/trim) is `accent`, hair is `hair`. */
function Humanoid({
  cx = 64, cy = 64, scale = 1,
  cloth = PALETTE.cloth.tunic,
  pants = PALETTE.cloth.wool,
  accent = '#000',
  skin = PALETTE.skin.warm,
  hair = '#3a2a1a',
  hat = null, // optional element rendered above head
  facing = 0, // -1 left, 0 center, 1 right (subtle)
}) {
  const t = `translate(${cx} ${cy}) scale(${scale}) rotate(${facing * 4})`;
  return (
    <g transform={t}>
      {/* feet */}
      <ellipse cx="-6" cy="22" rx="4.5" ry="2.5" fill={PALETTE.wood.dark} />
      <ellipse cx="6" cy="22" rx="4.5" ry="2.5" fill={PALETTE.wood.dark} />
      {/* legs */}
      <path d="M-9,4 Q-10,16 -7,22 L-3,22 Q-4,12 -3,4 Z" fill={pants} stroke={PALETTE.ink.line} strokeWidth="0.8" />
      <path d="M9,4 Q10,16 7,22 L3,22 Q4,12 3,4 Z" fill={pants} stroke={PALETTE.ink.line} strokeWidth="0.8" />
      {/* torso (teardrop tunic) */}
      <path d="M0,-22 C14,-20 16,-2 12,8 L-12,8 C-16,-2 -14,-20 0,-22 Z" fill={cloth} stroke={PALETTE.ink.line} strokeWidth="1" />
      {/* belt */}
      <rect x="-12" y="6" width="24" height="3" fill={accent} stroke={PALETTE.ink.line} strokeWidth="0.6" />
      {/* arms (tucked, will be overridden by weapon-bearing variants) */}
      <ellipse cx="-13" cy="-2" rx="4" ry="9" fill={cloth} stroke={PALETTE.ink.line} strokeWidth="0.8" transform="rotate(-12 -13 -2)" />
      <ellipse cx="13"  cy="-2" rx="4" ry="9" fill={cloth} stroke={PALETTE.ink.line} strokeWidth="0.8" transform="rotate(12 13 -2)" />
      {/* hands */}
      <circle cx="-15" cy="6" r="2.4" fill={skin} stroke={PALETTE.ink.line} strokeWidth="0.6" />
      <circle cx="15"  cy="6" r="2.4" fill={skin} stroke={PALETTE.ink.line} strokeWidth="0.6" />
      {/* neck */}
      <rect x="-3" y="-26" width="6" height="6" fill={skin} stroke={PALETTE.ink.line} strokeWidth="0.6" />
      {/* head */}
      <circle cx="0" cy="-30" r="9" fill={skin} stroke={PALETTE.ink.line} strokeWidth="1" />
      {/* hair cap */}
      <path d="M-9,-32 Q-7,-40 0,-40 Q7,-40 9,-32 Q9,-30 7,-29 L-7,-29 Q-9,-30 -9,-32 Z" fill={hair} />
      {/* eyes — tiny, high contrast */}
      <circle cx="-2.6" cy="-30" r="0.9" fill={PALETTE.ink.line} />
      <circle cx="2.6" cy="-30" r="0.9" fill={PALETTE.ink.line} />
      {hat}
    </g>
  );
}

/* Faction-aware accent picker.  Most units use mid for cloth-trim, dark for boots. */
function factionAccent(faction) {
  return (PALETTE.factions[faction] || PALETTE.factions.imperials);
}

/* Sprite frame — wraps a unit/building in a square viewBox with the hex base.
 *
 * Animation contract:
 *   data-state ∈ { idle, walk, attack, hurt, death, busy }
 *   data-kind  ∈ { civilian, melee, ranged, naval, hound, spy, building }
 * The class .cq-sprite-figure wraps the whole figure so animations can target it.
 * Inner sprite parts use semantic hook classes (.cq-weapon, .cq-smoke, .cq-glow,
 * .cq-wheel, .cq-banner-cloth, .cq-spark, .cq-spotlight, etc.) — the CSS in
 * sprite-animations.css drives all motion off those hooks.
 */
function SpriteFrame({
  size = 128, children, hex = true, hexTint = '#000',
  label, sub, state = 'idle', kind = 'civilian',
}) {
  return (
    <div className="cq-sprite-wrap" data-state={state} data-kind={kind}>
      <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" data-state={state} data-kind={kind}>
        {hex && <g transform={`translate(${(size - 96) / 2} ${size - 96 * 0.866 - 6})`}><HexBase size={96} tint={hexTint} /></g>}
        <g className="cq-sprite-figure">{children}</g>
      </svg>
      {label && <div className="cq-sprite-label">{label}{sub && <span> · {sub}</span>}</div>}
    </div>
  );
}

/* Building base — stone plinth that fills the hex */
function BuildingPlinth({ cx = 96, cy = 150, w = 130, color = PALETTE.stone.mid }) {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 10} rx={w / 2 + 6} ry="14" fill="#000" opacity="0.25" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 8},${cy + 12} L${cx - w / 2 + 8},${cy + 12} Z`} fill={color} stroke={PALETTE.ink.line} strokeWidth="1" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 4},${cy - 4} L${cx - w / 2 + 4},${cy - 4} Z`} fill={PALETTE.stone.light} stroke={PALETTE.ink.line} strokeWidth="0.6" />
    </g>
  );
}

Object.assign(window, {
  SPRITE: { PALETTE, CATEGORY_TINTS },
  HexBase, Banner, Shadow, Humanoid, SpriteFrame, BuildingPlinth, factionAccent,
});
