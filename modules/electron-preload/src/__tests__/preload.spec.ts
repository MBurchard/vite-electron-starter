/**
 * modules/electron-preload/src/__tests__/preload.spec.ts
 *
 * @file Tests for the preload bridge covering window ID injection, invoke/send argument forwarding,
 * on/off listener management via WeakMap, once without WeakMap, convenience wrappers, and the WindowAPI.
 */
// @vitest-environment jsdom
/// <reference lib="dom" />
import type {Backend} from '../preload.js';
import {CoreIpcChannels} from '@common/core/ipc.js';
import {afterAll, afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const TEST_WINDOW_ID = 'test-window-abc-123';

// ---- Hoisted mocks ----

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeListener: vi.fn(),
  send: vi.fn(),
  exposeInMainWorld: vi.fn(),
  debug: vi.fn(),
}));

const resizeObserverCtrl = vi.hoisted(() => {
  type Callback = (...args: any[]) => void;
  const instances: Array<{callback: Callback; targets: Set<Element>}> = [];

  class MockResizeObserver {
    callback: Callback;
    targets = new Set<Element>();

    constructor(callback: Callback) {
      this.callback = callback;
      instances.push(this);
    }

    observe(target: Element) {
      this.targets.add(target);
    }

    disconnect() {
      this.targets.clear();
      const idx = instances.indexOf(this);
      if (idx !== -1) {
        instances.splice(idx, 1);
      }
    }

    unobserve(target: Element) {
      this.targets.delete(target);
    }
  }

  return {
    MockResizeObserver,
    instances,
    /**
     * Simulate a resize on all active observers.
     */
    trigger: () => {
      for (const inst of instances) {
        if (inst.targets.size > 0) {
          inst.callback([], inst);
        }
      }
    },
  };
});

globalThis.ResizeObserver = resizeObserverCtrl.MockResizeObserver as any;

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: mocks.exposeInMainWorld,
  },
  ipcRenderer: {
    invoke: mocks.invoke,
    on: mocks.on,
    once: mocks.once,
    removeListener: mocks.removeListener,
    send: mocks.send,
  },
}));

// noinspection JSUnusedGlobalSymbols
vi.mock('@mburchard/bit-log', () => ({
  configureLogging: vi.fn(),
  useLog: () => ({debug: mocks.debug}),
}));

vi.mock('@mburchard/bit-log/appender/ConsoleAppender', () => ({
  ConsoleAppender: class {},
}));

vi.mock('@common/logging/BackendForwardingAppender.js', () => ({
  createBoundAppenderClass: () => class {},
}));

// ---- Module import (triggers side effects) ----

process.argv.push(`--window-id?${TEST_WINDOW_ID}`, '--auto-resize');
await import('../preload.js');

/**
 * Retrieve the backend object captured from the contextBridge.exposeInMainWorld call.
 *
 * @returns The Backend instance that the preload script exposed.
 */
function getCapturedBackend(): Backend {
  const call = mocks.exposeInMainWorld.mock.calls.find(
    (args: any[]) => args[0] === 'backend',
  );
  if (!call) {
    throw new Error('contextBridge.exposeInMainWorld was not called with "backend"');
  }
  return call[1] as Backend;
}

const backend = getCapturedBackend();

afterAll(() => {
  for (const arg of [`--window-id?${TEST_WINDOW_ID}`, '--auto-resize']) {
    const idx = process.argv.indexOf(arg);
    if (idx !== -1) {
      process.argv.splice(idx, 1);
    }
  }
});

// ---- Tests ----

describe('preload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ---- contextBridge ----

  describe('contextBridge', () => {
    it('should expose the backend object as "backend"', () => {
      expect(backend).toBeDefined();
      expect(typeof backend.invoke).toBe('function');
      expect(typeof backend.send).toBe('function');
      expect(typeof backend.on).toBe('function');
      expect(typeof backend.once).toBe('function');
      expect(typeof backend.off).toBe('function');
      expect(typeof backend.forwardLogEvent).toBe('function');
      expect(typeof backend.getVersions).toBe('function');
      expect(backend.window).toBeDefined();
    });
  });

  // ---- invoke ----

  describe('invoke', () => {
    it('should call ipcRenderer.invoke with windowId prepended', async () => {
      mocks.invoke.mockResolvedValue('result');
      const result = await backend.invoke('getVersions', 'arg1', 'arg2');
      expect(mocks.invoke).toHaveBeenCalledWith('getVersions', TEST_WINDOW_ID, 'arg1', 'arg2');
      expect(result).toBe('result');
    });

    it('should forward the resolved value from ipcRenderer.invoke', async () => {
      const versions = {chrome: '1', electron: '2', node: '3'};
      mocks.invoke.mockResolvedValue(versions);
      const result = await backend.invoke('getVersions');
      expect(result).toEqual(versions);
    });
  });

  // ---- send ----

  describe('send', () => {
    it('should call ipcRenderer.send with windowId prepended', () => {
      backend.send('showDisplayDemo');
      expect(mocks.send).toHaveBeenCalledWith('showDisplayDemo', TEST_WINDOW_ID);
    });

    it('should forward additional arguments after the windowId', () => {
      backend.send('someChannel', 'payload1', 42);
      expect(mocks.send).toHaveBeenCalledWith('someChannel', TEST_WINDOW_ID, 'payload1', 42);
    });
  });

  // ---- on / off ----

  describe('on / off', () => {
    it('should register a wrapped listener via ipcRenderer.on', () => {
      const callback = vi.fn();
      backend.on('updateDisplayData', callback);
      expect(mocks.on).toHaveBeenCalledWith('updateDisplayData', expect.any(Function));
    });

    it('should strip the IpcRendererEvent and forward only the remaining args', () => {
      const callback = vi.fn();
      backend.on('updateDisplayData', callback);

      const wrapper = mocks.on.mock.calls[0][1];
      wrapper({/* IpcRendererEvent */}, 'data1', 'data2');

      expect(callback).toHaveBeenCalledOnce();
      expect(callback).toHaveBeenCalledWith('data1', 'data2');
    });

    it('should remove the correct wrapper via off using the WeakMap', () => {
      const callback = vi.fn();
      backend.on('testChannel', callback);

      const registeredWrapper = mocks.on.mock.calls[0][1];

      backend.off('testChannel', callback);
      expect(mocks.removeListener).toHaveBeenCalledWith('testChannel', registeredWrapper);
    });

    it('should not call removeListener when off is called for an unregistered channel', () => {
      const callback = vi.fn();
      backend.off('unknownChannel', callback);
      expect(mocks.removeListener).not.toHaveBeenCalled();
    });

    it('should not call removeListener when off is called with a different callback', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      backend.on('testChannel', callback1);

      backend.off('testChannel', callback2);
      expect(mocks.removeListener).not.toHaveBeenCalled();
    });
  });

  // ---- once ----

  describe('once', () => {
    it('should register a wrapped listener via ipcRenderer.once', () => {
      const callback = vi.fn();
      backend.once('someEvent', callback);
      expect(mocks.once).toHaveBeenCalledWith('someEvent', expect.any(Function));
    });

    it('should strip the IpcRendererEvent and forward args to the callback', () => {
      const callback = vi.fn();
      backend.once('someEvent', callback);

      const wrapper = mocks.once.mock.calls[0][1];
      wrapper({}, 'payload');

      expect(callback).toHaveBeenCalledWith('payload');
    });

    it('should not add the listener to the WeakMap (no off needed)', () => {
      const callback = vi.fn();
      backend.once('someEvent', callback);

      // Attempting off should not find anything to remove
      backend.off('someEvent', callback);
      expect(mocks.removeListener).not.toHaveBeenCalled();
    });
  });

  // ---- Convenience wrappers ----

  describe('forwardLogEvent', () => {
    it('should send the log event on the frontendLogging channel', () => {
      const logEvent = {level: 'INFO', loggerName: 'test', payload: ['hello'], timestamp: new Date()};
      backend.forwardLogEvent(logEvent as any);
      expect(mocks.send).toHaveBeenCalledWith('frontendLogging', TEST_WINDOW_ID, logEvent);
    });
  });

  describe('getVersions', () => {
    it('should invoke the getVersions channel', async () => {
      const versions = {chrome: '120', electron: '28', node: '20'};
      mocks.invoke.mockResolvedValue(versions);
      const result = await backend.getVersions();
      expect(mocks.invoke).toHaveBeenCalledWith('getVersions', TEST_WINDOW_ID);
      expect(result).toEqual(versions);
    });
  });

  // ---- WindowAPI ----

  describe('backend.window', () => {
    it('should have all expected methods', () => {
      const win = backend.window;
      expect(typeof win.reportContentSize).toBe('function');
      expect(typeof win.enableAutoResize).toBe('function');
      expect(typeof win.disableAutoResize).toBe('function');
    });

    it('should send rendererContentSizeChanged with width, height and windowId', () => {
      backend.window.reportContentSize(400, 300);
      expect(mocks.send).toHaveBeenCalledWith(CoreIpcChannels.rendererContentSizeChanged, TEST_WINDOW_ID, 400, 300);
    });
  });

  // ---- Auto-Resize Observer ----

  describe('autoResize', () => {
    afterEach(() => {
      backend.window.disableAutoResize();
      vi.useRealTimers();
    });

    it('should start observing on DOMContentLoaded', () => {
      vi.useFakeTimers();

      // jsdom does not auto-fire DOMContentLoaded; the {once:true} listener is still pending
      window.dispatchEvent(new Event('DOMContentLoaded'));

      resizeObserverCtrl.trigger();
      vi.advanceTimersByTime(50);

      expect(mocks.send).toHaveBeenCalledWith(
        CoreIpcChannels.rendererContentSizeChanged,
        TEST_WINDOW_ID,
        document.body.offsetWidth,
        document.body.offsetHeight,
      );
    });

    it('should stop reporting after disableAutoResize()', () => {
      vi.useFakeTimers();
      backend.window.enableAutoResize();
      backend.window.disableAutoResize();

      resizeObserverCtrl.trigger();
      vi.advanceTimersByTime(50);

      expect(mocks.send).not.toHaveBeenCalled();
    });

    it('should resume reporting after enableAutoResize()', () => {
      vi.useFakeTimers();
      backend.window.enableAutoResize();

      resizeObserverCtrl.trigger();
      vi.advanceTimersByTime(50);

      expect(mocks.send).toHaveBeenCalledWith(
        CoreIpcChannels.rendererContentSizeChanged,
        TEST_WINDOW_ID,
        document.body.offsetWidth,
        document.body.offsetHeight,
      );
    });

    it('enableAutoResize() should be idempotent', () => {
      backend.window.enableAutoResize();
      backend.window.enableAutoResize();
      expect(resizeObserverCtrl.instances).toHaveLength(1);
    });

    it('disableAutoResize() should be idempotent', () => {
      backend.window.disableAutoResize();
      backend.window.disableAutoResize();
      expect(resizeObserverCtrl.instances).toHaveLength(0);
    });
  });
});
