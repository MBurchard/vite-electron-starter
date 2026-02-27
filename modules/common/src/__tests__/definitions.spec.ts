/**
 * modules/common/src/__tests__/definitions.spec.ts
 *
 * @file Tests for shared IPC channel definitions.
 */
import {describe, expect, it} from 'vitest';
import {CoreIpcChannels} from '../core/ipc.js';
import {IpcChannels} from '../definitions.js';
import {DialogIpcChannels} from '../dialog/ipc.js';

describe('coreIpcChannels', () => {
  it('should contain all expected core channel names', () => {
    expect(CoreIpcChannels.frontendLogging).toBe('frontendLogging');
    expect(CoreIpcChannels.getVersions).toBe('getVersions');
    expect(CoreIpcChannels.rendererContentSizeChanged).toBe('rendererContentSizeChanged');
    expect(Object.keys(CoreIpcChannels)).toHaveLength(3);
  });
});

describe('dialogIpcChannels', () => {
  it('should contain all expected dialog channel names', () => {
    expect(DialogIpcChannels.initDialog).toBe('initDialog');
    expect(DialogIpcChannels.dialogOpened).toBe('dialogOpened');
    expect(DialogIpcChannels.dialogShown).toBe('dialogShown');
    expect(DialogIpcChannels.dialogAction).toBe('dialogAction');
    expect(DialogIpcChannels.dialogDismissed).toBe('dialogDismissed');
    expect(DialogIpcChannels.dialogSetMessage).toBe('dialogSetMessage');
    expect(Object.keys(DialogIpcChannels)).toHaveLength(6);
  });
});

describe('ipcChannels aggregator', () => {
  it('should include core, dialog, and demo channels for compatibility', () => {
    expect(IpcChannels.frontendLogging).toBe('frontendLogging');
    expect(IpcChannels.dialogAction).toBe('dialogAction');
    expect(IpcChannels.showStartupDialogDemo).toBe('showStartupDialogDemo');
  });
});
