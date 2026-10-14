import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1459: a pointer-only control is an element the mouse treats as a button (`cursor: pointer`, a click handler) that a
 * keyboard cannot focus or activate, which is what a `div` or `span` is. It shipped in the civilization cards, the
 * city panel (queueing production, tabs, closing), the diplomacy/marketplace close marks and the city overview, and
 * axe-core cannot see it because there is no ARIA to check. The browser specs detect it at runtime
 * (`findPointerOnlyControls`); this is the cheap source-level guard for the two ways it gets written:
 *
 *   1. an HTML template string with `<div|span|li|img ... cursor:pointer>`
 *   2. `const x = document.createElement('div'|'span'...)` later given `cursor: pointer`
 *
 * The one allowed shape is a container that keeps a pointer click as a shortcut while a real control inside it does
 * the same job; it says so with `data-pointer-shortcut` (the browser detector requires a real control inside).
 */

const UI_DIR = join(process.cwd(), 'src', 'ui');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory()
      ? sourceFiles(join(dir, entry.name))
      : /\.(ts|tsx)$/.test(entry.name) ? [join(dir, entry.name)] : []);
}

const NON_CONTROL_TAGS = ['div', 'span', 'li', 'p', 'img', 'section'];

function templateViolations(text: string): string[] {
  const out: string[] = [];
  const pattern = new RegExp(`<(${NON_CONTROL_TAGS.join('|')})\\b[^>]*cursor:\\s*pointer`, 'g');
  for (const match of text.matchAll(pattern)) {
    const line = text.slice(0, match.index).split('\n').length;
    out.push(`line ${line}: <${match[1]}> styled as clickable in a template`);
  }
  return out;
}

function createdElementViolations(text: string): string[] {
  const out: string[] = [];
  const lines = text.split('\n');
  const created = new RegExp(`(?:const|let)\\s+(\\w+)\\s*=\\s*document\\.createElement\\('(${NON_CONTROL_TAGS.join('|')})'\\)`);
  lines.forEach((line, index) => {
    const match = created.exec(line);
    if (!match) return;
    const [, name, tag] = match as unknown as [string, string, string];
    const window = lines.slice(index, index + 40).join('\n');
    const pointer = new RegExp(`${name}\\.style\\.cursor\\s*=\\s*'pointer'|${name}\\.style\\.cssText[^;\\n]*cursor:\\s*pointer|Object\\.assign\\(${name}\\.style,[^)]*cursor:\\s*'pointer'`);
    if (!pointer.test(window)) return;
    const hasKeyboardPath = new RegExp(`${name}\\.dataset\\.pointerShortcut|${name}\\.setAttribute\\('role',\\s*'button'\\)|${name}\\.tabIndex\\s*=|${name}\\.setAttribute\\('tabindex'`).test(window);
    if (!hasKeyboardPath) out.push(`line ${index + 1}: <${tag}> ${name} is styled as clickable with no keyboard path`);
  });
  return out;
}

describe('no pointer-only controls in the UI source (#1459)', () => {
  it('has no clickable div/span written as a template or built with createElement', () => {
    const problems: string[] = [];
    for (const file of sourceFiles(UI_DIR)) {
      const text = readFileSync(file, 'utf8');
      for (const problem of [...templateViolations(text), ...createdElementViolations(text)]) {
        problems.push(`${relative(process.cwd(), file)} ${problem}`);
      }
    }
    expect(problems, 'Make it a <button> (or give a container a real button inside it and mark data-pointer-shortcut)').toEqual([]);
  });

  it('the guard bites: it flags both shapes it is meant to catch', () => {
    expect(templateViolations('html = `<span id="x" style="cursor:pointer;">x</span>`')).toHaveLength(1);
    expect(templateViolations('html = `<button style="cursor:pointer;">x</button>`')).toHaveLength(0);
    expect(createdElementViolations("const row = document.createElement('div');\nrow.style.cursor = 'pointer';")).toHaveLength(1);
    expect(createdElementViolations("const row = document.createElement('div');\nrow.dataset.pointerShortcut = 'true';\nrow.style.cursor = 'pointer';")).toHaveLength(0);
    expect(createdElementViolations("const b = document.createElement('button');\nb.style.cursor = 'pointer';")).toHaveLength(0);
  });
});
