import { Readable } from 'stream';

export interface StoredFile {
  body: Readable;
  size?: number;
}

export interface StoredEntry {
  key: string;
  modifiedAt: Date;
}

export interface SignedUrlOptions {
  fileName: string;
  contentType: string;
  inline: boolean;
  expiresInSeconds: number;
}

// chaves no formato "pasta/arquivo" (ex.: "attachments/<uuid>.pdf")
export abstract class FileStorage {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  // null quando o arquivo não existe
  abstract get(key: string): Promise<StoredFile | null>;
  abstract delete(key: string): Promise<void>;
  abstract list(prefix: string): AsyncIterable<StoredEntry>;

  // link temporário direto para o arquivo; null quando o driver não tem
  // (aí o download passa pela API)
  abstract signedUrl(
    key: string,
    opts: SignedUrlOptions,
  ): Promise<string | null>;
}
