import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfxDirector } from '../../src/audio/sfx-director';
import { UNIT_SFX, MOVEMENT_SFX, AIR_MOVEMENT_SFX, allSfxEntries } from '../../src/audio/sfx-catalog';
import { UNIT_DEFINITIONS } from '../../src/systems/unit-definitions';
import type { AudioMixer } from '../../src/audio/audio-mixer';
import type { AudioLoader } from '../../src/audio/audio-loader';
import type { EventBus } from '../../src/core/event-bus';
import type { CombatResult, GameState, Unit, UnitType } from '../../src/core/types';
import { getUnitSfxRequirement } from './helpers/sfx-coverage-policy';

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const ALL_TYPES = Object.keys(UNIT_DEFINITIONS) as UnitType[];
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };

function harness(units: Record<string, Unit>, viewer = 'player') {
  const played: string[] = [];
  const loader = { get: vi.fn((file: string) => Promise.resolve({ file } as unknown as AudioBuffer)) } as unknown as AudioLoader;
  const mixer = {
    playOneShot: vi.fn((_bus: string, buffer: AudioBuffer & { file: string }) => { played.push(buffer.file); return Promise.resolve(); }),
  } as unknown as AudioMixer;
  const listeners: Record<string, Array<(payload: unknown) => void>> = {};
  const bus = {
    on: vi.fn((event: string, handler: (payload: unknown) => void) => {
      (listeners[event] ??= []).push(handler);
      return () => { listeners[event] = (listeners[event] ?? []).filter(h => h !== handler); };
    }),
  } as unknown as EventBus;
  const state = {
    currentPlayer: viewer,
    units,
    civilizations: { player: { visibility: { tiles: { '0,0': 'visible', '1,0': 'visible' }, lastSeen: {} } } },
  } as unknown as GameState;
  const director = new SfxDirector(mixer, loader);
  director.start(units, bus, () => state);
  return { director, played, state, emit: (event: string, payload: unknown) => listeners[event]?.forEach(h => h(payload)), listeners };
}

const unit = (id: string, type: UnitType, q = 0): Unit => ({ id, type, owner: 'rome', position: { q, r: 0 } }) as unknown as Unit;
const result = (o: Partial<CombatResult> = {}): CombatResult => ({
  attackerId: 'a', defenderId: 'd', attackerDamage: 10, defenderDamage: 10,
  attackerSurvived: true, defenderSurvived: true, attackerStrength: 20, defenderStrength: 20,
  attackerPosition: { q: 0, r: 0 }, defenderPosition: { q: 1, r: 0 }, ...o,
});

/** What SfxDirector.handleCombatResolved is documented to play for the attacker. */
const expectedAttackFile = (type: UnitType) => {
  const sfx = UNIT_SFX[type];
  return (sfx?.['ranged-loose'] ?? sfx?.['siege-fire'] ?? sfx?.['attack-swing'])?.file;
};
const expectedHitFile = (type: UnitType) => {
  const sfx = UNIT_SFX[type];
  return (sfx?.['attack-impact'] ?? sfx?.['ranged-impact'] ?? sfx?.['siege-impact'])?.file;
};

describe('#612 every live unit is audible through the real SfxDirector', () => {
  it.each(ALL_TYPES)('%s: attacker, defender and defeat cues follow its derived requirement', async type => {
    const need = getUnitSfxRequirement(type);

    // As the attacker
    {
      const units = { a: unit('a', type), d: unit('d', 'warrior', 1) };
      const h = harness(units);
      h.emit('combat:resolved', { result: result() });
      await tick();
      const attackFile = expectedAttackFile(type);
      if (need.attackVoice.length > 0) {
        expect(attackFile, `${type} has an attack voice`).toBeDefined();
        expect(h.played, `${type} plays its attack voice first`).toContain(attackFile);
      } else {
        expect(attackFile, `${type} must not fabricate an attack cue`).toBeUndefined();
        expect(h.played).not.toContain(expectedAttackFile(type));
      }
      h.director.dispose();
    }

    // As the defender that is destroyed
    {
      const units = { a: unit('a', 'warrior'), d: unit('d', type, 1) };
      const h = harness(units);
      h.emit('combat:resolved', { result: result({ defenderSurvived: false }) });
      await tick();
      expect(h.played, `${type} defeat cue`).toContain(UNIT_SFX[type]!.death!.file);
      if (need.hitVoice.length > 0) expect(h.played, `${type} hit cue`).toContain(expectedHitFile(type));
      h.director.dispose();
    }
  });

  it('hidden combat and a seat that is not the viewer stay silent for new unit cues (no leak across hot-seat handoff)', async () => {
    const units = { a: unit('a', 'artillery'), d: unit('d', 'bomber', 1) };
    const h = harness(units);
    // Combat the current viewer was not entitled to see
    h.emit('combat:resolved', { result: result({ defenderSurvived: false }), visibleToViewerIds: ['someone-else'] });
    await tick();
    expect(h.played).toEqual([]);
    // Fogged location with no explicit viewer list
    h.state.civilizations.player!.visibility.tiles = { '0,0': 'fog', '1,0': 'fog' };
    h.emit('combat:resolved', { result: result({ attackerSurvived: false }) });
    await tick();
    expect(h.played).toEqual([]);
    h.director.dispose();
  });

  it('a handoff between the event and delayed playback cancels the new air movement cue', async () => {
    vi.useFakeTimers();
    try {
      const units = { f: unit('f', 'jet_fighter') };
      const h = harness(units);
      h.emit('unit:move', {
        unitId: 'f',
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }],
        presentationByViewer: { player: { unit: units.f, visibleSegments: [[{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }]] } },
      });
      h.state.currentPlayer = 'next-seat';
      await vi.runAllTimersAsync();
      expect(h.played).toEqual([]);
      h.director.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['biplane', AIR_MOVEMENT_SFX.propeller],
    ['jet_fighter', AIR_MOVEMENT_SFX.jet],
    ['attack_helicopter', AIR_MOVEMENT_SFX.rotor],
    ['combat_drone', AIR_MOVEMENT_SFX.drone],
    ['observation_balloon', MOVEMENT_SFX.air],
  ] as Array<[UnitType, { file: string }]>)('a moving %s plays its own aircraft cue, not a footstep', async (type, cue) => {
    vi.useFakeTimers();
    try {
      const units = { f: unit('f', type) };
      const h = harness(units);
      h.emit('unit:move', {
        unitId: 'f',
        path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
        presentationByViewer: { player: { unit: units.f, visibleSegments: [[{ q: 0, r: 0 }, { q: 1, r: 0 }]] } },
      });
      await vi.runAllTimersAsync();
      expect(h.played).toEqual([cue.file]);
      expect(h.played).not.toContain(MOVEMENT_SFX.humanoid.file);
      h.director.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('a multi-hex aircraft move plays ONE sustained cue, while a ground unit still steps per hex', async () => {
    vi.useFakeTimers();
    try {
      const path = [0, 1, 2, 3, 4].map(q => ({ q, r: 0 }));
      const view = (u: Unit) => ({ player: { unit: u, visibleSegments: [path] } });
      const air = { f: unit('f', 'jet_fighter') };
      const hAir = harness(air);
      hAir.emit('unit:move', { unitId: 'f', path, presentationByViewer: view(air.f) });
      await vi.runAllTimersAsync();
      expect(hAir.played).toEqual([AIR_MOVEMENT_SFX.jet.file]);
      hAir.director.dispose();

      const ground = { w: unit('w', 'warrior') };
      const hGround = harness(ground);
      hGround.emit('unit:move', { unitId: 'w', path, presentationByViewer: view(ground.w) });
      await vi.runAllTimersAsync();
      expect(hGround.played).toEqual(Array(4).fill(MOVEMENT_SFX.humanoid.file));
      hGround.director.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it('starting twice does not register duplicate listeners, and dispose removes them all', () => {
    const units = { a: unit('a', 'rifleman') };
    const h = harness(units);
    const before = Object.values(h.listeners).reduce((n, l) => n + l.length, 0);
    h.director.start(units, { on: vi.fn() } as unknown as EventBus);
    expect(Object.values(h.listeners).reduce((n, l) => n + l.length, 0)).toBe(before);
    h.director.dispose();
    expect(Object.values(h.listeners).reduce((n, l) => n + l.length, 0)).toBe(0);
  });
});

describe('#612 offline behaviour of the new cues', () => {
  const sw = fs.readFileSync(path.join(PROJECT_ROOT, 'public/sw.js'), 'utf8');
  const audioSystem = fs.readFileSync(path.join(PROJECT_ROOT, 'src/audio/audio-system.ts'), 'utf8');

  it('every unit cue is preloaded at game start from allSfxEntries()', () => {
    expect(audioSystem).toMatch(/preloadSfx\(\)[\s\S]*loader\.preload\(allSfxEntries\(\)\.map\(e => e\.file\)\)/);
    const files = new Set(allSfxEntries().map(e => e.file));
    for (const type of ALL_TYPES) {
      for (const entry of Object.values(UNIT_SFX[type] ?? {})) expect(files.has(entry.file), `${type}: ${entry.file}`).toBe(true);
    }
    expect(files.has(MOVEMENT_SFX.air.file)).toBe(true);
    for (const cue of Object.values(AIR_MOVEMENT_SFX)) expect(files.has(cue.file), cue.file).toBe(true);
  });

  it('the service worker caches every fetched response at runtime, so no explicit SFX precache list exists or is needed', () => {
    // sw.js: cache-first fetch handler that cache.put()s every ok response; unit SFX are deliberately
    // not in PRECACHE_URLS (neither are any of the ~130 pre-#612 unit cues).
    expect(sw).toMatch(/addEventListener\('fetch'/);
    expect(sw).toMatch(/cache\.put\(event\.request, clone\)/);
    expect(sw).not.toMatch(/audio\/sfx\//);
  });

  it('every shipped file is a local relative path (no remote URLs in the catalog)', () => {
    for (const entry of allSfxEntries()) {
      expect(entry.file).toMatch(/^audio\/(sfx|stinger)\/[A-Za-z0-9_\-/]+\.ogg$/);
      expect(fs.existsSync(path.join(PROJECT_ROOT, 'public', entry.file)), entry.file).toBe(true);
    }
  });
});

describe('#612 historical eight-unit reconciliation (current source outranks the issue text)', () => {
  const classes = (type: UnitType) => Object.keys(UNIT_SFX[type] ?? {}).sort();

  it('missionary: unarmed, so defeat only — preaching stays with #594', () => {
    expect(UNIT_DEFINITIONS.missionary.strength).toBe(0);
    expect(classes('missionary')).toEqual(['death']);
  });
  it('recon_aircraft: unarmed, so defeat only', () => {
    expect(UNIT_DEFINITIONS.recon_aircraft.strength).toBe(0);
    expect(classes('recon_aircraft')).toEqual(['death']);
  });
  it('artillery: bombard profile, siege-fire / siege-impact / death', () => {
    expect(UNIT_DEFINITIONS.artillery.attackProfile?.kind).toBe('bombard');
    expect(classes('artillery')).toEqual(['death', 'siege-fire', 'siege-impact']);
  });
  it('bomber: air bombard, release + heavy blast + crash', () => {
    expect(UNIT_DEFINITIONS.bomber.attackProfile?.kind).toBe('bombard');
    expect(classes('bomber')).toEqual(['death', 'ranged-impact', 'ranged-loose']);
  });
  it.each(['infantry', 'frigate', 'destroyer'] as UnitType[])('%s: ranged profile, ranged-loose / ranged-impact / death', type => {
    expect(UNIT_DEFINITIONS[type].attackProfile?.kind).toBe('ranged');
    expect(classes(type)).toEqual(['death', 'ranged-impact', 'ranged-loose']);
  });
  it('marine: melee profile, so it carries melee classes (rifle sounds under attack-swing)', () => {
    expect(UNIT_DEFINITIONS.marine.attackProfile?.kind).toBe('melee');
    expect(classes('marine')).toEqual(['attack-impact', 'attack-swing', 'death']);
  });
});
