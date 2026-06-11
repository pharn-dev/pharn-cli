import { createRequire } from 'node:module';
import pc from 'picocolors';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

const LOGO = [
  '██████╗ ██╗  ██╗ █████╗ ██████╗ ███╗   ██╗',
  '██╔══██╗██║  ██║██╔══██╗██╔══██╗████╗  ██║',
  '██████╔╝███████║███████║██████╔╝██╔██╗ ██║',
  '██╔═══╝ ██╔══██║██╔══██║██╔══██╗██║╚██╗██║',
  '██║     ██║  ██║██║  ██║██║  ██║██║ ╚████║',
  '╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝',
];

export function showBanner(): void {
  console.log();
  for (const line of LOGO) {
    console.log(`  ${pc.cyan(pc.bold(line))}`);
  }
  console.log();
  console.log(
    `  ${pc.dim(`Audit-grade methodology for Claude Code · v${pkg.version}`)}`,
  );
  console.log();
}
