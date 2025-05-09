import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipeBuilder,
  Res,
  Query,
  BadRequestException,
} from '@nestjs/common';

import { ImagesService } from './images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { FindAllImagesDto } from './dto/find-all-images.dto';
import { TransformImageDto } from './dto/transform-image.dto';
import { ViewOrDownloadImageDto } from './dto/view-or-download-image.dto';
import { Public } from 'src/public/public.decorator';

@ApiTags('Images')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('images')
export class ImagesController {
  constructor(private readonly imagesService: ImagesService) {}

  private validateTransformations(dto: TransformImageDto) {
    const hasResize =
      dto.resize && (dto.resize.width != null || dto.resize.height != null);
    const hasCrop = dto.crop != null;
    const hasRotate = dto.rotate != null;
    const hasGrayscale = dto.grayscale != null;
    const hasTint = dto.tint != null;

    if (!hasResize && !hasCrop && !hasRotate && !hasGrayscale && !hasTint) {
      throw new BadRequestException(
        'At least one valid transformation option must be provided.',
      );
    }

    if (dto.resize?.fit != null && !dto.resize?.width && !dto.resize?.height) {
      throw new BadRequestException(
        "If 'fit' is provided, either 'width' or 'height' must also be provided.",
      );
    }
  }

  private validateOrderIntegrity(dto: TransformImageDto) {
    const activeTransforms: Array<
      'resize' | 'crop' | 'rotate' | 'grayscale' | 'tint'
    > = [];

    if (dto.resize && (dto.resize.width || dto.resize.height))
      activeTransforms.push('resize');
    if (dto.crop) activeTransforms.push('crop');
    if (dto.rotate != null) activeTransforms.push('rotate');
    if (dto.grayscale != null) activeTransforms.push('grayscale');
    if (dto.tint != null) activeTransforms.push('tint');

    const invalidSteps = dto.order.filter(
      (step) => !activeTransforms.includes(step),
    );

    if (invalidSteps.length > 0) {
      throw new BadRequestException(
        `The following steps are in 'order' but not actually configured: ${invalidSteps.join(', ')}`,
      );
    }

    const missingSteps = activeTransforms.filter(
      (step) => !dto.order.includes(step),
    );

    if (missingSteps.length > 0) {
      throw new BadRequestException(
        `Missing transformation steps in 'order': ${missingSteps.join(', ')}`,
      );
    }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  create(
    @UserId() userId: string,
    @UploadedFile(
      new ParseFilePipeBuilder()
        .addFileTypeValidator({
          fileType: 'image/*',
        })
        .addMaxSizeValidator({
          maxSize: 1024 * 1024 * 10, // 10MB
        })
        .build(),
    )
    file: Express.Multer.File,
  ) {
    return this.imagesService.create(userId, file);
  }

  @UseGuards(ThrottlerGuard)
  @Post(':id/transform')
  transform(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() transformImageDto: TransformImageDto,
  ) {
    this.validateTransformations(transformImageDto);
    this.validateOrderIntegrity(transformImageDto);

    return this.imagesService.transform(userId, id, transformImageDto);
  }

  @Get()
  findAll(@UserId() userId: string, @Query() query: FindAllImagesDto) {
    return this.imagesService.findAll(userId, query);
  }

  @Get(':id')
  findOne(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.findOne(userId, id);
  }

  @Public()
  @Get(':id/view')
  viewOrDownload(
    @Param('id') id: string,
    @Query() query: ViewOrDownloadImageDto,
    @Res() res: Response,
  ) {
    return this.imagesService.viewOrDownload(id, query, res);
  }

  @Get(':id/transformed')
  findAllTransformed(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.findAllTransformed(userId, id);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.imagesService.remove(userId, id);
  }
}
