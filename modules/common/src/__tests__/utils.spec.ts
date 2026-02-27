/**
 * modules/common/src/__tests__/utils.spec.ts
 *
 * @file Tests for shared utility helpers.
 */
import {afterEach, describe, expect, it, vi} from 'vitest';
import {debounce, delay, throttle} from '../utils.js';

// ---- debounce ----

describe('debounce', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should not call the function immediately', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced();
    expect(spy).not.toHaveBeenCalled();
  });

  it('should call the function after the quiet period', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced();
    vi.advanceTimersByTime(100);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('should reset the timer on repeated calls and forward only the last arguments', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('a');
    vi.advanceTimersByTime(80);
    debounced('b');
    vi.advanceTimersByTime(80);
    debounced('c');
    vi.advanceTimersByTime(100);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('c');
  });

  it('cancel() should prevent a pending invocation', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(200);

    expect(spy).not.toHaveBeenCalled();
  });

  it('flush() should execute the pending invocation immediately', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced('x', 'y');
    debounced.flush();

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('x', 'y');

    // Timer should be cleared, no second call
    vi.advanceTimersByTime(200);
    expect(spy).toHaveBeenCalledOnce();
  });

  it('flush() should be a no-op when nothing is pending', () => {
    const spy = vi.fn();
    const debounced = debounce(spy, 100);

    debounced.flush();
    expect(spy).not.toHaveBeenCalled();
  });
});

// ---- delay ----

describe('delay', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve after the requested timeout', async () => {
    vi.useFakeTimers();

    let resolved = false;
    const wait = delay(1000).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(999);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(resolved).toBe(true);

    await wait;
  });
});

// ---- throttle ----

describe('throttle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('should call the function immediately on the first invocation', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('first');
    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('first');
  });

  it('should suppress calls during the cooldown period', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('a');
    throttled('b');
    throttled('c');

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('should fire a trailing-edge call with the latest arguments after cooldown', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('a');
    throttled('b');
    throttled('c');
    vi.advanceTimersByTime(100);

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('c');
  });

  it('should start a new cooldown cycle after the trailing-edge call', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    // Cycle 1: leading
    throttled('a');
    throttled('b');
    vi.advanceTimersByTime(100);
    // Cycle 1: trailing with 'b', starts cycle 2

    throttled('c');
    // 'c' arrives during cycle 2 cooldown, queued
    vi.advanceTimersByTime(100);
    // Cycle 2: trailing with 'c'

    expect(spy).toHaveBeenCalledTimes(3);
    expect(spy.mock.calls).toEqual([['a'], ['b'], ['c']]);
  });

  it('should not fire a trailing call if no calls arrived during cooldown', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('only');
    vi.advanceTimersByTime(100);

    expect(spy).toHaveBeenCalledOnce();
  });

  it('cancel() should prevent the pending trailing-edge call', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('a');
    throttled('b');
    throttled.cancel();
    vi.advanceTimersByTime(200);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledWith('a');
  });

  it('should allow new calls after cancel()', () => {
    vi.useFakeTimers();
    const spy = vi.fn();
    const throttled = throttle(spy, 100);

    throttled('a');
    throttled.cancel();
    throttled('b');

    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('b');
  });
});
