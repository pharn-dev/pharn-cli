import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, vi } from 'vitest';

export class ProcessExit extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`);
    this.name = 'ProcessExit';
  }
}

export function stubProcessExit(): void {
  beforeEach(() => {
    vi.spyOn(process, 'exit').mockImplementation((code) => {
      throw new ProcessExit(code as number | undefined);
    });
  });
}

export function useTmpDir(): { path: () => string } {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'pharn-test-'));
  });
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });
  return { path: () => dir };
}

export const CANCEL = Symbol('clack-cancel');
