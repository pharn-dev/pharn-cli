import { isCancel, log, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit, confirmWarning } from '../lib/confirm.js';
import { applyRulesToQuestion, pendingWarnings } from '../lib/wizard.js';
import type { Answers } from '../lib/wizard.js';
import type { WizardOption, WizardQuestion, WizardSpec } from '../types.js';

/**
 * Custom mode: walk manifest.wizard sections in order, applying hide /
 * hideQuestion / relabel rules against the answers gathered so far, and firing
 * warn rules (soft-confirm) after each answer. Returns the full answer map
 * (questionId → value, with "skip" for questions hidden by rule).
 */
export async function runWizardQuestions(
  wizard: WizardSpec,
  initial?: Answers,
): Promise<Answers> {
  const answers: Answers = {};

  for (const section of wizard.sections) {
    note(section.title);
    for (const question of section.questions) {
      const { hidden, options } = applyRulesToQuestion(question, answers);
      if (hidden) {
        answers[question.id] = 'skip';
        continue;
      }
      // Re-ask the same question (current pick preselected) whenever a warn rule
      // is declined, instead of aborting the whole wizard.
      let preselect = initial?.[question.id];
      while (true) {
        const answer = await askQuestion(question, options, preselect);
        answers[question.id] = answer;
        if (!(await anyWarningDeclined(question, answers))) break;
        preselect = answer;
      }
    }
  }

  return answers;
}

async function anyWarningDeclined(
  question: WizardQuestion,
  answers: Answers,
): Promise<boolean> {
  for (const warning of pendingWarnings(question, answers)) {
    if (!(await confirmWarning(warning, 'Continue anyway?', true))) return true;
  }
  return false;
}

async function askQuestion(
  question: WizardQuestion,
  options: WizardOption[],
  initialValue: string | undefined,
): Promise<string> {
  const selectable = options.filter((o) => !o.comingSoon);
  if (selectable.length === 0) {
    // Every option is hidden by a rule or marked coming-soon — mirror the
    // manifest-validation posture and hard-fail rather than trap the user.
    log.error(
      `Question "${question.id}" has no selectable options (all hidden or coming soon). Check the manifest wizard rules.`,
    );
    process.exit(1);
  }
  const valid = new Set(selectable.map((o) => o.value));
  const preselect =
    initialValue !== undefined && valid.has(initialValue)
      ? initialValue
      : (selectable.find((o) => o.default)?.value ?? selectable[0]!.value);

  // comingSoon options are shown (dimmed) but not selectable; re-prompt if one
  // is chosen.
  while (true) {
    const choice = await select({
      message: question.prompt,
      options: options.map((o) => ({
        value: o.value,
        label: o.comingSoon ? `${o.label} ${pc.dim('(coming soon)')}` : o.label,
        hint: o.comingSoon ? 'coming soon' : undefined,
      })),
      initialValue: preselect,
    });
    if (isCancel(choice)) cancelAndExit();
    const picked = options.find((o) => o.value === choice);
    if (picked?.comingSoon) {
      log.warn(`${picked.label} is coming soon — pick another option.`);
      continue;
    }
    return choice as string;
  }
}
