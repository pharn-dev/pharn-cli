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
  const root = `pharn-oss-${sha.slice(0, 7)}`;
  return gzipSync(
    Buffer.concat([
      entry('pax_global_header', 'g', `52 comment=${sha}\n`),
      entry(`${root}/`, '5'),
      entry(`${root}/SKILLS_VERSION`, '0', '1.0.0\n'),
      Buffer.alloc(BLOCK * 2),
    ]),
  );
}
