// src/game/move-generator.ts

import { TypedSocket, TypedIo } from "../socket/typed-socket";
import { applyMove } from "./game.engine";
import { getGame } from "./game.store";

export function onMove(socket: TypedSocket, io: TypedIo) {
  socket.on("game.move", ({ gameId, from, to }) => {
    const game = getGame(gameId);

    if (!game) {
      return socket.emit("game.error", { message: "Game not found" });
    }

    try {
      applyMove(game, socket.id, from, to);

      io.to(game.id).emit("game.state", game);
    } catch (err: any) {
      socket.emit("game.error", { message: err.message });
    }
  });
}
