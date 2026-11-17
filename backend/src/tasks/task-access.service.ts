import { Injectable, NotFoundException } from '@nestjs/common';
import { Task } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectAccess,
  ProjectAccessService,
} from '../projects/project-access.service';

export interface TaskAccess extends ProjectAccess {
  task: Task;
}

@Injectable()
export class TaskAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectAccess: ProjectAccessService,
  ) {}

  async getAccess(taskId: string, userId: string): Promise<TaskAccess> {
    const found = await this.prisma.task.findUnique({
      where: { id: taskId },
      include: { board: { include: { project: true } } },
    });
    if (!found) throw new NotFoundException('Tarefa não encontrada');

    const {
      board: { project },
      ...task
    } = found;
    try {
      const access = await this.projectAccess.forProject(project, userId);
      return { ...access, task };
    } catch (e) {
      if (e instanceof NotFoundException) {
        throw new NotFoundException('Tarefa não encontrada');
      }
      throw e;
    }
  }

  async getWritable(taskId: string, userId: string): Promise<TaskAccess> {
    const access = await this.getAccess(taskId, userId);
    this.projectAccess.assertNotArchived(access.project);
    return access;
  }

  isManager(access: TaskAccess, userId: string): boolean {
    try {
      this.projectAccess.assertManager(access, userId);
      return true;
    } catch {
      return false;
    }
  }
}
