import { BadRequestException, Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { basename } from 'path';
import { FileStorage } from '../storage/file-storage';

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_URL_PREFIX = '/api/v1/users/avatars/';
export const AVATAR_FILE_PATTERN =
  /^[0-9a-f-]{36}-[0-9a-f]{16}\.(png|jpg|webp)$/;

const AVATAR_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
} as const;

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
  constructor(private readonly storage: FileStorage) {}

  async save(userId: string, data: Buffer): Promise<string> {
    const ext = detectImage(data);
    if (!ext) {
      throw new BadRequestException('Envie uma imagem PNG, JPEG ou WebP');
    }
    const file = `${userId}-${randomBytes(8).toString('hex')}.${ext}`;
    await this.storage.put(`avatars/${file}`, data, AVATAR_TYPES[ext]);
    return AVATAR_URL_PREFIX + file;
  }

  async remove(url: string | null) {
    if (!url?.startsWith(AVATAR_URL_PREFIX)) return;
    const file = basename(url);
    if (!AVATAR_FILE_PATTERN.test(file)) return;
    await this.storage.delete(`avatars/${file}`).catch(() => undefined);
  }

  // null se o nome não é de avatar ou o arquivo não existe
  async open(file: string) {
    if (!AVATAR_FILE_PATTERN.test(file)) return null;
    const stored = await this.storage.get(`avatars/${file}`);
    if (!stored) return null;
    const ext = file.split('.').pop() as keyof typeof AVATAR_TYPES;
    return { ...stored, contentType: AVATAR_TYPES[ext] };
  }
}
