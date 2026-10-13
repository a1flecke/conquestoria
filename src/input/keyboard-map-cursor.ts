/**
 * Keyboard access to the hex map (#1459).
 *
 * The map is a canvas, so there is nothing per-tile to Tab to. Instead a single
 * keyboard cursor walks the grid: the six arrow combinations step to a
 * neighbour, Enter or Space activates the tile through the exact same tap path
 * a pointer uses (so select, move, attack, resolve-pending and every legality
 * check are shared, not re-implemented), and Escape hides the cursor.
 *
 * Arrow mapping on the pointy-top grid:
 *   Left/Right = west/east, Up/Down = north-east/south-west,
 *   Shift+Up/Down = north-west/south-east.
 *
 * Every step is announced through a polite live region. What is announced comes
 * only from the viewer's own visibility (live tile, last-seen snapshot, or
 * "unexplored"), so in hot-seat the cursor can never describe another player's
 * hidden units; `isInteractionBlocked` (handoff, ceremonies) hides the cursor
 * and ignores the keys.
 */
import type { GameMap, GameState, HexCoord } from '@/core/types';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';
import { hexKey, wrapHexCoord } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { visibleUnitEntriesAtKey } from '@/input/hex-defender-selection';

const STEPS: Record<string, { plain: HexCoord; shift: HexCoord }> = {
  ArrowRight: { plain: { q: 1, r: 0 }, shift: { q: 1, r: 0 } },
  ArrowLeft: { plain: { q: -1, r: 0 }, shift: { q: -1, r: 0 } },
  ArrowUp: { plain: { q: 1, r: -1 }, shift: { q: 0, r: -1 } },
  ArrowDown: { plain: { q: -1, r: 1 }, shift: { q: 0, r: 1 } },
};

/** The neighbouring tile in the key's direction, or `null` for a non-movement key. Stays put at an edge. */
export function stepCursor(from: HexCoord, key: string, shift: boolean, map: GameMap): HexCoord | null {
  const step = STEPS[key];
  if (!step) return null;
  const delta = shift ? step.shift : step.plain;
  const raw = { q: from.q + delta.q, r: from.r + delta.r };
  const next = map.wrapsHorizontally ? wrapHexCoord(raw, map.width) : raw;
  return map.tiles[hexKey(next)] ? next : { ...from };
}

function words(value: string): string {
  const spaced = value.replace(/[-_]/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** One sentence about a tile, limited to what the current player may know. */
export function describeCursorTile(state: GameState, coord: HexCoord): string {
  const viewerId = state.currentPlayer;
  const viewer = state.civilizations[viewerId];
  const completedByCiv = Object.fromEntries(
    Object.entries(state.civilizations).map(([id, civ]) => [id, civ.techState?.completed ?? []]),
  );
  const presentation = resolveTilePresentationForViewer(state.map, viewer?.visibility, coord, completedByCiv);
  const place = `${coord.q}, ${coord.r}`;

  if (presentation.kind === 'unexplored') return `Hex ${place}: unexplored.`;
  const terrain = words(presentation.tile.terrain);
  const parts = [`${terrain} at ${place}`];

  if (presentation.kind !== 'live') {
    const snapshotCity = viewer?.visibility.lastSeen?.[hexKey(coord)]?.city;
    if (snapshotCity) parts.push(`last seen: city of ${snapshotCity.name}`);
    parts.push(presentation.kind === 'last-seen' ? 'out of sight, in fog' : 'in fog, nothing known');
    return `${parts.join(', ')}.`;
  }

  const key = hexKey(coord);
  const city = Object.values(state.cities).find(candidate => hexKey(candidate.position) === key);
  if (city) {
    parts.push(city.owner === viewerId ? `your city ${city.name}` : `city ${city.name} (${state.civilizations[city.owner]?.name ?? city.owner})`);
  }
  for (const [, unit] of visibleUnitEntriesAtKey(state, key)) {
    const name = UNIT_DEFINITIONS[unit.type]?.name ?? words(unit.type);
    parts.push(unit.owner === viewerId ? `your ${name}` : `${state.civilizations[unit.owner]?.name ?? unit.owner} ${name}`);
  }
  return `${parts.join(', ')}.`;
}

export interface KeyboardMapCursorDeps {
  readonly target: Document;
  readonly getState: () => GameState;
  readonly getSelectedUnitId: () => string | null;
  /** The hex under the middle of the viewport; where the cursor starts when no unit is selected. */
  readonly getViewCenter: () => HexCoord;
  readonly isInteractionBlocked: () => boolean;
  /** Same entry as a pointer tap (`handleHexTap`). */
  readonly onTap: (coord: HexCoord) => void;
  /** `null` hides the cursor. */
  readonly onCursorChange: (coord: HexCoord | null) => void;
  readonly announce: (text: string) => void;
}

function ownsMapKeys(target: EventTarget | null, doc: Document): boolean {
  if (target === doc || target === doc.body || target === doc.documentElement) return true;
  return target instanceof HTMLCanvasElement;
}

export interface KeyboardMapCursor {
  /** Hides the cursor (a viewer change must not carry the previous player's position over). */
  hide(): void;
  dispose(): void;
}

export function installKeyboardMapCursor(deps: KeyboardMapCursorDeps): KeyboardMapCursor {
  let cursor: HexCoord | null = null;

  const hide = (): void => {
    if (cursor === null) return;
    cursor = null;
    deps.onCursorChange(null);
  };
  const show = (coord: HexCoord): void => {
    cursor = coord;
    deps.onCursorChange(coord);
    deps.announce(describeCursorTile(deps.getState(), coord));
  };

  const startCoord = (): HexCoord => {
    const state = deps.getState();
    const selectedId = deps.getSelectedUnitId();
    const selected = selectedId ? state.units[selectedId] : undefined;
    if (selected) return { ...selected.position };
    const center = deps.getViewCenter();
    const { map } = state;
    const wrapped = map.wrapsHorizontally ? wrapHexCoord(center, map.width) : center;
    // The view can be centred off the map (zoomed out past an edge); start at the map's middle then.
    return map.tiles[hexKey(wrapped)]
      ? wrapped
      : { q: Math.floor(map.width / 2), r: Math.floor(map.height / 2) };
  };

  const onKeyDown = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    if (deps.isInteractionBlocked()) {
      hide();
      return;
    }
    if (event.key === 'Escape') {
      hide();
      return;
    }
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    if (!ownsMapKeys(event.target, deps.target)) return;

    if (event.key in STEPS) {
      event.preventDefault();
      if (cursor === null) {
        show(startCoord());
        return;
      }
      const next = stepCursor(cursor, event.key, event.shiftKey, deps.getState().map);
      if (next) show(next);
      return;
    }

    if ((event.key === 'Enter' || event.key === ' ') && cursor !== null) {
      event.preventDefault();
      deps.onTap({ ...cursor });
    }
  };

  deps.target.addEventListener('keydown', onKeyDown);
  return {
    hide,
    dispose: () => {
      deps.target.removeEventListener('keydown', onKeyDown);
      hide();
    },
  };
}
