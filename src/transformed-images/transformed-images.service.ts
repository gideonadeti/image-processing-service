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

  findOne(id: number) {
    return `This action returns a #${id} transformedImage`;
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

  remove(id: number) {
    return `This action removes a #${id} transformedImage`;
  }
}
