import { Type } from 'class-transformer';
import {
  IsOptional,
  IsBoolean,
  ValidateNested,
  IsObject,
  IsPositive,
  IsIn,
  IsDefined,
  IsInt,
  Min,
  Max,
  IsArray,
  ArrayNotEmpty,
  ArrayUnique,
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
   * Rotate image in degrees
   * @example 90
   */
  @IsOptional()
  @IsInt()
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
   * @example ['resize', 'rotate']
   */
  @IsDefined()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(['resize', 'rotate', 'grayscale', 'tint'], { each: true })
  order: Array<'resize' | 'rotate' | 'grayscale' | 'tint'>;
}
