// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorldMutation } from '../helpers/viewer-safety';

const mocks = vi.hoisted(() => ({
  listSaves: vi.fn(),
  listSaveEpics: vi.fn(),
  hasAutoSave: vi.fn(),
  loadAutoSave: vi.fn(),
  deleteSaveEntry: vi.fn(),
  renameSave: vi.fn(),
  getSaveFileAdapter: vi.fn(),
  exportMostRecentAutoSave: vi.fn(),
  importSaveFromFile: vi.fn(),
}));

vi.mock('@/storage/save-manager', () => ({
  listSaves: mocks.listSaves,
  listSaveEpics: mocks.listSaveEpics,
  hasAutoSave: mocks.hasAutoSave,
  loadAutoSave: mocks.loadAutoSave,
  deleteSaveEntry: mocks.deleteSaveEntry,
  renameSave: mocks.renameSave,
}));
vi.mock('@/platform/save-file-adapter', () => ({ getSaveFileAdapter: mocks.getSaveFileAdapter }));
vi.mock('@/storage/save-file-transfer', () => ({
  exportMostRecentAutoSave: mocks.exportMostRecentAutoSave,
  importSaveFromFile: mocks.importSaveFromFile,
}));

import { createSavePanel } from '@/ui/save-panel';

/**
 * #1002-style differential cover for the save panel: text that a player or a file controls can never change the
 * panel's structure.
 *
 * `save-panel.test.ts` renders one hand-picked `<span id="evil-...">` into a title, a save name and a player name and
 * asserts that element is absent. A panel that is safe is a panel whose *structure* does not depend on that text at
 * all, whatever it contains. The projection is the element skeleton of everything the panel shows (tag, attribute
 * names, and the `id` and `class` values) across the three screens a player passes through: the campaign list, an
 * opened campaign and the delete confirmation. Replacing any user-controlled string with hostile markup must leave
 * it untouched; an earned structural change (one more save) must move it.
 *
 * There is no seat here, so there is no `viewerId`: the same `WorldMutation` vocabulary as the viewer-safety harness
 * is used, driven by a local async runner because the panel renders after an awaited load.
 */

interface Save {
  id: string; name: string; civType: string; turn: number; lastPlayed: string;
  kind: 'manual' | 'autosave'; gameMode: 'solo' | 'hotseat'; gameTitle: string; playerNames?: string[];
}
interface Epic {
  gameId: string; title: string; latestTurn: number; latestPlayed: string; gameMode: 'solo' | 'hotseat';
  playerNames?: string[]; saves: Save[];
}
interface World { epics: Epic[] }

function skeleton(root: Element): string[] {
  const out: string[] = [];
  const visit = (element: Element, depth: number): void => {
    const attributes = Array.from(element.attributes)
      .map(attribute => (attribute.name === 'id' || attribute.name === 'class' ? `${attribute.name}=${attribute.value}` : attribute.name))
      .sort();
    out.push(`${'  '.repeat(depth)}${element.tagName.toLowerCase()}[${attributes.join(',')}]`);
    for (const child of Array.from(element.children)) visit(child, depth + 1);
  };
  visit(root, 0);
  return out;
}

async function project(world: World): Promise<string[][]> {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  document.body.appendChild(container);
  mocks.hasAutoSave.mockResolvedValue(false);
  mocks.listSaveEpics.mockResolvedValue(structuredClone(world.epics));
  await createSavePanel(container, { onNewGame: () => {}, onContinue: () => {}, onLoadEntry: () => {} });
  const screens: string[][] = [skeleton(document.body)];
  document.querySelector<HTMLButtonElement>('[data-role="open-epic"]')?.click();
  screens.push(skeleton(document.body));
  document.querySelector<HTMLButtonElement>('[data-role="delete-slot"]')?.click();
  screens.push(skeleton(document.body));
  return screens;
}

const edit = (label: string, apply: (world: World) => void): WorldMutation<World> => ({ label, apply });

const HOSTILE = [
  '<span id="evil">x</span>',
  '"><img src=x onerror=alert(1)>',
  '<script>window.__pwned = 1</script>',
  '</div><div id="breakout" class="evil">',
];

function baseWorld(): World {
  const save: Save = {
    id: 'slot-1', name: 'Manual Save', civType: 'egypt', turn: 9, lastPlayed: '2026-04-08T12:00:00.000Z',
    kind: 'manual', gameMode: 'solo', gameTitle: 'Desert Run',
  };
  return {
    epics: [{
      gameId: 'game-1', title: 'Desert Run', latestTurn: 9, latestPlayed: '2026-04-08T12:00:00.000Z', gameMode: 'solo',
      saves: [save],
    }],
  };
}

function hotSeatWorld(): World {
  const world = baseWorld();
  world.epics[0]!.gameMode = 'hotseat';
  world.epics[0]!.playerNames = ['Alice', 'Bob'];
  world.epics[0]!.saves[0]!.gameMode = 'hotseat';
  world.epics[0]!.saves[0]!.civType = 'hotseat';
  world.epics[0]!.saves[0]!.playerNames = ['Alice', 'Bob'];
  return world;
}

async function expectStructureInvariant(
  world: World,
  hidden: ReadonlyArray<WorldMutation<World>>,
  earned: ReadonlyArray<WorldMutation<World>>,
): Promise<void> {
  expect(earned.length, 'a case needs at least one earned control').toBeGreaterThan(0);
  const baseline = await project(structuredClone(world));
  for (const mutation of hidden) {
    const next = structuredClone(world);
    mutation.apply(next);
    expect(JSON.stringify(next) !== JSON.stringify(world), `"${mutation.label}" changed nothing: the case would pass vacuously`).toBe(true);
    expect(await project(next), `structure moved with: ${mutation.label}`).toEqual(baseline);
  }
  for (const mutation of earned) {
    const next = structuredClone(world);
    mutation.apply(next);
    expect(await project(next), `structure did not move with: ${mutation.label}`).not.toEqual(baseline);
  }
}

describe('the save panel structure does not depend on user-controlled text', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getSaveFileAdapter.mockResolvedValue({ adapter: 'mock' });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    delete (window as unknown as { __pwned?: number }).__pwned;
  });

  it('a campaign title, a save name and a save title are only ever text', async () => {
    await expectStructureInvariant(
      baseWorld(),
      HOSTILE.flatMap(text => [
        edit(`campaign title is ${text}`, w => { w.epics[0]!.title = text; }),
        edit(`save name is ${text}`, w => { w.epics[0]!.saves[0]!.name = text; }),
        edit(`save game title is ${text}`, w => { w.epics[0]!.saves[0]!.gameTitle = text; }),
      ]),
      [
        edit('the campaign holds another save', w => {
          w.epics[0]!.saves.push({ ...w.epics[0]!.saves[0]!, id: 'slot-2', name: 'Second' });
        }),
        edit('there is another campaign', w => {
          w.epics.push({ ...structuredClone(w.epics[0]!), gameId: 'game-2', title: 'Other' });
        }),
      ],
    );
  });

  it('hot-seat player names are only ever text', async () => {
    await expectStructureInvariant(
      hotSeatWorld(),
      HOSTILE.flatMap(text => [
        edit(`a campaign player is ${text}`, w => { w.epics[0]!.playerNames = ['Alice', text]; }),
        edit(`a save player is ${text}`, w => { w.epics[0]!.saves[0]!.playerNames = [text, 'Bob']; }),
      ]),
      [
        edit('the campaign holds another save', w => {
          w.epics[0]!.saves.push({ ...w.epics[0]!.saves[0]!, id: 'slot-2', name: 'Second' });
        }),
      ],
    );
  });

  it('no hostile text ever runs', async () => {
    const world = baseWorld();
    world.epics[0]!.title = HOSTILE[2]!;
    world.epics[0]!.saves[0]!.name = HOSTILE[1]!;
    await project(world);
    expect((window as unknown as { __pwned?: number }).__pwned).toBeUndefined();
    expect(document.getElementById('evil')).toBeNull();
    expect(document.getElementById('breakout')).toBeNull();
  });
});
