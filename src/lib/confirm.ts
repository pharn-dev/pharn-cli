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

/**
 * Like warnAndConfirm, but a "No" is recoverable: returns false instead of
 * exiting so the caller can re-ask. Ctrl+C still cancels the whole run.
 */
export async function confirmWarning(
  warning: string,
  prompt: string,
  initialValue: boolean,
): Promise<boolean> {
  log.warn(warning);
  const result = await confirm({
    message: prompt,
    initialValue,
  });
  if (isCancel(result)) cancelAndExit();
  return result === true;
}
