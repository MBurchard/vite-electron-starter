import {getLog} from '@common/logging.js';
import {doSth} from '@common/someutil.js';

const log = getLog('app.index');

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');
  document.querySelector('#test')!.innerHTML = doSth('Welt');
});
