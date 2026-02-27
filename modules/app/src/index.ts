/**
 * modules/app/src/index.ts
 *
 * @file Renderer entry point for the main application window. Displays version information and provides a button
 * to open the display demo window.
 *
 * @author Martin Burchard
 */
import type {Versions} from '@common/core/versions.js';
import {getLog} from '@app/logging.js';
import electronLogo from '@assets/electron.svg';
import typescriptLogo from '@assets/typescript.svg';
import viteLogo from '@assets/vite.svg';
import {IpcDemoChannels} from '@common/demo/ipc.js';
import '@css/style.css';

const log = getLog('app.main');
const {backend} = window;

/**
 * Request the backend to open the display demo window.
 */
function showDisplayDemo() {
  log.debug('show display demo');
  backend.send(IpcDemoChannels.showDisplayDemo);
}

window.addEventListener('DOMContentLoaded', async () => {
  log.debug('DOMContentLoaded');

  let versions: Versions | undefined;
  try {
    versions = await backend.getVersions();
    log.debug('Versions:', versions);
  } catch (err) {
    log.error('Failed to fetch versions', err);
  }

  document.querySelector('#app')!.innerHTML = `
  <div>
    <img src="${viteLogo}" class="logo" alt="Vite logo" />
    <img src="${electronLogo}" class="logo" alt="Electron logo" />
    <img src="${typescriptLogo}" class="logo" alt="TypeScript logo" />
    <h1>Vite + Electron + TypeScript</h1>
    <p style="margin-top: 2em">Current used program versions:</p>
    <div class="tiles">
      <div class="tile">Chrome: ${versions?.chrome}</div>
      <div class="tile">Electron: ${versions?.electron}</div>
      <div class="tile">Node: ${versions?.node}</div>
    </div>
    <p>&nbsp;</p>
    <p>
      <button id="displayDemoBtn" class="btn btn-secondary">Demo Window Manager</button>
    </p>
  </div>`;
  document.querySelector<HTMLButtonElement>('#displayDemoBtn')?.addEventListener('click', showDisplayDemo);
});
