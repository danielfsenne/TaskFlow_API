import { Injectable } from '@nestjs/common';
import { Namespace } from 'socket.io';
import { boardRoom, RealtimeEventName, userRoom } from './realtime-events';

@Injectable()
export class RealtimeEmitter {
  private server?: Namespace;

  attach(server: Namespace) {
    this.server = server;
  }

  toBoard(
    boardId: string,
    event: RealtimeEventName,
    actorId: string,
    data: Record<string, unknown>,
  ) {
    this.server?.to(boardRoom(boardId)).emit(event, { ...data, actorId });
  }

  toUser(userId: string, event: RealtimeEventName, data: unknown) {
    this.server?.to(userRoom(userId)).emit(event, data);
  }

  removeUserFromBoards(userId: string, boardIds: string[]) {
    if (boardIds.length === 0) return;
    this.server?.in(userRoom(userId)).socketsLeave(boardIds.map(boardRoom));
  }
}
