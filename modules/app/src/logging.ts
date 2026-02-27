/**
 * modules/app/src/logging.ts
 *
 * @file Frontend logging configuration. Sets up a ConsoleAppender for browser output and a BackendForwardingAppender
 * that relays events to the Electron main process via IPC. Also configures source map resolution for accurate
 * call site reporting.
 *
 * @author Martin Burchard
 */
import {createBoundAppenderClass} from '@common/logging/BackendForwardingAppender.js';
import {originalPositionFor, TraceMap} from '@jridgewell/trace-mapping';
import {configureLogging, configureSourceMapResolver, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';

configureSourceMapResolver(TraceMap, originalPositionFor);

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
    },
    BACKEND: {
      Class: createBoundAppenderClass(event => window.backend.forwardLogEvent(event)),
    },
  },
  root: {
    appender: ['CONSOLE', 'BACKEND'],
    includeCallSite: true,
    level: 'DEBUG',
  },
});

export const getLog = useLog;
