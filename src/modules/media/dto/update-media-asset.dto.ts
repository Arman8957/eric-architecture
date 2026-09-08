// dto/update-media-asset.dto.ts
import { Type } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One crop window, as a fraction of the original image rather than pixels, so
 * the same numbers stay correct against every rendition Cloudinary derives.
 *
 * `x`/`y` are the top-left corner. A width or height of 0 would ask for an
 * empty picture, so both start above zero; the service is what guarantees the
 * rectangle also stays inside the frame.
 */
export class CropRectDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  x: number;

  @IsNumber()
  @Min(0)
  @Max(1)
  y: number;

  @IsNumber()
  @Min(0.01)
  @Max(1)
  width: number;

  @IsNumber()
  @Min(0.01)
  @Max(1)
  height: number;
}

/**
 * Wide covers desktop and landscape tablets, tall covers phones. Either may be
 * left out, which hands that shape back to the client's automatic fit.
 */
export class AssetCropDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CropRectDto)
  wide?: CropRectDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CropRectDto)
  tall?: CropRectDto | null;
}

export class UpdateMediaAssetDto {
  /** Null clears both crops and restores the automatic behaviour. */
  @IsOptional()
  @ValidateNested()
  @Type(() => AssetCropDto)
  crop?: AssetCropDto | null;

  @IsString()
  @IsOptional()
  altText?: string;
}
