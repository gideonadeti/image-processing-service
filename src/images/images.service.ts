import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';

import { UpdateImageDto } from './dto/update-image.dto';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

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
    }

    throw new InternalServerErrorException(`Failed to ${action}`);
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

  async findAll(userId: string) {
    try {
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

  async viewOrDownload(id: string, res: Response, download?: string) {
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

    if (download === 'true') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${image.originalName}"`,
      );
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    stream.pipe(res);
  }

  update(id: number, updateImageDto: UpdateImageDto) {
    return `This action updates a #${id} image`;
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
