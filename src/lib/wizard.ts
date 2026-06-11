import { basename } from 'node:path';
import type {
  InstalledSkill,
  WizardCondition,
  WizardOption,
  WizardQuestion,
  WizardSpec,
} from '../types.js';

// ---------------------------------------------------------------------------
// Pure wizard logic (no I/O): rule evaluation + answer → install resolution.
// `manifest.wizard` is the single source of truth; this module never hardcodes
// questions, options, or installs.
// ---------------------------------------------------------------------------

export type Answers = Record<string, string>;

/**
 * Evaluate a rule condition against the answers gathered so far. AND across
 * keys; each value is an exact match or a negation. A missing answer key fails
 * an equality check and satisfies a negation (rules read prior answers, so the
 * referenced question is normally already answered).
 */
export function matchCondition(
  cond: WizardCondition,
  answers: Answers,
): boolean {
  for (const [key, expected] of Object.entries(cond)) {
    const actual = answers[key];
    if (typeof expected === 'string') {
      if (actual !== expected) return false;
    } else if (actual === expected.not) {
      return false;
    }
  }
  return true;
}

export interface ResolvedQuestion {
  // True when a hideQuestion rule matched — skip the prompt, record "skip".
  hidden: boolean;
  // Options after hide/relabel rules are applied (comingSoon flags preserved).
  options: WizardOption[];
}

/**
 * Apply hide / hideQuestion / relabel rules to a question given prior answers.
 * `warn` rules are evaluated separately (after the answer) by pendingWarnings.
 */
export function applyRulesToQuestion(
  question: WizardQuestion,
  answers: Answers,
): ResolvedQuestion {
  let options = question.options;
  let hidden = false;

  for (const rule of question.rules ?? []) {
    if (!matchCondition(rule.if, answers)) continue;
    switch (rule.type) {
      case 'hideQuestion':
        hidden = true;
        break;
      case 'hide': {
        const drop = new Set(rule.options);
        options = options.filter((o) => !drop.has(o.value));
        break;
      }
      case 'relabel': {
        const targets = new Set(rule.options);
        options = options.map((o) =>
          targets.has(o.value) ? { ...o, label: rule.label } : o,
        );
        break;
      }
      // warn handled by pendingWarnings.
    }
  }
  return { hidden, options };
}

/**
 * Warn messages whose condition matches the answers (including the answer just
 * given for this question). The caller soft-confirms each before continuing.
 */
export function pendingWarnings(
  question: WizardQuestion,
  answers: Answers,
): string[] {
  return (question.rules ?? [])
    .filter((r) => r.type === 'warn' && matchCondition(r.if, answers))
    .map((r) => (r as { message: string }).message);
}

function findChosenOption(
  question: WizardQuestion,
  answers: Answers,
): WizardOption | undefined {
  const value = answers[question.id];
  if (value === undefined) return undefined;
  return question.options.find((o) => o.value === value);
}

function* eachQuestion(wizard: WizardSpec): Generator<WizardQuestion> {
  for (const section of wizard.sections) {
    for (const question of section.questions) yield question;
  }
}

/**
 * The skill subfolders to copy for the given answers: every answered option
 * carrying a non-null `install`. Each becomes `.claude/skills/<basename>/`.
 */
export function collectInstalls(
  wizard: WizardSpec,
  answers: Answers,
): InstalledSkill[] {
  const skills: InstalledSkill[] = [];
  for (const question of eachQuestion(wizard)) {
    const option = findChosenOption(question, answers);
    if (option?.install) {
      skills.push({ skill: basename(option.install), from: option.install });
    }
  }
  return skills;
}

/**
 * Vendor official-skill names to feed the consent step: every answered option
 * carrying a non-null `vendorSkill`.
 */
export function collectVendorSkills(
  wizard: WizardSpec,
  answers: Answers,
): string[] {
  const vendors: string[] = [];
  for (const question of eachQuestion(wizard)) {
    const option = findChosenOption(question, answers);
    if (option?.vendorSkill) vendors.push(option.vendorSkill);
  }
  return vendors;
}

/** Default mode answers: wizard.defaults verbatim (asks nothing per-tech). */
export function applyDefaults(wizard: WizardSpec): Answers {
  return { ...wizard.defaults };
}

export interface SkillAddress {
  // e.g. "orm"
  category: string;
  // module name, e.g. "pharn-skills-orm"
  module: string;
  // e.g. "drizzle" (the option value AND install basename)
  skill: string;
  questionId: string;
  install: string;
}

// Category modules follow the `pharn-skills-<category>` convention (e.g.
// `orm` → `pharn-skills-orm`).
const SKILL_MODULE_PREFIX = 'pharn-skills-';

function categoryToModule(category: string): string {
  return `${SKILL_MODULE_PREFIX}${category}`;
}

/** All installable `category:skill` addresses across the wizard, for `add`. */
export function listSkillAddresses(wizard: WizardSpec): SkillAddress[] {
  const out: SkillAddress[] = [];
  for (const question of eachQuestion(wizard)) {
    for (const option of question.options) {
      if (!option.install) continue;
      const module = option.install.split('/')[0]!;
      const category = module.replace(
        new RegExp(`^${SKILL_MODULE_PREFIX}`),
        '',
      );
      out.push({
        category,
        module,
        skill: basename(option.install),
        questionId: question.id,
        install: option.install,
      });
    }
  }
  return out;
}

/**
 * Resolve `add orm:prisma`: the skill option under `pharn-skills-<category>`
 * whose install basename is `skill`. Returns undefined when no match exists.
 */
export function findSkillOption(
  wizard: WizardSpec,
  category: string,
  skill: string,
): SkillAddress | undefined {
  const module = categoryToModule(category);
  return listSkillAddresses(wizard).find(
    (a) => a.module === module && a.skill === skill,
  );
}
