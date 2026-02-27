/**
 * modules/common/src/utils.ts
 *
 * @file Shared utility helpers.
 */

// ---- Types ----

/**
 * A debounced wrapper around a function. Calls are delayed until no further invocations occur within the configured
 * interval. Only the arguments from the most recent call are forwarded.
 */
export interface DebouncedFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;

  /**
   * Cancel a pending invocation without executing the wrapped function.
   */
  cancel: () => void;

  /**
   * Execute the pending invocation immediately. No-op if nothing is pending.
   */
  flush: () => void;
}

/**
 * A throttled wrapper around a function. The first call fires immediately (leading edge). Subsequent calls during
 * the cooldown period are suppressed, but the most recent one is queued and fires once the cooldown expires
 * (trailing edge).
 */
export interface ThrottledFunction<T extends (...args: any[]) => void> {
  (...args: Parameters<T>): void;

  /**
   * Cancel a pending trailing-edge invocation.
   */
  cancel: () => void;
}

// ---- Functions ----

/**
 * Delay repeated calls until a quiet period has elapsed.
 *
 * Every invocation resets the timer. The wrapped function is called once, after `ms` milliseconds of inactivity,
 * with the arguments from the most recent call. Useful for input handlers, resize events, and similar bursts.
 *
 * @param fn - The function to debounce.
 * @param ms - Quiet period in milliseconds.
 * @returns A debounced wrapper with `.cancel()` and `.flush()` methods.
 */
export function debounce<T extends (...args: any[]) => void>(fn: T, ms: number): DebouncedFunction<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const debounced = (...args: Parameters<T>) => {
    lastArgs = args;
    if (timerId !== undefined) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = undefined;
      const pending = lastArgs!;
      lastArgs = undefined;
      fn(...pending);
    }, ms);
  };

  debounced.cancel = () => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
    lastArgs = undefined;
  };

  debounced.flush = () => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
      const pending = lastArgs!;
      lastArgs = undefined;
      fn(...pending);
    }
  };

  return debounced as DebouncedFunction<T>;
}

/**
 * Pause asynchronous execution for a fixed duration.
 *
 * The returned promise resolves after the given number of milliseconds, making this helper useful for sequencing
 * UI/demo flows and retry backoff without blocking the event loop.
 *
 * @param ms - Duration in milliseconds to wait before resolving.
 * @returns A promise that resolves after the requested delay.
 */
export function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Limit how often a function can fire.
 *
 * The first call executes immediately (leading edge). During the cooldown window, further calls are suppressed but
 * the most recent arguments are remembered. Once the cooldown expires, a trailing-edge call fires with those
 * arguments, starting a new cooldown cycle. Useful for scroll, resize, and similar high-frequency events.
 *
 * @param fn - The function to throttle.
 * @param ms - Minimum interval in milliseconds between executions.
 * @returns A throttled wrapper with a `.cancel()` method.
 */
export function throttle<T extends (...args: any[]) => void>(fn: T, ms: number): ThrottledFunction<T> {
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let lastArgs: Parameters<T> | undefined;

  const throttled = (...args: Parameters<T>) => {
    if (timerId === undefined) {
      fn(...args);
      timerId = setTimeout(() => {
        timerId = undefined;
        if (lastArgs !== undefined) {
          const trailing = lastArgs;
          lastArgs = undefined;
          throttled(...trailing);
        }
      }, ms);
    } else {
      lastArgs = args;
    }
  };

  throttled.cancel = () => {
    if (timerId !== undefined) {
      clearTimeout(timerId);
      timerId = undefined;
    }
    lastArgs = undefined;
  };

  return throttled as ThrottledFunction<T>;
}
