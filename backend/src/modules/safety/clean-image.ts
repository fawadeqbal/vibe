import { HttpStatus } from '@nestjs/common';
import sharp from 'sharp';

import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';

export type ImageType = 'jpeg' | 'png' | 'webp';

/** A photo as we store it: re-encoded JPEG, no metadata, upright, longest side ≤ maxSide. */
export interface CleanImage {
  buffer: Buffer;
  mime: 'image/jpeg';
  ext: 'jpg';
  width: number;
  height: number;
}

/** 40 MP: bigger than any phone photo, small enough that a "decompression bomb" can't eat the server. */
const MAX_INPUT_PIXELS = 40_000_000;

/**
 * What the bytes really are, from their first bytes — never from the file
 * name or the Content-Type the client sent. Only JPEG, PNG and still WebP.
 */
export function sniffImage(b: Buffer): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  return null;
}

const unsupported = () => new AppError(ErrorCode.VALIDATION_FAILED, 'Use a JPEG, PNG or WebP photo', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
const unreadable = () => new AppError(ErrorCode.VALIDATION_FAILED, "That photo couldn't be read. Try another one.", HttpStatus.UNSUPPORTED_MEDIA_TYPE);

/**
 * Every uploaded photo is decoded and drawn again as a fresh JPEG. That
 * drops EXIF (GPS location, phone model, time), anything hidden after the
 * image data, and extra frames of an animation; applies the camera's
 * rotation; and caps the size. What we store and serve is only pixels.
 */
export async function cleanImage(input: Buffer, maxSide: number): Promise<CleanImage> {
  if (!sniffImage(input)) throw unsupported();
  try {
    const { data, info } = await sharp(input, { failOn: 'error', limitInputPixels: MAX_INPUT_PIXELS, animated: false })
      .rotate()
      .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, mime: 'image/jpeg', ext: 'jpg', width: info.width, height: info.height };
  } catch {
    throw unreadable();
  }
}
