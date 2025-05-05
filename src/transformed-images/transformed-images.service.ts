import * as sharp from 'sharp';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Response } from 'express';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';
import { ConfigService } from '@nestjs/config';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';
import { InputJsonObject } from 'generated/prisma/runtime/library';

@Injectable()
export class TransformedImagesService {
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
      const transformedTransformedImage =
        await this.prismaService.transformedImage.create({
          data: {
            originalImageId: transformedImage.originalImage.id,
            key,
            transformation: transformImageDto as InputJsonObject,
            parentId: transformedImage.id,
          },
        });

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
