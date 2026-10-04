/** Where uploaded media goes. Swap the local driver for S3/GCS without touching callers. */
export abstract class StorageProvider {
  /** Stores bytes under `key` and returns a public URL. */
  abstract put(key: string, data: Buffer, contentType: string): Promise<string>;
  abstract delete(key: string): Promise<void>;
}
