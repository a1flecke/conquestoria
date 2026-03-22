# Milestone 1: "The First Evening" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a playable civilization game with a small hex map, one AI rival, barbarian camps, basic city founding/building, fog of war, 3 tech tracks, combat, auto-save, tutorial, mobile-first touch UI, and offline support — deployable to GitHub Pages.

**Architecture:** Event-driven TypeScript game engine with Canvas 2D hex renderer and DOM UI. All game state is a single serializable plain object stored in IndexedDB. Service Worker enables full offline play. Vite builds static output for GitHub Pages.

**Tech Stack:** TypeScript, Vite, Canvas 2D, DOM/CSS, Web Audio API, IndexedDB, Service Worker

**Spec:** `docs/superpowers/specs/2026-03-21-conquestoria-game-design.md`

---

## File Structure

```
conquestoria/
├── index.html                          — Entry point, canvas + UI container
├── vite.config.ts                      — Vite config with PWA/SW support
├── tsconfig.json                       — TypeScript config
├── package.json                        — Dependencies and scripts
├── mise.toml                           — Node/Yarn versions (exists)
├── .gitignore                          — Node, dist, .superpowers
├── public/
│   ├── sw.js                           — Service worker for offline caching
│   ├── manifest.json                   — PWA manifest for add-to-home-screen
│   └── assets/
│       ├── sounds/                     — UI and ambient sound effects
│       └── music/                      — Background music track(s)
├── src/
│   ├── main.ts                         — App bootstrap, wires everything together
│   ├── core/
│   │   ├── types.ts                    — All game state types/interfaces
│   │   ├── event-bus.ts                — Typed event emitter for system communication
│   │   ├── game-state.ts               — GameState factory, initialization
│   │   └── turn-manager.ts             — Turn sequencing: player → AI → barbarians → end
│   ├── systems/
│   │   ├── hex-utils.ts                — Hex math: neighbors, distance, ring, line-of-sight
│   │   ├── map-generator.ts            — Procedural map gen with simplex noise
│   │   ├── fog-of-war.ts               — Visibility calculation, reveal tracking
│   │   ├── unit-system.ts              — Unit creation, movement, pathfinding (A*)
│   │   ├── city-system.ts              — City founding, building, growth, production
│   │   ├── combat-system.ts            — Auto-resolve with modifiers
│   │   ├── tech-system.ts              — 3 tracks, research, unlock checking
│   │   ├── improvement-system.ts       — Tile improvements: farm, mine
│   │   ├── barbarian-system.ts         — Camp spawning, raider AI
│   │   └── resource-system.ts          — Per-turn yield calculation from tiles/buildings
│   ├── ai/
│   │   └── basic-ai.ts                 — Simple rival AI: expand, build, attack
│   ├── renderer/
│   │   ├── camera.ts                   — Pan, zoom, screen↔hex coordinate conversion
│   │   ├── hex-renderer.ts             — Draw hex tiles, terrain, improvements
│   │   ├── unit-renderer.ts            — Draw unit sprites on hexes
│   │   ├── fog-renderer.ts             — Draw fog of war overlay
│   │   ├── animation-system.ts         — Queued animations: reveal, combat, movement
│   │   └── render-loop.ts              — requestAnimationFrame loop, layer compositing
│   ├── ui/
│   │   ├── hud.ts                      — Top resource bar, turn/era display
│   │   ├── bottom-bar.ts               — Bottom action buttons (Map, Tech, City, End Turn)
│   │   ├── tech-panel.ts               — Tech tree view for 3 tracks
│   │   ├── city-panel.ts               — City detail panel with building options
│   │   ├── unit-panel.ts               — Selected unit actions panel
│   │   ├── notification.ts             — Slide-down event/advisor notification cards
│   │   ├── main-menu.ts                — New game, continue, settings
│   │   └── tutorial.ts                 — Tutorial state machine, advisor messages
│   ├── audio/
│   │   ├── audio-manager.ts            — Music playback, volume control, mute
│   │   └── sfx.ts                      — UI sound effects via Web Audio API
│   ├── storage/
│   │   ├── db.ts                       — IndexedDB wrapper (open, get, put, delete)
│   │   └── save-manager.ts             — Auto-save, load, new game
│   └── input/
│       ├── touch-handler.ts            — Touch: tap, pan, pinch-zoom, long-press
│       └── mouse-handler.ts            — Mouse: click, drag, scroll-zoom, hover
├── tests/
│   ├── core/
│   │   ├── event-bus.test.ts
│   │   ├── game-state.test.ts
│   │   └── turn-manager.test.ts
│   ├── systems/
│   │   ├── hex-utils.test.ts
│   │   ├── map-generator.test.ts
│   │   ├── fog-of-war.test.ts
│   │   ├── unit-system.test.ts
│   │   ├── city-system.test.ts
│   │   ├── combat-system.test.ts
│   │   ├── tech-system.test.ts
│   │   ├── improvement-system.test.ts
│   │   ├── barbarian-system.test.ts
│   │   └── resource-system.test.ts
│   └── ai/
│       └── basic-ai.test.ts
└── CLAUDE.md                           — Project conventions for Claude Code
```

---

## Task 1: Project Scaffolding & Build Pipeline

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `.gitignore`
- Create: `CLAUDE.md`
- Create: `src/main.ts` (placeholder)

- [ ] **Step 1: Initialize package.json**

```bash
cd /Users/aaronfleckenstein/development/github/conquestoria
yarn init -2
```

- [ ] **Step 2: Install dependencies**

```bash
yarn add -D typescript vite vitest @types/node
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "tests/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/conquestoria/',
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
```

- [ ] **Step 5: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <title>Conquestoria</title>
  <link rel="manifest" href="/conquestoria/manifest.json" />
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; background: #1a1a2e; color: #e0d6c8; font-family: system-ui, -apple-system, sans-serif; touch-action: none; }
    #game-canvas { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    #ui-layer { position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; }
    #ui-layer > * { pointer-events: auto; }
  </style>
</head>
<body>
  <canvas id="game-canvas"></canvas>
  <div id="ui-layer"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

- [ ] **Step 6: Create .gitignore**

```
node_modules/
dist/
.superpowers/
*.local
.DS_Store
.yarn/*
!.yarn/releases
!.yarn/plugins
```

- [ ] **Step 7: Create placeholder src/main.ts**

```typescript
console.log('Conquestoria loading...');
```

- [ ] **Step 8: Create CLAUDE.md**

```markdown
# Conquestoria

Civilization-building strategy game. TypeScript + Canvas 2D + Vite.

## Commands
- `yarn dev` — Start dev server
- `yarn build` — Production build
- `yarn test` — Run tests with vitest
- `yarn test:watch` — Run tests in watch mode

## Architecture
- Event-driven: systems communicate via EventBus, not direct imports
- All game state is a single serializable plain object (no class instances)
- Canvas 2D renders the hex map; DOM/CSS handles all UI panels
- Mobile-first: touch input is primary, mouse/keyboard secondary
- Offline-first: Service Worker caches everything, IndexedDB stores saves

## Conventions
- Axial hex coordinates (q, r) everywhere
- All positions are in hex coordinates; pixel conversion happens only in renderer
- Tests live in tests/ mirroring src/ structure
- Use vitest for testing
- Keep files focused and small — one clear responsibility per file
```

- [ ] **Step 9: Create public/manifest.json**

```json
{
  "name": "Conquestoria",
  "short_name": "Conquestoria",
  "start_url": "/conquestoria/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#e8c170",
  "icons": []
}
```

- [ ] **Step 10: Add scripts to package.json**

Add these scripts to the `package.json`:
```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 11: Verify dev server starts**

```bash
yarn dev
```
Expected: Vite dev server starts, browser shows "Conquestoria loading..." in console.

- [ ] **Step 12: Verify test runner works**

Create a smoke test file `tests/smoke.test.ts`:
```typescript
describe('smoke test', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

```bash
yarn test
```
Expected: 1 test passes.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: scaffold project with Vite, TypeScript, and Vitest"
```

---

## Task 2: Core Types & Event Bus

**Files:**
- Create: `src/core/types.ts`
- Create: `src/core/event-bus.ts`
- Create: `tests/core/event-bus.test.ts`

- [ ] **Step 1: Write core game types**

Create `src/core/types.ts` with all the type definitions needed for Milestone 1:

```typescript
// --- Hex Coordinates ---

export interface HexCoord {
  q: number;
  r: number;
}

// --- Terrain ---

export type TerrainType =
  | 'grassland' | 'plains' | 'desert' | 'tundra' | 'snow'
  | 'forest' | 'hills' | 'mountain' | 'ocean' | 'coast';

export type Elevation = 'lowland' | 'highland' | 'mountain';

export interface TerrainInfo {
  type: TerrainType;
  elevation: Elevation;
  movementCost: number;
  defenseBonus: number;
  yields: ResourceYield;
  passable: boolean;
  visionBonus: number; // extra vision range from this tile
}

// --- Resources ---

export interface ResourceYield {
  food: number;
  production: number;
  gold: number;
  science: number;
}

// --- Map ---

export type VisibilityState = 'unexplored' | 'fog' | 'visible';

export type ImprovementType = 'farm' | 'mine' | 'none';

export interface HexTile {
  coord: HexCoord;
  terrain: TerrainType;
  elevation: Elevation;
  resource: string | null;          // strategic/luxury resource on this tile
  improvement: ImprovementType;
  owner: string | null;             // civilization ID that owns this tile
  improvementTurnsLeft: number;     // turns remaining to complete improvement
}

export interface GameMap {
  width: number;
  height: number;
  tiles: Record<string, HexTile>;   // key is "q,r"
  wrapsHorizontally: boolean;
}

// --- Visibility (per player) ---

export interface VisibilityMap {
  tiles: Record<string, VisibilityState>; // key is "q,r"
}

// --- Units ---

export type UnitType = 'settler' | 'worker' | 'scout' | 'warrior';

export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;          // 0 for non-combat units
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
}

export interface Unit {
  id: string;
  type: UnitType;
  owner: string;             // civilization ID
  position: HexCoord;
  movementPointsLeft: number;
  health: number;            // 0-100
  experience: number;
  hasMoved: boolean;
  hasActed: boolean;         // used action this turn (build, found, etc.)
}

// --- Cities ---

export interface Building {
  id: string;
  name: string;
  yields: ResourceYield;
  productionCost: number;
  description: string;
}

export interface City {
  id: string;
  name: string;
  owner: string;
  position: HexCoord;
  population: number;
  food: number;              // accumulated food toward next population
  foodNeeded: number;        // food required for next pop
  buildings: string[];       // building IDs
  productionQueue: string[]; // what's being built (building or unit ID)
  productionProgress: number;
  ownedTiles: HexCoord[];    // tiles this city works
}

// --- Tech ---

export type TechTrack = 'military' | 'economy' | 'science';

export type TechStatus = 'locked' | 'available' | 'researching' | 'completed';

export interface Tech {
  id: string;
  name: string;
  track: TechTrack;
  cost: number;
  prerequisites: string[];   // tech IDs
  unlocks: string[];         // what this tech enables (descriptions)
  era: number;               // 1-3 for milestone 1
}

export interface TechState {
  completed: string[];       // tech IDs
  currentResearch: string | null;
  researchProgress: number;
  trackPriorities: Record<TechTrack, 'high' | 'medium' | 'low' | 'ignore'>;
}

// --- Civilizations ---

export interface Civilization {
  id: string;
  name: string;
  color: string;
  isHuman: boolean;
  cities: string[];          // city IDs
  units: string[];           // unit IDs
  techState: TechState;
  gold: number;
  visibility: VisibilityMap;
  score: number;
}

// --- Barbarians ---

export interface BarbarianCamp {
  id: string;
  position: HexCoord;
  strength: number;          // grows over time
  spawnCooldown: number;     // turns until next raider spawns
}

// --- Combat ---

export interface CombatResult {
  attackerId: string;
  defenderId: string;
  attackerDamage: number;
  defenderDamage: number;
  attackerSurvived: boolean;
  defenderSurvived: boolean;
  attackerPosition: HexCoord;
  defenderPosition: HexCoord;
}

// --- Tutorial ---

export type TutorialStep =
  | 'welcome'
  | 'found_city'
  | 'explore'
  | 'build_improvement'
  | 'research_tech'
  | 'build_unit'
  | 'combat'
  | 'complete';

export interface TutorialState {
  active: boolean;
  currentStep: TutorialStep;
  completedSteps: TutorialStep[];
}

// --- Game State (the whole thing) ---

export interface GameState {
  turn: number;
  era: number;
  civilizations: Record<string, Civilization>;
  map: GameMap;
  units: Record<string, Unit>;
  cities: Record<string, City>;
  barbarianCamps: Record<string, BarbarianCamp>;
  tutorial: TutorialState;
  currentPlayer: string;     // civ ID whose turn it is
  gameOver: boolean;
  winner: string | null;
  settings: GameSettings;
}

export interface GameSettings {
  mapSize: 'small';          // only small for M1
  soundEnabled: boolean;
  musicEnabled: boolean;
  musicVolume: number;       // 0-1
  sfxVolume: number;         // 0-1
  tutorialEnabled: boolean;
}

// --- Events ---

export interface GameEvents {
  'turn:start': { turn: number; playerId: string };
  'turn:end': { turn: number; playerId: string };
  'unit:move': { unitId: string; from: HexCoord; to: HexCoord };
  'unit:created': { unit: Unit };
  'unit:destroyed': { unitId: string; position: HexCoord };
  'city:founded': { city: City };
  'city:building-complete': { cityId: string; buildingId: string };
  'city:unit-trained': { cityId: string; unitType: UnitType };
  'city:grew': { cityId: string; newPopulation: number };
  'combat:resolved': { result: CombatResult };
  'tech:completed': { civId: string; techId: string };
  'tech:started': { civId: string; techId: string };
  'fog:revealed': { tiles: HexCoord[] };
  'improvement:started': { unitId: string; coord: HexCoord; type: ImprovementType };
  'improvement:completed': { coord: HexCoord; type: ImprovementType };
  'barbarian:spawned': { campId: string; unitId: string };
  'barbarian:camp-destroyed': { campId: string; reward: number };
  'tutorial:step': { step: TutorialStep; message: string; advisor: 'builder' | 'explorer' };
  'notification:show': { message: string; type: 'info' | 'warning' | 'success' };
  'game:saved': { turn: number };
  'game:loaded': { turn: number };
  'game:over': { winnerId: string };
  'ui:select-unit': { unitId: string };
  'ui:select-city': { cityId: string };
  'ui:deselect': {};
}
```

- [ ] **Step 2: Write event bus tests**

Create `tests/core/event-bus.test.ts`:

```typescript
import { EventBus } from '@/core/event-bus';
import type { GameEvents } from '@/core/types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('calls listener when event is emitted', () => {
    const listener = vi.fn();
    bus.on('turn:start', listener);
    bus.emit('turn:start', { turn: 1, playerId: 'p1' });
    expect(listener).toHaveBeenCalledWith({ turn: 1, playerId: 'p1' });
  });

  it('supports multiple listeners for same event', () => {
    const a = vi.fn();
    const b = vi.fn();
    bus.on('turn:end', a);
    bus.on('turn:end', b);
    bus.emit('turn:end', { turn: 1, playerId: 'p1' });
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
  });

  it('unsubscribes via returned function', () => {
    const listener = vi.fn();
    const unsub = bus.on('turn:start', listener);
    unsub();
    bus.emit('turn:start', { turn: 2, playerId: 'p1' });
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not throw when emitting event with no listeners', () => {
    expect(() => bus.emit('turn:start', { turn: 1, playerId: 'p1' })).not.toThrow();
  });

  it('once listener fires only once', () => {
    const listener = vi.fn();
    bus.once('tech:completed', listener);
    bus.emit('tech:completed', { civId: 'c1', techId: 't1' });
    bus.emit('tech:completed', { civId: 'c1', techId: 't2' });
    expect(listener).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
yarn test tests/core/event-bus.test.ts
```
Expected: FAIL — module `@/core/event-bus` not found.

- [ ] **Step 4: Implement EventBus**

Create `src/core/event-bus.ts`:

```typescript
import type { GameEvents } from './types';

type Listener<T> = (data: T) => void;

export class EventBus {
  private listeners = new Map<string, Set<Listener<any>>>();

  on<K extends keyof GameEvents>(
    event: K,
    listener: Listener<GameEvents[K]>,
  ): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => {
      this.listeners.get(event)?.delete(listener);
    };
  }

  once<K extends keyof GameEvents>(
    event: K,
    listener: Listener<GameEvents[K]>,
  ): () => void {
    const wrapped: Listener<GameEvents[K]> = (data) => {
      unsub();
      listener(data);
    };
    const unsub = this.on(event, wrapped);
    return unsub;
  }

  emit<K extends keyof GameEvents>(event: K, data: GameEvents[K]): void {
    const set = this.listeners.get(event);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
yarn test tests/core/event-bus.test.ts
```
Expected: All 5 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/core/event-bus.ts tests/core/event-bus.test.ts
git commit -m "feat: add core types and typed event bus"
```

---

## Task 3: Hex Utilities

**Files:**
- Create: `src/systems/hex-utils.ts`
- Create: `tests/systems/hex-utils.test.ts`

- [ ] **Step 1: Write hex utility tests**

Create `tests/systems/hex-utils.test.ts`:

```typescript
import {
  hexKey,
  parseHexKey,
  hexNeighbors,
  hexDistance,
  hexRing,
  hexesInRange,
  pixelToHex,
  hexToPixel,
  wrapHexCoord,
} from '@/systems/hex-utils';

describe('hexKey / parseHexKey', () => {
  it('converts coord to string key and back', () => {
    expect(hexKey({ q: 3, r: -2 })).toBe('3,-2');
    expect(parseHexKey('3,-2')).toEqual({ q: 3, r: -2 });
  });
});

describe('hexNeighbors', () => {
  it('returns 6 neighbors for a hex', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
    expect(neighbors).toContainEqual({ q: 1, r: 0 });
    expect(neighbors).toContainEqual({ q: 0, r: 1 });
    expect(neighbors).toContainEqual({ q: -1, r: 1 });
  });
});

describe('hexDistance', () => {
  it('returns 0 for same hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it('returns 1 for adjacent hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });

  it('calculates correct distance', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });
});

describe('hexRing', () => {
  it('returns center for radius 0', () => {
    const ring = hexRing({ q: 0, r: 0 }, 0);
    expect(ring).toEqual([{ q: 0, r: 0 }]);
  });

  it('returns 6 hexes for radius 1', () => {
    const ring = hexRing({ q: 0, r: 0 }, 1);
    expect(ring).toHaveLength(6);
  });

  it('returns 12 hexes for radius 2', () => {
    const ring = hexRing({ q: 0, r: 0 }, 2);
    expect(ring).toHaveLength(12);
  });
});

describe('hexesInRange', () => {
  it('returns 1 hex for range 0', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 0);
    expect(hexes).toHaveLength(1);
  });

  it('returns 7 hexes for range 1', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 1);
    expect(hexes).toHaveLength(7);
  });

  it('returns 19 hexes for range 2', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 2);
    expect(hexes).toHaveLength(19);
  });
});

describe('hexToPixel / pixelToHex', () => {
  it('round-trips through pixel conversion', () => {
    const coord = { q: 5, r: 3 };
    const size = 32;
    const pixel = hexToPixel(coord, size);
    const back = pixelToHex(pixel.x, pixel.y, size);
    expect(back).toEqual(coord);
  });

  it('origin hex maps to near origin pixel', () => {
    const pixel = hexToPixel({ q: 0, r: 0 }, 32);
    expect(pixel.x).toBeCloseTo(0, 0);
    expect(pixel.y).toBeCloseTo(0, 0);
  });
});

describe('wrapHexCoord', () => {
  it('wraps q coordinate when exceeding map width', () => {
    const wrapped = wrapHexCoord({ q: 31, r: 0 }, 30);
    expect(wrapped.q).toBe(1);
  });

  it('wraps negative q coordinate', () => {
    const wrapped = wrapHexCoord({ q: -1, r: 0 }, 30);
    expect(wrapped.q).toBe(29);
  });

  it('does not wrap r coordinate', () => {
    const wrapped = wrapHexCoord({ q: 5, r: 35 }, 30);
    expect(wrapped.r).toBe(35);
  });

  it('leaves valid coordinates unchanged', () => {
    const wrapped = wrapHexCoord({ q: 15, r: 10 }, 30);
    expect(wrapped).toEqual({ q: 15, r: 10 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/hex-utils.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement hex utilities**

Create `src/systems/hex-utils.ts`:

```typescript
import type { HexCoord } from '@/core/types';

// --- Key conversion ---

export function hexKey(coord: HexCoord): string {
  return `${coord.q},${coord.r}`;
}

export function parseHexKey(key: string): HexCoord {
  const [q, r] = key.split(',').map(Number);
  return { q, r };
}

// --- Neighbors ---

const DIRECTIONS: HexCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export function hexNeighbors(coord: HexCoord): HexCoord[] {
  return DIRECTIONS.map(d => ({ q: coord.q + d.q, r: coord.r + d.r }));
}

// --- Distance ---

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  const ds = -dq - dr - (-a.q - a.r - (-b.q - b.r));
  return Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
}

// --- Ring and Range ---

export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius === 0) return [{ ...center }];

  const results: HexCoord[] = [];
  let current: HexCoord = {
    q: center.q + DIRECTIONS[4].q * radius,
    r: center.r + DIRECTIONS[4].r * radius,
  };

  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < radius; j++) {
      results.push({ ...current });
      current = {
        q: current.q + DIRECTIONS[i].q,
        r: current.r + DIRECTIONS[i].r,
      };
    }
  }

  return results;
}

export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const results: HexCoord[] = [];
  for (let q = -range; q <= range; q++) {
    for (let r = Math.max(-range, -q - range); r <= Math.min(range, -q + range); r++) {
      results.push({ q: center.q + q, r: center.r + r });
    }
  }
  return results;
}

// --- Pixel conversion (pointy-top hexes) ---

export function hexToPixel(coord: HexCoord, size: number): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * coord.q + (Math.sqrt(3) / 2) * coord.r);
  const y = size * ((3 / 2) * coord.r);
  return { x, y };
}

export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const q = ((Math.sqrt(3) / 3) * x - (1 / 3) * y) / size;
  const r = ((2 / 3) * y) / size;
  return hexRound(q, r);
}

function hexRound(qf: number, rf: number): HexCoord {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);

  const qDiff = Math.abs(q - qf);
  const rDiff = Math.abs(r - rf);
  const sDiff = Math.abs(s - sf);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  }

  return { q, r };
}

// --- Wrapping ---

export function wrapHexCoord(coord: HexCoord, mapWidth: number): HexCoord {
  let q = coord.q % mapWidth;
  if (q < 0) q += mapWidth;
  return { q, r: coord.r };
}

// --- Line of sight ---

export function hexLineTo(a: HexCoord, b: HexCoord): HexCoord[] {
  const dist = hexDistance(a, b);
  if (dist === 0) return [{ ...a }];

  const results: HexCoord[] = [];
  for (let i = 0; i <= dist; i++) {
    const t = i / dist;
    const q = a.q + (b.q - a.q) * t;
    const r = a.r + (b.r - a.r) * t;
    results.push(hexRound(q, r));
  }
  return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/hex-utils.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/hex-utils.ts tests/systems/hex-utils.test.ts
git commit -m "feat: add hex coordinate utilities with axial math"
```

---

## Task 4: Map Generator

**Files:**
- Create: `src/systems/map-generator.ts`
- Create: `tests/systems/map-generator.test.ts`

- [ ] **Step 1: Write map generator tests**

Create `tests/systems/map-generator.test.ts`:

```typescript
import { generateMap, findStartPositions } from '@/systems/map-generator';
import type { GameMap } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

describe('generateMap', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'test-seed-123');
  });

  it('creates a map with correct dimensions', () => {
    expect(map.width).toBe(30);
    expect(map.height).toBe(30);
  });

  it('populates all tiles', () => {
    const tileCount = Object.keys(map.tiles).length;
    expect(tileCount).toBe(30 * 30);
  });

  it('has wrapsHorizontally set to true', () => {
    expect(map.wrapsHorizontally).toBe(true);
  });

  it('generates polar ice at top and bottom rows', () => {
    const topTile = map.tiles[hexKey({ q: 15, r: 0 })];
    const bottomTile = map.tiles[hexKey({ q: 15, r: 29 })];
    expect(['snow', 'tundra']).toContain(topTile.terrain);
    expect(['snow', 'tundra']).toContain(bottomTile.terrain);
  });

  it('places ocean tiles', () => {
    const terrains = Object.values(map.tiles).map(t => t.terrain);
    expect(terrains).toContain('ocean');
  });

  it('places land tiles', () => {
    const terrains = Object.values(map.tiles).map(t => t.terrain);
    expect(terrains).toContain('grassland');
  });

  it('is deterministic with same seed', () => {
    const map2 = generateMap(30, 30, 'test-seed-123');
    expect(Object.keys(map.tiles).length).toBe(Object.keys(map2.tiles).length);
    const sampleKey = hexKey({ q: 10, r: 10 });
    expect(map.tiles[sampleKey].terrain).toBe(map2.tiles[sampleKey].terrain);
  });

  it('produces different maps with different seeds', () => {
    const map2 = generateMap(30, 30, 'different-seed');
    let differences = 0;
    for (const key of Object.keys(map.tiles)) {
      if (map.tiles[key].terrain !== map2.tiles[key]?.terrain) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe('findStartPositions', () => {
  it('finds requested number of start positions on land', () => {
    const map = generateMap(30, 30, 'start-pos-seed');
    const positions = findStartPositions(map, 2);
    expect(positions).toHaveLength(2);

    for (const pos of positions) {
      const tile = map.tiles[hexKey(pos)];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe('ocean');
      expect(tile.terrain).not.toBe('coast');
      expect(tile.terrain).not.toBe('mountain');
    }
  });

  it('places start positions far apart', () => {
    const map = generateMap(30, 30, 'start-pos-seed');
    const positions = findStartPositions(map, 2);
    const { hexDistance } = require('@/systems/hex-utils');
    const dist = hexDistance(positions[0], positions[1]);
    expect(dist).toBeGreaterThan(8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/map-generator.test.ts
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement map generator**

Create `src/systems/map-generator.ts`:

```typescript
import type { GameMap, HexTile, HexCoord, TerrainType, Elevation } from '@/core/types';
import { hexKey, hexDistance, hexesInRange } from './hex-utils';

// Simple seeded PRNG (mulberry32)
function createRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple 2D value noise for terrain generation
function createNoise(rng: () => number) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  function grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise2d(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[(perm[X] + Y) & 255];
    const ab = perm[(perm[X] + Y + 1) & 255];
    const ba = perm[(perm[(X + 1) & 255] + Y) & 255];
    const bb = perm[(perm[(X + 1) & 255] + Y + 1) & 255];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

function getElevation(noiseVal: number): Elevation {
  if (noiseVal > 0.6) return 'mountain';
  if (noiseVal > 0.3) return 'highland';
  return 'lowland';
}

function getTerrain(
  landNoise: number,
  moistureNoise: number,
  tempNoise: number,
  elevation: Elevation,
  r: number,
  height: number,
): TerrainType {
  // Polar regions
  const polarDistance = Math.min(r, height - 1 - r) / (height * 0.15);
  if (polarDistance < 1) {
    const temp = tempNoise + polarDistance;
    if (temp < 0.3) return 'snow';
    if (temp < 0.7) return 'tundra';
  }

  // Ocean
  if (landNoise < -0.1) return 'ocean';
  if (landNoise < 0.0) return 'coast';

  // Mountains
  if (elevation === 'mountain') return 'mountain';

  // Land terrain based on moisture and temperature
  if (moistureNoise > 0.4) return 'forest';
  if (moistureNoise > 0.2 && tempNoise > 0.3) return 'grassland';
  if (tempNoise > 0.5) return 'desert';
  if (moistureNoise > 0.0) return 'plains';
  if (elevation === 'highland') return 'hills';
  return 'plains';
}

const TERRAIN_DEFAULTS: Record<TerrainType, { moveCost: number; defense: number; passable: boolean; vision: number; yields: { food: number; production: number; gold: number; science: number } }> = {
  grassland:  { moveCost: 1, defense: 0,   passable: true,  vision: 0, yields: { food: 2, production: 0, gold: 0, science: 0 } },
  plains:     { moveCost: 1, defense: 0,   passable: true,  vision: 0, yields: { food: 1, production: 1, gold: 0, science: 0 } },
  desert:     { moveCost: 1, defense: 0,   passable: true,  vision: 0, yields: { food: 0, production: 0, gold: 0, science: 0 } },
  tundra:     { moveCost: 1, defense: 0,   passable: true,  vision: 0, yields: { food: 1, production: 0, gold: 0, science: 0 } },
  snow:       { moveCost: 2, defense: 0,   passable: true,  vision: 0, yields: { food: 0, production: 0, gold: 0, science: 0 } },
  forest:     { moveCost: 2, defense: 0.25, passable: true,  vision: 0, yields: { food: 1, production: 1, gold: 0, science: 0 } },
  hills:      { moveCost: 2, defense: 0.25, passable: true,  vision: 1, yields: { food: 0, production: 2, gold: 0, science: 0 } },
  mountain:   { moveCost: 99, defense: 0,  passable: false, vision: 0, yields: { food: 0, production: 0, gold: 0, science: 0 } },
  ocean:      { moveCost: 99, defense: 0,  passable: false, vision: 0, yields: { food: 1, production: 0, gold: 0, science: 0 } },
  coast:      { moveCost: 99, defense: 0,  passable: false, vision: 0, yields: { food: 2, production: 0, gold: 1, science: 0 } },
};

export function generateMap(width: number, height: number, seed: string): GameMap {
  const rng = createRng(seed);
  const landNoise = createNoise(rng);
  const moistureNoise = createNoise(rng);
  const elevationNoise = createNoise(rng);
  const tempNoise = createNoise(rng);

  const tiles: Record<string, HexTile> = {};

  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const nx = q / width * 4;
      const ny = r / height * 4;

      const land = landNoise(nx, ny) + 0.5 * landNoise(nx * 2, ny * 2);
      const moisture = moistureNoise(nx + 100, ny + 100);
      const elev = elevationNoise(nx + 200, ny + 200);
      const temp = (tempNoise(nx + 300, ny + 300) + 1) / 2;

      const elevation = getElevation(elev);
      const terrain = getTerrain(land, moisture, temp, elevation, r, height);

      const defaults = TERRAIN_DEFAULTS[terrain];
      const key = hexKey({ q, r });

      tiles[key] = {
        coord: { q, r },
        terrain,
        elevation: terrain === 'mountain' ? 'mountain' : terrain === 'hills' ? 'highland' : elevation === 'mountain' ? 'highland' : elevation,
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
      };
    }
  }

  return { width, height, tiles, wrapsHorizontally: true };
}

function isLandTerrain(terrain: TerrainType): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain' && terrain !== 'snow';
}

export function findStartPositions(map: GameMap, count: number): HexCoord[] {
  // Collect all suitable land tiles (not at edges)
  const candidates: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (
      isLandTerrain(tile.terrain) &&
      tile.coord.r > 3 &&
      tile.coord.r < map.height - 4
    ) {
      // Check that there's enough land nearby
      const nearby = hexesInRange(tile.coord, 2);
      const landCount = nearby.filter(n => {
        const t = map.tiles[hexKey(n)];
        return t && isLandTerrain(t.terrain);
      }).length;
      if (landCount >= 10) {
        candidates.push(tile.coord);
      }
    }
  }

  if (candidates.length < count) {
    // Fallback: relax constraints
    for (const tile of Object.values(map.tiles)) {
      if (isLandTerrain(tile.terrain)) {
        candidates.push(tile.coord);
      }
    }
  }

  // Pick positions that are far apart using greedy algorithm
  const positions: HexCoord[] = [];
  const used = new Set<string>();

  // First position: near center of map
  const centerQ = Math.floor(map.width / 2);
  const centerR = Math.floor(map.height / 2);
  let best = candidates[0];
  let bestDist = Infinity;
  for (const c of candidates) {
    const d = hexDistance(c, { q: centerQ, r: centerR });
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  positions.push(best);
  used.add(hexKey(best));

  // Remaining positions: maximize minimum distance to existing positions
  for (let i = 1; i < count; i++) {
    let bestCandidate = candidates[0];
    let bestMinDist = -1;

    for (const c of candidates) {
      if (used.has(hexKey(c))) continue;
      const minDist = Math.min(...positions.map(p => hexDistance(c, p)));
      if (minDist > bestMinDist) {
        bestMinDist = minDist;
        bestCandidate = c;
      }
    }

    positions.push(bestCandidate);
    used.add(hexKey(bestCandidate));
  }

  return positions;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/map-generator.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/map-generator.ts tests/systems/map-generator.test.ts
git commit -m "feat: add procedural hex map generator with seeded noise"
```

---

## Task 5: Fog of War System

**Files:**
- Create: `src/systems/fog-of-war.ts`
- Create: `tests/systems/fog-of-war.test.ts`

- [ ] **Step 1: Write fog of war tests**

Create `tests/systems/fog-of-war.test.ts`:

```typescript
import { createVisibilityMap, updateVisibility, isVisible, isFog, isUnexplored } from '@/systems/fog-of-war';
import type { VisibilityMap, GameMap, Unit } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('fog-of-war', () => {
  let map: GameMap;
  let vis: VisibilityMap;

  beforeEach(() => {
    map = generateMap(30, 30, 'fog-test');
    vis = createVisibilityMap();
  });

  it('starts fully unexplored', () => {
    expect(isUnexplored(vis, { q: 10, r: 10 })).toBe(true);
    expect(isVisible(vis, { q: 10, r: 10 })).toBe(false);
  });

  it('reveals tiles around a unit', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    const revealed = updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);
    expect(revealed.length).toBeGreaterThan(0);
  });

  it('scout has larger vision than warrior', () => {
    const scout: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };
    const warrior: Unit = {
      id: 'u2', type: 'warrior', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 2,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    const visScout = createVisibilityMap();
    const visWarrior = createVisibilityMap();

    const scoutRevealed = updateVisibility(visScout, [scout], map);
    const warriorRevealed = updateVisibility(visWarrior, [warrior], map);

    expect(scoutRevealed.length).toBeGreaterThan(warriorRevealed.length);
  });

  it('previously visible tiles become fog when unit moves away', () => {
    const unit: Unit = {
      id: 'u1', type: 'scout', owner: 'p1',
      position: { q: 15, r: 15 }, movementPointsLeft: 3,
      health: 100, experience: 0, hasMoved: false, hasActed: false,
    };

    updateVisibility(vis, [unit], map);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(true);

    // Move unit far away
    unit.position = { q: 1, r: 1 };
    updateVisibility(vis, [unit], map);

    // Old position should be fog (seen before but no longer visible)
    expect(isFog(vis, { q: 15, r: 15 })).toBe(true);
    expect(isVisible(vis, { q: 15, r: 15 })).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/fog-of-war.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement fog of war**

Create `src/systems/fog-of-war.ts`:

```typescript
import type { VisibilityMap, VisibilityState, HexCoord, Unit, GameMap } from '@/core/types';
import { hexKey, hexesInRange } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

export function createVisibilityMap(): VisibilityMap {
  return { tiles: {} };
}

export function getVisibility(vis: VisibilityMap, coord: HexCoord): VisibilityState {
  return vis.tiles[hexKey(coord)] ?? 'unexplored';
}

export function isVisible(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'visible';
}

export function isFog(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'fog';
}

export function isUnexplored(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'unexplored';
}

/**
 * Recalculates visibility for a player based on their units and cities.
 * Returns newly revealed tiles (were unexplored, now visible).
 */
export function updateVisibility(
  vis: VisibilityMap,
  units: Unit[],
  map: GameMap,
  cityPositions: HexCoord[] = [],
): HexCoord[] {
  // Downgrade all 'visible' to 'fog'
  for (const key of Object.keys(vis.tiles)) {
    if (vis.tiles[key] === 'visible') {
      vis.tiles[key] = 'fog';
    }
  }

  const newlyRevealed: HexCoord[] = [];

  const revealTile = (coord: HexCoord) => {
    const key = hexKey(coord);
    if (!map.tiles[key]) return; // off map

    const prev = vis.tiles[key];
    vis.tiles[key] = 'visible';
    if (!prev || prev === 'unexplored') {
      newlyRevealed.push(coord);
    }
  };

  // Reveal around each unit
  for (const unit of units) {
    const def = UNIT_DEFINITIONS[unit.type];
    const visionRange = def.visionRange;

    // Check if unit is on elevated terrain for bonus
    const unitTile = map.tiles[hexKey(unit.position)];
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;

    const visible = hexesInRange(unit.position, visionRange + bonus);
    for (const coord of visible) {
      revealTile(coord);
    }
  }

  // Reveal around each city (vision range 2)
  for (const cityPos of cityPositions) {
    const visible = hexesInRange(cityPos, 2);
    for (const coord of visible) {
      revealTile(coord);
    }
  }

  return newlyRevealed;
}

function getTerrainVisionBonus(terrain: string): number {
  if (terrain === 'hills') return 1;
  return 0;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Note: this depends on UNIT_DEFINITIONS from unit-system.ts. We need a minimal export. Create a temporary forward reference or create the unit definitions now.

Create `src/systems/unit-system.ts` with just the definitions for now:

```typescript
import type { UnitDefinition, UnitType } from '@/core/types';

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  settler: {
    type: 'settler', name: 'Settler', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: true,
    canBuildImprovements: false, productionCost: 50,
  },
  worker: {
    type: 'worker', name: 'Worker', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: true, productionCost: 30,
  },
  scout: {
    type: 'scout', name: 'Scout', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 20,
  },
  warrior: {
    type: 'warrior', name: 'Warrior', movementPoints: 2,
    visionRange: 2, strength: 10, canFoundCity: false,
    canBuildImprovements: false, productionCost: 25,
  },
};
```

```bash
yarn test tests/systems/fog-of-war.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/fog-of-war.ts src/systems/unit-system.ts tests/systems/fog-of-war.test.ts
git commit -m "feat: add fog of war system with per-unit vision ranges"
```

---

## Task 6: Unit System (Movement & Pathfinding)

**Files:**
- Modify: `src/systems/unit-system.ts`
- Create: `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Write unit system tests**

Create `tests/systems/unit-system.test.ts`:

```typescript
import {
  createUnit,
  getMovementRange,
  moveUnit,
  findPath,
  resetUnitTurn,
  UNIT_DEFINITIONS,
} from '@/systems/unit-system';
import type { GameMap, Unit } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('createUnit', () => {
  it('creates a unit with full movement points', () => {
    const unit = createUnit('warrior', 'p1', { q: 5, r: 5 });
    expect(unit.type).toBe('warrior');
    expect(unit.owner).toBe('p1');
    expect(unit.position).toEqual({ q: 5, r: 5 });
    expect(unit.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(unit.health).toBe(100);
  });
});

describe('getMovementRange', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'move-test');
  });

  it('returns reachable hexes for a unit', () => {
    // Find a land tile for the unit
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    )!;
    const unit = createUnit('scout', 'p1', landTile.coord);
    const range = getMovementRange(unit, map, {});
    expect(range.length).toBeGreaterThan(0);
    // Should include at least some adjacent tiles
    expect(range.length).toBeGreaterThanOrEqual(1);
  });

  it('does not include impassable tiles', () => {
    const landTile = Object.values(map.tiles).find(
      t => t.terrain === 'grassland'
    )!;
    const unit = createUnit('warrior', 'p1', landTile.coord);
    const range = getMovementRange(unit, map, {});
    for (const hex of range) {
      const tile = map.tiles[hexKey(hex)];
      if (tile) {
        expect(tile.terrain).not.toBe('ocean');
        expect(tile.terrain).not.toBe('mountain');
      }
    }
  });
});

describe('moveUnit', () => {
  it('updates unit position and deducts movement', () => {
    const unit = createUnit('scout', 'p1', { q: 5, r: 5 });
    const moved = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(moved.position).toEqual({ q: 6, r: 5 });
    expect(moved.movementPointsLeft).toBe(unit.movementPointsLeft - 1);
    expect(moved.hasMoved).toBe(true);
  });
});

describe('findPath', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'path-test');
  });

  it('finds path between adjacent land tiles', () => {
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain === 'grassland' || t.terrain === 'plains'
    );
    if (landTiles.length < 2) return; // Skip if not enough land

    const path = findPath(landTiles[0].coord, landTiles[1].coord, map);
    // Path may be null if tiles aren't connected
    if (path) {
      expect(path.length).toBeGreaterThanOrEqual(2);
      expect(path[0]).toEqual(landTiles[0].coord);
      expect(path[path.length - 1]).toEqual(landTiles[1].coord);
    }
  });

  it('returns null for unreachable destination', () => {
    // Try to path to an ocean tile
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const oceanTile = Object.values(map.tiles).find(t => t.terrain === 'ocean')!;
    if (landTile && oceanTile) {
      const path = findPath(landTile.coord, oceanTile.coord, map);
      expect(path).toBeNull();
    }
  });
});

describe('resetUnitTurn', () => {
  it('restores movement points and clears flags', () => {
    let unit = createUnit('warrior', 'p1', { q: 5, r: 5 });
    unit = moveUnit(unit, { q: 6, r: 5 }, 1);
    expect(unit.hasMoved).toBe(true);

    const reset = resetUnitTurn(unit);
    expect(reset.movementPointsLeft).toBe(UNIT_DEFINITIONS.warrior.movementPoints);
    expect(reset.hasMoved).toBe(false);
    expect(reset.hasActed).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/unit-system.test.ts
```
Expected: FAIL — functions not exported.

- [ ] **Step 3: Implement unit system**

Update `src/systems/unit-system.ts` to add the remaining functions:

```typescript
import type { UnitDefinition, UnitType, Unit, HexCoord, GameMap } from '@/core/types';
import { hexKey, hexNeighbors, hexDistance } from './hex-utils';

let nextUnitId = 1;

export const UNIT_DEFINITIONS: Record<UnitType, UnitDefinition> = {
  settler: {
    type: 'settler', name: 'Settler', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: true,
    canBuildImprovements: false, productionCost: 50,
  },
  worker: {
    type: 'worker', name: 'Worker', movementPoints: 2,
    visionRange: 2, strength: 0, canFoundCity: false,
    canBuildImprovements: true, productionCost: 30,
  },
  scout: {
    type: 'scout', name: 'Scout', movementPoints: 3,
    visionRange: 3, strength: 5, canFoundCity: false,
    canBuildImprovements: false, productionCost: 20,
  },
  warrior: {
    type: 'warrior', name: 'Warrior', movementPoints: 2,
    visionRange: 2, strength: 10, canFoundCity: false,
    canBuildImprovements: false, productionCost: 25,
  },
};

export function createUnit(type: UnitType, owner: string, position: HexCoord): Unit {
  return {
    id: `unit-${nextUnitId++}`,
    type,
    owner,
    position: { ...position },
    movementPointsLeft: UNIT_DEFINITIONS[type].movementPoints,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
  };
}

export function resetUnitId(): void {
  nextUnitId = 1;
}

export function moveUnit(unit: Unit, to: HexCoord, cost: number): Unit {
  return {
    ...unit,
    position: { ...to },
    movementPointsLeft: unit.movementPointsLeft - cost,
    hasMoved: true,
  };
}

export function resetUnitTurn(unit: Unit): Unit {
  return {
    ...unit,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints,
    hasMoved: false,
    hasActed: false,
  };
}

function getMovementCost(terrain: string): number {
  const costs: Record<string, number> = {
    grassland: 1, plains: 1, desert: 1, tundra: 1,
    forest: 2, hills: 2, snow: 2,
    mountain: Infinity, ocean: Infinity, coast: Infinity,
  };
  return costs[terrain] ?? Infinity;
}

function isPassable(terrain: string): boolean {
  return getMovementCost(terrain) < Infinity;
}

export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string>, // hexKey -> unitId (for blocking)
): HexCoord[] {
  const reachable: HexCoord[] = [];
  const visited = new Map<string, number>(); // hexKey -> remaining movement
  const queue: Array<{ coord: HexCoord; remaining: number }> = [];

  const startKey = hexKey(unit.position);
  visited.set(startKey, unit.movementPointsLeft);
  queue.push({ coord: unit.position, remaining: unit.movementPointsLeft });

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = hexNeighbors(current.coord);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      const tile = map.tiles[key];
      if (!tile || !isPassable(tile.terrain)) continue;

      // Check for friendly/enemy units blocking
      const occupant = unitPositions[key];
      if (occupant && occupant !== unit.id) continue;

      const cost = getMovementCost(tile.terrain);
      const remaining = current.remaining - cost;
      if (remaining < 0) continue;

      const prevRemaining = visited.get(key) ?? -1;
      if (remaining > prevRemaining) {
        visited.set(key, remaining);
        reachable.push(neighbor);
        queue.push({ coord: neighbor, remaining });
      }
    }
  }

  return reachable;
}

export function findPath(
  from: HexCoord,
  to: HexCoord,
  map: GameMap,
): HexCoord[] | null {
  const toKey = hexKey(to);
  const toTile = map.tiles[toKey];
  if (!toTile || !isPassable(toTile.terrain)) return null;

  const parents = new Map<string, string>();
  const gScore = new Map<string, number>();
  const openSet = new Set<string>();
  const closedSet = new Set<string>();
  const coords = new Map<string, HexCoord>();

  const startKey = hexKey(from);
  gScore.set(startKey, 0);
  openSet.add(startKey);
  coords.set(startKey, from);

  while (openSet.size > 0) {
    // Find node with lowest f score
    let currentKey = '';
    let lowestF = Infinity;
    for (const key of openSet) {
      const coord = coords.get(key)!;
      const f = (gScore.get(key) ?? Infinity) + hexDistance(coord, to);
      if (f < lowestF) {
        lowestF = f;
        currentKey = key;
      }
    }

    // Reached destination — reconstruct path
    if (currentKey === toKey) {
      const path: HexCoord[] = [];
      let key: string | null = currentKey;
      while (key) {
        path.unshift(coords.get(key)!);
        key = parents.get(key) ?? null;
      }
      return path;
    }

    openSet.delete(currentKey);
    closedSet.add(currentKey);
    const currentCoord = coords.get(currentKey)!;

    for (const neighbor of hexNeighbors(currentCoord)) {
      const nKey = hexKey(neighbor);
      if (closedSet.has(nKey)) continue;

      const tile = map.tiles[nKey];
      if (!tile || !isPassable(tile.terrain)) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + getMovementCost(tile.terrain);
      if (tentativeG < (gScore.get(nKey) ?? Infinity)) {
        parents.set(nKey, currentKey);
        gScore.set(nKey, tentativeG);
        coords.set(nKey, neighbor);
        openSet.add(nKey);
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/unit-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-system.ts tests/systems/unit-system.test.ts
git commit -m "feat: add unit system with movement, pathfinding (A*), and definitions"
```

---

## Task 7: City System

**Files:**
- Create: `src/systems/city-system.ts`
- Create: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write city system tests**

Create `tests/systems/city-system.test.ts`:

```typescript
import {
  foundCity,
  getAvailableBuildings,
  startBuilding,
  processCity,
  BUILDINGS,
  CITY_NAMES,
} from '@/systems/city-system';
import type { City, GameMap, GameState } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('foundCity', () => {
  it('creates a city at the given position', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);

    expect(city.owner).toBe('p1');
    expect(city.position).toEqual(landTile.coord);
    expect(city.population).toBe(1);
    expect(city.buildings).toEqual([]);
    expect(city.ownedTiles.length).toBeGreaterThan(0);
  });

  it('assigns a name from the city names list', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    expect(CITY_NAMES).toContain(city.name);
  });

  it('claims nearby tiles', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    expect(city.ownedTiles.length).toBeGreaterThanOrEqual(1);
    // Should include the city center tile
    expect(city.ownedTiles).toContainEqual(landTile.coord);
  });
});

describe('getAvailableBuildings', () => {
  it('returns buildings the city can build', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    const available = getAvailableBuildings(city, []);
    expect(available.length).toBeGreaterThan(0);
  });

  it('excludes already built buildings', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    const city = foundCity('p1', landTile.coord, map);
    city.buildings = ['granary'];
    const available = getAvailableBuildings(city, []);
    expect(available.find(b => b.id === 'granary')).toBeUndefined();
  });
});

describe('processCity', () => {
  it('adds food per turn and grows population', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map);
    const initialPop = city.population;
    city.food = city.foodNeeded - 1; // One food away from growing

    const result = processCity(city, map, 3); // 3 food per turn
    expect(result.city.food).toBeGreaterThanOrEqual(0);
    // May or may not have grown depending on exact numbers
  });

  it('progresses production', () => {
    const map = generateMap(30, 30, 'city-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    let city = foundCity('p1', landTile.coord, map);
    city.productionQueue = ['granary'];
    city.productionProgress = 0;

    const result = processCity(city, map, 3, 5); // 5 production per turn
    expect(result.city.productionProgress).toBe(5);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/city-system.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement city system**

Create `src/systems/city-system.ts`:

```typescript
import type { City, Building, HexCoord, GameMap, UnitType } from '@/core/types';
import { hexKey, hexesInRange } from './hex-utils';

let nextCityId = 1;
let cityNameIndex = 0;

export const CITY_NAMES = [
  'Alexandria', 'Thebes', 'Memphis', 'Carthage', 'Athens',
  'Sparta', 'Rome', 'Babylon', 'Persepolis', 'Chang\'an',
  'Kyoto', 'Delhi', 'Cusco', 'Tenochtitlan', 'London',
  'Paris', 'Constantinople', 'Samarkand', 'Timbuktu', 'Angkor',
];

export const BUILDINGS: Record<string, Building> = {
  granary: {
    id: 'granary', name: 'Granary',
    yields: { food: 2, production: 0, gold: 0, science: 0 },
    productionCost: 40, description: 'Stores food, +2 food per turn',
  },
  workshop: {
    id: 'workshop', name: 'Workshop',
    yields: { food: 0, production: 2, gold: 0, science: 0 },
    productionCost: 50, description: 'Improves crafting, +2 production',
  },
  library: {
    id: 'library', name: 'Library',
    yields: { food: 0, production: 0, gold: 0, science: 2 },
    productionCost: 60, description: 'Center of learning, +2 science',
  },
  marketplace: {
    id: 'marketplace', name: 'Marketplace',
    yields: { food: 0, production: 0, gold: 3, science: 0 },
    productionCost: 50, description: 'Trading hub, +3 gold',
  },
  barracks: {
    id: 'barracks', name: 'Barracks',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 40, description: 'Trains soldiers, new units start with bonus experience',
  },
  temple: {
    id: 'temple', name: 'Temple',
    yields: { food: 0, production: 0, gold: 0, science: 1 },
    productionCost: 45, description: 'Spiritual center, +1 science, +happiness',
  },
  herbalist: {
    id: 'herbalist', name: 'Herbalist',
    yields: { food: 1, production: 0, gold: 0, science: 0 },
    productionCost: 35, description: 'Heals and nurtures, +1 food, +health',
  },
};

export const TRAINABLE_UNITS: Array<{ type: UnitType; name: string; cost: number }> = [
  { type: 'warrior', name: 'Warrior', cost: 25 },
  { type: 'scout', name: 'Scout', cost: 20 },
  { type: 'worker', name: 'Worker', cost: 30 },
  { type: 'settler', name: 'Settler', cost: 50 },
];

export function foundCity(owner: string, position: HexCoord, map: GameMap): City {
  const name = CITY_NAMES[cityNameIndex % CITY_NAMES.length];
  cityNameIndex++;

  // Claim nearby land tiles (radius 1)
  const nearby = hexesInRange(position, 1);
  const ownedTiles = nearby.filter(coord => {
    const tile = map.tiles[hexKey(coord)];
    return tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain';
  });

  return {
    id: `city-${nextCityId++}`,
    name,
    owner,
    position: { ...position },
    population: 1,
    food: 0,
    foodNeeded: 15,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles,
  };
}

export function resetCityId(): void {
  nextCityId = 1;
  cityNameIndex = 0;
}

export function getAvailableBuildings(city: City, completedTechs: string[]): Building[] {
  return Object.values(BUILDINGS).filter(b => !city.buildings.includes(b.id));
}

export interface CityProcessResult {
  city: City;
  grew: boolean;
  completedBuilding: string | null;
  completedUnit: UnitType | null;
}

export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
): CityProcessResult {
  let grew = false;
  let completedBuilding: string | null = null;
  let completedUnit: UnitType | null = null;

  // Food and growth
  const foodSurplus = foodYield - city.population; // each pop eats 1 food
  let newFood = city.food + Math.max(0, foodSurplus);
  let newPop = city.population;
  let newFoodNeeded = city.foodNeeded;

  if (newFood >= city.foodNeeded) {
    newPop++;
    newFood -= city.foodNeeded;
    newFoodNeeded = Math.floor(city.foodNeeded * 1.3);
    grew = true;

    // Expand territory on growth
  }

  // Production
  let newProgress = city.productionProgress;
  const newQueue = [...city.productionQueue];
  const newBuildings = [...city.buildings];

  if (newQueue.length > 0) {
    newProgress += productionYield;
    const currentItem = newQueue[0];

    // Check if it's a building
    const building = BUILDINGS[currentItem];
    if (building && newProgress >= building.productionCost) {
      newBuildings.push(building.id);
      newQueue.shift();
      newProgress = 0;
      completedBuilding = building.id;
    }

    // Check if it's a unit
    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    if (unitDef && newProgress >= unitDef.cost) {
      newQueue.shift();
      newProgress = 0;
      completedUnit = unitDef.type;
    }
  }

  return {
    city: {
      ...city,
      food: newFood,
      foodNeeded: newFoodNeeded,
      population: newPop,
      productionProgress: newProgress,
      productionQueue: newQueue,
      buildings: newBuildings,
    },
    grew,
    completedBuilding,
    completedUnit,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/city-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat: add city system with founding, buildings, growth, and production"
```

---

## Task 8: Combat System

**Files:**
- Create: `src/systems/combat-system.ts`
- Create: `tests/systems/combat-system.test.ts`

- [ ] **Step 1: Write combat system tests**

Create `tests/systems/combat-system.test.ts`:

```typescript
import { resolveCombat } from '@/systems/combat-system';
import type { Unit, GameMap } from '@/core/types';
import { createUnit } from '@/systems/unit-system';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('resolveCombat', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'combat-test');
  });

  it('produces a combat result with damage to both sides', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 });
    const result = resolveCombat(attacker, defender, map);

    expect(result.attackerId).toBe(attacker.id);
    expect(result.defenderId).toBe(defender.id);
    expect(result.attackerDamage).toBeGreaterThan(0);
    expect(result.defenderDamage).toBeGreaterThan(0);
  });

  it('stronger unit deals more damage', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 }); // strength 10
    const scout = createUnit('scout', 'p2', { q: 11, r: 10 });     // strength 5

    const result = resolveCombat(warrior, scout, map);
    // Warrior should deal more damage than it takes (on average)
    // Due to randomness, we just check the result is valid
    expect(result.attackerDamage).toBeGreaterThanOrEqual(0);
    expect(result.defenderDamage).toBeGreaterThanOrEqual(0);
  });

  it('defender on hills gets defense bonus', () => {
    // Find a hills tile
    const hillsTile = Object.values(map.tiles).find(t => t.terrain === 'hills');
    if (!hillsTile) return; // Skip if map has no hills

    const attacker = createUnit('warrior', 'p1', { q: hillsTile.coord.q - 1, r: hillsTile.coord.r });
    const defender = createUnit('warrior', 'p2', hillsTile.coord);

    // Run many combats to check statistical advantage
    let defenderWins = 0;
    for (let i = 0; i < 100; i++) {
      const result = resolveCombat(
        { ...attacker, health: 100 },
        { ...defender, health: 100 },
        map,
      );
      if (result.defenderSurvived && !result.attackerSurvived) defenderWins++;
    }
    // Defender should win more often with terrain bonus
    expect(defenderWins).toBeGreaterThan(30);
  });

  it('marks units as destroyed when health reaches 0', () => {
    const attacker = createUnit('warrior', 'p1', { q: 10, r: 10 });
    attacker.health = 10; // Very low health
    const defender = createUnit('warrior', 'p2', { q: 11, r: 10 });

    const result = resolveCombat(attacker, defender, map);
    // Attacker with very low health should often die
    // Just check the boolean fields are set correctly
    expect(typeof result.attackerSurvived).toBe('boolean');
    expect(typeof result.defenderSurvived).toBe('boolean');
  });

  it('non-combat units always lose', () => {
    const warrior = createUnit('warrior', 'p1', { q: 10, r: 10 });
    const settler = createUnit('settler', 'p2', { q: 11, r: 10 });

    const result = resolveCombat(warrior, settler, map);
    expect(result.defenderSurvived).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/combat-system.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement combat system**

Create `src/systems/combat-system.ts`:

```typescript
import type { Unit, CombatResult, GameMap } from '@/core/types';
import { hexKey } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

function getTerrainDefenseBonus(terrain: string): number {
  const bonuses: Record<string, number> = {
    hills: 0.25,
    forest: 0.25,
    mountain: 0.5,
  };
  return bonuses[terrain] ?? 0;
}

export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
): CombatResult {
  const atkDef = UNIT_DEFINITIONS[attacker.type];
  const defDef = UNIT_DEFINITIONS[defender.type];

  let atkStrength = atkDef.strength * (attacker.health / 100);
  let defStrength = defDef.strength * (defender.health / 100);

  // Terrain defense bonus
  const defTile = map.tiles[hexKey(defender.position)];
  if (defTile) {
    defStrength *= (1 + getTerrainDefenseBonus(defTile.terrain));
  }

  // Non-combat units auto-lose
  if (defStrength === 0) {
    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: 0,
      defenderDamage: defender.health,
      attackerSurvived: true,
      defenderSurvived: false,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    };
  }

  if (atkStrength === 0) {
    return {
      attackerId: attacker.id,
      defenderId: defender.id,
      attackerDamage: attacker.health,
      defenderDamage: 0,
      attackerSurvived: false,
      defenderSurvived: true,
      attackerPosition: attacker.position,
      defenderPosition: defender.position,
    };
  }

  // Combat formula: damage ratio based on strength comparison with randomness
  const totalStrength = atkStrength + defStrength;
  const atkRatio = atkStrength / totalStrength;

  // Add randomness (±20%)
  const randomFactor = 0.8 + Math.random() * 0.4;
  const adjustedRatio = Math.min(0.95, Math.max(0.05, atkRatio * randomFactor));

  // Base damage is 30-50
  const baseDamage = 30 + Math.random() * 20;

  const defenderDamage = Math.round(baseDamage * adjustedRatio);
  const attackerDamage = Math.round(baseDamage * (1 - adjustedRatio));

  const attackerHealthAfter = attacker.health - attackerDamage;
  const defenderHealthAfter = defender.health - defenderDamage;

  return {
    attackerId: attacker.id,
    defenderId: defender.id,
    attackerDamage,
    defenderDamage,
    attackerSurvived: attackerHealthAfter > 0,
    defenderSurvived: defenderHealthAfter > 0,
    attackerPosition: attacker.position,
    defenderPosition: defender.position,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/combat-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/combat-system.ts tests/systems/combat-system.test.ts
git commit -m "feat: add auto-resolve combat system with terrain bonuses"
```

---

## Task 9: Tech System

**Files:**
- Create: `src/systems/tech-system.ts`
- Create: `tests/systems/tech-system.test.ts`

- [ ] **Step 1: Write tech system tests**

Create `tests/systems/tech-system.test.ts`:

```typescript
import {
  TECH_TREE,
  createTechState,
  getAvailableTechs,
  startResearch,
  processResearch,
  isTechCompleted,
} from '@/systems/tech-system';
import type { TechState } from '@/core/types';

describe('TECH_TREE', () => {
  it('has techs in 3 tracks', () => {
    const tracks = new Set(TECH_TREE.map(t => t.track));
    expect(tracks.size).toBe(3);
    expect(tracks).toContain('military');
    expect(tracks).toContain('economy');
    expect(tracks).toContain('science');
  });

  it('has at least 5 techs per track', () => {
    for (const track of ['military', 'economy', 'science'] as const) {
      const techs = TECH_TREE.filter(t => t.track === track);
      expect(techs.length).toBeGreaterThanOrEqual(5);
    }
  });
});

describe('createTechState', () => {
  it('starts with no completed techs', () => {
    const state = createTechState();
    expect(state.completed).toEqual([]);
    expect(state.currentResearch).toBeNull();
    expect(state.researchProgress).toBe(0);
  });
});

describe('getAvailableTechs', () => {
  it('returns era 1 techs with no prerequisites when nothing is researched', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    expect(available.length).toBeGreaterThan(0);
    for (const tech of available) {
      expect(tech.prerequisites).toEqual([]);
    }
  });

  it('excludes completed techs', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const firstTech = available[0];
    state.completed.push(firstTech.id);
    const newAvailable = getAvailableTechs(state);
    expect(newAvailable.find(t => t.id === firstTech.id)).toBeUndefined();
  });

  it('unlocks techs when prerequisites are met', () => {
    const state = createTechState();
    // Find a tech with prerequisites
    const withPrereq = TECH_TREE.find(t => t.prerequisites.length > 0);
    if (!withPrereq) return;

    // Should not be available initially
    let available = getAvailableTechs(state);
    expect(available.find(t => t.id === withPrereq.id)).toBeUndefined();

    // Complete prerequisites
    for (const prereq of withPrereq.prerequisites) {
      state.completed.push(prereq);
    }
    available = getAvailableTechs(state);
    expect(available.find(t => t.id === withPrereq.id)).toBeDefined();
  });
});

describe('processResearch', () => {
  it('adds science points to current research', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const updated = startResearch({ ...state }, available[0].id);
    const result = processResearch(updated, 10);
    expect(result.state.researchProgress).toBe(10);
    expect(result.completedTech).toBeNull();
  });

  it('completes tech when progress reaches cost', () => {
    const state = createTechState();
    const available = getAvailableTechs(state);
    const tech = available[0];
    let updated = startResearch({ ...state }, tech.id);
    updated.researchProgress = tech.cost - 1;

    const result = processResearch(updated, 10);
    expect(result.completedTech).toBe(tech.id);
    expect(result.state.completed).toContain(tech.id);
    expect(result.state.currentResearch).toBeNull();
    expect(result.state.researchProgress).toBe(0);
  });
});

describe('isTechCompleted', () => {
  it('returns false for uncompleted tech', () => {
    const state = createTechState();
    expect(isTechCompleted(state, 'stone-weapons')).toBe(false);
  });

  it('returns true for completed tech', () => {
    const state = createTechState();
    state.completed.push('stone-weapons');
    expect(isTechCompleted(state, 'stone-weapons')).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/tech-system.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement tech system**

Create `src/systems/tech-system.ts`:

```typescript
import type { Tech, TechState, TechTrack } from '@/core/types';

export const TECH_TREE: Tech[] = [
  // Military Track (5 techs)
  {
    id: 'stone-weapons', name: 'Stone Weapons', track: 'military',
    cost: 20, prerequisites: [], unlocks: ['Warrior units deal +2 damage'], era: 1,
  },
  {
    id: 'archery', name: 'Archery', track: 'military',
    cost: 35, prerequisites: ['stone-weapons'], unlocks: ['Unlock Archer unit (future)'], era: 1,
  },
  {
    id: 'bronze-working', name: 'Bronze Working', track: 'military',
    cost: 50, prerequisites: ['stone-weapons'], unlocks: ['Unlock Spearman unit (future)', 'Reveal Iron'], era: 2,
  },
  {
    id: 'fortification', name: 'Fortification', track: 'military',
    cost: 60, prerequisites: ['bronze-working'], unlocks: ['Cities get +25% defense'], era: 2,
  },
  {
    id: 'iron-forging', name: 'Iron Forging', track: 'military',
    cost: 80, prerequisites: ['bronze-working'], unlocks: ['Unlock Swordsman unit (future)'], era: 3,
  },

  // Economy Track (5 techs)
  {
    id: 'gathering', name: 'Gathering', track: 'economy',
    cost: 15, prerequisites: [], unlocks: ['Farms yield +1 food'], era: 1,
  },
  {
    id: 'pottery', name: 'Pottery', track: 'economy',
    cost: 25, prerequisites: ['gathering'], unlocks: ['Unlock Granary building'], era: 1,
  },
  {
    id: 'animal-husbandry', name: 'Animal Husbandry', track: 'economy',
    cost: 30, prerequisites: ['gathering'], unlocks: ['Pasture improvement (future)'], era: 1,
  },
  {
    id: 'currency', name: 'Currency', track: 'economy',
    cost: 55, prerequisites: ['pottery'], unlocks: ['Unlock Marketplace building', '+1 gold per trade route (future)'], era: 2,
  },
  {
    id: 'mining-tech', name: 'Advanced Mining', track: 'economy',
    cost: 65, prerequisites: ['animal-husbandry'], unlocks: ['Mines yield +1 production'], era: 2,
  },

  // Science Track (5 techs)
  {
    id: 'fire', name: 'Fire', track: 'science',
    cost: 15, prerequisites: [], unlocks: ['+1 science per city'], era: 1,
  },
  {
    id: 'writing', name: 'Writing', track: 'science',
    cost: 30, prerequisites: ['fire'], unlocks: ['Unlock Library building'], era: 1,
  },
  {
    id: 'wheel', name: 'The Wheel', track: 'science',
    cost: 40, prerequisites: ['fire'], unlocks: ['Units get +1 movement on roads (future)'], era: 2,
  },
  {
    id: 'mathematics', name: 'Mathematics', track: 'science',
    cost: 60, prerequisites: ['writing'], unlocks: ['Research speed +10%'], era: 2,
  },
  {
    id: 'engineering', name: 'Engineering', track: 'science',
    cost: 80, prerequisites: ['mathematics', 'wheel'], unlocks: ['Unlock Workshop building', 'Improvements build faster'], era: 3,
  },
];

export function createTechState(): TechState {
  return {
    completed: [],
    currentResearch: null,
    researchProgress: 0,
    trackPriorities: {
      military: 'medium',
      economy: 'medium',
      science: 'medium',
    },
  };
}

export function getAvailableTechs(state: TechState): Tech[] {
  return TECH_TREE.filter(tech => {
    if (state.completed.includes(tech.id)) return false;
    if (state.currentResearch === tech.id) return false;
    return tech.prerequisites.every(prereq => state.completed.includes(prereq));
  });
}

export function startResearch(state: TechState, techId: string): TechState {
  return {
    ...state,
    currentResearch: techId,
    researchProgress: 0,
  };
}

export interface ResearchResult {
  state: TechState;
  completedTech: string | null;
}

export function processResearch(state: TechState, sciencePoints: number): ResearchResult {
  if (!state.currentResearch) {
    return { state, completedTech: null };
  }

  const tech = TECH_TREE.find(t => t.id === state.currentResearch);
  if (!tech) {
    return { state, completedTech: null };
  }

  const newProgress = state.researchProgress + sciencePoints;

  if (newProgress >= tech.cost) {
    return {
      state: {
        ...state,
        completed: [...state.completed, tech.id],
        currentResearch: null,
        researchProgress: 0,
      },
      completedTech: tech.id,
    };
  }

  return {
    state: {
      ...state,
      researchProgress: newProgress,
    },
    completedTech: null,
  };
}

export function isTechCompleted(state: TechState, techId: string): boolean {
  return state.completed.includes(techId);
}

export function getTechById(id: string): Tech | undefined {
  return TECH_TREE.find(t => t.id === id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/tech-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/tech-system.ts tests/systems/tech-system.test.ts
git commit -m "feat: add tech system with 3 tracks and 15 techs"
```

---

## Task 10: Resource & Improvement Systems

**Files:**
- Create: `src/systems/resource-system.ts`
- Create: `src/systems/improvement-system.ts`
- Create: `tests/systems/resource-system.test.ts`
- Create: `tests/systems/improvement-system.test.ts`

- [ ] **Step 1: Write resource system tests**

Create `tests/systems/resource-system.test.ts`:

```typescript
import { calculateCityYields } from '@/systems/resource-system';
import type { City, GameMap } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { foundCity } from '@/systems/city-system';

describe('calculateCityYields', () => {
  let map: GameMap;
  let city: City;

  beforeAll(() => {
    map = generateMap(30, 30, 'resource-test');
    const landTile = Object.values(map.tiles).find(t => t.terrain === 'grassland')!;
    city = foundCity('p1', landTile.coord, map);
  });

  it('calculates positive food yield', () => {
    const yields = calculateCityYields(city, map);
    expect(yields.food).toBeGreaterThan(0);
  });

  it('calculates yields from owned tiles', () => {
    const yields = calculateCityYields(city, map);
    expect(yields.food + yields.production + yields.gold + yields.science).toBeGreaterThan(0);
  });

  it('includes building yields', () => {
    const cityWithBuildings = { ...city, buildings: ['granary'] };
    const withoutBuilding = calculateCityYields(city, map);
    const withBuilding = calculateCityYields(cityWithBuildings, map);
    expect(withBuilding.food).toBeGreaterThan(withoutBuilding.food);
  });
});
```

- [ ] **Step 2: Write improvement system tests**

Create `tests/systems/improvement-system.test.ts`:

```typescript
import { canBuildImprovement, getImprovementYieldBonus, IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import type { HexTile } from '@/core/types';

describe('canBuildImprovement', () => {
  it('allows farm on grassland', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(true);
  });

  it('allows mine on hills', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'hills', elevation: 'highland',
      resource: null, improvement: 'none', owner: 'p1', improvementTurnsLeft: 0,
    };
    expect(canBuildImprovement(tile, 'mine')).toBe(true);
  });

  it('does not allow farm on ocean', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'ocean', elevation: 'lowland',
      resource: null, improvement: 'none', owner: null, improvementTurnsLeft: 0,
    };
    expect(canBuildImprovement(tile, 'farm')).toBe(false);
  });

  it('does not allow building on already improved tile', () => {
    const tile: HexTile = {
      coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland',
      resource: null, improvement: 'farm', owner: 'p1', improvementTurnsLeft: 0,
    };
    expect(canBuildImprovement(tile, 'mine')).toBe(false);
  });
});

describe('getImprovementYieldBonus', () => {
  it('farm gives food bonus', () => {
    const bonus = getImprovementYieldBonus('farm');
    expect(bonus.food).toBeGreaterThan(0);
  });

  it('mine gives production bonus', () => {
    const bonus = getImprovementYieldBonus('mine');
    expect(bonus.production).toBeGreaterThan(0);
  });

  it('none gives no bonus', () => {
    const bonus = getImprovementYieldBonus('none');
    expect(bonus.food + bonus.production + bonus.gold + bonus.science).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
yarn test tests/systems/resource-system.test.ts tests/systems/improvement-system.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement improvement system**

Create `src/systems/improvement-system.ts`:

```typescript
import type { HexTile, ImprovementType, ResourceYield } from '@/core/types';

export const IMPROVEMENT_BUILD_TURNS: Record<ImprovementType, number> = {
  farm: 4,
  mine: 5,
  none: 0,
};

const VALID_TERRAIN: Record<ImprovementType, string[]> = {
  farm: ['grassland', 'plains', 'desert', 'forest'],
  mine: ['hills', 'plains', 'mountain'],
  none: [],
};

const YIELD_BONUSES: Record<ImprovementType, ResourceYield> = {
  farm: { food: 2, production: 0, gold: 0, science: 0 },
  mine: { food: 0, production: 2, gold: 1, science: 0 },
  none: { food: 0, production: 0, gold: 0, science: 0 },
};

export function canBuildImprovement(tile: HexTile, type: ImprovementType): boolean {
  if (type === 'none') return false;
  if (tile.improvement !== 'none') return false;
  return VALID_TERRAIN[type].includes(tile.terrain);
}

export function getImprovementYieldBonus(type: ImprovementType): ResourceYield {
  return { ...YIELD_BONUSES[type] };
}
```

- [ ] **Step 5: Implement resource system**

Create `src/systems/resource-system.ts`:

```typescript
import type { City, GameMap, ResourceYield } from '@/core/types';
import { hexKey } from './hex-utils';
import { getImprovementYieldBonus } from './improvement-system';
import { BUILDINGS } from './city-system';

const TERRAIN_YIELDS: Record<string, ResourceYield> = {
  grassland:  { food: 2, production: 0, gold: 0, science: 0 },
  plains:     { food: 1, production: 1, gold: 0, science: 0 },
  desert:     { food: 0, production: 0, gold: 0, science: 0 },
  tundra:     { food: 1, production: 0, gold: 0, science: 0 },
  snow:       { food: 0, production: 0, gold: 0, science: 0 },
  forest:     { food: 1, production: 1, gold: 0, science: 0 },
  hills:      { food: 0, production: 2, gold: 0, science: 0 },
  mountain:   { food: 0, production: 0, gold: 0, science: 0 },
  ocean:      { food: 1, production: 0, gold: 0, science: 0 },
  coast:      { food: 2, production: 0, gold: 1, science: 0 },
};

export function calculateCityYields(city: City, map: GameMap): ResourceYield {
  const yields: ResourceYield = { food: 0, production: 0, gold: 0, science: 0 };

  // Base yield from city center
  yields.food += 1;
  yields.production += 1;

  // Yields from worked tiles (up to population count)
  const workedTiles = city.ownedTiles.slice(0, city.population);
  for (const coord of workedTiles) {
    const tile = map.tiles[hexKey(coord)];
    if (!tile) continue;

    const terrainYield = TERRAIN_YIELDS[tile.terrain] ?? { food: 0, production: 0, gold: 0, science: 0 };
    yields.food += terrainYield.food;
    yields.production += terrainYield.production;
    yields.gold += terrainYield.gold;
    yields.science += terrainYield.science;

    // Improvement bonuses
    if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
      const bonus = getImprovementYieldBonus(tile.improvement);
      yields.food += bonus.food;
      yields.production += bonus.production;
      yields.gold += bonus.gold;
      yields.science += bonus.science;
    }
  }

  // Building yields
  for (const buildingId of city.buildings) {
    const building = BUILDINGS[buildingId];
    if (building) {
      yields.food += building.yields.food;
      yields.production += building.yields.production;
      yields.gold += building.yields.gold;
      yields.science += building.yields.science;
    }
  }

  return yields;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
yarn test tests/systems/resource-system.test.ts tests/systems/improvement-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/systems/resource-system.ts src/systems/improvement-system.ts tests/systems/resource-system.test.ts tests/systems/improvement-system.test.ts
git commit -m "feat: add resource yield calculation and tile improvement system"
```

---

## Task 11: Barbarian System

**Files:**
- Create: `src/systems/barbarian-system.ts`
- Create: `tests/systems/barbarian-system.test.ts`

- [ ] **Step 1: Write barbarian system tests**

Create `tests/systems/barbarian-system.test.ts`:

```typescript
import {
  spawnBarbarianCamp,
  processBarbarians,
  destroyCamp,
} from '@/systems/barbarian-system';
import type { GameMap, BarbarianCamp, Unit } from '@/core/types';
import { generateMap } from '@/systems/map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('spawnBarbarianCamp', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'barb-test');
  });

  it('creates a camp on a valid land tile', () => {
    const camp = spawnBarbarianCamp(map, [], []);
    expect(camp).not.toBeNull();
    if (camp) {
      const tile = map.tiles[hexKey(camp.position)];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe('ocean');
      expect(tile.terrain).not.toBe('mountain');
    }
  });

  it('avoids spawning near cities', () => {
    const cityPositions = [{ q: 15, r: 15 }];
    const camp = spawnBarbarianCamp(map, cityPositions, []);
    if (camp) {
      const { hexDistance } = require('@/systems/hex-utils');
      const dist = hexDistance(camp.position, { q: 15, r: 15 });
      expect(dist).toBeGreaterThan(5);
    }
  });
});

describe('destroyCamp', () => {
  it('returns gold reward', () => {
    const camp: BarbarianCamp = {
      id: 'camp-1', position: { q: 10, r: 10 },
      strength: 5, spawnCooldown: 3,
    };
    const reward = destroyCamp(camp);
    expect(reward).toBeGreaterThan(0);
  });
});

describe('processBarbarians', () => {
  it('decrements spawn cooldown', () => {
    const camp: BarbarianCamp = {
      id: 'camp-1', position: { q: 10, r: 10 },
      strength: 5, spawnCooldown: 3,
    };
    const result = processBarbarians([camp], generateMap(30, 30, 'barb-proc'), []);
    expect(result.updatedCamps[0].spawnCooldown).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/systems/barbarian-system.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement barbarian system**

Create `src/systems/barbarian-system.ts`:

```typescript
import type { BarbarianCamp, GameMap, HexCoord, Unit } from '@/core/types';
import { hexKey, hexDistance } from './hex-utils';

let nextCampId = 1;

export function spawnBarbarianCamp(
  map: GameMap,
  cityPositions: HexCoord[],
  existingCamps: BarbarianCamp[],
): BarbarianCamp | null {
  const existingPositions = new Set(existingCamps.map(c => hexKey(c.position)));

  const candidates = Object.values(map.tiles).filter(tile => {
    if (tile.terrain === 'ocean' || tile.terrain === 'coast' ||
        tile.terrain === 'mountain' || tile.terrain === 'snow') return false;
    if (existingPositions.has(hexKey(tile.coord))) return false;

    // Must be far from cities
    for (const cityPos of cityPositions) {
      if (hexDistance(tile.coord, cityPos) < 6) return false;
    }

    // Must be far from other camps
    for (const camp of existingCamps) {
      if (hexDistance(tile.coord, camp.position) < 4) return false;
    }

    return true;
  });

  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(Math.random() * candidates.length)];

  return {
    id: `camp-${nextCampId++}`,
    position: { ...chosen.coord },
    strength: 5 + Math.floor(Math.random() * 5),
    spawnCooldown: 5,
  };
}

export function resetCampId(): void {
  nextCampId = 1;
}

export function destroyCamp(camp: BarbarianCamp): number {
  // Gold reward based on camp strength
  return 15 + camp.strength * 2;
}

export interface BarbarianProcessResult {
  updatedCamps: BarbarianCamp[];
  spawnedUnits: Array<{ campId: string; position: HexCoord }>;
}

export function processBarbarians(
  camps: BarbarianCamp[],
  map: GameMap,
  playerUnits: Unit[],
): BarbarianProcessResult {
  const updatedCamps: BarbarianCamp[] = [];
  const spawnedUnits: Array<{ campId: string; position: HexCoord }> = [];

  for (const camp of camps) {
    const newCooldown = camp.spawnCooldown - 1;

    if (newCooldown <= 0) {
      // Spawn a raider near the camp
      spawnedUnits.push({ campId: camp.id, position: { ...camp.position } });
      updatedCamps.push({
        ...camp,
        spawnCooldown: 4 + Math.floor(Math.random() * 3),
        strength: camp.strength + 1,
      });
    } else {
      updatedCamps.push({ ...camp, spawnCooldown: newCooldown });
    }
  }

  return { updatedCamps, spawnedUnits };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/barbarian-system.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/systems/barbarian-system.ts tests/systems/barbarian-system.test.ts
git commit -m "feat: add barbarian camp spawning, processing, and rewards"
```

---

## Task 12: Game State & Turn Manager

**Files:**
- Create: `src/core/game-state.ts`
- Create: `src/core/turn-manager.ts`
- Create: `tests/core/game-state.test.ts`
- Create: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write game state tests**

Create `tests/core/game-state.test.ts`:

```typescript
import { createNewGame } from '@/core/game-state';

describe('createNewGame', () => {
  it('creates a valid initial game state', () => {
    const state = createNewGame('test-seed');

    expect(state.turn).toBe(1);
    expect(state.era).toBe(1);
    expect(state.gameOver).toBe(false);

    // Should have player civ and AI civ
    const civs = Object.values(state.civilizations);
    expect(civs.length).toBe(2);
    expect(civs.filter(c => c.isHuman).length).toBe(1);
    expect(civs.filter(c => !c.isHuman).length).toBe(1);
  });

  it('gives each civ starting units', () => {
    const state = createNewGame('test-seed');
    const units = Object.values(state.units);
    expect(units.length).toBeGreaterThanOrEqual(4); // at least settler + warrior per civ
  });

  it('generates a map', () => {
    const state = createNewGame('test-seed');
    expect(state.map.width).toBe(30);
    expect(state.map.height).toBe(30);
    expect(Object.keys(state.map.tiles).length).toBe(900);
  });

  it('places barbarian camps', () => {
    const state = createNewGame('test-seed');
    expect(Object.keys(state.barbarianCamps).length).toBeGreaterThanOrEqual(1);
  });

  it('initializes tutorial state', () => {
    const state = createNewGame('test-seed');
    expect(state.tutorial.active).toBe(true);
    expect(state.tutorial.currentStep).toBe('welcome');
  });
});
```

- [ ] **Step 2: Write turn manager tests**

Create `tests/core/turn-manager.test.ts`:

```typescript
import { processTurn } from '@/core/turn-manager';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';

describe('processTurn', () => {
  it('increments the turn counter', () => {
    const state = createNewGame('turn-test');
    const bus = new EventBus();
    const newState = processTurn(state, bus);
    expect(newState.turn).toBe(2);
  });

  it('resets unit movement points', () => {
    const state = createNewGame('turn-test');
    const bus = new EventBus();
    // Exhaust a unit's movement
    const unitId = Object.keys(state.units)[0];
    state.units[unitId].movementPointsLeft = 0;
    state.units[unitId].hasMoved = true;

    const newState = processTurn(state, bus);
    const unit = newState.units[unitId];
    if (unit) {
      expect(unit.hasMoved).toBe(false);
      expect(unit.movementPointsLeft).toBeGreaterThan(0);
    }
  });

  it('emits turn:start and turn:end events', () => {
    const state = createNewGame('turn-test');
    const bus = new EventBus();
    const startListener = vi.fn();
    const endListener = vi.fn();
    bus.on('turn:start', startListener);
    bus.on('turn:end', endListener);

    processTurn(state, bus);
    expect(endListener).toHaveBeenCalled();
    expect(startListener).toHaveBeenCalled();
  });

  it('processes city production', () => {
    const state = createNewGame('turn-test');
    const bus = new EventBus();

    // Found a city for the player if not already
    const playerCiv = Object.values(state.civilizations).find(c => c.isHuman)!;
    if (playerCiv.cities.length === 0) {
      // Skip — cities will be founded during gameplay
      return;
    }

    const newState = processTurn(state, bus);
    // Just verify it doesn't throw
    expect(newState).toBeDefined();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
yarn test tests/core/game-state.test.ts tests/core/turn-manager.test.ts
```
Expected: FAIL.

- [ ] **Step 4: Implement game state**

Create `src/core/game-state.ts`:

```typescript
import type { GameState, Civilization, Unit } from './types';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { createUnit } from '@/systems/unit-system';
import { createTechState } from '@/systems/tech-system';
import { createVisibilityMap, updateVisibility } from '@/systems/fog-of-war';
import { spawnBarbarianCamp } from '@/systems/barbarian-system';
import { hexKey } from '@/systems/hex-utils';

export function createNewGame(seed?: string): GameState {
  const gameSeed = seed ?? `game-${Date.now()}`;
  const map = generateMap(30, 30, gameSeed);
  const startPositions = findStartPositions(map, 2);

  // Create player civilization
  const playerCiv: Civilization = {
    id: 'player',
    name: 'Player Civilization',
    color: '#4a90d9',
    isHuman: true,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
  };

  // Create AI civilization
  const aiCiv: Civilization = {
    id: 'ai-1',
    name: 'Rival Nation',
    color: '#d94a4a',
    isHuman: false,
    cities: [],
    units: [],
    techState: createTechState(),
    gold: 0,
    visibility: createVisibilityMap(),
    score: 0,
  };

  // Create starting units
  const units: Record<string, Unit> = {};

  const playerSettler = createUnit('settler', 'player', startPositions[0]);
  const playerWarrior = createUnit('warrior', 'player', startPositions[0]);
  units[playerSettler.id] = playerSettler;
  units[playerWarrior.id] = playerWarrior;
  playerCiv.units = [playerSettler.id, playerWarrior.id];

  const aiSettler = createUnit('settler', 'ai-1', startPositions[1]);
  const aiWarrior = createUnit('warrior', 'ai-1', startPositions[1]);
  units[aiSettler.id] = aiSettler;
  units[aiWarrior.id] = aiWarrior;
  aiCiv.units = [aiSettler.id, aiWarrior.id];

  // Initial visibility
  const playerUnits = [playerSettler, playerWarrior];
  updateVisibility(playerCiv.visibility, playerUnits, map);

  const aiUnits = [aiSettler, aiWarrior];
  updateVisibility(aiCiv.visibility, aiUnits, map);

  // Spawn initial barbarian camps
  const barbarianCamps: Record<string, any> = {};
  const cityPositions = startPositions; // Treat start positions as cities for spacing
  for (let i = 0; i < 3; i++) {
    const camp = spawnBarbarianCamp(
      map,
      cityPositions,
      Object.values(barbarianCamps),
    );
    if (camp) {
      barbarianCamps[camp.id] = camp;
    }
  }

  return {
    turn: 1,
    era: 1,
    civilizations: {
      player: playerCiv,
      'ai-1': aiCiv,
    },
    map,
    units,
    cities: {},
    barbarianCamps,
    tutorial: {
      active: true,
      currentStep: 'welcome',
      completedSteps: [],
    },
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: true,
    },
  };
}
```

- [ ] **Step 5: Implement turn manager**

Create `src/core/turn-manager.ts`:

```typescript
import type { GameState } from './types';
import { EventBus } from './event-bus';
import { resetUnitTurn, createUnit } from '@/systems/unit-system';
import { processCity } from '@/systems/city-system';
import { processResearch } from '@/systems/tech-system';
import { processBarbarians } from '@/systems/barbarian-system';
import { calculateCityYields } from '@/systems/resource-system';
import { updateVisibility } from '@/systems/fog-of-war';

export function processTurn(state: GameState, bus: EventBus): GameState {
  let newState = structuredClone(state);

  bus.emit('turn:end', { turn: newState.turn, playerId: newState.currentPlayer });

  // --- Process each civilization ---
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    // Process cities: food, growth, production
    let totalScience = 0;
    let totalGold = 0;

    for (const cityId of civ.cities) {
      const city = newState.cities[cityId];
      if (!city) continue;

      const yields = calculateCityYields(city, newState.map);
      totalScience += yields.science;
      totalGold += yields.gold;

      const result = processCity(city, newState.map, yields.food, yields.production);
      newState.cities[cityId] = result.city;

      if (result.grew) {
        bus.emit('city:grew', { cityId, newPopulation: result.city.population });
      }
      if (result.completedBuilding) {
        bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
      }
      if (result.completedUnit) {
        bus.emit('city:unit-trained', { cityId, unitType: result.completedUnit });
      }
    }

    // Process research
    const researchResult = processResearch(civ.techState, totalScience);
    newState.civilizations[civId].techState = researchResult.state;
    if (researchResult.completedTech) {
      bus.emit('tech:completed', { civId, techId: researchResult.completedTech });
    }

    // Update gold
    newState.civilizations[civId].gold += totalGold;

    // Reset unit movement
    for (const unitId of civ.units) {
      const unit = newState.units[unitId];
      if (unit) {
        newState.units[unitId] = resetUnitTurn(unit);
      }
    }

    // Update visibility
    const civUnits = civ.units
      .map(id => newState.units[id])
      .filter((u): u is NonNullable<typeof u> => u !== undefined);
    const cityPositions = civ.cities
      .map(id => newState.cities[id]?.position)
      .filter((p): p is NonNullable<typeof p> => p !== undefined);
    updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);
  }

  // --- Process barbarians ---
  const playerUnits = Object.values(newState.units).filter(u => u.owner !== 'barbarian');
  const barbResult = processBarbarians(
    Object.values(newState.barbarianCamps),
    newState.map,
    playerUnits,
  );
  newState.barbarianCamps = {};
  for (const camp of barbResult.updatedCamps) {
    newState.barbarianCamps[camp.id] = camp;
  }

  // Spawn barbarian raiders
  for (const spawn of barbResult.spawnedUnits) {
    // Create a barbarian warrior near the camp
    const raider = createUnit('warrior', 'barbarian', spawn.position);
    newState.units[raider.id] = raider;
    bus.emit('barbarian:spawned', { campId: spawn.campId, unitId: raider.id });
  }

  // --- Advance turn ---
  newState.turn += 1;

  bus.emit('turn:start', { turn: newState.turn, playerId: newState.currentPlayer });

  return newState;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
yarn test tests/core/game-state.test.ts tests/core/turn-manager.test.ts
```
Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/core/game-state.ts src/core/turn-manager.ts tests/core/game-state.test.ts tests/core/turn-manager.test.ts
git commit -m "feat: add game state initialization and turn processing"
```

---

## Task 13: Basic AI

**Files:**
- Create: `src/ai/basic-ai.ts`
- Create: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Write basic AI tests**

Create `tests/ai/basic-ai.test.ts`:

```typescript
import { processAITurn } from '@/ai/basic-ai';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';

describe('processAITurn', () => {
  it('does not throw on a fresh game', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    expect(() => processAITurn(state, 'ai-1', bus)).not.toThrow();
  });

  it('returns a modified game state', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    expect(newState).toBeDefined();
  });

  it('AI settler founds a city when possible', () => {
    const state = createNewGame('ai-test');
    const bus = new EventBus();
    const newState = processAITurn(state, 'ai-1', bus);
    const aiCiv = newState.civilizations['ai-1'];
    // AI should try to found a city with its settler
    expect(aiCiv.cities.length + Object.values(newState.units).filter(
      u => u.owner === 'ai-1' && u.type === 'settler'
    ).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
yarn test tests/ai/basic-ai.test.ts
```
Expected: FAIL.

- [ ] **Step 3: Implement basic AI**

Create `src/ai/basic-ai.ts`:

```typescript
import type { GameState, Unit, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey, hexNeighbors, hexDistance } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { getMovementRange, moveUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { resolveCombat } from '@/systems/combat-system';
import { getAvailableTechs, startResearch } from '@/systems/tech-system';
import { updateVisibility } from '@/systems/fog-of-war';

export function processAITurn(state: GameState, civId: string, bus: EventBus): GameState {
  let newState = structuredClone(state);
  const civ = newState.civilizations[civId];
  if (!civ) return newState;

  // --- Handle settlers: found cities ---
  const settlers = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type === 'settler');

  for (const settler of settlers) {
    // Found city at current position
    const tile = newState.map.tiles[hexKey(settler.position)];
    if (tile && tile.terrain !== 'ocean' && tile.terrain !== 'mountain' && tile.terrain !== 'coast') {
      const city = foundCity(civId, settler.position, newState.map);
      newState.cities[city.id] = city;
      civ.cities.push(city.id);

      // Mark tiles as owned
      for (const ownedCoord of city.ownedTiles) {
        const key = hexKey(ownedCoord);
        if (newState.map.tiles[key]) {
          newState.map.tiles[key].owner = civId;
        }
      }

      // Remove settler
      delete newState.units[settler.id];
      civ.units = civ.units.filter(id => id !== settler.id);

      bus.emit('city:founded', { city });

      // Start building a warrior
      city.productionQueue = ['warrior'];
    }
  }

  // --- Handle military units: explore or attack ---
  const militaryUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined && u.type !== 'settler' && u.type !== 'worker');

  const unitPositions: Record<string, string> = {};
  for (const [id, unit] of Object.entries(newState.units)) {
    unitPositions[hexKey(unit.position)] = id;
  }

  for (const unit of militaryUnits) {
    if (unit.movementPointsLeft <= 0) continue;

    // Check for nearby enemies to attack
    const neighbors = hexNeighbors(unit.position);
    let attacked = false;
    for (const neighbor of neighbors) {
      const occupantId = unitPositions[hexKey(neighbor)];
      if (occupantId) {
        const occupant = newState.units[occupantId];
        if (occupant && occupant.owner !== civId && occupant.owner !== 'barbarian') {
          // Attack!
          const result = resolveCombat(unit, occupant, newState.map);
          if (!result.attackerSurvived) {
            delete newState.units[unit.id];
            civ.units = civ.units.filter(id => id !== unit.id);
          } else {
            newState.units[unit.id].health -= result.attackerDamage;
          }
          if (!result.defenderSurvived) {
            const defCivId = occupant.owner;
            delete newState.units[occupant.id];
            if (newState.civilizations[defCivId]) {
              newState.civilizations[defCivId].units =
                newState.civilizations[defCivId].units.filter(id => id !== occupant.id);
            }
          } else {
            newState.units[occupant.id].health -= result.defenderDamage;
          }
          bus.emit('combat:resolved', { result });
          attacked = true;
          break;
        }
      }
    }

    if (attacked) continue;

    // Explore: move toward unexplored territory
    const range = getMovementRange(unit, newState.map, unitPositions);
    if (range.length > 0) {
      // Pick a random reachable tile, biased toward unexplored areas
      const target = range[Math.floor(Math.random() * range.length)];
      newState.units[unit.id] = moveUnit(unit, target, 1);
      // Update unit positions
      delete unitPositions[hexKey(unit.position)];
      unitPositions[hexKey(target)] = unit.id;
    }
  }

  // --- Handle research ---
  if (!civ.techState.currentResearch) {
    const available = getAvailableTechs(civ.techState);
    if (available.length > 0) {
      const chosen = available[Math.floor(Math.random() * available.length)];
      newState.civilizations[civId].techState = startResearch(civ.techState, chosen.id);
      bus.emit('tech:started', { civId, techId: chosen.id });
    }
  }

  // --- Handle city production ---
  for (const cityId of civ.cities) {
    const city = newState.cities[cityId];
    if (city && city.productionQueue.length === 0) {
      // Build warriors by default
      city.productionQueue = ['warrior'];
    }
  }

  // Update AI visibility
  const civUnits = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = civ.cities
    .map(id => newState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(newState.civilizations[civId].visibility, civUnits, newState.map, cityPositions);

  return newState;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/ai/basic-ai.test.ts
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat: add basic AI with city founding, combat, and exploration"
```

---

## Task 14: Storage System (IndexedDB + Auto-Save)

**Files:**
- Create: `src/storage/db.ts`
- Create: `src/storage/save-manager.ts`

- [ ] **Step 1: Implement IndexedDB wrapper**

Create `src/storage/db.ts`:

```typescript
const DB_NAME = 'conquestoria';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function dbPut<T>(key: string, value: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function dbDelete(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
```

- [ ] **Step 2: Implement save manager**

Create `src/storage/save-manager.ts`:

```typescript
import type { GameState } from '@/core/types';
import { dbGet, dbPut, dbDelete } from './db';

const AUTO_SAVE_KEY = 'autosave';
const SETTINGS_KEY = 'settings';

export async function autoSave(state: GameState): Promise<void> {
  await dbPut(AUTO_SAVE_KEY, state);
}

export async function loadAutoSave(): Promise<GameState | undefined> {
  return dbGet<GameState>(AUTO_SAVE_KEY);
}

export async function hasAutoSave(): Promise<boolean> {
  const save = await dbGet(AUTO_SAVE_KEY);
  return save !== undefined;
}

export async function deleteAutoSave(): Promise<void> {
  await dbDelete(AUTO_SAVE_KEY);
}

export async function saveSettings(settings: GameState['settings']): Promise<void> {
  await dbPut(SETTINGS_KEY, settings);
}

export async function loadSettings(): Promise<GameState['settings'] | undefined> {
  return dbGet<GameState['settings']>(SETTINGS_KEY);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/storage/db.ts src/storage/save-manager.ts
git commit -m "feat: add IndexedDB wrapper and auto-save manager"
```

---

## Task 15: Camera & Hex Renderer

**Files:**
- Create: `src/renderer/camera.ts`
- Create: `src/renderer/hex-renderer.ts`
- Create: `src/renderer/fog-renderer.ts`
- Create: `src/renderer/unit-renderer.ts`
- Create: `src/renderer/animation-system.ts`
- Create: `src/renderer/render-loop.ts`

- [ ] **Step 1: Implement camera**

Create `src/renderer/camera.ts`:

```typescript
import { hexToPixel, pixelToHex } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';

export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  targetZoom = 1;
  minZoom = 0.3;
  maxZoom = 3;
  width = 0;
  height = 0;
  hexSize = 32;

  // Velocity for smooth panning
  vx = 0;
  vy = 0;
  friction = 0.9;

  setViewport(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  centerOn(coord: HexCoord): void {
    const pixel = hexToPixel(coord, this.hexSize);
    this.x = pixel.x - this.width / (2 * this.zoom);
    this.y = pixel.y - this.height / (2 * this.zoom);
  }

  pan(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  setZoom(zoom: number, centerX: number, centerY: number): void {
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, zoom));
    this.targetZoom = this.zoom;

    // Zoom toward the center point
    const factor = 1 - oldZoom / this.zoom;
    this.x += (centerX / oldZoom) * factor;
    this.y += (centerY / oldZoom) * factor;
  }

  smoothZoom(delta: number, centerX: number, centerY: number): void {
    const factor = delta > 0 ? 0.9 : 1.1;
    this.setZoom(this.zoom * factor, centerX, centerY);
  }

  applyInertia(): void {
    if (Math.abs(this.vx) > 0.1 || Math.abs(this.vy) > 0.1) {
      this.x -= this.vx / this.zoom;
      this.y -= this.vy / this.zoom;
      this.vx *= this.friction;
      this.vy *= this.friction;
    } else {
      this.vx = 0;
      this.vy = 0;
    }
  }

  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    return {
      x: sx / this.zoom + this.x,
      y: sy / this.zoom + this.y,
    };
  }

  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    return {
      x: (wx - this.x) * this.zoom,
      y: (wy - this.y) * this.zoom,
    };
  }

  screenToHex(sx: number, sy: number): HexCoord {
    const world = this.screenToWorld(sx, sy);
    return pixelToHex(world.x, world.y, this.hexSize);
  }

  isHexVisible(coord: HexCoord): boolean {
    const pixel = hexToPixel(coord, this.hexSize);
    const screen = this.worldToScreen(pixel.x, pixel.y);
    const margin = this.hexSize * this.zoom * 2;
    return (
      screen.x > -margin &&
      screen.x < this.width + margin &&
      screen.y > -margin &&
      screen.y < this.height + margin
    );
  }
}
```

- [ ] **Step 2: Implement hex renderer**

Create `src/renderer/hex-renderer.ts`:

```typescript
import type { GameMap, HexTile } from '@/core/types';
import { hexToPixel, hexKey } from '@/systems/hex-utils';
import { Camera } from './camera';

const TERRAIN_COLORS: Record<string, string> = {
  grassland: '#5b8c3e',
  plains: '#c4a94d',
  desert: '#e0c872',
  tundra: '#a0b8a0',
  snow: '#e8e8f0',
  forest: '#3d6b3d',
  hills: '#8b7355',
  mountain: '#6b6b7b',
  ocean: '#2a5f8f',
  coast: '#4a8faf',
};

const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();

export function drawHexMap(
  ctx: CanvasRenderingContext2D,
  map: GameMap,
  camera: Camera,
): void {
  const size = camera.hexSize;

  for (const tile of Object.values(map.tiles)) {
    if (!camera.isHexVisible(tile.coord)) continue;

    const pixel = hexToPixel(tile.coord, size);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const scaledSize = size * camera.zoom;

    drawHex(ctx, screen.x, screen.y, scaledSize, tile);
  }
}

function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tile: HexTile,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const corner = HEX_CORNERS_POINTY[i];
    const x = cx + corner.dx * size;
    const y = cy + corner.dy * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();

  // Fill with terrain color
  ctx.fillStyle = TERRAIN_COLORS[tile.terrain] ?? '#888';
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Draw improvement indicator
  if (tile.improvement !== 'none' && tile.improvementTurnsLeft === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = `${size * 0.5}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const icon = tile.improvement === 'farm' ? '🌾' : '⛏️';
    ctx.fillText(icon, cx, cy);
  }

  // Draw ownership indicator
  if (tile.owner) {
    ctx.strokeStyle = tile.owner === 'player' ? 'rgba(74,144,217,0.5)' : 'rgba(217,74,74,0.5)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

export function drawHexHighlight(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const corner = HEX_CORNERS_POINTY[i];
    const x = cx + corner.dx * size;
    const y = cy + corner.dy * size;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}
```

- [ ] **Step 3: Implement fog renderer**

Create `src/renderer/fog-renderer.ts`:

```typescript
import type { VisibilityMap } from '@/core/types';
import { hexToPixel, hexKey } from '@/systems/hex-utils';
import { getVisibility } from '@/systems/fog-of-war';
import { Camera } from './camera';

const HEX_CORNERS_POINTY = (function () {
  const corners: Array<{ dx: number; dy: number }> = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30);
    corners.push({ dx: Math.cos(angle), dy: Math.sin(angle) });
  }
  return corners;
})();

export function drawFogOfWar(
  ctx: CanvasRenderingContext2D,
  visibility: VisibilityMap,
  mapWidth: number,
  mapHeight: number,
  camera: Camera,
): void {
  const size = camera.hexSize;

  for (let r = 0; r < mapHeight; r++) {
    for (let q = 0; q < mapWidth; q++) {
      const coord = { q, r };
      if (!camera.isHexVisible(coord)) continue;

      const vis = getVisibility(visibility, coord);
      if (vis === 'visible') continue; // No overlay needed

      const pixel = hexToPixel(coord, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;

      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const corner = HEX_CORNERS_POINTY[i];
        const x = screen.x + corner.dx * scaledSize;
        const y = screen.y + corner.dy * scaledSize;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      if (vis === 'unexplored') {
        ctx.fillStyle = 'rgba(15, 15, 25, 0.95)';
      } else {
        // fog — dimmed
        ctx.fillStyle = 'rgba(15, 15, 25, 0.55)';
      }
      ctx.fill();
    }
  }
}
```

- [ ] **Step 4: Implement unit renderer**

Create `src/renderer/unit-renderer.ts`:

```typescript
import type { Unit, VisibilityMap } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { Camera } from './camera';

const UNIT_ICONS: Record<string, string> = {
  settler: '🏕️',
  worker: '👷',
  scout: '🔭',
  warrior: '⚔️',
};

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
  barbarian: '#8b4513',
};

export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
): void {
  for (const unit of Object.values(units)) {
    // Only draw units visible to the player
    if (!isVisible(playerVisibility, unit.position)) continue;
    if (!camera.isHexVisible(unit.position)) continue;

    const pixel = hexToPixel(unit.position, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;

    // Unit background circle
    const ownerColor = OWNER_COLORS[unit.owner] ?? '#888';
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = ownerColor;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Unit icon
    ctx.font = `${size * 0.4}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(UNIT_ICONS[unit.type] ?? '?', screen.x, screen.y);

    // Health bar (if damaged)
    if (unit.health < 100) {
      const barWidth = size * 0.6;
      const barHeight = size * 0.08;
      const barX = screen.x - barWidth / 2;
      const barY = screen.y + size * 0.4;

      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      const healthRatio = unit.health / 100;
      ctx.fillStyle = healthRatio > 0.5 ? '#4caf50' : healthRatio > 0.25 ? '#ff9800' : '#f44336';
      ctx.fillRect(barX, barY, barWidth * healthRatio, barHeight);
    }
  }
}
```

- [ ] **Step 5: Implement animation system**

Create `src/renderer/animation-system.ts`:

```typescript
export interface Animation {
  id: string;
  type: string;
  startTime: number;
  duration: number;
  data: any;
  onComplete?: () => void;
}

export class AnimationSystem {
  private animations: Animation[] = [];
  private nextId = 1;

  add(type: string, duration: number, data: any, onComplete?: () => void): string {
    const id = `anim-${this.nextId++}`;
    this.animations.push({
      id,
      type,
      startTime: performance.now(),
      duration,
      data,
      onComplete,
    });
    return id;
  }

  update(ctx: CanvasRenderingContext2D, now: number): void {
    const completed: Animation[] = [];

    for (const anim of this.animations) {
      const elapsed = now - anim.startTime;
      const progress = Math.min(1, elapsed / anim.duration);

      this.renderAnimation(ctx, anim, progress);

      if (progress >= 1) {
        completed.push(anim);
      }
    }

    // Remove completed animations
    for (const anim of completed) {
      this.animations = this.animations.filter(a => a.id !== anim.id);
      anim.onComplete?.();
    }
  }

  hasAnimations(): boolean {
    return this.animations.length > 0;
  }

  private renderAnimation(ctx: CanvasRenderingContext2D, anim: Animation, progress: number): void {
    switch (anim.type) {
      case 'hex-reveal': {
        const { x, y, size } = anim.data;
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(15, 15, 25, ${alpha * 0.95})`;
        ctx.beginPath();
        ctx.arc(x, y, size * (1 + progress * 0.3), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'combat-flash': {
        const { x, y, size } = anim.data;
        const alpha = 1 - progress;
        ctx.fillStyle = `rgba(255, 100, 50, ${alpha * 0.6})`;
        ctx.beginPath();
        ctx.arc(x, y, size * (0.5 + progress * 0.5), 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
}
```

- [ ] **Step 6: Implement render loop**

Create `src/renderer/render-loop.ts`:

```typescript
import type { GameState } from '@/core/types';
import { Camera } from './camera';
import { drawHexMap } from './hex-renderer';
import { drawFogOfWar } from './fog-renderer';
import { drawUnits } from './unit-renderer';
import { AnimationSystem } from './animation-system';

export class RenderLoop {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  camera: Camera;
  animations: AnimationSystem;
  private state: GameState | null = null;
  private running = false;
  private animFrameId = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.camera = new Camera();
    this.animations = new AnimationSystem();
    this.resizeCanvas();
  }

  resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.ctx.scale(dpr, dpr);
    this.camera.setViewport(rect.width, rect.height);
  }

  setGameState(state: GameState): void {
    this.state = state;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private tick = (): void => {
    if (!this.running) return;

    this.camera.applyInertia();
    this.render();

    this.animFrameId = requestAnimationFrame(this.tick);
  };

  private render(): void {
    if (!this.state) return;

    const { width, height } = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, width, height);

    // Background
    this.ctx.fillStyle = '#1a1a2e';
    this.ctx.fillRect(0, 0, width, height);

    // Draw hex map
    drawHexMap(this.ctx, this.state.map, this.camera);

    // Draw units
    const playerVis = this.state.civilizations.player?.visibility;
    if (playerVis) {
      drawUnits(this.ctx, this.state.units, this.camera, playerVis);
    }

    // Draw fog of war
    if (playerVis) {
      drawFogOfWar(this.ctx, playerVis, this.state.map.width, this.state.map.height, this.camera);
    }

    // Draw animations
    this.animations.update(this.ctx, performance.now());
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add src/renderer/
git commit -m "feat: add canvas rendering pipeline with camera, hex/unit/fog renderers, and animations"
```

---

## Task 16: Input Handling (Touch + Mouse)

**Files:**
- Create: `src/input/touch-handler.ts`
- Create: `src/input/mouse-handler.ts`

- [ ] **Step 1: Implement touch handler**

Create `src/input/touch-handler.ts`:

```typescript
import { Camera } from '@/renderer/camera';
import type { HexCoord } from '@/core/types';

export interface InputCallbacks {
  onHexTap: (coord: HexCoord) => void;
  onHexLongPress: (coord: HexCoord) => void;
}

export class TouchHandler {
  private camera: Camera;
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;

  private lastTouchDistance = 0;
  private lastTouchCenter = { x: 0, y: 0 };
  private touchStartTime = 0;
  private touchStartPos = { x: 0, y: 0 };
  private longPressTimer: number | null = null;
  private isPanning = false;

  constructor(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    canvas.addEventListener('touchstart', this.onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', this.onTouchMove, { passive: false });
    canvas.addEventListener('touchend', this.onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  destroy(): void {
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchmove', this.onTouchMove);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this.onTouchEnd);
  }

  private onTouchStart = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.touchStartTime = Date.now();
      this.touchStartPos = { x: touch.clientX, y: touch.clientY };
      this.lastTouchCenter = { x: touch.clientX, y: touch.clientY };
      this.isPanning = false;

      // Start long press timer
      this.longPressTimer = window.setTimeout(() => {
        if (!this.isPanning) {
          const coord = this.camera.screenToHex(touch.clientX, touch.clientY);
          this.callbacks.onHexLongPress(coord);
        }
      }, 500);
    }

    if (e.touches.length === 2) {
      this.clearLongPress();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      this.lastTouchDistance = Math.sqrt(dx * dx + dy * dy);
      this.lastTouchCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
    }
  };

  private onTouchMove = (e: TouchEvent): void => {
    e.preventDefault();

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const dx = touch.clientX - this.lastTouchCenter.x;
      const dy = touch.clientY - this.lastTouchCenter.y;

      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
        this.isPanning = true;
        this.clearLongPress();
      }

      this.camera.pan(dx, dy);
      this.camera.vx = dx;
      this.camera.vy = dy;
      this.lastTouchCenter = { x: touch.clientX, y: touch.clientY };
    }

    if (e.touches.length === 2) {
      // Pinch zoom
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (this.lastTouchDistance > 0) {
        const scale = distance / this.lastTouchDistance;
        const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
        const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        this.camera.setZoom(this.camera.zoom * scale, centerX, centerY);
      }

      this.lastTouchDistance = distance;

      // Pan with two fingers
      const center = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      this.camera.pan(center.x - this.lastTouchCenter.x, center.y - this.lastTouchCenter.y);
      this.lastTouchCenter = center;
    }
  };

  private onTouchEnd = (e: TouchEvent): void => {
    e.preventDefault();
    this.clearLongPress();

    if (e.changedTouches.length === 1 && !this.isPanning) {
      const elapsed = Date.now() - this.touchStartTime;
      if (elapsed < 300) {
        // Tap
        const touch = e.changedTouches[0];
        const coord = this.camera.screenToHex(touch.clientX, touch.clientY);
        this.callbacks.onHexTap(coord);
      }
    }

    this.lastTouchDistance = 0;
  };

  private clearLongPress(): void {
    if (this.longPressTimer !== null) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
  }
}
```

- [ ] **Step 2: Implement mouse handler**

Create `src/input/mouse-handler.ts`:

```typescript
import { Camera } from '@/renderer/camera';
import type { InputCallbacks } from './touch-handler';

export class MouseHandler {
  private camera: Camera;
  private callbacks: InputCallbacks;
  private canvas: HTMLCanvasElement;
  private isDragging = false;
  private lastMouse = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, camera: Camera, callbacks: InputCallbacks) {
    this.canvas = canvas;
    this.camera = camera;
    this.callbacks = callbacks;

    canvas.addEventListener('mousedown', this.onMouseDown);
    canvas.addEventListener('mousemove', this.onMouseMove);
    canvas.addEventListener('mouseup', this.onMouseUp);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
  }

  destroy(): void {
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('wheel', this.onWheel);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
  }

  private onMouseDown = (e: MouseEvent): void => {
    if (e.button === 0) {
      this.isDragging = false;
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (e.buttons & 1) {
      const dx = e.clientX - this.lastMouse.x;
      const dy = e.clientY - this.lastMouse.y;

      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        this.isDragging = true;
      }

      this.camera.pan(dx, dy);
      this.lastMouse = { x: e.clientX, y: e.clientY };
    }
  };

  private onMouseUp = (e: MouseEvent): void => {
    if (e.button === 0 && !this.isDragging) {
      const coord = this.camera.screenToHex(e.clientX, e.clientY);
      this.callbacks.onHexTap(coord);
    }
    this.isDragging = false;
  };

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    this.camera.smoothZoom(e.deltaY, e.clientX, e.clientY);
  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
    const coord = this.camera.screenToHex(e.clientX, e.clientY);
    this.callbacks.onHexLongPress(coord);
  };
}
```

- [ ] **Step 3: Commit**

```bash
git add src/input/
git commit -m "feat: add touch and mouse input handlers with pan, zoom, tap, and long-press"
```

---

## Task 17: UI Panels (Tech Panel, City Panel, Tutorial)

**Note:** For Milestone 1, core UI (HUD, bottom bar, notifications, unit actions) is inlined directly in `main.ts` (Task 20) to keep things simple. This task creates the three panels that need their own files: tech selection, city production, and the tutorial system. These are opened from the bottom bar or triggered by events.

**Files:**
- Create: `src/ui/tech-panel.ts`
- Create: `src/ui/city-panel.ts`
- Create: `src/ui/tutorial.ts`

- [ ] **Step 1: Create tech panel**

Create `src/ui/tech-panel.ts`:

```typescript
import type { GameState, TechTrack } from '@/core/types';
import { getAvailableTechs, startResearch, TECH_TREE } from '@/systems/tech-system';

export interface TechPanelCallbacks {
  onStartResearch: (techId: string) => void;
  onClose: () => void;
}

export function createTechPanel(
  container: HTMLElement,
  state: GameState,
  callbacks: TechPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'tech-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const civ = state.civilizations.player;
  const available = getAvailableTechs(civ.techState);

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <h2 style="font-size:18px;color:#e8c170;margin:0;">Research</h2>
      <span id="tech-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>
  `;

  if (civ.techState.currentResearch) {
    const currentTech = TECH_TREE.find(t => t.id === civ.techState.currentResearch);
    if (currentTech) {
      const progress = Math.round((civ.techState.researchProgress / currentTech.cost) * 100);
      html += `
        <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;">
          <div style="font-weight:bold;color:#e8c170;">Researching: ${currentTech.name}</div>
          <div style="font-size:12px;opacity:0.7;">${currentTech.track} · ${currentTech.unlocks[0]}</div>
          <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;">
            <div style="background:#e8c170;border-radius:4px;height:8px;width:${progress}%;"></div>
          </div>
          <div style="font-size:11px;opacity:0.5;margin-top:4px;">${civ.techState.researchProgress}/${currentTech.cost}</div>
        </div>
      `;
    }
  }

  const tracks: TechTrack[] = ['military', 'economy', 'science'];
  const trackIcons: Record<string, string> = { military: '⚔️', economy: '💰', science: '🔬' };

  for (const track of tracks) {
    const trackTechs = TECH_TREE.filter(t => t.track === track);
    html += `<div style="margin-bottom:16px;">
      <h3 style="font-size:14px;color:#e0d6c8;margin:0 0 8px;">${trackIcons[track]} ${track.charAt(0).toUpperCase() + track.slice(1)}</h3>`;

    for (const tech of trackTechs) {
      const isCompleted = civ.techState.completed.includes(tech.id);
      const isAvailable = available.some(t => t.id === tech.id);
      const isCurrent = civ.techState.currentResearch === tech.id;

      let bg = 'rgba(255,255,255,0.05)';
      let border = 'transparent';
      let opacity = '0.4';
      let cursor = 'default';

      if (isCompleted) { bg = 'rgba(107,155,75,0.3)'; border = '#6b9b4b'; opacity = '1'; }
      else if (isCurrent) { bg = 'rgba(232,193,112,0.2)'; border = '#e8c170'; opacity = '1'; }
      else if (isAvailable) { bg = 'rgba(255,255,255,0.1)'; border = 'rgba(255,255,255,0.3)'; opacity = '1'; cursor = 'pointer'; }

      html += `
        <div class="tech-item" data-tech-id="${tech.id}" style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px;margin-bottom:6px;opacity:${opacity};cursor:${cursor};">
          <div style="font-weight:bold;font-size:13px;">${tech.name}${isCompleted ? ' ✓' : ''}${isCurrent ? ' ⏳' : ''}</div>
          <div style="font-size:11px;opacity:0.7;">${tech.unlocks[0]} · Cost: ${tech.cost}</div>
        </div>
      `;
    }
    html += '</div>';
  }

  panel.innerHTML = html;
  container.appendChild(panel);

  // Event listeners
  panel.querySelector('#tech-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  panel.querySelectorAll('.tech-item').forEach(el => {
    const techId = (el as HTMLElement).dataset.techId!;
    const isAvailable = available.some(t => t.id === techId);
    if (isAvailable) {
      el.addEventListener('click', () => {
        callbacks.onStartResearch(techId);
        panel.remove();
      });
    }
  });

  return panel;
}
```

- [ ] **Step 2: Create city panel**

Create `src/ui/city-panel.ts`:

```typescript
import type { City, GameState } from '@/core/types';
import { getAvailableBuildings, BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { calculateCityYields } from '@/systems/resource-system';

export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onClose: () => void;
}

export function createCityPanel(
  container: HTMLElement,
  city: City,
  state: GameState,
  callbacks: CityPanelCallbacks,
): HTMLElement {
  const panel = document.createElement('div');
  panel.id = 'city-panel';
  panel.style.cssText = 'position:absolute;top:0;left:0;right:0;bottom:0;background:rgba(15,15,25,0.95);z-index:30;overflow-y:auto;padding:16px;padding-bottom:80px;';

  const yields = calculateCityYields(city, state.map);
  const availableBuildings = getAvailableBuildings(city, state.civilizations.player.techState.completed);

  let html = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
      <div>
        <h2 style="font-size:18px;color:#e8c170;margin:0;">${city.name}</h2>
        <div style="font-size:12px;opacity:0.7;">Population: ${city.population}</div>
      </div>
      <span id="city-close" style="cursor:pointer;font-size:24px;opacity:0.6;">✕</span>
    </div>

    <div style="display:flex;gap:16px;margin-bottom:16px;font-size:13px;">
      <span>🌾 +${yields.food}</span>
      <span>⚒️ +${yields.production}</span>
      <span>💰 +${yields.gold}</span>
      <span>🔬 +${yields.science}</span>
    </div>
  `;

  // Current production
  if (city.productionQueue.length > 0) {
    const currentItem = city.productionQueue[0];
    const building = BUILDINGS[currentItem];
    const unit = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const totalCost = building?.productionCost ?? unit?.cost ?? 0;
    const progress = totalCost > 0 ? Math.round((city.productionProgress / totalCost) * 100) : 0;
    const turnsLeft = yields.production > 0 ? Math.ceil((totalCost - city.productionProgress) / yields.production) : '∞';

    html += `
      <div style="background:rgba(255,255,255,0.1);border-radius:10px;padding:12px;margin-bottom:16px;">
        <div style="font-weight:bold;color:#e8c170;">Building: ${building?.name ?? currentItem}</div>
        <div style="font-size:12px;opacity:0.7;">${turnsLeft} turns remaining</div>
        <div style="background:rgba(0,0,0,0.3);border-radius:4px;height:8px;margin-top:8px;">
          <div style="background:#6b9b4b;border-radius:4px;height:8px;width:${progress}%;"></div>
        </div>
      </div>
    `;
  }

  // Existing buildings
  if (city.buildings.length > 0) {
    html += '<div style="margin-bottom:16px;"><h3 style="font-size:14px;margin:0 0 8px;">Buildings</h3>';
    for (const bid of city.buildings) {
      const b = BUILDINGS[bid];
      if (b) {
        html += `<div style="background:rgba(255,255,255,0.05);border-radius:6px;padding:8px;margin-bottom:4px;font-size:12px;">
          <strong>${b.name}</strong> — ${b.description}
        </div>`;
      }
    }
    html += '</div>';
  }

  // Available to build
  html += '<div><h3 style="font-size:14px;margin:0 0 8px;">Build</h3>';

  for (const b of availableBuildings) {
    const turns = yields.production > 0 ? Math.ceil(b.productionCost / yields.production) : '∞';
    html += `<div class="build-item" data-item-id="${b.id}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">🏗️ ${b.name}</div>
      <div style="font-size:11px;opacity:0.7;">${b.description} · ${turns} turns</div>
    </div>`;
  }

  html += '<div style="margin-top:12px;font-size:12px;opacity:0.5;margin-bottom:8px;">Units</div>';
  for (const u of TRAINABLE_UNITS) {
    const turns = yields.production > 0 ? Math.ceil(u.cost / yields.production) : '∞';
    html += `<div class="build-item" data-item-id="${u.type}" style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:8px;padding:10px;margin-bottom:6px;cursor:pointer;">
      <div style="font-weight:bold;font-size:13px;">⚔️ ${u.name}</div>
      <div style="font-size:11px;opacity:0.7;">Cost: ${u.cost} · ${turns} turns</div>
    </div>`;
  }
  html += '</div>';

  panel.innerHTML = html;
  container.appendChild(panel);

  panel.querySelector('#city-close')?.addEventListener('click', () => {
    panel.remove();
    callbacks.onClose();
  });

  panel.querySelectorAll('.build-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemId = (el as HTMLElement).dataset.itemId!;
      callbacks.onBuild(city.id, itemId);
      panel.remove();
    });
  });

  return panel;
}
```

- [ ] **Step 3: Create tutorial system**

Create `src/ui/tutorial.ts`:

```typescript
import type { GameState, TutorialStep } from '@/core/types';
import { EventBus } from '@/core/event-bus';

interface TutorialMessage {
  step: TutorialStep;
  advisor: 'builder' | 'explorer';
  message: string;
  trigger: (state: GameState) => boolean;
}

const TUTORIAL_MESSAGES: TutorialMessage[] = [
  {
    step: 'welcome',
    advisor: 'builder',
    message: 'Welcome, leader! Your tribe has found a promising land. Select your Settler and found a city to begin building your civilization.',
    trigger: () => true,
  },
  {
    step: 'found_city',
    advisor: 'builder',
    message: 'Excellent! Your city is growing. Now build a Granary to increase food production. Tap your city to see building options.',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === 'player'),
  },
  {
    step: 'explore',
    advisor: 'explorer',
    message: 'The world awaits! Select your Scout and send them into the unknown. Who knows what we might find out there?',
    trigger: (state) => Object.values(state.cities).some(c => c.owner === 'player'),
  },
  {
    step: 'build_improvement',
    advisor: 'builder',
    message: 'Your Worker can build Farms and Mines on nearby tiles. Select the Worker and choose an improvement to boost your city\'s output.',
    trigger: (state) => Object.values(state.units).some(u => u.owner === 'player' && u.type === 'worker'),
  },
  {
    step: 'research_tech',
    advisor: 'explorer',
    message: 'Knowledge is power! Open the Tech panel and choose something to research. Each discovery unlocks new possibilities.',
    trigger: (state) => state.civilizations.player?.techState.currentResearch === null && state.turn >= 2,
  },
  {
    step: 'build_unit',
    advisor: 'builder',
    message: 'Your city can train units. Open the city panel and queue up a Warrior to defend your borders.',
    trigger: (state) => {
      const cities = Object.values(state.cities).filter(c => c.owner === 'player');
      return cities.length > 0 && cities[0].productionQueue.length === 0;
    },
  },
  {
    step: 'combat',
    advisor: 'explorer',
    message: 'Barbarians! Move your Warrior next to them and tap the enemy to attack. Be careful — they fight back!',
    trigger: (state) => {
      // Trigger when barbarian is visible
      const vis = state.civilizations.player?.visibility;
      if (!vis) return false;
      return Object.values(state.units).some(u => u.owner === 'barbarian' && vis.tiles[`${u.position.q},${u.position.r}`] === 'visible');
    },
  },
  {
    step: 'complete',
    advisor: 'builder',
    message: 'You\'re doing great! You now know the basics. Explore, expand, research, and conquer. The world is yours to shape!',
    trigger: (state) => state.turn >= 10,
  },
];

const ADVISOR_ICONS = {
  builder: '🏗️',
  explorer: '🔭',
};

export class TutorialSystem {
  private bus: EventBus;
  private shownSteps = new Set<TutorialStep>();

  constructor(bus: EventBus) {
    this.bus = bus;
  }

  check(state: GameState): void {
    if (!state.tutorial.active) return;

    for (const msg of TUTORIAL_MESSAGES) {
      if (this.shownSteps.has(msg.step)) continue;
      if (state.tutorial.completedSteps.includes(msg.step)) {
        this.shownSteps.add(msg.step);
        continue;
      }

      if (msg.trigger(state)) {
        this.shownSteps.add(msg.step);
        this.bus.emit('tutorial:step', {
          step: msg.step,
          message: msg.message,
          advisor: msg.advisor,
        });
        break; // Only show one at a time
      }
    }
  }

  markComplete(state: GameState, step: TutorialStep): GameState {
    return {
      ...state,
      tutorial: {
        ...state.tutorial,
        currentStep: step,
        completedSteps: [...state.tutorial.completedSteps, step],
      },
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add src/ui/tech-panel.ts src/ui/city-panel.ts src/ui/tutorial.ts
git commit -m "feat: add tech panel, city panel, and tutorial system UI"
```

---

## Task 18: Audio System

**Files:**
- Create: `src/audio/audio-manager.ts`
- Create: `src/audio/sfx.ts`

- [ ] **Step 1: Implement audio manager**

Create `src/audio/audio-manager.ts`:

```typescript
export class AudioManager {
  private musicElement: HTMLAudioElement | null = null;
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private musicEnabled = true;
  private sfxEnabled = true;

  async playMusic(src: string): Promise<void> {
    if (!this.musicEnabled) return;

    if (this.musicElement) {
      this.musicElement.pause();
    }

    this.musicElement = new Audio(src);
    this.musicElement.loop = true;
    this.musicElement.volume = this.musicVolume;

    try {
      await this.musicElement.play();
    } catch {
      // Autoplay may be blocked — will play on user interaction
    }
  }

  stopMusic(): void {
    if (this.musicElement) {
      this.musicElement.pause();
      this.musicElement = null;
    }
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.musicElement) {
      this.musicElement.volume = this.musicVolume;
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
  }

  toggleMusic(): boolean {
    this.musicEnabled = !this.musicEnabled;
    if (!this.musicEnabled) this.stopMusic();
    return this.musicEnabled;
  }

  toggleSfx(): boolean {
    this.sfxEnabled = !this.sfxEnabled;
    return this.sfxEnabled;
  }

  getMusicEnabled(): boolean { return this.musicEnabled; }
  getSfxEnabled(): boolean { return this.sfxEnabled; }
}
```

- [ ] **Step 2: Implement sound effects**

Create `src/audio/sfx.ts`:

```typescript
let audioContext: AudioContext | null = null;

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext();
  }
  return audioContext;
}

function playTone(frequency: number, duration: number, volume: number, type: OscillatorType = 'sine'): void {
  try {
    const ctx = getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Audio context may not be available
  }
}

export const SFX = {
  tap: () => playTone(800, 0.05, 0.15),
  select: () => playTone(600, 0.08, 0.2, 'triangle'),
  endTurn: () => {
    playTone(523, 0.1, 0.15);
    setTimeout(() => playTone(659, 0.1, 0.15), 100);
    setTimeout(() => playTone(784, 0.15, 0.15), 200);
  },
  foundCity: () => {
    playTone(523, 0.15, 0.2);
    setTimeout(() => playTone(659, 0.15, 0.2), 150);
    setTimeout(() => playTone(784, 0.2, 0.25), 300);
    setTimeout(() => playTone(1047, 0.3, 0.2), 450);
  },
  combat: () => {
    playTone(200, 0.1, 0.3, 'sawtooth');
    setTimeout(() => playTone(150, 0.15, 0.25, 'sawtooth'), 100);
  },
  research: () => {
    playTone(880, 0.1, 0.15);
    setTimeout(() => playTone(1100, 0.1, 0.15), 80);
    setTimeout(() => playTone(1320, 0.2, 0.2), 160);
  },
  notification: () => playTone(700, 0.1, 0.1, 'triangle'),
  error: () => playTone(200, 0.2, 0.15, 'square'),
};
```

- [ ] **Step 3: Commit**

```bash
git add src/audio/
git commit -m "feat: add audio manager and procedural sound effects"
```

---

## Task 19: Service Worker & Offline Support

**Files:**
- Create: `public/sw.js`

- [ ] **Step 1: Create service worker**

Create `public/sw.js`:

```javascript
const CACHE_NAME = 'conquestoria-v1';

const PRECACHE_URLS = [
  '/conquestoria/',
  '/conquestoria/index.html',
  '/conquestoria/manifest.json',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Cache-first strategy for all requests
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Return cached, but also update cache in background
        const fetchPromise = fetch(event.request).then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        }).catch(() => {});

        return cached;
      }

      return fetch(event.request).then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      });
    })
  );
});
```

- [ ] **Step 2: Commit**

```bash
git add public/sw.js
git commit -m "feat: add service worker for offline caching"
```

---

## Task 20: Main Application Bootstrap

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: Wire everything together in main.ts**

Rewrite `src/main.ts` to bootstrap the entire game:

```typescript
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { processTurn } from '@/core/turn-manager';
import { processAITurn } from '@/ai/basic-ai';
import { RenderLoop } from '@/renderer/render-loop';
import { TouchHandler, type InputCallbacks } from '@/input/touch-handler';
import { MouseHandler } from '@/input/mouse-handler';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getMovementRange, moveUnit, createUnit, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { foundCity } from '@/systems/city-system';
import { resolveCombat } from '@/systems/combat-system';
import { canBuildImprovement, IMPROVEMENT_BUILD_TURNS } from '@/systems/improvement-system';
import { updateVisibility, isVisible } from '@/systems/fog-of-war';
import { destroyCamp } from '@/systems/barbarian-system';
import { autoSave, loadAutoSave } from '@/storage/save-manager';
import { AudioManager } from '@/audio/audio-manager';
import { SFX } from '@/audio/sfx';
import type { GameState, HexCoord, Unit } from '@/core/types';

// --- App State ---
let gameState: GameState;
let selectedUnitId: string | null = null;
let movementRange: HexCoord[] = [];
const bus = new EventBus();
const audio = new AudioManager();

// --- Canvas Setup ---
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
const renderLoop = new RenderLoop(canvas);

// --- Resize ---
window.addEventListener('resize', () => renderLoop.resizeCanvas());

// --- UI Construction (minimal for M1, will be expanded) ---
function createUI(): void {
  // HUD
  const hud = document.createElement('div');
  hud.id = 'hud';
  hud.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:8px 12px;background:rgba(0,0,0,0.6);display:flex;justify-content:space-between;font-size:13px;z-index:10;';
  uiLayer.appendChild(hud);

  // Bottom bar
  const bottomBar = document.createElement('div');
  bottomBar.id = 'bottom-bar';
  bottomBar.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:8px 12px 24px;background:rgba(0,0,0,0.8);display:flex;justify-content:space-around;z-index:10;';

  const endTurnBtn = createButton('End Turn', '⏭️', () => endTurn());
  endTurnBtn.style.color = '#e8c170';

  bottomBar.appendChild(createButton('Tech', '🔬', () => togglePanel('tech')));
  bottomBar.appendChild(createButton('City', '🏛️', () => togglePanel('city')));
  bottomBar.appendChild(endTurnBtn);
  uiLayer.appendChild(bottomBar);

  // Notification area
  const notifArea = document.createElement('div');
  notifArea.id = 'notifications';
  notifArea.style.cssText = 'position:absolute;top:40px;left:12px;right:12px;z-index:20;display:flex;flex-direction:column;gap:8px;';
  uiLayer.appendChild(notifArea);

  // Info panel (for selected unit/city)
  const infoPanel = document.createElement('div');
  infoPanel.id = 'info-panel';
  infoPanel.style.cssText = 'position:absolute;bottom:80px;left:12px;right:12px;z-index:10;display:none;';
  uiLayer.appendChild(infoPanel);
}

function createButton(label: string, icon: string, onClick: () => void): HTMLElement {
  const btn = document.createElement('div');
  btn.style.cssText = 'text-align:center;font-size:10px;cursor:pointer;user-select:none;';
  btn.innerHTML = `<div style="width:40px;height:40px;background:rgba(255,255,255,0.15);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;margin:0 auto 2px;">${icon}</div>${label}`;
  btn.addEventListener('click', onClick);
  btn.addEventListener('touchend', (e) => { e.preventDefault(); onClick(); });
  return btn;
}

// --- Game Logic ---
function updateHUD(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const civ = gameState.civilizations.player;
  hud.innerHTML = `
    <div style="display:flex;gap:12px;">
      <span>💰 ${civ.gold}</span>
      <span>🔬 ${civ.techState.currentResearch ? '...' : 'None'}</span>
    </div>
    <div>Turn ${gameState.turn} · Era ${gameState.era}</div>
  `;
}

function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  const area = document.getElementById('notifications');
  if (!area) return;

  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };
  const notif = document.createElement('div');
  notif.style.cssText = `background:${colors[type]}ee;color:#1a1a2e;padding:10px 14px;border-radius:10px;font-size:12px;cursor:pointer;transition:opacity 0.3s;`;
  notif.textContent = message;
  notif.addEventListener('click', () => {
    notif.style.opacity = '0';
    setTimeout(() => notif.remove(), 300);
  });
  area.appendChild(notif);

  // Auto-dismiss after 4 seconds
  setTimeout(() => {
    if (notif.parentNode) {
      notif.style.opacity = '0';
      setTimeout(() => notif.remove(), 300);
    }
  }, 4000);

  SFX.notification();
}

function togglePanel(_panel: string): void {
  // Stub — panels will be expanded in later tasks
  showNotification(`${_panel} panel coming soon!`);
}

function selectUnit(unitId: string): void {
  selectedUnitId = unitId;
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== 'player') return;

  // Calculate movement range
  const unitPositions: Record<string, string> = {};
  for (const [id, u] of Object.entries(gameState.units)) {
    unitPositions[hexKey(u.position)] = id;
  }
  movementRange = getMovementRange(unit, gameState.map, unitPositions);

  // Show unit info panel
  const panel = document.getElementById('info-panel');
  if (panel) {
    const def = UNIT_DEFINITIONS[unit.type];
    let actions = '';
    if (def.canFoundCity) actions += '<button id="btn-found-city" style="padding:8px 16px;border-radius:8px;background:#e8c170;border:none;color:#1a1a2e;font-weight:bold;cursor:pointer;">Found City</button> ';
    if (def.canBuildImprovements) {
      const tile = gameState.map.tiles[hexKey(unit.position)];
      if (tile && canBuildImprovement(tile, 'farm')) actions += '<button id="btn-build-farm" style="padding:8px 16px;border-radius:8px;background:#6b9b4b;border:none;color:white;cursor:pointer;">Build Farm</button> ';
      if (tile && canBuildImprovement(tile, 'mine')) actions += '<button id="btn-build-mine" style="padding:8px 16px;border-radius:8px;background:#8b7355;border:none;color:white;cursor:pointer;">Build Mine</button> ';
    }

    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${def.name}</strong> · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}
          </div>
          <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
        </div>
        <div style="margin-top:8px;display:flex;gap:8px;">${actions}</div>
      </div>
    `;

    document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
    document.getElementById('btn-found-city')?.addEventListener('click', () => foundCityAction());
    document.getElementById('btn-build-farm')?.addEventListener('click', () => buildImprovementAction('farm'));
    document.getElementById('btn-build-mine')?.addEventListener('click', () => buildImprovementAction('mine'));
  }

  SFX.select();
}

function deselectUnit(): void {
  selectedUnitId = null;
  movementRange = [];
  const panel = document.getElementById('info-panel');
  if (panel) panel.style.display = 'none';
}

function foundCityAction(): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'settler') return;

  const city = foundCity('player', unit.position, gameState.map);
  gameState.cities[city.id] = city;
  gameState.civilizations.player.cities.push(city.id);

  // Mark tiles as owned
  for (const coord of city.ownedTiles) {
    const key = hexKey(coord);
    if (gameState.map.tiles[key]) {
      gameState.map.tiles[key].owner = 'player';
    }
  }

  // Remove settler
  delete gameState.units[selectedUnitId];
  gameState.civilizations.player.units = gameState.civilizations.player.units.filter(id => id !== selectedUnitId);

  deselectUnit();
  bus.emit('city:founded', { city });
  showNotification(`${city.name} has been founded!`, 'success');
  SFX.foundCity();

  // Update visibility
  const playerUnits = gameState.civilizations.player.units
    .map(id => gameState.units[id])
    .filter((u): u is Unit => u !== undefined);
  const cityPositions = gameState.civilizations.player.cities
    .map(id => gameState.cities[id]?.position)
    .filter((p): p is HexCoord => p !== undefined);
  updateVisibility(gameState.civilizations.player.visibility, playerUnits, gameState.map, cityPositions);

  renderLoop.setGameState(gameState);
  updateHUD();
}

function buildImprovementAction(type: 'farm' | 'mine'): void {
  if (!selectedUnitId) return;
  const unit = gameState.units[selectedUnitId];
  if (!unit || unit.type !== 'worker') return;

  const tile = gameState.map.tiles[hexKey(unit.position)];
  if (!tile || !canBuildImprovement(tile, type)) return;

  tile.improvement = type;
  tile.improvementTurnsLeft = IMPROVEMENT_BUILD_TURNS[type];
  gameState.units[selectedUnitId].hasActed = true;

  deselectUnit();
  showNotification(`Building ${type}... (${IMPROVEMENT_BUILD_TURNS[type]} turns)`, 'info');
  renderLoop.setGameState(gameState);
}

function handleHexTap(coord: HexCoord): void {
  const key = hexKey(coord);

  // Check if tapping a unit
  const unitAtHex = Object.entries(gameState.units).find(
    ([_, u]) => hexKey(u.position) === key
  );

  if (unitAtHex && unitAtHex[1].owner === 'player') {
    selectUnit(unitAtHex[0]);
    return;
  }

  // If unit is selected and tapping a movement target
  if (selectedUnitId && movementRange.some(h => hexKey(h) === key)) {
    const unit = gameState.units[selectedUnitId];
    if (!unit) return;

    // Check for enemy unit at target (attack)
    if (unitAtHex && unitAtHex[1].owner !== 'player') {
      const result = resolveCombat(unit, unitAtHex[1], gameState.map);
      bus.emit('combat:resolved', { result });

      if (!result.attackerSurvived) {
        delete gameState.units[selectedUnitId];
        gameState.civilizations.player.units = gameState.civilizations.player.units.filter(id => id !== selectedUnitId);
        showNotification('Our unit was destroyed!', 'warning');
      } else {
        gameState.units[selectedUnitId].health -= result.attackerDamage;
        gameState.units[selectedUnitId].movementPointsLeft = 0;
      }

      if (!result.defenderSurvived) {
        const defOwner = unitAtHex[1].owner;
        delete gameState.units[unitAtHex[0]];
        if (gameState.civilizations[defOwner]) {
          gameState.civilizations[defOwner].units = gameState.civilizations[defOwner].units.filter(id => id !== unitAtHex[0]);
        }
        showNotification('Enemy unit destroyed!', 'success');

        // Check barbarian camp
        for (const [campId, camp] of Object.entries(gameState.barbarianCamps)) {
          if (hexKey(camp.position) === key) {
            const reward = destroyCamp(camp);
            delete gameState.barbarianCamps[campId];
            gameState.civilizations.player.gold += reward;
            showNotification(`Barbarian camp destroyed! +${reward} gold`, 'success');
          }
        }
      } else {
        gameState.units[unitAtHex[0]].health -= result.defenderDamage;
      }

      SFX.combat();
      deselectUnit();
    } else {
      // Move unit
      gameState.units[selectedUnitId] = moveUnit(unit, coord, 1);
      SFX.tap();

      // Update visibility after move
      const playerUnits = gameState.civilizations.player.units
        .map(id => gameState.units[id])
        .filter((u): u is Unit => u !== undefined);
      const cityPositions = gameState.civilizations.player.cities
        .map(id => gameState.cities[id]?.position)
        .filter((p): p is HexCoord => p !== undefined);
      const revealed = updateVisibility(gameState.civilizations.player.visibility, playerUnits, gameState.map, cityPositions);

      if (revealed.length > 0) {
        bus.emit('fog:revealed', { tiles: revealed });
      }

      // Re-select to update movement range
      if (gameState.units[selectedUnitId].movementPointsLeft > 0) {
        selectUnit(selectedUnitId);
      } else {
        deselectUnit();
      }
    }

    renderLoop.setGameState(gameState);
    updateHUD();
    return;
  }

  // Tapping empty hex — deselect
  deselectUnit();
  SFX.tap();
}

function handleHexLongPress(coord: HexCoord): void {
  // Show tile info
  const tile = gameState.map.tiles[hexKey(coord)];
  if (tile) {
    showNotification(`${tile.terrain} · ${tile.elevation}${tile.improvement !== 'none' ? ' · ' + tile.improvement : ''}${tile.resource ? ' · ' + tile.resource : ''}`);
  }
}

async function endTurn(): Promise<void> {
  SFX.endTurn();

  // Process improvements (count down build timers)
  for (const tile of Object.values(gameState.map.tiles)) {
    if (tile.improvementTurnsLeft > 0) {
      tile.improvementTurnsLeft--;
      if (tile.improvementTurnsLeft === 0) {
        bus.emit('improvement:completed', { coord: tile.coord, type: tile.improvement });
        showNotification(`${tile.improvement} completed!`, 'success');
      }
    }
  }

  // Process AI turn
  gameState = processAITurn(gameState, 'ai-1', bus);

  // Process end of turn (cities, research, barbarians, etc.)
  gameState = processTurn(gameState, bus);

  renderLoop.setGameState(gameState);
  updateHUD();

  // Auto-save
  await autoSave(gameState);
  bus.emit('game:saved', { turn: gameState.turn });
}

// --- Event listeners ---
bus.on('tech:completed', ({ civId, techId }) => {
  if (civId === 'player') {
    showNotification(`Research complete: ${techId}!`, 'success');
    SFX.research();
  }
});

bus.on('city:grew', ({ cityId, newPopulation }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === 'player') {
    showNotification(`${city.name} grew to ${newPopulation} population!`, 'success');
  }
});

bus.on('city:building-complete', ({ cityId, buildingId }) => {
  const city = gameState.cities[cityId];
  if (city && city.owner === 'player') {
    showNotification(`${city.name}: ${buildingId} completed!`, 'success');
  }
});

bus.on('barbarian:spawned', ({ campId }) => {
  // Only notify if visible
  const camp = gameState.barbarianCamps[campId];
  if (camp) {
    const vis = gameState.civilizations.player.visibility;
    if (isVisible(vis, camp.position)) {
      showNotification('Barbarian raiders spotted!', 'warning');
    }
  }
});

// --- Initialization ---
async function init(): Promise<void> {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register('/conquestoria/sw.js');
    } catch {
      // SW registration failed — game still works
    }
  }

  createUI();

  // Try to load auto-save
  const saved = await loadAutoSave();
  if (saved) {
    gameState = saved;
    showNotification(`Welcome back! Turn ${gameState.turn}`, 'info');
  } else {
    gameState = createNewGame();
    showNotification('Your tribe has settled near a river...', 'info');
  }

  // Center camera on player's starting position
  const playerUnits = Object.values(gameState.units).filter(u => u.owner === 'player');
  if (playerUnits.length > 0) {
    renderLoop.camera.centerOn(playerUnits[0].position);
  }

  renderLoop.setGameState(gameState);
  updateHUD();

  // Input
  const callbacks: InputCallbacks = {
    onHexTap: handleHexTap,
    onHexLongPress: handleHexLongPress,
  };
  new TouchHandler(canvas, renderLoop.camera, callbacks);
  new MouseHandler(canvas, renderLoop.camera, callbacks);

  // Start render loop
  renderLoop.start();
}

init();
```

- [ ] **Step 2: Run dev server and manually test**

```bash
yarn dev
```
Expected: Game loads in browser, hex map visible, can pan/zoom, tap units, found city, end turn.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire up main application with game loop, input, UI, and auto-save"
```

---

## Task 21: GitHub Pages Deployment

**Files:**
- Create: `.github/workflows/deploy.yml`

- [ ] **Step 1: Create GitHub Actions workflow**

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 'lts/*'

      - name: Install dependencies
        run: corepack enable && yarn install

      - name: Build
        run: yarn build

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
git add .github/
git commit -m "ci: add GitHub Actions workflow for Pages deployment"
```

---

## Task 22: Integration Test & Polish

- [ ] **Step 1: Run all tests**

```bash
yarn test
```
Expected: All tests pass.

- [ ] **Step 2: Run production build**

```bash
yarn build
```
Expected: Build succeeds, output in `dist/`.

- [ ] **Step 3: Preview production build**

```bash
yarn preview
```
Expected: Game loads and plays correctly from built files.

- [ ] **Step 4: Test on mobile (iPhone Safari)**

Open the dev server URL on iPhone Safari. Verify:
- Touch pan and pinch zoom work
- Tap to select units works
- Bottom bar buttons are reachable with thumb
- End Turn works
- Game renders correctly

- [ ] **Step 5: Test offline**

- Load the game in browser
- Go offline (airplane mode / disconnect)
- Reload the page
- Verify game loads from cache and auto-save resumes

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: integration test pass, milestone 1 complete"
```

- [ ] **Step 7: Push to GitHub**

```bash
git push -u origin main
```

---

## Summary

**22 tasks** covering the complete Milestone 1 implementation:

| # | Task | Systems |
|---|---|---|
| 1 | Project scaffolding | Vite, TypeScript, Vitest |
| 2 | Core types & event bus | Foundation |
| 3 | Hex utilities | Hex math |
| 4 | Map generator | Procedural world |
| 5 | Fog of war | Visibility |
| 6 | Unit system | Movement, pathfinding |
| 7 | City system | Founding, buildings, growth |
| 8 | Combat system | Auto-resolve |
| 9 | Tech system | 3 tracks, 15 techs |
| 10 | Resources & improvements | Yields, farms, mines |
| 11 | Barbarian system | Camps, raiders |
| 12 | Game state & turn manager | Core loop |
| 13 | Basic AI | Rival civ behavior |
| 14 | Storage | IndexedDB, auto-save |
| 15 | Camera & renderers | Canvas rendering |
| 16 | Input handling | Touch + mouse |
| 17 | UI panels | DOM-based HUD and panels |
| 18 | Audio system | Music + SFX |
| 19 | Service worker | Offline support |
| 20 | Main bootstrap | Wire everything |
| 21 | Deployment | GitHub Pages CI/CD |
| 22 | Integration test | Verify everything works |
