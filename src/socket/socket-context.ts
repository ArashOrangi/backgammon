import { WebSocket } from "ws";
import { ServerMessage } from "./protocol";
import crypto from "crypto";

export class SocketContext {
  id: string;
  ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.id = crypto.randomUUID();
  }

  send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }
}
