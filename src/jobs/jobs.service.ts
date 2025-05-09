import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { QueueDto } from './dto/queue.dto';

@Injectable()
export class JobsService {
  constructor(
    @InjectQueue('images') private imagesQueue: Queue,
    @InjectQueue('transformed-images') private transformedImagesQueue: Queue,
  ) {}

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof ForbiddenException) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  async findOne(userId: string, id: string, query: QueueDto) {
    let job: Job;

    try {
      if (query.queue === 'images') {
        job = await this.imagesQueue.getJob(id);
      } else {
        job = await this.transformedImagesQueue.getJob(id);
      }

      if (!job) {
        throw new BadRequestException(
          `Job with ID ${id} not found in ${query.queue} queue`,
        );
      }

      if (job.data.userId !== userId) {
        throw new ForbiddenException('You are not authorized to view this job');
      }

      return {
        status: await job.getState(),
        result: job.returnvalue ?? null,
        failedReason: job.failedReason ?? null,
      };
    } catch (error) {
      this.handleError(
        error,
        `fetch job with ID ${id} from ${query.queue} queue`,
      );
    }
  }
}
