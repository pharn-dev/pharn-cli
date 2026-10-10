import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ProcessExit,
  restoreNodeVersion,
  setNodeVersion,
  stubProcessExit,
} from './helpers.js';

vi.mock('@clack/prompts', () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const { log } = await import('@clack/prompts');
const { runNodePrereq } = await import('../src/steps/node-prereq.js');

describe('runNodePrereq', () => {
  stubProcessExit();
  afterEach(() => {
    restoreNodeVersion();
    vi.clearAllMocks();
  });

  it('passes on the Node the suite runs on', () => {
    expect(() => runNodePrereq('init')).not.toThrow();
    expect(log.error).not.toHaveBeenCalled();
  });

  it.each(['24.2.0', '24.2.1', '25.0.0'])('passes on %s', (v) => {
    setNodeVersion(v);
    expect(() => runNodePrereq('update')).not.toThrow();
  });

  it.each(['24.1.9', '22.18.0', '20.13.0'])(
    'exits 1 on %s, naming the requirement and the current version',
    (v) => {
      setNodeVersion(v);
      expect(() => runNodePrereq('init')).toThrow(ProcessExit);

      const [msg, opts] = vi.mocked(log.error).mock.calls.at(-1)!;
      expect(msg).toContain('24.2.0');
      expect(msg).toContain(v);
      expect(msg).toContain('Nothing was written');
      // STDERR, like every other fatal in the CLI.
      expect(opts).toEqual({ output: process.stderr });
    },
  );

  it('exits with code 1', () => {
    setNodeVersion('22.0.0');
    expect(() => runNodePrereq('update')).toThrow(new ProcessExit(1));
  });

  it('exits 1 on an UNPARSEABLE version', () => {
    setNodeVersion('not.a.version');
    expect(() => runNodePrereq('init')).toThrow(new ProcessExit(1));
    expect(String(vi.mocked(log.error).mock.calls.at(-1)![0])).toContain(
      'could not read',
    );
  });

  it('exits 1 when the runtime reports no version at all', () => {
    setNodeVersion(undefined);
    expect(() => runNodePrereq('init')).toThrow(new ProcessExit(1));
  });
});

describe('runNodePrereq under --json', () => {
  stubProcessExit();
  afterEach(() => {
    restoreNodeVersion();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('refuses on plain stderr, never through clack, and never writes stdout', () => {
    setNodeVersion('22.0.0');
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const out = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    expect(() => runNodePrereq('update', { json: true })).toThrow(
      new ProcessExit(1),
    );
    expect(log.error).not.toHaveBeenCalled();
    expect(out).not.toHaveBeenCalled();
    const printed = err.mock.calls
      .map((c: unknown[]) => String(c[0]))
      .join('\n');
    expect(printed).toContain('24.2.0');
    expect(printed).toContain('22.0.0');
  });

  it('passes silently on a supported Node', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => runNodePrereq('update', { json: true })).not.toThrow();
    expect(err).not.toHaveBeenCalled();
  });
});
