import { Type } from 'class-transformer';
import {
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsPositive,
  IsIn,
  IsDefined,
  IsNumber,
  Min,
  Max,
} from 'class-validator';

export class ResizeOptions {
  /**
   * Target width in pixels
   * @example 800
   */
  @IsOptional()
  @IsPositive()
  width?: number;

  /**
   * Target height in pixels
   * @example 600
   */
  @IsOptional()
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
  @Type(() => ResizeOptions)
  @IsOptional()
  @IsObject()
  @ValidateNested()
  resize?: ResizeOptions;

  /**
   * Crop options for the image
   */
  @Type(() => CropOptions)
  @IsOptional()
  @IsObject()
  @ValidateNested()
  crop?: CropOptions;

  /**
   * Rotate image in degrees
   * @example 90
   */
  @IsOptional()
  @IsNumber()
  @Min(-360)
  @Max(360)
  rotate?: number;

  /**
   * Convert image to grayscale
   * @example true
   */
  @IsOptional()
  @IsBoolean()
  grayscale?: boolean;

  /**
   * Tint color to apply to the image.
   * Accepts any valid color string supported by the 'color' package.
   *
   * Examples:
   * - 'red'                      // Named color
   * - '#ffcc00'                 // Hex
   * - '#fc0'                    // Short hex
   * - 'rgb(255, 204, 0)'        // RGB
   * - 'rgba(255, 204, 0, 0.5)'  // RGBA
   * - 'hsl(45, 100%, 50%)'      // HSL
   * - 'hsla(45, 100%, 50%, 0.5)'// HSLA
   *
   * @example 'red'
   */
  @IsOptional()
  tint?: string;

  /**
   * Order of transformations to apply.
   * @example ['resize', 'crop', 'rotate']
   */
  @IsOptional()
  @IsIn(['resize', 'crop', 'rotate', 'grayscale', 'tint'], { each: true })
  order?: Array<'resize' | 'crop' | 'rotate' | 'grayscale' | 'tint'>;
}
