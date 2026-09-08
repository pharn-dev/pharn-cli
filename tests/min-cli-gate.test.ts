import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTmpDir } from './helpers.js';
import { minCliGate } from '../src/lib/min-cli-gate.js';

// ---------------------------------------------------------------------------
// The MIN_CLI handshake, end to end over a real clone directory.
//
// The asymmetry with readSkillsVersion is the whole point and is pinned here:
// SKILLS_VERSION is REQUIRED, so a missing/garbage one is an upstream packaging
// bug worth a hard failure. MIN_CLI is OPTIONAL, so "no constraint" is already a
// legal state — and a throw would become exit(1) in init/add/update, meaning one
// upstream typo in a one-line file would brick every released CLI at once. That
// is the exact outage this file exists to prevent, so it must never be re-entered
// through the lever meant to prevent it.
//
// ONLY a well-formed value with a strictly greater numeric core ever refuses.
// ---------------------------------------------------------------------------

function writeMinCli(repo: string, body: string): void {
  writeFileSync(join(repo, 'MIN_CLI'), body);
}

describe('minCliGate', () => {
  const tmp = useTmpDir();

  it('no MIN_CLI file -> no constraint, no warning (today upstream ships none)', () => {
    expect(minCliGate(tmp.path(), '0.4.0')).toEqual({
      refusal: null,
      warning: null,
    });
  });

  it('a satisfied requirement passes silently', () => {
    writeMinCli(tmp.path(), '0.3.0\n');
    expect(minCliGate(tmp.path(), '0.4.0')).toEqual({
      refusal: null,
      warning: null,
    });
  });

  it('an exactly-equal requirement passes (only GREATER refuses)', () => {
    writeMinCli(tmp.path(), '0.4.0\n');
    expect(minCliGate(tmp.path(), '0.4.0').refusal).toBeNull();
  });

  it('refuses when upstream requires a newer CLI, naming both versions and the fix', () => {
    writeMinCli(tmp.path(), '0.9.0\n');
    const { refusal, warning } = minCliGate(tmp.path(), '0.4.0');
    expect(warning).toBeNull();
    expect(refusal).toContain('0.9.0');
    expect(refusal).toContain('0.4.0');
    expect(refusal).toContain('@pharn-dev/pharn');
  });

  it('compares numerically, not lexically (0.10.0 requires more than 0.9.0)', () => {
    writeMinCli(tmp.path(), '0.10.0\n');
    expect(minCliGate(tmp.path(), '0.9.0').refusal).not.toBeNull();
    expect(minCliGate(tmp.path(), '0.10.0').refusal).toBeNull();
  });

  it('treats a prerelease as equal to its release - refuses in NEITHER direction', () => {
    writeMinCli(tmp.path(), '1.2.3\n');
    expect(minCliGate(tmp.path(), '1.2.3-rc.1').refusal).toBeNull();
    writeMinCli(tmp.path(), '1.2.3-rc.1\n');
    expect(minCliGate(tmp.path(), '1.2.3').refusal).toBeNull();
  });

  it('a MALFORMED MIN_CLI is no constraint plus a named warning - NEVER a refusal', () => {
    writeMinCli(tmp.path(), 'not a version\n');
    const { refusal, warning } = minCliGate(tmp.path(), '0.4.0');
    expect(refusal).toBeNull();
    expect(warning).not.toBeNull();
    expect(warning).toContain('MIN_CLI');
  });

  it('an EMPTY MIN_CLI is no constraint plus a warning', () => {
    writeMinCli(tmp.path(), '\n');
    const { refusal, warning } = minCliGate(tmp.path(), '0.4.0');
    expect(refusal).toBeNull();
    expect(warning).not.toBeNull();
  });

  it('an UNREADABLE MIN_CLI (a directory at the path) is no constraint plus a warning', () => {
    mkdirSync(join(tmp.path(), 'MIN_CLI'), { recursive: true });
    const { refusal, warning } = minCliGate(tmp.path(), '0.4.0');
    expect(refusal).toBeNull();
    expect(warning).not.toBeNull();
  });

  it('an unparseable INSTALLED version is no constraint plus a warning, never a refusal', () => {
    writeMinCli(tmp.path(), '9.9.9\n');
    const { refusal, warning } = minCliGate(tmp.path(), 'garbage');
    expect(refusal).toBeNull();
    expect(warning).not.toBeNull();
  });

  it('never lets an untrusted MIN_CLI value reach the message unvalidated (P2)', () => {
    // VERSION_RE-gated before any compare or interpolation, so a hostile body is
    // rejected as not-a-version and its bytes never appear in a refusal.
    writeMinCli(tmp.path(), '99.0.0; rm -rf /\n');
    const { refusal, warning } = minCliGate(tmp.path(), '0.4.0');
    expect(refusal).toBeNull();
    expect(warning).not.toContain('rm -rf');
  });

  it('is deterministic - the same clone yields the same outcome (P5)', () => {
    writeMinCli(tmp.path(), '0.9.0\n');
    expect(minCliGate(tmp.path(), '0.4.0')).toEqual(
      minCliGate(tmp.path(), '0.4.0'),
    );
  });
});
