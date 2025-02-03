import {BackendForwardingAppender} from '@app/BackendForwardingAppender.js';
import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';

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
    level: 'DEBUG',
  },
});

export const getLog = useLog;
