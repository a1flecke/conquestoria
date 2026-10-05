import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// #1334: one viewer-safe strength projection that every diplomatic rule shares. The shared modules must stay
// model-neutral (no import from src/ai), and nothing in src/ai may grow a second formula beside them.
const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');

function sourceFiles(dir: string): string[] {
  return readdirSync(join(process.cwd(), dir), { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sourceFiles(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

describe('diplomatic strength boundary (#1334)', () => {
  it.each(['src/systems/diplomatic-strength.ts', 'src/systems/viewer-military-intel.ts'])(
    '%s imports nothing from src/ai',
    (file) => {
      const imports = read(file).split('\n').filter(line => /^\s*(import|export)\b.*\bfrom\b/.test(line));
      expect(imports.filter(line => /@\/ai\/|['"]\.\.?\/ai[-/]/.test(line))).toEqual([]);
    },
  );

  it('defines the military strength formula exactly once, in the shared module', () => {
    const definers = sourceFiles('src').filter(file => /export function (estimateMilitaryStrength|estimatePerceivedCivStrength)\b/.test(read(file)));
    expect(definers).toEqual(['src/systems/diplomatic-strength.ts']);
  });

  it('the AI perception layer reads units and cities through the shared collection, not its own visibility walk', () => {
    const perception = read('src/ai/ai-perception.ts');
    expect(perception).toContain('collectPerceivedUnits');
    expect(perception).toContain('collectPerceivedCities');
    expect(perception).not.toContain('getVisibleUnitsForPlayer');
    expect(perception).not.toContain('canInspectUnitForViewer');
  });

  it('no AI module classifies military units for strength with its own role taxonomy', () => {
    expect(sourceFiles('src/ai').filter(file => /\bestimateMilitaryStrength\b/.test(read(file)))).toEqual([]);
  });
});
