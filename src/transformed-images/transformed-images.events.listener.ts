import { Logger } from '@nestjs/common';
import {
  QueueEventsHost,
  QueueEventsListener,
  OnQueueEvent,
} from '@nestjs/bullmq';

@QueueEventsListener('transformed-images')
export class TransformedImagesEventsListener extends QueueEventsHost {
  private readonly logger = new Logger(TransformedImagesEventsListener.name);

  @OnQueueEvent('added')
  onAdded({ jobId }) {
    this.logger.log(`Job with ID ${jobId} added`);
  }
}
