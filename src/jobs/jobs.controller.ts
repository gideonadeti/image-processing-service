import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JobsService } from './jobs.service';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard';
import { UserId } from 'src/user-id/user-id.decorator';
import { QueueDto } from './dto/queue.dto';

@ApiTags('Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':id')
  findOne(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query() query: QueueDto,
  ) {
    return this.jobsService.findOne(userId, id, query);
  }
}
