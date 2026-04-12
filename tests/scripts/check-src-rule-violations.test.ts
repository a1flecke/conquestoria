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
});
