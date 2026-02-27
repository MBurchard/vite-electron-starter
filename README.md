# vite-electron-starter

![lang: Typescript](https://img.shields.io/badge/crafted_with-Typescript-blue?logo=typescript)
![GitHub License](https://img.shields.io/github/license/MBurchard/vite-electron-starter)

![the app running](documentation/img/app.png)

## Introduction

This starter template provides a quick and easy way to build [Electron](https://www.electronjs.org/) apps with
[TypeScript](https://www.typescriptlang.org/). It supports Hot Module Replacement (HMR) for the Electron main process,
the preload script, and the app itself. The entire setup uses [Vite](https://vite.dev/) in a clear, transparent manner,
no hidden "black magic" in third-party plugins.

## Tech Stack

- **Runtime:** Electron 40 (bundled Node 24), Node 24+
- **Build:** Vite 7, TypeScript 5.9
- **Package Manager:** pnpm 10.30+
- **Linting:** ESLint 10 + @antfu/eslint-config 7
- **Testing:** Vitest 4
- **Distribution:** electron-builder

## Features

### Multi-Page Support

Multiple windows with independent entry points, configured via `project.config.ts`. A custom Vite plugin resolves
virtual modules and injects template variables. Currently, it includes: the main window, a dialogue window, and the
display demo.

### Window Management

The `WindowController` manages per-window state including pack mode (auto-sizing to content), placement within the
display work area, and display-awareness for multi-monitor setups. Windows in pack mode use a `ResizeObserver` in the
preload script to automatically report content size changes back to the main process, debounced at 50 ms.

A deferred `whenWindowReady` promise provides a clean lifecycle hook for post-load operations like pushing dialogue
configuration.

### Dialog System

A built-in dialogue system replaces native Electron dialogues with fully styled, configurable windows. Dialogues support five
visual types (confirm, error, info, success, warning), configurable buttons with variants (primary, secondary, danger),
and flexible placement. The backend owns all close decisions; the renderer only sends intents.

Lifecycle hooks (`onOpened`, `onShown`, `onAction`, `onClosed`) allow callers to react to dialogue state transitions.

See the [Dialog System API Reference](documentation/dialog-system.md) for detailed usage and configuration options.

### Type-Safe IPC

Four communication patterns over typed `IpcChannels`:

- **Request-Response** (`invoke`/`handleFromRenderer`): Frontend asks, the main process answers
- **Fire-and-Forget** (`send`/`onFromRenderer`): Frontend sends, the main process reacts
- **Broadcast** (`broadcast`): The main process sends to all renderer windows
- **Targeted Send** (`sendToRenderer`): The main process sends to a specific renderer window

The preload script exposes a minimal `window.backend` API via `contextBridge`, keeping the renderer fully sandboxed.

### Security

Context Isolation, Sandbox, and strict CSP are enabled by default. Node Integration and Webview are disabled.

### Logging

Production-ready logging powered by [bit-log](https://github.com/MBurchard/bit-log), with source map support for both
the main process and renderer. The preload script has its own logging pipeline that forwards events to the backend via a
shared `BackendForwardingAppender`.

Coloured console output with timestamps, log levels, logger names, and resolved TypeScript source locations:

![Console logging](documentation/img/console_logging.png)

The same information is written to a single log file per day, with backend and frontend events merged chronologically:

![File logging](documentation/img/file_logging.png)

A custom **PipelineAppender** merges backend and frontend log events into a single, chronologically sorted log file.
Events are buffered and reordered by timestamp to account for IPC latency, then flushed to Console and File delegates
with origin prefixes (`Backend :` / `Frontend:`).

Inline source maps are deliberately included in production builds. The small size overhead is well worth it: log files
show the original TypeScript file names and line numbers, making it much easier to locate and fix issues in deployed
applications.

### Core/Demo Separation

All demo code lives in `demo/` subdirectories within each module and can be deleted for a clean starter. Core
functionality (window management, dialogue system, IPC, logging) is fully independent of the demo code.
