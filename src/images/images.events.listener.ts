import { Logger } from '@nestjs/common';
import {
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';

@QueueEventsListener('images')
export class ImagesEventsListener extends QueueEventsHost {
  private readonly logger = new Logger(ImagesEventsListener.name);

  @OnQueueEvent('added')
  onAdded({ jobId }) {
    this.logger.log(`Job with ID ${jobId} added`);
  }
}
