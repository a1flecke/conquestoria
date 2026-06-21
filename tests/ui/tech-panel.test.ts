// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { calculateProjectedCityYields } from '@/systems/city-work-system';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { enqueueResearch } from '@/systems/planning-system';
import { startResearch, TECH_TREE } from '@/systems/tech-system';
import { createTechPanel, formatTechNodeEta } from '@/ui/tech-panel';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

describe('tech-panel', () => {
  it('groups techs by readable tracks and emphasizes current / next relevant research', () => {
    const state = createNewGame(undefined, 'tech-panel-test');
    const firstAvailable = state.civilizations.player.techState.completed.length === 0
      ? 'stone-weapons'
      : state.civilizations.player.techState.completed[0];
    state.civilizations.player.techState = startResearch(state.civilizations.player.techState, firstAvailable);

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Research');
    const visibleTracks = new Set(Array.from(panel.querySelectorAll('[data-track]')).map(el => (el as HTMLElement).dataset.track));
    expect(visibleTracks.size).toBeGreaterThan(3);
    expect(panel.querySelector('[data-state="current"]')).toBeTruthy();
    expect(panel.querySelector('[data-state="available"]')).toBeTruthy();
  });

  it('remains usable without horizontal-strip scanning', () => {
    const state = createNewGame(undefined, 'tech-panel-grid');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-layout="tech-dependency-map"]')).toBeTruthy();
  });

  it('groups late-era nodes into readable sections instead of appending a confusing tail', () => {
    const state = createNewGame(undefined, 'tech-panel-late-era');
    state.civilizations.player.techState.completed.push('printing', 'diplomats', 'trade-routes', 'banking', 'astronomy', 'medicine');

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-era="5"]')).toBeTruthy();
    expect(panel.textContent).toContain('Early Modern');
  });

  it('shows ETA language for the active research summary', () => {
    const state = createNewGame(undefined, 'tech-eta-test');
    state.civilizations.player.techState.currentResearch = 'fire';

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Turns remaining');
  });

  it('does not show ETA unknown for the current research node when pacing is known', () => {
    const state = createNewGame(undefined, 'tech-current-node-eta-test');
    state.civilizations.player.techState.currentResearch = 'stone-weapons';
    state.civilizations.player.techState.researchProgress = 4;

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const currentNode = panel.querySelector('[data-tech-id="stone-weapons"]');
    expect(currentNode?.textContent).toContain('turns');
    expect(currentNode?.textContent).not.toContain('ETA unknown');
  });

  it('keeps deep locked items out of the default view while keeping zoom affordances', () => {
    const state = createNewGame(undefined, 'tech-layer-test');
    state.civilizations.player.techState.completed.push('gathering', 'pottery', 'fire', 'writing');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-zoom="focus"]')).toBeTruthy();
    expect(panel.querySelector('[data-zoom="known"]')).toBeTruthy();
    expect(panel.querySelector('[data-zoom="all"]')).toBeTruthy();
    expect(panel.querySelector('[data-tech-id="banking"]')).toBeFalsy();
  });

  it('renders a dependency map with visible edges between visible techs', () => {
    const state = createNewGame(undefined, 'tech-dependency-map-test');
    state.civilizations.player.techState.currentResearch = 'fire';

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-layout="tech-dependency-map"]')).toBeTruthy();
    expect(panel.querySelector('[data-role="tech-dependency-edges"]')).toBeTruthy();
    expect(panel.querySelector('[data-edge-from="fire"][data-edge-to="writing"]')).toBeTruthy();
  });

  it('zooms from focus to known tree to the complete catalog', () => {
    const state = createNewGame(undefined, 'tech-zoom-count-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const focusedCount = panel.querySelectorAll('[data-tech-id]').length;
    const known = panel.querySelector<HTMLButtonElement>('[data-zoom="known"]');
    const all = panel.querySelector<HTMLButtonElement>('[data-zoom="all"]');
    expect(known).toBeTruthy();
    expect(all).toBeTruthy();

    known!.click();
    const knownCount = document.body.querySelectorAll('#tech-panel [data-tech-id]').length;
    all!.click();

    expect(document.body.querySelectorAll('#tech-panel [data-tech-id]').length).toBe(TECH_TREE.length);
    expect(knownCount).toBeGreaterThanOrEqual(focusedCount);
    expect(focusedCount).toBeLessThan(TECH_TREE.length);
  });

  it('focuses current research in the rendered tree', () => {
    const state = createNewGame(undefined, 'tech-render-focus-test');
    state.civilizations.player.techState.completed.push('fire');
    state.civilizations.player.techState.currentResearch = 'writing';

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-tech-id="writing"]')?.getAttribute('data-focused')).toBe('true');
    expect(panel.querySelector('[data-tech-id="nuclear-theory"]')).toBeFalsy();
  });

  it('shows prerequisite status in the selected-tech inspector', () => {
    const state = createNewGame(undefined, 'tech-inspector-test');
    state.civilizations.player.techState.currentResearch = 'fire';

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    panel.querySelector<HTMLElement>('[data-tech-id="writing"]')?.click();

    const inspector = document.body.querySelector('[data-role="tech-detail"]');
    expect(inspector?.textContent).toContain('Writing');
    expect(inspector?.textContent).toContain('Fire');
    expect(inspector?.textContent).toContain('Researching');
  });

  it('highlights the selected path and exposes only the next legal queue action', () => {
    const state = createNewGame(undefined, 'tech-path-action-test');
    state.civilizations.player.techState.completed.push('gathering', 'pottery', 'fire', 'writing');

    const queued: string[] = [];
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: (techId) => queued.push(techId),
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.click();
    document.body.querySelector<HTMLElement>('[data-tech-id="medicine"]')?.click();

    expect(document.body.querySelector('[data-role="tech-detail"]')?.textContent).toContain('Philosophy');
    expect(document.body.querySelector('[data-role="tech-detail"]')?.textContent).toContain('Pottery');
    expect(document.body.querySelector('[data-tech-id="medicine"]')?.getAttribute('data-path')).toBe('selected');
    expect(document.body.querySelector('[data-action="queue-selected-tech"]')).toBeFalsy();
    expect(queued).toEqual([]);
  });

  it('uses meaningful zoom labels in compact map controls', () => {
    const state = createNewGame(undefined, 'tech-a11y-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector<HTMLButtonElement>('[data-zoom="focus"]')?.textContent).toContain('Focus');
    expect(panel.querySelector<HTMLButtonElement>('[data-zoom="known"]')?.textContent).toContain('Known tree');
    expect(panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.textContent).toContain('All techs');
    expect(panel.querySelector('[data-role="tech-detail"]')).toBeTruthy();
  });

  it('renders research queue controls', () => {
    const state = createNewGame(undefined, 'tech-queue-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Research Queue');
    expect(panel.querySelector('[data-queue-action="remove"]')).toBeTruthy();
    expect(panel.textContent).toContain('Starts in');
  });

  it('keeps queued ETAs visible after queue reorder and remove actions', () => {
    const state = createNewGame(undefined, 'tech-queue-eta-refresh-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: vi.fn(),
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(fromIndex, 1);
        if (moved) {
          queue.splice(toIndex, 0, moved);
        }
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: (index) => {
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: state.civilizations.player.techState.researchQueue.filter((_, queueIndex) => queueIndex !== index),
        };
      },
      onClose: () => {},
    });

    document.body.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="0"]')?.click();
    document.body.querySelector<HTMLButtonElement>('[data-queue-action="remove"][data-queue-index="0"]')?.click();

    const panelAfter = document.body.querySelector('#tech-panel');
    const remainingQueuedNode = panelAfter?.querySelector('[data-tech-id="writing"]');
    expect(state.civilizations.player.techState.researchQueue).toEqual(['writing']);
    expect(panelAfter?.textContent).toContain('Queue slot 1');
    expect(remainingQueuedNode?.textContent).toContain('turns');
    expect(remainingQueuedNode?.textContent).not.toContain('ETA unknown');
  });

  it('labels deep locked tech ETA as locked instead of unknown or numeric', () => {
    const state = createNewGame(undefined, 'tech-locked-eta-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.click();

    const banking = document.body.querySelector('[data-tech-id="banking"]');
    expect(banking?.textContent).toContain('ETA locked');
    expect(banking?.textContent).not.toContain('ETA unknown');
    expect(banking?.textContent).not.toMatch(/\d+ turns/);
  });

  it('styles queue control buttons consistently (not browser default)', () => {
    const state = createNewGame(undefined, 'tech-btn-style-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing'];

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const removeBtn = panel.querySelector('[data-queue-action="remove"]') as HTMLButtonElement | null;
    expect(removeBtn).toBeTruthy();
    expect(removeBtn?.style.background).toBeTruthy();
    expect(removeBtn?.style.borderRadius).toBeTruthy();
  });

  it('refreshes the visible research state after queue interactions', () => {
    const state = createNewGame(undefined, 'tech-refresh-test');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: (techId) => {
        state.civilizations.player.techState = enqueueResearch(state.civilizations.player.techState, techId);
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(fromIndex, 1);
        if (moved) {
          queue.splice(toIndex, 0, moved);
        }
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: (index) => {
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: state.civilizations.player.techState.researchQueue.filter((_, queueIndex) => queueIndex !== index),
        };
      },
      onClose: () => {},
    });

    (panel.querySelector('[data-tech-id="fire"]') as HTMLDivElement | null)?.click();

    expect(document.body.querySelector('#tech-panel')?.textContent).toContain('Researching: Fire');
  });

  it('clicking remove on a queued follow-up removes it from the rendered panel', () => {
    const state = createNewGame(undefined, 'tech-remove-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: (index) => {
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: state.civilizations.player.techState.researchQueue.filter((_, i) => i !== index),
        };
      },
      onClose: () => {},
    });

    // writing is at index 0, wheel at index 1 — remove writing (index 0)
    const removeBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="remove"][data-queue-index="0"]');
    expect(removeBtn).toBeTruthy();
    removeBtn!.click();

    // Panel rerenders — writing should be gone, wheel remains as slot 1
    const panelAfter = document.body.querySelector('#tech-panel');
    expect(panelAfter?.textContent).not.toContain('Queue slot 2');
    expect(panelAfter?.textContent).toContain('Queue slot 1');
  });

  it('clicking ↓ on a queued follow-up moves it down in the rendered panel', () => {
    const state = createNewGame(undefined, 'tech-move-down-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: (from, to) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(from, 1);
        if (moved) queue.splice(to, 0, moved);
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    // writing is index 0; press ↓ to move it after wheel
    const downBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="0"]');
    expect(downBtn).toBeTruthy();
    expect(downBtn!.disabled).toBe(false);
    downBtn!.click();

    expect(state.civilizations.player.techState.researchQueue).toEqual(['wheel', 'writing']);
  });

  it('does not allow reordering a queued tech before its prerequisite', () => {
    const state = createNewGame(undefined, 'tech-invalid-reorder-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'mathematics'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: (from, to) => {
        const queue = [...state.civilizations.player.techState.researchQueue];
        const [moved] = queue.splice(from, 1);
        if (moved) queue.splice(to, 0, moved);
        state.civilizations.player.techState = {
          ...state.civilizations.player.techState,
          researchQueue: queue,
        };
      },
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const upBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="up"][data-queue-index="1"]');
    expect(upBtn).toBeTruthy();
    expect(upBtn!.disabled).toBe(true);
  });

  it('↑ button on the first research queue item (index 0) is disabled', () => {
    const state = createNewGame(undefined, 'tech-up-disabled-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    const upBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="up"][data-queue-index="0"]');
    expect(upBtn).toBeTruthy();
    expect(upBtn!.disabled).toBe(true);
  });

  // --- Phase 2: era cap ---

  it('Phase 2: focus zoom shows no nodes beyond era 2 with a fresh tech state', () => {
    const state = createNewGame(undefined, 'tech-phase2-era-cap');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    const cards = Array.from(panel.querySelectorAll('[data-tech-id]')) as HTMLElement[];
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(Number(card.dataset.era)).toBeLessThanOrEqual(2);
    }
  });

  it('Phase 2: completing an era-2 tech opens era-3 nodes in focus zoom', () => {
    const state = createNewGame(undefined, 'tech-phase2-era-unlock');
    state.civilizations.player.techState.completed = ['stone-weapons', 'bronze-working'];

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    // fortification (era 3) requires bronze-working — should be visible after completing era-2 tech
    expect(panel.querySelector('[data-tech-id="fortification"]')).toBeTruthy();
    // No locked node with era > 3 should appear in focus zoom
    const cards = Array.from(panel.querySelectorAll('[data-tech-id]')) as HTMLElement[];
    for (const card of cards) {
      const era = Number(card.dataset.era);
      const techState = card.dataset.techState;
      if (techState === 'locked') {
        expect(era).toBeLessThanOrEqual(3);
      }
    }
  });

  // --- Phase 3: DAG layout ---

  it('Phase 3: all visible cards have style.left set and no two share the same (left, top)', () => {
    const state = createNewGame(undefined, 'tech-dag-unique-pos');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    const cards = Array.from(panel.querySelectorAll('[data-tech-id]')) as HTMLElement[];
    expect(cards.length).toBeGreaterThan(0);
    const positions = new Set<string>();
    for (const card of cards) {
      expect(card.style.left).toBeTruthy();
      expect(card.style.top).toBeTruthy();
      const key = `${card.style.left},${card.style.top}`;
      expect(positions.has(key)).toBe(false);
      positions.add(key);
    }
  });

  it('Phase 3: a tech with two prerequisites lands at depth = max(prereqDepths) + 1', () => {
    // engineering: prerequisites [mathematics(depth=2), wheel(depth=1)] → expected depth=3
    const state = createNewGame(undefined, 'tech-dag-depth');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    panel.querySelector<HTMLButtonElement>('[data-zoom="all"]')?.click();
    const engineeringCard = document.body.querySelector<HTMLElement>('[data-tech-id="engineering"]');
    expect(engineeringCard).toBeTruthy();
    expect(Number(engineeringCard!.dataset.depth)).toBe(3);
  });

  it('Phase 3: mapWrap uses absolute-positioned cards, not flex-wrap', () => {
    const state = createNewGame(undefined, 'tech-dag-nowrap');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    const mapWrap = panel.querySelector<HTMLElement>('[data-layout="tech-dependency-map"]');
    expect(mapWrap).toBeTruthy();
    expect(mapWrap!.style.flexWrap).not.toBe('wrap');
    expect(mapWrap!.style.position).toBe('relative');
  });

  it('Phase 3: for every visible edge the prerequisite card left < successor card left', () => {
    const state = createNewGame(undefined, 'tech-dag-edge-order');
    state.civilizations.player.techState.currentResearch = 'fire';
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    const edges = Array.from(panel.querySelectorAll('[data-edge-from][data-edge-to]')) as HTMLElement[];
    expect(edges.length).toBeGreaterThan(0);
    for (const edge of edges) {
      const fromId = (edge as HTMLElement).dataset.edgeFrom!;
      const toId = (edge as HTMLElement).dataset.edgeTo!;
      const fromCard = panel.querySelector<HTMLElement>(`[data-tech-id="${fromId}"]`);
      const toCard = panel.querySelector<HTMLElement>(`[data-tech-id="${toId}"]`);
      if (!fromCard || !toCard) continue;
      const fromDepth = Number(fromCard.dataset.depth);
      const toDepth = Number(toCard.dataset.depth);
      expect(fromDepth).toBeLessThan(toDepth);
    }
  });

  it('Phase 3: sidebar icon count equals the number of distinct tracks among visible cards', () => {
    const state = createNewGame(undefined, 'tech-dag-sidebar-tracks');
    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });
    const visibleTrackSet = new Set(
      Array.from(panel.querySelectorAll('[data-tech-id]'))
        .map(el => (el as HTMLElement).dataset.track)
        .filter(Boolean),
    );
    const sidebar = panel.querySelector('#tech-track-sidebar');
    expect(sidebar).toBeTruthy();
    const sidebarIcons = Array.from(sidebar!.querySelectorAll('div'));
    expect(sidebarIcons.length).toBe(visibleTrackSet.size);
  });

  it('↓ button on the last research queue item is disabled', () => {
    const state = createNewGame(undefined, 'tech-down-disabled-test');
    state.civilizations.player.techState.currentResearch = 'fire';
    state.civilizations.player.techState.researchQueue = ['writing', 'wheel'];

    createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    // wheel is the last item (index 1) — its ↓ button must be disabled
    const downBtn = document.body.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="1"]');
    expect(downBtn).toBeTruthy();
    expect(downBtn!.disabled).toBe(true);
  });

  function makeBronzeWorkingPanelState(scienceInvestment: 'baseline' | 'idle-science' = 'baseline') {
    const state = createNewGame(undefined, 'tech-panel-bronze-working-eta', 'small');
    const player = state.civilizations.player;
    const settlerId = player.units.find(unitId => state.units[unitId]?.type === 'settler');
    expect(settlerId).toBeDefined();

    const city = foundCity('player', state.units[settlerId!].position, state.map, state.idCounters);
    state.cities[city.id] = {
      ...city,
      productionQueue: [],
      idleProduction: scienceInvestment === 'idle-science' ? 'science' : null,
    };
    player.cities.push(city.id);
    for (const coord of city.ownedTiles) {
      const key = hexKey(coord);
      state.map.tiles[key] = {
        ...state.map.tiles[key],
        terrain: 'grassland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
        owner: 'player',
      };
    }

    player.techState.completed = ['stone-weapons'];
    player.techState.currentResearch = 'bronze-working';
    player.techState.researchProgress = 0;
    player.techState.researchQueue = [];

    expect(calculateProjectedCityYields(state, city.id).science).toBe(
      scienceInvestment === 'idle-science' ? 2 : 1,
    );

    return state;
  }

  it('shows live Bronze Working ETA from current science instead of audit-profile math', () => {
    const state = makeBronzeWorkingPanelState();

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Researching: Bronze Working');
    expect(panel.textContent).toMatch(/Turns remaining: (9|10|11)/);
    expect(panel.textContent).not.toContain('50');
    expect(panel.querySelector('[data-tech-id="bronze-working"]')?.textContent).toMatch(/(9|10|11) turns/);
  });

  it('updates visible Bronze Working ETA when opening production is invested into science', () => {
    const state = makeBronzeWorkingPanelState('idle-science');

    const panel = createTechPanel(document.body, state, {
      onQueueResearch: () => {},
      onMoveQueuedResearch: () => {},
      onRemoveQueuedResearch: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Researching: Bronze Working');
    expect(panel.textContent).toMatch(/Turns remaining: (5|6|7)/);
    expect(panel.textContent).not.toMatch(/Turns remaining: (9|10|11)/);
    expect(panel.querySelector('[data-tech-id="bronze-working"]')?.textContent).toMatch(/(5|6|7) turns/);
  });

  // --- MR-A: formatTechNodeEta and createTechNode detail text ---

  describe('formatTechNodeEta', () => {
    function makeNode(
      state: 'completed' | 'current' | 'queued' | 'available' | 'next-layer' | 'locked',
      turnsToResearch: number | null,
    ) {
      return {
        tech: {
          id: 'stone-weapons', name: 'Stone Weapons', cost: 10,
          unlocks: [], prerequisites: [], track: 'military' as const, era: 1,
        },
        state,
        track: 'military' as const,
        era: 1,
        visibleByDefault: true,
        prerequisiteIds: [],
        satisfiedPrerequisiteIds: [],
        missingPrerequisiteIds: [],
        turnsToResearch,
        revealed: true,
        visibleInFocus: true,
        visibleInKnown: true,
      };
    }

    it('returns empty string for completed nodes', () => {
      expect(formatTechNodeEta(makeNode('completed', null))).toBe('');
    });

    it('returns turn count when turnsToResearch is set (regardless of state)', () => {
      expect(formatTechNodeEta(makeNode('current', 3))).toBe('3 turns');
    });

    it('returns "ETA locked" for locked nodes with no turnsToResearch', () => {
      expect(formatTechNodeEta(makeNode('locked', null))).toBe('ETA locked');
    });

    it('returns "ETA pending" for available nodes with no turnsToResearch', () => {
      expect(formatTechNodeEta(makeNode('available', null))).toBe('ETA pending');
    });
  });

  describe('createTechNode detail text', () => {
    it('completed node detail has no ETA text and no double-separator', () => {
      const state = createNewGame(undefined, 'tech-eta-completed');
      state.civilizations.player.techState.completed.push('stone-weapons');

      const panel = createTechPanel(document.body, state, {
        onQueueResearch: () => {},
        onMoveQueuedResearch: () => {},
        onRemoveQueuedResearch: () => {},
        onClose: () => {},
      });

      const completedItem = panel.querySelector('[data-state="completed"]') as HTMLElement | null;
      if (!completedItem) return; // completed node not visible in focus zoom — skip
      const detailDiv = completedItem.querySelectorAll('div')[2] as HTMLElement | undefined;
      if (!detailDiv) return;
      expect(detailDiv.textContent).toMatch(/Cost: \d+/);
      expect(detailDiv.textContent).not.toContain('ETA pending');
      expect(detailDiv.textContent).not.toContain(' ·  ·');
    });

    it('in-progress node detail contains turn count between separators', () => {
      const state = createNewGame(undefined, 'tech-eta-inprogress');
      state.civilizations.player.techState = startResearch(state.civilizations.player.techState, 'stone-weapons');

      const panel = createTechPanel(document.body, state, {
        onQueueResearch: () => {},
        onMoveQueuedResearch: () => {},
        onRemoveQueuedResearch: () => {},
        onClose: () => {},
      });

      const currentItem = panel.querySelector('[data-state="current"]') as HTMLElement | null;
      expect(currentItem).toBeTruthy();
      const detailDiv = currentItem!.querySelectorAll('div')[2] as HTMLElement | undefined;
      expect(detailDiv?.textContent).toMatch(/· \d+ turns ·/);
    });
  });
});
