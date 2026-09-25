import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// lib/fatal-signal.ts, in-process. The real handler removes every listener on
// the signal and re-raises it — against the test runner itself — so both are
// stubbed here and the handler is invoked directly. The exit STATUS a real
// signal produces is proven in a child process (tests/project-lock.test.ts,
// tests/repo-signals.test.ts); this file pins the ordering and isolation rules.

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;
type Sig = (typeof SIGNALS)[number];

let before: Record<Sig, unknown[]>;

/** A fresh module instance: the handlers install once PER MODULE. */
async function fresh(): Promise<typeof import('../src/lib/fatal-signal.js')> {
  vi.resetModules();
  return import('../src/lib/fatal-signal.js');
}

/** The listener the fresh module added for `sig` (exactly one expected). */
function addedListeners(sig: Sig): Array<() => void> {
  return process
    .listeners(sig)
    .filter((l) => !before[sig].includes(l)) as Array<() => void>;
}

beforeEach(() => {
  before = {
    SIGINT: process.listeners('SIGINT'),
    SIGTERM: process.listeners('SIGTERM'),
  };
  vi.spyOn(process, 'kill').mockImplementation(() => true);
  vi.spyOn(process, 'removeAllListeners').mockImplementation(() => process);
});

afterEach(() => {
  vi.restoreAllMocks();
  for (const sig of SIGNALS) {
    for (const l of addedListeners(sig)) process.removeListener(sig, l);
  }
});

describe('onFatalSignal', () => {
  it('installs nothing until something registers', async () => {
    await fresh();
    for (const sig of SIGNALS) expect(addedListeners(sig)).toHaveLength(0);
  });

  // `nohup` sets SIGHUP to SIG_IGN, and a listener would override that — a
  // hangup would then interrupt a `nohup pharn update` mid-write. So pharn must
  // never listen for it.
  it('leaves SIGHUP alone, so nohup keeps shielding a run', async () => {
    const hupBefore = process.listeners('SIGHUP');
    const { onFatalSignal } = await fresh();
    onFatalSignal(() => undefined);
    expect(process.listeners('SIGHUP')).toEqual(hupBefore);
  });

  it('installs one handler per signal, however many register', async () => {
    const { onFatalSignal } = await fresh();
    onFatalSignal(() => undefined);
    onFatalSignal(() => undefined);
    for (const sig of SIGNALS) expect(addedListeners(sig)).toHaveLength(1);
  });

  it('runs every cleanup, newest first, then re-raises the same signal', async () => {
    const { onFatalSignal } = await fresh();
    const order: string[] = [];
    onFatalSignal(() => order.push('clone'));
    onFatalSignal(() => order.push('lock'));

    addedListeners('SIGTERM')[0]!();

    expect(order).toEqual(['lock', 'clone']);
    // Every other listener goes first — clack's print-only SIGINT listener
    // would otherwise swallow the re-raise and the process would run on.
    expect(process.removeAllListeners).toHaveBeenCalledWith('SIGTERM');
    expect(process.kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('keeps going when one cleanup throws', async () => {
    const { onFatalSignal } = await fresh();
    const ran: string[] = [];
    onFatalSignal(() => ran.push('first-registered'));
    onFatalSignal(() => {
      throw new Error('boom');
    });

    expect(() => addedListeners('SIGINT')[0]!()).not.toThrow();
    expect(ran).toEqual(['first-registered']);
    expect(process.kill).toHaveBeenCalledWith(process.pid, 'SIGINT');
  });

  it('never runs a cleanup that was deregistered', async () => {
    const { onFatalSignal } = await fresh();
    const ran: string[] = [];
    const off = onFatalSignal(() => ran.push('released'));
    off();

    addedListeners('SIGTERM')[0]!();

    expect(ran).toEqual([]);
    expect(process.kill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
  });

  it('runs each cleanup at most once, even if a second signal arrives', async () => {
    const { onFatalSignal } = await fresh();
    let runs = 0;
    onFatalSignal(() => {
      runs += 1;
    });
    addedListeners('SIGINT')[0]!();
    addedListeners('SIGTERM')[0]!();
    expect(runs).toBe(1);
  });

  // Defensive: should the re-raise ever throw, the process must still END, with
  // the status the signal would have produced — never run on with its
  // listeners removed.
  it('exits 128 + the signal number when the re-raise throws', async () => {
    const { onFatalSignal } = await fresh();
    vi.mocked(process.kill).mockImplementation(() => {
      throw Object.assign(new Error('kill ENOSYS'), { code: 'ENOSYS' });
    });
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => undefined) as never);
    onFatalSignal(() => undefined);

    addedListeners('SIGTERM')[0]!();

    expect(exit).toHaveBeenCalledWith(143);
  });
});
