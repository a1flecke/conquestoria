/**
 * Owns the HUD readout, the treasury drawer, the anti-aircraft-overlay
 * toggle button, and the map viewport bottom inset the primary action bar's
 * height drives (#787 phase 10).
 *
 * The treasury drawer is constructed lazily via `ensureDrawerMounted()`,
 * matching the original module-scope `let drawer: TreasuryDrawer` -- it stays
 * `undefined` until the first real game start, exactly as `startGame()`'s
 * `if (!drawer) { drawer = createTreasuryDrawer(); ... }` guard did.
 *
 * `placeAirDefenseButton()` is exposed separately from construction because
 * the button must be created before `GameSessionController.createUI()` calls
 * it (the button click handler needs to exist before `#utility-toolbar` does)
 * but can only be placed into the DOM after `createGameShell()` has built
 * that toolbar.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { GameSession } from '@/app/ports';
import type { PanelRouter } from '@/app/panel-router';
import { createTreasuryDrawer, type TreasuryDrawer } from '@/ui/treasury-drawer';
import { createGameButton } from '@/ui/ui-kit';
import { civHasAirDefenseCoverage } from '@/systems/air-defense-system';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { calculateCivResearchOutput } from '@/systems/research-output-system';
import { calculateCivEconomy, formatGoldHudText } from '@/systems/economy-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { isAutonomyActivated } from '@/systems/network-plan-system';
import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { getNetworkPanelModel } from '@/ui/network-panel';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import { getUnmovedUnits } from '@/systems/unit-system';
import { createResearchBreakdown } from '@/ui/research-breakdown';
import { FEDERALISM_TECH_ID, canToggleFederalism, getFederalismLockedUntilTurn, setFederalismStance } from '@/systems/faction-system';

/** The narrow slice of `RenderLoop` this controller needs. */
export type HudRenderer = Pick<RenderLoop, 'isAirDefenseOverlayEnabled' | 'toggleAirDefenseOverlay' | 'resizeCanvas'>;

export interface HudController {
  update(): void;
  setMapViewportBottomInset(height: number): void;
  /** Idempotent -- safe to call every `createUI()` even though it only runs once in practice. */
  placeAirDefenseButton(): void;
  /** Idempotent -- constructs the drawer on first call only, matching the original `if (!drawer)` guard. */
  ensureDrawerMounted(): void;
  closeDrawer(): void;
  isDrawerOpen(): boolean;
}

export interface HudControllerDeps {
  readonly session: GameSession;
  readonly renderLoop: HudRenderer;
  readonly canvas: HTMLCanvasElement;
  readonly router: Pick<PanelRouter, 'open'>;
  readonly getElementById: (id: string) => HTMLElement | null;
  /** Where the treasury drawer mounts -- `#game-shell`, falling back to `document.body`. */
  readonly getDrawerMountRoot: () => HTMLElement;
}

export function createHudController(deps: HudControllerDeps): HudController {
  let drawer: TreasuryDrawer | undefined;
  let researchBreakdown: HTMLElement | undefined;
  let researchBreakdownCivId: string | undefined;
  let researchBreakdownSignature: string | undefined;

  const dismissResearchBreakdown = (): void => {
    researchBreakdown?.remove();
    researchBreakdown = undefined;
    researchBreakdownCivId = undefined;
    researchBreakdownSignature = undefined;
  };

  const getResearchBreakdownSignature = (
    civId: string,
    output: ReturnType<typeof calculateCivResearchOutput>,
  ): string =>
    JSON.stringify([civId, output.rows, output.penaltyMultiplier]);

  const airDefenseButton = createGameButton('🛡 Anti-aircraft coverage', 'secondary');
  airDefenseButton.id = 'btn-air-defense-overlay';
  airDefenseButton.hidden = true; // shown once the current civ has built AA coverage — see update()
  airDefenseButton.setAttribute('aria-pressed', 'false');
  const airDefenseLegend = document.createElement('div');
  airDefenseLegend.id = 'air-defense-overlay-legend';
  airDefenseLegend.hidden = true;
  airDefenseLegend.setAttribute('aria-hidden', 'true');
  airDefenseLegend.textContent = 'Air defense coverage — known providers only';
  airDefenseLegend.style.cssText = 'position:absolute;left:12px;bottom:12px;z-index:8;padding:6px 8px;border:1px solid rgba(126,229,255,0.7);border-radius:6px;background:rgba(8,22,40,0.88);color:#dff8ff;font-size:12px;pointer-events:none;';

  const updateAirDefenseOverlayPresentation = (enabled: boolean, available: boolean): void => {
    airDefenseButton.hidden = !available;
    airDefenseButton.setAttribute('aria-pressed', String(enabled));
    airDefenseButton.textContent = enabled ? '🛡 Anti-aircraft coverage: on' : '🛡 Anti-aircraft coverage';
    airDefenseLegend.hidden = !available || !enabled;
    airDefenseLegend.setAttribute('aria-hidden', String(!available || !enabled));
  };

  airDefenseButton.addEventListener('click', () => {
    const enabled = deps.renderLoop.toggleAirDefenseOverlay();
    updateAirDefenseOverlayPresentation(enabled, !airDefenseButton.hidden);
  });

  return {
    update(): void {
      const state = deps.session.getState();
      const civ = state.civilizations[state.currentPlayer];
      const airDefenseAvailable = civHasAirDefenseCoverage(state, civ.id);
      const airDefenseEnabled = deps.renderLoop.isAirDefenseOverlayEnabled(state.currentPlayer);
      updateAirDefenseOverlayPresentation(airDefenseEnabled, airDefenseAvailable);
      const hud = deps.getElementById('hud');
      if (!hud) return;

      // Sum yields across all cities
      let totalFood = 0, totalProd = 0;
      for (const cityId of civ.cities) {
        const city = state.cities[cityId];
        if (!city) continue;
        const y = calculateProjectedCityYields(state, cityId);
        totalFood += y.food;
        totalProd += y.production;
      }
      const researchOutput = calculateCivResearchOutput(state, civ.id);
      const totalScience = researchOutput.finalScience;
      const researchSignature = getResearchBreakdownSignature(civ.id, researchOutput);
      // Refreshes occur during normal rendering as well as after turn changes.
      // Keep an open dialog visible while its owner and canonical output stay
      // unchanged; otherwise remove it before the HUD can show stale or
      // hot-seat-private research details.
      if (researchBreakdown && (
        researchBreakdownCivId !== civ.id
        || researchBreakdownSignature !== researchSignature
      )) {
        dismissResearchBreakdown();
      }
      const economyStatus = calculateCivEconomy(state, civ.id);

      const techName = civ.techState.currentResearch ?? 'None';
      hud.textContent = '';

      const yieldsRow = document.createElement('div');
      yieldsRow.dataset.role = 'hud-yields';
      yieldsRow.style.cssText =
        'display:flex;align-items:center;gap:10px;flex-wrap:nowrap;overflow:hidden;min-width:0;';

      const yieldSpan = document.createElement('span');
      yieldSpan.textContent = `🌾 ${totalFood}`;
      yieldsRow.appendChild(yieldSpan);

      const prodSpan = document.createElement('span');
      prodSpan.textContent = `⚒️ ${totalProd}`;
      yieldsRow.appendChild(prodSpan);

      const goldBtn = document.createElement('button');
      goldBtn.style.cssText =
        'background:transparent;color:inherit;border:none;font-family:inherit;font-size:inherit;padding:0;cursor:pointer;min-height:44px;display:inline-flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex-shrink:1;';
      goldBtn.textContent = `💰 ${formatGoldHudText(economyStatus, civ.gold)}`;
      goldBtn.addEventListener('click', () => drawer?.toggle());
      yieldsRow.appendChild(goldBtn);
      drawer?.update(economyStatus, civ.gold);

      const scienceButton = createGameButton(`🔬 ${techName !== 'None' ? techName : 'None'} (+${totalScience})`, 'secondary');
      scienceButton.dataset.action = 'open-research-breakdown';
      scienceButton.title = 'Show research details';
      scienceButton.addEventListener('click', () => {
        dismissResearchBreakdown();
        const latestState = deps.session.getState();
        const latestCiv = latestState.civilizations[latestState.currentPlayer];
        if (!latestCiv) return;
        researchBreakdown = createResearchBreakdown(
          calculateCivResearchOutput(latestState, latestCiv.id),
          {
            returnFocusTo: scienceButton,
            onClose: () => { researchBreakdown = undefined; },
          },
        );
        researchBreakdownCivId = latestCiv.id;
        researchBreakdownSignature = getResearchBreakdownSignature(
          latestCiv.id,
          calculateCivResearchOutput(latestState, latestCiv.id),
        );
        deps.getDrawerMountRoot().appendChild(researchBreakdown);
        researchBreakdown.querySelector<HTMLButtonElement>('[data-action="close-research-breakdown"]')?.focus();
      });
      yieldsRow.appendChild(scienceButton);

      // #927 Rung 6: Federal Autonomy toggle. Only shown once Decolonization is
      // researched. Disabled (with a title naming the unlock turn) while the
      // post-toggle lock is active. No new panel — this is the "smallest
      // coherent control" for a persistent civ-wide stance, per the rung's own
      // design brief; see docs/superpowers/specs/2026-09-05-issue-927-federalism-design.md.
      if (civ.techState.completed.includes(FEDERALISM_TECH_ID)) {
        const federalismEnabled = civ.federalismEnabled === true;
        const federalismUnlocked = canToggleFederalism(state, civ.id);
        const federalismButton = document.createElement('button');
        federalismButton.type = 'button';
        federalismButton.dataset.action = 'toggle-federalism';
        federalismButton.style.cssText = `background:transparent;color:inherit;border:1px solid rgba(232,193,112,${federalismUnlocked ? '0.45' : '0.2'});border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;${federalismUnlocked ? 'cursor:pointer;' : 'cursor:not-allowed;opacity:0.6;'}`;
        federalismButton.textContent = `🏛 Federal Autonomy: ${federalismEnabled ? 'On' : 'Off'}`;
        federalismButton.setAttribute('aria-pressed', String(federalismEnabled));
        federalismButton.disabled = !federalismUnlocked;
        federalismButton.title = federalismUnlocked
          ? 'Toggle Federal Autonomy — administrative relief for reduced central gold income.'
          : `Locked until turn ${getFederalismLockedUntilTurn(civ)}.`;
        federalismButton.addEventListener('click', () => {
          deps.session.update(current => {
            const currentCiv = current.civilizations[current.currentPlayer];
            if (!currentCiv) return current;
            return setFederalismStance(current, current.currentPlayer, !(currentCiv.federalismEnabled === true)).state;
          });
        });
        yieldsRow.appendChild(federalismButton);
      }

      if (isAutonomyActivated(state, civ.id)) {
        const networkButton = document.createElement('button');
        networkButton.type = 'button';
        networkButton.style.cssText = 'background:transparent;color:inherit;border:1px solid rgba(232,193,112,0.45);border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;';
        networkButton.textContent = getNetworkPanelModel(state, civ.id).statusText;
        networkButton.addEventListener('click', () => deps.router.open('network'));
        yieldsRow.appendChild(networkButton);
      }

      // #545 MR4: only shown once Manhattan Project gives the civ a real
      // (non-zero) arsenal capacity -- never a dead button on a civ with no
      // strategic-weapons content built yet.
      if (isSuperweaponsEnabled(state) && getStrategicArsenalCapacity(state, civ.id) > 0) {
        const arsenalButton = document.createElement('button');
        arsenalButton.type = 'button';
        arsenalButton.style.cssText = 'background:transparent;color:inherit;border:1px solid rgba(200,60,40,0.45);border-radius:6px;font:inherit;padding:4px 8px;min-height:44px;';
        arsenalButton.textContent = `☢ ${getStrategicArsenal(civ)}/${getStrategicArsenalCapacity(state, civ.id)}`;
        arsenalButton.addEventListener('click', () => deps.router.open('strategic-arsenal'));
        yieldsRow.appendChild(arsenalButton);
      }

      const happiness = getCivHappinessFromResources(state, civ.id);
      if (happiness > 0) {
        const happySpan = document.createElement('span');
        happySpan.title = 'Happiness from luxury resources — each point reduces city unrest pressure by 2';
        happySpan.textContent = `☺ ${happiness} (stability)`;
        yieldsRow.appendChild(happySpan);
      }

      const infoRow = document.createElement('div');
      if (state.hotSeat && civ.name) {
        const nameSpan = document.createElement('span');
        nameSpan.textContent = `${civ.name} · `;
        infoRow.appendChild(nameSpan);
      }
      const turnSpan = document.createElement('span');
      turnSpan.textContent = `Turn ${state.turn} · Your Era ${resolveCivilizationEra(civ.techState.completed)} · World Age ${state.era}`;
      infoRow.appendChild(turnSpan);

      hud.appendChild(yieldsRow);
      hud.appendChild(infoRow);

      const pirateWatersButton = deps.getElementById('btn-pirate-waters');
      if (pirateWatersButton) {
        pirateWatersButton.hidden = !getPirateWatersPresentation(state, state.currentPlayer).available;
      }

      // #887 Phase B: the Hall of Fame button appears once the current player
      // has ever earned a General and stays thereafter (history never shrinks).
      // currentPlayer-scoped, so a hot-seat handoff re-evaluates it.
      const hallOfFameButton = deps.getElementById('btn-hall-of-fame');
      if (hallOfFameButton) {
        hallOfFameButton.hidden = (state.civilizations[state.currentPlayer]?.generalHistory?.length ?? 0) === 0;
      }

      // Show "Next Unit" button when there are unmoved units
      const nextUnitBtn = deps.getElementById('btn-next-unit');
      if (nextUnitBtn) {
        const unmovedCount = getUnmovedUnits(state.units, state.currentPlayer).length;
        nextUnitBtn.style.display = unmovedCount > 0 ? 'block' : 'none';
        if (unmovedCount > 0) {
          nextUnitBtn.textContent = `⏩ ${unmovedCount}`;
        }
      }
    },

    setMapViewportBottomInset(height: number): void {
      deps.canvas.style.bottom = `${height}px`;
      // With both top and bottom set, an auto height makes the canvas occupy only
      // the remaining map viewport instead of living behind the action bar.
      deps.canvas.style.height = 'auto';
      deps.renderLoop.resizeCanvas();
    },

    placeAirDefenseButton(): void {
      // Join the utility toolbar's flex row instead of an independent absolute position —
      // a second, uncoordinated top-right anchor overlapped the HUD and the toolbar's own
      // icon buttons (#783).
      const utilityToolbar = deps.getElementById('utility-toolbar');
      const pauseMenuButton = deps.getElementById('btn-pause-menu');
      if (utilityToolbar) {
        if (pauseMenuButton) utilityToolbar.insertBefore(airDefenseButton, pauseMenuButton);
        else utilityToolbar.appendChild(airDefenseButton);
      }
      const mountRoot = deps.getDrawerMountRoot();
      if (!mountRoot.contains(airDefenseLegend)) mountRoot.appendChild(airDefenseLegend);
    },

    ensureDrawerMounted(): void {
      if (drawer) return;
      drawer = createTreasuryDrawer();
      deps.getDrawerMountRoot().appendChild(drawer.element);
    },

    closeDrawer(): void {
      drawer?.close();
    },

    isDrawerOpen(): boolean {
      return drawer?.isOpen() ?? false;
    },
  };
}
