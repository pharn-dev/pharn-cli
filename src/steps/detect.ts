import { note } from '@clack/prompts';
import { detectStackPack } from '../lib/manifest.js';
import { detectAnswers, describeAnswers } from '../lib/wizard.js';
import type { Answers } from '../lib/wizard.js';
import { readProjectPackages } from './prereqs.js';
import type { ManifestModule, WizardSpec } from '../types.js';

export interface Detected {
  // questionId → detected option value (questions with no match are omitted).
  detectedAnswers: Answers;
  // Stack pack preselected from prerequisites, or null for none.
  detectedStackPack: string | null;
}

/**
 * schemaVersion 2 pre-fill: read the project's package.json and derive the
 * stack pack + per-tech answers used to seed the wizard. The pure derivation
 * lives in lib (detectStackPack / detectAnswers); this step does the I/O and
 * surfaces what was found so the pre-fills aren't silent. Every choice can
 * still be overridden downstream.
 */
export function runDetect(
  wizard: WizardSpec,
  stackPacks: ManifestModule[],
  cwd: string = process.cwd(),
): Detected {
  const packages = readProjectPackages(cwd);
  const detectedAnswers = detectAnswers(wizard, packages);
  const detectedStackPack = detectStackPack(stackPacks, packages);

  // Show friendly labels for the answers; the pack keeps its module name to
  // match the stack-pack prompt that follows (where packs are listed by name).
  const found = [
    ...(detectedStackPack ? [detectedStackPack] : []),
    ...describeAnswers(wizard, detectedAnswers),
  ];
  if (found.length > 0) {
    note(found.join(', '), 'Detected from package.json');
  }
  return { detectedAnswers, detectedStackPack };
}
