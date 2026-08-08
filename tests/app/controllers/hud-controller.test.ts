// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createPanelHost } from '@/app/panel-host';
import { createPanelRouter } from '@/app/panel-router';
import type { PanelContext, PanelRegistry } from '@/app/panel-registry';
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
});
