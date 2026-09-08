import { confirm, isCancel, log } from '@clack/prompts';

export function cancelAndExit(
  message = 'Cancelled. Nothing was changed.',
): never {
  log.info(message);
  process.exit(0);
}

export async function warnAndConfirm(
  warning: string,
  prompt: string,
  initialValue: boolean,
): Promise<void> {
  log.warn(warning);
  const result = await confirm({
    message: prompt,
    initialValue,
  });
  if (isCancel(result) || result !== true) {
    cancelAndExit();
  }
}
