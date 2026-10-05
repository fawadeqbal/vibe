import type { Readable } from 'node:stream';

/** Options for one stored object. */
export interface StoreOptions {
  /**
   * Private objects (selfies awaiting review) are never served publicly:
   * they live outside the public folder/bucket and are read by the API or
   * through short-lived signed URLs.
   */
  private?: boolean;
}

/** A public object opened for streaming to a client (`GET /media/<key>`). */
export interface OpenedObject {
  /** The stored ETag matched If-None-Match: answer 304, there is no body. */
  notModified?: boolean;
  body?: Readable;
  contentType?: string;
  contentLength?: number;
  etag?: string;
  lastModified?: Date;
}

/** Where uploaded media goes. Callers never know which driver is behind it. */
export abstract class StorageProvider {
  /** Stores bytes under `key`. Returns the public URL (public objects) or the key (private ones). */
  abstract put(key: string, data: Buffer, contentType: string, opts?: StoreOptions): Promise<string>;
  abstract delete(key: string, opts?: StoreOptions): Promise<void>;
  /** Reads an object back (KYC face matching, staff review). Null when missing. */
  abstract read(key: string, opts?: StoreOptions): Promise<Buffer | null>;
  /** Streams a *public* object (null when missing). Used when the API itself serves `/media`. */
  abstract open(key: string, opts?: { ifNoneMatch?: string }): Promise<OpenedObject | null>;
  /** The key of one of *our* public URLs (null for anything else, e.g. external avatars). */
  abstract keyFromUrl(url: string): string | null;
}
