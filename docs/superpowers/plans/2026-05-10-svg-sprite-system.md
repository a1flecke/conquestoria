# SVG Sprite System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace emoji unit/building rendering with faction-colored SVG sprites rendered via Canvas `drawImage`, falling back to emoji below zoom 0.4.

**Architecture:** React TSX sprite components preloaded via `flushSync` + `ReactDOM.createRoot` → `XMLSerializer` → Blob URL → `HTMLImageElement` cache (`SpriteCache`). Canvas renderers do a cache lookup and call `ctx.drawImage()` where they previously drew emoji. Emoji fallback remains active below zoom 0.4 or while the cache is warming.

**Tech Stack:** TypeScript, React 18, react-dom/client, @vitejs/plugin-react, Vitest (node + jsdom environments), Canvas 2D

---

## File Structure

```
New files:
  src/renderer/sprites/sprite-system.tsx   # palette derivation, shared SVG primitives
  src/renderer/sprites/units.tsx           # 18 unit sprite components
  src/renderer/sprites/buildings.tsx       # 23 building sprite components
  src/renderer/sprites/sprite-catalog.ts   # UnitType / building ID → component map
  src/renderer/sprites/sprite-loader.ts    # SpriteCache class, initSprites(), getUnit/Building

  tests/renderer/sprites/sprite-system.test.ts
  tests/renderer/sprites/sprite-catalog.test.ts
  tests/renderer/sprites/sprite-loader.test.ts

  .claude/rules/sprites.md                 # enforcement rules for future extension

Modified files:
  package.json          # add react, react-dom, @types/*, @vitejs/plugin-react
  vite.config.ts        # add react() plugin, include .tsx in tsconfig
  tsconfig.json         # add "jsx": "react-jsx", include src/**/*.tsx
  src/renderer/unit-renderer.ts   # add LOD + sprite drawImage path
  src/renderer/city-renderer.ts   # add getProductionBadgeSprite, use in drawCities
  src/main.ts                     # call initSprites after game state initialized
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

## Task 0: Install React and configure tooling

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Modify: `tsconfig.json`

- [ ] **Step 1: Add React to package.json**

```bash
eval "$(mise activate bash)"
cd /path/to/worktree  # adjust to actual worktree path
yarn add react@^18 react-dom@^18
yarn add --dev @types/react@^18 @types/react-dom@^18 @vitejs/plugin-react@^4
```

Expected: yarn resolves packages, package.json now lists react and react-dom in `dependencies` and the three dev packages in `devDependencies`.

- [ ] **Step 2: Add React plugin to vite.config.ts**

Current top of `vite.config.ts`:
```typescript
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
```

Replace with:
```typescript
import { defineConfig, type Plugin } from 'vite';
import { resolve } from 'path';
import react from '@vitejs/plugin-react';
```

Current `plugins` array assignment:
```typescript
  const plugins: Plugin[] = isTauri
    ? [{
      name: 'conquestoria-tauri-index-html',
      transformIndexHtml(html) {
        return html.replace(/\s*<link rel="manifest" href="\/conquestoria\/manifest\.json" \/>/, '');
      },
    }]
    : [];
```

Replace with:
```typescript
  const tauri: Plugin = {
    name: 'conquestoria-tauri-index-html',
    transformIndexHtml(html) {
      return html.replace(/\s*<link rel="manifest" href="\/conquestoria\/manifest\.json" \/>/, '');
    },
  };
  const plugins: Plugin[] = isTauri ? [react(), tauri] : [react()];
```

- [ ] **Step 3: Update tsconfig.json for JSX and tsx files**

Add `"jsx": "react-jsx"` to `compilerOptions` and add `src/**/*.tsx` to `include`:

Current `compilerOptions`:
```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals", "node"],
```

After (add jsx line after lib):
```json
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
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

- [ ] **Step 4: Verify build passes**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exits 0. No new TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.ts tsconfig.json yarn.lock
git commit -m "chore: add react + @vitejs/plugin-react for SVG sprite preloader"
```

---

## Task 1: sprite-system.tsx — palette derivation + SVG primitives

**Files:**
- Create: `src/renderer/sprites/sprite-system.tsx`
- Create: `tests/renderer/sprites/sprite-system.test.ts`

Reference: `/tmp/conquestoria-sprites/project/lib/sprite-system.jsx`

Key changes from design source:
1. Replace `Object.assign(window, ...)` with named exports
2. Replace `faction: string` prop with `palette: FactionPalette` on Banner
3. Add `svgOnly?: boolean` to `SpriteFrame` — when true, returns bare `<svg>` (no div/label)
4. Add `<style>` with `cq-anim-idle` keyframe inside the SVG for DOM contexts
5. Add `derivePalette(civColor: string): FactionPalette` (spec §1)
6. Export `MATERIAL_PALETTE` (renamed from nested PALETTE tokens) and `CATEGORY_TINTS`

- [ ] **Step 1: Write the failing test**

Create `tests/renderer/sprites/sprite-system.test.ts`:
```typescript
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

  it('mid matches the input color exactly', () => {
    expect(derivePalette('#4a90d9').mid).toBe('#4a90d9');
  });

  it('preserves hue identity — blue input gives blue mid', () => {
    const p = derivePalette('#4a90d9');
    // Convert mid back to HSL and check hue is within ±15° of 210° (blue)
    const [h] = hexToHslTest(p.mid);
    expect(h).toBeGreaterThan(195);
    expect(h).toBeLessThan(225);
  });

  it('preserves hue identity — red input gives red mid', () => {
    const p = derivePalette('#d94a4a');
    const [h] = hexToHslTest(p.mid);
    // red is near 0°/360°
    expect(h < 15 || h > 345).toBe(true);
  });
});

// Helper for tests only — not exported from sprite-system
function hexToHslTest(hex: string): [number, number, number] {
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
import React from 'react';

export type FactionPalette = { dark: string; mid: string; bright: string; trim: string };

// --- HSL helpers (module-private) ---

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

// --- Public exports ---

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
const INK_ANIM_STYLE = `.cq-anim-idle{animation:cq-float 2s ease-in-out infinite alternate}@keyframes cq-float{from{transform:translateY(0)}to{transform:translateY(-3px)}}`;

// --- SVG primitives ---

interface HexBaseProps { size?: number; tint?: string; opacity?: number; ring?: boolean }
export function HexBase({ size = 96, tint = '#000', opacity = 0.18, ring = true }: HexBaseProps): React.ReactElement {
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

interface BannerProps { x?: number; y?: number; palette: FactionPalette; scale?: number; shape?: 'pennant' | 'rect' }
export function Banner({ x = 0, y = 0, palette, scale = 1, shape = 'pennant' }: BannerProps): React.ReactElement {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-0.6" y="-12" width="1.4" height="18" fill={P.wood.dark} />
      {shape === 'pennant' ? (
        <path d="M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" />
      ) : (
        <rect x="0" y="-12" width="12" height="9" fill={palette.mid} stroke={palette.dark} strokeWidth="0.6" />
      )}
      <circle cx="5" cy="-7" r="1.6" fill={palette.trim} />
    </g>
  );
}

interface ShadowProps { cx?: number; cy?: number; rx?: number; ry?: number; opacity?: number }
export function Shadow({ cx = 64, cy = 92, rx = 18, ry = 5, opacity = 0.35 }: ShadowProps): React.ReactElement {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" opacity={opacity} />;
}

interface HumanoidProps {
  cx?: number; cy?: number; scale?: number;
  cloth?: string; pants?: string; accent?: string;
  skin?: string; hair?: string; hat?: React.ReactElement | null; facing?: number;
}
export function Humanoid({
  cx = 64, cy = 64, scale = 1,
  cloth = P.cloth.tunic, pants = P.cloth.wool, accent = '#000',
  skin = P.skin.warm, hair = '#3a2a1a', hat = null, facing = 0,
}: HumanoidProps): React.ReactElement {
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
  children: React.ReactNode;
}
export function SpriteFrame({
  size = 128, svgOnly = false, hex = true, hexTint = '#000',
  label, sub, animate = 'idle', children,
}: SpriteFrameProps): React.ReactElement {
  const animClass = animate ? `cq-anim-${animate}` : '';
  const svgEl = (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={svgOnly ? size : '100%'}
      height={svgOnly ? size : '100%'}
      className={animClass}
      xmlns="http://www.w3.org/2000/svg"
    >
      <style>{INK_ANIM_STYLE}</style>
      {hex && (
        <g transform={`translate(${(size - 96) / 2} ${size - 96 * 0.866 - 6})`}>
          <HexBase size={96} tint={hexTint} />
        </g>
      )}
      <g className="cq-sprite-figure">{children}</g>
    </svg>
  );
  if (svgOnly) return svgEl;
  return (
    <div className="cq-sprite-wrap" data-animate={animate}>
      {svgEl}
      {label && <div className="cq-sprite-label">{label}{sub && <span> · {sub}</span>}</div>}
    </div>
  );
}

interface BuildingPlinthProps { cx?: number; cy?: number; w?: number; color?: string }
export function BuildingPlinth({ cx = 96, cy = 150, w = 130, color = P.stone.mid }: BuildingPlinthProps): React.ReactElement {
  return (
    <g>
      <ellipse cx={cx} cy={cy + 10} rx={w / 2 + 6} ry="14" fill="#000" opacity="0.25" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 8},${cy + 12} L${cx - w / 2 + 8},${cy + 12} Z`} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={`M${cx - w / 2},${cy} L${cx + w / 2},${cy} L${cx + w / 2 - 4},${cy - 4} L${cx - w / 2 + 4},${cy - 4} Z`} fill={P.stone.light} stroke={P.ink.line} strokeWidth="0.6" />
    </g>
  );
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-system.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/sprites/sprite-system.tsx tests/renderer/sprites/sprite-system.test.ts
git commit -m "feat(sprites): add sprite-system.tsx — FactionPalette, derivePalette, SVG primitives"
```

---

## Task 2: units.tsx — 18 unit sprite components

**Files:**
- Create: `src/renderer/sprites/units.tsx`

Reference source: `/tmp/conquestoria-sprites/project/lib/units.jsx`

**Transformation pattern** applied to every component:

| Before (design JSX) | After (units.tsx) |
|---|---|
| `function FooSprite({ faction = 'imperials', animate = 'idle' })` | `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps)` |
| `const f = factionAccent(faction);` | (remove — `f` was the palette; use `palette` directly) |
| `<Banner ... faction={faction} ...>` | `<Banner ... palette={palette} ...>` |
| `accent={f.mid}` | `accent={palette.mid}` |
| `fill={f.dark}` / `fill={f.mid}` / `fill={f.bright}` | `fill={palette.dark}` / `fill={palette.mid}` / `fill={palette.bright}` |
| `<SpriteFrame animate={animate}>` | `<SpriteFrame svgOnly={svgOnly}>` |
| `const { SPRITE, Humanoid, ... } = window;` | Remove — use named imports |

- [ ] **Step 1: Create src/renderer/sprites/units.tsx**

The complete file must port all 18 components. Read the source at `/tmp/conquestoria-sprites/project/lib/units.jsx` and apply the transformation pattern above to every component. Below is the file header and two complete examples; apply the same pattern to all remaining 16 components.

```tsx
import React from 'react';
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  HexBase as _HexBase,
  Banner,
  Shadow,
  Humanoid,
  SpriteFrame,
} from './sprite-system';

// HexBase used indirectly via SpriteFrame; direct import silences unused-import linters
void _HexBase;

export type UnitSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

/* === CIVILIAN === */

export function SettlerSprite({ palette, svgOnly = false }: UnitSpriteProps): React.ReactElement {
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

export function WorkerSprite({ palette, svgOnly = false }: UnitSpriteProps): React.ReactElement {
  return (
    <SpriteFrame svgOnly={svgOnly}>
      <Shadow />
      <Humanoid cx={64} cy={70} scale={1} cloth={P.cloth.tunic} pants={P.cloth.wool} accent={palette.mid} hair="#5a3a20" hat={
        <ellipse cx="0" cy="-40" rx="12" ry="3" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="0.6" />
      } />
      <g transform="translate(82 30) rotate(28)">
        <rect x="-1" y="0" width="2.4" height="46" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="0.6" />
        <path d="M-5,46 L5,46 L4,58 L-4,58 Z" fill={P.metal.steel} stroke={P.ink.line} strokeWidth="0.8" />
      </g>
      <rect x="58" y="74" width="8" height="6" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.5" />
    </SpriteFrame>
  );
}
```

**Continue porting from `/tmp/conquestoria-sprites/project/lib/units.jsx` for all remaining 16 components**, applying the same pattern:

- `ScoutSprite` — spyglass scout with scout hat
- `ScoutHoundSprite` — dog body with faction collar
- `WarHoundSprite` — armored war dog
- `ShadowWardenSprite` — eagle/falcon rider silhouette
- `WarriorSprite` — sword + shield
- `SwordsmanSprite` — longsword fighter
- `PikemanSprite` — long pike carrier
- `ArcherSprite` — bow and quiver
- `MusketeerSprite` — musket with plumed hat
- `GalleySprite` — ship with oars (top-down)
- `TriremeSprite` — trireme with ram prow
- `SpyScoutSprite` — cloaked figure
- `SpyInformantSprite` — disguised civilian
- `SpyAgentSprite` — suited figure with briefcase
- `SpyOperativeSprite` — tactical operative
- `SpyHackerSprite` — modern techie with laptop

For naval units (GalleySprite, TriremeSprite), `SpriteFrame hex={false}` is intentional — the Canvas hex tile provides the ground plane. The hex flag is not changed for naval units in preloader mode; hex shadows are lightweight.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | head -30
```

Expected: exits 0, no errors about units.tsx.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sprites/units.tsx
git commit -m "feat(sprites): add units.tsx — 18 unit SVG sprite components"
```

---

## Task 3: buildings.tsx — 23 building sprite components

**Files:**
- Create: `src/renderer/sprites/buildings.tsx`

Reference source: `/tmp/conquestoria-sprites/project/lib/buildings.jsx`

**Transformation pattern** (same as units, plus one buildings-specific change):

| Before | After |
|---|---|
| `function FooSprite({ faction = 'imperials' })` | `export function FooSprite({ palette, svgOnly = false }: BuildingSpriteProps)` |
| `<BuildingFrame label="Foo" sub="Cat" category="cat">` | Keep as-is — BuildingFrame is internal to this file |
| `Banner ... faction={faction}` | `Banner ... palette={palette}` |
| `factionAccent(faction)` | `palette` |
| `const { SPRITE, SpriteFrame, Banner, BuildingPlinth, factionAccent } = window;` | Remove — use named imports |
| `SPRITE.CATEGORY_TINTS[category]` | `CATEGORY_TINTS[category]` |

- [ ] **Step 1: Create src/renderer/sprites/buildings.tsx**

```tsx
import React from 'react';
import {
  type FactionPalette,
  MATERIAL_PALETTE as P,
  CATEGORY_TINTS,
  Banner,
  SpriteFrame,
  BuildingPlinth,
} from './sprite-system';

export type BuildingSpriteProps = { palette: FactionPalette; svgOnly?: boolean };

// Internal helper — thatch/tile roof builders used by multiple buildings
function ThatchRoof({ d, color = P.thatch.straw, shadow = P.thatch.shadow }: { d: string; color?: string; shadow?: string }) {
  return (
    <g>
      <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />
      <path d={d} fill={shadow} opacity="0.18" />
    </g>
  );
}

function TileRoof({ d, color }: { d: string; color: string }) {
  return <path d={d} fill={color} stroke={P.ink.line} strokeWidth="1" />;
}

// BuildingFrame is internal — wraps SpriteFrame with defs + category accent ring
function BuildingFrame({
  children, label, sub, category, palette, svgOnly,
}: {
  children: React.ReactNode; label?: string; sub?: string;
  category?: string; palette: FactionPalette; svgOnly?: boolean;
}) {
  return (
    <SpriteFrame size={192} svgOnly={svgOnly} label={label} sub={sub} hexTint="#000">
      <defs>
        <pattern id="thatchPattern" width="6" height="4" patternUnits="userSpaceOnUse">
          <path d="M0,2 Q3,-1 6,2" stroke={P.thatch.shadow} strokeWidth="0.5" fill="none" />
        </pattern>
        <pattern id="tilePattern" width="6" height="3" patternUnits="userSpaceOnUse">
          <path d="M0,0 H6 M0,3 H6" stroke={P.ink.line} strokeWidth="0.3" />
        </pattern>
        <pattern id="stoneTexture" width="8" height="6" patternUnits="userSpaceOnUse">
          <path d="M0,3 H8 M2,0 V3 M5,3 V6 M0,6 H8" stroke={P.stone.dark} strokeWidth="0.4" opacity="0.4" />
        </pattern>
      </defs>
      {category && (
        <circle cx="96" cy="166" r="80" fill="none" stroke={CATEGORY_TINTS[category] ?? '#888'} strokeWidth="2" opacity="0.18" />
      )}
      {children}
    </SpriteFrame>
  );
}

/* === FOOD === */

export function GranarySprite({ palette, svgOnly = false }: BuildingSpriteProps): React.ReactElement {
  return (
    <BuildingFrame label="Granary" sub="Food" category="food" palette={palette} svgOnly={svgOnly}>
      <BuildingPlinth />
      {/* Round silo body */}
      <ellipse cx="96" cy="110" rx="38" ry="28" fill={P.stone.light} stroke={P.ink.line} strokeWidth="1.5" />
      <ellipse cx="96" cy="90" rx="38" ry="16" fill={P.stone.mid} stroke={P.ink.line} strokeWidth="1" />
      {/* Conical roof */}
      <path d="M58,90 L96,50 L134,90 Z" fill={P.thatch.straw} stroke={P.ink.line} strokeWidth="1" />
      <path d="M72,80 L96,56 L120,80" fill="none" stroke={P.thatch.shadow} strokeWidth="0.6" opacity="0.5" />
      {/* Door */}
      <path d="M86,138 Q86,120 96,120 Q106,120 106,138 Z" fill={P.wood.dark} stroke={P.ink.line} strokeWidth="0.8" />
      <Banner x={96} y={70} palette={palette} scale={0.9} />
    </BuildingFrame>
  );
}
```

**Continue porting from `/tmp/conquestoria-sprites/project/lib/buildings.jsx` for all remaining 22 components**, applying the same pattern:

Food: `HerbalistSprite`, `AqueductSprite`
Production: `WorkshopSprite`, `ForgeSprite`, `LumbermillSprite`, `QuarrySprite`
Science: `LibrarySprite`, `ArchiveSprite`, `ObservatorySprite`
Economy: `MarketplaceSprite`, `HarborSprite`
Military: `BarracksSprite`, `WallsSprite`, `StableSprite`
Culture: `TempleSprite`, `MonumentSprite`, `AmphitheaterSprite`, `ShrineSprite`, `ForumSprite`
Espionage: `SafehouseSprite`, `IntelAgencySprite`, `SecurityBureauSprite`

All 23 must be exported. The `palette` prop flows to `BuildingFrame` which passes `svgOnly` to `SpriteFrame`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
eval "$(mise activate bash)" && yarn build 2>&1 | head -30
```

Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/sprites/buildings.tsx
git commit -m "feat(sprites): add buildings.tsx — 23 building SVG sprite components"
```

---

## Task 4: sprite-catalog.ts + coverage tests

**Files:**
- Create: `src/renderer/sprites/sprite-catalog.ts`
- Create: `tests/renderer/sprites/sprite-catalog.test.ts`

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
import type React from 'react';
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

export type UnitSpriteComponent = React.ComponentType<UnitSpriteProps>;
export type BuildingSpriteComponent = React.ComponentType<BuildingSpriteProps>;

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
  granary:              GranarySprite,
  herbalist:            HerbalistSprite,
  aqueduct:             AqueductSprite,
  workshop:             WorkshopSprite,
  forge:                ForgeSprite,
  lumbermill:           LumbermillSprite,
  'quarry-building':    QuarrySprite,
  library:              LibrarySprite,
  archive:              ArchiveSprite,
  observatory:          ObservatorySprite,
  marketplace:          MarketplaceSprite,
  harbor:               HarborSprite,
  barracks:             BarracksSprite,
  walls:                WallsSprite,
  stable:               StableSprite,
  temple:               TempleSprite,
  monument:             MonumentSprite,
  amphitheater:         AmphitheaterSprite,
  shrine:               ShrineSprite,
  forum:                ForumSprite,
  safehouse:            SafehouseSprite,
  'intelligence-agency': IntelAgencySprite,
  'security-bureau':    SecurityBureauSprite,
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
git commit -m "feat(sprites): add sprite-catalog.ts + coverage tests for all 18 units + 23 buildings"
```

---

## Task 5: sprite-loader.ts — SpriteCache, initSprites, getUnit, getBuilding

**Files:**
- Create: `src/renderer/sprites/sprite-loader.ts`
- Create: `tests/renderer/sprites/sprite-loader.test.ts`

The loader needs DOM APIs (ReactDOM, Blob, Image). Tests use `// @vitest-environment jsdom` annotation. The default `vite.config.ts` environment is `'node'`, so this annotation is required.

- [ ] **Step 1: Write the failing test**

```typescript
// tests/renderer/sprites/sprite-loader.test.ts
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';
import { spriteCache, initSprites } from '@/renderer/sprites/sprite-loader';

describe('SpriteCache before initSprites', () => {
  it('getUnit returns null for any key', () => {
    expect(spriteCache.getUnit('warrior', 'player')).toBeNull();
  });

  it('getBuilding returns null for any key', () => {
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

  it('getUnit returns an HTMLImageElement after load', () => {
    const img = spriteCache.getUnit('warrior', 'player');
    expect(img).toBeInstanceOf(HTMLImageElement);
  });

  it('getBuilding returns an HTMLImageElement after load', () => {
    const img = spriteCache.getBuilding('granary', 'player');
    expect(img).toBeInstanceOf(HTMLImageElement);
  });

  it('getUnit returns null for uncached civ', () => {
    expect(spriteCache.getUnit('warrior', 'uncached-civ')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/sprites/sprite-loader.test.ts
```

Expected: FAIL — `Cannot find module '@/renderer/sprites/sprite-loader'`

- [ ] **Step 3: Create src/renderer/sprites/sprite-loader.ts**

```typescript
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import React from 'react';
import { derivePalette } from './sprite-system';
import { UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG, UNIT_SPRITE_SIZE, BUILDING_SPRITE_SIZE } from './sprite-catalog';
import type { UnitType } from '@/core/types';

function renderToSVGString(element: React.ReactElement): string {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;visibility:hidden;pointer-events:none';
  document.body.appendChild(container);
  const root = createRoot(container);
  flushSync(() => root.render(element));
  const svg = container.querySelector('svg');
  const result = svg ? new XMLSerializer().serializeToString(svg) : '';
  root.unmount();
  document.body.removeChild(container);
  return result;
}

function svgStringToImage(svgString: string, size: number): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const img = new Image(size, size);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`SVG image failed to load`)); };
    img.src = url;
  });
}

class SpriteCache {
  private units = new Map<string, HTMLImageElement>();
  private buildings = new Map<string, HTMLImageElement>();

  async loadCiv(civId: string, civColor: string): Promise<void> {
    const palette = derivePalette(civColor);

    const unitWork = Object.entries(UNIT_SPRITE_CATALOG).map(async ([type, Component]) => {
      const el = React.createElement(Component, { palette, svgOnly: true });
      const svg = renderToSVGString(el);
      if (!svg) return;
      const img = await svgStringToImage(svg, UNIT_SPRITE_SIZE);
      this.units.set(`${type}:${civId}`, img);
    });

    const buildingWork = Object.entries(BUILDING_SPRITE_CATALOG).map(async ([id, Component]) => {
      const el = React.createElement(Component, { palette, svgOnly: true });
      const svg = renderToSVGString(el);
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

Expected: PASS (5 tests). Note: jsdom's Blob URL support is limited — if `svgStringToImage` never fires `onload` in jsdom, the test will hang. If this happens, mock `URL.createObjectURL` + `Image` in the test's `beforeAll`:

```typescript
// Add at top of test if needed:
import { vi } from 'vitest';
beforeAll(() => {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  // Patch HTMLImageElement.src setter to auto-fire onload
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(val: string) { this._src = val; Promise.resolve().then(() => this.onload?.()); },
    get() { return this._src; },
  });
});
```

- [ ] **Step 5: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all tests pass including existing unit-renderer and fortify tests.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sprites/sprite-loader.ts tests/renderer/sprites/sprite-loader.test.ts
git commit -m "feat(sprites): add sprite-loader.ts — SpriteCache, initSprites, getUnit/getBuilding"
```

---

## Task 6: unit-renderer.ts — add LOD + sprite drawImage path

**Files:**
- Modify: `src/renderer/unit-renderer.ts`

The existing `drawUnits` function draws a circle + emoji for every unit. This task adds a sprite path: when zoom ≥ 0.4 and a sprite is cached, `ctx.drawImage` replaces the circle + emoji. Health bar, fortify badge, and stack count badge are preserved in both paths.

- [ ] **Step 1: Add LOD constant and import spriteCache**

At the top of `src/renderer/unit-renderer.ts`, after existing imports:

```typescript
import { spriteCache } from './sprites/sprite-loader';

const LOD_SPRITE_ZOOM_THRESHOLD = 0.4;
```

- [ ] **Step 2: Replace circle+emoji draw with sprite-aware path**

The existing per-unit draw block (lines 84–96 in unit-renderer.ts):
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

Health bar, fortify badge, and stack count badge code after this block are unchanged.

- [ ] **Step 3: Run existing unit-renderer tests**

```bash
eval "$(mise activate bash)" && yarn test --run tests/renderer/unit-renderer.test.ts
```

Expected: PASS — all existing tests (wrap parity, count badge, fortify badge) still pass. These tests call `drawUnits` with zoom=1 but the sprite cache is empty (not initialized in tests), so `getUnit` returns `null` and the emoji fallback runs. The `fillText` assertions still fire.

- [ ] **Step 4: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/unit-renderer.ts
git commit -m "feat(sprites): unit-renderer — sprite drawImage at zoom>=0.4, emoji fallback below"
```

---

## Task 7: city-renderer.ts — getProductionBadgeSprite + drawCities update

**Files:**
- Modify: `src/renderer/city-renderer.ts`

`getProductionBadgeIcon` returns an emoji string; this task adds a parallel `getProductionBadgeSprite` that returns a cached HTMLImageElement. In `drawCities`, when a sprite is available and zoom ≥ 0.4, draw it instead of the emoji.

- [ ] **Step 1: Add spriteCache import and LOD constant**

At the top of `src/renderer/city-renderer.ts`, after existing imports:
```typescript
import { spriteCache } from './sprites/sprite-loader';

const LOD_SPRITE_ZOOM_THRESHOLD = 0.4;
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

- [ ] **Step 3: Use sprite in drawCities production badge slot**

Current badge draw block in `drawCities` (the `if (city.owner === playerCivId)` block):
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
          const badgeSize = size * 0.44;
          ctx.drawImage(
            badgeSprite,
            screen.x + size * 0.23, screen.y + size * 0.23,
            badgeSize, badgeSize,
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

- [ ] **Step 4: Run full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all pass. city-renderer has no direct unit tests for the badge slot, but the build must remain clean.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/city-renderer.ts
git commit -m "feat(sprites): city-renderer — building sprite badge at zoom>=0.4, emoji fallback below"
```

---

## Task 8: main.ts — call initSprites after game state initialization

**Files:**
- Modify: `src/main.ts`

`initSprites` must be called once after `state.civilizations` is known (new game or load). It is non-blocking — the game renders normally during warmup, emoji → sprite transition happens automatically when cache warms.

- [ ] **Step 1: Find all state-ready call sites in main.ts**

```bash
grep -n "state\.civilizations\|newGame\|loadGame\|initGame" /path/to/worktree/src/main.ts | head -20
```

Identify the points where game state is fully initialized (after `newGame()` returns and after `loadGame()` returns).

- [ ] **Step 2: Add initSprites import**

At the top of `src/main.ts`, add:
```typescript
import { initSprites } from '@/renderer/sprites/sprite-loader';
```

- [ ] **Step 3: Add initSprites call after each state-ready point**

At each location where game state is set (new game + load game), add:

```typescript
// Build civColor map and warm sprite cache (non-blocking)
const civColors: Record<string, string> = {};
for (const [civId, civ] of Object.entries(state.civilizations)) {
  civColors[civId] = civ.color;
}
initSprites(civColors);
```

This fires async. The `state.civilizations` map contains all major civs. Barbarians (`'barbarian'` key or minor civ IDs starting with `'mc-'`) are typically stored elsewhere and are intentionally excluded — they fall back to emoji.

- [ ] **Step 4: Build + test**

```bash
eval "$(mise activate bash)" && yarn build && yarn test
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/main.ts
git commit -m "feat(sprites): main.ts — call initSprites after game state ready (non-blocking)"
```

---

## Task 9: CLAUDE.md, sprites rule, AGENTS.md, hook update

**Files:**
- Create: `.claude/rules/sprites.md`
- Modify: `CLAUDE.md` (Rules Index section)
- Modify: `AGENTS.md` (Rule Files section)
- Modify: `.claude/hooks/check-src-edit.sh`

- [ ] **Step 1: Create .claude/rules/sprites.md**

```markdown
# Sprite System Rules

Applies to: `src/renderer/sprites/**`

## Extension Recipe (adding a new unit or building sprite)

1. Design the sprite in Claude Design; export the JSX bundle.
2. Copy the new `FooSprite` component from the exported JSX into `src/renderer/sprites/units.tsx` or `buildings.tsx`.
3. Change the component signature:
   - From: `function FooSprite({ faction = 'imperials', animate = 'idle' })`
   - To:   `export function FooSprite({ palette, svgOnly = false }: UnitSpriteProps)`
4. Replace every `factionAccent(faction)` with `palette` and every `faction={faction}` on `<Banner>` with `palette={palette}`.
5. Replace `<SpriteFrame animate={animate}>` with `<SpriteFrame svgOnly={svgOnly}>`.
6. Add one line to `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` in `sprite-catalog.ts`.
7. Done. Loader, renderers, and catalog tests pick it up automatically.

## Hard Rules

- **Never use `Object.assign(window, ...)` in sprite files.** All exports are named.
- **All civ-specific color must flow through `palette: FactionPalette`.** Never hardcode faction names or hex colors for civ identity.
- **`getUnit()` and `getBuilding()` must return `null` for uncached keys** — never throw. Callers fall back to emoji.
- **`LOD_SPRITE_ZOOM_THRESHOLD = 0.4` is defined in `unit-renderer.ts`.** Import or replicate the constant; do not use a different threshold in `city-renderer.ts`.
- **`SpriteFrame svgOnly={true}` must produce a bare `<svg>` element** that `XMLSerializer.serializeToString()` can capture. No wrapper `<div>`, no label `<div>`.
- **Barbarians and minor civs are not preloaded.** `getUnit('warrior', 'barbarian')` returns `null` by design; callers fall back to emoji.
- **Never re-initialize the cache per turn.** Call `initSprites` once per game start (new game or load), not per turn or per render frame.

## Catalog Test Contract

`tests/renderer/sprites/sprite-catalog.test.ts` asserts that every `UnitType` value and every building ID in `BUILDINGS` has a catalog entry. This test will fail after adding a new unit or building type if step 6 above is skipped. Fix it by adding the catalog line, not by changing the test.
```

- [ ] **Step 2: Update CLAUDE.md Rules Index**

In `CLAUDE.md`, find the Rules Index section:
```
## Rules Index

Detailed rules live in `.claude/rules/` and auto-apply based on the files you edit:
- `.claude/rules/game-systems.md` — ...
- `.claude/rules/ui-panels.md` — ...
- `.claude/rules/strategy-game-mechanics.md` — ...
- `.claude/rules/end-to-end-wiring.md` — ...
- `.claude/rules/spec-fidelity.md` — ...
- `.claude/rules/incremental-mr-completion.md` — ...
- `.claude/rules/hooks-and-tooling.md` — ...
```

Add at the end of that list:
```
- `.claude/rules/sprites.md` — sprite extension recipe, FactionPalette contract, catalog coverage, LOD threshold, barbarian fallback
```

- [ ] **Step 3: Update AGENTS.md Rule Files section**

In `AGENTS.md`, find the Rule Files section:
```
- `src/systems/**`, `src/core/**`, `src/ai/**` -> `.claude/rules/game-systems.md`
- `src/ui/**`, `src/renderer/**`, `src/main.ts` -> `.claude/rules/ui-panels.md`
...
```

Add:
```
- `src/renderer/sprites/**` -> `.claude/rules/sprites.md`
```

Also add to the Commit & Pull Request Guidelines section a note:
```
When adding a new unit type or building type that includes a sprite, verify `UNIT_SPRITE_CATALOG` or `BUILDING_SPRITE_CATALOG` has a matching entry before opening a PR — the catalog coverage test will catch it, but earlier is better.
```

- [ ] **Step 4: Update .claude/hooks/check-src-edit.sh**

Find the final `if [ -n "$violations" ]` block. Before it, add this check for sprite files:

```bash
# --- Object.assign(window in sprite files ---
case "$file_path" in
  */src/renderer/sprites/*.tsx|*/src/renderer/sprites/*.ts)
    if grep -nE 'Object\.assign\(window' "$file_path" >/dev/null; then
      lines="$(grep -nE 'Object\.assign\(window' "$file_path" | head -5)"
      append "Object.assign(window,...) is banned in sprite files — use named exports (see .claude/rules/sprites.md):
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
git commit -m "docs(sprites): add sprites rule, CLAUDE.md index, AGENTS.md, hook enforcement"
```

---

## Task 10: Final verification + draft PR

**Files:** none (verification only)

- [ ] **Step 1: Full build**

```bash
eval "$(mise activate bash)" && yarn build
```

Expected: exits 0. No TypeScript errors in any of the new sprite files.

- [ ] **Step 2: Full test suite**

```bash
eval "$(mise activate bash)" && yarn test
```

Expected: all tests pass including:
- `tests/renderer/sprites/sprite-system.test.ts` (4 tests)
- `tests/renderer/sprites/sprite-catalog.test.ts` (41 tests)
- `tests/renderer/sprites/sprite-loader.test.ts` (5 tests)
- `tests/renderer/unit-renderer.test.ts` (4 tests — existing, must still pass)

- [ ] **Step 3: Smoke check hook**

```bash
bash .claude/hooks/check-src-edit.sh <<< '{"tool_input":{"file_path":"'$(pwd)/src/renderer/sprites/sprite-loader.ts'"}}'
echo "exit: $?"
```

Expected: exit 0 (no violations).

- [ ] **Step 4: Verify git log is clean**

```bash
git log --oneline origin/main..HEAD
```

Expected: 9-10 commits covering tasks 0–9.

- [ ] **Step 5: Push branch**

```bash
git push -u origin claude/sprites-system
```

- [ ] **Step 6: Create draft PR**

```bash
gh pr create \
  --title "feat(#9): SVG sprite system — faction-colored unit + building sprites via Canvas drawImage" \
  --body "$(cat <<'EOF'
## Summary

- Adds React 18 + @vitejs/plugin-react (needed for JSX preloader)
- Ports all 18 unit + 23 building SVG sprites from Claude Design export to TSX
- Derives 4-stop FactionPalette from each civ's existing hex color — no hardcoded faction names
- Preloads sprites at game start via flushSync + ReactDOM → XMLSerializer → Blob → HTMLImageElement cache
- Units show as SVG sprites at zoom ≥ 0.4; emoji circle below zoom threshold or while cache warms
- Production badge in city circle shows SVG building sprite at zoom ≥ 0.4
- `.claude/rules/sprites.md` documents the one-line extension recipe for future sprites

## Test plan

- [ ] `yarn build` exits 0 (TypeScript clean)
- [ ] `yarn test` exits 0 (all 54 sprite tests + 4 existing unit-renderer tests)
- [ ] Manual smoke: start `yarn dev`, start a new game, zoom in past 0.4 — units switch from emoji to sprites
- [ ] Manual smoke: zoom out below 0.4 — emoji fallback resumes
- [ ] Manual smoke: production badge in city circle shows building sprite when zoomed in
- [ ] Manual smoke: Tauri `yarn tauri:dev` renders sprites correctly (same code path)

## Closes

Closes #9

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)" \
  --draft
```

---

## Self-Review Checklist

_(Run before opening the draft PR — fix inline, do not re-review)_

**Spec coverage:**
- [x] §1 derivePalette — Task 1 sprite-system.tsx
- [x] §2 File structure — Tasks 1-5 create all 5 new files
- [x] §3 sprite-system.tsx — Task 1 (FactionPalette, derivePalette, MATERIAL_PALETTE, CATEGORY_TINTS, all primitives, svgOnly)
- [x] §4 units.tsx — Task 2 (18 components, faction→palette)
- [x] §5 buildings.tsx — Task 3 (23 components, faction→palette)
- [x] §6 sprite-catalog.ts — Task 4 (UNIT_SPRITE_CATALOG, BUILDING_SPRITE_CATALOG, size constants)
- [x] §7 sprite-loader.ts — Task 5 (renderToSVGString, svgStringToImage, SpriteCache, initSprites, getUnit, getBuilding)
- [x] §8 LOD strategy — Tasks 6+7 (zoom ≥ 0.4 threshold in both renderers)
- [x] §9 unit-renderer.ts — Task 6
- [x] §10 city-renderer.ts — Task 7 (getProductionBadgeSprite + drawCities update)
- [x] §11 main.ts initialization — Task 8 (fire-and-forget, all civs, barbarians excluded)
- [x] §12 Testing — Tasks 1,4,5 (sprite-system, sprite-catalog, sprite-loader tests)
- [x] §13 Extension recipe — Task 9 (.claude/rules/sprites.md)

**React prerequisite:**
- [x] Task 0 installs react, react-dom, @types/*, @vitejs/plugin-react
- [x] vite.config.ts updated with react() plugin
- [x] tsconfig.json updated with "jsx": "react-jsx" and .tsx in include

**Test environment:**
- [x] sprite-loader.test.ts uses `// @vitest-environment jsdom` (DOM APIs needed)
- [x] sprite-system.test.ts and sprite-catalog.test.ts run in default node environment (no DOM needed)

**Type consistency:**
- [x] `FactionPalette` exported from sprite-system.tsx, imported in units.tsx + buildings.tsx + sprite-catalog.ts + sprite-loader.ts
- [x] `UnitSpriteProps` exported from units.tsx, imported in sprite-catalog.ts
- [x] `BuildingSpriteProps` exported from buildings.tsx, imported in sprite-catalog.ts
- [x] `UnitSpriteComponent` / `BuildingSpriteComponent` exported from sprite-catalog.ts
- [x] `spriteCache` and `initSprites` exported from sprite-loader.ts, imported in unit-renderer.ts + city-renderer.ts + main.ts
- [x] `LOD_SPRITE_ZOOM_THRESHOLD = 0.4` defined in unit-renderer.ts; city-renderer.ts uses own constant with same value

**Placeholder scan:** No TBD/TODO/implement later remaining.

**Barbarian exclusion:** Task 8 explicitly excludes barbarian + minor civs from initSprites call.

**Non-blocking guarantee:** Task 8 calls `initSprites(civColors)` without `await` — fire and forget.
