import { Module } from '@nestjs/common';
import { ImagesService } from './images.service';
import { ImagesController } from './images.controller';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';

@Module({
  controllers: [ImagesController],
  providers: [ImagesService, AwsS3Service, PrismaService],
})
export class ImagesModule {}
