import sharp from 'sharp';

import { AppError } from '../../common/errors/app-error';
import { cleanImage, sniffImage } from './clean-image';

const photo = (w = 800, h = 600) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 60 } } });

describe('sniffImage', () => {
  it('reads the real type from the bytes, not the name', async () => {
    expect(sniffImage(await photo().jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImage(await photo().png().toBuffer())).toBe('png');
    expect(sniffImage(await photo().webp().toBuffer())).toBe('webp');
    expect(sniffImage(await photo().gif().toBuffer())).toBeNull();
    expect(sniffImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).toBeNull();
    expect(sniffImage(Buffer.from('%PDF-1.7'))).toBeNull();
    expect(sniffImage(Buffer.alloc(0))).toBeNull();
  });
});

describe('cleanImage', () => {
  it('drops GPS and every other piece of metadata', async () => {
    const withGps = await photo()
      .jpeg()
      .withExif({ IFD0: { Make: 'PhoneCo', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '33/1 41/1 0/1', GPSLongitudeRef: 'E', GPSLongitude: '73/1 3/1 0/1' } })
      .toBuffer();
    expect((await sharp(withGps).metadata()).exif).toBeDefined();

    const out = await cleanImage(withGps, 1600);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.exif).toBeUndefined();
    expect(meta.icc).toBeUndefined();
    expect(meta.xmp).toBeUndefined();
    expect(out.buffer.includes(Buffer.from('PhoneCo'))).toBe(false);
  });

  it('removes anything hidden after the image data', async () => {
    const hidden = Buffer.concat([await photo().jpeg().toBuffer(), Buffer.from('PK\u0003\u0004 secret-archive-payload')]);
    const out = await cleanImage(hidden, 1600);
    expect(out.buffer.includes(Buffer.from('secret-archive-payload'))).toBe(false);
  });

  it('turns PNG and WebP into a JPEG, keeps the shape, caps the size', async () => {
    const big = await cleanImage(await photo(4000, 2000).png().toBuffer(), 1600);
    expect(big).toMatchObject({ mime: 'image/jpeg', ext: 'jpg', width: 1600, height: 800 });
    expect(sniffImage(big.buffer)).toBe('jpeg');

    const small = await cleanImage(await photo(300, 400).webp().toBuffer(), 1600);
    expect(small).toMatchObject({ width: 300, height: 400 });
  });

  it('applies the camera rotation so photos come out upright', async () => {
    const sideways = await photo(800, 600).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const out = await cleanImage(sideways, 1600);
    expect([out.width, out.height]).toEqual([600, 800]);
  });

  it('flattens transparency onto white', async () => {
    const clear = await sharp({ create: { width: 10, height: 10, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const { data } = await sharp((await cleanImage(clear, 1600)).buffer).raw().toBuffer({ resolveWithObject: true });
    expect(data[0]).toBeGreaterThan(240);
  });

  it('refuses files that only claim to be images', async () => {
    await expect(cleanImage(Buffer.from('MZ\x90\x00 an exe'), 1600)).rejects.toMatchObject({ status: 415 });
    await expect(cleanImage(await photo().gif().toBuffer(), 1600)).rejects.toBeInstanceOf(AppError);
  });

  it('refuses broken files that start like a JPEG', async () => {
    await expect(cleanImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 1, 2, 3]), 1600)).rejects.toMatchObject({ status: 415 });
  });

  it('refuses decompression bombs (more than 40 megapixels)', async () => {
    const huge = await sharp({ create: { width: 10000, height: 5000, channels: 3, background: '#000' } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(cleanImage(huge, 1600)).rejects.toMatchObject({ status: 415 });
  });
});
