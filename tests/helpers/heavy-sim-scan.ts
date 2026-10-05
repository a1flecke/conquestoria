/**
 * Finds tests that drive a multi-turn simulation in a loop but rely on vitest's 5 s default timeout.
 *
 * The scan is deliberately structural and conservative: an `it(` / `test(` block that (a) contains a `for` loop bounded
 * by a numeric literal or UPPER_CASE constant of at least `MIN_LOOP_BOUND`, (b) calls a turn/round simulation entry
 * point, and (c) does not end in an explicit timeout argument or `{ timeout }` option. It cannot see a loop hidden
 * behind a helper, so it is a ratchet against the recurring shape, not a proof (see tests/helpers/sim-timeout.ts).
 */
export const MIN_LOOP_BOUND = 15;

const SIMULATION_CALL = /processTurn\(|processNonHumanMajorRound\(|runCompletedRound\(|processMinorCivEconomyTurn\(|runAICampaign\(|runScenario\(|processCity\(/;
const BOUNDED_LOOP = /for\s*\(\s*(?:let|const)\s+\w+\s*=\s*\d+\s*;\s*\w+\s*<=?\s*(\d+|[A-Z][A-Z0-9_]*)\b/g;
const TEST_START = /\b(?:it|test)(?:\.each\([^)]*\))?\(\s*(?:`[^`]*`|'[^']*'|"[^"]*")/g;

export interface UnboundedSimTest { name: string; loopBound: number }

function matchingParen(source: string, open: number): number {
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return source.length - 1;
}

function hasExplicitTimeout(block: string): boolean {
  return /\},\s*[\w.()]*\d[\w.()_]*\s*\)\s*$/.test(block)
    || /\},\s*[A-Za-z_][\w.]*(?:\([^)]*\))?\s*\)\s*$/.test(block)
    || /timeout\s*:/.test(block);
}

export function findUnboundedSimTests(source: string, constants: Record<string, number> = {}): UnboundedSimTest[] {
  const found: UnboundedSimTest[] = [];
  for (const start of source.matchAll(TEST_START)) {
    const open = source.indexOf('(', start.index!);
    const block = source.slice(start.index!, matchingParen(source, open) + 1);
    if (!SIMULATION_CALL.test(block)) continue;
    let bound = 0;
    for (const loop of block.matchAll(BOUNDED_LOOP)) {
      const raw = loop[1]!;
      const value = /^\d+$/.test(raw) ? Number(raw) : (constants[raw] ?? source.match(new RegExp(`const\\s+${raw}\\s*=\\s*(\\d+)`))?.[1] ? Number(source.match(new RegExp(`const\\s+${raw}\\s*=\\s*(\\d+)`))![1]) : 0);
      bound = Math.max(bound, value);
    }
    if (bound >= MIN_LOOP_BOUND && !hasExplicitTimeout(block)) {
      found.push({ name: start[0].replace(/^[^(]*\(\s*/, '').slice(1, 80), loopBound: bound });
    }
  }
  return found;
}
