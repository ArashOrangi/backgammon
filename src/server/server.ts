import { createServer } from "http";
import { WebSocketServer } from "ws";
import { registerSocketHandlers } from "../socket";

export function startServer() {
  const httpServer = createServer();

  const wss = new WebSocketServer({
    server: httpServer,
  });

  registerSocketHandlers(wss);

  httpServer.listen(3000, () => {
    console.log("Backgammon server running on port 3000 (ws)");
  });
}
