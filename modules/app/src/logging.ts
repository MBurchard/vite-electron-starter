import {BackendForwardingAppender} from '@app/BackendForwardingAppender.js';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/appender/ConsoleAppender';

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
    },
    BACKEND: {
      Class: BackendForwardingAppender,
    },
  },
  root: {
    appender: ['CONSOLE', 'BACKEND'],
    includeCallSite: true,
    level: 'DEBUG',
  },
});

export const getLog = useLog;
