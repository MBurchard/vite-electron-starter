import {useLog} from '@mburchard/bit-log';

const log = useLog('electron.submodule.sub');

export function doSth2(param: string): string {
  log.debug('function doSth2 was called');
  return `Hallo ${param}`;
}
