export type FactionPalette = { dark: string; mid: string; bright: string; trim: string };

export const LOD_SPRITE_ZOOM_THRESHOLD = 0.4;

// --- HSL helpers ---

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h * 360, s * 100, l * 100];
}

function hslToHex(h: number, s: number, l: number): string {
  const sl = s / 100, ll = l / 100;
  const a = sl * Math.min(ll, 1 - ll);
  const f = (n: number): string => {
    const k = (n + h / 30) % 12;
    const color = ll - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function derivePalette(civColor: string): FactionPalette {
  const [h, s, l] = hexToHsl(civColor);
  return {
    dark:   hslToHex(h, s, Math.max(l - 40, 8)),
    mid:    civColor,
    bright: hslToHex(h, Math.min(s + 10, 100), Math.min(l + 30, 92)),
    trim:   hslToHex((h + 180) % 360, 20, 88),
  };
}

export const MATERIAL_PALETTE = {
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

export const CATEGORY_TINTS: Record<string, string> = {
  food:       MATERIAL_PALETTE.hud.food,
  production: MATERIAL_PALETTE.hud.prod,
  gold:       MATERIAL_PALETTE.hud.gold,
  science:    MATERIAL_PALETTE.hud.sci,
  culture:    MATERIAL_PALETTE.hud.cult,
  military:   MATERIAL_PALETTE.hud.mil,
  espionage:  MATERIAL_PALETTE.hud.esp,
  economy:    MATERIAL_PALETTE.hud.gold,
};

const P = MATERIAL_PALETTE;
const ANIM_CSS = `.cq-anim-idle{animation:cq-float 2s ease-in-out infinite alternate}@keyframes cq-float{from{transform:translateY(0)}to{transform:translateY(-3px)}}`;

// --- SVG primitives ---

interface HexBaseProps { size?: number; tint?: string; opacity?: number; ring?: boolean }
export function HexBase({ size = 96, tint = '#000', opacity = 0.18, ring = true }: HexBaseProps): string {
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

interface BannerProps { x?: number; y?: number; palette: FactionPalette; scale?: number; shape?: string }
export function Banner({ x = 0, y = 0, palette, scale = 1, shape = 'pennant' }: BannerProps): string {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-0.6" y="-12" width="1.4" height="18" fill={P.wood.dark} />
      {shape === 'pennant'
        ? <path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" />
        : <rect x="0" y="-12" width="12" height="9" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" />}
      <circle cx="5" cy="-7" r="1.6" fill={palette.trim} />
    </g>
  );
}

interface ShadowProps { cx?: number; cy?: number; rx?: number; ry?: number; opacity?: number }
export function Shadow({ cx = 64, cy = 92, rx = 18, ry = 5, opacity = 0.35 }: ShadowProps): string {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity={opacity} />;
}

interface HumanoidProps {
  cx?: number; cy?: number; scale?: number;
  cloth?: string; pants?: string; accent?: string;
  skin?: string; hair?: string; hat?: string; facing?: number;
}
export function Humanoid({
  cx = 64, cy = 64, scale = 1,
  cloth = P.cloth.tunic, pants = P.cloth.wool, accent = '#000',
  skin = P.skin.warm, hair = '#3a2a1a', hat = '', facing = 0,
}: HumanoidProps): string {
  const t = `translate(${cx} ${cy}) scale(${scale}) rotate(${facing * 4})`;
  return (
    <g transform={t}>
      <ellipse cx="-6" cy="22" rx="4.5" ry="2.5" fill={P.wood.dark} />
      <ellipse cx="6" cy="22" rx="4.5" ry="2.5" fill={P.wood.dark} />
      <path d="M-9,4 Q-10,16 -7,22 L-3,22 Q-4,12 -3,4 Z" fill={pants} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M9,4 Q10,16 7,22 L3,22 Q4,12 3,4 Z" fill={pants} stroke={P.ink.line} strokeWidth="0.8" />
      <path d="M0,-22 C14,-20 16,-2 12,8 L-12,8 C-16,-2 -14,-20 0,-22 Z" fill={cloth} stroke={P.ink.line} strokeWidth="1" />
      <rect x="-12" y="6" width="24" height="3" fill={accent} stroke={P.ink.line} strokeWidth="0.6" />
      <ellipse cx="-13" cy="-2" rx="4" ry="9" fill={cloth} stroke={P.ink.line} strokeWidth="0.8" transform="rotate(-12 -13 -2)" />
      <ellipse cx="13" cy="-2" rx="4" ry="9" fill={cloth} stroke={P.ink.line} strokeWidth="0.8" transform="rotate(12 13 -2)" />
      <circle cx="-15" cy="6" r="2.4" fill={skin} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="15" cy="6" r="2.4" fill={skin} stroke={P.ink.line} strokeWidth="0.6" />
      <rect x="-3" y="-26" width="6" height="6" fill={skin} stroke={P.ink.line} strokeWidth="0.6" />
      <circle cx="0" cy="-30" r="9" fill={skin} stroke={P.ink.line} strokeWidth="1" />
      <path d="M-9,-32 Q-7,-40 0,-40 Q7,-40 9,-32 Q9,-30 7,-29 L-7,-29 Q-9,-30 -9,-32 Z" fill={hair} />
      <circle cx="-2.6" cy="-30" r="0.9" fill={P.ink.line} />
      <circle cx="2.6" cy="-30" r="0.9" fill={P.ink.line} />
      {hat}
    </g>
  );
}

interface SpriteFrameProps {
  size?: number; svgOnly?: boolean; hex?: boolean; hexTint?: string;
  label?: string; sub?: string; animate?: string;
  children: string | string[];
}
export function SpriteFrame({
  size = 128, svgOnly = false, hex = true, hexTint = '#000',
  label, sub, animate = 'idle', children,
}: SpriteFrameProps): string {
  const animClass = animate ? `cq-anim-${animate}` : '';
  const hexEl = hex
    ? `<g transform="translate(${(size - 96) / 2} ${size - 96 * 0.866 - 6})">${HexBase({ size: 96, tint: hexTint })}</g>`
    : '';
  // Omit animation CSS in svgOnly mode — browsers block CSS animations in SVG loaded as <img>
  const styleEl = svgOnly ? '' : `<style>${ANIM_CSS}</style>`;
  const childStr = Array.isArray(children) ? children.join('') : (children ?? '');
  const svgEl = `<svg viewBox="0 0 ${size} ${size}" width="${svgOnly ? size : '100%'}" height="${svgOnly ? size : '100%'}" class="${animClass}" xmlns="http://www.w3.org/2000/svg">${styleEl}${hexEl}<g class="cq-sprite-figure">${childStr}</g></svg>`;
  if (svgOnly) return svgEl;
  const labelEl = label ? `<div class="cq-sprite-label">${label}${sub ? ` · ${sub}` : ''}</div>` : '';
  return `<div class="cq-sprite-wrap" data-animate="${animate}">${svgEl}${labelEl}</div>`;
}

interface BuildingPlinthProps { cx?: number; cy?: number; w?: number; color?: string }
export function BuildingPlinth({ cx = 96, cy = 150, w = 130, color = P.stone.mid }: BuildingPlinthProps): string {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 10} rx={w / 2 + 6} ry="14" fill="#000" opacity="0.25" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 8},${cy + 12} L${cx - w / 2 + 8},${cy + 12} Z`} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 4},${cy - 4} L${cx - w / 2 + 4},${cy - 4} Z`} fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
    </g>
  );
}
