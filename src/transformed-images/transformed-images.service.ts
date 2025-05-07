import * as sharp from 'sharp';
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
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
import { InputJsonObject } from 'generated/prisma/runtime/library';
import { TransformedImage } from 'generated/prisma';

@Injectable()
export class TransformedImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
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

  private transformImage = async (
    imageBuffer: Buffer,
    transformImageDto: TransformImageDto,
  ) => {
    let transformedImage = sharp(imageBuffer);

    // Resize
    if (transformImageDto.resize) {
      const { width, height, fit } = transformImageDto.resize;

      if (width && height) {
        transformedImage = transformedImage.resize({
          width,
          height,
          fit: fit || 'cover',
        });
      } else if (width) {
        transformedImage = transformedImage.resize({
          width,
          fit: fit || 'cover',
        });
      } else if (height) {
        transformedImage = transformedImage.resize({
          height,
          fit: fit || 'cover',
        });
      }
    }

    // Crop
    if (transformImageDto.crop) {
      const metadata = await transformedImage.metadata();
      const { width: imgWidth, height: imgHeight } = metadata;
      const { width, height, left, top } = transformImageDto.crop;

      if (left + width > imgWidth || top + height > imgHeight) {
        throw new BadRequestException('Crop area is out of bounds');
      }

      transformedImage = transformedImage.extract({
        left,
        top,
        width,
        height,
      });
    }

    // Rotate
    if (transformImageDto.rotate) {
      transformedImage = transformedImage.rotate(transformImageDto.rotate);
    }

    // Grayscale
    if (transformImageDto.grayscale) {
      transformedImage = transformedImage.grayscale();
    }

    // Tint
    if (transformImageDto.tint) {
      transformedImage = transformedImage.tint(transformImageDto.tint);
    }

    // 3. Final transformed image buffer
    return await transformedImage.toBuffer();
  };

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
      let transformedTransformedImage: TransformedImage =
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

      const transformedImageBuffer = await this.awsS3Service.getFileBuffer(
        transformedImage.key,
      );
      const transformedTransformedImageBuffer = await this.transformImage(
        transformedImageBuffer,
        transformImageDto,
      );
      const expressMulterFile = {
        buffer: transformedTransformedImageBuffer,
        originalname: transformedImage.originalImage.originalName,
        mimetype: `image/${transformedImage.originalImage.format}`,
      } as Express.Multer.File;
      const key = await this.awsS3Service.uploadFile(
        expressMulterFile,
        `${userId}/transformations`,
      );
      transformedTransformedImage =
        await this.prismaService.transformedImage.create({
          data: {
            originalImageId: transformedImage.originalImage.id,
            key,
            transformation: transformImageDto as unknown as InputJsonObject,
            parentId: transformedImage.id,
          },
        });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _, ...rest } = transformedTransformedImage;
      const response = {
        ...rest,
        url:
          this.baseUrl +
          '/transformed-images/' +
          transformedTransformedImage.id +
          '/view',
      };

      await this.cacheManager.set(
        transformedTransformedImageCacheKey,
        response,
      );

      return response;
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
