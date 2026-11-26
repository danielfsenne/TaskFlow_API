import { createReadStream } from 'fs';
import { mkdir, readdir, stat, unlink, writeFile } from 'fs/promises';
import { dirname, join, resolve, sep } from 'path';
import { FileStorage, StoredEntry, StoredFile } from './file-storage';

export class LocalStorage extends FileStorage {
  private readonly root: string;

  constructor(dir: string) {
    super();
    this.root = resolve(dir);
  }

  // a chave nunca sai da pasta de uploads
  private path(key: string) {
    const full = resolve(this.root, key);
    if (!full.startsWith(this.root + sep)) {
      throw new Error(`Chave inválida: ${key}`);
    }
    return full;
  }

  async put(key: string, data: Buffer) {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  }

  async get(key: string): Promise<StoredFile | null> {
    const path = this.path(key);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return null;
    return { body: createReadStream(path), size: info.size };
  }

  async delete(key: string) {
    await unlink(this.path(key)).catch(() => undefined);
  }

  async *list(prefix: string): AsyncIterable<StoredEntry> {
    const dir = this.path(prefix);
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const info = await stat(join(dir, name)).catch(() => null);
      if (info?.isFile()) {
        yield { key: `${prefix}/${name}`, modifiedAt: info.mtime };
      }
    }
  }

  // arquivo local só sai pela API
  signedUrl() {
    return Promise.resolve(null);
  }
}
