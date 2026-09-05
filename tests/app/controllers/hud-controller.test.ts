// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createPanelHost } from '@/app/panel-host';
import { createPanelRouter } from '@/app/panel-router';
import type { PanelContext, PanelRegistry } from '@/app/panel-registry';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import {
  createHudController,
  type HudController,
  type HudControllerDeps,
  type HudRenderer,
} from '@/app/controllers/hud-controller';

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'hud-controller', 'small');
  state.currentPlayer = 'player';
  return state;
}

function addPlayerAirDefenseCity(state: GameState): void {
  const city: City = {
    id: 'air-defense-city', name: 'Aegis', owner: 'player', position: { q: 0, r: 0 },
    population: 3, food: 0, foodNeeded: 15, buildings: ['anti_air_battery'],
    productionQueue: [], productionProgress: 0, ownedTiles: [{ q: 0, r: 0 }],
    workedTiles: [], focus: 'balanced', maturity: 'town', unrestLevel: 0,
    unrestTurns: 0, spyUnrestBonus: 0, idleProduction: null,
  };
  state.cities[city.id] = city;
  state.civilizations.player.cities = [city.id];
}

function fakeRenderer(overrides: Partial<HudRenderer> = {}): HudRenderer {
  return {
    isAirDefenseOverlayEnabled: () => false,
    toggleAirDefenseOverlay: vi.fn(() => true),
    resizeCanvas: vi.fn(),
    ...overrides,
  };
}

function baseDeps(state: GameState, overrides: Partial<HudControllerDeps> = {}): HudControllerDeps {
  document.body.innerHTML = '<div id="hud"></div><div id="game-shell"></div>';
  return {
    session: createGameSession(state),
    renderLoop: fakeRenderer(),
    canvas: document.createElement('canvas'),
    router: { open: vi.fn() },
    getElementById: id => document.getElementById(id),
    getDrawerMountRoot: () => document.getElementById('game-shell') ?? document.body,
    ...overrides,
  };
}

describe('HudController', () => {
  it('renders the gold total into the HUD and refreshes it after a state commit', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud: HudController = createHudController(deps);

    hud.update();
    const hudEl = document.getElementById('hud')!;
    expect(hudEl.textContent).toContain(String(state.civilizations['player'].gold));

    deps.session.commit({
      ...deps.session.getState(),
      civilizations: {
        ...deps.session.getState().civilizations,
        player: { ...deps.session.getState().civilizations['player'], gold: 9999 },
      },
    });
    hud.update();
    expect(hudEl.textContent).toContain('9999');
  });

  it('opens a fresh canonical research breakdown after a research-output change', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud = createHudController(deps);
    const initialScience = calculateCivResearchOutput(state, 'player').finalScience;

    hud.update();
    (document.querySelector('[data-action="open-research-breakdown"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-research-output-kind="final"]')?.textContent).toBe(`Final research+${initialScience}`);

    const current = deps.session.getState();
    deps.session.commit({
      ...current,
      civilizations: {
        ...current.civilizations,
        player: {
          ...current.civilizations.player,
          researchPenaltyTurns: 1,
          researchPenaltyMultiplier: 0.5,
        },
      },
    });
    hud.update();
    expect(document.querySelector('[data-role="research-breakdown"]')).toBeNull();

    const updated = deps.session.getState();
    const updatedScience = calculateCivResearchOutput(updated, 'player').finalScience;
    (document.querySelector('[data-action="open-research-breakdown"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-research-output-kind="final"]')?.textContent).toBe(`Final research+${updatedScience}`);
  });

  it('keeps the research breakdown open across an unchanged HUD refresh', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud = createHudController(deps);

    hud.update();
    (document.querySelector('[data-action="open-research-breakdown"]') as HTMLButtonElement).click();
    expect(document.querySelector('[data-role="research-breakdown"]')).not.toBeNull();

    hud.update();

    expect(document.querySelector('[data-role="research-breakdown"]')).not.toBeNull();
  });

  it('shows only the incoming hot-seat player\'s research in the HUD and breakdown', () => {
    const state = makeFixture();
    addPlayerAirDefenseCity(state);
    state.hotSeat = {
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player', civType: 'rome', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    };
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2',
      name: 'Bob',
      cities: [],
      techState: { ...state.civilizations.player.techState, currentResearch: 'writing' },
    };
    const deps = baseDeps(state);
    const hud = createHudController(deps);

    hud.update();
    expect(document.getElementById('hud')?.textContent).toContain('fire');
    (document.querySelector('[data-action="open-research-breakdown"]') as HTMLButtonElement).click();
    const outgoingScience = document.querySelector('[data-research-output-kind="final"]')?.textContent;

    deps.session.commit({ ...deps.session.getState(), currentPlayer: 'player-2' });
    hud.update();
    expect(document.querySelector('[data-role="research-breakdown"]')).toBeNull();
    expect(document.getElementById('hud')?.textContent).toContain('writing');
    (document.querySelector('[data-action="open-research-breakdown"]') as HTMLButtonElement).click();

    expect(document.querySelector('[data-research-output-kind="final"]')?.textContent).not.toBe(outgoingScience);
  });

  it('starts hidden and stays hidden after update() when the civ has no air-defense coverage', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    document.body.innerHTML = '<div id="hud"></div><div id="utility-toolbar"><button id="btn-pause-menu"></button></div>';
    const hud = createHudController(deps);
    hud.placeAirDefenseButton();
    const button = document.getElementById('btn-air-defense-overlay') as HTMLButtonElement;

    // Starts hidden so it never flashes visible before the first update() call.
    expect(button.hidden).toBe(true);

    hud.update();
    expect(button.hidden).toBe(true);
  });

  it('reveals #btn-hall-of-fame only once the current player has earned a General, re-hiding it per viewer', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const button = document.createElement('button');
    button.id = 'btn-hall-of-fame';
    button.hidden = true;
    document.body.appendChild(button);
    const hud = createHudController(deps);

    state.civilizations.player.generalHistory = [];
    deps.session.setStateWithoutRefresh(state);
    hud.update();
    expect(button.hidden).toBe(true);

    state.civilizations.player.generalHistory = [
      { unitId: 'u1', generalDefinitionId: 'gen_caesar', spawnedTurn: 2, careerEvents: [{ type: 'spawned', turn: 2 }] },
    ];
    deps.session.setStateWithoutRefresh(state);
    hud.update();
    expect(button.hidden).toBe(false);

    // hot-seat handoff to a player with no history re-hides it
    const aiId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.currentPlayer = aiId;
    state.civilizations[aiId].generalHistory = [];
    deps.session.setStateWithoutRefresh(state);
    hud.update();
    expect(button.hidden).toBe(true);
  });

  it('places the anti-aircraft button next to the pause menu button once the toolbar exists', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    document.body.innerHTML = '<div id="hud"></div><div id="utility-toolbar"><button id="btn-pause-menu"></button></div>';
    const hud = createHudController(deps);

    hud.placeAirDefenseButton();

    const toolbar = document.getElementById('utility-toolbar')!;
    const button = document.getElementById('btn-air-defense-overlay');
    expect(button).not.toBeNull();
    expect(toolbar.contains(button)).toBe(true);
    expect(button?.nextElementSibling?.id).toBe('btn-pause-menu');
    // Regression for #783: this button used to carry its own
    // `position:absolute;right:12px;top:64px` and land directly on `uiLayer`,
    // overlapping the utility toolbar's own icon buttons and the HUD's
    // turn/era text at the same screen coordinates. It joins the toolbar's
    // flex row instead, so it must not reintroduce a competing absolute anchor.
    expect(button?.style.position).not.toBe('absolute');
  });

  it('shows the fog-safe coverage legend only while the overlay is enabled', () => {
    const state = makeFixture();
    addPlayerAirDefenseCity(state);
    const renderer = fakeRenderer({
      isAirDefenseOverlayEnabled: () => true,
      toggleAirDefenseOverlay: vi.fn(() => true),
    });
    const deps = baseDeps(state, { renderLoop: renderer });
    document.body.innerHTML = '<div id="hud"></div><div id="game-shell"></div><div id="utility-toolbar"></div>';
    const hud = createHudController(deps);

    hud.placeAirDefenseButton();
    hud.update();

    const legend = document.getElementById('air-defense-overlay-legend')!;
    expect(legend.hidden).toBe(false);
    expect(legend.textContent).toBe('Air defense coverage — known providers only');
    expect(legend.getAttribute('aria-hidden')).toBe('false');
  });

  it('mounts the treasury drawer once, idempotently, and closes it on demand', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud = createHudController(deps);

    expect(hud.isDrawerOpen()).toBe(false);
    hud.ensureDrawerMounted();
    const shell = document.getElementById('game-shell')!;
    expect(shell.children.length).toBe(1);

    hud.ensureDrawerMounted();
    expect(shell.children.length).toBe(1); // idempotent — no second drawer

    hud.closeDrawer();
    expect(hud.isDrawerOpen()).toBe(false);
  });

  it('closes the treasury drawer when a main panel opens through the real PanelRouter', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud = createHudController(deps);
    hud.ensureDrawerMounted();

    const host = createPanelHost(document.getElementById('game-shell') ?? document.body);
    const context = {} as PanelContext;
    const registry: Partial<PanelRegistry> = {
      council: { domId: 'council-panel', group: 'main', open: () => {
        const el = document.createElement('div');
        el.id = 'council-panel';
        host.layer.appendChild(el);
      } },
    };
    const router = createPanelRouter({ host, registry, context, onBeforeOpen: () => hud.closeDrawer() });

    // Force the drawer open the same way clicking the gold button would.
    hud.update();
    const goldBtn = document.getElementById('hud')!.querySelector('button')!;
    goldBtn.click();
    expect(hud.isDrawerOpen()).toBe(true);

    router.open('council');
    expect(hud.isDrawerOpen()).toBe(false);
  });

  it('sets the canvas bottom inset and triggers a resize', () => {
    const state = makeFixture();
    const deps = baseDeps(state);
    const hud = createHudController(deps);

    hud.setMapViewportBottomInset(64);

    expect(deps.canvas.style.bottom).toBe('64px');
    expect(deps.canvas.style.height).toBe('auto');
    expect((deps.renderLoop.resizeCanvas as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  describe('Strategic Arsenal button (#545 MR4)', () => {
    function withManhattanProject(state: GameState, arsenal: number): void {
      state.builtNationalProjects = { 'player:manhattan_project': { civId: 'player', cityId: 'city-1', eraBuilt: 10 } as any };
      state.civilizations.player.strategicArsenal = arsenal;
    }

    it('is absent without Manhattan Project (capacity 0)', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();
      expect(document.getElementById('hud')!.textContent).not.toContain('☢');
    });

    it('shows the arsenal count/capacity and opens the strategic-arsenal panel on click', () => {
      const state = makeFixture();
      withManhattanProject(state, 2);
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();

      const hudEl = document.getElementById('hud')!;
      expect(hudEl.textContent).toContain('☢');
      const arsenalButton = Array.from(hudEl.querySelectorAll('button')).find(b => b.textContent?.includes('☢'))!;
      expect(arsenalButton).toBeTruthy();
      arsenalButton.click();
      expect(deps.router.open).toHaveBeenCalledWith('strategic-arsenal');
    });

    it('is absent when superweapons is off, even with real physical capacity (#545 MR7)', () => {
      const state = makeFixture();
      withManhattanProject(state, 2);
      state.settings.superweapons = 'off';
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();
      expect(document.getElementById('hud')!.textContent).not.toContain('☢');
    });
  });

  describe('#927 Rung 6 — Federal Autonomy toggle', () => {
    function federalismButton(): HTMLButtonElement | null {
      return document.querySelector('[data-action="toggle-federalism"]');
    }

    it('is absent before Decolonization is researched', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();
      expect(federalismButton()).toBeNull();
    });

    it('shows Off once researched, and toggles to On via a real click, refreshing itself through session.commit', () => {
      const state = makeFixture();
      state.civilizations.player.techState.completed = [...state.civilizations.player.techState.completed, 'decolonization'];
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();

      const btn = federalismButton();
      expect(btn).not.toBeNull();
      expect(btn!.textContent).toContain('Off');
      expect(btn!.disabled).toBe(false);

      btn!.click();
      hud.update();

      const afterClick = federalismButton();
      expect(afterClick!.textContent).toContain('On');
      expect(deps.session.getState().civilizations.player.federalismEnabled).toBe(true);
      expect(deps.session.getState().civilizations.player.federalismChangedTurn).toBe(state.turn);
    });

    it('is disabled with a title naming the unlock turn while the post-toggle lock is active', () => {
      const state = makeFixture();
      state.civilizations.player.techState.completed = [...state.civilizations.player.techState.completed, 'decolonization'];
      state.civilizations.player.federalismEnabled = true;
      state.civilizations.player.federalismChangedTurn = state.turn; // just toggled -> locked
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();

      const btn = federalismButton()!;
      expect(btn.disabled).toBe(true);
      expect(btn.title).toMatch(/locked until turn/i);
    });
  });
});
