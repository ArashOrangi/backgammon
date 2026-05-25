import { createServer } from "http";
import { WebSocketServer } from "ws";
import { registerSocketHandlers } from "../socket";
import { portApp } from "@/static/statics";
import { RoomManager } from "@/socket/room-manager"; // ۱. ایمپورت کلاس مدیریت اتاق‌ها

export function startServer() {
  const httpServer = createServer();

  // ۲. ساخت یک نمونه واحد (Singleton) از RoomManager
  // این نمونه باید بین سوکت‌ها و Game Loop مشترک باشه
  const rooms = new RoomManager();

  const wss = new WebSocketServer({
    server: httpServer,
  });

  // ۳. ارسال rooms به عنوان آرگومان دوم
  registerSocketHandlers(wss, rooms);

  httpServer.listen(portApp, () => {
    console.log(`Backgammon server running on port ${portApp} (ws)`);
  });
}
