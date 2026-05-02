import { ClientMessage, ServerMessage } from "./protocol";
import { SocketContext } from "./socket-context";
import { RoomManager } from "./room-manager";
import {
  validateJoin,
  validateLeave,
  validateRoll,
} from "@/validations/socket";
import { validateMove } from "@/game/rule-validator";
import { Value } from "@sinclair/typebox/value";
import { MovePieceSchema } from "@/validations/game.move";

type Handler<TPayload = any> = (
  ctx: SocketContext,
  payload: TPayload,
  rooms: RoomManager,
) => void;

export class MessageRouter {
  private handlers = new Map<string, Handler>();

  constructor(private rooms: RoomManager) {}

  register<TPayload = any>(type: string, handler: Handler<TPayload>) {
    this.handlers.set(type, handler as Handler);
  }
  //TODO refactor needed
  dispatch(ctx: SocketContext, message: any) {
    switch (message.type) {
      case "game.join":
        if (!validateJoin(message.payload)) {
          return ctx.send({
            type: "game.error",
            payload: { message: "Invalid join payload" },
          });
        }
        return this.handlers.get("game.join")?.(
          ctx,
          message.payload,
          this.rooms,
        );

      case "game.roll":
        if (!validateRoll(message.payload)) {
          return ctx.send({
            type: "game.error",
            payload: { message: "Invalid roll payload" },
          });
        }
        return this.handlers.get("game.roll")?.(
          ctx,
          message.payload,
          this.rooms,
        );

      case "game.move":
        if (!Value.Check(MovePieceSchema, message.payload)) {
          return ctx.send({
            type: "game.error",
            payload: { message: "Invalid move payload" },
          });
        }
        return this.handlers.get("game.move")?.(
          ctx,
          message.payload,
          this.rooms,
        );

      case "player.leave":
        if (!validateLeave(message.payload)) {
          return ctx.send({
            type: "game.error",
            payload: { message: "Invalid leave payload" },
          });
        }
        return this.handlers.get("player.leave")?.(
          ctx,
          message.payload,
          this.rooms,
        );

      default:
        return ctx.send({
          type: "game.error",
          payload: { message: "Unknown message type" },
        });
    }
  }
}
