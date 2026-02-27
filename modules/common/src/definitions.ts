/**
 * modules/common/src/definitions.ts
 *
 * @file Shared exports for backward compatibility. Prefer importing from dedicated submodules:
 * - @common/core/*
 * - @common/dialog/*
 * - @common/demo/*
 *
 * @author Martin Burchard
 */

import {CoreIpcChannels} from './core/ipc.js';
import {IpcDemoChannels} from './demo/ipc.js';
import {DialogIpcChannels} from './dialog/ipc.js';

export * from './core/ipc.js';
export * from './core/versions.js';
export * from './core/window.js';
export * from './dialog/ipc.js';
export * from './dialog/lifecycle.js';
export * from './dialog/types.js';

/**
 * Combined core+dialog channel lookup kept for backward compatibility.
 */
export const IpcChannels = {
  ...CoreIpcChannels,
  ...DialogIpcChannels,
  ...IpcDemoChannels,
} as const;

/**
 * Union of all predefined core/dialog/demo channel names, plus any arbitrary string for extensibility.
 */
export type IpcChannel = typeof IpcChannels[keyof typeof IpcChannels] | (string & {});
