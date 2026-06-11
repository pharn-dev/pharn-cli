import { isCancel, log, note, select } from '@clack/prompts';
import pc from 'picocolors';
import { cancelAndExit, warnAndConfirm } from '../lib/confirm.js';
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
      answers[question.id] = await askQuestion(
        question,
        options,
        initial?.[question.id],
      );
      for (const warning of pendingWarnings(question, answers)) {
        await warnAndConfirm(warning, 'Continue anyway?', true);
      }
    }
  }

  return answers;
}

async function askQuestion(
  question: WizardQuestion,
  options: WizardOption[],
  initialValue: string | undefined,
): Promise<string> {
  const valid = new Set(options.map((o) => o.value));
  const preselect =
    initialValue !== undefined && valid.has(initialValue)
      ? initialValue
      : (options.find((o) => o.default && !o.comingSoon)?.value ??
        options.find((o) => !o.comingSoon)?.value ??
        options[0]!.value);

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
