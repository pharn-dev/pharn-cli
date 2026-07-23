import { describe, expect, it } from 'vitest';
import { formatModelRoutingLines } from '../src/lib/model-routing-format.js';
import { DEFAULT_MODEL_ROUTING } from '../src/lib/model-routing.js';
import type { ModelRouting } from '../src/types.js';

describe('formatModelRoutingLines', () => {
  it('renders DEFAULT_MODEL_ROUTING as aligned, default-first lines', () => {
    expect(formatModelRoutingLines(DEFAULT_MODEL_ROUTING)).toEqual([
      'default   sonnet-5 · high',
      'plan      opus-4-8 · max',
      'review    opus-4-8 · high',
    ]);
  });

  it('renders FROM the given config, not a hardcoded default (custom values flow through)', () => {
    const custom: ModelRouting = {
      default: { model: 'haiku-4-5', effort: 'low' },
      stages: { review: { model: 'fable-5', effort: 'max' } },
    };
    expect(formatModelRoutingLines(custom)).toEqual([
      'default   haiku-4-5 · low',
      'review    fable-5 · max',
    ]);
  });

  it('orders default first, then configured stages in PIPELINE_STAGES order (not JSON key order)', () => {
    const routing: ModelRouting = {
      default: { model: 'sonnet-5', effort: 'high' },
      // Deliberately out of pipeline order in the source object.
      stages: {
        review: { model: 'opus-4-8', effort: 'high' },
        build: { model: 'haiku-4-5', effort: 'low' },
        plan: { model: 'opus-4-8', effort: 'max' },
      },
    };
    const labels = formatModelRoutingLines(routing).map(
      (line) => line.split(/\s{2,}/)[0],
    );
    expect(labels).toEqual(['default', 'plan', 'build', 'review']);
  });

  it('renders a single default line when stages is empty', () => {
    expect(
      formatModelRoutingLines({
        default: { model: 'sonnet-5', effort: 'high' },
        stages: {},
      }),
    ).toEqual(['default   sonnet-5 · high']);
  });
});
