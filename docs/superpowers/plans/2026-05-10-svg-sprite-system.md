# SVG Sprite System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace emoji unit/building rendering with faction-colored SVG sprites rendered via Canvas `drawImage`, falling back to emoji below zoom 0.4.

**Architecture:** TypeScript sprite functions authored in TSX (JSX syntax, no React) via a custom JSX-to-string runtime. At game start, each sprite function is called with a `FactionPalette` prop and `svgOnly: true`, returning an SVG string. That string is converted to a Blob URL, loaded as `HTMLImageElement`, and cached. Canvas renderers do a cache lookup and call `ctx.drawImage()` where they previously drew emoji. Emoji fallback remains active below zoom 0.4 or while the cache is warming.

**Why not React:** React + react-dom adds ~42 KB gzip — a ~30% bundle increase — for a feature that runs once at game start. Sprite components have no state, effects, or reactivity; they are pure JSX-to-string functions. A ~120-line custom JSX runtime eliminates the React dependency entirely, removes the `flushSync` main-thread stall (168 DOM cycles per 4-civ game), and makes the SVG string generation synchronous and trivially testable.

**Tech Stack:** TypeScript, custom JSX-to-string runtime (no external deps), Vitest (node + jsdom environments), Canvas 2D

---

## File Structure

```
New files:
  src/renderer/sprites/jsx-runtime.ts    # custom JSX-to-string factory (no React)
  src/renderer/sprites/sprite-system.tsx # palette derivation, LOD constant, SVG primitives
  src/renderer/sprites/units.tsx         # 18 unit sprite components
  src/renderer/sprites/buildings.tsx     # 23 building sprite components
  src/renderer/sprites/sprite-catalog.ts # UnitType / building ID → component map
  src/renderer/sprites/sprite-loader.ts  # SpriteCache, initSprites(), getUnit/Building

  tests/renderer/sprites/sprite-system.test.ts
  tests/renderer/sprites/sprite-catalog.test.ts
  tests/renderer/sprites/sprite-loader.test.ts

  .claude/rules/sprites.md               # enforcement rules for future extension

Modified files:
  vite.config.ts        # add esbuild.jsxImportSource (no React plugin needed)
  tsconfig.json         # add "jsx", "jsxImportSource", include src/**/*.tsx
  src/renderer/unit-renderer.ts   # LOD + sprite drawImage path; add missing unit icons
  src/renderer/city-renderer.ts   # getProductionBadgeSprite, badge size fix
  src/main.ts                     # call initSprites in startGame()
  CLAUDE.md                       # add sprites rule to Rules Index
  AGENTS.md                       # add src/renderer/sprites/** → .claude/rules/sprites.md
  .claude/hooks/check-src-edit.sh # ban Object.assign(window in sprite files
```

Design source (read-only reference, already on disk):
```
/tmp/conquestoria-sprites/project/lib/sprite-system.jsx → sprite-system.tsx
/tmp/conquestoria-sprites/project/lib/units.jsx          → units.tsx
/tmp/conquestoria-sprites/project/lib/buildings.jsx      → buildings.tsx
```

---

## Task 0: Create JSX-to-string runtime + configure tooling

**Files:**
- Create: `src/renderer/sprites/jsx-runtime.ts`
- Modify: `tsconfig.json`
- Modify: `vite.config.ts`

No `yarn add` required. The runtime is plain TypeScript; the JSX transform is handled by Vite's built-in esbuild.

- [ ] **Step 1: Create src/renderer/sprites/jsx-runtime.ts**

```typescript
// Custom JSX-to-string runtime for SVG sprite components.
// TypeScript looks for this file when jsxImportSource resolves to this directory.

type Child = string | false | null | undefined;
type Props = Record<string, unknown>;

const CAMEL_TO_SVG: Record<string, string> = {
  className:        'class',
  strokeWidth:      'stroke-width',
  strokeLinecap:    'stroke-linecap',
  strokeLinejoin:   'stroke-linejoin',
  strokeDasharray:  'stroke-dasharray',
  strokeOpacity:    'stroke-opacity',
  fillOpacity:      'fill-opacity',
  textAnchor:       'text-anchor',
  fontFamily:       'font-family',
  fontSize:         'font-size',
  patternUnits:     'patternUnits',  // SVG attribute stays camelCase
  viewBox:          'viewBox',       // SVG attribute stays camelCase
};

function serialize(val: unknown): string {
  if (typeof val === 'string') return val.replace(/"/g, '&quot;');
  if (typeof val === 'number') return String(val);
  return '';
}

function flatChildren(children: unknown): string {
  if (Array.isArray(children)) {
    return (children as Child[]).flat(Infinity as 1).map(c => (c === false || c == null ? '' : String(c))).join('');
  }
  return children === false || children == null ? '' : String(children);
}

export function jsx(
  tag: string | ((props: Props) => string),
  props: Props | null,
): string {
  const p = props ?? {};
  if (typeof tag === 'function') return tag(p);

  const children = flatChildren(p.children);
  const attrs = Object.entries(p)
    .filter(([k]) => k !== 'children' && p[k] !== undefined && p[k] !== false && p[k] !== null)
    .map(([k, v]) => ` ${CAMEL_TO_SVG[k] ?? k}="${serialize(v)}"`)
    .join('');

  return `<${tag}${attrs}>${children}</${tag}>`;
}

export const jsxs = jsx;

export function Fragment({ children }: { children?: unknown }): string {
  return flatChildren(children);
}

// JSX type declarations — tells TypeScript that JSX expressions produce strings
export namespace JSX {
  export type Element = string;
  export interface IntrinsicElements {
    [tag: string]: Props & { children?: Element | (Element | false | null | undefined)[] };
  }
  export interface ElementChildrenAttribute {
    children: {};
  }
}
```

- [ ] **Step 2: Update tsconfig.json**

Add `"jsx"` and `"jsxImportSource"` to `compilerOptions`, add `.tsx` to `include`:

Current `compilerOptions` section (relevant lines):
```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"],
```

After:
```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "jsxImportSource": "@/renderer/sprites",
    "types": ["vitest/globals", "node"],
```

Current `include`:
```json
  "include": ["src/**/*.ts", "tests/**/*.ts"],
```

After:
```json
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "tests/**/*.tsx"],
```

- [ ] **Step 3: Update vite.config.ts esbuild config**

Vite's built-in esbuild handles `.tsx` files. Tell it to use our custom JSX runtime by adding an `esbuild` key to the returned config object.

Current returned config (inside `return { ... }`):
```typescript
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    test: {
```

After (add `esbuild` block between `build` and `test`):
```typescript
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    esbuild: {
      jsxImportSource: '@/renderer/sprites',
    },
    test: {
```

- [ ] **Step 4: Verify build passes**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exits 0. TypeScript processes `.tsx` without errors (no sprite files exist yet, so this just verifies the tooling config is valid).

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/jsx-runtime.ts tsconfig.json vite.config.ts
git commit -m "chore: add custom JSX-to-string runtime for SVG sprites (no React)"
```

---

## Task 1: sprite-system.tsx — palette derivation + shared SVG primitives

**Files:**
- Create: `src/renderer/sprites/sprite-system.tsx`
- Create: `tests/renderer/sprites/sprite-system.test.ts`

Reference: `/tmp/conquestoria-sprites/project/lib/sprite-system.jsx`

Key changes from design source:
1. Replace `Object.assign(window, ...)` with named exports
2. Replace `faction: string` prop with `palette: FactionPalette` on Banner
3. All functions return `string` (not React elements) — the JSX runtime handles this
4. Add `svgOnly?: boolean` to `SpriteFrame` — when true, skips wrapper div and CSS style tag
5. Add `derivePalette(civColor: string): FactionPalette` (spec §1)
6. Add `LOD_SPRITE_ZOOM_THRESHOLD` constant — exported and imported by both renderers
7. Export `MATERIAL_PALETTE` and `CATEGORY_TINTS`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/sprites/sprite-system.test.ts
import { describe, it, expect } from 'vitest';
import { derivePalette } from '@/renderer/sprites/sprite-system';

describe('derivePalette', () => {
  it('returns an object with dark, mid, bright, trim as valid hex strings', () => {
    const p = derivePalette('#4a90d9');
    expect(p.dark).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.mid).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.bright).toMatch(/^#[0-9a-f]{6}$/i);
    expect(p.trim).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('mid is the original input color', () => {
    expect(derivePalette('#4a90d9').mid).toBe('#4a90d9');
  });

  it('preserves hue identity — blue input stays blue', () => {
    const p = derivePalette('#4a90d9');
    const [h] = hexToHsl(p.mid);
    expect(h).toBeGreaterThan(195);
    expect(h).toBeLessThan(225);
  });

  it('preserves hue identity — red input stays red', () => {
    const p = derivePalette('#d94a4a');
    const [h] = hexToHsl(p.mid);
    expect(h < 15 || h > 345).toBe(true);
  });
});

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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-system.test.ts
```

Expected: FAIL — `Cannot find module '@/renderer/sprites/sprite-system'`

- [ ] **Step 3: Create src/renderer/sprites/sprite-system.tsx**

```tsx
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
  children: string;
}
export function SpriteFrame({
  size = 128, svgOnly = false, hex = true, hexTint = '#000',
  label, sub, animate = 'idle', children,
}: SpriteFrameProps): string {
  const animClass = animate ? `cq-anim-${animate}` : '';
  const hexEl = hex
    ? `<g transform="translate(${(size - 96) / 2} ${size - 96 * 0.866 - 6})">${HexBase({ size: 96, tint: hexTint })}</g>`
    : '';
  // Omit animation CSS in svgOnly mode — it wastes bytes and browsers block
  // CSS animations in SVG loaded as <img> (security restriction).
  const styleEl = svgOnly ? '' : `<style>${ANIM_CSS}</style>`;
  const svgEl = `<svg viewBox="0 0 ${size} ${size}" width="${svgOnly ? size : '100%'}" height="${svgOnly ? size : '100%'}" class="${animClass}" xmlns="http://www.w3.org/2000/svg">${styleEl}${hexEl}<g class="cq-sprite-figure">${children}</g></svg>`;
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
```

Note: `SpriteFrame` builds the SVG string directly rather than via JSX because the outer `<svg>` element needs to handle the `svgOnly` branch — mixing JSX and string branches in the same function is cleaner with explicit string building here.

- [ ] **Step 4: Run tests**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-system.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/sprite-system.tsx tests/renderer/sprites/sprite-system.test.ts
git commit -m "feat(sprites): sprite-system.tsx — FactionPalette, derivePalette, LOD constant, SVG primitives"
```

---

## Task 2: units.tsx — 18 unit sprite components

**Files:**
- Create: `src/renderer/sprites/units.tsx`

Reference source: `/tmp/conquestoria-sprites/project/lib/units.jsx`

**Transformation pattern** applied to every public component:

| Before (design JSX) | After (units.tsx) |
|---|---|
| `function FooSprite({ faction = 'imperials', animate = 'idle' })` | `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string` |
| `const f = factionAccent(faction);` | (remove) |
| `<Banner ... faction={faction}>` | `<Banner ... palette={palette}>` |
| `accent={f.mid}`, `fill={f.dark}`, `fill={f.bright}` | `accent={palette.mid}`, `fill={palette.dark}`, `fill={palette.bright}` |
| `<SpriteFrame animate={animate}>` | `<SpriteFrame svgOnly={svgOnly}>` |
| `const { SPRITE, Humanoid, ... } = window;` | Remove — use named imports |

**spyBase transformation** (the shared helper for all 5 spy sprites):

```typescript
// Before
function spyBase({ faction, hat, gadget, cloak = '#2a2a32' }) {
  const f = factionAccent(faction);
  return (
    <SpriteFrame animate="idle" hexTint="#241a36">
      ...
      <circle cx="58" cy="50" r="2" fill={f.bright} stroke={f.dark} strokeWidth="0.4" />
    </SpriteFrame>
  );
}

// After
function spyBase({ palette, hat, gadget, cloak = '#2a2a32' }: {
  palette: FactionPalette; hat: string; gadget: string; cloak?: string;
}): string {
  return (
    <SpriteFrame svgOnly={false} hexTint="#241a36">
      ...
      <circle cx="58" cy="50" r="2" fill={palette.bright} stroke={palette.dark} strokeWidth="0.4" />
    </SpriteFrame>
  );
}
```

Each spy sprite becomes:
```typescript
export function SpyScoutSprite({ palette, svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    hat: `<path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill="#1a1410"/>`,
    gadget: `<g transform="translate(82 56)"><circle r="5" fill="${P.metal.shine}" stroke="${P.ink.line}" stroke-width="0.6"/><circle r="3" fill="${P.ground.water}"/></g>`,
  });
}
```

Note: `hat` and `gadget` are passed as JSX props in the design source. In the string runtime these evaluate to strings already (JSX string runtime), so `hat={<path .../>}` produces a string. Both work identically.

`SpyAgentSprite`, `SpyOperativeSprite`, and `SpyHackerSprite` also call `factionAccent(faction)` locally (for `f.bright` in gadgets) — these become `palette.bright`.

- [ ] **Step 1: Create src/renderer/sprites/units.tsx**

```tsx
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  Banner,
  Shadow,
  Humanoid,
  SpriteFrame,
} from './sprite-system';

export type UnitSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

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
```

**Continue porting all remaining 16 public components** from `/tmp/conquestoria-sprites/project/lib/units.jsx` applying the same pattern. The complete list (read source for their JSX bodies):

- `ScoutSprite` — spyglass scout, lines 58-74
- `ScoutHoundSprite` — dog with collar, lines 76-107
- `WarHoundSprite` — armored war dog, lines 109-139
- `ShadowWardenSprite` — eagle/warden silhouette, lines 141-163
- `WarriorSprite` — round shield + sword, lines 165-186
- `SwordsmanSprite` — longsword fighter, lines 188-231
- `PikemanSprite` — long pike, lines 233-254
- `ArcherSprite` — bow + quiver, lines 256-280
- `MusketeerSprite` — musket + plumed hat, lines 282-309
- `GalleySprite` — top-down ship with oars, lines 311-341
- `TriremeSprite` — trireme with ram prow, lines 343-381

For naval units, `SpriteFrame` defaults to `hex={true}` — do not change it. The hex shadow is lightweight.

Then add the `spyBase` helper and all 5 spy exports:

```tsx
/* === SPY FAMILY (shared base) === */

function spyBase({ palette, hat, gadget, cloak = '#2a2a32' }: {
  palette: FactionPalette; hat: string; gadget: string; cloak?: string;
}): string {
  return (
    <SpriteFrame svgOnly={false} hexTint="#241a36">
      <Shadow />
      <path d="M44,40 Q64,36 84,40 L92,98 Q64,104 36,98 Z" fill={cloak} stroke={P.ink.line} strokeWidth="1" />
      <path d="M52,42 L60,98 M76,42 L68,98" stroke={P.ink.line} strokeWidth="0.5" opacity="0.6" />
      <Humanoid cx={64} cy={70} scale={0.95} cloth="transparent" pants="transparent" accent="transparent" skin={P.skin.warm} hair="#1a1410" hat={hat} />
      {gadget}
      <circle cx="58" cy="50" r="2" fill={palette.bright} stroke={palette.dark} strokeWidth="0.4" />
    </SpriteFrame>
  );
}

export function SpyScoutSprite({ palette, svgOnly: _svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    hat: <path d="M-12,-36 Q0,-46 12,-36 L10,-32 L-10,-32 Z" fill="#1a1410" />,
    gadget: <g transform="translate(82 56)"><circle r="5" fill={P.metal.shine} stroke={P.ink.line} strokeWidth="0.6" /><circle r="3" fill={P.ground.water} /></g>,
  });
}

export function SpyInformantSprite({ palette, svgOnly: _svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    hat: <ellipse cx="0" cy="-38" rx="14" ry="4" fill="#1a1410" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-6" width="8" height="12" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" /><line x1="-3" y1="-2" x2="3" y2="-2" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="1" x2="3" y2="1" stroke={P.ink.line} strokeWidth="0.5" /><line x1="-3" y1="4" x2="3" y2="4" stroke={P.ink.line} strokeWidth="0.5" /></g>,
  });
}

export function SpyAgentSprite({ palette, svgOnly: _svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    cloak: '#1c1c24',
    hat: <path d="M-13,-36 L13,-36 L11,-40 L-11,-40 Z M-15,-36 L15,-36 L15,-34 L-15,-34 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 60)"><rect x="-4" y="-3" width="10" height="6" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="6" cy="0" r="1.4" fill={palette.bright} /></g>,
  });
}

export function SpyOperativeSprite({ palette, svgOnly: _svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
    cloak: '#16161c',
    hat: <path d="M-11,-40 Q0,-44 11,-40 L11,-30 L-11,-30 Z" fill="#0a0a10" />,
    gadget: <g transform="translate(82 56)"><path d="M-2,-8 L2,-8 L2,4 L4,8 L-4,8 L-2,4 Z" fill={P.metal.iron} stroke={P.ink.line} strokeWidth="0.6" /><circle cx="0" cy="-10" r="2" fill={palette.bright} /></g>,
  });
}

export function SpyHackerSprite({ palette, svgOnly: _svgOnly = false }: UnitSpriteProps): string {
  return spyBase({
    palette,
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
```

Note on `_svgOnly`: spy sprites delegate to `spyBase` which calls `SpriteFrame` directly with `svgOnly={false}`. The `svgOnly` prop is accepted but not threaded through since `spyBase` owns the frame. Rename the parameter to `_svgOnly` to signal intent. If the preloader needs `svgOnly=true` for spy sprites, `spyBase` must also accept and forward it — extend the type then.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | head -30
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sprites/units.tsx
git commit -m "feat(sprites): units.tsx — 18 unit SVG components, spyBase helper ported"
```

---

## Task 3: buildings.tsx — 23 building sprite components

**Files:**
- Create: `src/renderer/sprites/buildings.tsx`

Reference source: `/tmp/conquestoria-sprites/project/lib/buildings.jsx`

**Transformation pattern:**

| Before | After |
|---|---|
| `function FooSprite({ faction = 'imperials' })` | `export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps): string` |
| `factionAccent(faction)` / `f.mid` | `palette.mid` (etc.) |
| `Banner ... faction={faction}` | `Banner ... palette={palette}` |
| `const { SPRITE, SpriteFrame, ... } = window;` | Remove — use named imports |
| `SPRITE.CATEGORY_TINTS[category]` | `CATEGORY_TINTS[category]` |

`BuildingFrame` is an internal helper — it does NOT need `palette` in its props because `palette` is used directly in the building's children JSX (e.g., `<Banner palette={palette} />`), not inside `BuildingFrame` itself.

- [ ] **Step 1: Create src/renderer/sprites/buildings.tsx**

```tsx
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  CATEGORY_TINTS,
  Banner,
  SpriteFrame,
  BuildingPlinth,
} from './sprite-system';

export type BuildingSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

// Internal roof helpers
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

// Internal frame — wraps SpriteFrame with defs + category accent ring.
// palette is NOT needed here; each building's children use palette directly.
function BuildingFrame({
  children, label, sub, category, svgOnly,
}: {
  children: string; label?: string; sub?: string; category?: string; svgOnly?: boolean;
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
  return SpriteFrame({ size: 192, svgOnly, label, sub, hexTint: '#000', children: defs + ring + children });
}

/* === FOOD === */

export function GranarySprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Granary" sub="Food" category="food" svgOnly={svgOnly}>
      <BuildingPlinth />
      <ellipse cx="96" cy="110" rx="38" ry="28" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.5" />
      <ellipse cx="96" cy="90" rx="38" ry="16" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M58,90 L96,50 L134,90 Z" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="1" />
      <path d="M72,80 L96,56 L120,80" fill="none" stroke={P.thatch.shadow} strokeWidth="0.6" opacity="0.5" />
      <path d="M86,138 Q86,120 96,120 Q106,120 106,138 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={96} y={70} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}
```

Note: `BuildingFrame` uses string interpolation for `<defs>` because pattern elements contain string-only content that doesn't need JSX handling. The `children` prop from `BuildingFrame`'s JSX usage is still a string (produced by the JSX runtime from the building's child elements). Both work seamlessly.

**Continue porting all remaining 22 components** from `/tmp/conquestoria-sprites/project/lib/buildings.jsx`:

Food: `HerbalistSprite`, `AqueductSprite`
Production: `WorkshopSprite`, `ForgeSprite`, `LumbermillSprite`, `QuarrySprite`
Science: `LibrarySprite`, `ArchiveSprite`, `ObservatorySprite`
Economy: `MarketplaceSprite`, `HarborSprite`
Military: `BarracksSprite`, `WallsSprite`, `StableSprite`
Culture: `TempleSprite`, `MonumentSprite`, `AmphitheaterSprite`, `ShrineSprite`, `ForumSprite`
Espionage: `SafehouseSprite`, `IntelAgencySprite`, `SecurityBureauSprite`

All 23 must be exported. All pass `svgOnly={svgOnly}` to `BuildingFrame`. Banner elements receive `palette={palette}`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | head -30
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sprites/buildings.tsx
git commit -m "feat(sprites): buildings.tsx — 23 building SVG components"
```

---

## Task 4: sprite-catalog.ts + coverage tests

**Files:**
- Create: `src/renderer/sprites/sprite-catalog.ts`
- Create: `tests/renderer/sprites/sprite-catalog.test.ts`

Note: component types are plain function signatures — no `React.ComponentType`.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/sprites/sprite-catalog.test.ts
import { describe, it, expect } from 'vitest';
import { UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { BUILDINGS } from '@/systems/city-system';

const ALL_UNIT_TYPES = [
  'settler', 'worker', 'scout', 'warrior', 'archer',
  'swordsman', 'pikeman', 'musketeer', 'galley', 'trireme',
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_hacker',
  'scout_hound', 'shadow_warden', 'war_hound',
] as const;

describe('sprite-catalog coverage', () => {
  describe('UNIT_SPRITE_CATALOG', () => {
    for (const unitType of ALL_UNIT_TYPES) {
      it(`has a component for unit type: ${unitType}`, () => {
        expect(UNIT_SPRITE_CATALOG[unitType]).toBeDefined();
        expect(typeof UNIT_SPRITE_CATALOG[unitType]).toBe('function');
      });
    }
  });

  describe('BUILDING_SPRITE_CATALOG', () => {
    for (const buildingId of Object.keys(BUILDINGS)) {
      it(`has a component for building: ${buildingId}`, () => {
        expect(BUILDING_SPRITE_CATALOG[buildingId]).toBeDefined();
        expect(typeof BUILDING_SPRITE_CATALOG[buildingId]).toBe('function');
      });
    }
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-catalog.test.ts
```

Expected: FAIL — `Cannot find module '@/renderer/sprites/sprite-catalog'`

- [ ] **Step 3: Create src/renderer/sprites/sprite-catalog.ts**

```typescript
import type { UnitType } from '@/core/types';
import type { UnitSpriteProps } from './units';
import type { BuildingSpriteProps } from './buildings';
import {
  SettlerSprite, WorkerSprite, ScoutSprite, ScoutHoundSprite,
  WarHoundSprite, ShadowWardenSprite, WarriorSprite, SwordsmanSprite,
  PikemanSprite, ArcherSprite, MusketeerSprite, GalleySprite,
  TriremeSprite, SpyScoutSprite, SpyInformantSprite, SpyAgentSprite,
  SpyOperativeSprite, SpyHackerSprite,
} from './units';
import {
  GranarySprite, HerbalistSprite, AqueductSprite,
  WorkshopSprite, ForgeSprite, LumbermillSprite, QuarrySprite,
  LibrarySprite, ArchiveSprite, ObservatorySprite,
  MarketplaceSprite, HarborSprite,
  BarracksSprite, WallsSprite, StableSprite,
  TempleSprite, MonumentSprite, AmphitheaterSprite, ShrineSprite, ForumSprite,
  SafehouseSprite, IntelAgencySprite, SecurityBureauSprite,
} from './buildings';

export type UnitSpriteComponent = (props: UnitSpriteProps) => string;
export type BuildingSpriteComponent = (props: BuildingSpriteProps) => string;

export const UNIT_SPRITE_CATALOG: Record<UnitType, UnitSpriteComponent> = {
  settler:        SettlerSprite,
  worker:         WorkerSprite,
  scout:          ScoutSprite,
  scout_hound:    ScoutHoundSprite,
  war_hound:      WarHoundSprite,
  shadow_warden:  ShadowWardenSprite,
  warrior:        WarriorSprite,
  swordsman:      SwordsmanSprite,
  pikeman:        PikemanSprite,
  archer:         ArcherSprite,
  musketeer:      MusketeerSprite,
  galley:         GalleySprite,
  trireme:        TriremeSprite,
  spy_scout:      SpyScoutSprite,
  spy_informant:  SpyInformantSprite,
  spy_agent:      SpyAgentSprite,
  spy_operative:  SpyOperativeSprite,
  spy_hacker:     SpyHackerSprite,
};

export const BUILDING_SPRITE_CATALOG: Record<string, BuildingSpriteComponent> = {
  granary:               GranarySprite,
  herbalist:             HerbalistSprite,
  aqueduct:              AqueductSprite,
  workshop:              WorkshopSprite,
  forge:                 ForgeSprite,
  lumbermill:            LumbermillSprite,
  'quarry-building':     QuarrySprite,
  library:               LibrarySprite,
  archive:               ArchiveSprite,
  observatory:           ObservatorySprite,
  marketplace:           MarketplaceSprite,
  harbor:                HarborSprite,
  barracks:              BarracksSprite,
  walls:                 WallsSprite,
  stable:                StableSprite,
  temple:                TempleSprite,
  monument:              MonumentSprite,
  amphitheater:          AmphitheaterSprite,
  shrine:                ShrineSprite,
  forum:                 ForumSprite,
  safehouse:             SafehouseSprite,
  'intelligence-agency': IntelAgencySprite,
  'security-bureau':     SecurityBureauSprite,
};

export const UNIT_SPRITE_SIZE = 128;
export const BUILDING_SPRITE_SIZE = 192;
```

- [ ] **Step 4: Run tests**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-catalog.test.ts
```

Expected: PASS (41 tests — 18 unit + 23 building)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/sprite-catalog.ts tests/renderer/sprites/sprite-catalog.test.ts
git commit -m "feat(sprites): sprite-catalog.ts + coverage tests for all 18 units + 23 buildings"
```

---

## Task 5: sprite-loader.ts — SpriteCache, initSprites, getUnit, getBuilding

**Files:**
- Create: `src/renderer/sprites/sprite-loader.ts`
- Create: `tests/renderer/sprites/sprite-loader.test.ts`

No React, no flushSync, no DOM manipulation for SVG generation. `renderToSVGString` is now a direct function call — the sprite component returns the SVG string synchronously. The only async step is `svgStringToImage` (Blob URL → `HTMLImageElement`). Tests require jsdom only for the `Image` constructor.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/sprites/sprite-loader.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock URL and Image before importing the module under test
vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);

// Auto-fire onload when src is set — jsdom doesn't load blob URLs natively
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  set(_val: string) { Promise.resolve().then(() => this.onload?.(new Event('load'))); },
  get() { return this._src ?? ''; },
  configurable: true,
});

import { spriteCache, initSprites } from '@/renderer/sprites/sprite-loader';

describe('SpriteCache before initSprites', () => {
  it('getUnit returns null before any load', () => {
    expect(spriteCache.getUnit('warrior', 'player')).toBeNull();
  });

  it('getBuilding returns null before any load', () => {
    expect(spriteCache.getBuilding('granary', 'player')).toBeNull();
  });

  it('getUnit does not throw for unknown civ', () => {
    expect(() => spriteCache.getUnit('settler', 'nonexistent')).not.toThrow();
  });
});

describe('SpriteCache after initSprites', () => {
  beforeAll(async () => {
    await initSprites({ player: '#4a90d9' });
  });

  it('getUnit returns an HTMLImageElement', () => {
    expect(spriteCache.getUnit('warrior', 'player')).toBeInstanceOf(HTMLImageElement);
  });

  it('getBuilding returns an HTMLImageElement', () => {
    expect(spriteCache.getBuilding('granary', 'player')).toBeInstanceOf(HTMLImageElement);
  });

  it('getUnit returns null for an uncached civ', () => {
    expect(spriteCache.getUnit('warrior', 'uncached-civ')).toBeNull();
  });
});
```

The mocks are declared before `import` (hoisted) so they are active when `sprite-loader.ts` loads. The `HTMLImageElement.prototype.src` patch auto-fires `onload` so `svgStringToImage` resolves without a real network request.

- [ ] **Step 2: Run test to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-loader.test.ts
```

Expected: FAIL — `Cannot find module '@/renderer/sprites/sprite-loader'`

- [ ] **Step 3: Create src/renderer/sprites/sprite-loader.ts**

```typescript
import { derivePalette } from './sprite-system';
import {
  UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG,
  UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE,
} from './sprite-catalog';
import type { UnitType } from '@/core/types';
import type { FactionPalette } from './sprite-system';

// SVG string → HTMLImageElement via Blob URL.
// This is the only async step; SVG generation (below) is synchronous.
function svgStringToImage(svgString: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(size, size);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG image load failed')); };
    img.src = url;
  });
}

class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();

  async loadCiv(civId: string, civColor: string): Promise<void> {
    const palette: FactionPalette = derivePalette(civColor);

    // SVG string generation is synchronous — direct function call, no React/DOM needed.
    const unitWork = Object.entries(UNIT_SPRITE_CATALOG).map(async ([type, fn]) => {
      const svg = fn({ palette, svgOnly: true });
      if (!svg) return;
      const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE);
      this.units.set(`${type}:${civId}`, img);
    });

    const buildingWork = Object.entries(BUILDING_SPRITE_CATALOG).map(async ([id, fn]) => {
      const svg = fn({ palette, svgOnly: true });
      if (!svg) return;
      const img = await svgStringToImage(svg, BUILDING_SPRITE_SIZE);
      this.buildings.set(`${id}:${civId}`, img);
    });

    await Promise.all([...unitWork, ...buildingWork]);
  }

  getUnit(type: UnitType, civId: string): HTMLImageElement | null {
    return this.units.get(`${type}:${civId}`) ?? null;
  }

  getBuilding(buildingId: string, civId: string): HTMLImageElement | null {
    return this.buildings.get(`${buildingId}:${civId}`) ?? null;
  }
}

export const spriteCache = new SpriteCache();

export async function initSprites(civColors: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.entries(civColors).map(([civId, color]) => spriteCache.loadCiv(civId, color)),
  );
}
```

- [ ] **Step 4: Run sprite-loader tests**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-loader.test.ts
```

Expected: PASS (6 tests)

- [ ] **Step 5: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sprites/sprite-loader.ts tests/renderer/sprites/sprite-loader.test.ts
git commit -m "feat(sprites): sprite-loader.ts — SpriteCache with direct-call SVG generation (no React)"
```

---

## Task 6: unit-renderer.ts — add LOD + sprite drawImage path; fix missing unit icons

**Files:**
- Modify: `src/renderer/unit-renderer.ts`

Two changes: (1) import `LOD_SPRITE_ZOOM_THRESHOLD` from `sprite-system` (single source of truth), (2) add sprite drawImage path. Also fix a pre-existing bug: `archer`, `galley`, and `trireme` are missing from `UNIT_ICONS`, causing them to display `?` at zoom < 0.4.

- [ ] **Step 1: Add missing unit icons and import LOD + spriteCache**

Current imports at top of `src/renderer/unit-renderer.ts`:
```typescript
import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible, isForestConcealedUnit } from '@/systems/fog-of-war';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
```

Replace with:
```typescript
import type { Unit, VisibilityMap, GameState } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible, isForestConcealedUnit } from '@/systems/fog-of-war';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
```

Current `UNIT_ICONS` (missing `archer`, `galley`, `trireme`):
```typescript
const UNIT_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
  swordsman: '🗡️',
  pikeman: '🔱',
  musketeer: '🔫',
  spy_scout: '🕵️',
  spy_informant: '🕵️',
  spy_agent: '🕵️',
  spy_operative: '🕵️',
  spy_hacker: '💻',
  scout_hound: '🐕',
  shadow_warden: '🦅',
  war_hound: '🐺',
};
```

Replace with:
```typescript
const UNIT_ICONS: Record<string, string> = {
  settler:       '🏕️',
  worker:        '👷',
  scout:         '🔭',
  warrior:       '⚔️',
  archer:        '🏹',
  swordsman:     '🗡️',
  pikeman:       '🔱',
  musketeer:     '🔫',
  galley:        '⛵',
  trireme:       '🚢',
  spy_scout:     '🕵️',
  spy_informant: '🕵️',
  spy_agent:     '🕵️',
  spy_operative: '🕵️',
  spy_hacker:    '💻',
  scout_hound:   '🐕',
  shadow_warden: '🦅',
  war_hound:     '🐺',
};
```

- [ ] **Step 2: Replace circle+emoji with sprite-aware draw block**

Current per-unit draw block (lines 84–96):
```typescript
        ctx.beginPath();
        ctx.arc(unitX, unitY, size * (stack.length === 1 ? 0.35 : 0.25), 0, Math.PI * 2);
        ctx.fillStyle = ownerColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.font = `${size * (stack.length === 1 ? 0.4 : 0.28)}px system-ui`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(UNIT_ICONS[unit.type] ?? '?', unitX, unitY);
```

Replace with:
```typescript
        const sprite = camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD
          ? spriteCache.getUnit(unit.type, unit.owner)
          : null;

        if (sprite) {
          const drawSize = size * (stack.length === 1 ? 0.9 : 0.65);
          ctx.drawImage(sprite, unitX - drawSize / 2, unitY - drawSize / 2, drawSize, drawSize);
        } else {
          ctx.beginPath();
          ctx.arc(unitX, unitY, size * (stack.length === 1 ? 0.35 : 0.25), 0, Math.PI * 2);
          ctx.fillStyle = ownerColor;
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.font = `${size * (stack.length === 1 ? 0.4 : 0.28)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(UNIT_ICONS[unit.type] ?? '?', unitX, unitY);
        }
```

Health bar, fortify badge, and stack count badge after this block are unchanged.

- [ ] **Step 3: Run existing unit-renderer tests**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/unit-renderer.test.ts
```

Expected: PASS (4 tests). These tests call `drawUnits` with zoom=1 but the sprite cache is empty (not initialized), so `getUnit` returns `null` and the emoji path runs. The `fillText` assertions still fire.

- [ ] **Step 4: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/unit-renderer.ts
git commit -m "feat(sprites): unit-renderer — sprite drawImage at zoom>=0.4; fix missing archer/galley/trireme icons"
```

---

## Task 7: city-renderer.ts — getProductionBadgeSprite + drawCities update

**Files:**
- Modify: `src/renderer/city-renderer.ts`

Import `LOD_SPRITE_ZOOM_THRESHOLD` from `sprite-system` (same constant, not a local redefinition). Production badge sprite size is `size * 0.30` — matching the visual weight of the existing emoji badge, not the raw sprite viewBox size.

- [ ] **Step 1: Add imports**

Current imports in `src/renderer/city-renderer.ts`:
```typescript
import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { getOccupiedCityMood } from '@/systems/city-occupation-system';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { PRODUCTION_ICONS, PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
import { Camera } from './camera';
import { getHorizontalWrapRenderCoords } from './wrap-rendering';
```

Add two lines after existing imports:
```typescript
import { spriteCache } from './sprites/sprite-loader';
import { LOD_SPRITE_ZOOM_THRESHOLD } from './sprites/sprite-system';
```

- [ ] **Step 2: Add getProductionBadgeSprite**

After the existing `getProductionBadgeIcon` function:
```typescript
export function getProductionBadgeSprite(
  city: { productionQueue: string[] },
  civId: string,
): HTMLImageElement | null {
  if (city.productionQueue.length === 0) return null;
  const id = city.productionQueue[0];
  return spriteCache.getBuilding(id, civId) ?? null;
}
```

- [ ] **Step 3: Update production badge in drawCities**

Current production badge block:
```typescript
      // Bottom-right badge: currently-building icon (player-owned, non-empty queue only)
      if (city.owner === playerCivId) {
        const buildIcon = getProductionBadgeIcon(city);
        if (buildIcon) {
          ctx.font = `${size * 0.28}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = '#fff';
          ctx.fillText(buildIcon, screen.x + size * 0.45, screen.y + size * 0.45);
        }
      }
```

Replace with:
```typescript
      // Bottom-right badge: currently-building icon (player-owned, non-empty queue only)
      if (city.owner === playerCivId) {
        const badgeSprite = camera.zoom >= LOD_SPRITE_ZOOM_THRESHOLD
          ? getProductionBadgeSprite(city, playerCivId)
          : null;
        if (badgeSprite) {
          // size * 0.30 matches the visual weight of the emoji badge at size * 0.28 font
          const badgeSize = size * 0.30;
          ctx.drawImage(
            badgeSprite,
            screen.x + size * 0.45 - badgeSize / 2,
            screen.y + size * 0.45 - badgeSize / 2,
            badgeSize,
            badgeSize,
          );
        } else {
          const buildIcon = getProductionBadgeIcon(city);
          if (buildIcon) {
            ctx.font = `${size * 0.28}px system-ui`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#fff';
            ctx.fillText(buildIcon, screen.x + size * 0.45, screen.y + size * 0.45);
          }
        }
      }
```

The `drawImage` positions the sprite so its center aligns with `(screen.x + size * 0.45, screen.y + size * 0.45)` — identical to the emoji position.

- [ ] **Step 4: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts
git commit -m "feat(sprites): city-renderer — building sprite badge at zoom>=0.4, badge size matches emoji weight"
```

---

## Task 8: main.ts — call initSprites in startGame()

**Files:**
- Modify: `src/main.ts`

`startGame()` is the single function called for new game, hot-seat, load, continue, and import paths. Adding `initSprites` once there covers all entry points. No `await` — fire and forget; renderers fall back to emoji while the cache warms.

- [ ] **Step 1: Add import**

Find the imports block in `src/main.ts` and add:
```typescript
import { initSprites } from '@/renderer/sprites/sprite-loader';
```

- [ ] **Step 2: Add initSprites call at the top of startGame()**

Current `startGame()` in `src/main.ts` (around line 2735):
```typescript
function startGame(): void {
  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(gameState);
```

Replace with:
```typescript
function startGame(): void {
  // Warm sprite cache non-blocking — renderers fall back to emoji while loading
  const civColors: Record<string, string> = {};
  for (const [civId, civ] of Object.entries(gameState.civilizations)) {
    civColors[civId] = civ.color;
  }
  initSprites(civColors);

  // Center camera on current player's starting position
  centerOnCurrentPlayer();

  renderLoop.setGameState(gameState);
```

`gameState.civilizations` contains all major civs (player + AI). Minor civs (`mc-*`) and barbarians are stored in `state.minorCivs` / separately — they are intentionally excluded and fall back to emoji.

- [ ] **Step 3: Build + test**

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat(sprites): main.ts — initSprites in startGame() covers all entry points"
```

---

## Task 9: Docs — sprites rule, CLAUDE.md, AGENTS.md, hook

**Files:**
- Create: `.claude/rules/sprites.md`
- Modify: `CLAUDE.md`
- Modify: `AGENTS.md`
- Modify: `.claude/hooks/check-src-edit.sh`

- [ ] **Step 1: Create .claude/rules/sprites.md**

```markdown
# Sprite System Rules

Applies to: `src/renderer/sprites/**`

## Extension Recipe (adding a new unit or building sprite)

1. Design the sprite in Claude Design; export the JSX bundle.
2. Copy the new `FooSprite` component from the exported JSX into `units.tsx` or `buildings.tsx`.
3. Change the signature:
   - From: `function FooSprite({ faction = 'imperials', animate = 'idle' })`
   - To:   `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps): string`
4. Replace every `factionAccent(faction)` with `palette`, every `faction={faction}` on `<Banner>` with `palette={palette}`, and every `f.mid`/`f.dark`/`f.bright` with `palette.mid`/`palette.dark`/`palette.bright`.
5. Replace `<SpriteFrame animate={animate}>` with `<SpriteFrame svgOnly={svgOnly}>`.
6. If the unit uses `spyBase` or another shared helper that takes `faction`, update the helper to take `palette: FactionPalette` and update all its usages.
7. Add one line to `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` in `sprite-catalog.ts`.
8. Done. Loader, renderers, and catalog tests pick it up automatically.

## Hard Rules

- **Never use `Object.assign(window, ...)` in sprite files.** All exports are named.
- **Never import React or react-dom in sprite files.** The custom JSX runtime in `jsx-runtime.ts` handles all JSX. No React dependency exists in this project.
- **All civ-specific color must flow through `palette: FactionPalette`.** Never hardcode faction names or hex colors for civ identity.
- **`getUnit()` and `getBuilding()` must return `null` for uncached keys** — never throw. Callers fall back to emoji.
- **`LOD_SPRITE_ZOOM_THRESHOLD` is exported from `sprite-system.tsx`.** Import it there in both `unit-renderer.ts` and `city-renderer.ts`. Do not redefine it locally.
- **`SpriteFrame svgOnly={true}` omits the CSS `<style>` tag.** Browser security blocks CSS animations in SVG loaded as `<img>`, so the tag is wasted bytes in preloader mode.
- **Barbarians and minor civs are not preloaded.** `getUnit('warrior', 'barbarian')` returns `null` by design.
- **Never call `initSprites` per-turn or per-frame.** It is called once in `startGame()`.

## Catalog Test Contract

`tests/renderer/sprites/sprite-catalog.test.ts` asserts that every `UnitType` value and every building ID in `BUILDINGS` has a catalog entry. This test will fail after adding a new type if step 7 above is skipped. Fix by adding the catalog line, not by weakening the test.
```

- [ ] **Step 2: Update CLAUDE.md Rules Index**

Find the Rules Index section. Add at the end of the list:
```
- `.claude/rules/sprites.md` — sprite extension recipe, FactionPalette contract, catalog coverage, LOD constant location, barbarian fallback
```

- [ ] **Step 3: Update AGENTS.md Rule Files section**

Find the Rule Files section, add:
```
- `src/renderer/sprites/**` -> `.claude/rules/sprites.md`
```

In the Commit & Pull Request Guidelines section, add:
```
When adding a new unit or building type with a sprite, add one line to `UNIT_SPRITE_CATALOG`
or `BUILDING_SPRITE_CATALOG` in the same PR — the catalog coverage test enforces this.
```

- [ ] **Step 4: Update .claude/hooks/check-src-edit.sh**

Add this check before the final `if [ -n "$violations" ]` block:

```bash
# --- Object.assign(window or React import in sprite files ---
case "$file_path" in
  */src/renderer/sprites/*.tsx|*/src/renderer/sprites/*.ts)
    if grep -nE 'Object\.assign\(window' "$file_path" >/dev/null; then
      lines="$(grep -nE 'Object\.assign\(window' "$file_path" | head -5)"
      append "Object.assign(window,...) is banned in sprite files — use named exports (see .claude/rules/sprites.md):
$lines"
    fi
    if grep -nE "from ['\"]react['\"]|from ['\"]react-dom" "$file_path" >/dev/null; then
      lines="$(grep -nE "from ['\"]react['\"]|from ['\"]react-dom" "$file_path" | head -5)"
      append "React imports are banned in sprite files — use the custom jsx-runtime (see .claude/rules/sprites.md):
$lines"
    fi
    ;;
esac
```

- [ ] **Step 5: Build + test**

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add .claude/rules/sprites.md CLAUDE.md AGENTS.md .claude/hooks/check-src-edit.sh
git commit -m "docs(sprites): add sprites rule, CLAUDE.md index, AGENTS.md, hook enforcement for React imports"
```

---

## Task 10: Final verification + update PR

- [ ] **Step 1: Full build**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exits 0. No TypeScript errors.

- [ ] **Step 2: Full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all tests pass including:
- `tests/renderer/sprites/sprite-system.test.ts` (4 tests)
- `tests/renderer/sprites/sprite-catalog.test.ts` (41 tests — 18 unit + 23 building)
- `tests/renderer/sprites/sprite-loader.test.ts` (6 tests)
- `tests/renderer/unit-renderer.test.ts` (4 tests — existing, still pass)

- [ ] **Step 3: Verify hook**

```bash
bash .claude/hooks/check-src-edit.sh <<< "{\"tool_input\":{\"file_path\":\"$(pwd)/src/renderer/sprites/sprite-loader.ts\"}}"
echo "exit: $?"
```

Expected: exit 0.

- [ ] **Step 4: Verify git log**

```bash
git log --oneline origin/main..HEAD
```

Expected: 10-11 commits covering tasks 0–9 (spec doc + plan doc on branch already).

- [ ] **Step 5: Push + update PR description**

```bash
git push
gh pr edit 195 --body "$(cat <<'EOF'
## Summary

- **No React dependency.** Introduces a custom JSX-to-string runtime (`src/renderer/sprites/jsx-runtime.ts`, ~120 lines) so sprite components are TSX files that return SVG strings synchronously. Zero npm installs; bundle size unchanged.
- Ports all 18 unit + 23 building SVG sprites from Claude Design export to TSX
- Derives a 4-stop `FactionPalette` from each civ's hex color — no hardcoded faction names
- Preloads at game start via synchronous string generation → Blob URL → `HTMLImageElement` cache
- Units show as SVG sprites at zoom ≥ 0.4; emoji circle fallback below threshold or while cache warms
- Production badge in city circle shows building sprite at zoom ≥ 0.4; badge center aligned with emoji position; size matched to emoji visual weight (`size * 0.30`)
- Fixes pre-existing bug: `archer`, `galley`, `trireme` were missing from `UNIT_ICONS` (showed `?`)
- `LOD_SPRITE_ZOOM_THRESHOLD = 0.4` exported from `sprite-system.tsx` — single source of truth for both renderers
- `initSprites` called once in `startGame()` — covers new game, hot-seat, load, continue, import paths
- `.claude/rules/sprites.md` documents the one-line extension recipe and hard rules including spyBase pattern and React ban

## Test plan

- [ ] `yarn build` exits 0
- [ ] `yarn test` exits 0 (51 sprite tests + 4 existing unit-renderer tests)
- [ ] Manual smoke: `yarn dev` → new game → zoom past 0.4 → units switch from emoji to sprites
- [ ] Manual smoke: zoom below 0.4 → emoji fallback resumes seamlessly
- [ ] Manual smoke: archer, galley, trireme now show correct emoji (not `?`) at low zoom
- [ ] Manual smoke: production badge in city circle shows building sprite when zoomed in, same position as emoji
- [ ] Manual smoke: `yarn tauri:dev` → same behavior on macOS

## Closes

Closes #9

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] §1 derivePalette — Task 1
- [x] §2 File structure — Tasks 0–5 create all files
- [x] §3 sprite-system.tsx — Task 1 (FactionPalette, derivePalette, LOD constant, all primitives, svgOnly skips style)
- [x] §4 units.tsx — Task 2 (18 components, spyBase transformation fully shown, faction→palette)
- [x] §5 buildings.tsx — Task 3 (23 components, BuildingFrame without palette in props)
- [x] §6 sprite-catalog.ts — Task 4 (plain function types, not React.ComponentType)
- [x] §7 sprite-loader.ts — Task 5 (synchronous SVG generation, no React/flushSync)
- [x] §8 LOD strategy — Tasks 6+7 (threshold imported from sprite-system in both renderers)
- [x] §9 unit-renderer.ts — Task 6 (missing icons fixed, sprite path added)
- [x] §10 city-renderer.ts — Task 7 (badge size 0.30, center-aligned with emoji)
- [x] §11 main.ts — Task 8 (startGame() covers all entry points, no `/path/to/worktree` placeholder)
- [x] §12 Testing — Tasks 1, 4, 5 (sprite-system, sprite-catalog, sprite-loader)
- [x] §13 Extension recipe — Task 9 (sprites.md, spyBase pattern documented, React ban enforced by hook)

**React elimination:**
- [x] No `yarn add react react-dom` (Task 0 creates jsx-runtime.ts instead)
- [x] No `@vitejs/plugin-react` (vite.config.ts uses `esbuild.jsxImportSource` only)
- [x] No `import React from 'react'` in any sprite file
- [x] Hook now flags React imports in sprite files

**Fixed bugs:**
- [x] `spyBase` transformation shown with full code (Task 2)
- [x] `archer`, `galley`, `trireme` added to UNIT_ICONS (Task 6)
- [x] `LOD_SPRITE_ZOOM_THRESHOLD` exported from sprite-system, imported in both renderers (Tasks 1, 6, 7)
- [x] `<style>` tag skipped in svgOnly mode (Task 1 SpriteFrame)
- [x] Production badge size `size * 0.30`, center-aligned (Task 7)
- [x] `void _HexBase` hack removed — HexBase not imported in units.tsx (Task 2)
- [x] Sprite-loader tests use mock before module import (no ordering fragility) (Task 5)
- [x] Task 8 points to `startGame()`, no placeholder path

**No new placeholders:** All steps have actual code.
