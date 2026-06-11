// ---------------------------------------------------------------------------
// PHARN OSS manifest (manifest.json at the repo root)
// ---------------------------------------------------------------------------

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
  // Vendor official-skill name for the consent step, or null/absent.
  vendorSkill?: string | null;
  // Rendered dimmed + "(coming soon)"; not selectable.
  comingSoon?: boolean;
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
  // schemaVersion 2 only: per-tech wizard answers (questionId → value, incl.
  // "skip"), the skill subfolders to copy, and the vendor skills consented to.
  stackAnswers?: Record<string, string>;
  installedSkills?: InstalledSkill[];
  vendorSkills?: string[];
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

export interface PharnConfig {
  pharnVersion: string;
  skillsVersion: string;
  repo: string;
  commit: string | null;
  constitution: Constitution;
  modules: InstalledModule[];
  installedAt: string;
  // schemaVersion 2 additions (absent on legacy installs):
  stackAnswers?: Record<string, string>;
  installedSkills?: InstalledSkill[];
  vendorSkills?: string[];
}
