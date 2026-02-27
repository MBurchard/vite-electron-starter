/**
 * modules/electron/src/__tests__/ipc.spec.ts
 *
 * @file Tests for IPC helper functions with focus on removeHandler and sendToRenderer.
 */
import {beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
  on: vi.fn(),
  once: vi.fn(),
  removeHandler: vi.fn(),
  removeListener: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: mocks.handle,
    on: mocks.on,
    once: mocks.once,
    removeHandler: mocks.removeHandler,
    removeListener: mocks.removeListener,
  },
}));

vi.mock('../logging/index.js', () => ({
  getLogger: () => ({
    warn: mocks.warn,
  }),
}));

const ipcModule = await import('../ipc.js');
const {handleFromRenderer, registerWindow, removeHandler, sendToRenderer} = ipcModule;

/**
 * Create a mock BrowserWindow with controllable destroyed state and event listener support.
 *
 * @param options - Optional overrides for the mock window behaviour.
 * @param options.destroyed - Whether the mock window reports itself as destroyed (default: false).
 * @returns A mock object satisfying the BrowserWindow shape used by the IPC module.
 */
function createMockWindow(options?: {destroyed?: boolean}) {
  const closedListeners = new Set<() => void>();
  const webContentsSend = vi.fn();
  const destroyed = options?.destroyed ?? false;

  return {
    isDestroyed: vi.fn(() => destroyed),
    on: vi.fn((event: string, listener: () => void) => {
      if (event === 'closed') {
        closedListeners.add(listener);
      }
    }),
    webContents: {
      send: webContentsSend,
    },
    _emitClosed: () => {
      closedListeners.forEach(listener => listener());
    },
    _webContentsSend: webContentsSend,
  };
}

describe('ipc helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('removeHandler', () => {
    it('should call ipcMain.removeHandler for the given channel', () => {
      const channel = 'test-channel';
      handleFromRenderer(channel, () => 'ok');

      removeHandler(channel);

      expect(mocks.removeHandler).toHaveBeenCalledWith(channel);
    });

    it('should still call ipcMain.removeHandler even when no handler was registered', () => {
      removeHandler('unknown-channel');

      expect(mocks.removeHandler).toHaveBeenCalledWith('unknown-channel');
    });
  });

  describe('sendToRenderer', () => {
    it('should send to webContents when the target window exists and is not destroyed', () => {
      const win = createMockWindow();
      registerWindow('w1', win as any);

      sendToRenderer('w1', 'progress', 50, 'percent');

      expect(win._webContentsSend).toHaveBeenCalledWith('progress', 50, 'percent');
    });

    it('should warn and not send when no target window is registered', () => {
      sendToRenderer('missing', 'progress', 50);

      expect(mocks.warn).toHaveBeenCalledWith('sendToRenderer: no window found for windowId \'missing\'');
    });

    it('should not send when the target window is destroyed', () => {
      const win = createMockWindow({destroyed: true});
      registerWindow('w2', win as any);

      sendToRenderer('w2', 'progress', 10);

      expect(win._webContentsSend).not.toHaveBeenCalled();
    });

    it('should not send after the registered window emitted closed', () => {
      const win = createMockWindow();
      registerWindow('w3', win as any);
      win._emitClosed();

      sendToRenderer('w3', 'progress', 99);

      expect(mocks.warn).toHaveBeenCalledWith('sendToRenderer: no window found for windowId \'w3\'');
      expect(win._webContentsSend).not.toHaveBeenCalled();
    });
  });
});
