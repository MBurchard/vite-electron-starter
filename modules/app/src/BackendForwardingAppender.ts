import type {ILogEvent} from '@mburchard/bit-log/dist/definitions.js';
import {AbstractBaseAppender} from '@mburchard/bit-log/dist/appender/AbstractBaseAppender.js';

export class BackendForwardingAppender extends AbstractBaseAppender {
  async handle(event: ILogEvent): Promise<void> {
    if (!this.willHandle(event)) {
      return;
    }
    // during logging initialisation in the preload script, the backend may not be ready
    if (window?.backend?.forwardLogEvent) {
      window.backend.forwardLogEvent(event);
    }
  }
}
