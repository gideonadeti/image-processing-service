import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { TransformedImagesService } from './transformed-images.service';
import { TransformedImagesController } from './transformed-images.controller';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { TransformedImagesProcessor } from './transformed-images.processor';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { AuthService } from 'src/auth/auth.service';
import { JwtService } from '@nestjs/jwt';
import { TransformedImagesEventsListener } from './transformed-images.events.listener';

@Module({
  imports: [BullModule.registerQueue({ name: 'transformed-images' })],
  controllers: [TransformedImagesController],
  providers: [
    TransformedImagesService,
    AwsS3Service,
    PrismaService,
    TransformedImagesProcessor,
    NotificationsGateway,
    AuthService,
    JwtService,
    TransformedImagesEventsListener,
  ],
})
export class TransformedImagesModule {}
