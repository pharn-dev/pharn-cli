import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pharnRoot = resolve(here, '..');
const testAppRoot = resolve(pharnRoot, 'test-app');
const testAppPkg = resolve(testAppRoot, 'package.json');

if (!existsSync(testAppPkg)) {
  console.log(`↷ Skipping — no package.json at ${testAppRoot}`);
  process.exit(0);
}

const distSource = resolve(pharnRoot, 'dist');
if (!existsSync(distSource)) {
  console.error(`✗ No build output at ${distSource}. Run \`npm run build\` first.`);
  process.exit(1);
}

const installPath = resolve(testAppRoot, 'node_modules', 'pharn');
const binDir = resolve(testAppRoot, 'node_modules', '.bin');
const binPath = resolve(binDir, 'pharn');
const entry = resolve(installPath, 'dist', 'index.js');

mkdirSync(installPath, { recursive: true });
cpSync(resolve(pharnRoot, 'package.json'), resolve(installPath, 'package.json'));
cpSync(distSource, resolve(installPath, 'dist'), { recursive: true });

mkdirSync(binDir, { recursive: true });
if (existsSync(binPath)) unlinkSync(binPath);
symlinkSync(relative(binDir, entry), binPath);
chmodSync(binPath, 0o755);

console.log(`✓ pharn ready. Run \`npx pharn init\` from ${testAppRoot}.`);