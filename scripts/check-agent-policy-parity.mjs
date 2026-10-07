#!/usr/bin/env node
// #1231: mechanical parity check across the agent-facing policy surface.
//
// The repository has several entry points that restate the same commands and
// invariants: CLAUDE.md, AGENTS.md, .claude/rules/*, and .opencode/*. Two agents
// can each follow their own file perfectly and still behave differently (the
// deleted GEMINI.md did exactly that). This script detects *contradictions* in a
// small, literal, fixture-tested rule set. It is not a prose linter and does not
// try to make the files identical: CLAUDE.md + .claude/rules are canonical
// policy, AGENTS.md is tool-neutral workflow entry guidance, and .opencode/* is
// OpenCode-specific config/commands. Parity means their shared command and
// invariant semantics cannot silently disagree.
//
// Usage:
//   node scripts/check-agent-policy-parity.mjs                 # audit the real tree
//   node scripts/check-agent-policy-parity.mjs --root DIR      # audit a fixture tree
//   node scripts/check-agent-policy-parity.mjs --rule ID ...    # run only these rules
//   node scripts/check-agent-policy-parity.mjs --file PATH ...  # audit only these files
//
// Add a rule: append one entry to RULES with an `id` and a `check(file, text)`
// returning an array of `{ line, detail }` problems. Add a failing fixture for it
// to tests/hooks/agent-policy-parity.test.sh, then a paragraph to
// .claude/rules/hooks-and-tooling.md is optional (code is authoritative).

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const option = name => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : undefined;
};
const optionList = name => {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === `--${name}` && argv[i + 1]) out.push(argv[i + 1]);
  return out;
};

const ROOT = resolve(option('root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '..'));

// The one list of agent-facing surfaces this audit covers. Directories expand to
// their *.md files; the OpenCode config is an explicit file.
const AGENT_SURFACES = [
  { path: 'CLAUDE.md' },
  { path: 'AGENTS.md' },
  { path: '.claude/rules', suffix: '.md' },
  { path: '.opencode/opencode.jsonc' },
  { path: '.opencode/commands', suffix: '.md' },
];

// `yarn <name>` where <name> is a Yarn built-in or a common binary, not a
// package.json script. Everything else must be a real package script.
const YARN_BUILTINS = new Set([
  'node', 'vitest', 'vite', 'tsc', 'tauri', 'playwright', 'tsx', 'esbuild',
  'install', 'add', 'remove', 'up', 'upgrade', 'why', 'run', 'exec', 'dlx',
  'workspace', 'workspaces', 'npm', 'npx', 'pack', 'publish', 'config', 'cache',
  'set', 'version', 'init', 'link', 'unlink', 'global', 'info', 'import',
  'licenses', 'outdated', 'patch', 'plugin', 'rebuild', 'search', 'stage',
  'teardown', 'unplug', 'constraints', 'dedupe', 'explain', 'help',
]);

const abs = rel => join(ROOT, rel);
const linesOf = text => text.split('\n');
const lineAt = (text, offset) => text.slice(0, offset).split('\n').length;

// A line is an allowed place to mention a forbidden form only when the sentence
// (paragraph) it belongs to reads as a prohibition. Wrapped prose means the
// prohibition word is often a few lines above the forbidden token
// ("Never select a process ...\n (or `killall`, ...)"), so scan back to the
// start of the paragraph, capped to avoid absorbing an unrelated one.
const PROHIBITION = /\b(never|no|deny|denied|forbidden|prohibited|avoid|don't|do not)\b/i;
function prohibitedAt(lines, lineNumber) {
  for (let i = lineNumber - 1; i >= 0 && i >= lineNumber - 12; i -= 1) {
    const line = lines[i] ?? '';
    if (line.trim() === '') break;
    if (PROHIBITION.test(line)) return true;
  }
  return false;
}

function packageScripts() {
  const pkgPath = abs('package.json');
  if (!existsSync(pkgPath)) return new Set();
  try {
    return new Set(Object.keys(JSON.parse(readFileSync(pkgPath, 'utf8')).scripts ?? {}));
  } catch {
    return new Set();
  }
}

// #1362: the one required-evidence contract is scripts/data/verification-impact.json (`yarn verify:impact`). Prose may
// explain why a gate exists, but it must not itself require a gated command: a sentence that does, without pointing at
// `verify:impact`, is a second (possibly conflicting) required-gate matrix. Baseline commands (build, durable full) are
// the map's own always-required evidence and may be stated as such.
function impactMap() {
  const path = abs('scripts/data/verification-impact.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/** `yarn test:ai-long`, `scripts/validate-unit-sfx.sh`, ... : the subject of a command after the mise wrapper. */
function commandSubject(command) {
  const stripped = command.replace(/^\.\/scripts\/run-with-mise\.sh\s+/, '').replace(/<[^>]*>/g, '').trim();
  const match = stripped.match(/^(yarn\s+[\w:.-]+|node\s+scripts\/[\w.-]+|scripts\/[\w.-]+)/);
  return match ? match[1].replace(/^node\s+/, '').replace(/:status$/, '') : null;
}

// A gate the map owns but that is NOT baseline: stating it as required in prose is the contradiction.
function gatedCommands(map) {
  const baseline = new Set(map.baseline ?? []);
  const gated = new Map();
  const add = (entry, kind) => {
    for (const command of entry.commands ?? []) {
      const subject = commandSubject(command);
      // `yarn test` is the generic runner (every mirrored test uses it), not a gate of its own.
      if (subject && subject !== 'yarn test') gated.set(subject, `${kind} "${entry.id}"`);
    }
  };
  for (const entry of map.evidence ?? []) if (!baseline.has(entry.id)) add(entry, 'evidence');
  for (const entry of map.diagnostics ?? []) add(entry, 'diagnostic');
  return gated;
}

const REQUIREMENT_PHRASE = /(before declaring|before you declare|before (?:you )?(?:push|pr|merge|finish|report)|always run|must run|\bis required\b|\bare required\b|required before|run it after|\bmust be run\b|never skip)/i;

function ruleFiles() {
  const dir = abs('.claude/rules');
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir).filter(name => name.endsWith('.md')).sort();
}

// ---------------------------------------------------------------------------
// Declared rules
// ---------------------------------------------------------------------------

const RULES = [
  {
    id: 'no-mise-activate',
    summary: 'no agent surface may present `eval "$(mise activate ...)"` as the way to run commands',
    check(_file, text) {
      const problems = [];
      const lines = linesOf(text);
      for (const match of text.matchAll(/mise activate/g)) {
        const line = lineAt(text, match.index);
        if (prohibitedAt(lines, line)) continue;
        problems.push({ line, detail: 'presents `eval "$(mise activate ...)"`; use ./scripts/run-with-mise.sh instead (or state it as a prohibition)' });
      }
      return problems;
    },
  },
  {
    id: 'wrapper-required',
    summary: 'commands shown in fenced code blocks must use scripts/run-with-mise.sh',
    check(_file, text) {
      const problems = [];
      const lines = linesOf(text);
      let inFence = false;
      lines.forEach((line, index) => {
        if (/^\s*```/.test(line)) { inFence = !inFence; return; }
        if (!inFence) return;
        if (/^\s*#/.test(line)) return;
        if (!/^\s*(?:\$ )?(?:[A-Za-z_][A-Za-z0-9_]*=\S+\s+)*(yarn|npx|npm)\s/.test(line)) return;
        if (line.includes('scripts/run-with-mise.sh')) return;
        if (prohibitedAt(lines, index + 1)) return;
        const command = line.trim().match(/\b(yarn|npx|npm)\b/)?.[1] ?? 'command';
        problems.push({ line: index + 1, detail: `bare \`${command}\` command in a code block; prefix the mise wrapper` });
      });
      return problems;
    },
  },
  {
    id: 'scripts-exist',
    summary: 'referenced repo scripts and `yarn <script>` names must exist',
    check(_file, text) {
      const problems = [];
      const scripts = packageScripts();
      // A repo-root `scripts/<file>` reference (not `tests/scripts/...`).
      for (const match of text.matchAll(/(?<![\w./-])scripts\/[A-Za-z0-9._/-]+\.(?:sh|mjs|ts|mts|json)/g)) {
        if (!existsSync(abs(match[0]))) {
          problems.push({ line: lineAt(text, match.index), detail: `references missing repo script \`${match[0]}\`` });
        }
      }
      for (const match of text.matchAll(/\byarn\s+([A-Za-z0-9:_-]+)/g)) {
        const name = match[1];
        if (YARN_BUILTINS.has(name) || scripts.has(name)) continue;
        problems.push({ line: lineAt(text, match.index), detail: `references missing package script \`yarn ${name}\`` });
      }
      return problems;
    },
  },
  {
    id: 'no-pattern-kill',
    summary: 'no agent surface may instruct broad name/process-group killing',
    check(_file, text) {
      const problems = [];
      const lines = linesOf(text);
      for (const match of text.matchAll(/\b(?:pkill|killall)\b|\bkill\s+\$\(pgrep/g)) {
        const line = lineAt(text, match.index);
        if (prohibitedAt(lines, line)) continue;
        problems.push({ line, detail: `instructs \`${match[0].trim()}\`; stop only a recorded numeric pid (see yarn verify:stop)` });
      }
      return problems;
    },
  },
  {
    id: 'opencode-helper-form',
    summary: 'PR body examples use the canonical direct helper form',
    check(_file, text) {
      const lines = linesOf(text);
      return [...text.matchAll(/bash scripts\/pr-body\.sh/g)]
        .filter(match => !prohibitedAt(lines, lineAt(text, match.index)))
        .map(match => ({ line: lineAt(text, match.index), detail: 'use ./scripts/pr-body.sh for canonical approval routing' }));
    },
  },
  {
    id: 'opencode-plugin-loading',
    summary: 'plugin readiness is scoped to active locations, not a server-wide load count',
    check(_file, text) {
      return [...text.matchAll(/exactly\s+(?:\*\*)?(?:one|1)(?:\*\*)?[^.\n]*loading plugin/gi)]
        .map(match => ({ line: lineAt(text, match.index), detail: 'verify configured identity per active location and recent hook decisions; server runs may initialize multiple locations' }));
    },
  },
  {
    id: 'opencode-pr-approval',
    summary: 'ordered shell permissions must gate PR approval despite broad gh pr allows',
    check(file, text) {
      if (file !== '.opencode/opencode.jsonc') return [];
      const permissions = [...text.matchAll(/\{[^{}]*"action"\s*:\s*"shell"[^{}]*\}/g)]
        .map(match => JSON.parse(match[0]));
      const commands = ['gh pr review --approve', 'gh pr review 42 --approve', 'gh pr review -a', 'gh pr review -a 42', 'gh pr review 42 -a'];
      const glob = pattern => new RegExp('^' + pattern.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
      return commands.filter(command => {
        const matches = permissions.filter(rule => glob(rule.resource).test(command));
        return matches.at(-1)?.effect === 'allow';
      }).map(command => ({ line: 1, detail: `PR approval is statically allowed: ${command}; add a later ask/deny rule` }));
    },
  },
  {
    id: 'required-gates-defer-to-impact',
    summary: 'prose must not require a gated command itself; `yarn verify:impact` (scripts/data/verification-impact.json) owns required evidence',
    check(_file, text) {
      const map = impactMap();
      if (!map) return [];
      const gated = gatedCommands(map);
      const problems = [];
      let line = 1;
      for (const paragraph of text.split(/\n\s*\n/)) {
        const startLine = line;
        line += paragraph.split('\n').length + 1;
        if (/verify[:-]impact/.test(paragraph)) continue;
        for (const sentence of paragraph.replace(/\s+/g, ' ').split(/(?<=[.!?:])\s+/)) {
          if (!REQUIREMENT_PHRASE.test(sentence)) continue;
          for (const [subject, owner] of gated) {
            if (sentence.includes(subject)) {
              problems.push({
                line: startLine,
                detail: `states \`${subject}\` as required, but it is ${owner} in the impact map: point at \`yarn verify:impact\` instead of defining a second gate`,
              });
            }
          }
        }
      }
      return problems;
    },
  },
  {
    id: 'canonical-list',
    scope: 'repo',
    summary: 'AGENTS.md names canonical policy and CLAUDE.md indexes every rule file',
    check() {
      const problems = [];
      const claudePath = abs('CLAUDE.md');
      const claude = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : '';
      for (const name of ruleFiles()) {
        if (!claude.includes(`.claude/rules/${name}`)) {
          problems.push({ file: 'CLAUDE.md', line: 0, detail: `\`.claude/rules/${name}\` is missing from the Rules Index` });
        }
      }
      const agentsPath = abs('AGENTS.md');
      if (existsSync(agentsPath)) {
        const agents = readFileSync(agentsPath, 'utf8');
        if (!agents.includes('CLAUDE.md')) {
          problems.push({ file: 'AGENTS.md', line: 0, detail: 'does not name `CLAUDE.md` as canonical policy' });
        }
        if (!agents.includes('.claude/rules/')) {
          problems.push({ file: 'AGENTS.md', line: 0, detail: 'does not name `.claude/rules/` as canonical policy' });
        }
      }
      return problems;
    },
  },
];

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function listFiles() {
  const explicit = optionList('file');
  if (explicit.length > 0) return [...new Set(explicit)].sort();
  const out = [];
  for (const surface of AGENT_SURFACES) {
    const path = abs(surface.path);
    if (!existsSync(path)) continue;
    if (surface.suffix && statSync(path).isDirectory()) {
      for (const name of readdirSync(path)) if (name.endsWith(surface.suffix)) out.push(`${surface.path}/${name}`);
    } else if (!statSync(path).isDirectory()) {
      out.push(surface.path);
    }
  }
  return [...new Set(out)].sort();
}

function main() {
  const only = new Set(optionList('rule'));
  const rules = only.size > 0 ? RULES.filter(rule => only.has(rule.id)) : RULES;
  const unknown = [...only].filter(id => !RULES.some(rule => rule.id === id));
  if (unknown.length > 0) {
    console.error(`unknown rule id(s): ${unknown.join(', ')}`);
    process.exit(2);
  }

  const files = listFiles();
  const problems = [];
  for (const file of files) {
    const path = abs(file);
    if (!existsSync(path)) {
      problems.push({ rule: 'config', file, line: 0, detail: 'listed agent surface does not exist' });
      continue;
    }
    const text = readFileSync(path, 'utf8');
    for (const rule of rules) {
      if (rule.scope === 'repo') continue;
      for (const problem of rule.check(file, text)) {
        problems.push({ rule: rule.id, file: problem.file ?? file, line: problem.line, detail: problem.detail });
      }
    }
  }
  for (const rule of rules) {
    if (rule.scope !== 'repo') continue;
    for (const problem of rule.check()) {
      problems.push({ rule: rule.id, file: problem.file, line: problem.line, detail: problem.detail });
    }
  }

  if (problems.length > 0) {
    console.error(`agent policy parity: ${problems.length} problem(s) across ${files.length} file(s), ${rules.length} rule(s)`);
    for (const problem of problems) {
      const where = problem.line > 0 ? `${problem.file}:${problem.line}` : problem.file;
      console.error(`  - [${problem.rule}] ${where} — ${problem.detail}`);
    }
    process.exit(1);
  }
  console.log(`agent policy parity ok (${files.length} files, ${rules.length} rules)`);
}

main();
