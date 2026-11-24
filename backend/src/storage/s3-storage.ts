import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { FileStorage, StoredEntry, StoredFile } from './file-storage';

// S3 ou compatível (MinIO, R2...): o bucket é compartilhado entre instâncias
export class S3Storage extends FileStorage {
  private readonly client: S3Client;

  constructor(
    private readonly bucket: string,
    config: S3ClientConfig,
  ) {
    super();
    this.client = new S3Client(config);
  }

  async put(key: string, data: Buffer, contentType: string) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      }),
    );
  }

  async get(key: string): Promise<StoredFile | null> {
    try {
      const res = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { body: res.Body as Readable, size: res.ContentLength };
    } catch (e) {
      if (e instanceof NoSuchKey) return null;
      throw e;
    }
  }

  async delete(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async *list(prefix: string): AsyncIterable<StoredEntry> {
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: `${prefix}/`,
          ContinuationToken: token,
        }),
      );
      for (const o of page.Contents ?? []) {
        if (o.Key && o.LastModified) {
          yield { key: o.Key, modifiedAt: o.LastModified };
        }
      }
      token = page.NextContinuationToken;
    } while (token);
  }

  onModuleDestroy() {
    this.client.destroy();
  }
}
