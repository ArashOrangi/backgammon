import { SocketContext } from "./socket-context";
import { ServerMessage } from "./protocol";

export class RoomManager {
  private rooms = new Map<string, Set<SocketContext>>();
  private socketToRoom = new Map<string, string>();

  join(gameId: string, ctx: SocketContext) {
    if (!this.rooms.has(gameId)) {
      this.rooms.set(gameId, new Set());
    }

    this.rooms.get(gameId)!.add(ctx);
    this.socketToRoom.set(ctx.id, gameId);
  }

  leave(ctx: SocketContext) {
    const gameId = this.socketToRoom.get(ctx.id);
    if (!gameId) return;

    const room = this.rooms.get(gameId);
    if (room) {
      room.delete(ctx);
      if (room.size === 0) {
        this.rooms.delete(gameId);
      }
    }

    this.socketToRoom.delete(ctx.id);
  }

  getRoomOfSocket(ctx: SocketContext) {
    return this.socketToRoom.get(ctx.id);
  }

  broadcast(gameId: string, message: any) {
    const room = this.rooms.get(gameId);
    if (!room) return;

    for (const client of room) {
      client.send(message);
    }
  }
}
