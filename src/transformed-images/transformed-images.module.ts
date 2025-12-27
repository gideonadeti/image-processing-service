import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TransformedImagesService } from './transformed-images.service';
import { TransformedImagesController } from './transformed-images.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransformedImagesProcessor } from './transformed-images.processor';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { JwtService } from '@nestjs/jwt';
import { TransformedImagesEventsListener } from './transformed-images.events.listener';
import { ImagesModule } from 'src/images/images.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: 'transformed-images',
      defaultJobOptions: {
        removeOnComplete: true,
      },
    }),
    AuthModule,
    ImagesModule,
  ],
  controllers: [TransformedImagesController],
  providers: [
    TransformedImagesService,
    PrismaService,
    TransformedImagesProcessor,
    NotificationsGateway,
    JwtService,
    TransformedImagesEventsListener,
  ],
})
export class TransformedImagesModule {}
