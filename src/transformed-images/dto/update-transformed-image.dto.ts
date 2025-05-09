import { PartialType } from '@nestjs/swagger';
import { CreateTransformedImageDto } from './create-transformed-image.dto';

export class UpdateTransformedImageDto extends PartialType(CreateTransformedImageDto) {}
