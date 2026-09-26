/**
 * #1002 — structural viewer-safety boundary for player-facing source.
 *
 * The differential harness (`viewer-safety.ts`) proves a surface is safe once it is tested. These
 * rules stop the bypass that makes a surface unsafe *before* anyone writes that test: a
 * player-facing module reaching past the viewer projection into omniscient state.
 *
 * Deliberately narrow — each rule names one realistic regression and carries an explicit,
 * reasoned allowlist, so it has zero false positives on the current tree:
 *
 * - `ai-internals`: `state.opponentAI` is the AI's private strategic state (national intent,
 *   plans, pressure ledgers for every civ). A #989 rival panel or #991 war banner that reads
 *   `opponentAI.nationalIntentByCiv[rival]` directly skips the contact gate #1090's
 *   `derivePostureWarnings` applies. Presentation must consume a viewer-scoped derivation.
 * - `ai-modules`: `src/ai/**` reasons over omniscient state; UI/renderer/input must not import it.
 * - `raw-movement-resolver`: `resolveUnitMoveIntent` / `validateUnitMove` messages are
 *   omniscient. Player copy must come from `unit-movement-explainer` (path-aware redaction).
 */

export type ViewerBoundaryRule = 'ai-internals' | 'ai-modules' | 'raw-movement-resolver';

export interface ViewerBoundaryViolation {
  rule: ViewerBoundaryRule;
  file: string;
  line: number;
  text: string;
}

interface RuleSpec {
  rule: ViewerBoundaryRule;
  /** Repo-relative path prefixes the rule governs. */
  scope: readonly string[];
  pattern: RegExp;
  /** Repo-relative file → reason. Every entry must still match something (checked by the test). */
  allow: Readonly<Record<string, string>>;
}

const PLAYER_FACING = ['src/ui/', 'src/presentation/', 'src/renderer/', 'src/input/', 'src/app/', 'src/main.ts'];

export const VIEWER_BOUNDARY_RULES: readonly RuleSpec[] = [
  {
    rule: 'ai-internals',
    scope: PLAYER_FACING,
    pattern: /\bopponentAI\b/,
    allow: {
      'src/ui/turn-handoff.ts':
        "the viewer's OWN pressure ledger (strategic-audio dedup), keyed by the acknowledging viewerId",
    },
  },
  {
    rule: 'ai-modules',
    // src/app orchestrates the simulation (it legitimately runs the AI round); it is not a
    // rendering surface, so this rule governs only the modules that draw or interpret input.
    scope: ['src/ui/', 'src/presentation/', 'src/renderer/', 'src/input/'],
    pattern: /from\s+['"]@\/ai\//,
    allow: {
      'src/ui/selected-unit-info.ts': "static unit-role catalog (hasAITradeRole) of the viewer's own unit",
      'src/ui/city-panel.ts': "static unit-role catalog (hasAITradeRole) of the viewer's own unit",
    },
  },
  {
    rule: 'raw-movement-resolver',
    scope: PLAYER_FACING,
    pattern: /\b(resolveUnitMoveIntent|validateUnitMove)\b/,
    allow: {
      'src/input/worker-movement-flow.ts':
        'legality gate only; its failure flows to executeAnimatedUnitMove, which explains it via explainMovementFailureForViewer',
    },
  },
];

function stripComments(source: string): string {
  // Keep line structure so reported line numbers stay accurate.
  return source
    .replace(/\/\*[\s\S]*?\*\//g, block => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, '');
}

function inScope(file: string, scope: readonly string[]): boolean {
  return scope.some(prefix => (prefix.endsWith('/') ? file.startsWith(prefix) : file === prefix));
}

/** Pure matcher: the violations `source` (at repo-relative `file`) would introduce. */
export function findViewerBoundaryViolations(file: string, source: string): ViewerBoundaryViolation[] {
  const lines = stripComments(source).split('\n');
  const violations: ViewerBoundaryViolation[] = [];
  for (const spec of VIEWER_BOUNDARY_RULES) {
    if (!inScope(file, spec.scope) || spec.allow[file]) continue;
    lines.forEach((line, index) => {
      if (spec.pattern.test(line)) {
        violations.push({ rule: spec.rule, file, line: index + 1, text: line.trim() });
      }
    });
  }
  return violations;
}
