import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { Response } from 'express';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';
import { Public } from 'src/public/public.decorator';
import { UserId } from 'src/user-id/user-id.decorator';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';
import { ThrottlerGuard } from '@nestjs/throttler';

@ApiTags('TransformedImages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transformed-images')
export class TransformedImagesController {
  constructor(
    private readonly transformedImagesService: TransformedImagesService,
  ) {}

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

  @UseGuards(ThrottlerGuard)
  @Post(':id/transform')
  transform(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() transformImageDto: TransformImageDto,
  ) {
    this.validateTransformations(transformImageDto);
    this.validateOrderIntegrity(transformImageDto);

    return this.transformedImagesService.transform(
      userId,
      id,
      transformImageDto,
    );
  }

  @Get()
  findAll(@UserId() userId: string) {
    return this.transformedImagesService.findAll(userId);
  }

  @Get(':id')
  findOne(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.findOne(userId, id);
  }

  @Public()
  @Get(':id/view')
  viewOrDownload(
    @Param('id') id: string,
    @Query() query: ViewOrDownloadImageDto,
    @Res() res: Response,
  ) {
    return this.transformedImagesService.viewOrDownload(id, query, res);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.remove(userId, id);
  }
}
