import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';

const SCRIPT_PATH = resolve(process.cwd(), 'scripts/check-src-rule-violations.sh');

const tempDirs: string[] = [];

function makeWorkspace(): string {
  const dir = mkdtempSync(join(tmpdir(), 'check-src-rule-violations-'));
  tempDirs.push(dir);
  return dir;
}

function writeWorkspaceFile(workspace: string, relativePath: string, content: string): void {
  const fullPath = join(workspace, relativePath);
  mkdirSync(dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, content);
}

function runScript(workspace: string, ...args: string[]) {
  return spawnSync(SCRIPT_PATH, args, {
    cwd: workspace,
    encoding: 'utf8',
  });
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe('check-src-rule-violations.sh', () => {
  it('returns a usage error when no file paths are provided', () => {
    const workspace = makeWorkspace();

    const result = runScript(workspace);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Usage:');
  });

  it('reports src rule violations with multiline diagnostics', () => {
    const workspace = makeWorkspace();
    writeWorkspaceFile(
      workspace,
      'src/ui/problem-panel.ts',
      [
        "const owner = unit.owner === 'player';",
        'const roll = Math.random();',
      ].join('\n'),
    );

    const result = runScript(workspace, 'src/ui/problem-panel.ts');

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('check-src-rule-violations: src/ui/problem-panel.ts');
    expect(result.stderr).toContain("Hardcoded 'player' ownership check");
    expect(result.stderr).toContain('Math.random() is banned in src/');
    expect(result.stderr).toContain('\n2:const roll = Math.random();\n');
  });

  it('matches Claude hook exceptions for comments and allowed cities[0] files', () => {
    const workspace = makeWorkspace();
    writeWorkspaceFile(
      workspace,
      'src/ai/capital-heuristic.ts',
      [
        'const firstCity = civ.cities[0];',
        '// const roll = Math.random();',
      ].join('\n'),
    );

    const result = runScript(workspace, 'src/ai/capital-heuristic.ts');

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  describe('#1021 hand-rolled simulation RNG rule', () => {
    it('blocks a new LCG constant + truncated-id charCodeAt outside the baseline', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/fresh-rng.ts',
        [
          'export function badSeed(turn: number, unitId: string): number {',
          '  return turn * 48271 + unitId.charCodeAt(0);',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/fresh-rng.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected');
      expect(result.stderr).toContain('createSimulationRng()');
    });

    it('allows createSimulationRng usage with no bare constant or charCodeAt', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/good-rng.ts',
        [
          "import { createSimulationRng } from './simulation-rng';",
          '',
          'export function rollVillageOutcome(state: GameState, villageId: string, unitId: string): number {',
          "  const rng = createSimulationRng(state, { domain: 'village-visit', actorId: unitId, targetId: villageId });",
          '  return rng();',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/good-rng.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows a pre-existing occurrence recorded in the legacy baseline at its exact path:line', () => {
      const workspace = makeWorkspace();
      // Read the real baseline entry instead of hard-coding its line: a refactor that moves the code above it
      // re-keys the baseline entry, and this fixture must follow (it used to pin :529 and broke on a move).
      const baseline = readFileSync(resolve(__dirname, '../../.claude/rng-legacy-baseline.txt'), 'utf8');
      const entry = baseline.match(/^src\/systems\/combat-system\.ts:(\d+) /m);
      expect(entry, 'combat-system.ts has a legacy baseline entry').not.toBeNull();
      const entryLine = Number(entry![1]);
      const paddingLines = Array.from({ length: entryLine - 1 }, (_, i) => `// padding line ${i + 1}`);
      // The [LOW]-tagged LCG recurrence body #982 left in place — it's already fed a gameId-rooted seed by
      // its caller, just a hand-rolled duplicate of the recurrence, not a live seed-construction bug.
      const lines = [...paddingLines, '  rngState = (rngState * 48271) % 2147483647;'];
      writeWorkspaceFile(workspace, 'src/systems/combat-system.ts', lines.join('\n'));

      const result = runScript(workspace, 'src/systems/combat-system.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('still blocks the same offending pattern at a different, non-baselined line in that file', () => {
      const workspace = makeWorkspace();
      const paddingLines = Array.from({ length: 130 }, (_, i) => `// padding line ${i + 1}`);
      const lines = ['  const rng2 = seededLcg(state.turn * 7919);', ...paddingLines];
      writeWorkspaceFile(workspace, 'src/systems/crisis-system.ts', lines.join('\n'));

      const result = runScript(workspace, 'src/systems/crisis-system.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected');
    });

    it('exempts map-generator.ts permanently regardless of content', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/map-generator.ts',
        [
          'export function createRng(seed: string): () => number {',
          '  let h = seed.length * 48271;',
          '  return () => (h = (h * 1664525 + 1013904223) | 0) / 4294967296;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/map-generator.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('exempts deterministic-hash.ts permanently: it is the canonical home of every string-hash variant (#1234)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/deterministic-hash.ts',
        [
          'export function lehmerFoldByCodePoint(initial: number, source: string): number {',
          '  let state = initial;',
          '  for (const character of source) state = (state * 48271 + character.charCodeAt(0)) % 2147483647;',
          '  return state;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/deterministic-hash.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('still blocks the same hash loop in any other file under src/systems (#1234)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/new-feature.ts',
        '  for (const character of source) state = (state * 48271 + character.charCodeAt(0)) % 2147483647;\n',
      );

      const result = runScript(workspace, 'src/systems/new-feature.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Hand-rolled simulation RNG constant or truncated-id charCodeAt() detected');
    });

    it('never scans src/audio -- the rule is scoped to src/systems, src/ai, src/core only', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/audio/sfx.ts',
        [
          'export function noiseSample(noiseSeed: number): number {',
          '  return (noiseSeed * 1664525 + 1013904223) & 0xffffffff;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/audio/sfx.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#1025 / #1010 low-level unit mover rule', () => {
    const run = (path: string, source: string) => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, path, source);
      return runScript(workspace, path);
    };
    const CALL = 'export const step = (s: GameState, u: Unit) => moveUnit(u, { q: 1, r: 0 }, 1);\n';

    it('blocks a low-level mover call outside the sanctioned modules', () => {
      const result = run('src/ai/sneaky-move.ts', CALL);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Low-level unit mover called outside the movement system');
    });

    it('allows the defining module and the canonical executor', () => {
      expect(run('src/systems/unit-low-level-move.ts', CALL).status).toBe(0);
      expect(run('src/systems/unit-movement-system.ts', CALL).status).toBe(0);
    });

    it('no longer treats the deprecated unit-system facade as a place the movers may be called', () => {
      expect(run('src/systems/unit-system.ts', CALL).status).toBe(2);
    });

    it('allows a marked world-actor exemption', () => {
      const marked = 'export const step = (u: Unit) => moveUnit(u, { q: 1, r: 0 }, 1); // movement-contract-exempt: ocean-only raider step\n';
      expect(run('src/systems/pirate-system.ts', marked).status).toBe(0);
    });
  });

  describe('#1015 silent session write rule', () => {
    const run = (path: string, source: string) => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, path, source);
      return runScript(workspace, path);
    };

    it('blocks the removed setStateWithoutRefresh anywhere in src', () => {
      const result = run('src/app/controllers/new-controller.ts', 'session.setStateWithoutRefresh(next);\n');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('setStateWithoutRefresh was removed from GameSession');
    });

    it('does not trip on a comment that merely names the removed API', () => {
      expect(run('src/app/controllers/new-controller.ts', '// setStateWithoutRefresh was removed in #1015\nexport const x = 1;\n').status).toBe(0);
    });

    it('blocks unpublished.adopt() outside a sanctioned owner', () => {
      const result = run('src/app/controllers/player-action-controller.ts', "deps.unpublished.adopt(next, 'pre-world-entry');\n");
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('unpublished.adopt() called outside a sanctioned owner');
    });

    it('allows the named owners', () => {
      const call = "deps.unpublished.adopt(next, 'viewer-not-yet-revealed');\n";
      for (const owner of [
        'src/app/controllers/campaign-entry-controller.ts',
        'src/app/controllers/turn-flow-controller.ts',
        'src/app/cross-cutting-helpers.ts',
      ]) {
        expect(run(owner, call).status, owner).toBe(0);
      }
    });
  });

  describe('#1014 single-entry-point consequence rules', () => {
    const run = (path: string, source: string) => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, path, source);
      return runScript(workspace, path);
    };

    it('blocks resolveStrategicStrike() outside the launch-execution wrapper', () => {
      const result = run('src/ui/quick-strike.ts', 'const r = resolveStrategicStrike(state, civ, city);\n');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('resolveStrategicStrike() called outside strategic-launch-execution-system.ts');
    });

    it('allows the primitive, its single wrapper, and comments that merely name it', () => {
      const call = 'const r = resolveStrategicStrike(state, civ, city);\n';
      expect(run('src/systems/strategic-launch-execution-system.ts', call).status).toBe(0);
      expect(run('src/systems/strategic-strike-system.ts', call).status).toBe(0);
      expect(run('src/ai/some-ai.ts', '// never resolveStrategicStrike( directly\nexport const x = 1;\n').status).toBe(0);
    });

    it('blocks recordBeastSlain() outside the beast/combat-reward modules', () => {
      const result = run('src/core/some-executor.ts', 'const r = recordBeastSlain(state, beast, hero);\n');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('recordBeastSlain() called outside combat-reward-system.ts');
    });

    it('allows the two sanctioned modules to call recordBeastSlain()', () => {
      const call = 'const r = recordBeastSlain(state, beast, hero);\n';
      expect(run('src/systems/combat-reward-system.ts', call).status).toBe(0);
      expect(run('src/systems/beast-system.ts', call).status).toBe(0);
    });
  });

  describe('#1198 unit removal is one transition', () => {
    const run = (path: string, source: string) => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, path, source);
      return runScript(workspace, path);
    };

    const hand = [
      ['delete', 'delete next.units[unit.id];\n'],
      ['bare delete', 'delete units[id];\n'],
      ['rest-destructure', 'const { [id]: _removed, ...remainingUnits } = state.units;\n'],
      ['rest-destructure of a local', 'const { [uid]: _removed, ...remainingUnits } = nextUnits;\n'],
      ['filter-rebuild', 'const units = Object.fromEntries(Object.entries(state.units).filter(([id]) => !gone.has(id)));\n'],
    ] as const;

    it.each(hand)('blocks a hand-rolled %s outside the module', (_name, source) => {
      const result = run('src/systems/some-system.ts', source);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Hand-rolled unit removal outside unit-removal-system.ts');
    });

    it('allows the canonical module and save repairs', () => {
      expect(run('src/systems/unit-removal-system.ts', 'delete units[id];\n').status).toBe(0);
      expect(run('src/storage/migrations/steps/some-step.ts', 'delete units[id];\n').status).toBe(0);
    });

    it('exempts comment lines and does not flag non-unit rest-destructures or reads', () => {
      expect(run('src/systems/some-system.ts', '// we never delete units[id] by hand\n').status).toBe(0);
      expect(run('src/systems/some-system.ts', 'const { [id]: _removed, ...rest } = state.cities;\n').status).toBe(0);
      expect(run('src/systems/some-system.ts', 'const names = Object.entries(state.units).filter(([, u]) => u.hasMoved);\n').status).toBe(0);
    });
  });

  describe('#995 single-side war/peace mutation rule', () => {
    it('blocks single-side declareWar()/makePeace() outside diplomacy-war', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ai/war-planner.ts',
        [
          'export function plan(state: GameState, a: string, b: string): DiplomacyState {',
          '  const next = declareWar(state.civilizations[a].diplomacy, b, state.turn);',
          '  return makePeace(next, b, state.turn);',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/ai/war-planner.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Single-side declareWar()/makePeace() outside diplomacy-war');
    });

    it('allows declareMajorWar()/makeMajorPeace() (the bilateral transitions)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ai/war-planner-ok.ts',
        'export const plan = (s: GameState, a: string, b: string) => makeMajorPeace(declareMajorWar(s, a, b), a, b);\n',
      );

      const result = runScript(workspace, 'src/ai/war-planner-ok.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows the single-side forms inside the sanctioned minor-civ war paths', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/minor-civ-coalition-system.ts',
        'const d = declareWar(target.diplomacy, memberId, nextState.turn, false);\n',
      );

      const result = runScript(workspace, 'src/systems/minor-civ-coalition-system.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#1003 single-side treaty mutation rule', () => {
    it('blocks single-side signTreaty() outside diplomacy-treaties', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ai/treaty-planner.ts',
        [
          'export function propose(state: GameState, a: string, b: string): DiplomacyState {',
          "  return signTreaty(state.civilizations[a].diplomacy, a, b, 'alliance', -1, state.turn);",
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/ai/treaty-planner.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Single-side signTreaty() outside diplomacy-treaties');
    });

    it('allows signTreaty() inside diplomacy-treaties.ts (commitTreatyAgreement)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/diplomacy-treaties.ts',
        [
          'export function commitTreatyAgreement(state: GameState, civAId: string, civBId: string, type: TreatyType, bus: EventBus): GameState {',
          '  const aState = signTreaty(civA.diplomacy, civAId, civBId, type, turns, state.turn, cap);',
          '  const bState = signTreaty(civB.diplomacy, civBId, civAId, type, turns, state.turn, cap);',
          '  return state;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/diplomacy-treaties.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows signTreaty() inside the #846 scenario builder', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/testing/scenario-steps/diplomacy-step.ts',
        [
          'export function applyDiplomacyStep(state: GameState, step: DiplomacyStep): GameState {',
          "  civA.diplomacy = signTreaty(civA.diplomacy, step.civA, step.civB, 'alliance', -1, state.turn);",
          "  civB.diplomacy = signTreaty(civB.diplomacy, step.civB, step.civA, 'alliance', -1, state.turn);",
          '  return state;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/testing/scenario-steps/diplomacy-step.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#985 domination authority boundaries', () => {
    it('blocks UI and AI imports of the authoritative domination adapter', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ui/domination-panel.ts',
        "import { buildDominationActorFacts } from '@/systems/domination-sovereignty';",
      );

      const result = runScript(workspace, 'src/ui/domination-panel.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Authoritative domination queries are not available to UI or AI');
    });

    it('blocks roster-based liveness in the victory adapter but permits canonical liveness', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/victory-system.ts',
        'const survivors = state.civilizations[civId].units.length;',
      );
      writeWorkspaceFile(
        workspace,
        'src/systems/domination-sovereignty.ts',
        "import { getCivilizationLiveness } from './civilization-liveness';\nconst living = getCivilizationLiveness(state, civId);",
      );

      const bad = runScript(workspace, 'src/systems/victory-system.ts');
      const good = runScript(workspace, 'src/systems/domination-sovereignty.ts');

      expect(bad.status).toBe(2);
      expect(bad.stderr).toContain('Victory may not use civilization roster lengths for liveness');
      expect(good.status).toBe(0);
      expect(good.stderr).toBe('');
    });
  });

  describe('#1019 canonical city ownership rule', () => {
    it('blocks a new roster-length ownership decision outside sanctioned files', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ui/rogue-panel.ts',
        [
          'export function isEliminated(civ: { cities: string[] }): boolean {',
          '  return civ.cities.length === 0;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/ui/rogue-panel.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Roster-length ownership decision');
      expect(result.stderr).toContain('getOwnedCityCount');
    });

    it('allows roster-length reads inside turn-manager (ordered processing)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/core/turn-manager.ts',
        'const cityCount = civ.cities.length;\n',
      );

      const result = runScript(workspace, 'src/core/turn-manager.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows roster-length reads inside the round phases that turn-manager runs (#1240)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, 'src/core/round-phases/barbarians.ts', 'const cityCount = civ.cities.length;\n');
      writeWorkspaceFile(workspace, 'src/core/round-phases/per-civ/diplomacy-drift.ts', 'const cityCount = civ.cities.length;\n');

      for (const file of ['src/core/round-phases/barbarians.ts', 'src/core/round-phases/per-civ/diplomacy-drift.ts']) {
        const result = runScript(workspace, file);
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');
      }
    });

    it('allows roster-length reads inside city-capture-system (roster maintenance)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/city-capture-system.ts',
        'const remaining = owner.cities.length;\n',
      );

      const result = runScript(workspace, 'src/systems/city-capture-system.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#1020 canonical unit ownership rule', () => {
    it('blocks a new roster-length ownership decision outside sanctioned files', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ui/rogue-panel.ts',
        [
          'export function hasArmy(civ: { units: string[] }): boolean {',
          '  return civ.units.length > 0;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/ui/rogue-panel.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Roster-length ownership decision');
      expect(result.stderr).toContain('getOwnedUnitCount');
    });

    it('allows roster-length reads inside turn-manager (ordered processing)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/core/turn-manager.ts',
        'const unitCount = civ.units.length;\n',
      );

      const result = runScript(workspace, 'src/core/turn-manager.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows roster-length reads inside the round phases that turn-manager runs (#1240)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, 'src/core/round-phases/per-civ/unit-recovery.ts', 'const unitCount = civ.units.length;\n');

      const result = runScript(workspace, 'src/core/round-phases/per-civ/unit-recovery.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('allows roster-length reads inside civilization-elimination-system (roster maintenance)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/civilization-elimination-system.ts',
        'const rosterSize = civ.units.length;\n',
      );

      const result = runScript(workspace, 'src/systems/civilization-elimination-system.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });

    it('does not flag the persistence DTO snapshot.units.length', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/ui/espionage-panel.ts',
        'const unitCount = snapshot.units.length;\n',
      );

      const result = runScript(workspace, 'src/ui/espionage-panel.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#985/#1008 catalog runtime dependency boundary', () => {
    it('blocks the runtime espionage system from any city production module', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/city-building-catalog.ts',
        "import { isSpyUnitType } from './espionage-system';\n",
      );

      const result = runScript(workspace, 'src/systems/city-building-catalog.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('city production modules must import the spy classifier');
    });

    it('blocks any espionage runtime module, not only the barrel (#1009)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/city-production-cost.ts',
        "import { getSpySuccessChance } from './espionage-probability';\n",
      );

      const result = runScript(workspace, 'src/systems/city-production-cost.ts');

      expect(result.status).toBe(2);
      expect(result.stderr).toContain('city production modules must import the spy classifier');
    });

    it('allows the spy catalog leaf in the cost module', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/city-production-cost.ts',
        "import { isSpyUnitType } from './spy-unit-types';\n",
      );

      const result = runScript(workspace, 'src/systems/city-production-cost.ts');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    });
  });

  describe('#1199 controller publication rule', () => {
    const run = (path: string, source: string) => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(workspace, path, source);
      return runScript(workspace, path);
    };

    it('blocks a controller that hands renderer/HUD a state push', () => {
      const result = run('src/app/controllers/foo.ts', 'renderLoop.setGameState(x);\nhud.update();\n');
      expect(result.status).toBe(2);
      expect(result.stderr).toContain('Controller pushes renderer/HUD state by hand');
    });

    it('blocks a lone renderer push or a lone HUD push', () => {
      expect(run('src/app/controllers/foo.ts', 'renderLoop.setGameState(x);\n').status).toBe(2);
      expect(run('src/app/controllers/foo.ts', 'deps.updateHUD();\n').status).toBe(2);
      expect(run('src/app/controllers/foo.ts', 'deps.hud.update();\n').status).toBe(2);
    });

    it('allows the pinned presentation-deferred pair in turn-flow-controller', () => {
      const source = [
        'renderLoop.setGameState(session.getState());',
        'await replayAIMoves(soloMoves);',
        'deps.updateHUD();',
      ].join('\n');
      expect(run('src/app/controllers/turn-flow-controller.ts', source).status).toBe(0);
    });

    it('blocks the pair in turn-flow-controller when the order is reversed', () => {
      const source = [
        'deps.updateHUD();',
        'await replayAIMoves(soloMoves);',
        'renderLoop.setGameState(session.getState());',
      ].join('\n');
      expect(run('src/app/controllers/turn-flow-controller.ts', source).status).toBe(2);
    });

    it('blocks a third push alongside the pinned pair', () => {
      const source = [
        'renderLoop.setGameState(session.getState());',
        'await replayAIMoves(soloMoves);',
        'deps.updateHUD();',
        'renderLoop.setGameState(session.getState());',
      ].join('\n');
      expect(run('src/app/controllers/turn-flow-controller.ts', source).status).toBe(2);
    });

    it('does not flag the `updateHUD: () => deps.hud.update(),` dep wiring', () => {
      expect(run('src/app/controllers/foo.ts', '      updateHUD: () => deps.hud.update(),\n').status).toBe(0);
    });
  });
});
