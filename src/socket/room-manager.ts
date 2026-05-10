import { SocketContext } from "./socket-context";

type Room = {
  players: Set<SocketContext>;
  spectators: Set<SocketContext>;
};

export class RoomManager {
  private rooms = new Map<string, Room>();
  private socketToRoom = new Map<string, string>();

  join(gameId: string, ctx: SocketContext, role: "player" | "spectator") {
    if (!this.rooms.has(gameId)) {
      this.rooms.set(gameId, {
        players: new Set(),
        spectators: new Set(),
      });
    }

    const room = this.rooms.get(gameId)!;

    if (role === "player") {
      room.players.add(ctx);
    } else {
      room.spectators.add(ctx);
    }

    this.socketToRoom.set(ctx.id, gameId);
  }

  leave(ctx: SocketContext) {
    const gameId = this.socketToRoom.get(ctx.id);
    if (!gameId) return;

    const room = this.rooms.get(gameId);
    if (!room) return;

    room.players.delete(ctx);
    room.spectators.delete(ctx);

    if (room.players.size === 0 && room.spectators.size === 0) {
      this.rooms.delete(gameId);
    }

    this.socketToRoom.delete(ctx.id);
  }

  broadcast(gameId: string, message: any) {
    const room = this.rooms.get(gameId);
    if (!room) return;

    for (const p of room.players) {
      p.send(message);
    }

    for (const s of room.spectators) {
      s.send(message);
    }
  }

  broadcastPlayers(gameId: string, message: any) {
    const room = this.rooms.get(gameId);
    if (!room) return;

    for (const p of room.players) {
      p.send(message);
    }
  }

  getRoomOfSocket(ctx: SocketContext): string | null {
    for (const [gameId, room] of this.rooms.entries()) {
      if (room.players.has(ctx) || room.spectators.has(ctx)) {
        return gameId;
      }
    }

    return null;
  }
}
