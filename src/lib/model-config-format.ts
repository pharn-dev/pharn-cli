import {
  PRODUCT_STAGES,
  resolveStageModel,
  type ModelsStages,
} from './model-config.js';

// ---------------------------------------------------------------------------
// Showing the `models` block — the rows `pharn status`, `pharn init` and
// `pharn update` print, and the one label they all print under them.
//
// The label is the point. Claude Code applies each /pharn-* command's own
// static `model:` / `effort:` frontmatter; nothing reads this block to pick a
// model. The block is the source of truth that frontmatter is HELD TO, by
// pharn-oss's checker (its `agreement` mode). So the rows are a declaration,
// and they are never presented as routing that happens.
//
// Pure: no color, no clack — callers add their own chrome. Every token in a
// row is a product stage (this CLI's pinned list) or a value pharn-oss's rules
// accepted (an alias, a `claude-*` id, an effort level), so a row carries no
// untrusted free text. One axis (P3): presenting the models block.
// ---------------------------------------------------------------------------

/** The command that runs pharn-oss's checker in a project, in one mode. */
export function modelsCheckerCommand(
  floorDir: string,
  mode: 'validate' | 'agreement',
): string {
  return `node ${floorDir}/check-model-config.mjs ${mode}`;
}

/**
 * One row per product stage, resolved as pharn-oss resolves it, after the
 * `default` row: a stage without its own entry shows the `default` it falls
 * back to, marked `(default)`. The stage order is pharn-oss's.
 */
export function resolvedStageLines(stages: ModelsStages): string[] {
  const rows: Array<
    [label: string, model: string, effort: string, via: boolean]
  > = [['default', stages.default!.model, stages.default!.effort, false]];
  for (const stage of PRODUCT_STAGES) {
    const { model, effort } = resolveStageModel(stages, stage);
    rows.push([stage, model, effort, !Object.hasOwn(stages, stage)]);
  }
  const width = Math.max(...rows.map(([label]) => label.length)) + 3;
  return rows.map(
    ([label, model, effort, via]) =>
      `${label.padEnd(width)}${model} · ${effort}${via ? '  (default)' : ''}`,
  );
}

/**
 * What the rows are, and what they are not. Each line stays within 70
 * columns, so a clack note box in an 80-column terminal never wraps one.
 */
export function modelsLabelLines(floorDir: string): string[] {
  return [
    "Claude Code applies each /pharn-* command's own model:/effort:",
    'frontmatter, not this block. The block is the source of truth',
    'that frontmatter is held to; to check the two agree:',
    modelsCheckerCommand(floorDir, 'agreement'),
  ];
}
