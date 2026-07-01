import { ClientMessage } from "./protocol";
import { SocketContext } from "./socket-context";
import { RoomManager } from "./room-manager";
import {
  validateJoin,
  validateLeave,
  validateRoll,
  validateReady,
  validateEndTurn,
  validateCubeOffer,
  validateCubeRespond,
} from "@/validations/socket";
import { validateMove } from "@/game/ruleValidator";
import { Value } from "@sinclair/typebox/value";
import { MoveArraySchema, MovePieceSchema } from "@/validations/game.move";

import {
  onValidationSocketResponse,
  onErrorSocketResponse,
} from "@/responses/response-builder";
import { GameQueue } from "@/game/gameQueue";

type Handler<TPayload = any> = (
  ctx: SocketContext,
  payload: TPayload,
  rooms: RoomManager,
) => void;

export class MessageRouter {
  private handlers = new Map<ClientMessage["type"], Handler>();
  private queue = new GameQueue();

  constructor(private rooms: RoomManager) {}

  register<TPayload>(type: ClientMessage["type"], handler: Handler<TPayload>) {
    this.handlers.set(type, handler as Handler);
  }

  dispatch(ctx: SocketContext, rawMessage: unknown) {
    try {
      const message = rawMessage as ClientMessage;

      if (!message?.type || !message?.payload) {
        return ctx.send({
          type: "game.error",
          payload: onValidationSocketResponse("Invalid message structure"),
        });
      }

      const handler = this.handlers.get(message.type);

      if (!handler) {
        return ctx.send({
          type: "game.error",
          payload: onValidationSocketResponse("Unknown message type"),
        });
      }

      const isValid = this.validateMessage(message);

      if (!isValid) {
        return ctx.send({
          type: "game.error",
          payload: onValidationSocketResponse(
            `Invalid ${message.type} payload`,
          ),
        });
      }

      const gameId = message.payload.gameId;

      if (!gameId) {
        return handler(ctx, message.payload as any, this.rooms);
      }

      this.queue.enqueue(gameId, async () => {
        await handler(ctx, message.payload as any, this.rooms);
      });
    } catch (error) {
      console.error("MessageRouter Error:", error);

      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Internal server error"),
      });
    }
  }

  private validateMessage(message: ClientMessage): boolean {
    switch (message.type) {
      case "game.join":
        return validateJoin(message.payload);
      case "game.roll":
        return validateRoll(message.payload);
      case "game.move":
        return Value.Check(MoveArraySchema, message.payload);
      case "player.leave":
        return validateLeave(message.payload);
      case "player.ready":
        return validateReady(message.payload);
      case "game.endTurn":
        return validateEndTurn(message.payload);
      case "game.cube.offer":
        return validateCubeOffer(message.payload);
      case "game.cube.respond":
        return validateCubeRespond(message.payload);
      default:
        return false;
    }
  }
}
