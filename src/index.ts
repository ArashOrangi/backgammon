import { Hono } from "hono";
import { WebSocketServer } from "ws";
import { createServer } from "http";
import dotenv from "dotenv";
import { readFileSync } from "fs";
import { join } from "path";
import yaml from "js-yaml";
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
import { getWsLogs, clearWsLogs } from "./utils/wsLogger";
import { middlewareAuth } from "./middlewares/middlewareAuth";
import { accountRoute } from "./routes/account";
import { shopRoutes } from "./routes/shop";
import { collectionRoutes } from "./routes/collection";
import { leaderboardRoutes } from "./routes/leaderboard";
import { cors } from "hono/cors";
import { inventoryAdminRoutes } from "./routes/admin/inventory";
import { userInventoryAdminRoutes } from "./routes/admin/user-inventory";
import { shopAdminRoutes } from "./routes/admin/shop";
import { starterPackAdminRoutes } from "./routes/admin/starter-packs";
import { spinRoutes } from "./routes/spin";
import { otpRoutes } from "./routes/otp";

dotenv.config();

const app = new Hono();

// ===== CORS =====
app.use(
  "*",
  cors({
    origin: (origin) => {
      const allowedOrigins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080",
        "http://37.255.218.236:5208",
        undefined,
      ];
      if (allowedOrigins.includes(origin)) {
        return origin;
      }
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "Cookie"],
    credentials: true,
  }),
);

app.use(logger());
app.use("*", middlewareAuth);

// ===== Swagger UI =====
let swaggerJson: any;
try {
  const raw = readFileSync(join(__dirname, "../swagger.json"), "utf-8");
  // Check if the file is YAML (starts with "openapi:" or "swagger:")
  if (raw.trim().startsWith("openapi:") || raw.trim().startsWith("swagger:")) {
    swaggerJson = yaml.load(raw);
  } else {
    swaggerJson = JSON.parse(raw);
  }
  console.log("✅ Swagger definition loaded successfully.");
} catch (error) {
  console.error("❌ Failed to load swagger definition:", error);
  swaggerJson = { error: "Swagger file not found or invalid" };
}

app.get("/swagger.json", (c) => {
  return c.json(swaggerJson);
});

app.get("/docs", (c) => {
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Backgammon API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    * { box-sizing: border-box; }
    body { margin:0; padding:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: "/swagger.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
      window.ui = ui;
    };
  </script>
</body>
</html>
  `;
  return c.html(html);
});

// ===== Routes =====
app.get("/api", (c) => c.text("Hello Hono!"));
app.route("/api/account", accountRoute);
app.route("/api/users", userRoutes);
app.route("/api/games", gameRoutes);
app.route("/api/history", history);
app.route("/api/timer-presets", timerConfigRoutes);
app.route("/api/miniChat", chatRoutes);
app.route("/api/location", locationRoutes);
app.route("/api/shop", shopRoutes);
app.route("/api/collection", collectionRoutes);
app.route("/api/leaderboard", leaderboardRoutes);

app.route("/api/inventory", userInventoryAdminRoutes);
app.route("/api/shop", shopAdminRoutes);
app.route("/api/starter-packs", starterPackAdminRoutes);
app.route("/api/user-inventory", userInventoryAdminRoutes);
app.route("/api/spin", spinRoutes);
app.route("/api/otp", otpRoutes);

// ===== Debug WebSocket logs =====
app.get("/api/debug/ws-logs", (c) => {
  const limit = Number(c.req.query("limit")) || 100;
  const gameId = c.req.query("gameId")
    ? Number(c.req.query("gameId"))
    : undefined;
  const logs = getWsLogs(limit, gameId);
  return c.json({ logs, count: logs.length });
});

app.delete("/api/debug/ws-logs", (c) => {
  clearWsLogs();
  return c.json({ message: "Logs cleared" });
});

// ===== Server startup =====
const PORT = Number(process.env.PORT) || 8080;

async function readBodyString(
  req: import("http").IncomingMessage,
): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf-8");
}

(async () => {
  // 1. Create/get bot user
  try {
    const bot = await prismaUserGetOrCreate("SystemBot");
    if (bot === OrmState.Error) {
      console.error("Failed to create/get bot user: OrmState.Error");
      process.env.BOT_USER_ID = "1";
    } else {
      console.log(`🤖 Bot user ready with id: ${bot.id}`);
      process.env.BOT_USER_ID = "1";
    }
  } catch (error) {
    console.error("Failed to create bot user:", error);
    process.env.BOT_USER_ID = "1";
  }

  // 2. Create HTTP server
  const server = createServer(async (req, res) => {
    if (
      req.url?.startsWith("/api") ||
      req.url === "/swagger.json" ||
      req.url === "/docs"
    ) {
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

  // 3. RoomManager and WebSocket
  const rooms = new RoomManager();
  const wss = new WebSocketServer({ server });
  registerSocketHandlers(wss, rooms);

  // 4. Game Loop (timer)
  const TICK_RATE = 2000;
  setInterval(async () => {
    try {
      await checkGameTimeouts(rooms);
    } catch (err) {
      console.error("Critical Game Loop Error:", err);
    }
  }, TICK_RATE);

  // 5. Start listening
  server.listen(PORT, () => {
    console.log(`🚀 REST API running on http://localhost:${PORT}/api`);
    console.log(`📖 Swagger UI available at http://localhost:${PORT}/docs`);
    console.log(`🔌 WebSocket server running on ws://localhost:${PORT}`);
  });
})();
