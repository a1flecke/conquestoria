import { describe, it, expect } from 'vitest';
import {
  UNIT_SPRITE_CATALOG,
  BUILDING_SPRITE_CATALOG,
  PIRATE_HEADQUARTERS_SPRITE_CATALOG,
} from '@/renderer/sprites/sprite-catalog';
import { derivePalette } from '@/renderer/sprites/sprite-system';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { PIRATE_HULL_TYPES } from '@/systems/pirate-definitions';
import {
  JetFighterSprite, IroncladSprite, MachineGunnerSprite, MissionarySprite, SpyHackerSprite,
  HorsemanSprite, CannonSprite, RiflemanSprite, KnightSprite, WarHoundSprite,
  TriremeSprite, CaravanSprite, WorkerSprite, BiplaneSprite,
  TankSprite, ArtillerySprite, InfantrySprite,
} from '@/renderer/sprites/units';
import {
  DataCenterSprite, CyberDefenseCenterSprite, AutomatedPortSprite, SignalsHubSprite,
  BroadcastTowerSprite, PrecisionFarmSprite, TelemedicineHubSprite, SmartGridSprite,
  RocketProgramSprite,
  RadarStationSprite,
  StarFortSprite, WallsSprite, BunkerSprite, CoastalBatterySprite, CourthouseSprite, RegionalCapitalSprite,
} from '@/renderer/sprites/buildings';

// Derive the authoritative unit-type list from UNIT_DEFINITIONS so this test
// automatically catches any new UnitType added to types.ts without a matching
// sprite or motion wiring.
const ALL_UNIT_TYPES = Object.keys(UNIT_DEFINITIONS) as Array<keyof typeof UNIT_DEFINITIONS>;

describe('sprite-catalog coverage', () => {
  describe('UNIT_SPRITE_CATALOG', () => {
    it('has an entry for every UnitType in UNIT_DEFINITIONS', () => {
      for (const unitType of ALL_UNIT_TYPES) {
        expect(UNIT_SPRITE_CATALOG[unitType], `missing sprite for unit type: ${unitType}`).toBeDefined();
        expect(typeof UNIT_SPRITE_CATALOG[unitType], `sprite for ${unitType} must be a function`).toBe('function');
      }
    });

    it('UNIT_SPRITE_CATALOG has no entries for unknown types', () => {
      for (const unitType of Object.keys(UNIT_SPRITE_CATALOG)) {
        expect(UNIT_DEFINITIONS[unitType as keyof typeof UNIT_DEFINITIONS], `${unitType} in sprite catalog but not in UNIT_DEFINITIONS`).toBeDefined();
      }
    });

    it('every unit sprite responds to all three motion states', () => {
      const palette = derivePalette('#4a90d9');
      for (const unitType of ALL_UNIT_TYPES) {
        const render = UNIT_SPRITE_CATALOG[unitType];
        if (!render) continue; // caught by entry test above

        const idle    = render({ palette, svgOnly: true, motion: 'idle' });
        const movingA = render({ palette, svgOnly: true, motion: 'move-a' });
        const movingB = render({ palette, svgOnly: true, motion: 'move-b' });

        expect(idle,    `${unitType} idle`).toContain('data-motion="idle"');
        expect(movingA, `${unitType} move-a`).toContain('data-motion="move-a"');
        expect(movingB, `${unitType} move-b`).toContain('data-motion="move-b"');

        expect(movingA, `${unitType} move-a must differ from idle`).not.toBe(idle);
        expect(movingB, `${unitType} move-b must differ from move-a`).not.toBe(movingA);
      }
    });

    it('siege engines use land motion instead of naval bobbing', () => {
      const palette = derivePalette('#4a90d9');
      const siegeTypes: Array<keyof typeof UNIT_SPRITE_CATALOG> = ['catapult', 'ballista', 'cannon'];

      for (const unitType of siegeTypes) {
        const movingA = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'move-a' });
        const movingB = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'move-b' });

        expect(movingA, `${unitType} move-a should use the land pivot`).toContain('rotate(-2 64 70)');
        expect(movingB, `${unitType} move-b should use the land pivot`).toContain('rotate(2 64 70)');
        expect(movingA, `${unitType} move-a should not use the naval pivot`).not.toContain('64 82');
        expect(movingB, `${unitType} move-b should not use the naval pivot`).not.toContain('64 82');
      }
    });

    it('renders all pirate hulls as production naval sprites at low zoom', () => {
      const palette = derivePalette('#7f1d1d');
      for (const unitType of PIRATE_HULL_TYPES) {
        const svg = UNIT_SPRITE_CATALOG[unitType]({ palette, svgOnly: true, motion: 'idle' });
        expect(svg, unitType).toContain('data-kind="naval"');
        expect(svg, unitType).toContain('viewBox="0 0 128 128"');
        expect(svg.length, `${unitType} must be final art, not a trivial placeholder`).toBeGreaterThan(1200);
      }
    });
  });

  describe('BUILDING_SPRITE_CATALOG', () => {
    for (const buildingId of Object.keys(BUILDINGS)) {
      it(`has a component for building: ${buildingId}`, () => {
        expect(BUILDING_SPRITE_CATALOG[buildingId]).toBeDefined();
        expect(typeof BUILDING_SPRITE_CATALOG[buildingId]).toBe('function');
      });
    }
  });

  it('covers every era-specific pirate headquarters with neutral production art', () => {
    const expected = [
      'pirate_enclave_stage_1', 'pirate_enclave_stage_2', 'pirate_enclave_stage_3',
      'pirate_enclave_stage_4', 'pirate_enclave_stage_5',
      'pirate_flotilla_stage_2', 'pirate_flotilla_stage_3', 'pirate_flotilla_stage_4', 'pirate_flotilla_stage_5',
    ];
    expect(Object.keys(PIRATE_HEADQUARTERS_SPRITE_CATALOG).sort()).toEqual(expected.sort());
    for (const id of expected) {
      const svg = PIRATE_HEADQUARTERS_SPRITE_CATALOG[id as keyof typeof PIRATE_HEADQUARTERS_SPRITE_CATALOG]({ svgOnly: true });
      expect(svg).toContain('data-pirate-headquarters');
      expect(svg).toContain('viewBox="0 0 192 192"');
      expect(svg.length).toBeGreaterThan(900);
    }
  });
});

// #652: all 20 of these entries were temporary aliases to older-era sprites at Era 13
// launch (#515), replaced across two batches (A: 2026-07-26, B: 2026-07-27). Reject any
// regression back to that aliasing — if one of these ever starts rendering byte-identical
// output to the sprite it replaced, either the catalog line was reverted or a future edit
// accidentally reintroduced the old alias.
describe('Era 13 sprites are not aliases of their placeholders (#652)', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the placeholders they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['combat_drone', JetFighterSprite],
      ['autonomous_frigate', IroncladSprite],
      ['exosuit_infantry', MachineGunnerSprite],
      ['propagandist', MissionarySprite],
      ['drone_controller', SpyHackerSprite],
    ];
    for (const [type, placeholderFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const placeholder = placeholderFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old placeholder`).not.toBe(placeholder);
    }
  });

  it('building sprites are not the same component as the placeholders they replaced', () => {
    const replacements: Array<[keyof typeof BUILDING_SPRITE_CATALOG, unknown]> = [
      ['network_operations_center', DataCenterSprite],
      ['ai_safety_institute', CyberDefenseCenterSprite],
      ['drone_fabricator', AutomatedPortSprite],
      ['electronic_warfare_array', SignalsHubSprite],
      ['civic_media_forum', BroadcastTowerSprite],
      ['vertical_farm', PrecisionFarmSprite],
      ['neural_rehabilitation_center', TelemedicineHubSprite],
      ['ocean_robotics_yard', AutomatedPortSprite],
      ['circular_fabricator', SmartGridSprite],
      ['modular_arcology', DataCenterSprite],
      ['carbon_capture_grid', SmartGridSprite],
      ['immersive_arts_lab', BroadcastTowerSprite],
      ['national_ai_assurance_program', CyberDefenseCenterSprite],
      ['circular_manufacturing_network', SmartGridSprite],
      ['mars_robotics_initiative', RocketProgramSprite],
    ];
    for (const [id, placeholderFn] of replacements) {
      expect(BUILDING_SPRITE_CATALOG[id], `${id} still aliases its old placeholder component`).not.toBe(placeholderFn);
    }
  });
});

// #769 batch 1 (2026-08-01): chariot/infantry/artillery/marine/cyber_unit got real, distinct
// sprites, replacing their donor aliases (HorsemanSprite/MachineGunnerSprite/CannonSprite/
// RiflemanSprite/SpyHackerSprite). Same pattern and purpose as the Era 13 block above — reject
// any regression back to rendering byte-identical to the old donor.
describe('#769 batch 1 sprites are not aliases of their donors', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the donors they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['chariot', HorsemanSprite],
      ['infantry', MachineGunnerSprite],
      ['artillery', CannonSprite],
      ['marine', RiflemanSprite],
      ['cyber_unit', SpyHackerSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old donor sprite`).not.toBe(donor);
    }
  });
});

describe('#708 mounted and beast sprites are not temporary aliases', () => {
  const palette = derivePalette('#4a90d9');

  it('keeps the three remaining issue-708 units distinct from their former donors', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['beast_handler', WarHoundSprite],
      ['war_elephant', WarHoundSprite],
      ['cuirassier', KnightSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its former donor`).not.toBe(donor);
    }
  });

  it('leaves Chariot on its already-shipped distinct sprite', () => {
    expect(UNIT_SPRITE_CATALOG.chariot({ palette, svgOnly: true }))
      .not.toBe(HorsemanSprite({ palette, svgOnly: true }));
  });
});

// #769 batch 2 (naval + logistics, shipped 2026-08-01) — same permanent regression as batch 1
// above, for frigate/destroyer/merchant_wagon (previously TriremeSprite/IroncladSprite/
// CaravanSprite verbatim).
describe('#769 batch 2 sprites are not aliases of their donors', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the donors they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['frigate', TriremeSprite],
      ['destroyer', IroncladSprite],
      ['merchant_wagon', CaravanSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old donor sprite`).not.toBe(donor);
    }
  });
});

// #769 batch 3 (logistics + air, shipped 2026-08-02) — same permanent regression as batches 1-2
// above, for freight_convoy/recon_aircraft/air_freighter/bomber/jet_freighter (previously
// CaravanSprite/BiplaneSprite/BiplaneSprite/JetFighterSprite/JetFighterSprite verbatim).
describe('#769 batch 3 sprites are not aliases of their donors', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the donors they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['freight_convoy', CaravanSprite],
      ['recon_aircraft', BiplaneSprite],
      ['air_freighter', BiplaneSprite],
      ['bomber', JetFighterSprite],
      ['jet_freighter', JetFighterSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old donor sprite`).not.toBe(donor);
    }
  });

  it('bomber and jet_freighter are distinct from each other despite sharing a former donor', () => {
    const bomber = UNIT_SPRITE_CATALOG.bomber({ palette, svgOnly: true });
    const jetFreighter = UNIT_SPRITE_CATALOG.jet_freighter({ palette, svgOnly: true });
    expect(bomber).not.toBe(jetFreighter);
  });
});

// #769 batch 4 (air, remainder, shipped 2026-08-03) — same permanent regression as batches 1-3
// above, for global_air_cargo/stealth_bomber (previously JetFighterSprite verbatim for both).
describe('#769 batch 4 sprites are not aliases of their donors', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the donor they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['global_air_cargo', JetFighterSprite],
      ['stealth_bomber', JetFighterSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old donor sprite`).not.toBe(donor);
    }
  });

  it('global_air_cargo and stealth_bomber are distinct from each other despite sharing a former donor', () => {
    const globalAirCargo = UNIT_SPRITE_CATALOG.global_air_cargo({ palette, svgOnly: true });
    const stealthBomber = UNIT_SPRITE_CATALOG.stealth_bomber({ palette, svgOnly: true });
    expect(globalAirCargo).not.toBe(stealthBomber);
  });

  it('global_air_cargo is also distinct from jet_freighter, its own batch-3 predecessor in the same trade line', () => {
    const globalAirCargo = UNIT_SPRITE_CATALOG.global_air_cargo({ palette, svgOnly: true });
    const jetFreighter = UNIT_SPRITE_CATALOG.jet_freighter({ palette, svgOnly: true });
    expect(globalAirCargo).not.toBe(jetFreighter);
  });

  it('stealth_bomber is also distinct from bomber, its own batch-3 predecessor in the same bomber line', () => {
    const stealthBomber = UNIT_SPRITE_CATALOG.stealth_bomber({ palette, svgOnly: true });
    const bomber = UNIT_SPRITE_CATALOG.bomber({ palette, svgOnly: true });
    expect(stealthBomber).not.toBe(bomber);
  });
});

// #769 batch 5 — the LAST batch: anti_tank_gun/mobile_aa previously reused TankSprite verbatim,
// wwii_fighter previously reused JetFighterSprite verbatim. Mirrors the batch 3/4 pattern
// above, for anti_tank_gun/mobile_aa/wwii_fighter.
describe('#769 batch 5 sprites are not aliases of their donors', () => {
  const palette = derivePalette('#4a90d9');

  it('unit sprites render different markup than the donor they replaced', () => {
    const replacements: Array<[keyof typeof UNIT_SPRITE_CATALOG, (props: { palette: typeof palette; svgOnly: boolean }) => string]> = [
      ['anti_tank_gun', TankSprite],
      ['mobile_aa', TankSprite],
      ['wwii_fighter', JetFighterSprite],
    ];
    for (const [type, donorFn] of replacements) {
      const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      const donor = donorFn({ palette, svgOnly: true });
      expect(actual, `${type} still renders identically to its old donor sprite`).not.toBe(donor);
    }
  });

  it('anti_tank_gun and mobile_aa are distinct from each other despite sharing a former donor', () => {
    const antiTankGun = UNIT_SPRITE_CATALOG.anti_tank_gun({ palette, svgOnly: true });
    const mobileAa = UNIT_SPRITE_CATALOG.mobile_aa({ palette, svgOnly: true });
    expect(antiTankGun).not.toBe(mobileAa);
  });

  it('anti_tank_gun is also distinct from the existing towed-gun family (cannon, artillery), not just its TankSprite donor', () => {
    const antiTankGun = UNIT_SPRITE_CATALOG.anti_tank_gun({ palette, svgOnly: true });
    const cannon = UNIT_SPRITE_CATALOG.cannon({ palette, svgOnly: true });
    const artillery = UNIT_SPRITE_CATALOG.artillery({ palette, svgOnly: true });
    expect(antiTankGun).not.toBe(cannon);
    expect(antiTankGun).not.toBe(artillery);
    expect(CannonSprite({ palette, svgOnly: true })).not.toBe(antiTankGun);
    expect(ArtillerySprite({ palette, svgOnly: true })).not.toBe(antiTankGun);
  });

  it('every batch 5 sprite carries a faction Banner, matching every other unit in the catalog', () => {
    const bannerFingerprint = 'M0,-12 L14,-9 L8,-5 L14,-1 L0,-2 Z';
    for (const type of ['anti_tank_gun', 'mobile_aa', 'wwii_fighter'] as const) {
      const svg = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
      expect(svg, `${type} is missing the faction <Banner>`).toContain(bannerFingerprint);
    }
  });
});

describe('#709 industrial vehicle sprites are not aliases of their former donors', () => {
  const palette = derivePalette('#4a90d9');

  it.each([
    ['armored_car', TankSprite, 'cq-armored-car-body'],
    ['mechanized_infantry', InfantrySprite, 'cq-mech-carrier'],
    ['main_battle_tank', TankSprite, 'cq-mbt-turret'],
  ] as const)('%s is bespoke and carries its role marker', (type, donor, marker) => {
    const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
    expect(actual).not.toBe(donor({ palette, svgOnly: true }));
    expect(actual).toContain(marker);
  });
});

describe('#710 air-defense and orphaned sprites are not aliases of their former donors', () => {
  const palette = derivePalette('#4a90d9');

  it.each([
    ['paratrooper', 'infantry', ['cq-parachute-canopy', 'cq-parachute-lines', 'cq-paratrooper-harness', 'cq-paratrooper-rifle']],
    ['naval_strike_aircraft', 'jet_fighter', ['cq-strike-fuselage', 'cq-strike-cockpit', 'cq-strike-tailhook', 'cq-naval-strike-torpedo']],
    ['maritime_patrol_aircraft', 'recon_aircraft', ['cq-patrol-fuselage', 'cq-patrol-nacelle-l', 'cq-patrol-nacelle-r', 'cq-patrol-radar-dome']],
    ['supercarrier', 'carrier', ['cq-supercarrier-hull', 'cq-supercarrier-bow', 'cq-supercarrier-deck', 'cq-supercarrier-island', 'cq-supercarrier-wake']],
    ['great_general', 'warrior', ['cq-general-arm-l', 'cq-general-arm-r', 'cq-general-leg-l', 'cq-general-leg-r', 'cq-general-map', 'cq-general-standard']],
  ] as const)('%s is bespoke and carries its approved role markers', (type, donor, markers) => {
    const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
    const former = UNIT_SPRITE_CATALOG[donor]({ palette, svgOnly: true });
    expect(actual).not.toBe(former);
    for (const marker of markers) expect(actual, `${type} missing ${marker}`).toContain(marker);
  });

  it('renders SAM Site as a protected launcher instead of the Radar Station tower', () => {
    const samSite = BUILDING_SPRITE_CATALOG.sam_site({ palette, svgOnly: true });
    const radarStation = RadarStationSprite({ palette, svgOnly: true });
    expect(samSite).not.toBe(radarStation);
    expect(samSite).toContain('cq-sam-launcher');
    expect(samSite).toContain('cq-sam-platform');
    expect(samSite).toContain('cq-sam-ground');
    expect(samSite).toContain('cq-sam-standard');
    expect(samSite).toContain('cq-sam-missile-launch');
    expect(samSite).toContain('cq-sam-launch-flash');
    expect(samSite).not.toContain('cq-anim-idle');
    expect(samSite).not.toContain('cq-radar-tower');
    expect(radarStation).toContain('cq-radar-tower');
    expect(radarStation).not.toContain('cq-sam-launcher');
  });

  it('#927: renders Regional Capital as a distinct two-banner civic seat', () => {
    const regionalCapital = BUILDING_SPRITE_CATALOG.regional_capital({ palette, svgOnly: true });
    expect(BUILDING_SPRITE_CATALOG.regional_capital).toBe(RegionalCapitalSprite);
    expect(regionalCapital).not.toBe(CourthouseSprite({ palette, svgOnly: true }));
    expect(regionalCapital).toContain('M14,70 L96,28 L178,70 Z');
    expect(regionalCapital).toContain('translate(42 48) scale(0.75)');
    expect(regionalCapital).toContain('translate(150 48) scale(0.75)');
  });
});

describe('#711 siege and capital-ship sprites are not aliases of their former donors', () => {
  const palette = derivePalette('#4a90d9');
  const cases = [
    ['trebuchet', 'catapult', ['cq-trebuchet-a-frame', 'cq-trebuchet-counterweight', 'cq-trebuchet-beam', 'cq-trebuchet-sling', 'cq-trebuchet-carriage']],
    ['rocket_artillery', 'artillery', ['cq-rocket-artillery-chassis', 'cq-rocket-artillery-rack', 'cq-rocket-artillery-tubes', 'cq-rocket-artillery-stabilizer', 'cq-rocket-artillery-crate']],
    ['battleship', 'pre_dreadnought', ['cq-battleship-hull', 'cq-battleship-turret-fore', 'cq-battleship-turret-mid', 'cq-battleship-turret-aft', 'cq-battleship-bridge', 'cq-battleship-rangefinder']],
    ['missile_cruiser', 'pre_dreadnought', ['cq-missile-cruiser-hull', 'cq-missile-cruiser-vls', 'cq-missile-cruiser-bridge', 'cq-missile-cruiser-radar-forward', 'cq-missile-cruiser-radar-aft']],
  ] as const;

  it.each(cases)('%s is bespoke and carries its approved role markers', (type, donor, markers) => {
    const actual = UNIT_SPRITE_CATALOG[type]({ palette, svgOnly: true });
    const former = UNIT_SPRITE_CATALOG[donor]({ palette, svgOnly: true });

    expect(actual).not.toBe(former);
    for (const marker of markers) expect(actual, `${type} missing ${marker}`).toContain(marker);
  });
});

describe('#712 defensive-infrastructure sprites are bespoke, not placeholder aliases', () => {
  const palette = derivePalette('#4a90d9');

  it('Bunker no longer aliases the Star Fort sprite', () => {
    const bunker = BUILDING_SPRITE_CATALOG.bunker({ palette, svgOnly: true });
    expect(bunker).not.toBe(StarFortSprite({ palette, svgOnly: true }));
    expect(BUILDING_SPRITE_CATALOG.bunker).toBe(BunkerSprite);
  });

  it('Bunker reads as a modern hardened casemate, not a fort or castle', () => {
    const bunker = BUILDING_SPRITE_CATALOG.bunker({ palette, svgOnly: true });
    for (const marker of ['cq-bunker-hull', 'cq-bunker-slit', 'cq-bunker-berm', 'cq-bunker-door', 'cq-bunker-standard']) {
      expect(bunker, `bunker missing ${marker}`).toContain(marker);
    }
    // Static, hardened — no idle bob, and none of the Star Fort's star geometry.
    expect(bunker).not.toContain('cq-anim-idle');
    expect(bunker).not.toContain('cq-citadel-keep');
  });

  it('Coastal Battery reads as fixed shore artillery, distinct from Walls / Star Fort', () => {
    const battery = BUILDING_SPRITE_CATALOG.coastal_battery({ palette, svgOnly: true });
    expect(battery).not.toBe(StarFortSprite({ palette, svgOnly: true }));
    expect(battery).not.toBe(WallsSprite({ palette, svgOnly: true }));
    expect(BUILDING_SPRITE_CATALOG.coastal_battery).toBe(CoastalBatterySprite);
    for (const marker of [
      'cq-coastal-battery-parapet', 'cq-coastal-battery-gun-l', 'cq-coastal-battery-gun-r',
      'cq-coastal-battery-rangefinder', 'cq-coastal-battery-water', 'cq-coastal-battery-standard',
    ]) {
      expect(battery, `coastal battery missing ${marker}`).toContain(marker);
    }
  });

  it.each([
    ['bunker', BunkerSprite, 'cq-bunker-hull'],
    ['coastal_battery', CoastalBatterySprite, 'cq-coastal-battery-parapet'],
  ] as const)('%s keeps faction identity to a small standard, not a full recolour', (_id, fn, structuralMarker) => {
    const a = fn({ palette: derivePalette('#c0392b'), svgOnly: true });
    const b = fn({ palette: derivePalette('#27ae60'), svgOnly: true });
    // The palette moves the standard, but the load-bearing structure is unchanged.
    expect(a).not.toBe(b);
    expect(a).toContain(structuralMarker);
    expect(b).toContain(structuralMarker);
  });
});

// #769: full audit (2026-08-01, `scripts/audit-sprite-aliases.mjs`) of UNIT_SPRITE_CATALOG
// originally found 17 units still rendering via another unit's exact sprite function — not
// similar art, literally the same component (distinct from the Era 13 placeholders above,
// which have all shipped real replacements). This is the audit baseline; batches ship 5 at a
// time and each row is deleted the moment its unit gets real bespoke art (mirroring the Era 13
// pattern above) — so a shrinking list here is expected and desired, not a bug.
//
// Batch 1 (chariot, infantry, artillery, marine, cyber_unit) shipped 2026-08-01 and is no
// longer listed below. `chariot` also closed out the overlapping portion of pre-existing issue
// #708's scope that this issue didn't originally know about (see next paragraph) — #708's
// comment was updated to reflect that.
//
// Batch 2 (frigate, destroyer, merchant_wagon) shipped 2026-08-01 (issue #775's Claude Design
// prompt) and is no longer listed below either — see the permanent regression block above.
//
// Batch 3 (freight_convoy, recon_aircraft, air_freighter, bomber, jet_freighter) shipped
// 2026-08-02 and is no longer listed below either — see the permanent regression block above.
//
// Batch 4 (global_air_cargo, stealth_bomber) shipped 2026-08-03 and is no longer listed below
// either — see the permanent regression block above. Only batch 5's drift units remain pending.
//
// A rebase of batch 3's branch onto `main` (2026-08-02) picked up two more new aliases from
// separate concurrent work (#681, mechanized infantry): `mechanized_infantry` (its catalog
// comment cites #709 as owner — out of #769's scope, not listed below) and `mobile_aa` (a
// generic "asset follow-up" comment with no owning issue, same situation `anti_tank_gun` was
// in before it — folded into Batch 5 alongside it rather than added silently). A rebase of
// batch 4's branch onto `main` (2026-08-03) similarly picked up `battleship` (#682, dreadnought
// construction) — its catalog comment cites #711 as owner, out of #769's scope entirely, not
// listed below.
//
// Reconciled with issue #708 (2026-08-01): #708 is a pre-existing, separately-tracked issue
// (part of the larger #547 combat-roster initiative) that already owned `beast_handler`,
// `war_elephant`, and `cuirassier`'s bespoke-sprite work with its own design doc and
// implementation plan — this issue didn't know about it when originally filed. Per project
// decision, #769 no longer tracks those 3 units (removed from the batch plan below); #708
// keeps them. `armored_car` and `mechanized_infantry` (owned by issue #709) are similarly out
// of #769's scope. `cuirassier`, `armored_car`, and `mechanized_infantry` all landed on `main`
// as new aliased placeholders *after* this baseline was first written —
// `scripts/audit-sprite-aliases.mjs` will (correctly) still flag them as aliases, since they
// mechanically are; they're just not this issue's units to fix.
//
// Both sides render through their own UNIT_SPRITE_CATALOG entry (not the raw sprite function)
// with an explicit motion so the wrapper's per-unit `data-motion`/transform injection is
// identical on both sides — true visual identity is what we're asserting, not incidental
// string equality from bypassing the wrapper.
//
// If a `toBe` assertion below starts failing, the unit already got its own art — delete that
// row. If a *new* alias appears that isn't listed here, `scripts/audit-sprite-aliases.mjs`
// will catch it too — run it before starting any new #769 batch in case another agent added a
// unit that reuses an existing sprite in the meantime. Not every alias the script reports is
// automatically #769's scope — check whether another issue already owns it first (as happened
// with #708/#709 above) before adding a row here.
describe('#769 pending sprite-alias audit baseline', () => {
  const palette = derivePalette('#4a90d9');

  it('known-pending aliased units still render identically to their donor unit', () => {
    // Batch 5 (anti_tank_gun/mobile_aa/wwii_fighter) shipped and was #769's last remaining
    // batch — see the '#769 batch 5 sprites are not aliases of their donors' describe block
    // above for their de-alias coverage. This baseline is now empty; #769 is fully complete.
    // The 6 units still reported by `scripts/audit-sprite-aliases.mjs` (beast_handler/
    // war_elephant/cuirassier → #708, armored_car/mechanized_infantry/battleship → #709/#711)
    // are owned by other issues and were never #769's scope.
    const pendingAliasPairs: Array<[keyof typeof UNIT_SPRITE_CATALOG, keyof typeof UNIT_SPRITE_CATALOG]> = [];
    expect(pendingAliasPairs.length, "baseline count should match #769's remaining scope — 0, #769 is complete").toBe(0);
    for (const [aliasType, donorType] of pendingAliasPairs) {
      const actual = UNIT_SPRITE_CATALOG[aliasType]({ palette, svgOnly: true, motion: 'idle' });
      const donor = UNIT_SPRITE_CATALOG[donorType]({ palette, svgOnly: true, motion: 'idle' });
      expect(actual, `${aliasType} no longer renders identically to ${donorType} — delete this row from the baseline`).toBe(donor);
    }
  });
});

// The completeness tests above only check `typeof fn === 'function'` — they never call the
// function, so a runtime-only bug (a NaN from a bad coordinate calc, a property access that
// only fails for a specific palette's derived colors, etc.) would slip through undetected until
// a live crash. `yarn build`'s type-check caught the one real bug found while integrating Era 13
// batch A (an unjoined string[] passed as JSX children) — but tsc only catches type errors, not
// runtime ones. This actually renders every catalog entry, across multiple real faction
// palettes, matching the pattern already used for PIRATE_HEADQUARTERS_SPRITE_CATALOG above.
describe('every catalog sprite renders without throwing, across multiple factions', () => {
  const testFactions = ['#4a90d9', '#b8434a', '#3a6e94']; // arbitrary real civ colors, not the neutral palette

  it('every UNIT_SPRITE_CATALOG entry renders non-empty SVG markup for every test faction', () => {
    for (const civColor of testFactions) {
      const palette = derivePalette(civColor);
      for (const type of Object.keys(UNIT_SPRITE_CATALOG)) {
        let svg: string;
        expect(() => {
          svg = UNIT_SPRITE_CATALOG[type as keyof typeof UNIT_SPRITE_CATALOG]({ palette, svgOnly: true });
        }, `${type} threw for faction color ${civColor}`).not.toThrow();
        expect(svg!, `${type} produced no markup for faction color ${civColor}`).toContain('<svg');
        expect(svg!.length, `${type} produced suspiciously short markup for faction color ${civColor}`).toBeGreaterThan(100);
      }
    }
  });

  it('every BUILDING_SPRITE_CATALOG entry renders non-empty SVG markup for every test faction', () => {
    for (const civColor of testFactions) {
      const palette = derivePalette(civColor);
      for (const id of Object.keys(BUILDING_SPRITE_CATALOG)) {
        let svg: string;
        expect(() => {
          svg = BUILDING_SPRITE_CATALOG[id]({ palette, svgOnly: true });
        }, `${id} threw for faction color ${civColor}`).not.toThrow();
        expect(svg!, `${id} produced no markup for faction color ${civColor}`).toContain('<svg');
        expect(svg!.length, `${id} produced suspiciously short markup for faction color ${civColor}`).toBeGreaterThan(100);
      }
    }
  });
});

// A worker with an active workerTask now renders data-state="work" (see render-loop.ts),
// which drives [data-state="work"] .cq-tool / .cq-work-dust in sprite-animations-v2.css --
// but only if WorkerSprite's own markup actually carries those classes. ExpeditionSprite's
// prospecting pickaxe already does this correctly; WorkerSprite's pickaxe didn't.
describe("WorkerSprite carries the work-action animation hooks", () => {
  it('has a cq-tool class on its pickaxe and a cq-work-dust element', () => {
    const palette = derivePalette('#4a90d9');
    const svg = WorkerSprite({ palette, svgOnly: true });
    expect(svg, 'WorkerSprite is missing the cq-tool class on its pickaxe').toContain('cq-tool');
    expect(svg, 'WorkerSprite is missing a cq-work-dust element').toContain('cq-work-dust');
  });
});
