import * as sharp from 'sharp';
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
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { FindAllImagesDto } from './dto/find-all-images.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { ViewOrDownloadImageDto } from './dto/view-or-download-image.dto';
import { InputJsonObject } from 'generated/prisma/runtime/library';
import { TransformedImage } from 'generated/prisma';

@Injectable()
export class ImagesService {
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

  private generateTransformedImageCacheKey(
    userId: string,
    imageId: string,
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

    return `${userId}:transformations:${imageId}-${hash}`;
  }

  async create(userId: string, file: Express.Multer.File) {
    const format = file.mimetype.split('/')[1];

    try {
      const key = await this.awsS3Service.uploadFile(file, userId);
      const image = await this.prismaService.image.create({
        data: {
          userId,
          originalName: file.originalname,
          size: file.size,
          format,
          key,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _a, userId: _b, ...rest } = image;

      return {
        ...rest,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, 'upload image');
    }
  }

  async transform(
    userId: string,
    id: string,
    transformImageDto: TransformImageDto,
  ) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
        },
      });

      if (!image) {
        throw new BadRequestException('Image not found');
      }

      if (image.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to transform this image',
        );
      }

      const transformedImageCacheKey = this.generateTransformedImageCacheKey(
        userId,
        id,
        transformImageDto,
      );
      let transformedImage: TransformedImage = await this.cacheManager.get(
        transformedImageCacheKey,
      );

      if (transformedImage) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { key: _, ...rest } = transformedImage;

        return {
          ...rest,
          url:
            this.baseUrl +
            '/transformed-images/' +
            transformedImage.id +
            '/view',
        };
      }

      const imageBuffer = await this.awsS3Service.getFileBuffer(image.key);
      const transformedImageBuffer = await this.transformImage(
        imageBuffer,
        transformImageDto,
      );
      const expressMulterFile = {
        buffer: transformedImageBuffer,
        originalname: image.originalName,
        mimetype: `image/${image.format}`,
      } as Express.Multer.File;
      const key = await this.awsS3Service.uploadFile(
        expressMulterFile,
        `${userId}/transformations`,
      );
      transformedImage = await this.prismaService.transformedImage.create({
        data: {
          originalImageId: image.id,
          key,
          transformation: transformImageDto as unknown as InputJsonObject,
        },
      });

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _, ...rest } = transformedImage;
      const response = {
        ...rest,
        url:
          this.baseUrl + '/transformed-images/' + transformedImage.id + '/view',
      };

      await this.cacheManager.set(transformedImageCacheKey, response);

      return response;
    } catch (error) {
      this.handleError(error, 'transform image');
    }
  }

  async findAll(userId: string, query: FindAllImagesDto) {
    const { originalName, minSize, maxSize, sortBy, order, limit, page } =
      query;

    const whereConditions: any = {};

    if (originalName) {
      whereConditions.originalName = {
        contains: originalName,
        mode: 'insensitive',
      };
    }

    if (minSize !== undefined || maxSize !== undefined) {
      whereConditions.size = {};

      if (minSize !== undefined) {
        whereConditions.size.gte = Number(minSize) * 1024 * 1024; // Convert MB to bytes
      }
      if (maxSize !== undefined) {
        whereConditions.size.lte = Number(maxSize) * 1024 * 1024;
      }
    }

    try {
      if (!page && !limit) {
        const images = await this.prismaService.image.findMany({
          where: {
            userId,
          },
        });

        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        return images.map(({ key, userId, ...rest }) => ({
          ...rest,
          url: this.baseUrl + '/images/' + rest.id + '/view',
        }));
      }

      const numberPage = page ? Number(page) : 1;
      const numberLimit = limit ? Number(limit) : 10;
      const total = await this.prismaService.image.count({
        where: whereConditions,
      });
      const lastPage = Math.ceil(total / numberLimit);
      const images = await this.prismaService.image.findMany({
        where: whereConditions,
        orderBy: {
          [sortBy]: order,
        },
        skip: (numberPage - 1) * numberLimit,
        take: numberLimit,
      });
      const imagesWithUrl = images.map((image) => ({
        ...image,
        url: this.baseUrl + '/images/' + image.id + '/view',
      }));

      return {
        imagesWithUrl,
        meta: {
          total,
          page: numberPage,
          lastPage,
          hasNextPage: numberPage < lastPage,
          hasPreviousPage: numberPage > 1,
        },
      };
    } catch (error) {
      this.handleError(error, `'fetch images for user with ID ${userId}'`);
    }
  }

  async findOne(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      if (image.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to view this image',
        );
      }

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, userId: _, ...rest } = image;

      return {
        ...rest,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, `fetch image with ID ${id}`);
    }
  }

  async findAllTransformed(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
        },
        include: {
          transformedImages: true,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      if (image.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to view transformed images of this image',
        );
      }

      const { transformedImages } = image;

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return transformedImages.map(({ key, originalImageId, ...rest }) => ({
        ...rest,
        url: this.baseUrl + '/transformed-images/' + rest.id + '/view',
      }));
    } catch (error) {
      this.handleError(
        error,
        `fetch transformed images of image with ID ${id}`,
      );
    }
  }

  async viewOrDownload(
    id: string,
    query: ViewOrDownloadImageDto,
    res: Response,
  ) {
    const { download } = query;

    try {
      const image = await this.prismaService.image.findUnique({
        where: {
          id,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      const stream = await this.awsS3Service.getFileStream(image.key);

      res.setHeader('Content-Type', 'image/' + image.format);

      if (download) {
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${image.originalName}"`,
        );
      } else {
        res.setHeader('Content-Disposition', 'inline');
      }

      stream.pipe(res);
    } catch (error) {
      this.handleError(error, `view or download image with ID ${id}`);
    }
  }

  async remove(userId: string, id: string) {
    try {
      const image = await this.prismaService.image.delete({
        where: {
          id,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      if (image.userId !== userId) {
        throw new ForbiddenException(
          'You are not authorized to delete this image',
        );
      }

      await this.awsS3Service.deleteFile(image.key);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, userId: _, ...rest } = image;

      return {
        ...rest,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, `delete image with ID ${id}`);
    }
  }
}
