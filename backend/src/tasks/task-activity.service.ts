import { Injectable } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateTaskDto } from './dto/task.dto';
import { TaskAccessService } from './task-access.service';

export const ActivityType = {
  Created: 'CREATED', // { column }
  Moved: 'MOVED', // { from, to }
  Title: 'TITLE', // { from, to }
  Description: 'DESCRIPTION', // {}
  Priority: 'PRIORITY', // { from, to }
  DueDate: 'DUE_DATE', // { from, to } (ISO ou null)
  Assignees: 'ASSIGNEES', // { added: string[], removed: string[] } (nomes)
  Labels: 'LABELS', // { added: Label[], removed: Label[] }
  AttachmentAdded: 'ATTACHMENT_ADDED', // { name }
  AttachmentRemoved: 'ATTACHMENT_REMOVED', // { name }
} as const;

type Entry = { type: string; data?: Prisma.InputJsonValue };

const ACTIVITY_LIMIT = 100;
const iso = (d: Date | string | null | undefined) =>
  d ? new Date(d).toISOString() : null;

@Injectable()
export class TaskActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: TaskAccessService,
  ) {}

  async record(taskId: string, actorId: string, entries: Entry[]) {
    if (!entries.length) return;
    // 1 ms entre registros da mesma ação, para a ordem ser estável
    const base = Date.now();
    await this.prisma.taskActivity.createMany({
      data: entries.map((e, i) => ({
        taskId,
        actorId,
        type: e.type,
        data: e.data ?? {},
        createdAt: new Date(base + i),
      })),
    });
  }

  // compara o que mudou de fato; enviar o mesmo valor não gera histórico
  changes(before: Task, dto: UpdateTaskDto): Entry[] {
    const entries: Entry[] = [];
    if (dto.title !== undefined && dto.title !== before.title) {
      entries.push({
        type: ActivityType.Title,
        data: { from: before.title, to: dto.title },
      });
    }
    if (
      dto.description !== undefined &&
      (dto.description ?? null) !== (before.description ?? null)
    ) {
      entries.push({ type: ActivityType.Description });
    }
    if (dto.priority !== undefined && dto.priority !== before.priority) {
      entries.push({
        type: ActivityType.Priority,
        data: { from: before.priority, to: dto.priority },
      });
    }
    if (dto.dueDate !== undefined && iso(dto.dueDate) !== iso(before.dueDate)) {
      entries.push({
        type: ActivityType.DueDate,
        data: { from: iso(before.dueDate), to: iso(dto.dueDate) },
      });
    }
    return entries;
  }

  async list(taskId: string, userId: string) {
    await this.access.getAccess(taskId, userId);
    return this.prisma.taskActivity.findMany({
      where: { taskId },
      select: {
        id: true,
        type: true,
        data: true,
        createdAt: true,
        actor: { select: { id: true, name: true, avatarUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: ACTIVITY_LIMIT,
    });
  }
}
