// Print one version's section of CHANGELOG.md — the GitHub Release notes.
//
//   node scripts/release-notes.mjs <X.Y.Z> [CHANGELOG.md]
//
// Run by publish.yml's unprivileged `build` job (before `npm ci`) and by
// tests/release-consistency.test.ts on every PR, so a version bump that forgot
// its CHANGELOG section fails the PR, not the post-merge release.
//
// The section is the body under the ONE heading that starts `## [<version>]`
// (any date suffix after it), up to the next `## ` heading or the link-reference
// block at the bottom of the file. The version is compared as a literal string —
// never put into a RegExp — and must be a plain `X.Y.Z`. Exit 1, with one line on
// stderr, when the version is malformed, the heading is absent or repeated, or the
// body is empty. Node stdlib only; reads one file, writes stdout.
import { readFileSync } from 'node:fs';

const VERSION_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const LINK_REF_RE = /^\[[^\]]+\]:\s/;

function fail(message) {
  console.error(`release-notes: ${message}`);
  process.exit(1);
}

const [version, file = 'CHANGELOG.md'] = process.argv.slice(2);
if (typeof version !== 'string' || !VERSION_RE.test(version)) {
  fail(`version must be X.Y.Z, got ${JSON.stringify(version ?? null)}`);
}

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (err) {
  fail(`cannot read ${file}: ${err.code ?? err.message}`);
}

const lines = text.split(/\r\n|\r|\n/);
const heading = `## [${version}]`;
const starts = [];
lines.forEach((line, i) => {
  if (line.startsWith(heading)) starts.push(i);
});
if (starts.length === 0) fail(`no "${heading}" heading in ${file}`);
if (starts.length > 1)
  fail(`"${heading}" appears ${starts.length} times in ${file}`);

const body = [];
for (const line of lines.slice(starts[0] + 1)) {
  if (line.startsWith('## ') || LINK_REF_RE.test(line)) break;
  body.push(line);
}
const notes = body.join('\n').trim();
if (notes === '') fail(`the "${heading}" section of ${file} is empty`);

process.stdout.write(`${notes}\n`);
