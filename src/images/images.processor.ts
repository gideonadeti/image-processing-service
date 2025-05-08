import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('images')
export class ImagesProcessor extends WorkerHost {
  async process(job: Job) {}
}
