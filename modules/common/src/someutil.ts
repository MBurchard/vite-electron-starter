import {getLog} from '@common/logging.js';

const log = getLog('common.some.util');

export function doSth(param: string): string {
  log.debug('doSth has been used');
  return `Hallo ${param}`;
}
