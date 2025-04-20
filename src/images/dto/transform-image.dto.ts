import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsPositive,
} from 'class-validator';

export class ResizeOptions {
  /**
   * Target width in pixels
   * @example 800
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  width?: number;

  /**
   * Target height in pixels
   * @example 600
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  height?: number;
}

export class TransformImageDto {
  /**
   * Resize options for the image
   */
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ResizeOptions)
  resize?: ResizeOptions;

  /**
   * Convert image to grayscale
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;
}
