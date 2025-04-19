import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
  Res,
} from '@nestjs/common';

import { TransformedImagesService } from './transformed-images.service';
import { CreateTransformedImageDto } from './dto/create-transformed-image.dto';
import { UpdateTransformedImageDto } from './dto/update-transformed-image.dto';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { Response } from 'express';

@ApiTags('TransformedImages')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('transformed-images')
export class TransformedImagesController {
  constructor(
    private readonly transformedImagesService: TransformedImagesService,
  ) {}

  @Post()
  create(@Body() createTransformedImageDto: CreateTransformedImageDto) {
    return this.transformedImagesService.create(createTransformedImageDto);
  }

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
    @Query('download') download: string,
    @Res() res: Response,
  ) {
    return this.transformedImagesService.viewOrDownload(
      userId,
      id,
      res,
      download,
    );
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateTransformedImageDto: UpdateTransformedImageDto,
  ) {
    return this.transformedImagesService.update(+id, updateTransformedImageDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.transformedImagesService.remove(+id);
  }
}
