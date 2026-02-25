/**
 * modules/app/src/popup.ts
 *
 * @file Renderer entry point for the popup window.
 *
 * @author Martin Burchard
 */
import {getLog} from '@app/logging.js';
import '@css/style.css';

const log = getLog('app.popup');

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');
});
