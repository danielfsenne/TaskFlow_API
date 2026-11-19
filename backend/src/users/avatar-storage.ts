import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { mkdir, unlink, writeFile } from 'fs/promises';
import { basename, join, resolve } from 'path';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_URL_PREFIX = '/api/v1/users/avatars/';
export const AVATAR_FILE_PATTERN =
  /^[0-9a-f-]{36}-[0-9a-f]{16}\.(png|jpg|webp)$/;

// confere a assinatura do arquivo; o Content-Type do upload é do cliente
function detectImage(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'png';
  }
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

@Injectable()
export class AvatarStorage {
  readonly dir: string;

  constructor(config: ConfigService) {
    this.dir = resolve(config.getOrThrow<string>('UPLOAD_DIR'), 'avatars');
  }

  async save(userId: string, data: Buffer): Promise<string> {
    const ext = detectImage(data);
    if (!ext) {
      throw new BadRequestException('Envie uma imagem PNG, JPEG ou WebP');
    }
    const file = `${userId}-${randomBytes(8).toString('hex')}.${ext}`;
    await mkdir(this.dir, { recursive: true });
    await writeFile(join(this.dir, file), data);
    return AVATAR_URL_PREFIX + file;
  }

  async remove(url: string | null) {
    if (!url?.startsWith(AVATAR_URL_PREFIX)) return;
    const file = basename(url);
    if (!AVATAR_FILE_PATTERN.test(file)) return;
    await unlink(join(this.dir, file)).catch(() => undefined);
  }
}
