import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const imports = (source: string) => [...source.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);

describe('domination architecture boundaries', () => {
  it('keeps the rule kernel a type-only leaf', () => {
    expect([...new Set(imports(read('src/systems/domination-rules.ts')))]).toEqual([
      './domination-types',
    ]);
  });

  it('keeps authoritative sovereignty and victory queries out of UI and AI', () => {
    const forbidden = /@\/systems\/(domination-sovereignty|victory-system)/;
    for (const path of [
      'src/ui/advisor-system.ts',
      'src/ui/vassalage-controls.ts',
      'src/ui/victory-panel.ts',
      'src/ui/victory-progress-panel.ts',
      'src/systems/domination-presentation.ts',
    ]) {
      expect(read(path), path).not.toMatch(forbidden);
    }
  });

  it('limits foreign sovereignty reads to source-owned report acquisition', () => {
    const knowledge = read('src/systems/domination-knowledge.ts');
    expect(knowledge).toContain('function ownFact');
    expect(knowledge).toContain('getDominationActorFact(state, observerId)');
    expect(knowledge).not.toContain('getDominationActorFact(state, civId)');

    const intel = read('src/systems/domination-intel.ts');
    expect(intel).toContain('function recordDominationPoliticalReport');
    expect(intel).toContain('getDominationActorFact(state, contenderId)');
  });

  it('uses canonical liveness rather than civilization roster fields in the victory adapter', () => {
    const victory = read('src/systems/victory-system.ts');
    expect(victory).not.toMatch(/civilizations(?:\[[^\]]+\]|\.[A-Za-z0-9_]+)\.(?:cities|units)/);
    expect(read('src/systems/domination-sovereignty.ts')).toContain('getCivilizationLiveness');
  });
});
