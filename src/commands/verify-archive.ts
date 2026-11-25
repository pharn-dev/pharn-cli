import { existsSync } from 'node:fs';
import { basename } from 'node:path';
import { intro, log, outro } from '@clack/prompts';
import pc from '../lib/color.js';
import { readBoundedFile } from '../lib/bounded-read.js';
import { CliError } from '../lib/cli-error.js';
import { MIN_CLI_FILE, SKILLS_VERSION_FILE } from '../lib/constants.js';
import { MAX_ARCHIVE_BYTES, verifyLocalArchive } from '../lib/repo.js';
import {
  assertSkillsVersion,
  readMinCli,
  readSkillsVersion,
} from '../lib/skills-version.js';
import { TarExtractError } from '../lib/tar-extract.js';
import { escapeUnsafe } from '../lib/terminal-safe.js';
import { unknownCapabilitiesWarning } from '../lib/unknown-capabilities.js';
import {
  MANIFEST_FILE,
  manifestCapabilityIndex,
} from '../lib/upstream-manifest.js';
import type { UpstreamManifest } from '../lib/upstream-manifest.js';
import { ManifestValidationError, safeJoin } from '../lib/validate.js';

// `pharn verify-archive <file.tar.gz>`: the install path's own checks over a
// LOCAL pharn-oss archive, so pharn-oss CI can prove a commit installs before
// it is tagged. The same `extractPharnArchive` a download goes through (both
// passes, the manifest's one parser, every listed sha256), plus the two pure
// reads an install makes of the tree: MIN_CLI (validity only) and the
// capability index. No network, no project, no lock; the only write is the
// temp tree `verifyLocalArchive` (lib/repo.ts) creates and always removes.

export interface VerifyArchiveOptions {
  file: string;
  expectVersion: string | undefined;
}

/** What the checks found, read while the tree still exists. */
interface Found {
  skillsVersion: string;
  minCli: string | null;
}

// The pinned CI line, named in the rootless refusal and the docs.
const ARCHIVE_COMMAND =
  'git archive --prefix=pharn-oss/ --format=tar.gz -o pharn-oss.tar.gz HEAD';
const ROOTLESS = 'tar entry has no path below the archive root';
const ROOTLESS_HINT = `pharn reads archives shaped like GitHub's, with one top-level directory (as \`git archive --prefix=\` writes); a plain \`git archive\` has none. Re-create it with \`${ARCHIVE_COMMAND}\`.`;

export async function runVerifyArchive(
  opts: VerifyArchiveOptions,
): Promise<void> {
  // The path is user input: escaped value by value wherever it is printed.
  const shown = escapeUnsafe(opts.file);
  const name = escapeUnsafe(basename(opts.file));
  const archive = readArchive(opts.file, shown);

  intro('pharn verify-archive');
  const found: Found = { skillsVersion: '', minCli: null };
  let manifest: UpstreamManifest;
  try {
    manifest = await verifyLocalArchive(archive, (tree) => {
      checkTree(tree, opts.expectVersion, found);
    });
  } catch (err) {
    if (
      err instanceof TarExtractError ||
      err instanceof ManifestValidationError
    ) {
      // A plain `git archive` puts SKILLS_VERSION and the manifest at the top
      // level, and the extractor refuses a selected path with no root above
      // it. That refusal is named by its message (the extractor's own text,
      // pinned by the rootless case in this command's suite).
      const hint =
        err instanceof TarExtractError && err.message.startsWith(ROOTLESS)
          ? ` ${ROOTLESS_HINT}`
          : '';
      throw CliError.failure(err, {
        message: `Archive ${name} refused: ${err.message}${hint}`,
      });
    }
    throw CliError.failure(err);
  }

  // The index an install builds from the manifest. A capability whose
  // `applies` this CLI cannot read is skipped by an install with a warning,
  // so it warns here and still passes.
  const index = manifestCapabilityIndex(manifest);
  const skipped = unknownCapabilitiesWarning(index.unknown);
  if (skipped) log.warn(skipped);

  const version =
    opts.expectVersion === undefined
      ? `${SKILLS_VERSION_FILE} ${found.skillsVersion}`
      : `${SKILLS_VERSION_FILE} ${found.skillsVersion}, as expected`;
  const minCli = found.minCli === null ? 'none' : found.minCli;
  log.success(
    `${name}: ${manifest.files.length} files listed in ${MANIFEST_FILE}, all present and matching their sha256; ${index.capabilities.length} capabilities; ${version}; ${MIN_CLI_FILE} ${minCli}.`,
  );
  outro(pc.dim('Nothing was installed; the temporary directory was removed.'));
}

/** The archive's bytes, bounded: a regular file within the download cap. */
function readArchive(file: string, shown: string): Buffer {
  const read = readBoundedFile(file, MAX_ARCHIVE_BYTES);
  if (read.kind === 'absent') {
    throw CliError.error(`Cannot verify ${shown}: it does not exist.`);
  }
  if (read.kind === 'unusable') {
    throw CliError.error(`Cannot verify ${shown}: it ${read.reason}.`);
  }
  if (read.bytes.length === 0) {
    throw CliError.error(`Cannot verify ${shown}: it is empty.`);
  }
  return read.bytes;
}

/**
 * Run after the first pass, which wrote only the files the CLI reads itself:
 * the manifest must be there (else the archive has no single top-level
 * directory, or predates the manifest), then the optional version check, then
 * MIN_CLI's validity.
 */
function checkTree(
  tree: string,
  expectVersion: string | undefined,
  found: Found,
): void {
  if (!existsSync(safeJoin(tree, MANIFEST_FILE))) {
    throw new ManifestValidationError(
      `it holds no ${MANIFEST_FILE} under a single top-level directory. ${ROOTLESS_HINT} A pharn-oss older than 7.21.0 ships no ${MANIFEST_FILE} at all.`,
    );
  }
  if (expectVersion !== undefined) {
    assertSkillsVersion(
      tree,
      expectVersion,
      (v) =>
        `it ships ${SKILLS_VERSION_FILE} ${escapeUnsafe(v)}, not ${expectVersion} (--expect-version).`,
    );
  }
  found.skillsVersion = readSkillsVersion(tree);
  // Stricter than an install, which warns and carries on: for a release, a
  // MIN_CLI no pharn can read is a packaging bug.
  const minCli = readMinCli(tree);
  if (minCli.warning !== null) {
    throw new ManifestValidationError(
      `its ${MIN_CLI_FILE} is present but unusable; an install would warn: ${minCli.warning}`,
    );
  }
  found.minCli = minCli.version;
}
