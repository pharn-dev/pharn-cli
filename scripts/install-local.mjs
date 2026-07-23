import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pharnRoot = resolve(here, '..');

const distSource = resolve(pharnRoot, 'dist');
if (!existsSync(distSource)) {
  console.error(`✗ No build output at ${distSource}. Run \`npm run build\` first.`);
  process.exit(1);
}

function discoverTestApps() {
  return readdirSync(pharnRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('test-'))
    .map((d) => resolve(pharnRoot, d.name))
    .filter((root) => existsSync(resolve(root, 'package.json')))
    .sort();
}

function installTo(projectRoot) {
  const installPath = resolve(projectRoot, 'node_modules', 'pharn');
  const binDir = resolve(projectRoot, 'node_modules', '.bin');
  const binPath = resolve(binDir, 'pharn');
  const entry = resolve(installPath, 'dist', 'index.js');

  mkdirSync(installPath, { recursive: true });
  cpSync(resolve(pharnRoot, 'package.json'), resolve(installPath, 'package.json'));
  cpSync(distSource, resolve(installPath, 'dist'), { recursive: true });

  mkdirSync(binDir, { recursive: true });
  if (existsSync(binPath)) unlinkSync(binPath);
  symlinkSync(relative(binDir, entry), binPath);
  chmodSync(binPath, 0o755);
}

const testApps = discoverTestApps();
if (testApps.length === 0) {
  console.log('↷ Skipping — no test-*/package.json found');
  process.exit(0);
}

for (const testAppRoot of testApps) {
  installTo(testAppRoot);
  console.log(`✓ pharn ready in ${testAppRoot}`);
}

console.log(
  `Done — ${testApps.length} test app(s). Run \`npx @pharn-dev/pharn init\` from a test app directory.`,
);
