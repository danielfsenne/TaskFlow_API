import { Prisma } from '@prisma/client';

type Db = Pick<Prisma.TransactionClient, 'boardColumn' | 'task'>;

/**
 * Convenção do TaskFlow: a última coluna do quadro é a de concluídas.
 * Quadros com uma coluna só não têm coluna de concluídas.
 */
export async function doneColumnId(
  db: Db,
  boardId: string,
): Promise<string | null> {
  const last = await db.boardColumn.findMany({
    where: { boardId },
    orderBy: { position: 'desc' },
    take: 2,
    select: { id: true },
  });
  return last.length >= 2 ? last[0].id : null;
}

/**
 * Recalcula `completedAt` das tarefas do quadro depois que as colunas mudam
 * (nova coluna no fim, reordenação, exclusão): quem entrou na coluna de
 * concluídas ganha a data de agora; quem saiu perde a data.
 */
export async function syncBoardCompletion(db: Db, boardId: string) {
  const done = await doneColumnId(db, boardId);
  if (done) {
    await db.task.updateMany({
      where: { boardId, columnId: done, completedAt: null },
      data: { completedAt: new Date() },
    });
  }
  await db.task.updateMany({
    where: {
      boardId,
      completedAt: { not: null },
      ...(done && { columnId: { not: done } }),
    },
    data: { completedAt: null },
  });
}
