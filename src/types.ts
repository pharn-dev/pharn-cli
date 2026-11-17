import type { ARCHETYPE_VALUES } from './lib/validate.js';

// ---------------------------------------------------------------------------
// pharn.config.json — written into the user's project. The CLI owns this
// schema; PHARN skills read it at runtime.
// ---------------------------------------------------------------------------

// How a capability entered `capabilities`. 'auto' = chosen by archetype
// resolution, so `pharn update` drops it when the archetypes stop selecting it.
// 'manual' = the user named it (`pharn add`), so it survives updates. Runtime
// allowlist: CAPABILITY_SOURCES in src/lib/pharn-config.ts.
export type CapabilitySource = 'auto' | 'manual';

// One selected capability copied into the project. `name` is its directory
// basename; `role` selects the subtree.
export interface InstalledCapability {
  name: string;
  role: 'griller' | 'lens';
  // Selection provenance. Absent on configs written before the field, and
  // legal everywhere; no global "absent means auto" default — only
  // src/lib/merge-capabilities.ts may resolve absence. Offline consumers
  // (`remove`) branch on the literal 'auto' and stay silent on absent.
  source?: CapabilitySource;
}

// ---------------------------------------------------------------------------
// The `models` and `seam` blocks are pharn-oss's, not this CLI's, so both are
// `unknown` here. `models` (schema: pharn/floor/check-model-config.mjs) is
// copied at `init`, managed by `update` (src/lib/models-update.ts) and checked
// with a pinned copy of the rules (src/lib/model-config.ts). `seam` (schema:
// pharn-contracts/seam-config.md) is neither validated nor written: every
// command, a re-run init included, carries it VERBATIM.
// ---------------------------------------------------------------------------

// Every key declared here is pharn-OWNED except `seam`: `pharn init` rewrites
// it, and CLI_OWNED_KEYS (src/lib/pharn-config.ts) must list it — the typecheck
// enforces that. Undeclared keys (upstream's `testResults`, `ship`) are the
// user's and survive every command, init included — so declaring an upstream
// key here would make init start dropping it.
export interface PharnConfig {
  pharnVersion: string;
  skillsVersion: string;
  // The upstream version a `pharn update` APPLIED while withholding the
  // `skillsVersion` bump solely because of the user's kept edits (`modified` /
  // `unrecorded` skips, and the `held` skips they caused). `add` accepts a clone
  // at it; the next complete update clears it.
  pendingSkillsVersion?: string;
  // `role:name` of every installed capability `update` (or a re-run `init`)
  // KEPT because it could not parse it upstream — plus one parseable again
  // while any of its files was still skipped. Sorted; omitted when none. Every
  // `update` re-checks them.
  frozenCapabilities?: string[];
  repo: string;
  commit: string | null;
  // The channel this install follows (lib/release.ts): `"latest"` = the newest
  // verified pharn-oss release; ABSENT = the tip of `main` (`--ref main`, or an
  // install made before `--ref` existed). Any other value is dropped at load.
  ref?: 'latest';
  // SHIM (remove in v0.21.0): always `[]` on an archetype install, and written
  // for 0.19.x, whose guard needs it (it reads a config without a `modules`
  // array as NO config); stop writing in v0.21.0 (support policy: current +
  // previous minor). This CLI also reads one with `capabilities` and no
  // `modules`, so the type admits its absence; `add`/`update`/`remove` write it
  // back as found.
  modules?: unknown[];
  // When the install was first made: written by `init` (a re-run included) and
  // carried unchanged by `update`, `add` and `remove`.
  installedAt: string;
  // When the last `pharn update` rewrote the config (ISO string). `init` never
  // writes it, so a re-run drops it.
  updatedAt?: string;
  // pharn-oss's block (see above), carried VERBATIM and never validated at
  // load. pharn's to WRITE (CLI_OWNED_KEYS), so a re-run init replaces it.
  models?: unknown;
  // pharn-oss's block (see above). NOT pharn-owned: never validated or written,
  // carried VERBATIM; the one declared key absent from CLI_OWNED_KEYS.
  seam?: unknown;
  // Archetype installs: the archetypes and the capabilities copied for them.
  // Absent on legacy module installs.
  archetypes?: Archetype[];
  capabilities?: InstalledCapability[];
  // The install layout mirrored from the fetched clone (lib/layout.ts): 'pharn'
  // = everything under pharn/, 'flat' = the legacy root layout. Absent → 'flat'.
  layout?: Layout;
}

// Fields only older (module-era and wizard) CLIs wrote. Not part of the
// documented `PharnConfig`: nothing in src/ reads or writes them. An old config
// still loads with them, `add`/`update`/`remove` write them back as found, and
// a re-run `init` drops them, because CLI_OWNED_KEYS lists them as pharn's.
// LEGACY: remove in v0.21.0, alongside `PharnConfig.modules`.
export interface LegacyConfigFields {
  // The module-era constitution variant (`gdpr-strict`/`standard`/`minimal`).
  constitution?: unknown;
  // The module-era multi-tenancy answer.
  isMultiTenant?: boolean;
  // The wizard's answers, `questionId → value`.
  stackAnswers?: Record<string, string>;
  // The wizard's per-technology skills, each `{ skill, from }`.
  installedSkills?: unknown;
}

// The two install layouts (lib/layout.ts). Kept here so PharnConfig can use it
// without a types↔layout import cycle.
export type Layout = 'pharn' | 'flat';

// ---------------------------------------------------------------------------
// Capability resolver — archetype detection + capability selection over
// pharn-oss's capability index.
// ---------------------------------------------------------------------------

// Project archetype, detected deterministically from package.json dependency
// names and file-tree signals (src/lib/detect-archetype.ts). No signal → `lib`.
// A project may match several at once.
export type Archetype = (typeof ARCHETYPE_VALUES)[number];

// One capability in the pharn-oss index, pharn's consumer-side shape. `role` is
// narrowed to the installable kinds (grillers + lenses). `applies` is
// 'universal' (always selected) or the archetypes that trigger it.
export interface CapabilityEntry {
  name: string;
  role: 'griller' | 'lens';
  applies: 'universal' | Archetype[];
}

// A capability the fetch boundary enumerated but could NOT parse (name,
// markdown, frontmatter, `role` or `applies` failed validation). Skipped and
// REPORTED: fail closed on installing it, never on merely seeing it.
//
// Every field is UNTRUSTED upstream text and reaches only the terminal, through
// lib/unknown-capabilities.ts; nothing here is ever selected, copied, or
// newly recorded.
export interface UnknownCapability {
  // The directory name as found (may itself be why it was skipped).
  name: string;
  // The SUBTREE's role — never the frontmatter `role`, which may be what
  // failed — so a `role:name` key is always derivable.
  role: 'griller' | 'lens';
  // The subtree directory it was found under, at the clone's layout.
  subtree: string;
  // Why it was skipped (the validation message), for the human.
  reason: string;
}

export interface CapabilityIndex {
  capabilities: CapabilityEntry[];
  // Every capability the parse refused, in the same order as `capabilities`.
  unknown: UnknownCapability[];
}

// A capability chosen for install. `matched` is why: 'universal', the detected
// archetypes that intersected its `applies`, or 'manual' — a re-run `init`
// carrying over a `pharn add` the archetypes did not select.
export interface SelectedCapability {
  name: string;
  role: 'griller' | 'lens';
  matched: 'universal' | 'manual' | Archetype[];
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
