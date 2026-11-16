import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The `main` branch ruleset requires these status-check contexts. GitHub
// reports a job under its `name:` when it has one and under its job id when it
// does not, so renaming a job (or matrixing it, which appends ` (<value>)`)
// makes a required context unreportable and every PR waits on a check nothing
// produces. This pins the repo side of that contract, names only. The ruleset
// itself is not readable from here — its side stays advisory — and the two
// Socket Security contexts it also requires come from the Socket GitHub App,
// not a workflow, so they are not listed.
const REQUIRED_CONTEXTS = [
  'Format check',
  'Lint',
  'Markdown lint',
  'Typecheck',
  'Test',
  'Build',
  'floor',
  'gitleaks',
  'Analyze (javascript-typescript)',
];

const WORKFLOWS = ['ci.yml', 'floor.yml', 'gitleaks.yml', 'codeql.yml'];

/** The context each job of one workflow reports: its `name:`, else its id. */
function contexts(file: string): string[] {
  const text = readFileSync(`.github/workflows/${file}`, 'utf8');
  const jobs = text.slice(text.search(/^jobs:\s*$/m));
  return jobs.split(/^(?= {2}[A-Za-z0-9_-]+:\s*$)/m).flatMap((block) => {
    const id = /^ {2}([A-Za-z0-9_-]+):\s*$/m.exec(block)?.[1];
    if (id === undefined) return [];
    const name = /^ {4}name: (.+)$/m.exec(block)?.[1]?.trim() ?? id;
    const languages = /^ {8}language: \[(.*)\]\s*$/m.exec(block)?.[1];
    if (!name.includes('${{ matrix.language }}')) return [name];
    return (languages ?? '')
      .split(',')
      .map((l) => name.replace('${{ matrix.language }}', l.trim()));
  });
}

describe('required status checks', () => {
  it('every context the ruleset requires is produced by a workflow job', () => {
    const produced = WORKFLOWS.flatMap(contexts);
    for (const context of REQUIRED_CONTEXTS) {
      expect(produced, context).toContain(context);
    }
  });
});
