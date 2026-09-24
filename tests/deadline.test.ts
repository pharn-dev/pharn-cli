import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDeadline } from '../src/lib/deadline.js';

// PHARN-09: on Node 20/22 undici can lose the abort after a GC, so a timeout
// that only CALLS abort() never fires into the body read. withDeadline must
// answer at the deadline on its own.
describe('withDeadline', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('rejects at the deadline even when the work never settles, and aborts its signal', async () => {
    let seen: AbortSignal | undefined;
    const pending = withDeadline(
      1000,
      () => new Error('too slow'),
      (signal) => {
        seen = signal;
        return new Promise<never>(() => undefined); // ignores the abort entirely
      },
    );
    const rejects = expect(pending).rejects.toThrow('too slow');
    await vi.advanceTimersByTimeAsync(999);
    expect(seen!.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await rejects;
    expect(seen!.aborted).toBe(true);
  });

  it('returns the work result when it settles first, and clears the timer', async () => {
    const value = await withDeadline(
      1000,
      () => new Error('too slow'),
      async () => 42,
    );
    expect(value).toBe(42);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('propagates the work rejection when it settles first', async () => {
    await expect(
      withDeadline(
        1000,
        () => new Error('too slow'),
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');
  });

  it('a late rejection of the losing work is not an unhandled rejection', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      let fail!: (e: Error) => void;
      const pending = withDeadline(
        10,
        () => new Error('too slow'),
        () =>
          new Promise<never>((_, reject) => {
            fail = reject;
          }),
      );
      const rejects = expect(pending).rejects.toThrow('too slow');
      await vi.advanceTimersByTimeAsync(10);
      await rejects;
      fail(new Error('late'));
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
