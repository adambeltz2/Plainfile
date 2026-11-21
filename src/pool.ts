/** Thrown when a long task is cancelled. */
export class AbortedError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'AbortError';
  }
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new AbortedError();
}

/**
 * Run `fn` over every item with at most `limit` running at once. Reading files one at a time is
 * slow on a phone, where each file costs a round trip, so a handful at a time is much faster.
 * Stops early, and throws AbortedError, if `signal` is aborted.
 */
export async function mapPool<T>(items: readonly T[], limit: number, fn: (item: T, i: number) => Promise<void>, signal?: AbortSignal): Promise<void> {
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      throwIfAborted(signal);
      const i = next++;
      await fn(items[i] as T, i);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  throwIfAborted(signal);
}
