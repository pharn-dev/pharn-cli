import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MANIFEST_RAW_PATH,
  CORE_MODULE,
  SKILL_MODULE_PREFIX,
} from './constants.js';
import {
  ManifestValidationError,
  MODULE_NAME_RE,
  VERSION_RE,
  INSTALL_PATH_RE,
  WIZARD_VALUE_RE,
  assertSafeString,
  assertNoDotDot,
  isPlainObject,
} from './validate.js';
import type {
  Manifest,
  ManifestModule,
  ModuleManifest,
  WizardCondition,
  WizardOption,
  WizardQuestion,
  WizardRule,
  WizardSection,
  WizardSpec,
} from '../types.js';

const SKILL_CATEGORY_KIND = 'skill-category';

const RAW = 'https://raw.githubusercontent.com';
export const MAX_BODY_BYTES = 256 * 1024;
export const FETCH_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Parsing / validation
// ---------------------------------------------------------------------------

export function parseManifest(raw: unknown): Manifest {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError('manifest must be an object');
  }
  // Hard rejection on schema mismatch is intentional: bumping schemaVersion
  // requires a coordinated CLI release. Old CLIs MUST fail loudly rather than
  // guess at a new schema. This CLI understands 1 (legacy) and 2 (wizard).
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== 2) {
    throw new ManifestValidationError(
      `Unsupported manifest schemaVersion: ${JSON.stringify(raw.schemaVersion)}. Upgrade the CLI: npm i -g pharn-cli@latest`,
    );
  }
  const schemaVersion = raw.schemaVersion;
  const skillsVersion = assertSafeString(
    raw.skillsVersion,
    'manifest.skillsVersion',
    VERSION_RE,
  );
  if (!Array.isArray(raw.modules) || raw.modules.length === 0) {
    throw new ManifestValidationError(
      'manifest.modules must be a non-empty array',
    );
  }
  const modules = raw.modules.map((m, i) =>
    parseManifestModule(m, `manifest.modules[${i}]`),
  );
  if (schemaVersion === 1) {
    return { schemaVersion: 1, skillsVersion, modules };
  }
  // schemaVersion 2 carries the wizard block (single source of truth for the
  // init questionnaire). A malformed wizard is a hard failure — never silently
  // fall back to the legacy flow.
  const wizard = parseWizard(raw.wizard, new Set(modules.map((m) => m.name)));
  return { schemaVersion: 2, skillsVersion, modules, wizard };
}

// Fields shared by the repo-root manifest's module entries and each module.json
// (name, version, required, dependsOn, exclusiveWith, description).
interface CommonModuleFields {
  name: string;
  version: string;
  required: boolean;
  dependsOn: string[];
  exclusiveWith: string[] | undefined;
  description: string;
}

// exclusiveWith entries are glob patterns (e.g. `pharn-stack-*`), so the
// allowlist tolerates `*` on top of the module-name charset.
const EXCLUSIVE_WITH_RE = /^[a-z0-9*-]+$/;

function parseCommonModuleFields(
  raw: Record<string, unknown>,
  path: string,
): CommonModuleFields {
  const name = assertSafeString(raw.name, `${path}.name`, MODULE_NAME_RE);
  const version = assertSafeString(raw.version, `${path}.version`, VERSION_RE);
  if (typeof raw.required !== 'boolean') {
    throw new ManifestValidationError(`${path}.required must be a boolean`);
  }
  const dependsOn = parseStringArray(raw.dependsOn, `${path}.dependsOn`, [
    MODULE_NAME_RE,
  ]);
  const exclusiveWith =
    raw.exclusiveWith === undefined
      ? undefined
      : parseStringArray(raw.exclusiveWith, `${path}.exclusiveWith`, [
          EXCLUSIVE_WITH_RE,
        ]);
  const description = assertSafeString(
    raw.description,
    `${path}.description`,
    /.+/s,
  );
  return {
    name,
    version,
    required: raw.required,
    dependsOn,
    exclusiveWith,
    description,
  };
}

function parseManifestModule(raw: unknown, path: string): ManifestModule {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(`${path} must be an object`);
  }
  const common = parseCommonModuleFields(raw, path);
  // Optional `kind` (schemaVersion 2): "skill-category" modules are wizard-
  // driven. Unknown kinds are tolerated but carry no special behavior.
  const kind =
    raw.kind === undefined
      ? undefined
      : assertSafeString(raw.kind, `${path}.kind`, WIZARD_VALUE_RE);
  return { ...common, kind };
}

export function parseModuleManifest(
  raw: unknown,
  path = 'module.json',
): ModuleManifest {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(`${path} must be an object`);
  }
  const common = parseCommonModuleFields(raw, path);
  if (!isPlainObject(raw.installs)) {
    throw new ManifestValidationError(`${path}.installs must be an object`);
  }
  const installs: Record<string, string> = {};
  for (const [src, dest] of Object.entries(raw.installs)) {
    const safeSrc = assertSafeString(
      src,
      `${path}.installs key`,
      INSTALL_PATH_RE,
    );
    assertNoDotDot(safeSrc, `${path}.installs key`);
    const safeDest = assertSafeString(
      dest,
      `${path}.installs[${src}]`,
      INSTALL_PATH_RE,
    );
    assertNoDotDot(safeDest, `${path}.installs[${src}]`);
    installs[safeSrc] = safeDest;
  }
  if (Object.keys(installs).length === 0) {
    throw new ManifestValidationError(`${path}.installs must not be empty`);
  }
  return { ...common, installs };
}

function parseStringArray(
  value: unknown,
  label: string,
  patterns: RegExp[] = [],
): string[] {
  if (!Array.isArray(value)) {
    throw new ManifestValidationError(`${label} must be an array`);
  }
  return value.map((v, i) => {
    if (typeof v !== 'string') {
      throw new ManifestValidationError(`${label}[${i}] must be a string`);
    }
    for (const p of patterns) {
      assertSafeString(v, `${label}[${i}]`, p);
    }
    return v;
  });
}

// ---------------------------------------------------------------------------
// Wizard block parsing / validation (schemaVersion 2)
// ---------------------------------------------------------------------------

const RULE_TYPES = new Set(['hide', 'hideQuestion', 'relabel', 'warn']);

export function parseWizard(
  raw: unknown,
  moduleNames: Set<string>,
): WizardSpec {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError('manifest.wizard must be an object');
  }
  if (!Array.isArray(raw.sections) || raw.sections.length === 0) {
    throw new ManifestValidationError(
      'manifest.wizard.sections must be a non-empty array',
    );
  }
  const sections = raw.sections.map((s, i) =>
    parseWizardSection(s, `wizard.sections[${i}]`, moduleNames),
  );
  if (!isPlainObject(raw.defaults)) {
    throw new ManifestValidationError(
      'manifest.wizard.defaults must be an object',
    );
  }
  // Answers live in a flat questionId -> value map, so a question id reused
  // across sections would silently collide. Hard-fail naming the id.
  const questionOptions = new Map<string, Set<string>>();
  for (const section of sections) {
    for (const question of section.questions) {
      if (questionOptions.has(question.id)) {
        throw new ManifestValidationError(
          `manifest.wizard has a duplicate question id "${question.id}" — ids must be unique across sections.`,
        );
      }
      questionOptions.set(
        question.id,
        new Set(question.options.map((o) => o.value)),
      );
    }
  }
  // `defaults` maps question id -> chosen option value. Keys that are not
  // question ids (e.g. a `comment` documentation key, a common JSON idiom) are
  // metadata and ignored — only real answers are validated and stored. A
  // question-id key whose value matches no option is a packaging bug (Default
  // mode would silently install nothing for it), so hard-fail.
  const defaults: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw.defaults)) {
    const optionValues = questionOptions.get(key);
    if (!optionValues) {
      continue;
    }
    const safe = assertSafeString(
      value,
      `wizard.defaults["${key}"]`,
      WIZARD_VALUE_RE,
    );
    if (!optionValues.has(safe)) {
      throw new ManifestValidationError(
        `wizard.defaults["${key}"] = ${JSON.stringify(safe)} is not an option of question "${key}".`,
      );
    }
    defaults[key] = safe;
  }
  return { sections, defaults };
}

function parseWizardSection(
  raw: unknown,
  path: string,
  moduleNames: Set<string>,
): WizardSection {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(`${path} must be an object`);
  }
  const id = assertSafeString(raw.id, `${path}.id`, WIZARD_VALUE_RE);
  const title = assertSafeString(raw.title, `${path}.title`, /.+/s);
  if (!Array.isArray(raw.questions) || raw.questions.length === 0) {
    throw new ManifestValidationError(
      `${path} (section "${id}") questions must be a non-empty array`,
    );
  }
  const questions = raw.questions.map((q, i) =>
    parseWizardQuestion(q, `${path}.questions[${i}]`, id, moduleNames),
  );
  return { id, title, questions };
}

function parseWizardQuestion(
  raw: unknown,
  path: string,
  sectionId: string,
  moduleNames: Set<string>,
): WizardQuestion {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(
      `${path} (section "${sectionId}") must be an object`,
    );
  }
  const id = assertSafeString(raw.id, `${path}.id`, WIZARD_VALUE_RE);
  const prompt = assertSafeString(raw.prompt, `${path}.prompt`, /.+/s);
  if (!Array.isArray(raw.options) || raw.options.length === 0) {
    throw new ManifestValidationError(
      `${path} (question "${id}") options must be a non-empty array`,
    );
  }
  const options = raw.options.map((o, i) =>
    parseWizardOption(o, `${path}.options[${i}]`, id, moduleNames),
  );
  const rules =
    raw.rules === undefined
      ? undefined
      : parseWizardRules(raw.rules, `${path}.rules`, id);
  return { id, prompt, options, rules };
}

function parseWizardOption(
  raw: unknown,
  path: string,
  questionId: string,
  moduleNames: Set<string>,
): WizardOption {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(
      `${path} (question "${questionId}") must be an object`,
    );
  }
  const value = assertSafeString(raw.value, `${path}.value`, WIZARD_VALUE_RE);
  const label = assertSafeString(raw.label, `${path}.label`, /.+/s);
  if (raw.default !== undefined && typeof raw.default !== 'boolean') {
    throw new ManifestValidationError(`${path}.default must be a boolean`);
  }
  if (raw.comingSoon !== undefined && typeof raw.comingSoon !== 'boolean') {
    throw new ManifestValidationError(`${path}.comingSoon must be a boolean`);
  }
  let install: string | null = null;
  if (raw.install !== null && raw.install !== undefined) {
    install = assertSafeString(raw.install, `${path}.install`, INSTALL_PATH_RE);
    assertNoDotDot(install, `${path}.install`);
    // The first path segment must be a known module so `add` can resolve it and
    // selective install copies from a real source.
    const root = install.split('/')[0]!;
    if (!moduleNames.has(root)) {
      throw new ManifestValidationError(
        `${path}.install "${install}" does not start with a known module name`,
      );
    }
    // It must also be a pharn-skills-* category so the option is addressable via
    // `add <category>:<skill>`; listSkillAddresses relies on this prefix.
    if (!root.startsWith(SKILL_MODULE_PREFIX)) {
      throw new ManifestValidationError(
        `${path}.install "${install}" must be rooted at a ${SKILL_MODULE_PREFIX}* category module`,
      );
    }
  }
  let vendorSkill: string | null | undefined;
  if (raw.vendorSkill !== null && raw.vendorSkill !== undefined) {
    vendorSkill = assertSafeString(
      raw.vendorSkill,
      `${path}.vendorSkill`,
      WIZARD_VALUE_RE,
    );
  } else {
    vendorSkill = raw.vendorSkill as null | undefined;
  }
  return {
    value,
    label,
    default: raw.default as boolean | undefined,
    install,
    vendorSkill,
    comingSoon: raw.comingSoon as boolean | undefined,
  };
}

function parseWizardRules(
  raw: unknown,
  path: string,
  questionId: string,
): WizardRule[] {
  if (!Array.isArray(raw)) {
    throw new ManifestValidationError(
      `${path} (question "${questionId}") must be an array`,
    );
  }
  return raw.map((r, i) => parseWizardRule(r, `${path}[${i}]`, questionId));
}

function parseWizardRule(
  raw: unknown,
  path: string,
  questionId: string,
): WizardRule {
  if (!isPlainObject(raw)) {
    throw new ManifestValidationError(
      `${path} (question "${questionId}") must be an object`,
    );
  }
  const type = raw.type;
  if (typeof type !== 'string' || !RULE_TYPES.has(type)) {
    throw new ManifestValidationError(
      `${path}.type must be one of hide | hideQuestion | relabel | warn`,
    );
  }
  const cond = parseWizardCondition(raw.if, `${path}.if`);
  switch (type) {
    case 'hideQuestion':
      return { type, if: cond };
    case 'hide':
      return {
        type,
        if: cond,
        options: parseStringArray(raw.options, `${path}.options`, [
          WIZARD_VALUE_RE,
        ]),
      };
    case 'relabel':
      return {
        type,
        if: cond,
        options: parseStringArray(raw.options, `${path}.options`, [
          WIZARD_VALUE_RE,
        ]),
        label: assertSafeString(raw.label, `${path}.label`, /.+/s),
      };
    default:
      return {
        type: 'warn',
        if: cond,
        message: assertSafeString(raw.message, `${path}.message`, /.+/s),
      };
  }
}

function parseWizardCondition(raw: unknown, path: string): WizardCondition {
  if (!isPlainObject(raw) || Object.keys(raw).length === 0) {
    throw new ManifestValidationError(`${path} must be a non-empty object`);
  }
  const cond: WizardCondition = {};
  for (const [key, value] of Object.entries(raw)) {
    assertSafeString(key, `${path} key`, WIZARD_VALUE_RE);
    if (typeof value === 'string') {
      cond[key] = assertSafeString(value, `${path}["${key}"]`, WIZARD_VALUE_RE);
    } else if (isPlainObject(value) && typeof value.not === 'string') {
      cond[key] = {
        not: assertSafeString(
          value.not,
          `${path}["${key}"].not`,
          WIZARD_VALUE_RE,
        ),
      };
    } else {
      throw new ManifestValidationError(
        `${path}["${key}"] must be a string or { not: string }`,
      );
    }
  }
  return cond;
}

// ---------------------------------------------------------------------------
// Reading from a fetched repo on disk
// ---------------------------------------------------------------------------

export function readManifest(repoDir: string): Manifest {
  const path = resolve(repoDir, 'manifest.json');
  if (!existsSync(path)) {
    throw new ManifestValidationError(`manifest.json not found at ${path}`);
  }
  return parseManifest(JSON.parse(readFileSync(path, 'utf8')));
}

export function readModuleManifest(
  repoDir: string,
  name: string,
): ModuleManifest {
  assertSafeString(name, 'module name', MODULE_NAME_RE);
  const path = resolve(repoDir, name, 'module.json');
  if (!existsSync(path)) {
    throw new ManifestValidationError(
      `${name}/module.json not found at ${path}`,
    );
  }
  return parseModuleManifest(
    JSON.parse(readFileSync(path, 'utf8')),
    `${name}/module.json`,
  );
}

// ---------------------------------------------------------------------------
// Dependency resolution
// ---------------------------------------------------------------------------

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolutionError';
  }
}

function globMatch(pattern: string, name: string): boolean {
  if (!pattern.includes('*')) return pattern === name;
  const re = new RegExp(`^${pattern.split('*').map(escapeRegExp).join('.*')}$`);
  return re.test(name);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Resolve the full, ordered set of modules to install from a set of explicit
 * selections. Always includes pharn-core, pulls in transitive dependsOn, and
 * enforces exclusiveWith. Order places dependencies before dependents.
 */
export function resolveModules(
  manifest: Manifest,
  selected: string[],
): ManifestModule[] {
  const byName = new Map(manifest.modules.map((m) => [m.name, m]));

  // Always include required modules + pharn-core.
  const requested = new Set<string>([CORE_MODULE]);
  for (const m of manifest.modules) if (m.required) requested.add(m.name);
  for (const name of selected) {
    if (!byName.has(name)) {
      throw new ResolutionError(`Unknown module: ${name}`);
    }
    requested.add(name);
  }

  // Transitive dependency closure.
  const resolved = new Set<string>();
  const visiting = new Set<string>();
  const order: ManifestModule[] = [];

  const visit = (name: string): void => {
    if (resolved.has(name)) return;
    if (visiting.has(name)) {
      throw new ResolutionError(`Dependency cycle involving ${name}`);
    }
    const mod = byName.get(name);
    if (!mod) throw new ResolutionError(`Unknown module: ${name}`);
    visiting.add(name);
    for (const dep of mod.dependsOn) visit(dep);
    visiting.delete(name);
    resolved.add(name);
    order.push(mod);
  };
  for (const name of requested) visit(name);

  // Exclusivity: no two resolved modules may exclude each other. A module in
  // the same dependency chain (e.g. a stack pack and its own base) is never a
  // conflict, even if it matches the glob.
  const depsClosure = (name: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(byName.get(name)?.dependsOn ?? [])];
    while (stack.length) {
      const dep = stack.pop()!;
      if (seen.has(dep)) continue;
      seen.add(dep);
      stack.push(...(byName.get(dep)?.dependsOn ?? []));
    }
    return seen;
  };
  for (const mod of order) {
    const modDeps = depsClosure(mod.name);
    for (const pattern of mod.exclusiveWith ?? []) {
      for (const other of order) {
        if (other.name === mod.name) continue;
        if (modDeps.has(other.name) || depsClosure(other.name).has(mod.name)) {
          continue;
        }
        if (globMatch(pattern, other.name)) {
          throw new ResolutionError(
            `${mod.name} is exclusive with ${other.name} — pick only one.`,
          );
        }
      }
    }
  }

  return order;
}

// ---------------------------------------------------------------------------
// Categorization for the wizard
// ---------------------------------------------------------------------------

export interface ModuleCategories {
  // Required foundation (pharn-core); always installed, never offered.
  core: ManifestModule[];
  // User-facing optional modules offered as a multiselect.
  optional: ManifestModule[];
  // Mutually-exclusive stack packs (e.g. pharn-stack-nextjs) offered as a
  // single choice. Their shared bases (e.g. pharn-stack-react) are pulled in
  // as dependencies, not offered directly.
  stackPacks: ManifestModule[];
}

export function isStackPack(m: ManifestModule): boolean {
  return (m.exclusiveWith ?? []).some((p) => p.includes('*'));
}

export function categorizeModules(manifest: Manifest): ModuleCategories {
  const stackPacks = manifest.modules.filter(isStackPack);

  // Bases that exist only to back a stack pack — kept out of the optional list.
  const stackBases = new Set<string>();
  for (const pack of stackPacks) {
    for (const dep of pack.dependsOn) stackBases.add(dep);
  }

  const core = manifest.modules.filter((m) => m.required);
  const optional = manifest.modules.filter(
    (m) =>
      !m.required &&
      !isStackPack(m) &&
      !stackBases.has(m.name) &&
      // schemaVersion 2: category modules are driven by the wizard, never the
      // methodology multiselect. No-op on v1 (kind is absent there).
      m.kind !== SKILL_CATEGORY_KIND,
  );
  return { core, optional, stackPacks };
}

// ---------------------------------------------------------------------------
// Remote manifest fetch (for `pharn update`, avoids cloning the repo)
// ---------------------------------------------------------------------------

export async function fetchRemoteManifest(): Promise<Manifest> {
  const url = `${RAW}/${MANIFEST_RAW_PATH}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, { redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    throw new Error(`Manifest fetch failed (${res.status}) from ${url}`);
  }
  // Reject oversized bodies before buffering when the server advertises a size;
  // the post-read length check below stays as the fallback for chunked replies.
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new Error(`Manifest too large (${declared} bytes) from ${url}`);
  }
  const text = await res.text();
  if (text.length > MAX_BODY_BYTES) {
    throw new Error(`Manifest too large (${text.length} bytes) from ${url}`);
  }
  return parseManifest(JSON.parse(text));
}
