import { WebSocket } from "ws";
import { ServerMessage } from "./protocol";
import crypto from "crypto";

export class SocketContext {
  id: string; // شناسه یکتای سوکت (UUID)
  userId?: number; // شناسه عددی کاربر احراز هویت شده
  ws: WebSocket;

  constructor(ws: WebSocket) {
    this.ws = ws;
    this.id = crypto.randomUUID();
  }

  send(message: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) {
      setTimeout(() => {
        // دوباره وضعیت اتصال را بررسی کن، چون ممکن است در ۱۵۰ میلی‌ثانیه بسته شده باشد
        if (this.ws.readyState === this.ws.OPEN) {
          this.ws.send(JSON.stringify(message));
        }
      }, 150);
    }
  }
}
