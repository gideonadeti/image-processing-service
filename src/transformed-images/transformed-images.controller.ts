import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { Response } from 'express';
import { ViewOrDownloadImageDto } from 'src/images/dto/view-or-download-image.dto';

@ApiTags('TransformedImages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transformed-images')
export class TransformedImagesController {
  constructor(
    private readonly transformedImagesService: TransformedImagesService,
  ) {}

  @Get()
  findAll() {
    return this.transformedImagesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.transformedImagesService.findOne(+id);
  }

  @Get(':id/view')
  viewOrDownload(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query() query: ViewOrDownloadImageDto,
    @Res() res: Response,
  ) {
    return this.transformedImagesService.viewOrDownload(userId, id, res, query);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transformedImagesService.remove(+id);
  }
}
