// ---------------------------------------------------------------------------
// Constitution variants (pharn-core/templates/constitution/CONSTITUTION.*.md)
// ---------------------------------------------------------------------------

export type Constitution = 'gdpr-strict' | 'standard' | 'minimal';

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

// How a capability entered `capabilities` — its selection PROVENANCE. 'auto' =
// chosen by archetype resolution, so `pharn update` owns it and drops it when the
// archetypes stop selecting it. 'manual' = the user named it (`pharn add`), so it
// is preserved across updates even when the archetypes do not select it. Runtime
// allowlist: CAPABILITY_SOURCES in src/lib/pharn-config.ts.
export type CapabilitySource = 'auto' | 'manual';

// Archetype install (pharn init --archetype): one selected capability copied into
// the project. `name` is the capability's directory basename (the copy target
// under pharn-pipeline/grillers/ or pharn-review/); `role` selects that subtree.
export interface InstalledCapability {
  name: string;
  role: 'griller' | 'lens';
  // Selection provenance. Additive (P7): absent on every config written before
  // this field existed, and absent is LEGAL everywhere. Deliberately NOT given a
  // global "absent means auto" default — provenance is genuinely unknown until
  // `pharn update` infers it against a fresh index (src/lib/merge-capabilities.ts,
  // the ONLY place that may resolve absence). Offline consumers — `remove` above
  // all — branch on the literal 'auto' and stay silent on absent, because a
  // legacy MANUAL add wrongly defaulted to 'auto' would be told the opposite of
  // the truth.
  source?: CapabilitySource;
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
// terminal `ask` (P5, fail-closed). The CLI owns the config shape + its
// validator; the runtime resolver that WALKS it is pharn-oss's seam-resolver
// skill, installed verbatim as part of the fixed `pharn-core` surface
// (lib/constants.ts → PHARN_CORE_DIR). The CLI never parses or executes it.
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
// Capability resolver — archetype detection + capability selection. pharn
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
// authoritative schema; this is pharn's consumer-side shape. `role` is
// narrowed to the installable kinds shipped today (grillers + lenses); the full
// ARCHITECTURE.md §3.1 role enum is not needed here until an installable
// skill/auditor ships. `applies` is 'universal' (always selected) or the
// archetypes that trigger the capability.
export interface CapabilityEntry {
  name: string;
  role: 'griller' | 'lens';
  applies: 'universal' | Archetype[];
}

// A capability the fetch boundary enumerated but could NOT parse into a
// CapabilityEntry — a directory under a known subtree whose name, markdown,
// frontmatter, `role` or `applies` failed validation. It is the FORWARD-
// COMPATIBILITY escape hatch: a released CLI always parses `main` HEAD and can
// never pin older content, so one routine grammar evolution upstream used to
// abort init/add/update in every deployed CLI at once. Unknown content is now
// skipped and REPORTED instead — fail closed on INSTALLING it, never on merely
// seeing it.
//
// Every field is UNTRUSTED upstream text and reaches only the terminal, through
// the single sanitizing renderer in lib/unknown-capabilities.ts. Nothing here is
// ever selected, copied, enumerated by the install manifest, or newly recorded in
// pharn.config.json (P2).
export interface UnknownCapability {
  // The directory name as found. May itself be why it was skipped (a name that
  // failed CAPABILITY_NAME_RE is reported and joined no further).
  name: string;
  // The SUBTREE's role, which is authoritative in this codebase — never the
  // frontmatter `role`, which may be exactly what failed. This is what makes a
  // `role:name` key derivable for an entry whose declared role is unusable.
  role: 'griller' | 'lens';
  // The subtree directory it was found under, at the clone's layout.
  subtree: string;
  // Why it was skipped (the validation message), for the human.
  reason: string;
}

export interface CapabilityIndex {
  capabilities: CapabilityEntry[];
  // Additive (P7): every capability the parse refused, in the same deterministic
  // enumeration order as `capabilities`. Empty for a fully-parseable clone, which
  // is what keeps a healthy install exactly as quiet as it was.
  unknown: UnknownCapability[];
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
