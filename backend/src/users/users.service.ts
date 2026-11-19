import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorage } from './avatar-storage';

export type PublicUser = Omit<User, 'passwordHash'>;

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  avatarUrl: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatars: AvatarStorage,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  create(data: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<PublicUser> {
    return this.prisma.user.create({ data, select: publicUserSelect });
  }

  update(id: string, data: { name: string }): Promise<PublicUser> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
  }

  // grava a nova foto (ou nenhuma) e só então apaga a anterior
  async setAvatar(id: string, image: Buffer | null): Promise<PublicUser> {
    const before = await this.findById(id);
    const avatarUrl = image ? await this.avatars.save(id, image) : null;
    const user = await this.prisma.user.update({
      where: { id },
      data: { avatarUrl },
      select: publicUserSelect,
    });
    await this.avatars.remove(before.avatarUrl);
    return user;
  }
}
