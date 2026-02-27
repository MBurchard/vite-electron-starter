/**
 * modules/electron/src/windowMgt/dialog/__tests__/DialogService.spec.ts
 *
 * @file Tests for DialogService covering lifecycle flow, hook invocations, idempotency, error scenarios,
 * button behaviour, programmatic close, setDialogMessage, and convenience functions.
 */
import type {DialogConfig} from '@common/dialog/types.js';
import {beforeEach, describe, expect, it, vi} from 'vitest';

// ---- Hoisted mocks ----

const mocks = vi.hoisted(() => {
  let uuidCounter = 0;

  return {
    // uuid
    uuidCounter: () => uuidCounter,
    resetUuidCounter: () => {
      uuidCounter = 0;
    },
    uuidv4: vi.fn(() => `test-uuid-${++uuidCounter}`),

    // IPC
    sendToRenderer: vi.fn(),

    // Logger
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),

    // WindowManager
    createWindow: vi.fn(),

    // DialogIpc
    setupDialogHandlers: vi.fn(),
  };
});

vi.mock('uuid', () => ({
  v4: mocks.uuidv4,
}));

vi.mock('../../../ipc.js', () => ({
  sendToRenderer: mocks.sendToRenderer,
}));

vi.mock('../../../logging/index.js', () => ({
  getLogger: () => ({
    debug: mocks.debug,
    error: mocks.error,
    warn: mocks.warn,
  }),
}));

vi.mock('../../WindowManager.js', () => ({
  createWindow: mocks.createWindow,
}));

vi.mock('../DialogIpc.js', () => ({
  setupDialogHandlers: mocks.setupDialogHandlers,
}));

// ---- Module import (after mocks) ----

const {
  handleDialogAction,
  handleDialogDismissed,
  markDialogOpened,
  markDialogShown,
  openDialogWindow,
  setDialogMessage,
  showError,
  showInfo,
  showSuccess,
  showWarning,
} = await import('../DialogService.js');

// ---- Test helpers ----

/**
 * Create a mock WindowController with a mock BrowserWindow and externally resolvable whenWindowReady.
 *
 * @returns Mock controller with helpers for resolving/rejecting readiness and emitting window events.
 */
function createMockController() {
  const listeners = new Map<string, Set<(...args: any[]) => void>>();
  let readyResolve: () => void;
  let readyReject: (reason: unknown) => void;

  const whenWindowReady = new Promise<void>((resolve, reject) => {
    readyResolve = resolve;
    readyReject = reject;
  });

  const browserWindow = {
    on: vi.fn((event: string, cb: (...args: any[]) => void) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)!.add(cb);
    }),
    close: vi.fn(),
    isDestroyed: vi.fn(() => false),
    _emit(event: string, ...args: any[]) {
      listeners.get(event)?.forEach(cb => cb(...args));
    },
    _listeners: listeners,
  };

  return {
    browserWindow,
    whenWindowReady,
    resolveReady: () => readyResolve(),
    rejectReady: (reason: unknown) => readyReject(reason),
  };
}

/**
 * Build a minimal DialogConfig for testing.
 *
 * @param overrides - Optional partial config to merge.
 * @returns A complete DialogConfig.
 */
function makeConfig(overrides: Partial<DialogConfig> = {}): DialogConfig {
  return {
    title: 'Test Dialog',
    buttons: [{id: 'ok', label: 'OK', variant: 'primary'}],
    ...overrides,
  };
}

/**
 * Set up the createWindow mock to return the given controller.
 *
 * @param controller - Mock controller from createMockController().
 */
function setupCreateWindow(controller: ReturnType<typeof createMockController>) {
  mocks.createWindow.mockReturnValue(controller);
}

// ---- Tests ----

describe('dialogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resetUuidCounter();
  });

  // ---- openDialogWindow (Happy Path) ----

  describe('openDialogWindow', () => {
    it('should call createWindow with pack:true, contentPage:dialog, and adjusted width', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      openDialogWindow(makeConfig({width: 400}));

      expect(mocks.createWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          contentPage: 'dialog',
          pack: true,
          windowOptions: expect.objectContaining({
            width: 404,
          }),
        }),
      );
    });

    it('should use default width of 500 (+4px) when config.width is undefined', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      openDialogWindow(makeConfig());

      expect(mocks.createWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          windowOptions: expect.objectContaining({
            width: 504,
          }),
        }),
      );
    });

    it('should send initDialog via IPC after whenWindowReady resolves', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const config = makeConfig();

      openDialogWindow(config);
      controller.resolveReady();

      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalledWith(
          'dialog-test-uuid-1',
          'initDialog',
          config,
        );
      });
    });

    it('should return a handle with dialogId, whenOpened, whenShown, result, and close', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());

      expect(handle.dialogId).toBe('dialog-test-uuid-1');
      expect(handle.whenOpened).toBeInstanceOf(Promise);
      expect(handle.whenShown).toBeInstanceOf(Promise);
      expect(handle.result).toBeInstanceOf(Promise);
      expect(typeof handle.close).toBe('function');
    });

    it('should call setupDialogHandlers on each invocation', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      openDialogWindow(makeConfig());

      expect(mocks.setupDialogHandlers).toHaveBeenCalledOnce();
    });

    it('should pass placement and withDevTools through to createWindow', () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const placement = {horizontal: 'center' as const, top: '30%' as const};

      openDialogWindow(makeConfig({placement}), undefined, {withDevTools: true});

      expect(mocks.createWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          placement,
          withDevTools: true,
        }),
      );
    });
  });

  // ---- Lifecycle Flow ----

  describe('lifecycle flow', () => {
    it('should resolve whenOpened and call onOpened hook on markDialogOpened', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onOpened = vi.fn();

      const handle = openDialogWindow(makeConfig(), {onOpened});
      markDialogOpened(handle.dialogId);

      const event = await handle.whenOpened;
      expect(event).toEqual(expect.objectContaining({windowId: handle.dialogId}));
      expect(onOpened).toHaveBeenCalledWith(expect.objectContaining({windowId: handle.dialogId}));
    });

    it('should resolve whenShown and call onShown hook on markDialogShown', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onShown = vi.fn();

      const handle = openDialogWindow(makeConfig(), {onShown});
      markDialogShown(handle.dialogId);

      const event = await handle.whenShown;
      expect(event).toEqual(expect.objectContaining({windowId: handle.dialogId}));
      expect(onShown).toHaveBeenCalledWith(expect.objectContaining({windowId: handle.dialogId}));
    });

    it('should resolve result with source:button on handleDialogAction', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      handleDialogAction(handle.dialogId, 'ok');

      const result = await handle.result;
      expect(result).toEqual(expect.objectContaining({
        source: 'button',
        buttonId: 'ok',
        windowId: handle.dialogId,
      }));
    });

    it('should resolve result with source:esc on handleDialogDismissed(esc)', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      handleDialogDismissed(handle.dialogId, 'esc');

      const result = await handle.result;
      expect(result).toEqual(expect.objectContaining({source: 'esc'}));
    });

    it('should resolve result with source:titlebar-x on handleDialogDismissed(titlebar-x)', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      handleDialogDismissed(handle.dialogId, 'titlebar-x');

      const result = await handle.result;
      expect(result).toEqual(expect.objectContaining({source: 'titlebar-x'}));
    });
  });

  // ---- Lifecycle Hooks ----

  describe('lifecycle hooks', () => {
    it('should invoke all four hooks during a full lifecycle', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const hooks = {
        onOpened: vi.fn(),
        onShown: vi.fn(),
        onAction: vi.fn(),
        onClosed: vi.fn(),
      };

      const handle = openDialogWindow(makeConfig(), hooks);
      markDialogOpened(handle.dialogId);
      markDialogShown(handle.dialogId);
      handleDialogAction(handle.dialogId, 'ok');

      await handle.result;

      expect(hooks.onOpened).toHaveBeenCalledOnce();
      expect(hooks.onShown).toHaveBeenCalledOnce();
      expect(hooks.onAction).toHaveBeenCalledOnce();
      expect(hooks.onClosed).toHaveBeenCalledOnce();
    });

    it('should not crash when hooks are not provided', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      markDialogOpened(handle.dialogId);
      markDialogShown(handle.dialogId);
      handleDialogAction(handle.dialogId, 'ok');

      const result = await handle.result;
      expect(result.source).toBe('button');
    });

    it('should pass correct ActionEvent with buttonId and payload to onAction', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onAction = vi.fn();
      const config = makeConfig({
        buttons: [{id: 'save', label: 'Save', variant: 'primary', payload: {draft: true}}],
      });

      const handle = openDialogWindow(config, {onAction});
      handleDialogAction(handle.dialogId, 'save');

      await handle.result;

      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
        buttonId: 'save',
        payload: {draft: true},
        windowId: handle.dialogId,
      }));
    });
  });

  // ---- Idempotency ----

  describe('idempotency', () => {
    it('should only resolve whenOpened once on duplicate markDialogOpened calls', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onOpened = vi.fn();

      const handle = openDialogWindow(makeConfig(), {onOpened});
      markDialogOpened(handle.dialogId);
      markDialogOpened(handle.dialogId);

      await handle.whenOpened;
      expect(onOpened).toHaveBeenCalledOnce();
    });

    it('should only resolve whenShown once on duplicate markDialogShown calls', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onShown = vi.fn();

      const handle = openDialogWindow(makeConfig(), {onShown});
      markDialogShown(handle.dialogId);
      markDialogShown(handle.dialogId);

      await handle.whenShown;
      expect(onShown).toHaveBeenCalledOnce();
    });

    it('should ignore button action after result is already resolved', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onClosed = vi.fn();

      const handle = openDialogWindow(makeConfig(), {onClosed});
      handleDialogAction(handle.dialogId, 'ok');
      handleDialogAction(handle.dialogId, 'ok');

      const result = await handle.result;
      expect(result.source).toBe('button');
      expect(onClosed).toHaveBeenCalledOnce();
    });
  });

  // ---- Error Scenarios ----

  describe('error scenarios', () => {
    it('should resolve result with window-destroyed when createWindow returns undefined', async () => {
      mocks.createWindow.mockReturnValue(undefined);

      const handle = openDialogWindow(makeConfig());
      const result = await handle.result;

      expect(result.source).toBe('window-destroyed');
    });

    it('should resolve result with window-destroyed when whenWindowReady rejects', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      controller.rejectReady(new Error('load failed'));

      const result = await handle.result;
      expect(result.source).toBe('window-destroyed');
    });

    it('should log error when whenWindowReady rejects', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      controller.rejectReady(new Error('load failed'));

      await handle.result;

      await vi.waitFor(() => {
        expect(mocks.error).toHaveBeenCalledWith('Error loading dialogue window', expect.any(Error));
      });
    });

    it('should resolve result with window-destroyed on BrowserWindow closed event', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      controller.browserWindow._emit('closed');

      const result = await handle.result;
      expect(result.source).toBe('window-destroyed');
    });

    it('should warn on unknown buttonId without crashing', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      handleDialogAction(handle.dialogId, 'nonexistent');

      expect(mocks.warn).toHaveBeenCalledWith(expect.stringContaining('nonexistent'));
    });

    it('should not crash on lifecycle calls with unknown windowId', () => {
      expect(() => markDialogOpened('unknown-id')).not.toThrow();
      expect(() => markDialogShown('unknown-id')).not.toThrow();
      expect(() => handleDialogAction('unknown-id', 'ok')).not.toThrow();
      expect(() => handleDialogDismissed('unknown-id', 'esc')).not.toThrow();
    });
  });

  // ---- Button Behaviour ----

  describe('button behaviour', () => {
    it('should keep dialog open when button has closesDialog:false', () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onAction = vi.fn();
      const config = makeConfig({
        buttons: [{id: 'apply', label: 'Apply', closesDialog: false}],
      });

      const handle = openDialogWindow(config, {onAction});
      handleDialogAction(handle.dialogId, 'apply');

      expect(onAction).toHaveBeenCalledOnce();
      expect(controller.browserWindow.close).not.toHaveBeenCalled();
    });

    it('should pass button payload through to the result', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const config = makeConfig({
        buttons: [{id: 'confirm', label: 'Confirm', payload: {confirmed: true}}],
      });

      const handle = openDialogWindow(config);
      handleDialogAction(handle.dialogId, 'confirm');

      const result = await handle.result;
      expect(result.payload).toEqual({confirmed: true});
    });

    it('should let explicit action payload override button default payload', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      const onAction = vi.fn();
      const config = makeConfig({
        buttons: [{id: 'save', label: 'Save', payload: {version: 1}}],
      });

      const handle = openDialogWindow(config, {onAction});
      handleDialogAction(handle.dialogId, 'save', {version: 2});

      const result = await handle.result;
      expect(result.payload).toEqual({version: 2});
      expect(onAction).toHaveBeenCalledWith(expect.objectContaining({payload: {version: 2}}));
    });
  });

  // ---- Programmatic Close ----

  describe('programmatic close', () => {
    it('should close the window and resolve result with source:programmatic', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig());
      await handle.close();

      const result = await handle.result;
      expect(result.source).toBe('programmatic');
      expect(controller.browserWindow.close).toHaveBeenCalledOnce();
    });
  });

  // ---- setDialogMessage ----

  describe('setDialogMessage', () => {
    it('should update config and send IPC with new message', () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const handle = openDialogWindow(makeConfig({message: 'old'}));
      setDialogMessage(handle.dialogId, 'new message');

      expect(mocks.sendToRenderer).toHaveBeenCalledWith(
        handle.dialogId,
        'dialogSetMessage',
        'new message',
      );
    });

    it('should not crash on unknown windowId', () => {
      expect(() => setDialogMessage('unknown-id', 'hello')).not.toThrow();
    });
  });

  // ---- Convenience Functions ----

  describe('convenience functions', () => {
    it('showInfo should open dialog with type:info and OK button', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const promise = showInfo('Info Title', 'Info message');

      expect(mocks.createWindow).toHaveBeenCalledOnce();
      const callArgs = mocks.createWindow.mock.calls[0][0];
      expect(callArgs.contentPage).toBe('dialog');

      // Simulate the dialog lifecycle to completion
      controller.resolveReady();
      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalled();
      });

      const initCall = mocks.sendToRenderer.mock.calls.find(
        (args: any[]) => args[1] === 'initDialog',
      );
      expect(initCall).toBeDefined();
      const sentConfig = initCall![2] as DialogConfig;
      expect(sentConfig.type).toBe('info');
      expect(sentConfig.buttons).toEqual([{id: 'ok', label: 'OK', variant: 'primary'}]);

      // Close the dialog so the convenience function resolves
      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogAction(dialogId, 'ok');

      await promise;
    });

    it('showWarning should open dialog with type:warning', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const promise = showWarning('Warning Title');

      controller.resolveReady();
      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalled();
      });

      const initCall = mocks.sendToRenderer.mock.calls.find(
        (args: any[]) => args[1] === 'initDialog',
      );
      const sentConfig = initCall![2] as DialogConfig;
      expect(sentConfig.type).toBe('warning');

      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogAction(dialogId, 'ok');

      await promise;
    });

    it('showSuccess should open dialog with type:success', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const promise = showSuccess('Success Title');

      controller.resolveReady();
      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalled();
      });

      const initCall = mocks.sendToRenderer.mock.calls.find(
        (args: any[]) => args[1] === 'initDialog',
      );
      const sentConfig = initCall![2] as DialogConfig;
      expect(sentConfig.type).toBe('success');

      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogAction(dialogId, 'ok');

      await promise;
    });

    it('showError should open dialog with type:error', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const promise = showError('Error Title');

      controller.resolveReady();
      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalled();
      });

      const initCall = mocks.sendToRenderer.mock.calls.find(
        (args: any[]) => args[1] === 'initDialog',
      );
      const sentConfig = initCall![2] as DialogConfig;
      expect(sentConfig.type).toBe('error');

      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogAction(dialogId, 'ok');

      await promise;
    });

    it('should resolve only after the dialog is closed', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);
      let resolved = false;

      const promise = showInfo('Title').then(() => {
        resolved = true;
      });

      // Not resolved yet while dialog is open
      await vi.waitFor(() => {
        expect(mocks.createWindow).toHaveBeenCalled();
      });
      expect(resolved).toBe(false);

      // Close via dismiss
      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogDismissed(dialogId, 'esc');

      await promise;
      expect(resolved).toBe(true);
    });

    it('should pass optional SimpleDialogOptions through to the config', async () => {
      const controller = createMockController();
      setupCreateWindow(controller);

      const placement = {horizontal: 'left' as const, top: 50};
      const promise = showInfo('Title', 'Message', {width: 600, placement});

      controller.resolveReady();
      await vi.waitFor(() => {
        expect(mocks.sendToRenderer).toHaveBeenCalled();
      });

      const initCall = mocks.sendToRenderer.mock.calls.find(
        (args: any[]) => args[1] === 'initDialog',
      );
      const sentConfig = initCall![2] as DialogConfig;
      expect(sentConfig.width).toBe(600);
      expect(sentConfig.placement).toEqual(placement);

      // Width +4px in window options
      expect(mocks.createWindow).toHaveBeenCalledWith(
        expect.objectContaining({
          windowOptions: expect.objectContaining({width: 604}),
        }),
      );

      const dialogId = `dialog-test-uuid-${mocks.uuidCounter()}`;
      handleDialogAction(dialogId, 'ok');
      await promise;
    });
  });
});
