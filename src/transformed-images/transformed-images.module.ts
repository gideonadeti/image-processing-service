import { Module } from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { TransformedImagesController } from './transformed-images.controller';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [TransformedImagesController],
  providers: [TransformedImagesService, AwsS3Service, PrismaService],
})
export class TransformedImagesModule {}
