import { isPlainObject } from './validate.js';
import type { ResolutionStep, SeamConfidence, SeamConfig } from '../types.js';

// Thrown when a `seam` block fails validation. Names the offending step/field so
// a hand-edited pharn.config.json fails loudly, never silently (P5).
export class SeamConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeamConfigError';
  }
}

// Runtime allowlists — the deterministic floor for the `seam` block (enum
// membership, P5 / ARCHITECTURE.md §2 primitive #3). Conforms to
// pharn-contracts/seam-config.md (the SoT) and the parallel floor validator
// .dev/floor/check-seam-config.mjs — cited, not restated (P4). Each array is the
// runtime SoT paired with its types.ts union; `satisfies` keeps the two in
// lockstep (a typo or drift here is a compile error).
export const RESOLUTION_STEPS = [
  'official-skill',
  'pinned-docs',
  'fetch',
  'model',
  'ask',
] as const satisfies readonly ResolutionStep[];

export const SEAM_CONFIDENCE_LEVELS = [
  'low',
  'medium',
  'high',
] as const satisfies readonly SeamConfidence[];

// The terminal fallback that MUST be present in resolutionOrder — the one floor
// invariant (ARCHITECTURE.md §5 "terminal fallback is ask", P5). Without it an
// unknown seam has no defined stop. Presence, not last-ness, is the invariant.
const TERMINAL_STEP: ResolutionStep = 'ask';

// The default written on every fresh install — the canonical ARCHITECTURE.md §5
// chain order verbatim (model before fetch), with the two optional policy knobs
// set. A project may reorder in its own config; the floor preserves the terminal
// `ask` under any reordering (validateSeamConfig).
export const DEFAULT_SEAM_CONFIG: SeamConfig = {
  resolutionOrder: ['official-skill', 'pinned-docs', 'model', 'fetch', 'ask'],
  modelConfidenceThreshold: 'high',
  haltOnUnknown: true,
};

// Known top-level keys. An unknown sibling key (e.g. a typo'd `haltOnUnknwon`)
// is REJECTED, naming it (BUG 2, P5 fail-closed) — so a hand-edit typo can never
// silently disable a knob. `satisfies` keeps the set honest against the type.
const SEAM_KEYS = [
  'resolutionOrder',
  'modelConfidenceThreshold',
  'haltOnUnknown',
] as const satisfies readonly (keyof SeamConfig)[];

// Reject any key not in `known`, naming the first offender (JSON-escaped so a
// control-char key is echoed as DATA, never raw — P2). Local to this axis.
function assertNoUnknownKeys(
  obj: Record<string, unknown>,
  known: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      throw new SeamConfigError(
        `${label} has unknown key ${JSON.stringify(key)} (expected one of ${known.join(', ')})`,
      );
    }
  }
}

/**
 * Validate a `seam` block (from pharn.config.json or DEFAULT_SEAM_CONFIG).
 * Rejects — throwing SeamConfigError, naming the offender — a resolutionOrder
 * that is not an array, contains an unknown step, or omits the terminal `ask`
 * (THE floor invariant, fail-closed); an out-of-enum modelConfidenceThreshold;
 * or a non-boolean haltOnUnknown. The two knobs are OPTIONAL (absent ⇒ runtime
 * default). Returns the typed, validated config; the resolutionOrder is returned
 * in its given order (never reordered).
 *
 * Deterministic floor (P0/P5): membership / presence / type tests only;
 * fail-closed — a malformed block hard-fails, never a silent fallback. Conforms
 * to pharn-contracts/seam-config.md (P4).
 */
export function validateSeamConfig(input: unknown): SeamConfig {
  if (!isPlainObject(input)) {
    throw new SeamConfigError('seam must be an object');
  }
  // Reject unknown sibling keys (e.g. a typo'd `haltOnUnknwon`) up front (BUG 2).
  assertNoUnknownKeys(input, SEAM_KEYS, 'seam');

  const { resolutionOrder } = input;
  if (!Array.isArray(resolutionOrder)) {
    throw new SeamConfigError(
      `seam.resolutionOrder must be an array (got ${JSON.stringify(resolutionOrder)})`,
    );
  }
  for (let i = 0; i < resolutionOrder.length; i++) {
    const step: unknown = resolutionOrder[i];
    if (!(RESOLUTION_STEPS as readonly unknown[]).includes(step)) {
      throw new SeamConfigError(
        `seam.resolutionOrder[${i}] has invalid step ${JSON.stringify(step)} (expected one of ${RESOLUTION_STEPS.join(', ')})`,
      );
    }
  }
  // Reject duplicate steps — a repeated step is a hand-edit slip, not a valid
  // walk (BUG 4a). This supersedes the SoT's older "wasteful but valid" stance
  // for duplicates under the strict-config posture (pharn-contracts/seam-config.md).
  const seen = new Set<unknown>();
  for (const step of resolutionOrder) {
    if (seen.has(step)) {
      throw new SeamConfigError(
        `seam.resolutionOrder has duplicate step ${JSON.stringify(step)} (each step may appear at most once)`,
      );
    }
    seen.add(step);
  }
  // THE floor invariant: the terminal `ask` cannot be configured away (P5,
  // fail-closed). Presence — not last-ness — is what guarantees the walk always
  // terminates; `ask` after other steps is merely wasteful, still valid.
  if (!resolutionOrder.includes(TERMINAL_STEP)) {
    throw new SeamConfigError(
      `seam.resolutionOrder must contain "${TERMINAL_STEP}" — the terminal fallback cannot be configured away (fail-closed)`,
    );
  }

  const config: SeamConfig = {
    resolutionOrder: resolutionOrder as ResolutionStep[],
  };

  // Optional: absent ⇒ runtime default applies, so preserve presence/absence.
  if (input.modelConfidenceThreshold !== undefined) {
    const threshold = input.modelConfidenceThreshold;
    if (
      typeof threshold !== 'string' ||
      !(SEAM_CONFIDENCE_LEVELS as readonly string[]).includes(threshold)
    ) {
      throw new SeamConfigError(
        `seam.modelConfidenceThreshold ${JSON.stringify(threshold)} is invalid (expected one of ${SEAM_CONFIDENCE_LEVELS.join(', ')})`,
      );
    }
    config.modelConfidenceThreshold = threshold as SeamConfidence;
  }
  // Cross-field (BUG 4b): a threshold with no `model` step for it to gate is a
  // dead knob — reject, naming the fix. resolutionOrder is validated above.
  if (
    input.modelConfidenceThreshold !== undefined &&
    !(resolutionOrder as ResolutionStep[]).includes('model')
  ) {
    throw new SeamConfigError(
      'seam.modelConfidenceThreshold is set but resolutionOrder has no "model" step for it to gate (add "model" or remove the threshold)',
    );
  }

  if (input.haltOnUnknown !== undefined) {
    if (typeof input.haltOnUnknown !== 'boolean') {
      throw new SeamConfigError(
        `seam.haltOnUnknown must be a boolean (got ${JSON.stringify(input.haltOnUnknown)})`,
      );
    }
    config.haltOnUnknown = input.haltOnUnknown;
  }

  return config;
}
