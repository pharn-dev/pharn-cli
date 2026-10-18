import { isCancel, note, select } from '@clack/prompts';
import { WALK_LIMITS } from '../lib/detect-archetype.js';
import { row } from '../lib/format.js';
import { terminalSafe } from '../lib/terminal-safe.js';
import type { ArchetypeEvidence, ArchetypeOrigin } from '../lib/archetype.js';
import type { Archetype, Selection } from '../types.js';

// The archetype-install summary + confirm stage (pharn init). Shows the
// archetypes — with what triggered each one, or that they came from
// `--archetype` — and the resolved capabilities (selected + skipped-with-
// reason), then asks whether to install. One axis (P3): the archetype summary +
// confirm stage.
//
// Returns 'cancel' (never process.exit) on both explicit cancel and a clack
// cancel, so the caller can clean up the fetched temp clone in a finally BEFORE
// exiting (Node skips finally on process.exit).

export type ArchetypeSummaryAction = 'install' | 'cancel';

export type { ArchetypeOrigin };

// Evidence paths are names from the user's own tree: display data, so they go
// through the one terminal sanitizer and are capped (P2).
const MAX_EVIDENCE_CHARS = 120;

function describeEvidence(evidence: ArchetypeEvidence): string {
  switch (evidence.source) {
    case 'dependency':
      // An allowlist literal (archetype.ts), never the manifest's key bytes.
      return `${evidence.name} (package.json)`;
    case 'devDependency':
      return `${evidence.name} (package.json devDependencies)`;
    case 'path':
      return terminalSafe(evidence.path, { max: MAX_EVIDENCE_CHARS });
    case 'none':
      return 'no framework signal found';
  }
}

const sameSet = (a: readonly Archetype[], b: readonly Archetype[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));

// The bounds are the walk's own (WALK_LIMITS), so the sentence cannot drift
// from what the walk does. `en-US` grouping keeps the text deterministic.
const TRUNCATED_LINE = `    detection stopped early: it examines at most ${WALK_LIMITS.maxEntries.toLocaleString('en-US')} entries, ${WALK_LIMITS.maxDepth} directories deep, so these archetypes may be incomplete — pass --archetype <list> if they are wrong`;

/**
 * The summary's archetype block: the archetypes, where they came from, whether
 * detection stopped early (F-25 — only when detection's result is the one being
 * installed; under `--archetype` it was not used), and — when the config this
 * install replaces recorded a DIFFERENT set (`previous`, already reduced to
 * canonical members by `recordedArchetypes`) — that set and the flag that keeps
 * it, so an earlier `--archetype` never disappears silently on a re-run. Pure;
 * every input is plain data.
 */
export function archetypeOriginLines(
  archetypes: readonly Archetype[],
  origin: ArchetypeOrigin,
  previous: readonly Archetype[] | null = null,
): string[] {
  const lines: string[] = [];
  if (origin.kind === 'flag') {
    lines.push(
      row('Archetypes (--archetype)', archetypes.join(', ')),
      `    detection found ${origin.detected.join(', ')} (not used)`,
    );
  } else {
    lines.push(row('Detected archetypes', archetypes.join(', ')));
    for (const e of origin.evidence) {
      lines.push(`    ${e.archetype.padEnd(8)}← ${describeEvidence(e)}`);
    }
    if (origin.truncated) lines.push(TRUNCATED_LINE);
  }
  if (previous !== null && !sameSet(previous, archetypes)) {
    lines.push(
      `    previously recorded: ${previous.join(', ')} — pass --archetype ${previous.join(',')} to keep them`,
    );
  }
  return lines;
}

function describeMatched(
  matched: 'universal' | 'manual' | Archetype[],
): string {
  if (matched === 'universal') return 'universal';
  if (matched === 'manual') return 'added by hand';
  return matched.join(', ');
}

/**
 * The summary note's body: the archetypes and where they came from
 * (`archetypeOriginLines`), selected and skipped capabilities. Exported so `init --dry-run` and `init --yes` print exactly the
 * summary the interactive run asks about, without the question.
 */
export function archetypeSummaryLines(
  archetypes: Archetype[],
  selection: Selection,
  origin: ArchetypeOrigin = {
    kind: 'detected',
    evidence: [],
    truncated: false,
  },
  previous: readonly Archetype[] | null = null,
): string[] {
  const lines: string[] = [
    '────────────────────────────────────────',
    '  PHARN Install Summary (archetype)',
    '────────────────────────────────────────',
    '',
    ...archetypeOriginLines(archetypes, origin, previous),
    '',
    `  CAPABILITIES SELECTED (${selection.selected.length})`,
    ...(selection.selected.length > 0
      ? selection.selected.map((c) =>
          row(`${c.name} (${c.role})`, describeMatched(c.matched)),
        )
      : ['  (none)']),
  ];

  if (selection.skipped.length > 0) {
    lines.push(
      '',
      `  CAPABILITIES SKIPPED (${selection.skipped.length})`,
      ...selection.skipped.map((c) => row(`${c.name} (${c.role})`, c.reason)),
    );
  }

  lines.push(
    '',
    '  Installs PHARN product commands + write-gating hooks into .claude/',
    '  (an existing .claude/settings.json is preserved, not overwritten).',
    '',
    '────────────────────────────────────────',
  );
  return lines;
}

export async function runArchetypeSummary(
  archetypes: Archetype[],
  selection: Selection,
  origin: ArchetypeOrigin = {
    kind: 'detected',
    evidence: [],
    truncated: false,
  },
  previous: readonly Archetype[] | null = null,
): Promise<ArchetypeSummaryAction> {
  note(
    archetypeSummaryLines(archetypes, selection, origin, previous).join('\n'),
  );

  const action = await select({
    message: 'Ready to install?',
    initialValue: 'install' as ArchetypeSummaryAction,
    options: [
      { value: 'install' as ArchetypeSummaryAction, label: 'Yes, install' },
      { value: 'cancel' as ArchetypeSummaryAction, label: 'Cancel' },
    ],
  });

  if (isCancel(action)) return 'cancel';
  // clack 1.8 types select as Value | symbol; isCancel only narrows
  // typeof CANCEL_SYMBOL, so plain `return action` no longer typechecks.
  return action === 'install' ? 'install' : 'cancel';
}
