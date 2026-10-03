/**
 * #1219 — which code may call `resolveCombat`, and what legality it must have run first.
 *
 * `resolveCombat` is deliberately a pure exchange resolver (forecasts, previews and world actors use it), so it
 * validates nothing. The contract lives at its callers: every call is either
 *   (a) preceded, in the same function, by the canonical unit-vs-unit legality
 *       (`resolveUnitVsUnitAttack` / `canUnitAttackTarget` / `getEmbarkedAssaultTarget`), or
 *   (b) marked `// attack-contract-exempt: <category>: <reason>` in the lines above it, with the category one of
 *       {@link EXEMPT_CATEGORIES} and the marker pinned by {@link EXPECTED_EXEMPTIONS}.
 * A new executor therefore either runs the legality or has to be named here on purpose.
 */

export const LEGALITY_TOKENS = ['resolveUnitVsUnitAttack(', 'canUnitAttackTarget(', 'getEmbarkedAssaultTarget('] as const;
export const EXEMPT_CATEGORIES = ['preview', 'world-actor', 'air-mission'] as const;
export type ExemptCategory = typeof EXEMPT_CATEGORIES[number];

/** How far above a call its marker may sit (the comment, plus the line of context it annotates). */
export const MARKER_WINDOW_LINES = 3;
/** Cap on how far back the legality search may reach inside one function (guards giant orchestrators). */
export const LEGALITY_WINDOW_LINES = 90;

export interface SourceFile { path: string; source: string }

/** The exemptions that exist today, by file and category. Adding one is a deliberate edit to this table. */
export const EXPECTED_EXEMPTIONS: Readonly<Record<string, Partial<Record<ExemptCategory, number>>>> = {
  'src/ai/ai-tactics.ts': { preview: 2 },
  'src/core/round-phases/beasts.ts': { 'world-actor': 1 },
  'src/systems/minor-civ-system.ts': { 'world-actor': 1 },
  'src/systems/stampede-system.ts': { 'world-actor': 1 },
  'src/systems/air-operations-system.ts': { 'air-mission': 2 },
  'src/systems/airborne-system.ts': { 'air-mission': 1 },
};

/** The resolver's own file defines it and is not a caller. */
const DEFINITION_FILE = 'src/systems/combat-system.ts';

const MARKER = /\/\/\s*attack-contract-exempt:\s*([a-z-]+):\s*(\S.*)$/;
const CALL = /\bresolveCombat\(/;
const FUNCTION_START = /^\s*(export\s+)?(async\s+)?function\s+\w+|^\s*(export\s+)?(const|let)\s+\w+\s*=\s*(async\s*)?\([^)]*\)\s*(:\s*[^=]+)?=>|^\s*(public\s+|private\s+)?\w+\([^)]*\)\s*(:\s*[^{]+)?\{\s*$/;

const isCommentLine = (line: string) => /^\s*(\/\/|\*|\/\*)/.test(line);

export interface AttackContractViolation { path: string; line: number; message: string }

export function findAttackContractViolations(files: readonly SourceFile[]): AttackContractViolation[] {
  const violations: AttackContractViolation[] = [];
  const seen: Record<string, Partial<Record<ExemptCategory, number>>> = {};

  for (const { path, source } of files) {
    if (path === DEFINITION_FILE) continue;
    const lines = source.split('\n');
    const markerLines: number[] = [];

    lines.forEach((text, index) => {
      const marker = MARKER.exec(text);
      if (!marker) return;
      const [, category, reason] = marker;
      markerLines.push(index);
      if (!(EXEMPT_CATEGORIES as readonly string[]).includes(category!)) {
        violations.push({ path, line: index + 1, message: `unknown attack-contract-exempt category "${category}"` });
        return;
      }
      if (reason!.trim().length < 12) {
        violations.push({ path, line: index + 1, message: 'attack-contract-exempt needs a real reason' });
      }
      const slot = (seen[path] ??= {});
      slot[category as ExemptCategory] = (slot[category as ExemptCategory] ?? 0) + 1;
    });

    const callLines: number[] = [];
    lines.forEach((text, index) => { if (!isCommentLine(text) && CALL.test(text)) callLines.push(index); });

    // A marker that no longer sits above a call is a stale exemption.
    for (const markerLine of markerLines) {
      const annotated = callLines.some(call => call > markerLine && call - markerLine <= MARKER_WINDOW_LINES);
      if (!annotated) {
        violations.push({ path, line: markerLine + 1, message: 'stale attack-contract-exempt: no resolveCombat call follows it' });
      }
    }

    for (const call of callLines) {
      const exempt = markerLines.some(marker => marker < call && call - marker <= MARKER_WINDOW_LINES);
      if (exempt) continue;
      let start = call;
      while (start > 0 && call - start < LEGALITY_WINDOW_LINES && !FUNCTION_START.test(lines[start]!)) start -= 1;
      const window = lines.slice(start, call).filter(text => !isCommentLine(text)).join('\n');
      if (!LEGALITY_TOKENS.some(token => window.includes(token))) {
        violations.push({
          path,
          line: call + 1,
          message: 'resolveCombat call has no canonical attack legality before it in the same function '
            + `(run ${LEGALITY_TOKENS.join(' / ')}) and is not marked attack-contract-exempt`,
        });
      }
    }
  }

  // The set of exemptions must match the pinned table exactly, so none appears or lingers by accident.
  const paths = new Set([...Object.keys(EXPECTED_EXEMPTIONS), ...Object.keys(seen)]);
  for (const path of [...paths].sort()) {
    for (const category of EXEMPT_CATEGORIES) {
      const expected = EXPECTED_EXEMPTIONS[path]?.[category] ?? 0;
      const actual = seen[path]?.[category] ?? 0;
      if (expected !== actual) {
        violations.push({ path, line: 0, message: `expected ${expected} "${category}" exemption(s), found ${actual}` });
      }
    }
  }
  return violations;
}
