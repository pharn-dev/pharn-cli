// ---------------------------------------------------------------------------
// PHARN OSS manifest (manifest.json at the repo root)
// ---------------------------------------------------------------------------

// A package that must already be in the user's project (deps or devDeps) for a
// module to apply. Checked after stack-pack selection; `reason` is shown to the
// user verbatim on failure.
export interface ModulePrerequisite {
  package: string;
  reason: string;
}

export interface ManifestModule {
  name: string;
  version: string;
  required: boolean;
  dependsOn: string[];
  exclusiveWith?: string[];
  description: string;
  // schemaVersion 2: category modules (pharn-skills-*) are marked
  // "skill-category" and are driven by the wizard, never the module multiselect.
  kind?: string;
  // npm packages this module requires to already be installed in the user's
  // project (e.g. pharn-stack-nextjs requires `next`). A schemaVersion 2
  // concept, but parsed whenever present (like `kind`); absent on legacy
  // manifests, where it is simply never enforced.
  prerequisites?: ModulePrerequisite[];
}

export interface Manifest {
  // 1 = legacy (no wizard block); 2 = wizard-driven + skill categories.
  schemaVersion: 1 | 2;
  skillsVersion: string;
  modules: ManifestModule[];
  // Present only on schemaVersion 2 manifests.
  wizard?: WizardSpec;
}

// ---------------------------------------------------------------------------
// Wizard block (manifest.wizard) — schemaVersion 2. pharn-oss owns this schema;
// the CLI renders questions and resolves installs from it.
// ---------------------------------------------------------------------------

// A condition object evaluated against prior answers. AND across keys; each
// value is an exact match (string) or a negation ({ not: value }).
export type WizardCondition = Record<string, string | { not: string }>;

export interface WizardOption {
  // Answer key recorded in pharn.config.json stackAnswers.
  value: string;
  label: string;
  // Preselected in Custom mode.
  default?: boolean;
  // Repo-relative skill subfolder to copy, or null (nothing to install).
  install: string | null;
  // Rendered dimmed + "(coming soon)"; not selectable.
  comingSoon?: boolean;
  // npm packages whose presence in package.json (deps or devDeps) marks this
  // option as detected, used to pre-fill the wizard. Absent = not detectable.
  detect?: string[];
}

export type WizardRule =
  | { type: 'hide'; if: WizardCondition; options: string[] }
  | { type: 'hideQuestion'; if: WizardCondition }
  | { type: 'relabel'; if: WizardCondition; options: string[]; label: string }
  | { type: 'warn'; if: WizardCondition; message: string };

export interface WizardQuestion {
  id: string;
  prompt: string;
  options: WizardOption[];
  rules?: WizardRule[];
}

export interface WizardSection {
  id: string;
  title: string;
  questions: WizardQuestion[];
}

export interface WizardSpec {
  sections: WizardSection[];
  // questionId → default value, used verbatim in Default mode.
  defaults: Record<string, string>;
}

// Per-module manifest (<module>/module.json). The `installs` map is
// source-dir → destination-dir-in-.claude/.
export interface ModuleManifest {
  name: string;
  version: string;
  required: boolean;
  dependsOn: string[];
  exclusiveWith?: string[];
  description: string;
  installs: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Constitution variants (pharn-core/templates/constitution/CONSTITUTION.*.md)
// ---------------------------------------------------------------------------

export type Constitution = 'gdpr-strict' | 'standard' | 'minimal';

// ---------------------------------------------------------------------------
// Wizard selections
// ---------------------------------------------------------------------------

export interface WizardConfig {
  // Optional, non-required modules the user opted into (does NOT include
  // pharn-core, which is always installed, or transitive dependencies — those
  // are resolved at install time).
  modules: string[];
  // The chosen stack pack (e.g. 'pharn-stack-nextjs'), or null for none.
  stackPack: string | null;
  constitution: Constitution;
  // Whether the project is a multi-tenant SaaS. Default true (today's
  // behavior). When false, Principle 2 (Multi-Tenant Isolation) is stripped
  // from the installed constitution at materialize time.
  isMultiTenant: boolean;
  // schemaVersion 2 only: per-tech wizard answers (questionId → value, incl.
  // "skip") and the skill subfolders to copy.
  stackAnswers?: Record<string, string>;
  installedSkills?: InstalledSkill[];
}

// ---------------------------------------------------------------------------
// pharn.config.json — written into the user's project. The CLI owns this
// schema; PHARN skills read it at runtime.
// ---------------------------------------------------------------------------

export interface InstalledModule {
  name: string;
  version: string;
}

// schemaVersion 2: a single skill subfolder copied into .claude/skills/. `from`
// is the repo-relative source path; `skill` is its basename (the install dir).
export interface InstalledSkill {
  skill: string;
  from: string;
}

// Archetype install (pharn init --archetype): one selected capability copied into
// the project. `name` is the capability's directory basename (the copy target
// under pharn-pipeline/grillers/ or pharn-review/); `role` selects that subtree.
export interface InstalledCapability {
  name: string;
  role: 'griller' | 'lens';
}

// ---------------------------------------------------------------------------
// Model routing — the `models` block in pharn.config.json. The CLI owns this
// schema. Per-stage {model, effort} with a `default` fallback; a stage without
// an entry (incl. an empty `stages`) resolves to `default` (see
// src/lib/model-routing.ts, resolveStageModel). Realized via generated subagent
// frontmatter in a later increment — this is the config shape + validator only.
// ---------------------------------------------------------------------------

// Effort level (brief: {low, high, max} — no "medium"). Runtime allowlist:
// EFFORT_LEVELS in src/lib/model-routing.ts.
export type EffortLevel = 'low' | 'high' | 'max';

// Valid model-id strings (short forms of the current models). Runtime allowlist:
// MODEL_IDS in src/lib/model-routing.ts.
export type ModelId = 'opus-4-8' | 'sonnet-5' | 'fable-5' | 'haiku-4-5';

// Known pipeline stage keys that may carry a model override — the dev-loop stage
// commands (pharn-dev-*), realized as subagents. NOT the ARCHITECTURE §6 spine
// (which omits `review` and includes `spec`). Runtime allowlist: PIPELINE_STAGES
// in src/lib/model-routing.ts.
export type PipelineStage =
  'plan' | 'grill' | 'build' | 'regress' | 'verify' | 'review' | 'ship';

// One routing target: which model runs a stage, at what effort.
export interface StageModel {
  model: ModelId;
  effort: EffortLevel;
}

// The `models` block: a required `default` (the fallback for any stage without
// an explicit entry, incl. an empty `stages`) plus per-stage overrides.
export interface ModelRouting {
  default: StageModel;
  stages: Partial<Record<PipelineStage, StageModel>>;
}

// ---------------------------------------------------------------------------
// Seam-resolution config — the `seam` block in pharn.config.json. The CLI owns
// this schema; it conforms to pharn-contracts/seam-config.md (the SoT) and the
// parallel floor validator .dev/floor/check-seam-config.mjs. It is the policy
// for the agnostic seam resolver's confidence-gated chain (ARCHITECTURE.md §5):
// an ordered resolutionOrder walked until a step resolves, with a MANDATORY
// terminal `ask` (P5, fail-closed). Config shape + validator only — the runtime
// resolver that walks it is a later increment (a pharn-core capability).
// ---------------------------------------------------------------------------

// One step in the seam-resolution chain (ARCHITECTURE.md §5 sources). Runtime
// allowlist: RESOLUTION_STEPS in src/lib/seam-config.ts.
export type ResolutionStep =
  'official-skill' | 'pinned-docs' | 'fetch' | 'model' | 'ask';

// The confidence bar at the `model` step ({low, medium, high} — the seam-config
// contract's scale, NOT model-routing's effort enum). Runtime allowlist:
// SEAM_CONFIDENCE_LEVELS in src/lib/seam-config.ts.
export type SeamConfidence = 'low' | 'medium' | 'high';

// The `seam` block: an ordered resolutionOrder (non-empty, every element a known
// step, MUST contain the terminal `ask`) plus two optional policy knobs. Absent
// optional fields ⇒ the runtime default applies (seam-config.md). Validated by
// validateSeamConfig (src/lib/seam-config.ts).
export interface SeamConfig {
  resolutionOrder: ResolutionStep[];
  modelConfidenceThreshold?: SeamConfidence;
  haltOnUnknown?: boolean;
}

export interface PharnConfig {
  pharnVersion: string;
  skillsVersion: string;
  repo: string;
  commit: string | null;
  // Legacy (module/wizard) installs record the chosen constitution variant.
  // Optional: the archetype install (pharn init --archetype) copies pharn-oss's
  // canonical CONSTITUTION.md verbatim (no variant selection), so it omits this.
  constitution?: Constitution;
  // Whether the project is a multi-tenant SaaS. Written on every fresh install;
  // absent on legacy installs predating this flag (read as true → P2 kept).
  // When false, Principle 2 was stripped from CONSTITUTION.md at install.
  isMultiTenant?: boolean;
  modules: InstalledModule[];
  installedAt: string;
  // Per-stage model routing (the `models` block). Written on every fresh install
  // with DEFAULT_MODEL_ROUTING; absent on legacy installs predating it (P7 —
  // additive). Validated by validateModelRouting (src/lib/model-routing.ts).
  models?: ModelRouting;
  // Seam-resolution policy (the `seam` block). Written on every fresh install
  // with DEFAULT_SEAM_CONFIG; absent on legacy installs predating it (P7 —
  // additive). Validated by validateSeamConfig (src/lib/seam-config.ts).
  seam?: SeamConfig;
  // schemaVersion 2 additions (absent on legacy installs):
  stackAnswers?: Record<string, string>;
  installedSkills?: InstalledSkill[];
  // Archetype (capability) installs (pharn init --archetype). Additive; absent on
  // legacy module installs. `modules` is [] for an archetype install; these record
  // the detected archetypes and the capabilities copied for them.
  archetypes?: Archetype[];
  capabilities?: InstalledCapability[];
  // The install layout mirrored from the fetched clone (lib/layout.ts). Additive;
  // absent on legacy installs → read as 'flat' (the safe default, P7). 'pharn' =
  // the relocated single-install layout (everything under pharn/); 'flat' = the
  // legacy root layout.
  layout?: Layout;
}

// The two install layouts pharn-oss ships (lib/layout.ts). Kept here (not in
// layout.ts) so PharnConfig can reference it without a types↔layout import cycle.
export type Layout = 'pharn' | 'flat';

// ---------------------------------------------------------------------------
// Capability resolver — archetype detection + capability selection. pharn-cli
// reads pharn-oss's capability index and selects which grillers/lenses apply to
// a project (ARCHITECTURE.md §5). Pure + deterministic; the untrusted index is
// parsed + validated at the fetch boundary (a later increment).
// ---------------------------------------------------------------------------

// Project archetype, detected deterministically (a membership test, P5) from two
// sources merged: package.json dependency NAMES and structural file-tree signals
// (e.g. `.tsx` → client UI, `next.config.*` → ssr, an `api/` dir or a `route.ts`
// handler → backend) — see src/lib/detect-archetype.ts. A project with no signal
// from either source is `lib` — it runs on core alone (§4). A project may match
// several at once (e.g. Next + Express → ssr + backend).
//
// NOTE (human-owned reconciliation): ARCHITECTURE.md §5 still phrases detection as
// "membership over package.json", predating the file-tree extension. §5 is trusted
// + hook-protected (agent cannot edit it); updating its wording is a human call.
// The mechanism stays deterministic either way (P5).
export type Archetype = 'ssr' | 'backend' | 'spa' | 'lib';

// One capability in the pharn-oss-published index. pharn-oss owns the
// authoritative schema; this is pharn-cli's consumer-side shape. `role` is
// narrowed to the installable kinds shipped today (grillers + lenses); the full
// ARCHITECTURE.md §3.1 role enum is not needed here until an installable
// skill/auditor ships. `applies` is 'universal' (always selected) or the
// archetypes that trigger the capability.
export interface CapabilityEntry {
  name: string;
  role: 'griller' | 'lens';
  applies: 'universal' | Archetype[];
}

export interface CapabilityIndex {
  capabilities: CapabilityEntry[];
}

// A capability chosen for install. `matched` is why: 'universal', or the
// detected archetypes that intersected its `applies` set.
export interface SelectedCapability {
  name: string;
  role: 'griller' | 'lens';
  matched: 'universal' | Archetype[];
}

// A capability left out, with a deterministic, human-readable reason.
export interface SkippedCapability {
  name: string;
  role: 'griller' | 'lens';
  reason: string;
}

// The result of resolving a capability index against detected archetypes.
export interface Selection {
  selected: SelectedCapability[];
  skipped: SkippedCapability[];
}
