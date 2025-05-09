import { Module } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { JobsController } from './jobs.controller';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'images' },
      { name: 'transformed-images' },
    ),
  ],
  controllers: [JobsController],
  providers: [JobsService],
})
export class JobsModule {}
