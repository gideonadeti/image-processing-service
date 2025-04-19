import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateTransformedImageDto } from './dto/create-transformed-image.dto';
import { UpdateTransformedImageDto } from './dto/update-transformed-image.dto';
import { AwsS3Service } from 'src/aws-s3/aws-s3.service';
import { PrismaService } from 'src/prisma/prisma.service';
import { Response } from 'express';

@Injectable()
export class TransformedImagesService {
  constructor(
    private readonly awsS3Service: AwsS3Service,
    private readonly prismaService: PrismaService,
  ) {}

  create(createTransformedImageDto: CreateTransformedImageDto) {
    return 'This action adds a new transformedImage';
  }

  findAll() {
    return `This action returns all transformedImages`;
  }

  findOne(id: number) {
    return `This action returns a #${id} transformedImage`;
  }

  async viewOrDownload(
    userId: string,
    id: string,
    res: Response,
    download?: string,
  ) {
    const transformedImage =
      await this.prismaService.transformedImage.findUnique({
        where: {
          id,
        },
        include: {
          originalImage: true,
          transformation: true,
        },
      });

    if (!transformedImage) {
      throw new BadRequestException(
        `Transformed image with ID ${id} not found`,
      );
    }

    const stream = await this.awsS3Service.getFileStream(transformedImage.key);

    res.setHeader(
      'Content-Type',
      'image/' + transformedImage.transformation.format,
    );

    if (download === 'true') {
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${transformedImage.originalImage.originalName}"`,
      );
    } else {
      res.setHeader('Content-Disposition', 'inline');
    }

    stream.pipe(res);
  }

  update(id: number, updateTransformedImageDto: UpdateTransformedImageDto) {
    return `This action updates a #${id} transformedImage`;
  }

  remove(id: number) {
    return `This action removes a #${id} transformedImage`;
  }
}
