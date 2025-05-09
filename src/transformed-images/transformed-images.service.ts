import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';
import { TransformedImage } from 'generated/prisma';

@Injectable()
export class TransformedImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @InjectQueue('transformed-images') private transformedImagesQueue: Queue,
  ) {}

  private readonly baseUrl = this.configService.get<string>('BASE_URL');

  private handleError(error: any, action: string) {
    console.error(`Failed to ${action}:`, error);

    if (error instanceof BadRequestException) {
      throw error;
    } else if (error instanceof ForbiddenException) {
      throw error;
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
  }

  private generateTransformedTransformedImageCacheKey(
    userId: string,
    transformedImageId: string,
    transformImageDto: TransformImageDto,
  ): string {
    const filteredOptions = Object.fromEntries(
      Object.entries(transformImageDto).filter(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        ([_, value]) => value !== undefined && value !== null,
      ),
    );
    const sortedOptions = Object.fromEntries(
      Object.entries(filteredOptions).sort(([a], [b]) => a.localeCompare(b)),
    );
    const hash = createHash('sha256')
      .update(JSON.stringify(sortedOptions))
      .digest('hex');

    return `${userId}:transformations:${transformedImageId}-${hash}`;
  }

  async transform(
    userId: string,
    id: string,
    transformImageDto: TransformImageDto,
  ) {
    try {
      const transformedImage =
        await this.prismaService.transformedImage.findUnique({
          where: {
            id,
          },
          include: {
            originalImage: true,
          },
        });

      if (!transformedImage) {
        throw new BadRequestException('Transformed image not found');
      }

      if (transformedImage.originalImage.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to transform this transformed image',
        );
      }

      const transformedTransformedImageCacheKey =
        this.generateTransformedTransformedImageCacheKey(
          userId,
          id,
          transformImageDto,
        );
      const transformedTransformedImage: TransformedImage =
        await this.cacheManager.get(transformedTransformedImageCacheKey);

      if (transformedTransformedImage) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _, ...rest } = transformedTransformedImage;

        return {
          ...rest,
          url:
            this.baseUrl +
            '/transformed-images/' +
            transformedTransformedImage.id +
            '/view',
        };
      }

      const job = await this.transformedImagesQueue.add('transform', {
        userId,
        transformedImage,
        transformImageDto,
        transformedTransformedImageCacheKey,
      });

      return {
        jobId: job.id,
        status: 'queued',
      };
    } catch (error) {
      this.handleError(error, 'transform transformed image');
    }
  }

  async findAll(userId: string) {
    try {
      const transformedImages =
        await this.prismaService.transformedImage.findMany({
          where: {
            originalImage: {
              userId,
            },
          },
        });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return transformedImages.map(({ key, ...rest }) => ({
        ...rest,
        url: this.baseUrl + '/transformed-images/' + rest.id + '/view',
      }));
    } catch (error) {
      this.handleError(error, 'find all transformed images');
    }
  }

  async findOne(userId: string, id: string) {
    try {
      const transformedImage =
        await this.prismaService.transformedImage.findUnique({
          where: {
            id,
          },
          include: {
            originalImage: true,
          },
        });

      if (!transformedImage) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      if (transformedImage.originalImage.userId !== userId) {
        throw new ForbiddenException(
          `You do not have permission to access this transformed image`,
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, originalImage, ...rest } = transformedImage;

      return {
        ...rest,
        url:
          this.baseUrl + '/transformed-images/' + transformedImage.id + '/view',
      };
    } catch (error) {
      this.handleError(error, `fetch transformed image with ID ${id}`);
    }
  }

  async viewOrDownload(
    id: string,
    query: ViewOrDownloadImageDto,
    res: Response,
  ) {
    const { download } = query;
    const transformedImage =
      await this.prismaService.transformedImage.findUnique({
        where: {
          id,
        },
        include: {
          originalImage: true,
        },
      });

    if (!transformedImage) {
      throw new BadRequestException(
        `Transformed image with ID ${id} not found`,
      );
    }

    const stream = await this.awsS3Service.getFileStream(transformedImage.key);
    const format = transformedImage.originalImage.format;

    res.setHeader('Content-Type', 'image/' + format);

    if (download) {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${transformedImage.originalImage.originalName}"`,
      );
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    stream.pipe(res);
  }

  async remove(userId: string, id: string) {
    try {
      const transformedImage = await this.prismaService.transformedImage.delete(
        {
          where: {
            id,
          },
          include: {
            originalImage: true,
          },
        },
      );

      if (!transformedImage) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      if (transformedImage.originalImage.userId !== userId) {
        throw new ForbiddenException(
          `You do not have permission to delete this transformed image`,
        );
      }

      await this.awsS3Service.deleteFile(transformedImage.key);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, originalImage, ...rest } = transformedImage;

      return {
        ...rest,
        url:
          this.baseUrl + '/transformed-images/' + transformedImage.id + '/view',
      };
    } catch (error) {
      this.handleError(error, `delete transformed image with ID ${id}`);
    }
  }
}
