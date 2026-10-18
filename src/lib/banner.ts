import pc from './color.js';
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
    `  ${pc.dim(`Ship features right with Claude Code · v${PHARN_VERSION}`)}`,
  );
  console.log();
}
