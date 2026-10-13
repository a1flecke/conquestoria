// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  describeCursorTile,
  installKeyboardMapCursor,
  stepCursor,
  type KeyboardMapCursorDeps,
} from '@/input/keyboard-map-cursor';
import type { GameState, HexCoord, HexTile } from '@/core/types';

function tile(q: number, r: number, terrain: HexTile['terrain'] = 'grassland'): HexTile {
  return {
    coord: { q, r }, terrain, elevation: 'lowland', resource: null, improvement: 'none',
    owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

function makeState(options: { wraps?: boolean; visibility?: 'visible' | 'fog' | 'unexplored' } = {}): GameState {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 4; r++) for (let q = 0; q < 5; q++) tiles[`${q},${r}`] = tile(q, r, q === 2 && r === 1 ? 'forest' : 'grassland');
  const visibility: Record<string, 'visible' | 'fog' | 'unexplored'> = {};
  for (const key of Object.keys(tiles)) visibility[key] = options.visibility ?? 'visible';
  return {
    turn: 1,
    currentPlayer: 'p1',
    map: { width: 5, height: 4, tiles, wrapsHorizontally: options.wraps ?? false, rivers: [] },
    civilizations: {
      p1: { id: 'p1', name: 'Rome', visibility: { tiles: visibility }, techState: { completed: [] } },
      p2: { id: 'p2', name: 'Egypt', visibility: { tiles: {} }, techState: { completed: [] } },
    },
    units: {
      mine: { id: 'mine', type: 'warrior', owner: 'p1', position: { q: 1, r: 1 }, health: 100 },
      theirs: { id: 'theirs', type: 'warrior', owner: 'p2', position: { q: 3, r: 1 }, health: 100 },
    },
    cities: {
      c1: { id: 'c1', name: 'Roma', owner: 'p1', position: { q: 1, r: 2 } },
    },
  } as unknown as GameState;
}

describe('stepCursor', () => {
  const map = makeState().map;
  const from: HexCoord = { q: 2, r: 1 };

  it('maps arrows to the six hex directions', () => {
    expect(stepCursor(from, 'ArrowRight', false, map)).toEqual({ q: 3, r: 1 });
    expect(stepCursor(from, 'ArrowLeft', false, map)).toEqual({ q: 1, r: 1 });
    expect(stepCursor(from, 'ArrowUp', false, map)).toEqual({ q: 3, r: 0 });
    expect(stepCursor(from, 'ArrowUp', true, map)).toEqual({ q: 2, r: 0 });
    expect(stepCursor(from, 'ArrowDown', false, map)).toEqual({ q: 1, r: 2 });
    expect(stepCursor(from, 'ArrowDown', true, map)).toEqual({ q: 2, r: 2 });
  });

  it('stays put at a non-wrapping map edge', () => {
    expect(stepCursor({ q: 0, r: 0 }, 'ArrowLeft', false, map)).toEqual({ q: 0, r: 0 });
    expect(stepCursor({ q: 0, r: 0 }, 'ArrowUp', true, map)).toEqual({ q: 0, r: 0 });
  });

  it('wraps horizontally when the map wraps', () => {
    const wrapped = makeState({ wraps: true }).map;
    expect(stepCursor({ q: 0, r: 1 }, 'ArrowLeft', false, wrapped)).toEqual({ q: 4, r: 1 });
    expect(stepCursor({ q: 4, r: 1 }, 'ArrowRight', false, wrapped)).toEqual({ q: 0, r: 1 });
  });

  it('returns null for keys that are not cursor movement', () => {
    expect(stepCursor(from, 'a', false, map)).toBeNull();
  });
});

describe('describeCursorTile', () => {
  it('names terrain, your unit and your city on a visible tile', () => {
    const state = makeState();
    expect(describeCursorTile(state, { q: 1, r: 1 })).toContain('Warrior');
    expect(describeCursorTile(state, { q: 1, r: 1 })).toContain('your');
    expect(describeCursorTile(state, { q: 1, r: 2 })).toContain('Roma');
  });

  it('names a visible foreign unit by owner', () => {
    expect(describeCursorTile(makeState(), { q: 3, r: 1 })).toContain('Egypt');
  });

  it('describes terrain only for a fogged tile and never leaks units', () => {
    const text = describeCursorTile(makeState({ visibility: 'fog' }), { q: 3, r: 1 });
    expect(text).not.toContain('Egypt');
    expect(text).not.toContain('Warrior');
    expect(text.toLowerCase()).toContain('fog');
  });

  it('says only "unexplored" for an unexplored tile', () => {
    const text = describeCursorTile(makeState({ visibility: 'unexplored' }), { q: 2, r: 1 });
    expect(text.toLowerCase()).toContain('unexplored');
    expect(text.toLowerCase()).not.toContain('forest');
  });
});

describe('installKeyboardMapCursor', () => {
  let state: GameState;
  let blocked: boolean;
  let selectedUnitId: string | null;
  let deps: KeyboardMapCursorDeps;
  let cursorCalls: Array<HexCoord | null>;
  let liveRegion: HTMLElement;
  let dispose: () => void;
  let hideCursor: () => void;
  let tapped: HexCoord[];

  beforeEach(() => {
    document.body.textContent = '';
    state = makeState();
    blocked = false;
    selectedUnitId = null;
    cursorCalls = [];
    tapped = [];
    liveRegion = document.createElement('div');
    document.body.appendChild(liveRegion);
    deps = {
      target: document,
      getState: () => state,
      getSelectedUnitId: () => selectedUnitId,
      getViewCenter: () => ({ q: 2, r: 1 }),
      isInteractionBlocked: () => blocked,
      onTap: coord => { tapped.push(coord); },
      onCursorChange: coord => { cursorCalls.push(coord); },
      announce: text => { liveRegion.textContent = text; },
    };
    const handle = installKeyboardMapCursor(deps);
    dispose = handle.dispose;
    hideCursor = handle.hide;
  });

  afterEach(() => dispose());

  function press(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    target.dispatchEvent(event);
    return event;
  }

  it('first arrow press shows the cursor at the selected unit instead of moving it', () => {
    selectedUnitId = 'mine';
    press('ArrowRight');
    expect(cursorCalls.at(-1)).toEqual({ q: 1, r: 1 });
    expect(liveRegion.textContent).toContain('Warrior');
  });

  it('first arrow press falls back to the view centre when nothing is selected', () => {
    press('ArrowLeft');
    expect(cursorCalls.at(-1)).toEqual({ q: 2, r: 1 });
  });

  it('later presses step and announce the new tile', () => {
    press('ArrowLeft');
    press('ArrowRight');
    expect(cursorCalls.at(-1)).toEqual({ q: 3, r: 1 });
    expect(liveRegion.textContent).toContain('Egypt');
  });

  it('Enter activates the cursor tile through the normal tap path', () => {
    press('ArrowLeft');
    press('ArrowRight');
    const event = press('Enter');
    expect(tapped).toEqual([{ q: 3, r: 1 }]);
    expect(event.defaultPrevented).toBe(true);
  });

  it('Enter without a cursor does nothing', () => {
    press('Enter');
    expect(tapped).toEqual([]);
  });

  it('Escape hides the cursor but does not swallow the key', () => {
    press('ArrowLeft');
    const event = press('Escape');
    expect(cursorCalls.at(-1)).toBeNull();
    expect(event.defaultPrevented).toBe(false);
    press('Enter');
    expect(tapped).toEqual([]);
  });

  it('leaves Enter and Space to a focused button', () => {
    press('ArrowLeft');
    const button = document.createElement('button');
    document.body.appendChild(button);
    const enter = press('Enter', {}, button);
    const space = press(' ', {}, button);
    expect(tapped).toEqual([]);
    expect(enter.defaultPrevented).toBe(false);
    expect(space.defaultPrevented).toBe(false);
  });

  it('ignores arrows typed into a text field', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    press('ArrowLeft', {}, input);
    expect(cursorCalls).toEqual([]);
  });

  it('does nothing while a blocking overlay is up and hides the cursor', () => {
    press('ArrowLeft');
    blocked = true;
    press('ArrowRight');
    press('Enter');
    expect(tapped).toEqual([]);
    expect(cursorCalls.at(-1)).toBeNull();
  });

  it('ignores modified arrows so browser shortcuts keep working', () => {
    press('ArrowLeft', { ctrlKey: true });
    press('ArrowLeft', { altKey: true });
    press('ArrowLeft', { metaKey: true });
    expect(cursorCalls).toEqual([]);
  });

  it('hide() removes the cursor so a viewer change cannot carry a position over', () => {
    press('ArrowLeft');
    hideCursor();
    expect(cursorCalls.at(-1)).toBeNull();
    press('Enter');
    expect(tapped).toEqual([]);
  });

  it('hides the cursor on dispose', () => {
    press('ArrowLeft');
    const spy = vi.fn();
    dispose();
    document.addEventListener('keydown', spy);
    press('ArrowRight');
    expect(cursorCalls.at(-1)).toBeNull();
  });
});
