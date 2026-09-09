import { log, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { FIRST_FEATURE_COMMAND, REPO_URL } from '../lib/constants.js';
import { installCapabilities } from '../lib/install-capabilities.js';
import { collectExpectedInstallPaths } from '../lib/install-manifest.js';
import { layoutPaths } from '../lib/layout.js';
import { buildRecords, writeRecords } from '../lib/install-records.js';
import { DEFAULT_MODEL_ROUTING } from '../lib/model-routing.js';
import { formatModelRoutingLines } from '../lib/model-routing-format.js';
import { DEFAULT_SEAM_CONFIG } from '../lib/seam-config.js';
import { writePharnConfig } from '../lib/pharn-config.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import { PHARN_VERSION } from '../version.js';
import type {
  Archetype,
  InstalledCapability,
  Layout,
  PharnConfig,
  Selection,
} from '../types.js';

// The archetype-install apply stage (pharn init --archetype). Copies the
// resolved capabilities + product surfaces from the already-fetched `repoDir`,
// then writes pharn.config.json. Network-free (the commit SHA is passed in by
// the orchestrator) so it is exercised end-to-end by the fixture test. Mirrors
// steps/install.ts. One axis (P3): the archetype apply/config stage.
export async function runInstallArchetype(
  repoDir: string,
  cwd: string,
  archetypes: Archetype[],
  selection: Selection,
  commit: string | null,
): Promise<void> {
  const startedAt = Date.now();

  const s = spinner();
  s.start('Installing capabilities');
  let capabilities: InstalledCapability[];
  let settingsPreserved: boolean;
  let skillsVersion: string;
  let layout: Layout;
  let docsWritten: string[];
  try {
    const result = installCapabilities(repoDir, cwd, selection);
    capabilities = result.capabilities;
    settingsPreserved = result.settingsPreserved;
    layout = result.layout;
    docsWritten = result.docs;
    skillsVersion = readSkillsVersion(repoDir);
  } catch (err) {
    // Stop the spinner and propagate — the orchestrator cleans up the fetched
    // temp clone in its finally, then formats + exits (cleanup before exit).
    s.stop('Failed to install capabilities');
    throw err;
  }
  s.stop('Capabilities installed');

  if (settingsPreserved) {
    log.warn(
      'Existing .claude/settings.json preserved — compare it against pharn-oss to wire the PHARN hooks if needed.',
    );
  }

  // Which trusted docs the fetched repo did NOT ship at their expected path. A
  // set difference over two CLI-owned string arrays — the expected list from the
  // layout resolver, the written list from the copy routine itself, so a doc can
  // only be "missing" here because its existence guard rejected it.
  //
  // The guard is deliberate (an older clone that predates a doc must still
  // install, P7), but its silence is not: two docs were absent from every pharn
  // install while the outro reported "docs written" regardless. Naming them is
  // the whole point — the copy is still a no-op, it just no longer reads as
  // success.
  const docsMissing = layoutPaths(layout).docs.filter(
    (doc) => !docsWritten.includes(doc),
  );
  if (docsMissing.length) {
    log.warn(
      `The fetched repo shipped no ${docsMissing.join(', ')} — not installed. Installed commands and checkers that cite ${docsMissing.length === 1 ? 'it' : 'them'} by path will not resolve.`,
    );
  }

  const config: PharnConfig = {
    pharnVersion: PHARN_VERSION,
    skillsVersion,
    repo: REPO_URL.replace(/^github\.com\//, ''),
    commit,
    // No constitution variant: the archetype install copies pharn-oss's canonical
    // CONSTITUTION.md verbatim. No modules: capabilities are the install unit.
    modules: [],
    installedAt: new Date().toISOString(),
    // Per-stage model routing, written on every fresh install (P7 — additive).
    models: DEFAULT_MODEL_ROUTING,
    // Seam-resolution policy, written on every fresh install (P7 — additive).
    seam: DEFAULT_SEAM_CONFIG,
    archetypes,
    // Every entry a fresh install writes came from archetype resolution, so it is
    // `auto` — `pharn update` owns it and may drop it when the archetypes stop
    // selecting it. `pharn add` is the only thing that writes `manual`. Tagged at
    // the WRITE site so lib/install-capabilities.ts (the copy routine) stays
    // unaware of provenance, which is not its axis (P3).
    capabilities: capabilities.map((c) => ({ ...c, source: 'auto' as const })),
    // The layout mirrored from the fetched clone (flat OR pharn/) — status/remove
    // read this back to address the project the same way (lib/layout.ts).
    layout,
  };
  // Record sha256 of every file this install just wrote (hashed at the DEST, so
  // the record cannot disagree with what landed) BEFORE the config, and stamped
  // with the config values written beside it. This is the baseline `pharn update`
  // compares against so it can tell pharn's bytes from the user's edits
  // (lib/install-records.ts). Without it every later update is degraded.
  await writeRecords(cwd, {
    skillsVersion,
    commit,
    files: buildRecords(
      cwd,
      collectExpectedInstallPaths({ repoDir, capabilities, layout }).keys(),
    ),
  });
  await writePharnConfig(cwd, config);

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const check = pc.green('✔');
  const grillers = capabilities.filter((c) => c.role === 'griller').length;
  const lenses = capabilities.filter((c) => c.role === 'lens').length;
  // Render the per-stage routing from the config just written (not a second
  // hardcoded copy), so the recorded intent is legible right after install.
  // config.models is set on every fresh install; the guard narrows its optional
  // type (P7 legacy). The hint below says plainly that no installed STAGE
  // consumes the block yet: it is written, validated and displayed — this line
  // and status's MODELS note are two of its readers — but nothing reads it to
  // PICK a model (docs/roadmap.md carries the Planned row). Claiming an edit
  // here changes a stage's model would document unimplemented behavior
  // (CLAUDE.md).
  const modelLines = config.models
    ? formatModelRoutingLines(config.models)
    : [];
  // Report the docs that LANDED, by name — never a count and never the expected
  // list. A count would hide exactly the silence this line exists to end, and
  // the names are what let a user see at a glance that (say) LIMITS.md is not
  // among them. Zero docs cannot render as "docs written" at all.
  const docsLine = docsWritten.length
    ? `${check} ${docsWritten.length} trusted doc${docsWritten.length === 1 ? '' : 's'} written → ${pc.dim(docsWritten.join(', '))}`
    : `${pc.yellow('!')} no trusted docs written ${pc.dim('(the fetched repo shipped none at their expected paths)')}`;
  outro(
    [
      `${check} ${capabilities.length} capabilit${capabilities.length === 1 ? 'y' : 'ies'} installed → ${pc.dim(`(${grillers} griller${grillers === 1 ? '' : 's'}, ${lenses} lens${lenses === 1 ? '' : 'es'})`)}`,
      `${check} PHARN commands + hooks written → ${pc.dim('.claude/')}`,
      docsLine,
      `${check} pharn.config.json written ${pc.dim(`(skills v${skillsVersion}, archetypes: ${archetypes.join(', ')})`)}`,
      `${pc.dim(`Done in ${elapsed}s`)}`,
      '',
      pc.bold('Models per stage'),
      ...modelLines.map((line) => `  ${line}`),
      `  ${pc.dim('Recorded in pharn.config.json → models.stages — no installed stage reads it yet')}`,
      '',
      pc.bold('Next steps'),
      `  ${pc.cyan('1.')}  ${pc.bold('claude')}            ${pc.dim('open Claude Code')}`,
      `  ${pc.cyan('2.')}  ${pc.bold(FIRST_FEATURE_COMMAND)}       ${pc.dim("capture your first feature's intent")}`,
    ].join('\n'),
  );
}
