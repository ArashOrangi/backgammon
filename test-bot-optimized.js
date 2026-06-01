import WebSocket from "ws";
import { setTimeout } from "timers";

// ---------- تنظیمات از خط فرمان ----------
const args = process.argv.slice(2);
const userId =
  args.find((arg) => arg.startsWith("--userId="))?.split("=")[1] || "1";
const serverUrl =
  args.find((arg) => arg.startsWith("--url="))?.split("=")[1] ||
  "ws://localhost:8080";

console.log(`🤖 Starting bot client for user ${userId} | Server: ${serverUrl}`);

let ws = null;
let reconnectAttempts = 0;
let gameId = null;
let readySent = false;
let isClosing = false;
let pingInterval = null;

// ---------- توابع کمکی ----------
function logWithTime(level, message, data = null) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

function connect() {
  if (isClosing) return;
  logWithTime("info", `Connecting to ${serverUrl}...`);
  ws = new WebSocket(serverUrl);

  ws.on("open", () => {
    logWithTime("info", "✅ WebSocket connected");
    reconnectAttempts = 0;
    readySent = false;
    gameId = null;
    // ارسال درخواست مچ‌میکینگ
    ws.send(
      JSON.stringify({
        type: "game.join",
        payload: { gameId: -1, userId: parseInt(userId) },
      }),
    );
    logWithTime("debug", "Sent game.join with gameId=-1");

    // راه‌اندازی پینگ هر 30 ثانیه
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 30000);
  });

  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(msg);
    } catch (err) {
      logWithTime("error", "Failed to parse message", err.message);
    }
  });

  ws.on("pong", () => {
    logWithTime("debug", "Received pong from server");
  });

  ws.on("error", (err) => {
    logWithTime("error", "WebSocket error", err.message);
  });

  ws.on("close", (code, reason) => {
    logWithTime(
      "warn",
      `Connection closed (code: ${code}, reason: ${reason || "none"})`,
    );
    if (pingInterval) clearInterval(pingInterval);
    if (!isClosing) {
      const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
      logWithTime("info", `Reconnecting in ${delay}ms...`);
      setTimeout(connect, delay);
      reconnectAttempts++;
    }
  });
}

function handleMessage(msg) {
  const { type, payload } = msg;
  logWithTime(
    "debug",
    `Received ${type}`,
    payload?.data?.status || payload?.message || "",
  );

  switch (type) {
    case "game.state":
      if (payload?.data) {
        const gameData = payload.data;
        if (gameData.id && gameData.id !== -1) gameId = gameData.id;
        if (gameData.status === "ready" && !readySent && gameId) {
          logWithTime(
            "info",
            `🎮 Game ${gameId} is ready. Sending player.ready...`,
          );
          ws.send(
            JSON.stringify({ type: "player.ready", payload: { gameId } }),
          );
          readySent = true;
        }
        if (gameData.status === "in-progress") {
          logWithTime("info", `⏳ Game in progress, turn: ${gameData.turn}`);
        }
        if (gameData.status === "finished") {
          logWithTime("info", `🏁 Game finished. Winner: ${gameData.winner}`);
        }
      }
      break;

    case "dice.result":
      if (payload?.data?.dice) {
        logWithTime(
          "info",
          `🎲 Dice rolled: ${payload.data.dice.join(",")} (player ${payload.data.playerId})`,
        );
      }
      break;

    case "player.move":
      if (payload?.data) {
        const move = payload.data;
        logWithTime(
          "info",
          `🏃 Move: ${move.from} → ${move.to} (die: ${move.die}) by player ${move.playerId}`,
        );
      }
      break;

    case "game.turn":
      if (payload?.data) {
        logWithTime(
          "info",
          `🔄 Turn changed to player ${payload.data.playerId} (${payload.data.color})`,
        );
      }
      break;

    case "game.result":
      logWithTime(
        "info",
        `🏆 Game result: winner ${payload?.data?.winner}, winType ${payload?.data?.winType}`,
      );
      break;

    case "game.error":
      logWithTime("error", `❌ Game error: ${payload?.message}`);
      break;

    default:
      logWithTime("debug", `Unhandled message type: ${type}`);
  }
}

function gracefulShutdown() {
  if (isClosing) return;
  isClosing = true;
  logWithTime("info", "Shutting down...");
  if (pingInterval) clearInterval(pingInterval);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.close();
  }
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// شروع اتصال
connect();

// به عنوان fallback، بعد از 3 دقیقه ببند (اختیاری، اما می‌توان حذف کرد)
setTimeout(() => {
  if (!isClosing) {
    logWithTime("warn", "Max runtime reached (3 min), shutting down...");
    gracefulShutdown();
  }
}, 180000);
