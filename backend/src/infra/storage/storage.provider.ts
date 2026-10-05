/** Options for one stored object. */
export interface StoreOptions {
  /**
   * Private objects (selfies awaiting review) are never served publicly:
   * they live outside the public folder/bucket and are read by the API or
   * through short-lived signed URLs.
   */
  private?: boolean;
}

/** Where uploaded media goes. Callers never know which driver is behind it. */
export abstract class StorageProvider {
  /** Stores bytes under `key`. Returns the public URL (public objects) or the key (private ones). */
  abstract put(key: string, data: Buffer, contentType: string, opts?: StoreOptions): Promise<string>;
  abstract delete(key: string, opts?: StoreOptions): Promise<void>;
  /** Reads an object back (KYC face matching, staff review). Null when missing. */
  abstract read(key: string, opts?: StoreOptions): Promise<Buffer | null>;
  /** The key of one of *our* public URLs (null for anything else, e.g. external avatars). */
  abstract keyFromUrl(url: string): string | null;
}
