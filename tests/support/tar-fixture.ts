import { gzipSync } from 'node:zlib';

// A gzipped ustar archive shaped exactly like codeload's: a leading
// pax_global_header, one `pharn-oss-<sha>/` root, then content.
//
// Shared because two callers need it and they run in different processes:
// tests/repo.test.ts stubs `fetch` in-process, and the SIGINT test spawns a real
// child that must produce the same bytes. Duplicating the writer would let the
// two drift, and the child is the one that cannot be debugged interactively.

const BLOCK = 512;

function header(name: string, type: string, size: number): Buffer {
  const block = Buffer.alloc(BLOCK);
  block.write(name, 0, 100, 'latin1');
  block.write('000644 \0', 100, 8, 'latin1');
  block.write('000000 \0', 108, 8, 'latin1');
  block.write('000000 \0', 116, 8, 'latin1');
  block.write(size.toString(8).padStart(11, '0') + ' ', 124, 12, 'latin1');
  block.write('00000000000 ', 136, 12, 'latin1');
  block.write('        ', 148, 8, 'latin1');
  block.write(type, 156, 1, 'latin1');
  block.write('ustar\0', 257, 6, 'latin1');
  block.write('00', 263, 2, 'latin1');
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8, 'latin1');
  return block;
}

function entry(name: string, type: string, data = ''): Buffer {
  const bytes = Buffer.from(data, 'utf8');
  const parts = [header(name, type, bytes.length)];
  if (bytes.length > 0) {
    const padded = Buffer.alloc(Math.ceil(bytes.length / BLOCK) * BLOCK);
    bytes.copy(padded);
    parts.push(padded);
  }
  return Buffer.concat(parts);
}

/** A minimal but structurally real repo tarball, gzipped. */
export function githubArchive(sha: string): Buffer {
  return codeloadArchive(sha, { SKILLS_VERSION: '1.0.0\n' });
}

/**
 * The same codeload shape around a whole tree: `files` maps a repo-relative
 * POSIX path to its UTF-8 content. Each parent directory gets its own entry
 * before its first file, as codeload's archives carry them. Names go into the
 * 100-byte ustar name field with no prefix split, so a path plus the 18-byte
 * `pharn-oss-<sha7>/` root must stay under 100 bytes — refused, not truncated.
 */
export function codeloadArchive(
  sha: string,
  files: Readonly<Record<string, string>>,
): Buffer {
  const root = `pharn-oss-${sha.slice(0, 7)}`;
  const parts = [
    entry('pax_global_header', 'g', `52 comment=${sha}\n`),
    entry(`${root}/`, '5'),
  ];
  const dirs = new Set<string>();
  for (const rel of Object.keys(files).sort()) {
    const segments = rel.split('/');
    for (let i = 1; i < segments.length; i++) {
      const dir = `${root}/${segments.slice(0, i).join('/')}/`;
      if (!dirs.has(dir)) {
        dirs.add(dir);
        parts.push(entry(dir, '5'));
      }
    }
    const name = `${root}/${rel}`;
    if (Buffer.byteLength(name) >= 100) {
      throw new Error(`tar fixture: ${name} does not fit the ustar name field`);
    }
    parts.push(entry(name, '0', files[rel]));
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts));
}
