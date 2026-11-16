import {
  PRODUCT_STAGES,
  resolveStageModel,
  type ModelsStages,
} from './model-config.js';

// ---------------------------------------------------------------------------
// Showing the `models` block — the rows `status`, `init` and `update` print,
// and the one label under them, which says what reads the block: /pharn-ship
// and /pharn-loop request a stage's MODEL for the stages they route (effort is
// never routed); a direct `/pharn-<stage>` uses its own frontmatter, which
// nothing checks against the block automatically. A request is never proof of
// what ran, so the rows are a declaration, not a record.
//
// Pure (callers add chrome). Every row token is a pinned stage or a value
// pharn-oss's rules accepted, so no untrusted free text.
// ---------------------------------------------------------------------------

/** The command that runs pharn-oss's checker in a project, in one mode. */
export function modelsCheckerCommand(
  floorDir: string,
  mode: 'validate' | 'agreement',
): string {
  return `node ${floorDir}/check-model-config.mjs ${mode}`;
}

/** One resolved row: a stage, its model and effort, and whether it fell back. */
export interface StageRow {
  stage: string;
  model: string;
  effort: string;
  /** True when the stage has no entry of its own and shows `default`'s. */
  viaDefault: boolean;
}

/**
 * The `default` row, then one row per product stage in pharn-oss's order,
 * resolved as pharn-oss resolves it (a stage without an entry shows `default`'s).
 * Behind both the text rows and `status --json`.
 */
export function resolveStageRows(stages: ModelsStages): StageRow[] {
  const rows: StageRow[] = [
    {
      stage: 'default',
      model: stages.default!.model,
      effort: stages.default!.effort,
      viaDefault: false,
    },
  ];
  for (const stage of PRODUCT_STAGES) {
    const { model, effort } = resolveStageModel(stages, stage);
    rows.push({
      stage,
      model,
      effort,
      viaDefault: !Object.hasOwn(stages, stage),
    });
  }
  return rows;
}

/** The rows as aligned text, `(default)` marking a fallback. */
export function resolvedStageLines(stages: ModelsStages): string[] {
  const rows = resolveStageRows(stages);
  const width = Math.max(...rows.map((r) => r.stage.length)) + 3;
  return rows.map(
    (r) =>
      `${r.stage.padEnd(width)}${r.model} · ${r.effort}${r.viaDefault ? '  (default)' : ''}`,
  );
}

/**
 * What the rows are, and what they are not. Each line stays within 70
 * columns, so a clack note box in an 80-column terminal never wraps one.
 */
export function modelsLabelLines(floorDir: string): string[] {
  return [
    '/pharn-ship and /pharn-loop read this block to pick the model they',
    'request for each stage they run as a subagent. Effort is never',
    "routed, and a stage that runs inline uses the session's model.",
    "A stage you run directly uses its command's own model:/effort:",
    'frontmatter, which this block is held to. Nothing runs that',
    'check automatically; to run it:',
    modelsCheckerCommand(floorDir, 'agreement'),
  ];
}
