import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
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
      const paddingLines = Array.from({ length: 430 }, (_, i) => `// padding line ${i + 1}`);
      // Real baseline entry: src/systems/combat-system.ts:431 (#982 left this
      // [LOW]-tagged LCG recurrence body in place — it's already fed a
      // gameId-rooted seed by its caller, just a hand-rolled duplicate of
      // seededLcg's body, not a live seed-construction bug).
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

  describe('#995 single-side war/peace mutation rule', () => {
    it('blocks single-side declareWar()/makePeace() outside diplomacy-system', () => {
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
      expect(result.stderr).toContain('Single-side declareWar()/makePeace() outside diplomacy-system');
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
    it('blocks single-side signTreaty() outside diplomacy-system', () => {
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
      expect(result.stderr).toContain('Single-side signTreaty() outside diplomacy-system');
    });

    it('allows signTreaty() inside diplomacy-system.ts (commitTreatyAgreement)', () => {
      const workspace = makeWorkspace();
      writeWorkspaceFile(
        workspace,
        'src/systems/diplomacy-system.ts',
        [
          'export function commitTreatyAgreement(state: GameState, civAId: string, civBId: string, type: TreatyType, bus: EventBus): GameState {',
          '  const aState = signTreaty(civA.diplomacy, civAId, civBId, type, turns, state.turn, cap);',
          '  const bState = signTreaty(civB.diplomacy, civBId, civAId, type, turns, state.turn, cap);',
          '  return state;',
          '}',
        ].join('\n'),
      );

      const result = runScript(workspace, 'src/systems/diplomacy-system.ts');

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
});
