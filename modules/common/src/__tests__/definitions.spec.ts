/**
 * modules/common/src/__tests__/definitions.spec.ts
 *
 * @file Tests for shared IPC channel definitions.
 */
import {describe, expect, it} from 'vitest';
import {IpcChannels} from '../definitions.js';

describe('ipcChannels', () => {
  it('should contain all expected channel names', () => {
    expect(IpcChannels.getVersions).toBe('getVersions');
    expect(IpcChannels.getDisplayData).toBe('getDisplayData');
    expect(IpcChannels.showDisplayDemo).toBe('showDisplayDemo');
    expect(IpcChannels.updateDisplayData).toBe('updateDisplayData');
    expect(IpcChannels.frontendLogging).toBe('frontendLogging');
    expect(Object.keys(IpcChannels)).toHaveLength(5);
  });
});
