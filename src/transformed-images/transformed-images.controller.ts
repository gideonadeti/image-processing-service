import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
  Post,
  Body,
  BadRequestException,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { TransformImageDto } from 'src/images/dto/transform-image.dto';

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
    const hasRotate = dto.rotate != null;
    const hasGrayscale = dto.grayscale === true;
    const hasTint = dto.tint != null;

    if (!hasResize && !hasRotate && !hasGrayscale && !hasTint) {
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
    const activeTransforms: Array<'resize' | 'rotate' | 'grayscale' | 'tint'> =
      [];

    if (dto.resize && (dto.resize.width || dto.resize.height))
      activeTransforms.push('resize');
    if (dto.rotate != null) activeTransforms.push('rotate');
    if (dto.grayscale === true) activeTransforms.push('grayscale');
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

  @Get(':id')
  findOne(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.findOne(userId, id);
  }

  @Delete(':id')
  remove(@UserId() userId: string, @Param('id') id: string) {
    return this.transformedImagesService.remove(userId, id);
  }
}
