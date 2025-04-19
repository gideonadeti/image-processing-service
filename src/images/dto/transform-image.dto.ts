import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  IsIn,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsPositive,
  Max,
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
   * Output image format
   * @example "webp"
   */
  @IsOptional()
  @IsIn(['jpeg', 'png', 'webp', 'avif'])
  format?: 'jpeg' | 'png' | 'webp' | 'avif';

  /**
   * Image quality (1–100). Applies to lossy formats like jpeg/webp.
   * @example 85
   */
  @IsOptional()
  @IsInt()
  @IsPositive()
  @Max(100)
  quality?: number;

  /**
   * Convert image to grayscale
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;
}
