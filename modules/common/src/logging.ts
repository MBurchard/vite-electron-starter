import {configureLogging, useLog} from '@mburchard/bit-log';
import {ConsoleAppender} from '@mburchard/bit-log/dist/appender/ConsoleAppender.js';

configureLogging({
  appender: {
    CONSOLE: {
      Class: ConsoleAppender,
    },
  },
  root: {
    appender: ['CONSOLE'],
    level: 'DEBUG',
  },
});

export const getLog = useLog;
