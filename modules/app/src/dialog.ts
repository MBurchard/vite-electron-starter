/**
 * modules/app/src/dialog.ts
 *
 * @file Renderer entry point for the dialog window. Receives dialog configuration pushed from the main process via
 * the initDialog channel, renders title/message/buttons, and sends dialog lifecycle/action intents to the backend.
 * The backend owns all close decisions.
 *
 * @author Martin Burchard
 */
import type {DialogButtonConfig, DialogConfig} from '@common/dialog/types.js';
import {getLog} from '@app/logging.js';
import {DialogIpcChannels} from '@common/dialog/ipc.js';
import '@css/style.css';

const log = getLog('app.dialog');
const {backend} = window;
let dialogMessageElement: HTMLDivElement | null = null;

/**
 * Create a styled button element from a backend-provided button configuration.
 *
 * @param config - Button configuration specifying label, variant, and action payload.
 * @returns The configured button element.
 */
function createButton(config: DialogButtonConfig): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = `btn btn-${config.variant ?? 'primary'}`;
  btn.textContent = config.label;
  btn.addEventListener('click', () => {
    backend.send(DialogIpcChannels.dialogAction, config.id, config.payload);
  });
  return btn;
}

/**
 * Populate the static dialog skeleton from the template with dynamic content from the backend config.
 *
 * @param container - The root container element holding the dialog skeleton.
 * @param config - Backend-provided dialog configuration.
 */
function populateDialog(container: HTMLDivElement, config: DialogConfig): void {
  const type = config.type ?? 'info';

  // Title
  const title = container.querySelector<HTMLDivElement>('.dialog-title')!;
  title.textContent = config.title;

  // Close button: visible by default in the template, remove if disabled
  if (config.closableByX === false) {
    container.querySelector('.dialog-close')?.remove();
  } else {
    container.querySelector('.dialog-close')!.addEventListener('click', () => {
      backend.send(DialogIpcChannels.dialogDismissed, 'titlebar-x');
    });
  }

  // Message
  dialogMessageElement = container.querySelector<HTMLDivElement>('.dialog-message')!;
  dialogMessageElement.textContent = config.message ?? '';

  // Buttons
  const footer = container.querySelector<HTMLDivElement>('.dialog-footer')!;
  for (const button of config.buttons) {
    footer.appendChild(createButton(button));
  }

  document.body.classList.add(type);

  if (config.closableByEsc !== false) {
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        backend.send(DialogIpcChannels.dialogDismissed, 'esc');
      }
    });
  }
}

/**
 * Initialise the dialog from a backend-pushed configuration.
 * Called once when the main process sends the initDialog event after the page has loaded.
 *
 * @param config - Backend-provided dialog configuration.
 */
function initializeDialog(config: DialogConfig): void {
  log.debug('initDialog received');

  backend.send(DialogIpcChannels.dialogOpened);

  const container = document.querySelector<HTMLDivElement>('.container');
  if (!container) {
    log.error('No .container element found');
    return;
  }

  const manualResize = config.autoResize === false;
  if (manualResize) {
    backend.window.disableAutoResize();
  }

  populateDialog(container, config);

  backend.on<[string]>(DialogIpcChannels.dialogSetMessage, (message: string) => {
    if (!dialogMessageElement) {
      return;
    }
    dialogMessageElement.textContent = message;
    if (manualResize) {
      backend.window.reportContentSize(document.body.offsetWidth, document.body.offsetHeight);
    }
  });

  if (manualResize) {
    backend.window.reportContentSize(document.body.offsetWidth, document.body.offsetHeight);
  }
  backend.send(DialogIpcChannels.dialogShown);
}

backend.once<[DialogConfig]>(DialogIpcChannels.initDialog, initializeDialog);
