import { createServer } from "http";
import { WebSocketServer } from "ws";
import { registerSocketHandlers } from "../socket";
import { portApp } from "@/static/statics";

export function startServer() {
  const httpServer = createServer();

  const wss = new WebSocketServer({
    server: httpServer,
  });

  registerSocketHandlers(wss);

  httpServer.listen(portApp, () => {
    console.log("Backgammon server running on port 3000 (ws)");
  });
}
