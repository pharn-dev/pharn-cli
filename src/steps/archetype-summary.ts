import { isCancel, note, select } from '@clack/prompts';
import { row } from '../lib/format.js';
import type { Archetype, Selection } from '../types.js';

// The archetype-install summary + confirm stage (pharn init --archetype). Shows
// the deterministically-detected archetypes and the resolved capabilities
// (selected + skipped-with-reason), then asks whether to install. Mirrors
// steps/summary.ts. One axis (P3): the archetype summary + confirm stage.
//
// Returns 'cancel' (never process.exit) on both explicit cancel and a clack
// cancel, so the caller can clean up the fetched temp clone in a finally BEFORE
// exiting (Node skips finally on process.exit).

export type ArchetypeSummaryAction = 'install' | 'cancel';

function describeMatched(matched: 'universal' | Archetype[]): string {
  return matched === 'universal' ? 'universal' : matched.join(', ');
}

export async function runArchetypeSummary(
  archetypes: Archetype[],
  selection: Selection,
): Promise<ArchetypeSummaryAction> {
  const lines: string[] = [
    '────────────────────────────────────────',
    '  PHARN Install Summary (archetype)',
    '────────────────────────────────────────',
    '',
    row('Detected archetypes', archetypes.join(', ')),
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

  note(lines.join('\n'));

  const action = await select({
    message: 'Ready to install?',
    initialValue: 'install' as ArchetypeSummaryAction,
    options: [
      { value: 'install' as ArchetypeSummaryAction, label: 'Yes, install' },
      { value: 'cancel' as ArchetypeSummaryAction, label: 'Cancel' },
    ],
  });

  if (isCancel(action)) return 'cancel';
  return action;
}
