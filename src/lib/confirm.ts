import { log } from '@clack/prompts';

export function cancelAndExit(
  message = 'Cancelled. Nothing was changed.',
): never {
  log.info(message);
  process.exit(0);
}
