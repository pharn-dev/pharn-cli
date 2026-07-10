import { intro, log, outro, spinner } from '@clack/prompts';
import pc from 'picocolors';
import { REPO_URL } from '../lib/constants.js';
import { parseCapabilityArg } from '../lib/capability-address.js';
import { parseCapabilityIndex } from '../lib/capability-index.js';
import { installCapabilityDirs } from '../lib/install-capabilities.js';
import { fetchRepo } from '../lib/repo.js';
import { readSkillsVersion } from '../lib/skills-version.js';
import {
  loadArchetypeConfigOrExit,
  writePharnConfig,
} from '../lib/pharn-config.js';
import type { PharnConfig } from '../types.js';

// `pharn add <name>` / `add <role>:<name>` installs one capability into an
// archetype project. The legacy module/manifest flow was removed (live pharn-oss
// ships no manifest.json); a pre-archetype config is rejected up front by
// loadArchetypeConfigOrExit with the single LEGACY_CONFIG_MESSAGE.
export async function runAdd(capabilityArg: string | undefined): Promise<void> {
  intro('pharn add');

  const cwd = process.cwd();
  const config = loadArchetypeConfigOrExit(cwd);
  await runArchetypeAdd(config, cwd, capabilityArg);
}

// Install one capability into an archetype project (a manual override of
// archetype auto-selection). Appends to `capabilities`, never touches
// `archetypes`. The clone lives across no interactive prompt, but cleanup still
// runs in a finally with every process.exit after it.
async function runArchetypeAdd(
  config: PharnConfig,
  cwd: string,
  arg: string | undefined,
): Promise<void> {
  if (arg === undefined) {
    log.error(
      'Specify a capability, e.g. `pharn add a11y` or `pharn add lens:n-plus-one`.',
    );
    process.exit(1);
  }
  const parsed = parseCapabilityArg(arg);
  if (parsed.error) {
    log.error(parsed.error);
    process.exit(1);
  }

  const s = spinner();
  s.start(`Fetching capabilities from ${REPO_URL}`);
  let repo;
  try {
    repo = await fetchRepo();
    s.stop(`Capabilities fetched from ${REPO_URL}`);
  } catch (err) {
    s.stop('Failed to fetch capabilities');
    log.error(`⚠ ${err instanceof Error ? err.message : String(err)}`);
    if (process.env.PHARN_DEBUG) console.error(err);
    process.exit(1);
  }

  // Assigned exactly once per path (try or catch), so cleanup runs in the finally
  // and the exit/outro happens after it (Node skips finally on process.exit).
  let result: AddResult;
  try {
    result = await resolveArchetypeAdd(
      repo.dir,
      repo.sha,
      config,
      cwd,
      parsed,
      arg,
    );
  } catch (err) {
    if (process.env.PHARN_DEBUG) console.error(err);
    result = {
      kind: 'error',
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    repo.cleanup();
  }

  if (result.kind === 'error') {
    log.error(`⚠ ${result.message}`);
    process.exit(1);
  }
  if (result.kind === 'noop') {
    outro(`${result.name} is already installed.`);
    return;
  }
  outro(
    `${pc.green('✔')} Added ${result.name} ${pc.dim(`(skills v${result.version})`)}`,
  );
}

type AddResult =
  | { kind: 'added'; name: string; version: string }
  | { kind: 'noop'; name: string }
  | { kind: 'error'; message: string };

// Resolve the arg against the fetched index and, if it uniquely names a not-yet-
// installed capability, copy it + append to config. Pure of process.exit — the
// caller owns cleanup + exit (this returns a typed outcome instead).
async function resolveArchetypeAdd(
  repoDir: string,
  sha: string | null,
  config: PharnConfig,
  cwd: string,
  parsed: { name: string; role?: 'griller' | 'lens' },
  arg: string,
): Promise<AddResult> {
  const index = parseCapabilityIndex(repoDir);
  const matches = index.capabilities.filter(
    (c) =>
      c.name === parsed.name &&
      (parsed.role === undefined || c.role === parsed.role),
  );
  if (matches.length === 0) {
    const valid = index.capabilities.map((c) => `${c.role}:${c.name}`).sort();
    return {
      kind: 'error',
      message: `Unknown capability "${arg}". Valid capabilities:\n  ${valid.join('\n  ')}`,
    };
  }
  if (matches.length > 1) {
    return {
      kind: 'error',
      message: `"${parsed.name}" is ambiguous — use ${matches.map((m) => `${m.role}:${m.name}`).join(' or ')}.`,
    };
  }
  const cap = matches[0]!;
  const existing = config.capabilities ?? [];
  if (existing.some((c) => c.name === cap.name && c.role === cap.role)) {
    return { kind: 'noop', name: cap.name };
  }
  installCapabilityDirs(repoDir, cwd, [{ name: cap.name, role: cap.role }]);
  const version = readSkillsVersion(repoDir);
  // The SHA the tree was pinned to (recorded == fetched, or null when the branch
  // was floated — LIMITS.md §3b); threaded from fetchRepo, no separate fetch.
  const commit = sha;
  await writePharnConfig(cwd, {
    ...config,
    skillsVersion: version,
    commit,
    capabilities: [...existing, { name: cap.name, role: cap.role }],
    installedAt: new Date().toISOString(),
  });
  return { kind: 'added', name: cap.name, version };
}
