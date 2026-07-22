import pc from 'picocolors';
import { PHARN_VERSION } from '../version.js';

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
    `  ${pc.dim(`Audit-grade methodology for Claude Code · v${PHARN_VERSION}`)}`,
  );
  console.log();
}
