import * as sharp from 'sharp';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';

import { TransformImageDto } from './dto/transform-image.dto';
import { PrismaService } from 'src/prisma/prisma.service';
import { InputJsonObject } from '@prisma/client/runtime/library';
import { NotificationsGateway } from 'src/notifications/notifications.gateway';
import { ImagesService } from './images.service';

@Processor('images', { concurrency: 2 })
export class ImagesProcessor extends WorkerHost {
  private readonly logger = new Logger(ImagesProcessor.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly notificationsGateway: NotificationsGateway,
    private readonly imagesService: ImagesService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {
    super();
  }

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (
      error instanceof BadRequestException ||
      error instanceof ForbiddenException
    ) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private transformImage = async (
    imageBuffer: Buffer,
    transformImageDto: TransformImageDto,
  ) => {
    let transformedImage = sharp(imageBuffer);
    const { order, resize, crop, rotate, tint } = transformImageDto;

    for (const step of order) {
      switch (step) {
        case 'resize': {
          transformedImage = transformedImage.resize({
            width: resize.width,
            height: resize.height,
            fit: resize.fit || 'cover',
          });

          break;
        }

        case 'crop': {
          const metadata = await transformedImage.metadata();
          const { width: imgWidth, height: imgHeight } = metadata;
          const { width, height, left, top } = crop;

          if (left + width > imgWidth || top + height > imgHeight) {
            throw new BadRequestException('Crop area is out of bounds');
          }

          transformedImage = transformedImage.extract({
            left,
            top,
            width,
            height,
          });

          break;
        }

        case 'rotate': {
          transformedImage = transformedImage.rotate(rotate);

          break;
        }

        case 'grayscale': {
          transformedImage = transformedImage.grayscale();

          break;
        }

        case 'tint': {
          transformedImage = transformedImage.tint(tint);

          break;
        }

        default:
          throw new BadRequestException(`Unsupported transformation: ${step}`);
      }
    }

    return await transformedImage.toBuffer();
  };

  async process(job: Job) {
    const {
      data: { image, transformImageDto, transformedImageCacheKey },
    } = job;

    try {
      const imageBuffer = await this.imagesService.getFileBufferFromCloudinary(
        image.secureUrl,
      );

      const transformedImageBuffer = await this.transformImage(
        imageBuffer,
        transformImageDto,
      );

      // Get the size of the transformed image buffer
      const transformedImageSize = transformedImageBuffer.length;

      const expressMulterFile = {
        buffer: transformedImageBuffer,
        originalname: image.originalName,
        mimetype: `image/${image.format}`,
        size: transformedImageSize,
      } as Express.Multer.File;

      const { publicId, secureUrl } =
        await this.imagesService.uploadImageToCloudinary(
          expressMulterFile,
          `Bildtransformator/users/${image.userId}/transformed-images`,
        );

      const transformedImage = await this.prismaService.transformedImage.create(
        {
          data: {
            originalImageId: image.id,
            publicId,
            secureUrl,
            size: transformedImageSize,
            transformation: transformImageDto as unknown as InputJsonObject,
          },
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { publicId: _, ...rest } = transformedImage;

      await this.cacheManager.set(transformedImageCacheKey, rest);

      return rest;
    } catch (error) {
      this.handleError(error, 'process job');
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job with ID ${job.id} completed`);

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'image-transformation-completed',
      result,
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Job with ID ${job.id} failed`, error.stack);

    this.notificationsGateway.emitToUser(
      job.data.userId,
      'image-transformation-failed',
      { message: error.message },
    );
  }
}
