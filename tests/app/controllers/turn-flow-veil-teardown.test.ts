// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import type { GameState, HotSeatPlayer } from '@/core/types';
import { createPanelHost } from '@/app/panel-host';
import { createPanelRouter } from '@/app/panel-router';
import type { PanelDescriptor, PanelId, PanelRegistry } from '@/app/panel-registry';
import { createTurnFlowController } from '@/app/controllers/turn-flow-controller';
import { showBeastSightingBanner } from '@/ui/beast-sighting-banner';
import { baseDeps, clearRequiredChoices, makeFixture } from '../../helpers/turn-flow-harness';

/**
 * The hot-seat veil must leave nothing of the outgoing seat's on screen (d36c2ed2b, d8ae50ac5).
 *
 * The earlier regressions listed DOM ids by hand and mocked `closeGroup`, so they restated the fix:
 * a panel added to the registry tomorrow, or to no list at all, would pass. Here the surfaces come from
 * the real registry source and from every id a `src/ui` module creates, the router is the real one, and
 * a panel nobody classified fails by name.
 */

const read = (path: string): string => readFileSync(resolve(__dirname, '../../..', path), 'utf8');

function registryFromBootstrap(): Array<{ id: string; domId: string; group: 'main' | 'transient' }> {
  const source = read('src/app/bootstrap.ts');
  const start = source.indexOf('const panelRegistry');
  const end = source.indexOf('satisfies PanelRegistry', start);
  expect(start, 'panelRegistry not found in bootstrap.ts').toBeGreaterThan(-1);
  expect(end, 'registry `satisfies PanelRegistry` not found').toBeGreaterThan(start);
  const body = source.slice(start, end);
  const entries = [...body.matchAll(/(?:'([a-z-]+)'|([a-z]+)):\s*\{\s*domId:\s*'([^']+)',\s*group:\s*'(main|transient)'/g)];
  return entries.map(match => ({ id: match[1] ?? match[2], domId: match[3], group: match[4] as 'main' | 'transient' }));
}

/** Decision modals mounted outside the registry; the controller removes these by id. */
function handoffRemovedIds(): string[] {
  const source = read('src/app/controllers/turn-flow-controller.ts');
  const start = source.indexOf('function closePanelsForHandoff');
  const end = source.indexOf('\n  }\n', start);
  const body = source.slice(start, end);
  return [...body.matchAll(/(?:querySelector\('#|getElementById\(')([a-z-]+)/g)].map(match => match[1]);
}

function uiModuleIds(): Map<string, string> {
  const ids = new Map<string, string>();
  const dir = resolve(__dirname, '../../../src/ui');
  for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    for (const match of source.matchAll(/\.id = '([a-z0-9-]+)'/g)) ids.set(match[1], `src/ui/${file}`);
  }
  return ids;
}

function makeHotSeatState(): { state: GameState; nextSeat: string } {
  const state = makeFixture();
  const other = Object.keys(state.civilizations).find(id => id !== 'player')!;
  state.civilizations['player'].isHuman = true;
  state.civilizations[other].isHuman = true;
  const players: HotSeatPlayer[] = [
    { name: 'Alice', slotId: 'player', civType: state.civilizations['player'].civType, isHuman: true },
    { name: 'Bob', slotId: other, civType: state.civilizations[other].civType, isHuman: true },
  ];
  state.hotSeat = { playerCount: 2, mapSize: 'small', players };
  clearRequiredChoices(state, other);
  return { state, nextSeat: other };
}

async function beginHandoffWithSurfaces(surfaceIds: readonly string[], bodyIds: readonly string[]): Promise<{
  remaining: string[];
  mountedBefore: string[];
}> {
  const { state } = makeHotSeatState();
  const uiLayer = document.createElement('div');
  document.body.appendChild(uiLayer);
  const mount = (id: string, parent: HTMLElement): void => {
    const node = document.createElement('div');
    node.id = id;
    node.textContent = 'outgoing seat private surface';
    parent.appendChild(node);
  };
  for (const id of surfaceIds) mount(id, uiLayer);
  for (const id of bodyIds) mount(id, document.body);
  const all = [...surfaceIds, ...bodyIds];
  const mountedBefore = all.filter(id => document.getElementById(id));

  const registry = Object.fromEntries(
    registryFromBootstrap().map(({ id, domId, group }): [string, PanelDescriptor] => [
      id,
      { domId, group, open: () => { throw new Error('not opened in this test'); } },
    ]),
  ) as Partial<PanelRegistry>;
  const router = createPanelRouter({
    host: createPanelHost(uiLayer),
    registry,
    context: undefined as never,
  });
  const deps = baseDeps(state, {
    uiLayer,
    router,
    getElementById: id => document.getElementById(id),
  });
  const handoff = createTurnFlowController(deps).beginHotSeatHandoff(state.hotSeat!, false);
  const remaining = all.filter(id => document.getElementById(id));
  document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
  await handoff;
  uiLayer.remove();
  for (const id of bodyIds) document.getElementById(id)?.remove();
  return { remaining, mountedBefore };
}

describe('hot-seat veil teardown (#1014 follow-up: derived, not hand-listed)', () => {
  const registry = registryFromBootstrap();
  const removedByController = handoffRemovedIds();

  it('reads the real registry and controller teardown (guards the scanners themselves)', () => {
    expect(registry.length).toBeGreaterThanOrEqual(28);
    expect(registry.map(entry => entry.domId)).toContain('espionage-panel');
    expect(removedByController).toEqual(expect.arrayContaining(['beast-hoard-panel', 'capture-verdict-modal', 'intel-modal']));
  });

  it('no registered panel survives the veil, through the real router', async () => {
    const { remaining, mountedBefore } = await beginHandoffWithSurfaces(registry.map(entry => entry.domId), []);
    expect(mountedBefore, 'surfaces were never mounted, the check would pass vacuously')
      .toHaveLength(registry.length);
    expect(remaining).toEqual([]);
  });

  it('no decision modal the controller names survives the veil, and an unnamed surface does (earned control)', async () => {
    const named = [...new Set(removedByController.filter(id => !['diplomacy-panel', 'intel-modal', 'capture-verdict-modal'].includes(id)))];
    const result = await beginHandoffWithSurfaces([...named, 'not-torn-down-panel'], ['intel-modal', 'capture-verdict-modal']);
    expect(result.remaining).toEqual(['not-torn-down-panel']);
  });

  it("the beast sighting banner the outgoing seat left open does not reach the next seat", async () => {
    const { state } = makeHotSeatState();
    const uiLayer = document.createElement('div');
    document.body.appendChild(uiLayer);
    showBeastSightingBanner(uiLayer, {
      name: 'The Emerald Basilisk',
      flavor: 'A basilisk was sighted near your border.',
      unitType: 'warrior',
      onContinue: () => {},
      onOpenBestiary: () => {},
    });
    expect(uiLayer.querySelector('#beast-sighting-banner')).not.toBeNull();
    const deps = baseDeps(state, { uiLayer, getElementById: id => document.getElementById(id) });
    const handoff = createTurnFlowController(deps).beginHotSeatHandoff(state.hotSeat!, false);
    expect(uiLayer.querySelector('#beast-sighting-banner')).toBeNull();
    document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
    await handoff;
    uiLayer.remove();
  });

  /**
   * Every panel-shaped id a `src/ui` module creates must be accounted for: registered (so the router
   * closes it), removed by the controller, or listed here with the reason it cannot be open across a
   * handoff. A new panel that is none of these fails here by name instead of leaking to the next seat.
   */
  const SAFE_ACROSS_HANDOFF: Record<string, string> = {
    'required-choice-panel': 'ending the turn is refused while a required choice is open',
    'religion-boon-modal': 'ending the turn is refused while the boon choice is open',
    'city-capture-panel': 'ending the turn is refused while a city-capture intent is pending',
    'end-turn-warning-panel': 'it is the confirmation of the End Turn that starts the handoff; closed first',
    'info-panel': 'selected-unit panel; enterViewerTurn deselects the unit',
    'save-panel': 'a menu screen, not a seat-private surface; unreachable under the veil',
    'pause-menu': 'a menu screen, not a seat-private surface; unreachable under the veil',
    'victory-panel': 'the shared conclusion screen, every seat sees it',
    'legacy-opponent-challenge-prompt': 'pre-game prompt, no seat exists yet',
    'campaign-map-script': 'pre-game screen',
    'hotseat-setup': 'pre-game screen',
    'custom-civ-panel': 'pre-game screen',
    'turn-handoff': 'the veil itself',
    'wonder-discovery-ceremony': 'queued ceremony; ceremonies.clearForHandoff drops it',
    'legendary-wonder-completion-ceremony': 'queued ceremony; ceremonies.clearForHandoff drops it',
    'event-chain-conclusion-ceremony': 'queued ceremony; ceremonies.clearForHandoff drops it',
    'world-race-conclusion-ceremony': 'queued ceremony; ceremonies.clearForHandoff drops it',
    'beast-slay-ceremony': 'queued ceremony; ceremonies.clearForHandoff drops it',
    'strategic-launch-flow': 'closed by closeStrategicLaunchFlow at the handoff',
    'wonder-codex-panel': 'registered as wonder-atlas',
    'tech-track-sidebar': 'a child of the registered tech panel, removed with it',
  };

  it('every panel-shaped id a src/ui module creates is registered, torn down, or justified', () => {
    const covered = new Set<string>([
      ...registry.map(entry => entry.domId),
      ...removedByController,
      ...Object.keys(SAFE_ACROSS_HANDOFF),
    ]);
    const panelShaped = /(panel|modal|ceremony|banner|sidebar|flow|prompt|grid)$/;
    const unclassified = [...uiModuleIds()]
      .filter(([id]) => panelShaped.test(id) && !covered.has(id))
      .map(([id, file]) => `${id} (${file})`);
    expect(
      unclassified,
      'These panels are created in src/ui but are neither in PANEL_REGISTRY (bootstrap.ts), removed by '
        + 'closePanelsForHandoff, nor justified in SAFE_ACROSS_HANDOFF. A hot-seat handoff would carry them to the '
        + 'next seat. Register the panel (one entry closes it structurally) rather than listing it here.',
    ).toEqual([]);
  });

  it('every justified exemption still names a real panel', () => {
    const real = uiModuleIds();
    const stale = Object.keys(SAFE_ACROSS_HANDOFF).filter(id => !real.has(id));
    expect(stale).toEqual([]);
  });

  it('the registry covers every PanelId', () => {
    const source = read('src/app/panel-registry.ts');
    const union = source.slice(source.indexOf('export type PanelId'), source.indexOf('/**', source.indexOf('export type PanelId')));
    const ids = [...union.matchAll(/'([a-z-]+)'/g)].map(match => match[1] as PanelId);
    expect(registry.map(entry => entry.id).sort()).toEqual([...ids].sort());
  });
});
