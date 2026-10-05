import { Logger } from '@nestjs/common';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { StorageProvider } from './storage.provider';

const log = new Logger('Media');

/** Keys we never serve: empty or dot segments, and the private/ prefix (single-bucket setups). */
export function isServableKey(key: string): boolean {
  if (!key || key.startsWith('private/')) return false;
  return key.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

/**
 * `GET|HEAD /media/<key>` streamed from the public bucket (STORAGE_DRIVER=s3 with no CDN in
 * front). The bucket stays on the private Docker network; only the API reaches it. Every upload
 * gets a new key (`avatars/<id>/<timestamp>.jpg`), so responses are cached for a year.
 * Keys missing from the bucket fall through to the next handler (files on disk).
 */
export function serveMedia(storage: StorageProvider): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    let key: string;
    try {
      key = decodeURIComponent(req.path.replace(/^\/+/, ''));
    } catch {
      return void res.sendStatus(400);
    }
    if (!isServableKey(key)) return void res.sendStatus(404);

    storage
      .open(key, { ifNoneMatch: req.get('if-none-match') })
      .then((obj) => {
        if (!obj) return next(); // not in the bucket: try files on disk (uploaded before the switch to s3)
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        if (obj.etag) res.setHeader('ETag', obj.etag);
        if (obj.notModified) return void res.status(304).end();
        res.setHeader('Content-Type', obj.contentType || 'application/octet-stream');
        if (obj.contentLength != null) res.setHeader('Content-Length', String(obj.contentLength));
        if (obj.lastModified) res.setHeader('Last-Modified', obj.lastModified.toUTCString());
        const body = obj.body;
        if (!body || req.method === 'HEAD') {
          body?.destroy();
          return void res.end();
        }
        body.on('error', (e) => {
          log.warn(`stream ${key} failed: ${e.message}`);
          res.destroy(e);
        });
        res.on('close', () => body.destroy());
        body.pipe(res);
      })
      .catch((e: Error) => {
        log.error(`open ${key} failed: ${e.message}`);
        if (!res.headersSent) res.sendStatus(502);
      });
  };
}
