import * as sharp from 'sharp';
import {
  BadRequestException,
  ForbiddenException,
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

@Injectable()
export class ImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
    private readonly configService: ConfigService,
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
        select: {
          id: true,
          userId: true,
          originalName: true,
          size: true,
          format: true,
          key: false,
          createdAt: true,
          updatedAt: true,
        },
      });

      return {
        ...image,
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
      const transformedImage = await this.prismaService.transformedImage.create(
        {
          data: {
            originalImageId: image.id,
            key,
            transformation: transformImageDto as InputJsonObject,
          },
        },
      );

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key: _, ...rest } = transformedImage;

      return {
        ...rest,
        url:
          this.baseUrl + '/transformed-images/' + transformedImage.id + '/view',
      };
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
          select: {
            id: true,
            userId: true,
            originalName: true,
            size: true,
            format: true,
            key: false,
            createdAt: true,
            updatedAt: true,
          },
        });

        return images.map((image) => ({
          ...image,
          url: this.baseUrl + '/images/' + image.id + '/view',
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

  async findOne(id: string) {
    const image = await this.prismaService.image.findUnique({
      where: {
        id,
      },
      select: {
        id: true,
        userId: true,
        originalName: true,
        size: true,
        format: true,
        key: false,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!image) {
      throw new BadRequestException(`Image with ID ${id} not found`);
    }

    return {
      ...image,
      url: this.baseUrl + '/images/' + image.id + '/view',
    };
  }

  async viewOrDownload(
    id: string,
    query: ViewOrDownloadImageDto,
    res: Response,
  ) {
    const { download } = query;
    const image = await this.prismaService.image.findUnique({
      where: {
        id,
      },
      select: {
        key: true,
        format: true,
        originalName: true,
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
  }

  async remove(id: string) {
    try {
      const image = await this.prismaService.image.delete({
        where: {
          id,
        },
      });

      if (!image) {
        throw new BadRequestException(`Image with ID ${id} not found`);
      }

      await this.awsS3Service.deleteFile(image.key);

      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { key, ...rest } = image;

      return {
        ...rest,
        url: this.baseUrl + '/images/' + image.id + '/view',
      };
    } catch (error) {
      this.handleError(error, `delete image with ID ${id}`);
    }
  }
}
