// #1240: the round pipeline is data (`ROUND_PHASES`), one module per phase, no phase reaching into another. The ORDER and
// the OUTPUT are pinned by round-phase-order.test.ts (#1239); this file pins the SHAPE so the decomposition cannot
// quietly grow back into one function.
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { ROUND_PHASES, createRoundPhaseContext, type RoundPhaseId } from '@/core/round-phases';

const PHASES_DIR = resolve(__dirname, '../../src/core/round-phases');
const PER_CIV_DIR = resolve(PHASES_DIR, 'per-civ');
const MAX_MODULE_LINES = 320;

// A `Record<RoundPhaseId, …>` is exhaustive at compile time: a new id in the union is a type error until it is listed here.
const EXPECTED_IDS: Record<RoundPhaseId, true> = {
  prelude: true,
  instability: true,
  'pre-civ-reconciliation': true,
  'per-civ': true,
  'post-civ-housekeeping': true,
  'territory-frontier': true,
  'wonders-market': true,
  barbarians: true,
  'minor-civs': true,
  beasts: true,
  'threat-scheduling': true,
  espionage: true,
  'diplomacy-trade': true,
  pirates: true,
  'trade-income': true,
  leagues: true,
  'era-progression': true,
  'beast-rewards': true,
  economy: true,
  finalization: true,
};

function read(dir: string, file: string): string {
  return readFileSync(resolve(dir, file), 'utf8');
}

function tsFiles(dir: string): string[] {
  return readdirSync(dir).filter(name => name.endsWith('.ts')).sort();
}

function camel(id: string): string {
  return id.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/** Code without comments, so prose that names a module is never mistaken for an import. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('round phases (#1240)', () => {
  it('ROUND_PHASES lists every phase id exactly once', () => {
    const ids = ROUND_PHASES.map(phase => phase.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(Object.keys(EXPECTED_IDS).sort());
  });

  it('there is one module per phase, named for its id, exporting that phase (per-civ is a folder)', () => {
    const singleModuleIds = ROUND_PHASES.map(phase => phase.id).filter(id => id !== 'per-civ');
    const phaseFiles = tsFiles(PHASES_DIR).filter(name => name !== 'index.ts' && name !== 'types.ts');
    expect(phaseFiles).toEqual(singleModuleIds.map(id => `${id}.ts`).sort());
    for (const id of singleModuleIds) {
      expect(code(read(PHASES_DIR, `${id}.ts`)), `${id} must export ${camel(id)}Phase`).toMatch(
        new RegExp(`export const ${camel(id)}Phase: RoundPhase = \\{ id: '${id}', run: `),
      );
    }
  });

  it('per-civ is a folder whose index exports the phase', () => {
    expect(code(read(PER_CIV_DIR, 'index.ts'))).toMatch(/export const perCivPhase: RoundPhase = \{ id: 'per-civ', run: /);
  });

  it('every per-civ step module is wired into the per-civ pipeline', () => {
    const index = code(read(PER_CIV_DIR, 'index.ts'));
    const steps = tsFiles(PER_CIV_DIR).filter(name => name !== 'index.ts' && name !== 'types.ts');
    expect(steps.length).toBeGreaterThanOrEqual(10);
    for (const step of steps) {
      expect(index, `${step} is not imported by per-civ/index.ts`).toContain(`from './${step.replace(/\.ts$/, '')}'`);
    }
  });

  it('no phase imports another phase: phases communicate through the state and the round context', () => {
    const phaseModules = new Set<RoundPhaseId>(ROUND_PHASES.map(phase => phase.id).filter(id => id !== 'per-civ'));
    for (const file of tsFiles(PHASES_DIR)) {
      if (file === 'index.ts') continue;
      for (const match of code(read(PHASES_DIR, file)).matchAll(/from '\.\/([\w-]+)'/g)) {
        expect(phaseModules.has(match[1] as RoundPhaseId), `${file} imports phase module ${match[1]}`).toBe(false);
      }
    }
    for (const file of tsFiles(PER_CIV_DIR)) {
      for (const match of code(read(PER_CIV_DIR, file)).matchAll(/from '\.\.\/([\w-]+)'/g)) {
        expect(['types'], `per-civ/${file} imports ../${match[1]}`).toContain(match[1]);
      }
    }
  });

  it('only the prelude makes the whole-state working clone', () => {
    const offenders = [...tsFiles(PHASES_DIR).map(file => ['', file] as const), ...tsFiles(PER_CIV_DIR).map(file => ['per-civ', file] as const)]
      .filter(([sub, file]) => code(read(sub ? PER_CIV_DIR : PHASES_DIR, file)).includes('structuredClone('))
      .map(([sub, file]) => (sub ? `${sub}/${file}` : file));
    expect(offenders).toEqual(['prelude.ts']);
  });

  it('there is no module-level mutable state: a round can never see a previous round', () => {
    for (const [dir, file] of [...tsFiles(PHASES_DIR).map(f => [PHASES_DIR, f] as const), ...tsFiles(PER_CIV_DIR).map(f => [PER_CIV_DIR, f] as const)]) {
      expect(code(read(dir, file)), `${file} has a top-level let/var`).not.toMatch(/^(let|var) /m);
    }
  });

  it(`no phase or step module exceeds ${MAX_MODULE_LINES} lines`, () => {
    for (const [dir, file] of [...tsFiles(PHASES_DIR).map(f => [PHASES_DIR, f] as const), ...tsFiles(PER_CIV_DIR).map(f => [PER_CIV_DIR, f] as const)]) {
      expect(read(dir, file).split('\n').length, `${file}`).toBeLessThanOrEqual(MAX_MODULE_LINES);
    }
  });

  it('processTurn is a loop over ROUND_PHASES and holds no phase logic', () => {
    const turnManager = code(readFileSync(resolve(__dirname, '../../src/core/turn-manager.ts'), 'utf8'));
    expect(turnManager).toContain('ROUND_PHASES.reduce(');
    expect(turnManager.split('\n').filter(line => line.trim()).length).toBeLessThan(25);
    expect(turnManager).not.toMatch(/from '@\/systems\//);
  });

  it('every round gets a fresh context: nothing leaks from one round to the next', () => {
    const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, seed: 'round-phases-structure', gameTitle: 'structure' });
    const bus = new EventBus();
    const first = createRoundPhaseContext(state, bus);
    const second = createRoundPhaseContext(state, bus);
    expect(second).not.toBe(first);
    expect(second.grossGoldByCiv).not.toBe(first.grossGoldByCiv);
    expect(second.previousEconomyStatusByCiv).not.toBe(first.previousEconomyStatusByCiv);
    expect(first.grossGoldByCiv).toEqual({});
    expect(first.pirateEconomyModifiers).toBeUndefined();
  });
});
