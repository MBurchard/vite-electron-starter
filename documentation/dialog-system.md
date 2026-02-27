# Dialog System API Reference

## Introduction

The dialogue system replaces Electron's native `dialog` API with fully styled, configurable windows.
Every dialogue is a real `BrowserWindow` rendered by the app's own CSS, so it matches the application's
look and feel across platforms.

A key design principle is **backend-owns-close**: the renderer never closes itself. Instead, it sends
intents (button click, ESC press, titlebar X) to the main process, which decides whether and when to
close the window. This keeps the control flow predictable and allows patterns like non-closing buttons,
programmatic close after async work, or ignoring dismiss attempts entirely.

## Quick Start

**a) Convenience function**

```ts
import {showInfo} from '../windowMgt/dialog/index.js';

await showInfo('Update Available', 'Version 2.1 is ready to install.');
```

**b) Full control**

```ts
import {openDialogWindow} from '../windowMgt/dialog/index.js';

const handle = openDialogWindow({
  type: 'confirm',
  title: 'Delete Project?',
  message: 'This action cannot be undone.',
  buttons: [
    {id: 'delete', label: 'Delete', variant: 'danger'},
    {id: 'cancel', label: 'Cancel', variant: 'secondary'},
  ],
});

const result = await handle.result;

if (result.source === 'button' && result.buttonId === 'delete') {
  // proceed with deletion
}
```

## Convenience Functions

Four shorthand functions that open a single-button dialogue and resolve when it closes.

### Signatures

```ts
declare function showInfo(title: string, message?: string, options?: SimpleDialogOptions): Promise<void>;
declare function showSuccess(title: string, message?: string, options?: SimpleDialogOptions): Promise<void>;
declare function showWarning(title: string, message?: string, options?: SimpleDialogOptions): Promise<void>;
declare function showError(title: string, message?: string, options?: SimpleDialogOptions): Promise<void>;
```

### Parameters

| Parameter | Type                  | Description                                        |
|-----------|-----------------------|----------------------------------------------------|
| `title`   | `string`              | Title displayed in the dialogue header.            |
| `message` | `string` (optional)   | Body text displayed below the title.               |
| `options` | `SimpleDialogOptions` | Width, placement, and close-behaviour overrides.   |

### SimpleDialogOptions

| Field           | Type              | Default | Description                         |
|-----------------|-------------------|---------|-------------------------------------|
| `width`         | `number`          | `500`   | Fixed width in pixels.              |
| `placement`     | `WindowPlacement` |         | Placement strategy for positioning. |
| `closableByX`   | `boolean`         | `true`  | Show the header close button.       |
| `closableByEsc` | `boolean`         | `true`  | Allow ESC to dismiss the dialogue.  |

## openDialogWindow (Full API)

Opens a dialogue window and returns a handle with lifecycle promises and a programmatic close method.

### Signature

```ts
declare function openDialogWindow(
  config: DialogConfig,
  hooks?: DialogLifecycleHooks,
  options?: OpenDialogWindowOptions,
): DialogHandle;
```

### Parameters

| Parameter | Type                      | Description                                         |
|-----------|---------------------------|-----------------------------------------------------|
| `config`  | `DialogConfig`            | Full dialogue configuration rendered by the window. |
| `hooks`   | `DialogLifecycleHooks`    | Optional lifecycle callbacks.                       |
| `options` | `OpenDialogWindowOptions` | Optional window behaviour overrides.                |

### DialogHandle (Return Type)

| Field        | Type                            | Description                                        |
|--------------|---------------------------------|----------------------------------------------------|
| `dialogId`   | `string`                        | Unique identifier for this dialogue instance.      |
| `whenOpened` | `Promise<DialogOpenedEvent>`    | Resolves when the renderer has initialised.        |
| `whenShown`  | `Promise<DialogShownEvent>`     | Resolves when first layout is complete.            |
| `result`     | `Promise<DialogResult>`         | Resolves with the final dialogue result.           |
| `close`      | `() => Promise<void>`           | Programmatically close the dialogue.               |

### OpenDialogWindowOptions

| Field          | Type      | Default | Description                            |
|----------------|-----------|---------|----------------------------------------|
| `withDevTools` | `boolean` |         | Open DevTools for the dialogue window. |

## Configuration (DialogConfig)

| Field           | Type                   | Default | Description                                        |
|-----------------|------------------------|---------|----------------------------------------------------|
| `title`         | `string`               |         | **Required.** Title displayed in the header.       |
| `buttons`       | `DialogButtonConfig[]` |         | **Required.** Buttons to render, in display order. |
| `type`          | `DialogType`           |         | Visual type controlling colour scheme.             |
| `message`       | `string`               | `''`    | Body text displayed below the title.               |
| `width`         | `number`               | `500`   | Fixed width in pixels.                             |
| `placement`     | `WindowPlacement`      |         | Placement strategy for positioning.                |
| `autoResize`    | `boolean`              | `true`  | Report content size via ResizeObserver. When false, size is reported explicitly after each `setDialogMessage` call. |
| `closableByX`   | `boolean`              | `true`  | Show the header close button.                      |
| `closableByEsc` | `boolean`              | `true`  | Allow ESC to dismiss the dialogue.                 |

`DialogType`: `'confirm'` | `'error'` | `'info'` | `'success'` | `'warning'`

### DialogButtonConfig

| Field          | Type                  | Default | Description                                          |
|----------------|-----------------------|---------|------------------------------------------------------|
| `id`           | `string`              |         | **Required.** Stable identifier returned in results. |
| `label`        | `string`              |         | **Required.** Button text shown in the UI.           |
| `variant`      | `DialogButtonVariant` |         | Style hint: `'primary'`, `'secondary'`, `'danger'`.  |
| `closesDialog` | `boolean`             | `true`  | Whether clicking this button closes the dialogue.    |
| `payload`      | `unknown`             |         | Static payload emitted with action/result events.    |

## Lifecycle

### Flow

```text
openDialogWindow()
        |
        v
  +-----------+
  |  opened   |   Renderer has initialised
  +-----------+
        |
        v
  +-----------+
  |   shown   |   First layout complete, window is visible
  +-----------+
        |
        v
  +-----------+
  |  action   |   User clicks a button (may repeat if closesDialog: false)
  |    or     |
  |  dismiss  |   User presses ESC or clicks titlebar X
  +-----------+
        |
        v
  +-----------+
  |  closed   |   Window has been destroyed, result is available
  +-----------+
```

### Lifecycle Hooks (DialogLifecycleHooks)

| Hook       | Event Type          | When                                                              |
|------------|---------------------|-------------------------------------------------------------------|
| `onOpened` | `DialogOpenedEvent` | Renderer has initialised (`windowId`, `at`).                      |
| `onShown`  | `DialogShownEvent`  | First layout complete, window visible (`windowId`, `at`).         |
| `onAction` | `DialogActionEvent` | User clicked a button (`windowId`, `buttonId`, `payload?`, `at`). |
| `onClosed` | `DialogClosedEvent` | Window closed, carries the full `DialogResult`.                   |

## DialogResult

| Field      | Type                 | Description                                                 |
|------------|----------------------|-------------------------------------------------------------|
| `source`   | `DialogCloseSource`  | What caused the dialogue to close.                          |
| `buttonId` | `string` (optional)  | ID of the button pressed (only when `source === 'button'`). |
| `payload`  | `unknown` (optional) | Payload from the button that triggered close.               |
| `windowId` | `string`             | The dialogue window ID.                                     |
| `at`       | `number`             | Timestamp when the dialogue closed (ms since epoch).        |

### DialogCloseSource

| Value                | Description                                 |
|----------------------|---------------------------------------------|
| `'button'`           | User clicked a dialogue button.             |
| `'titlebar-x'`       | User clicked the header close button.       |
| `'esc'`              | User pressed the Escape key.                |
| `'programmatic'`     | Closed via `handle.close()`.                |
| `'window-destroyed'` | Window was destroyed before normal closure. |

## Window Positioning (WindowPlacement)

| Field        | Type                                | Description                                 |
|--------------|-------------------------------------|---------------------------------------------|
| `horizontal` | `'left'` \| `'center'` \| `'right'` | Preferred horizontal alignment.             |
| `vertical`   | `'top'` \| `'center'` \| `'bottom'` | Preferred vertical alignment.               |
| `top`        | `number` \| `` `${number}%` ``      | Offset from top edge (px or percentage).    |
| `bottom`     | `number` \| `` `${number}%` ``      | Offset from bottom edge (px or percentage). |
| `left`       | `number` \| `` `${number}%` ``      | Offset from left edge (px or percentage).   |
| `right`      | `number` \| `` `${number}%` ``      | Offset from right edge (px or percentage).  |

Percentage values are interpreted relative to the display work area.

**Conflict rules:** When both sides of an axis are specified, `top` takes priority over `bottom`
and `left` takes priority over `right`.

## Updating Content (setDialogMessage)

### Signature

```ts
declare function setDialogMessage(windowId: string, message: string): void;
```

Replaces the dialogue's body text and pushes the update to the renderer via IPC.
The `windowId` is available as `handle.dialogId` from the `DialogHandle`.

### Example: Progress Streaming

```ts
const handle = openDialogWindow({
  autoResize: false,
  type: 'info',
  title: 'Application Startup',
  closableByEsc: false,
  closableByX: false,
  buttons: [],
});

handle.whenShown.then(async () => {
  let output = '';
  for (const step of STEPS) {
    output = output ? `${output}\n${step}` : step;
    setDialogMessage(handle.dialogId, output);
    await delay(250);
  }
}).catch((reason) => {
  log.error('Startup dialog failed:', reason);
}).finally(() => {
  handle.close().catch((reason) => {
    log.error('Failed to close startup dialog:', reason);
  });
});
```

When `autoResize` is enabled (the default), a `ResizeObserver` on `document.body` tracks size changes
automatically, debounced at 50 ms. This works well for regular dialogues. Setting `autoResize: false`
disables the observer; instead, the dialogue reports its content size explicitly after each
`setDialogMessage` call and after the initial layout. For streaming-style updates like a startup splash,
this produces smoother resizing because each message change triggers exactly one size report rather than
debounced observer events.

Omitting buttons and disabling both `closableByX` and `closableByEsc` ensures the dialogue can only be
closed programmatically via `handle.close()`.

## Usage Patterns

### a) Startup Progress

A non-interactive progress dialogue that streams status lines and closes itself when done.

```ts
const handle = openDialogWindow({
  autoResize: false,
  type: 'info',
  title: 'Loading...',
  closableByEsc: false,
  closableByX: false,
  buttons: [],
});

handle.whenShown.then(async () => {
  setDialogMessage(handle.dialogId, 'Step 1: Initialising...');
  await doStep1();
  setDialogMessage(handle.dialogId, 'Step 1: Initialising...\nStep 2: Loading data...');
  await doStep2();
}).catch((reason) => {
  log.error('Startup failed:', reason);
}).finally(() => {
  handle.close().catch(noop);
});
```

Key points:
- `autoResize: false` disables the ResizeObserver; size is reported explicitly after each message update instead.
- No buttons, no X, no ESC: only `handle.close()` can dismiss it.
- Always close in `finally` so the dialogue does not hang on errors.

### b) Confirmation with Follow-up

A confirmation dialogue where the result drives a second action.

```ts
const handle = openDialogWindow({
  type: 'confirm',
  title: 'Dialog Type Demo',
  message: 'Pick a dialog type to preview:',
  placement: {horizontal: 'center', top: '30%'},
  buttons: [
    {id: 'error', label: 'Error', variant: 'primary'},
    {id: 'info', label: 'Info', variant: 'primary'},
    {id: 'success', label: 'Success', variant: 'primary'},
    {id: 'warning', label: 'Warning', variant: 'primary'},
  ],
});

const result = await handle.result;

if (result.source === 'button') {
  await showInfo(`${result.buttonId} selected`, 'Follow-up dialogue.');
}
```

### c) Non-closing Button

A button with `closesDialog: false` triggers the `onAction` hook without closing the dialogue.
Useful for in-place updates, validation, or multistep flows inside a single dialogue.

```ts
const handle = openDialogWindow(
  {
    type: 'info',
    title: 'Progress',
    message: 'Ready to start.',
    buttons: [
      {id: 'run', label: 'Run', variant: 'primary', closesDialog: false},
      {id: 'close', label: 'Close', variant: 'secondary'},
    ],
  },
  {
    onAction: (event) => {
      if (event.buttonId === 'run') {
        setDialogMessage(handle.dialogId, 'Running...');
        // do work, then update message again
      }
    },
  },
);
```

## Source Files

| File                                                     | Contents                                                                                                     |
|----------------------------------------------------------|--------------------------------------------------------------------------------------------------------------|
| `modules/common/src/dialog/types.ts`                     | Shared types: `DialogConfig`, `DialogButtonConfig`, `DialogResult`, `DialogCloseSource`                      |
| `modules/common/src/dialog/lifecycle.ts`                 | Lifecycle event types: `DialogOpenedEvent`, `DialogShownEvent`, `DialogActionEvent`, `DialogClosedEvent`     |
| `modules/common/src/core/window.ts`                      | `WindowPlacement` and offset types                                                                           |
| `modules/electron/src/windowMgt/dialog/types.ts`         | Backend-only types: `DialogHandle`, `SimpleDialogOptions`, `DialogLifecycleHooks`, `OpenDialogWindowOptions` |
| `modules/electron/src/windowMgt/dialog/DialogService.ts` | Implementation of all public functions                                                                       |
| `modules/electron/src/windowMgt/dialog/index.ts`         | Re-exports (public API surface)                                                                              |
