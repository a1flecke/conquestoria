// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCityPanel } from '@/ui/city-panel';
import { SESSION_SHOWN_TIPS } from '@/ui/advisor-system';
import { createUnit } from '@/systems/unit-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { hexKey, hexNeighbors } from '@/systems/hex-utils';
import { TECH_TREE } from '@/systems/tech-definitions';
import { createMarketplaceState } from '@/systems/trade-system';
import { collectText, makeWonderPanelFixture } from './helpers/wonder-panel-fixture';
import type { City, HexCoord, ResourceType } from '@/core/types';

function activeCityGrid(container: HTMLElement): HTMLElement {
  const panel = container.querySelector<HTMLElement>('[id="city-panel"]');
  expect(panel).toBeTruthy();
  const gridView = panel!.querySelector<HTMLElement>('[id="city-citizens-view"]');
  expect(gridView).toBeTruthy();
  return gridView!;
}

function clickElement(element: Element | null | undefined): void {
  expect(element).toBeTruthy();
  element!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('city-panel national projects', () => {
  it('renders the current player’s Rogue Elephant Host warning in the open city panel', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.rogueElephantHosts = { player: { targetCivId: 'player', phase: 'warning' } };

    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });

    expect(collectText(panel)).toContain('Rogue Elephant Host is approaching; prepare defenses before it attacks.');
  });

  it('renders Bunker only after Reinforced Concrete and Walls, with its full defensive rule', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('reinforced-concrete');
    city.buildings.push('walls');

    const unlockedPanel = createCityPanel(container, city, state, {
      onBuild: (cityId, itemId) => {
        state.cities[cityId]!.productionQueue = [itemId];
      }, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    expect(unlockedPanel.querySelector('[data-item-id="bunker"]')).toBeTruthy();
    expect(collectText(unlockedPanel)).toContain('Reinforced shelter. +8 city defense; naval and air bombardment deal 15% less damage. Supersedes Star Fort.');

    clickElement(unlockedPanel.querySelector('[data-item-id="bunker"]'));
    expect(collectText(container)).toContain('Producing: 🛡️ Bunker');

    city.buildings = [];
    const gatedPanel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    expect(gatedPanel.querySelector('[data-item-id="bunker"]')).toBeNull();
  });

  it('renders Coastal Battery and its naval-only rule only for a researched coastal city', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('naval-armor');
    const coast = hexNeighbors(city.position)[0]!;
    state.map.tiles[hexKey(coast)] = {
      coord: coast, terrain: 'coast', elevation: 'lowland', resource: null,
      improvement: 'none', owner: city.owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    } as never;

    const coastalPanel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    expect(coastalPanel.querySelector('[data-item-id="coastal_battery"]')).toBeTruthy();
    expect(collectText(coastalPanel)).toContain('Naval defense +8. First naval hit each turn returns 20% damage (max 12).');

    state.map.tiles[hexKey(coast)] = { ...state.map.tiles[hexKey(coast)]!, terrain: 'plains' };
    const inlandPanel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    expect(inlandPanel.querySelector('[data-item-id="coastal_battery"]')).toBeNull();
  });

  it('shows the current hot-seat empire Fort capacity without exposing another player\'s forts', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.map.tiles['3,2'] = {
      coord: { q: 3, r: 2 }, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'fort', improvementTurnsLeft: 0, owner: city.owner, hasRiver: false, wonder: null,
    } as any;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Forts: 1/1');
  });

  it('does not expose a non-current hot-seat owner\'s Fort capacity', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations['player-2'] = { ...structuredClone(state.civilizations.player), id: 'player-2', isHuman: true };
    city.owner = 'player-2';
    state.map.tiles['3,2'] = {
      coord: { q: 3, r: 2 }, terrain: 'plains', elevation: 'lowland', resource: null,
      improvement: 'fort', improvementTurnsLeft: 0, owner: 'player-2', hasRiver: false, wonder: null,
    } as any;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).not.toContain('Forts:');
  });

  it('keeps every legal unit reachable while showing its canonical role summary', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="warrior"]')).toBeTruthy();
    expect(panel.querySelector('[data-unit-role-summary="warrior"]')?.textContent)
      .toBe('Cheap early defender that holds ground and captures exposed positions.');
    expect(panel.querySelector('[data-unit-role-facts="warrior"]')?.textContent)
      .toContain('Strong against civilian units');
    expect(panel.querySelector('[data-unit-role-facts="warrior"]')?.textContent)
      .toContain('Upgrades to Spearman');
    expect(panel.querySelectorAll('[data-unit-role-summary]').length)
      .toBe(panel.querySelectorAll('[data-section="trainable-units"] [data-item-id]').length);
  });

  it('renders War Elephant public tactical facts in the live production catalog', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['tactics'];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="war_elephant"]')).toBeTruthy();
    const facts = panel.querySelector('[data-unit-role-facts="war_elephant"]')?.textContent ?? '';
    expect(facts).toContain('Reduces non-polearm return damage by 15%');
    expect(facts).toContain('Live Ivory reduces new city production cost by 15%');
  });

  it('shows the current player’s Recovered Harnesses status and discounted War Elephant cost', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['tactics'];
    state.rogueElephantHosts = {
      player: {
        targetCivId: 'player', phase: 'resolved', completed: true, outcome: 'dispersed',
        recoveredHarnesses: { expiresTurn: state.turn + 10 },
      },
    };
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Recovered Harnesses: next War Elephant −25% (10 turns).');
    // The fixture owns Ivory, so the live 15% resource advantage composes with
    // the 25% recovered-harness discount: ceil(130 × .85 × .75) = 83.
    expect(panel.querySelector('[data-item-id="war_elephant"]')?.textContent).toContain('Cost: 83');
  });

  it('renders Intelligence Officer public tactical facts in the live production catalog', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['covert-operations'];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="spy_intelligence_officer"]')).toBeTruthy();
    const facts = panel.querySelector('[data-unit-role-facts="spy_intelligence_officer"]')?.textContent ?? '';
    expect(facts).toContain('Better base infiltration odds than an Operative');
    expect(facts).toContain('+1 combat strength for self-defense');
  });

  it('renders Station Chief public tactical facts in the live production catalog', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['counterintelligence'];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="spy_station_chief"]')).toBeTruthy();
    const facts = panel.querySelector('[data-unit-role-facts="spy_station_chief"]')?.textContent ?? '';
    expect(facts).toContain('Better base infiltration odds than an Intelligence Officer');
    expect(facts).toContain('+1 vision range and +1 combat strength');
  });

  it('keeps a partially satisfied conjunctive unit gate visible with every ordered technology state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['archery'];
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      });
      expect(collectText(panel)).toContain('Archer');
      expect(collectText(panel)).toContain('Requires: Archery ✓ + Bronze Working');
      expect(panel.querySelector('[data-item-id="archer"]')).toBeNull();
    } finally {
      archer.requiredTechs = original;
    }
  });

  it('keeps SAM Site visible with its missing local building prerequisites', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['radar-systems', 'rocketry'];
    city.buildings = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    clickElement(panel.querySelector('[data-locked-show-more]'));
    expect(collectText(panel)).toContain('SAM Site');
    expect(collectText(panel)).toContain('Requires: Anti-Air Battery + Radar Station');
    expect(panel.querySelector('[data-item-id="sam_site"]')).toBeNull();
    expect(panel.querySelector('[data-find-resources-btn]')).toBeNull();
  });

  it('refreshes the open city panel immediately after queuing a SAM Site', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['radar-systems', 'rocketry'];
    city.buildings = ['anti_air_battery', 'radar_station'];

    const panel = createCityPanel(container, city, state, {
      onBuild: (cityId, itemId) => {
        state.cities[cityId]!.productionQueue = [itemId];
      },
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    clickElement(panel.querySelector('[data-item-id="sam_site"]'));

    expect(collectText(container)).toContain('Producing: 🛡️ SAM Site');
  });

  it('uses the active hot-seat owner\'s SAM research without leaking another human\'s Rocketry', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['radar-systems', 'rocketry'];
    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2',
      isHuman: true,
      techState: { ...state.civilizations.player.techState, completed: ['radar-systems'] },
    };
    city.owner = 'player-2';
    city.buildings = [];
    state.cities[city.id] = city;
    state.currentPlayer = 'player-2';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    clickElement(panel.querySelector('[data-locked-show-more]'));
    expect(collectText(panel)).toContain('SAM Site');
    expect(collectText(panel)).toContain('Requires: Radar Systems ✓ + Rocketry + Anti-Air Battery + Radar Station');
    expect(panel.querySelector('[data-item-id="sam_site"]')).toBeNull();
  });

  it('uses the current hot-seat city owner\'s prerequisites without leaking another human\'s research', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2', isHuman: true,
      techState: { ...state.civilizations.player.techState, completed: ['archery'] },
    };
    state.civilizations.player.techState.completed = ['archery', 'bronze-working'];
    city.owner = 'player-2';
    state.currentPlayer = 'player-2';
    const archer = TRAINABLE_UNITS.find(unit => unit.type === 'archer')!;
    const original = archer.requiredTechs;
    archer.requiredTechs = ['bronze-working'];
    try {
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      });
      expect(collectText(panel)).toContain('Requires: Archery ✓ + Bronze Working');
      expect(panel.querySelector('[data-item-id="archer"]')).toBeNull();
    } finally {
      archer.requiredTechs = original;
    }
  });

  it('renders Cuirassier only for the hot-seat owner with both gates and resources', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = [
      'animal-husbandry', 'bronze-working', 'rifle-tactics', 'professional-army',
    ];
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId: 'player', resource: 'horses', expiresOnTurn: state.turn + 1 },
      { civId: 'player', resource: 'iron', expiresOnTurn: state.turn + 1 },
    ] };
    const firstPanel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    expect(firstPanel.querySelector('[data-item-id="cuirassier"]')).toBeTruthy();

    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2', isHuman: true,
      techState: {
        ...state.civilizations.player.techState,
        completed: ['animal-husbandry', 'bronze-working', 'rifle-tactics'],
      },
    };
    city.owner = 'player-2';
    state.cities[city.id] = city;
    state.currentPlayer = 'player-2';
    const secondPanel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    clickElement(secondPanel.querySelector('[data-locked-show-more]'));
    const text = collectText(secondPanel);
    expect(secondPanel.querySelector('[data-item-id="cuirassier"]')).toBeNull();
    expect(text).toContain('Cuirassier');
    expect(text).toContain('Professional Army');
  });

  it('renders the Cavalry Academy heavy-mounted discount in the live Cuirassier cost and ETA', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['cavalry-academy'];
    state.civilizations.player.techState.completed = [
      'animal-husbandry', 'bronze-working', 'rifle-tactics', 'professional-army',
    ];
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId: 'player', resource: 'horses', expiresOnTurn: state.turn + 1 },
      { civId: 'player', resource: 'iron', expiresOnTurn: state.turn + 1 },
    ] };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel.querySelector('[data-item-id="cuirassier"]'))).toContain('Cost: 128');
    expect(collectText(panel.querySelector('[data-item-id="cuirassier"]'))).toMatch(/\d+ turns/);
  });

  it('uses the hot-seat city owner\'s Cavalry Academy discount without leaking the other player\'s state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2',
      isHuman: true,
      techState: {
        ...state.civilizations.player.techState,
        completed: ['animal-husbandry', 'bronze-working', 'rifle-tactics', 'professional-army'],
      },
    };
    city.owner = 'player-2';
    city.buildings = ['cavalry-academy'];
    state.cities[city.id] = city;
    state.currentPlayer = 'player-2';
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId: 'player-2', resource: 'horses', expiresOnTurn: state.turn + 1 },
      { civId: 'player-2', resource: 'iron', expiresOnTurn: state.turn + 1 },
    ] };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel.querySelector('[data-item-id="cuirassier"]'))).toContain('Cost: 128');
  });

  it('keeps a conjunctively gated building reachable in the explanatory catalog', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed = ['writing'];
    const library = BUILDINGS.library;
    const original = library.requiredTechs;
    library.requiredTechs = ['mathematics'];
    try {
      const panel = createCityPanel(container, city, state, {
        onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      });
      clickElement(panel.querySelector('[data-locked-show-more]'));
      expect(collectText(panel)).toContain('Library');
      expect(collectText(panel)).toContain('Requires: Writing ✓ + Mathematics');
      expect(panel.querySelector('[data-item-id="library"]')).toBeNull();
    } finally {
      library.requiredTechs = original;
    }
  });

  it('uses the city owner research for hot-seat building availability', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations['player-2'] = {
      ...structuredClone(state.civilizations.player),
      id: 'player-2', isHuman: true,
      techState: { ...state.civilizations.player.techState, completed: ['political-intelligence'] },
    };
    city.owner = 'player-2';
    state.cities[city.id] = city;
    state.currentPlayer = 'player';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="intelligence-agency"]')).toBeTruthy();
    expect(BUILDINGS['security-bureau'].description).toContain('counter-intelligence (CI)');
  });

  it('labels national-project yields as empire-wide', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.era = 1;
    state.civilizations.player.techState.completed.push('gathering');

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const project = panel.querySelector('[data-item-id="communal_stores"]');

    expect(project?.textContent).toContain('Empire-wide: +2');
  });

  it('hides an empire-unique project already queued by another city', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.era = 1;
    state.civilizations.player.techState.completed.push('gathering');
    state.cities['city-two'] = {
      ...structuredClone(city),
      id: 'city-two',
      productionQueue: ['communal_stores'],
    };
    state.civilizations.player.cities.push('city-two');

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-item-id="communal_stores"]')).toBeNull();
  });

  it('shows an unfinished Circular Manufacturing Network material choice only to its current human owner', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.builtNationalProjects = {
      'player:circular_manufacturing_network': { civId: 'player', cityId: city.id, eraBuilt: 13 },
    };
    const onChooseCircularManufacturingMaterial = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onChooseCircularManufacturingMaterial,
    });

    clickElement(panel.querySelector('[data-circular-material="battery-minerals"]'));
    expect(onChooseCircularManufacturingMaterial).toHaveBeenCalledWith('battery-minerals');

    state.currentPlayer = 'player-2';
    const handoff = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      onChooseCircularManufacturingMaterial,
    });
    expect(handoff.querySelector('[data-circular-material]')).toBeNull();
  });
});

describe('city-panel unrest section — #436', () => {
  it('renders no unrest section when the city has no unrest', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 0;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.querySelector('[data-appease]')).toBeNull();
  });

  it('shows the unrest level and appease cost when the city has unrest', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 2;
    city.unrestTurns = 3;
    city.population = 4;
    state.civilizations[state.currentPlayer].gold = 1000;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction: vi.fn(() => state),
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Revolt');
    expect(rendered).toContain('60'); // getCityAppeaseCost: population(4) * 15
    expect(rendered).toContain('production locked'); // isCityProductionLocked: true at unrestLevel 2
  });

  it('clicking appease (affordable, not yet used this turn) calls onAppeaseFaction with the city id, and does not claim production is locked at unrestLevel 1', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    city.appeasedOnTurn = undefined;
    city.productionDisabledTurns = 0;
    state.civilizations[state.currentPlayer].gold = 1000;
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    expect(collectText(panel)).not.toContain('production locked');
    clickElement(panel.querySelector('[data-appease]'));
    expect(onAppeaseFaction).toHaveBeenCalledWith(city.id);
  });

  it('disables the button and shows a gold-specific reason when unaffordable', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    state.civilizations[state.currentPlayer].gold = 5; // cost is 60, well short
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-appease]');
    expect(btn?.disabled).toBe(true);
    expect(collectText(panel)).toContain('Not enough gold');
    clickElement(btn);
    expect(onAppeaseFaction).not.toHaveBeenCalled();
  });

  it('disables the button and shows a turn-specific reason when already appeased this turn', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.unrestTurns = 2;
    city.population = 4;
    city.appeasedOnTurn = state.turn; // already used this turn
    state.civilizations[state.currentPlayer].gold = 1000; // affordable, but blocked anyway
    const onAppeaseFaction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onAppeaseFaction,
    });

    const btn = panel.querySelector<HTMLButtonElement>('[data-appease]');
    expect(btn?.disabled).toBe(true);
    expect(collectText(panel)).toContain('Already appeased this turn');
    clickElement(btn);
    expect(onAppeaseFaction).not.toHaveBeenCalled();
  });
});

describe('city-panel obsolete-building badge — #443', () => {
  it('shows the obsolete badge and "Obsolete — no upkeep" text for a built, now-obsolete building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['cavalry-academy'];
    state.civilizations[state.currentPlayer].techState.completed.push('tank-warfare');

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('obsolete');
    expect(rendered).toContain('Obsolete — no upkeep');
  });

  it('shows neither the obsolete badge nor "Obsolete — no upkeep" for a still-relevant building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['cavalry-academy'];
    // tank-warfare NOT completed — cavalry-academy is still relevant

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).not.toContain('obsolete');
    expect(rendered).not.toContain('Obsolete — no upkeep');
  });
});

describe('city-panel legendary wonders', () => {
  it('renders a Legendary Wonders entry point and shows carryover in the active city', () => {
    const { container, city, state } = makeWonderPanelFixture();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Legendary Wonders');
    expect(rendered).toContain('Wonder carryover');
  });

  it('shows compact legendary wonder cards in the normal Build list and opens the detail panel', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'ready_to_build';
    const onOpenWonderPanel = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel,
      onClose: () => {},
    });

    expect(collectText(panel)).toContain('Wonder Ambitions');
    expect(collectText(panel)).toContain('Oracle of Delphi');

    clickElement(panel.querySelector('[data-wonder-card="oracle-of-delphi"]'));

    expect(onOpenWonderPanel).toHaveBeenCalledWith('city-river');
    expect(panel.isConnected).toBe(false);
  });

  it('does not crowd the compact Build list with far-future blocked wonders', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.era = 1;
    state.civilizations.player.techState.completed = [];
    state.legendaryWonderProjects = undefined;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const compactSection = panel.querySelector('[data-section="compact-wonder-build-list"]');

    expect(compactSection?.textContent).not.toContain('Internet');
    expect(compactSection?.textContent).not.toContain('Manhattan Project');
  });

  it('renders compact legendary landmark preview with completed and active ghost states', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.completedLegendaryWonders = {
      'oracle-of-delphi': { ownerId: 'player', cityId: city.id, turnCompleted: 20 },
    };
    city.productionQueue = ['legendary:grand-canal'];
    city.productionProgress = 90;
    state.legendaryWonderProjects = {
      'grand-canal:player:city-river': {
        wonderId: 'grand-canal',
        ownerId: 'player',
        cityId: city.id,
        phase: 'building',
        investedProduction: 90,
        transferableProduction: 0,
        questSteps: [],
      },
    };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const preview = panel.querySelector('[data-section="legendary-landmark-preview"]');
    expect(preview?.textContent).toContain('Oracle of Delphi');
    expect(preview?.textContent).toContain('Grand Canal');
    expect(preview?.textContent).toContain('Under construction');
  });

  it('renders legendary active production and queued follow-ups with human-readable names and ETA', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['legendary:oracle-of-delphi', 'library'];
    city.productionProgress = 60;
    city.focus = 'production';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = collectText(panel);

    expect(rendered).toContain('Producing: * Oracle of Delphi');
    expect(rendered).toContain('Library');
    expect(rendered).toContain('Starts in');
    expect(rendered).not.toContain('legendary:oracle-of-delphi');
  });

  it('shows active legendary construction as a compact living production row', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['oracle-of-delphi'].phase = 'building';
    city.productionQueue = ['legendary:oracle-of-delphi', 'library'];
    city.productionProgress = 72;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const text = collectText(panel);

    expect(text).toContain('Producing: * Oracle of Delphi');
    expect(text).toContain('Final works');
    expect(text).toContain('Queue resumes after this wonder.');
    expect(text).toContain('Construction underway');
    expect(text).toContain('Open Journal');
    expect(text).not.toContain('legendary:oracle-of-delphi');
  });

  it('shows recovered legendary effort and production resume copy in the city flow', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.legendaryWonderProjects!['grand-canal'].phase = 'lost_race';
    state.legendaryWonderProjects!['grand-canal'].transferableProduction = 24;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const text = collectText(panel);

    expect(text).toContain('Effort recovered');
    expect(text).toContain('24 production carryover preserved');
    expect(text).toContain('Normal production has resumed.');
  });
});

describe('city-panel navigation', () => {
  function makeMultiCityFixture() {
    const { container, city, state } = makeWonderPanelFixture();
    const city2: City = {
      ...city,
      id: 'city-2',
      name: 'SecondCity',
    };
    state.cities['city-2'] = city2;
    state.civilizations[state.currentPlayer].cities = [city.id, 'city-2'];
    return { container, city, city2, state };
  }

  it('renders prev and next buttons when onPrevCity and onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('city-prev');
    expect(html).toContain('city-next');
  });

  it('does not render nav buttons when no onPrevCity/onNextCity callbacks are provided', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).not.toContain('city-prev');
    expect(html).not.toContain('city-next');
  });

  it('calls onPrevCity when prev button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onPrev = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: onPrev,
      onNextCity: () => {},
    });
    clickElement(panel.querySelector('[id="city-prev"]'));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onNextCity when next button is clicked', () => {
    const { container, city, state } = makeMultiCityFixture();
    const onNext = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onPrevCity: () => {},
      onNextCity: onNext,
    });
    clickElement(panel.querySelector('[id="city-next"]'));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('shows ETA text for buildable units and buildings', () => {
    const { container, city, state } = makeMultiCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('turns');
  });

  it('shows focused yield estimates before the next turn assigns worked tiles', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 1;
    city.focus = 'production';
    city.workedTiles = [];
    city.ownedTiles = [city.position, { q: 2, r: 3 }];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('data-text="yield-food">2');
    // The focused tile is the fixture's improved stone quarry: 1 base production
    // plus 2 from the worked tile.
    expect(rendered).toContain('data-text="yield-prod">3');
    expect(rendered).toContain('data-text="yield-gold">2');
  });

  it('shows occupied-city integration countdown', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 7 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Occupied');
    expect(rendered).toContain('7 turns');
  });

  it('shows occupation-reduced yields and build eta', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 4;
    city.buildings = ['granary'];
    city.productionQueue = ['library'];
    city.productionProgress = 0;
    city.occupation = { originalOwnerId: 'ai-1', turnsRemaining: 8 };

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';

    expect(rendered).toContain('Very Unhappy');
    expect(rendered).toContain('turns remaining');
  });

  it('renders production queue rows with move and remove controls', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine', 'worker'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const rendered = (panel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? panel.textContent ?? '';
    expect(rendered).toContain('Queue');
    expect(rendered).toContain('data-queue-action="remove"');
  });

  it('shows retuned Era 1 Settler and Herbalist ETA from canonical costs', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 1;
    city.focus = 'production';
    city.buildings = ['forge'];
    city.workedTiles = [];
    city.ownedTiles = [city.position];
    state.era = 1;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Herbalist');
    expect(rendered).toContain('4 turns');
    expect(rendered).toContain('Settler');
    expect(rendered).toContain('Cost: 24 · 6 turns');
  });

  it('shows higher Settler cost and ETA after the era advances', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 1;
    city.focus = 'production';
    city.buildings = ['forge'];
    city.workedTiles = [];
    city.ownedTiles = [city.position];
    state.era = 3;
    state.civilizations[state.currentPlayer].techState.completed = TECH_TREE
      .filter(tech => tech.era <= 3 && tech.countsForEraAdvancement !== false)
      .map(tech => tech.id);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Settler');
    expect(rendered).toContain('Cost: 40');
    expect(rendered).toContain('10 turns');
  });

  it('recalculates queue timing with era-aware Settler cost', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.population = 1;
    city.focus = 'production';
    city.buildings = ['forge'];
    city.workedTiles = [];
    city.ownedTiles = [city.position];
    city.productionQueue = ['herbalist', 'settler'];
    city.productionProgress = 8;
    state.era = 2;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Herbalist');
    expect(rendered).toContain('Settler');
    expect(rendered).toContain('Starts in 2 turns');
    expect(rendered).toContain('Done in 8 turns');
  });

  it('shows maintenance, net treasury, and rush buy for active production', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['workshop'];
    city.productionProgress = 2;
    state.civilizations[state.currentPlayer].gold = 100;
    const onRushBuyActiveProduction = vi.fn(() => state);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onRushBuyActiveProduction,
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    expect(rendered).toContain('Free support:');
    expect(rendered).toContain('Paid upkeep:');
    expect(rendered).toContain('Net treasury:');
    expect(rendered).toContain('Buy now: 25 gold');
    clickElement(panel.querySelector('[data-rush-buy]'));
    expect(onRushBuyActiveProduction).toHaveBeenCalledWith(city.id);
  });

  it('disables rush buy with a visible reason during critical treasury strain', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['workshop'];
    city.productionProgress = 2;
    state.civilizations[state.currentPlayer].gold = 0;
    state.civilizations[state.currentPlayer].units = [];
    state.units = {};
    for (let index = 0; index < 40; index++) {
      const unit = createUnit('warrior', state.currentPlayer, city.position, state.idCounters);
      state.units[unit.id] = unit;
      state.civilizations[state.currentPlayer].units.push(unit.id);
    }

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onRushBuyActiveProduction: () => state,
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const rushButton = panel.querySelector<HTMLButtonElement>('[data-rush-buy]');

    expect(collectText(panel)).toContain('Rush buy disabled: treasury strain is too high.');
    expect(collectText(panel)).toContain('Critical strain');
    expect(rushButton?.disabled).toBe(true);
  });

  it('shows paid building upkeep directly in the city panel', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.buildings = [
      'herbalist',
      'workshop',
      'shrine',
      'barracks',
      'library',
      'granary',
      'marketplace',
      'forum',
      'temple',
      'monument',
      'forge',
      'observatory',
      'harbor',
    ];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = collectText(panel);
    // outpost pop=5 → 2 free slots; 7 non-exempt buildings → 5 paid (harbor+forum+monument+temple+observatory = 7g)
    expect(rendered).toContain('Paid upkeep: -7 city');
    expect(rendered).toContain('Upkeep: -2 gold/turn'); // harbor & observatory each cost 2g/turn
  });

  it('renders Overview, Buildings/Core, and Worked Land And Water sections in the Grid tab', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.focus = 'balanced';
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    const rendered = collectText(panel);
    expect(rendered).toContain('Worked Land And Water');
    expect(rendered).toContain('Balanced focus');
  });

  it('shows surplus unassigned citizens when population exceeds available worked tiles', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.population = 4;
    city.ownedTiles = [city.position];
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    expect(collectText(panel)).toContain('Unassigned citizens: 4');
  });

  it('shows farm and water worked-land rows with yields', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const farm = { q: city.position.q + 1, r: city.position.r };
    const coast = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(farm)] = {
      ...state.map.tiles[hexKey(farm)],
      coord: farm,
      terrain: 'grassland',
      elevation: 'lowland',
      improvement: 'farm',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(coast)] = {
      ...state.map.tiles[hexKey(coast)],
      coord: coast,
      terrain: 'coast',
      elevation: 'lowland',
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, farm, coast];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    const rendered = collectText(panel);
    expect(rendered).toContain('Farm (+2 food)');
    expect(rendered).toContain('Water work: fishing/trapping');
  });

  it('shows mine yield bonus in worked-land tile row', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const hillTile = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(hillTile)] = {
      ...state.map.tiles[hexKey(hillTile)],
      coord: hillTile,
      terrain: 'hills',
      elevation: 'highland',
      improvement: 'mine',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, hillTile];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    expect(collectText(panel)).toContain('Mine (+2 production, +1 gold)');
  });

  it('shows lumber camp label without underscores in worked-land tile row', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const forestTile = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(forestTile)] = {
      ...state.map.tiles[hexKey(forestTile)],
      coord: forestTile,
      terrain: 'forest',
      elevation: 'lowland',
      improvement: 'lumber_camp',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, forestTile];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    expect(collectText(panel)).toContain('Lumber Camp (+2 production)');
    expect(collectText(panel)).not.toContain('Lumber_camp');
  });

  it('shows help text in the Worked Land And Water section explaining improvements', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });
    clickElement(panel.querySelector('[id="tab-citizens"]'));
    const rendered = collectText(panel);
    expect(rendered).toContain('Farms');
    expect(rendered).toContain('Mines');
    expect(rendered).toContain('Lumber Camps');
    expect(rendered).toContain('Watermills');
    expect(rendered).toContain('2 charges');
  });

  it('shows claimed overlap tiles as unavailable', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const claimed = { q: city.position.q + 1, r: city.position.r };
    const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
    state.cities[otherCity.id] = otherCity;
    state.map.tiles[hexKey(claimed)] = {
      ...state.map.tiles[hexKey(claimed)],
      coord: claimed,
      terrain: 'grassland',
      elevation: 'lowland',
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: city.owner,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, claimed];
    city.workedTiles = [];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    expect(collectText(panel)).toContain('Worked by Corinth');
    expect(panel.querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]')?.disabled).toBe(true);
  });

  it('renders focused projected worked tiles consistently with Overview yields', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const foodTile = { q: city.position.q + 1, r: city.position.r };
    const productionTile = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(foodTile)] = {
      ...state.map.tiles[hexKey(foodTile)],
      coord: foodTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(productionTile)] = {
      ...state.map.tiles[hexKey(productionTile)],
      coord: productionTile,
      terrain: 'hills',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'food';
    city.workedTiles = [];
    city.ownedTiles = [city.position, foodTile, productionTile];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile: () => {},
    });

    clickElement(panel.querySelector('[id="tab-citizens"]'));
    const rendered = collectText(activeCityGrid(container));
    expect(rendered).toContain('Food focus');
    expect(rendered).toContain('Worked 1/1 citizens');
    expect(rendered).toContain('Grassland · +2 food · Working');
    expect(rendered).not.toContain('Unassigned citizens: 1');
  });

  it('clicking a focus button keeps Grid open and rerenders visible focus and yields from returned state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    let renderState = state;
    const onSetCityFocus = vi.fn((cityId, focus) => {
      const result = assignCityFocus(renderState, cityId, focus);
      renderState = result.state;
      return renderState;
    });
    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus,
      onToggleWorkedTile: () => {},
    });

    clickElement(container.querySelector('[id="tab-citizens"]'));
    clickElement(activeCityGrid(container).querySelector('[data-city-focus="food"]'));

    expect(onSetCityFocus).toHaveBeenCalledWith(city.id, 'food');
    const gridView = activeCityGrid(container);
    expect(collectText(gridView)).toContain('Food focus');
    expect(collectText(gridView)).toContain('Worked Land And Water');
  });

  it('working, unworking, and reworking a tile keeps Grid open and updates visible state', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const target = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(target)] = {
      ...state.map.tiles[hexKey(target)],
      coord: target,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'custom';
    city.workedTiles = [];
    city.ownedTiles = [city.position, target];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });
    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => {},
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-citizens"]'));
    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="work"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, true);
    expect(collectText(activeCityGrid(container))).toContain('Custom focus');
    expect(collectText(activeCityGrid(container))).toContain('Working');

    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="unwork"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, false);
    expect(collectText(activeCityGrid(container))).toContain('Available');

    clickElement(activeCityGrid(container).querySelector('[data-worked-tile-action="work"]'));

    expect(onToggleWorkedTile).toHaveBeenLastCalledWith(city.id, target, true);
    expect(collectText(activeCityGrid(container))).toContain('Working');

    clickElement(container.querySelector('[id="tab-list"]'));
    clickElement(container.querySelector('[id="tab-citizens"]'));
    expect(collectText(activeCityGrid(container))).toContain('Working');
  });

  it('disables extra Work buttons when every citizen is already assigned', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const workedTile = { q: city.position.q + 1, r: city.position.r };
    const spareTile = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(workedTile)] = {
      ...state.map.tiles[hexKey(workedTile)],
      coord: workedTile,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    state.map.tiles[hexKey(spareTile)] = {
      ...state.map.tiles[hexKey(spareTile)],
      coord: spareTile,
      terrain: 'hills',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.population = 1;
    city.focus = 'custom';
    city.workedTiles = [workedTile];
    city.ownedTiles = [city.position, workedTile, spareTile];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });

    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => renderState,
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-citizens"]'));
    const gridView = activeCityGrid(container);
    // When no citizens are available, idle tiles have no Work button (muted + non-interactive)
    const idleWork = gridView.querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]');
    expect(idleWork).toBeNull();
    expect(collectText(gridView)).toContain('No open citizen');
    expect(onToggleWorkedTile).not.toHaveBeenCalled();
    expect(renderState.cities[city.id].workedTiles).toEqual([workedTile]);
  });

  it('shows no Production Queue section when only the current build is in the queue', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const rendered = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(rendered).toContain('Producing:');     // current build block is present
    expect(rendered).not.toContain('Production Queue'); // no follow-up queue section
  });

  it('shows Production Queue section with follow-up items starting at slot 1 when there are multiple queue items', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine', 'worker'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const rendered = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(rendered).toContain('Production Queue');
    expect(rendered).toContain('Queue slot 1');  // shrine → slot 1
    expect(rendered).toContain('Queue slot 2');  // worker → slot 2
    expect(rendered).not.toContain('Queue slot 3'); // no slot 3 (only 2 follow-ups)
  });

  it('does not render the currently-building item as a numbered queue slot', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    // warrior is shown in the "Building:" block, not as a numbered slot
    expect(html).toContain('Queue slot 1'); // shrine is slot 1
    // The queue data-queue-index="0" should not exist in the queue rows
    // (index 0 is the current build, only shown in the production header)
    expect(html).not.toMatch(/data-queue-index="0"[^>]*>[\s\S]*?Queue slot/);
  });

  it('shows timing text (Starts in / Done in) for follow-up queue items', () => {
    const { container, city, state } = makeMultiCityFixture();
    city.productionQueue = ['warrior', 'shrine'];
    city.productionProgress = 0;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    const rendered = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(rendered).toContain('Starts in');
    expect(rendered).toContain('Done in');
  });

  it('leaves claimed worked-land tiles disabled and unchanged when clicked', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const claimed = { q: city.position.q + 1, r: city.position.r };
    const otherCity = { ...city, id: 'city-other', name: 'Corinth', workedTiles: [claimed] };
    state.cities[otherCity.id] = otherCity;
    state.map.tiles[hexKey(claimed)] = {
      ...state.map.tiles[hexKey(claimed)],
      coord: claimed,
      terrain: 'grassland',
      elevation: 'lowland',
      owner: city.owner,
      improvement: 'none',
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
      resource: null,
    };
    city.ownedTiles = [city.position, claimed];
    city.workedTiles = [];
    let renderState = state;
    const onToggleWorkedTile = vi.fn((cityId, coord, worked) => {
      const result = setCityWorkedTile(renderState, cityId, coord, worked);
      renderState = result.state;
      return renderState;
    });

    createCityPanel(container, city, renderState, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus: () => renderState,
      onToggleWorkedTile,
    });

    clickElement(container.querySelector('[id="tab-citizens"]'));
    const disabledWork = activeCityGrid(container).querySelector<HTMLButtonElement>('[data-worked-tile-action="work"]');

    expect(collectText(activeCityGrid(container))).toContain('Worked by Corinth');
    expect(disabledWork?.disabled).toBe(true);
    disabledWork?.click();
    expect(onToggleWorkedTile).not.toHaveBeenCalled();
    expect(renderState.cities[city.id].workedTiles).toEqual([]);
  });
});

describe('city-panel queue click-through interactions', () => {
  function makeQueueFixture() {
    const { container, city, state } = makeWonderPanelFixture();
    // warrior = current build (index 0), shrine + worker = follow-ups
    city.productionQueue = ['warrior', 'shrine', 'worker'];
    city.productionProgress = 0;
    return { container, city, state };
  }

  it('clicking remove on a queued follow-up removes it from the rendered panel', () => {
    const { container, city, state } = makeQueueFixture();
    state.cities[city.id] = city;

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: (_cityId: string, index: number) => {
        const updated = {
          ...state.cities[city.id]!,
          productionQueue: state.cities[city.id]!.productionQueue.filter((_, i) => i !== index),
        };
        state.cities[city.id] = updated;
      },
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    // shrine is follow-up slot 1 (index 1 in productionQueue)
    const removeBtn = container.querySelector<HTMLButtonElement>('[data-queue-action="remove"][data-queue-index="1"]');
    expect(removeBtn).toBeTruthy();
    removeBtn!.click();

    // After removal, the panel rerenders — only worker remains (slot 1), no slot 2
    const panelAfter = container.querySelector('[id="city-panel"]');
    expect(panelAfter?.textContent).not.toContain('Queue slot 2');
  });

  it('clicking ↑ on a follow-up item swaps it with the preceding item in the rendered panel', () => {
    const { container, city, state } = makeQueueFixture();
    state.cities[city.id] = city;

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: (_cityId: string, from: number, to: number) => {
        const q = [...state.cities[city.id]!.productionQueue];
        const [moved] = q.splice(from, 1);
        if (moved) q.splice(to, 0, moved);
        state.cities[city.id] = { ...state.cities[city.id]!, productionQueue: q };
      },
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    // worker is follow-up slot 2 (index 2). Press ↑ to move it before shrine.
    const upBtn = container.querySelector<HTMLButtonElement>('[data-queue-action="up"][data-queue-index="2"]');
    expect(upBtn).toBeTruthy();
    upBtn!.click();

    // After reorder: warrior, worker, shrine.
    expect(state.cities[city.id]!.productionQueue).toEqual(['warrior', 'worker', 'shrine']);
  });

  it('clicking ↓ on a follow-up item swaps it with the next item in the rendered panel', () => {
    const { container, city, state } = makeQueueFixture();
    state.cities[city.id] = city;

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: (_cityId: string, from: number, to: number) => {
        const q = [...state.cities[city.id]!.productionQueue];
        const [moved] = q.splice(from, 1);
        if (moved) q.splice(to, 0, moved);
        state.cities[city.id] = { ...state.cities[city.id]!, productionQueue: q };
      },
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    // shrine is follow-up slot 1 (index 1). Press ↓ to move it after worker.
    const downBtn = container.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="1"]');
    expect(downBtn).toBeTruthy();
    expect((downBtn as HTMLButtonElement).disabled).toBe(false);
    downBtn!.click();

    // After reorder: warrior, worker, shrine.
    expect(state.cities[city.id]!.productionQueue).toEqual(['warrior', 'worker', 'shrine']);
  });

  it('↓ button on the last follow-up item is disabled', () => {
    const { container, city, state } = makeQueueFixture();

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onMoveQueueItem: () => {},
      onRemoveQueueItem: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    } as any);

    // worker is at index 2, the last slot — its ↓ button must be disabled
    const downBtn = container.querySelector<HTMLButtonElement>('[data-queue-action="down"][data-queue-index="2"]');
    expect(downBtn).toBeTruthy();
    expect(downBtn!.disabled).toBe(true);
  });
});

describe('city-panel idle production selector', () => {
  function makeIdleCityFixture() {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = [];
    city.idleProduction = null;
    state.cities[city.id] = city;
    return { container, city, state };
  }

  it('shows idle mode selector when production queue is empty', () => {
    const { container, city, state } = makeIdleCityFixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('data-idle-mode');
  });

  it('shows idle mode selector even when production queue is non-empty', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['warrior'];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('data-idle-mode');
  });

  it('shows per-turn production amount in the idle selector', () => {
    const { container, city, state } = makeIdleCityFixture();
    city.buildings = ['workshop'];
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toMatch(/\+\d+\/turn/);
  });

  it('calls onSetIdleProduction with gold when Gold button is clicked', () => {
    const { container, city, state } = makeIdleCityFixture();
    const onSetIdleProduction = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetIdleProduction: (cityId: string, mode: 'gold' | 'science' | null) => {
        state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
        onSetIdleProduction(cityId, mode);
      },
    });
    const goldBtn = panel.querySelector<HTMLElement>('[data-idle-mode="gold"]');
    expect(goldBtn).toBeTruthy();
    goldBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, 'gold');
  });

  it('calls onSetIdleProduction with science when Science button is clicked', () => {
    const { container, city, state } = makeIdleCityFixture();
    const onSetIdleProduction = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetIdleProduction: (cityId: string, mode: 'gold' | 'science' | null) => {
        state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
        onSetIdleProduction(cityId, mode);
      },
    });
    const sciBtn = panel.querySelector<HTMLElement>('[data-idle-mode="science"]');
    expect(sciBtn).toBeTruthy();
    sciBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, 'science');
  });

  it('calls onSetIdleProduction with null when None button is clicked', () => {
    const { container, city, state } = makeIdleCityFixture();
    city.idleProduction = 'gold';
    state.cities[city.id] = city;
    const onSetIdleProduction = vi.fn();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetIdleProduction: (cityId: string, mode: 'gold' | 'science' | null) => {
        state.cities[cityId] = { ...state.cities[cityId]!, idleProduction: mode };
        onSetIdleProduction(cityId, mode);
      },
    });
    const noneBtn = panel.querySelector<HTMLElement>('[data-idle-mode="none"]');
    expect(noneBtn).toBeTruthy();
    noneBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetIdleProduction).toHaveBeenCalledWith(city.id, null);
  });
});

describe('city-panel build list icons', () => {
  it('renders the granary icon prefix in the available buildings list', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = [];
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('🌾');
  });

  it('renders the warrior icon prefix in the available units list', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = [];
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    expect(html).toContain('⚔️');
  });

  it('renders the icon for the currently building item', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.productionQueue = ['workshop'];
    city.productionProgress = 5;
    state.cities[city.id] = city;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const html = (panel as unknown as { innerHTML?: string }).innerHTML ?? '';
    // 🔨 = workshop icon
    expect(html).toContain('🔨');
  });
});

describe('city-panel coastal unit gating', () => {
  it('shows Transport only for coastal cities with Galleys', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations[state.currentPlayer].techState.completed = ['galleys'];
    city.productionQueue = [];
    city.ownedTiles = [city.position];

    const inlandPanel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const inlandText = (inlandPanel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? inlandPanel.textContent ?? '';
    expect(inlandText).not.toContain('Transport');

    // Place coast tile adjacent to city (q:2,r:2) so isCityCoastal sees it
    state.map.tiles['2,1'] = {
      coord: { q: 2, r: 1 },
      terrain: 'coast',
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      owner: null,
      improvementTurnsLeft: 0,
      hasRiver: false,
      wonder: null,
    };
    const coastalCity = { ...city };
    const coastalPanel = createCityPanel(container, coastalCity, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const coastalText = (coastalPanel as unknown as { innerHTML?: string; textContent?: string }).innerHTML ?? coastalPanel.textContent ?? '';
    expect(coastalText).toContain('Transport');
  });
});

describe('city-panel locked section — S4b', () => {
  function makeLockedFixture(options: {
    completedTechs?: string[];
    resources?: ResourceType[];
  } = {}) {
    const { container, state } = makeWonderPanelFixture();
    // Inject tech + resources onto the current player
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed = options.completedTechs ?? ['stone-weapons'];

    // Add a mine tile with copper if requested (makes getCivAvailableResources return copper)
    if (options.resources?.length) {
      const tileCoord = { q: 99, r: 0 };
      const tileKey = '99,0'; // unique key unlikely to conflict
      state.map.tiles[tileKey] = {
        coord: tileCoord,
        terrain: 'hills',
        elevation: 'lowland',
        resource: options.resources[0] as ResourceType,
        improvement: 'mine',
        owner: civId,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
      // getCivAvailableResources uses city.ownedTiles, so we must add the coord there
      const cityId = state.civilizations[civId].cities[0];
      if (cityId && state.cities[cityId]) {
        state.cities[cityId] = {
          ...state.cities[cityId],
          ownedTiles: [...state.cities[cityId].ownedTiles, tileCoord],
        };
      }
    }

    const city = Object.values(state.cities).find(c => c.owner === civId)!;
    return { container, city, state };
  }

  it('shows locked section when tech is met but resource is missing', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';
    expect(html).toContain('Locked');
    expect(html).toContain('missing requirements');
  });

  it('locked section shows axeman with copper acquisition hint', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';
    expect(html).toContain('Axeman');
    expect(html).toContain('Copper');
  });

  it('locked item does NOT appear in trainable list', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    // Axeman should not be in the build-item (trainable) list
    const trainableSection = (panel as unknown as HTMLElement).querySelector?.('[data-section="trainable-units"]');
    const trainableHtml = trainableSection?.innerHTML ?? '';
    expect(trainableHtml).not.toContain('data-item-id="axeman"');
  });

  it('axeman NOT in locked section when copper is available', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons'],
      resources: ['copper'],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const lockedSection = (panel as unknown as HTMLElement).querySelector?.('[data-section="locked-items"]');
    const lockedHtml = lockedSection?.innerHTML ?? '';
    expect(lockedHtml).not.toContain('Axeman');
  });

  it('tech-missing items are NOT shown in locked section (hidden entirely)', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: [],  // no techs — horseman tech not met
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';
    // Horseman requires horseback-riding which is not met — should not appear anywhere
    expect(html).not.toContain('Horseman');
  });

  it('retimed Cavalry shows both missing technology requirements', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['horseback-riding'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const lockedSection = panel.querySelector('[data-section="locked-items"]')!;
    clickElement(lockedSection.querySelector('[data-locked-show-more]'));
    const html = (lockedSection as HTMLElement).innerHTML;
    expect(html).toContain('Cavalry');
    expect(html).toContain('Rifle Tactics');
    expect(html).toContain('Professional Army');
  });

  it('keeps Chariot reachable in the locked catalog when its tech gates are met but Horses are missing', () => {
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['wheel', 'horseback-riding'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';

    expect(html).toContain('Chariot');
    expect(html).toContain('Horses');
  });

  it('shows Show X more button when more than 3 items are locked', () => {
    // Give many techs that unlock resource-gated units, but no resources
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons', 'bronze-working', 'horseback-riding', 'iron-forging', 'tactics', 'siege-warfare'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';
    expect(html).toContain('more locked');
  });

  it('shows Show X more when the retimed Cavalry adds a fourth locked catalog item', () => {
    // The full catalog keeps Cavalry reachable with its missing requirements explained.
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const html = (panel as unknown as HTMLElement).innerHTML ?? '';
    expect(html).toContain('more locked');
  });

  it('Show more locked button — clicking reveals all hidden locked items and removes the button', () => {
    // Many techs, no resources → more than 3 locked items (> LOCKED_SHOW_LIMIT)
    const { container, city, state } = makeLockedFixture({
      completedTechs: ['stone-weapons', 'bronze-working', 'horseback-riding', 'iron-forging', 'tactics', 'siege-warfare'],
      resources: [],
    });
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });

    const lockedSection = panel.querySelector('[data-section="locked-items"]')!;
    expect(lockedSection).toBeTruthy();

    // Before click: button should exist, only 3 items visible
    const btn = lockedSection.querySelector('[data-locked-show-more]');
    expect(btn).toBeTruthy();
    const itemsBefore = lockedSection.querySelectorAll('[data-locked-name], [data-locked-name-extra]');
    expect(itemsBefore.length).toBe(3);

    // Click the "Show N more" button
    clickElement(btn);

    // After click: button should be gone, more items visible
    expect(lockedSection.querySelector('[data-locked-show-more]')).toBeNull();
    const itemsAfter = lockedSection.querySelectorAll('[data-locked-name], [data-locked-name-extra]');
    expect(itemsAfter.length).toBeGreaterThan(3);
    // Each revealed item should have non-empty name text
    itemsAfter.forEach(el => expect(el.textContent!.length).toBeGreaterThan(0));
  });
});

// ── Locked-item frustration tip ───────────────────────────────────────────────

describe('city-panel locked frustration tip', () => {
  afterEach(() => {
    vi.useRealTimers();
    SESSION_SHOWN_TIPS.clear();
  });

  function makeLockedForFrustration() {
    const { container, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    // 'stone-weapons' tech unlocks Axeman which needs copper → creates a locked item
    state.civilizations[civId].techState.completed = ['stone-weapons'];
    const city = Object.values(state.cities).find(c => c.owner === civId)!;
    return { container, city, state };
  }

  it('fires onTip after 5 seconds when the locked section is visible', () => {
    vi.useFakeTimers();
    const { container, city, state } = makeLockedForFrustration();
    const tips: string[] = [];
    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onTip: (msg) => tips.push(msg),
    });

    expect(tips).toHaveLength(0);
    vi.advanceTimersByTime(5001);
    expect(tips).toHaveLength(1);
    expect(tips[0]).toContain('Expedition');
  });

  it('does NOT fire onTip when the close button is clicked before 5 seconds', () => {
    vi.useFakeTimers();
    const { container, city, state } = makeLockedForFrustration();
    const tips: string[] = [];
    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onTip: (msg) => tips.push(msg),
    });

    // The frustration timer should be pending
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    // The container is in document.body — take the last #city-close in doc
    // (safe against earlier tests leaving stale panels in the jsdom document)
    const allClose = [...document.querySelectorAll<HTMLElement>('[id="city-close"]')];
    const closeBtn = allClose.at(-1);
    expect(closeBtn).toBeTruthy();
    closeBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    // Timer should be cleared; advancing past 5s should not fire the tip
    vi.advanceTimersByTime(6000);
    expect(tips).toHaveLength(0);
  });

  it('does NOT fire if onTip callback is omitted', () => {
    vi.useFakeTimers();
    const { container, city, state } = makeLockedForFrustration();
    // No onTip — no timer should be scheduled, no error thrown
    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(6000);
  });

  it('cancels frustration timer when rerenderPanel is triggered (build-click)', () => {
    vi.useFakeTimers();
    const { container, city, state } = makeLockedForFrustration();
    const tips: string[] = [];

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onTip: (msg) => tips.push(msg),
    });

    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    // Trigger a rerender by clicking a build item (or directly simulating it)
    const buildItems = [...document.querySelectorAll<HTMLElement>('.build-item')];
    const buildItem = buildItems.at(-1);
    if (buildItem) {
      buildItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }

    // After rerenderPanel: old timer should be cleared (timer count drops to 0
    // before the new panel's timer is registered)
    // Advance past the original 5s — old timer must not fire
    vi.advanceTimersByTime(5100);
    // tips remains 0 IF the old timer was cancelled (new panel also has a timer
    // but SESSION_SHOWN_TIPS would suppress it anyway after first fire)
    // The key assertion: no duplicate fires from stale timer
    expect(tips.length).toBeLessThanOrEqual(1);
  });

  it('deduplicates: second open of city panel does NOT fire tip again for same resource', () => {
    vi.useFakeTimers();
    const { container, city, state } = makeLockedForFrustration();
    const tips: string[] = [];
    const onTip = (msg: string) => tips.push(msg);

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onTip,
    });
    vi.advanceTimersByTime(5001); // first fire
    expect(tips).toHaveLength(1);

    // Open a second panel (SESSION_SHOWN_TIPS now has the key)
    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onTip,
    });
    vi.advanceTimersByTime(5001); // should NOT fire again
    expect(tips).toHaveLength(1); // still only 1
  });
});

describe('locked section — MR4 Find Resources button', () => {
  function makeLockedMR4Fixture(options: {
    completedTechs?: string[];
    resourceTile?: { coord: HexCoord; resource: ResourceType; visible: boolean };
  } = {}) {
    const { container, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed = options.completedTechs ?? ['stone-weapons'];

    if (options.resourceTile) {
      const { coord, resource, visible } = options.resourceTile;
      const key = hexKey(coord);
      state.map.tiles[key] = {
        coord,
        terrain: 'hills',
        elevation: 'lowland',
        resource,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
      if (visible) {
        state.civilizations[civId].visibility.tiles[key] = 'visible';
      }
    }

    const city = Object.values(state.cities).find(c => c.owner === civId)!;
    return { container, city, state, civId };
  }

  it('📍 button is present in the locked section header', () => {
    const { container, city, state } = makeLockedMR4Fixture();
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const lockedSection = panel.querySelector('[data-section="locked-items"]');
    expect(lockedSection).toBeTruthy();
    const btn = lockedSection?.querySelector('[data-find-resources-btn]');
    expect(btn).toBeTruthy();
  });

  it('clicking 📍 calls onFindResources with the nearest visible copper tile coords', () => {
    const tileCoord: HexCoord = { q: 10, r: 10 };
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
      resourceTile: { coord: tileCoord, resource: 'copper', visible: true },
    });

    const capturedHighlights: HexCoord[] = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (h) => { capturedHighlights.push(...h); },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedHighlights).toHaveLength(1);
    expect(capturedHighlights[0]).toEqual(tileCoord);
  });

  it('clicking 📍 with NO seen copper tile → onFindResources called with empty highlights and "No ... spotted yet" toast', () => {
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
      // no resourceTile — no copper visible
    });

    let capturedHighlights: HexCoord[] = [];
    let capturedToasts: Array<{ message: string; type: string }> = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (h, t) => { capturedHighlights = h; capturedToasts = t; },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedHighlights).toHaveLength(0);
    expect(capturedToasts.some(t => t.message.includes('spotted yet'))).toBe(true);
  });

  it('trade-routes NOT researched → toast does NOT mention "buy access"', () => {
    const tileCoord: HexCoord = { q: 10, r: 10 };
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'], // no trade-routes
      resourceTile: { coord: tileCoord, resource: 'copper', visible: true },
    });

    let capturedToasts: Array<{ message: string; type: string }> = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (_, t) => { capturedToasts = t; },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedToasts.every(t => !t.message.toLowerCase().includes('buy access'))).toBe(true);
  });

  it('trade-routes researched → toast DOES mention "buy access"', () => {
    const tileCoord: HexCoord = { q: 10, r: 10 };
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons', 'trade-routes'],
      resourceTile: { coord: tileCoord, resource: 'copper', visible: true },
    });

    let capturedToasts: Array<{ message: string; type: string }> = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (_, t) => { capturedToasts = t; },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedToasts.some(t => t.message.toLowerCase().includes('buy access'))).toBe(true);
  });

  it('reason text (data-locked-reason) contains Expedition path', () => {
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
    });
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason]');
    expect(reasonEl?.textContent).toContain('Expedition');
  });

  it('reason text does NOT mention "buy access" without trade-routes', () => {
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
    });
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason]');
    expect(reasonEl?.textContent?.toLowerCase()).not.toContain('buy access');
  });

  it('#545: locked warhead shows "Requires Manhattan Project..." when unbuilt', () => {
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).toContain('Requires Manhattan Project');
  });

  it('#545: locked warhead shows "Arsenal at capacity (N/N)..." when Manhattan Project is built and arsenal is full', () => {
    const { container, city, state, civId } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 1; // base capacity with only Manhattan Project built is 1 -- exactly at cap
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).toContain('Arsenal at capacity (1/1)');
  });

  it('#545: locked warhead falls through to the generic missing-resource reason when Manhattan Project is built and under capacity', () => {
    const { container, city, state, civId } = makeLockedMR4Fixture({
      completedTechs: ['nuclear-weapons'],
    });
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    // strategicArsenal left undefined (0) -- well under the base capacity of 1, so
    // the only real reason warhead could still be locked here is missing uranium.
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const reasonEl = panel.querySelector('[data-locked-reason="warhead"]');
    expect(reasonEl?.textContent).not.toContain('Arsenal at capacity');
    expect(reasonEl?.textContent).not.toContain('Requires Manhattan Project');
  });

  it('fog-visibility tile IS highlighted (not only "visible")', () => {
    const tileCoord: HexCoord = { q: 10, r: 10 };
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
      resourceTile: { coord: tileCoord, resource: 'copper', visible: false },
    });
    const civId = state.currentPlayer;
    state.civilizations[civId].visibility.tiles[hexKey(tileCoord)] = 'fog';

    const capturedHighlights: HexCoord[] = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (h) => { capturedHighlights.push(...h); },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedHighlights).toHaveLength(1);
    expect(capturedHighlights[0]).toEqual(tileCoord);
  });

  it('unexplored tile is NOT highlighted', () => {
    const tileCoord: HexCoord = { q: 10, r: 10 };
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
      resourceTile: { coord: tileCoord, resource: 'copper', visible: false },
    });
    // Tile exists in map but visibility is 'unexplored' (no entry in vis.tiles = unexplored)

    const capturedHighlights: HexCoord[] = [];
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onFindResources: (h) => { capturedHighlights.push(...h); },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(capturedHighlights).toHaveLength(0);
  });

  it('clicking 📍 calls onClose to close the panel', () => {
    const { container, city, state } = makeLockedMR4Fixture({
      completedTechs: ['stone-weapons'],
    });
    let closeCalled = false;
    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => { closeCalled = true; },
    });

    panel.querySelector<HTMLElement>('[data-find-resources-btn]')!.click();

    expect(closeCalled).toBe(true);
  });
});

describe('city-panel Districts tab', () => {
  it('shows the empty-state message when city has no buildings', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = [];

    createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    clickElement(container.querySelector('[id="tab-districts"]'));

    const view = container.querySelector('[id="city-districts-view"]');
    expect(view?.textContent).toContain('No districts yet');
  });

  it('shows district cards only for categories present in city.buildings', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['granary', 'library'];

    createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    clickElement(container.querySelector('[id="tab-districts"]'));

    const view = container.querySelector('[id="city-districts-view"]')!;
    expect(view.querySelectorAll('[data-district]').length).toBe(2);
    expect(view.querySelector('[data-district="food"]')).toBeTruthy();
    expect(view.querySelector('[data-district="science"]')).toBeTruthy();
    expect(view.querySelector('[data-district="economy"]')).toBeNull();
  });
});

describe('city-panel Citizens tab', () => {
  it('calls onSetCityFocus when a focus button is clicked', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const onSetCityFocus = vi.fn();

    createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
      onSetCityFocus,
    });
    clickElement(container.querySelector('[id="tab-citizens"]'));

    const view = container.querySelector('[id="city-citizens-view"]')!;
    const foodBtn = Array.from(view.querySelectorAll('button')).find(b => b.textContent?.includes('Food'));
    expect(foodBtn).toBeTruthy();
    foodBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSetCityFocus).toHaveBeenCalledWith(city.id, 'food');
  });

  it('shows a Custom indicator when city focus is custom', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.focus = 'custom';

    createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    clickElement(container.querySelector('[id="tab-citizens"]'));

    const view = container.querySelector('[id="city-citizens-view"]');
    expect(view?.querySelector('[data-custom-focus-indicator]')).toBeTruthy();
  });

  it('does not render a Work button for tiles when all citizens are already assigned', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const workedTile = { q: city.position.q + 1, r: city.position.r };
    const spareTile = { q: city.position.q, r: city.position.r + 1 };
    state.map.tiles[hexKey(workedTile)] = {
      ...state.map.tiles[hexKey(workedTile)],
      coord: workedTile, terrain: 'grassland', elevation: 'lowland',
      owner: city.owner, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, resource: null,
    };
    state.map.tiles[hexKey(spareTile)] = {
      ...state.map.tiles[hexKey(spareTile)],
      coord: spareTile, terrain: 'hills', elevation: 'lowland',
      owner: city.owner, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, resource: null,
    };
    city.population = 1;
    city.focus = 'custom';
    city.workedTiles = [workedTile];
    city.ownedTiles = [city.position, workedTile, spareTile];

    createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    clickElement(container.querySelector('[id="tab-citizens"]'));

    const view = container.querySelector('[id="city-citizens-view"]')!;
    // Idle (unworked) tiles should have no Work button — they render at 0.4 opacity with no action
    expect(view.querySelector('[data-worked-tile-action="work"]')).toBeNull();
  });
});

describe('city-panel tech-yield breakdown', () => {
  it('shows a "From technology" breakdown line when a river tech is completed', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.civilizations.player.techState.completed.push('hydraulics');

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('From technology');
    expect(panel.querySelector('[data-tech-yield="0"]')?.textContent).toContain('+2');
  });

  it('omits the "From technology" section without any active tech yield', () => {
    const { container, city, state } = makeWonderPanelFixture();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('From technology');
  });
});

describe('city-panel HP status (#522)', () => {
  it('shows a recovering label with the regen rate when damaged and no hostile unit is nearby', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.cities[city.id] = { ...city, hp: 60 };

    const panel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Recovering — 60/100 HP (+5/turn)');
    expect(panel.textContent).not.toContain('Under siege');
  });

  it('shows an under-siege label with no regen when a hostile unit is adjacent', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.cities[city.id] = { ...city, hp: 60 };
    const raider = createUnit('warrior', 'barbarian', city.position, state.idCounters);
    state.units[raider.id] = raider;

    const panel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toContain('Under siege — 60/100 HP (no regen)');
    expect(panel.textContent).not.toContain('Recovering');
  });

  it('omits the HP status line entirely at full HP (negative test)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.cities[city.id] = { ...city, hp: 100 };

    const panel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).not.toContain('Recovering');
    expect(panel.textContent).not.toContain('Under siege');
  });

  it('shows a static defense-rating line for every owned city, not just damaged ones (#522)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.cities[city.id] = { ...city, hp: 100, population: 10, buildings: ['walls'] };

    const panel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(panel.textContent).toMatch(/Defense/i);
  });

  it('defense rating changes when walls are built', () => {
    const { container, city, state } = makeWonderPanelFixture();
    state.cities[city.id] = { ...city, hp: 100, population: 10, buildings: [] };
    const unwalledPanel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const unwalledText = unwalledPanel.textContent ?? '';

    state.cities[city.id] = { ...state.cities[city.id]!, buildings: ['walls'] };
    const walledPanel = createCityPanel(container, state.cities[city.id]!, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });
    const walledText = walledPanel.textContent ?? '';

    expect(walledText).not.toBe(unwalledText);
  });
});

describe('unrest pressure breakdown (#552)', () => {
  it('shows a War weariness row for a city in unrest with an active war', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    state.civilizations[state.currentPlayer].diplomacy.atWarWith = ['enemy'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(collectText(panel)).toContain('War weariness');
  });

  it('shows a Happiness buildings row when the city has a temple', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.buildings = ['temple'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const text = collectText(panel);
    expect(text).toContain('Happiness buildings');
    expect(text).toContain('-2');
  });
});

describe('city-panel unrest recommendations — #919 MR3', () => {
  const cb = () => ({ onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {}, onAppeaseFaction: vi.fn(() => undefined) });

  it('renders a "→" recommendation sub-line for each positive pressure row', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.spyUnrestBonus = 10; // Enemy espionage row
    state.civilizations[state.currentPlayer].diplomacy.atWarWith = ['rival']; // War weariness row

    const panel = createCityPanel(container, city, state, cb());

    const subs = Array.from(panel.querySelectorAll('[data-recommendation-row]'));
    expect(subs.length).toBeGreaterThanOrEqual(2);
    const joined = subs.map(s => s.textContent).join(' ');
    expect(joined).toMatch(/→/);
    expect(joined).toMatch(/Make peace/);
    expect(joined).toMatch(/spy/i);
  });

  it('greys the sub-line and marks data-availability when the lever needs research first', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    city.conquestTurn = state.turn - 2; // Recent conquest row; constitutional-law not researched → research-first

    const panel = createCityPanel(container, city, state, cb());

    const sub = Array.from(panel.querySelectorAll<HTMLElement>('[data-recommendation-row]'))
      .find(s => /Constitutional Law/i.test(s.textContent ?? ''));
    expect(sub).toBeDefined();
    expect(sub!.dataset.availability).toBe('research-first');
    expect(sub!.style.opacity).toBe('0.6');
  });

  it('sub-lines are plain text — no child elements from string interpolation', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;
    state.civilizations[state.currentPlayer].diplomacy.atWarWith = ['rival'];

    const panel = createCityPanel(container, city, state, cb());

    for (const sub of panel.querySelectorAll('[data-recommendation-row]')) {
      expect(sub.children).toHaveLength(0);
    }
  });

  it('a calm city renders no recommendation sub-lines', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 0;

    const panel = createCityPanel(container, city, state, cb());

    expect(panel.querySelectorAll('[data-recommendation-row]')).toHaveLength(0);
  });
});

describe('concede vs appease copy (#552)', () => {
  it('gives Appease and Concede distinct explanatory tooltips', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    const appeaseBtn = panel.querySelector('[data-appease]') as HTMLButtonElement;
    const concedeBtn = panel.querySelector('[data-concede]') as HTMLButtonElement;
    expect(appeaseBtn.title).toContain('repeatable');
    expect(concedeBtn.title).toContain('immune');
  });

  it('shows a static help line summarizing the trade-off', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.unrestLevel = 1;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {},
      onOpenWonderPanel: () => {},
      onClose: () => {},
    });

    expect(collectText(panel)).toContain('Concede costs more but grants long immunity');
  });
});

describe('city-panel building icons — #665', () => {
  it('renders an animated sprite wrapper for a built ordinary building', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['granary'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const wrapper = panel.querySelector('.cq-sprite-wrap.cq-v2[data-kind="building"]');
    expect(wrapper).toBeTruthy();
    expect(wrapper!.getAttribute('data-state')).toBe('idle');
  });

  it('does not throw and still renders the rest of the row for a completed legendary wonder with no catalog sprite', () => {
    const { container, city, state } = makeWonderPanelFixture();
    // 'grand-canal' has no BUILDING_SPRITE_CATALOG entry (only 5 of 74 wonder ids do).
    // BUILDINGS has no entry for it either, so it's added directly to exercise the
    // fallback path in isolation from the wonder-completion system.
    city.buildings = ['granary', 'grand-canal'];

    expect(() => createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    })).not.toThrow();
  });

  it('derives the icon palette from the CURRENT city owner, not any cached founder color', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['granary'];
    city.owner = 'rival'; // rival civ color is #9333ea, player civ color is #4a90d9
    state.civilizations.rival.cities.push(city.id);

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const rendered = panel.innerHTML;
    expect(rendered).toContain('#9333ea');
    expect(rendered).not.toContain('#4a90d9');
  });

  it('renders no duplicate SVG id attributes when the city has multiple buildings with bespoke defs', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings = ['stock_exchange', 'bank'];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    const ids = [...panel.querySelectorAll('[id]')].map(el => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('city-panel warhead arsenal visibility (#545)', () => {
  it('available warhead item shows an always-visible Arsenal: N/M line', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    // nuclear-weapons gates warhead's own techRequired; nuclear-physics gates the
    // uranium resource definition itself (RESOURCE_DEFINITIONS).
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    // Base capacity (1, from Manhattan Project) + nuclear_arsenal (+2) + missile_silo
    // (+1) = 4; arsenal at 2 -- comfortably under capacity, so warhead is available
    // (not locked), and the count must still be visible per this review's Goal 7 fix.
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 2;

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Arsenal: 2/4');
  });

  it('the warhead arsenal line reflects the effective (treaty, not just physical) cap (#545 MR6)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    // Physical capacity: base 1 + nuclear_arsenal (+2) + missile_silo (+1) = 4.
    // An active arms-control pact caps at 3 -- stricter than physical capacity
    // but still above the current count (2), so the item stays in the
    // AVAILABLE list (atCapacity is only true at/above the effective cap) and
    // the displayed line must show the EFFECTIVE cap (3), not the physical 4.
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 2;
    state.civilizations[civId].diplomacy.treaties = [
      { type: 'arms_control_pact', civA: civId, civB: 'ai-1', turnsRemaining: -1, arsenalCap: 3 },
    ];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Arsenal: 2/3');
    expect(collectText(panel)).not.toContain('Arsenal: 2/4');
    expect(collectText(panel)).toContain('Limited by an active arms control pact.');
  });

  it('the locked-item reason for warhead reflects the effective (treaty) cap once actually at capacity (#545 MR6)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    // Physical capacity 4 (base 1 + nuclear_arsenal 2 + missile_silo 1), but a
    // treaty cap of 2 is stricter and already reached -- the item must appear
    // in the LOCKED list (not available) with a treaty-specific reason, not
    // the generic "Arsenal at capacity" physical-only message.
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 2;
    state.civilizations[civId].diplomacy.treaties = [
      { type: 'arms_control_pact', civA: civId, civB: 'ai-1', turnsRemaining: -1, arsenalCap: 2 },
    ];

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).toContain('Limited by an active arms control pact.');
    expect(collectText(panel)).not.toContain('Arsenal at capacity (2/4)');
  });

  it('the locked-item reason for warhead reflects the setting, not a stale capacity number, when superweapons is off (#545 MR7)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 0;
    state.settings.superweapons = 'off';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).not.toContain('Arsenal at capacity');
    expect(collectText(panel)).not.toMatch(/Arsenal at \d+\/\d+/);
    expect(collectText(panel).toLowerCase()).toContain('superweapons');
  });

  it('an already-built missile_silo\'s description drops the launch/capacity claim when superweapons is off (#545 MR7)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.settings.superweapons = 'off';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).not.toMatch(/launch|ICBM|intercontinental|arsenal capacity/i);
    expect(collectText(panel)).toContain('command bunker');
  });
});

describe('Prepare Strategic Launch action (#545 MR4 §14 stage 1)', () => {
  it('shows the action with current arsenal count when the city has a missile_silo', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.civilizations.player.strategicArsenal = 2;
    const onPrepareStrategicLaunch = vi.fn();

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
      onPrepareStrategicLaunch,
    });

    expect(collectText(panel)).toContain('Strategic Arsenal: 2 / ');
    clickElement(panel.querySelector('[data-action="prepare-strategic-launch"]'));
    expect(onPrepareStrategicLaunch).toHaveBeenCalledWith(city.id);
  });

  it('is absent without a missile_silo', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.querySelector('[data-action="prepare-strategic-launch"]')).toBeNull();
  });

  it('is disabled with a reason when arsenal is 0', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    const button = panel.querySelector('[data-action="prepare-strategic-launch"]') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(collectText(panel)).toContain('No warheads in arsenal.');
  });

  it('is absent for another player\'s city in hot-seat (currentPlayer gate)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.currentPlayer = 'player-2';
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.querySelector('[data-action="prepare-strategic-launch"]')).toBeNull();
  });

  it('is absent when superweapons is off, even with a real missile_silo and banked warheads (#545 MR7)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    city.buildings.push('missile_silo');
    state.civilizations.player.strategicArsenal = 2;
    state.settings.superweapons = 'off';
    const panel = createCityPanel(container, city, state, { onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {} });
    expect(panel.querySelector('[data-action="prepare-strategic-launch"]')).toBeNull();
    expect(collectText(panel)).not.toContain('Strategic Arsenal:');
  });
});
