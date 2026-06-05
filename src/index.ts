import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import dotenv from "dotenv";
import { history } from "./routes/history";
import { logger } from "hono/logger";
import { gameRoutes } from "./routes/games";
import { userRoutes } from "./routes/users";
import { registerSocketHandlers } from "./socket";
import { RoomManager } from "./socket/room-manager";
import { checkGameTimeouts } from "./game/engine/timer";
import { timerConfigRoutes } from "./routes/timerConfig";
import { prismaUserGetOrCreate } from "./models/user";
import { OrmState } from "./models/enums";
import { chatRoutes } from "./routes/miniChat";
import { locationRoutes } from "./routes/location";

dotenv.config();

const app = new Hono();
app.use(logger());

// مسیرهای API
app.get("/api", (c) => c.text("Hello Hono!"));
app.route("/api/users", userRoutes);
app.route("/api/games", gameRoutes);
app.route("/api/history", history);
app.route("/api/timer-presets", timerConfigRoutes);
app.route("/api/miniChat", chatRoutes);
app.route("/api/location", locationRoutes);

const PORT = Number(process.env.PORT) || 8080;

// توابع کمکی برای خواندن بدنه
async function readBodyString(
  req: import("http").IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

// ------------------------------------------------------------
// راه‌اندازی سرور فقط پس از آماده شدن بات
// ------------------------------------------------------------
(async () => {
  // ۱. ایجاد / دریافت کاربر بات
  try {
    const bot = await prismaUserGetOrCreate("SystemBot");
    if (bot === OrmState.Error) {
      console.error("Failed to create/get bot user: OrmState.Error");
      process.env.BOT_USER_ID = "1"; // fallback
    } else {
      console.log(`🤖 Bot user ready with id: ${bot.id}`);
      process.env.BOT_USER_ID = "1";
    }
  } catch (error) {
    console.error("Failed to create bot user:", error);
    process.env.BOT_USER_ID = "1";
  }

  // ۲. ایجاد HTTP server
  const server = createServer(async (req, res) => {
    if (req.url?.startsWith("/api")) {
      try {
        const url = new URL(req.url || "", `http://${req.headers.host}`);
        let body: string | null = null;
        if (req.method !== "GET" && req.method !== "HEAD") {
          body = await readBodyString(req);
        }
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value !== undefined) {
            if (Array.isArray(value)) {
              headers.append(key, value.join(", "));
            } else {
              headers.append(key, value);
            }
          }
        }
        const request = new Request(url, {
          method: req.method,
          headers,
          body,
        });
        const honoRes = await app.fetch(request);
        res.writeHead(
          honoRes.status,
          Object.fromEntries(honoRes.headers.entries()),
        );
        const responseBody = await honoRes.text();
        res.end(responseBody);
      } catch (err) {
        console.error("Error handling request:", err);
        res.writeHead(500);
        res.end("Internal Server Error");
      }
    } else {
      res.writeHead(404);
      res.end("Not Found");
    }
  });

  // ۳. RoomManager و WebSocket
  const rooms = new RoomManager();
  const wss = new WebSocketServer({ server });
  registerSocketHandlers(wss, rooms);

  // ۴. Game Loop (تایمر)
  const TICK_RATE = 2000;
  setInterval(async () => {
    try {
      await checkGameTimeouts(rooms);
    } catch (err) {
      console.error("Critical Game Loop Error:", err);
    }
  }, TICK_RATE);

  // ۵. شروع listening
  server.listen(PORT, () => {
    console.log(`🚀 REST API running on http://localhost:${PORT}/api`);
    console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  });
})();
