import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { JwtService } from '@nestjs/jwt';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { PrismaService } from 'src/prisma/prisma.service';
import { ImagesProcessor } from './images.processor';
import { AuthModule } from 'src/auth/auth.module';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { ImagesEventsListener } from './images.events.listener';

@Module({
  imports: [BullModule.registerQueue({ name: 'images' }), AuthModule],
  controllers: [ImagesController],
  providers: [
    ImagesService,
    PrismaService,
    ImagesProcessor,
    JwtService,
    NotificationsGateway,
    ImagesEventsListener,
  ],
  exports: [ImagesService],
})
export class ImagesModule {}
