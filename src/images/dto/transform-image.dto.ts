import { Type } from 'class-transformer';
import {
  IsOptional,
  IsInt,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsPositive,
  IsIn,
  IsDefined,
  IsNumber,
  Min,
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

  /**
   * Resize fit mode
   * @example contain
   */
  @IsOptional()
  @IsIn(['contain', 'cover', 'fill', 'inside', 'outside'])
  fit?: 'contain' | 'cover' | 'fill' | 'inside' | 'outside';
}

export class CropOptions {
  /**
   * Crop left position
   * @example 100
   */
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  left: number;

  /**
   * Crop top position
   * @example 50
   */
  @IsDefined()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  top: number;

  /**
   * Crop width
   * @example 300
   */
  @IsDefined()
  @IsPositive()
  width: number;

  /**
   * Crop height
   * @example 200
   */
  @IsDefined()
  @IsPositive()
  height: number;
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
   * Crop options for the image
   * @example { "left": 100, "top": 50, "width": 300, "height": 200 }
   */
  @Type(() => CropOptions)
  @IsOptional()
  @IsObject()
  @ValidateNested()
  crop?: CropOptions;

  /**
   * Convert image to grayscale
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;
}
