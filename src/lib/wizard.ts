import { basename } from 'node:path';
import { SKILL_MODULE_PREFIX } from './constants.js';
import type {
  InstalledSkill,
  WizardCondition,
  WizardOption,
  WizardQuestion,
  WizardRule,
  WizardSpec,
} from '../types.js';

type WarnRule = Extract<WizardRule, { type: 'warn' }>;

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
    .filter(
      (r): r is WarnRule => r.type === 'warn' && matchCondition(r.if, answers),
    )
    .map((r) => r.message);
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
 * Detected answers from the project's installed packages: for each question,
 * the first selectable (non-comingSoon) option whose `detect` list names an
 * installed package. Questions with no match are omitted — the caller falls
 * back to defaults (Default mode) or the prompt's own default (Custom mode).
 */
export function detectAnswers(
  wizard: WizardSpec,
  packages: Set<string>,
): Answers {
  const detected: Answers = {};
  for (const question of eachQuestion(wizard)) {
    for (const option of question.options) {
      if (option.comingSoon) continue;
      if (option.detect?.some((pkg) => packages.has(pkg))) {
        detected[question.id] = option.value;
        break;
      }
    }
  }
  return detected;
}

/**
 * Default mode answers: wizard.defaults with any detected answers overlaid
 * (detection wins; undetected questions keep their default), then the wizard
 * rules applied so the result is what a Custom run would produce if every
 * default were accepted. Questions hidden by a hideQuestion rule become "skip"
 * (exactly as Custom mode records them); a value a hide rule removed — or a
 * coming-soon option — snaps to the question's own default, so Default mode
 * never carries an unselectable answer (and never installs a skill for a
 * question the rules would have hidden). Rules read answers in question order,
 * matching runWizardQuestions.
 */
export function applyDefaults(
  wizard: WizardSpec,
  detected: Answers = {},
): Answers {
  const merged: Answers = { ...wizard.defaults, ...detected };
  const resolved: Answers = {};
  for (const question of eachQuestion(wizard)) {
    const { hidden, options } = applyRulesToQuestion(question, resolved);
    if (hidden) {
      resolved[question.id] = 'skip';
      continue;
    }
    const selectable = options.filter((o) => !o.comingSoon);
    const want = merged[question.id];
    resolved[question.id] =
      want !== undefined && selectable.some((o) => o.value === want)
        ? want
        : (selectable.find((o) => o.default)?.value ??
          selectable[0]?.value ??
          'skip');
  }
  return resolved;
}

/**
 * Human-readable labels for the given answers, in question order — used to
 * surface detections to the user. Falls back to the raw value if no option
 * matches (e.g. a stale answer no longer in the wizard).
 */
export function describeAnswers(
  wizard: WizardSpec,
  answers: Answers,
): string[] {
  const labels: string[] = [];
  for (const question of eachQuestion(wizard)) {
    const value = answers[question.id];
    if (value === undefined) continue;
    const option = question.options.find((o) => o.value === value);
    labels.push(option?.label ?? value);
  }
  return labels;
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

function categoryToModule(category: string): string {
  return `${SKILL_MODULE_PREFIX}${category}`;
}

/** All installable `category:skill` addresses across the wizard, for `add`. */
export function listSkillAddresses(wizard: WizardSpec): SkillAddress[] {
  const out: SkillAddress[] = [];
  for (const question of eachQuestion(wizard)) {
    for (const option of question.options) {
      if (!option.install) continue;
      // parseWizardOption guarantees every install is rooted at a
      // pharn-skills-* module, so the prefix strip is safe.
      const module = option.install.split('/')[0]!;
      const category = module.slice(SKILL_MODULE_PREFIX.length);
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
