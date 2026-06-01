import WebSocket from "ws";
import { setTimeout } from "timers";

// ---------- تنظیمات از خط فرمان ----------
const args = process.argv.slice(2);
const userId =
  args.find((arg) => arg.startsWith("--userId="))?.split("=")[1] || "1";
const serverUrl =
  args.find((arg) => arg.startsWith("--url="))?.split("=")[1] ||
  "ws://localhost:8080";

console.log(`🤖 Auto player client for user ${userId} | Server: ${serverUrl}`);

let ws = null;
let reconnectAttempts = 0;
let gameId = null;
let readySent = false;
let isClosing = false;
let pingInterval = null;
let currentGameState = null;

function logWithTime(level, message, data = null) {
  const timestamp = new Date().toISOString().slice(11, 23);
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
  if (data) console.log(`${prefix} ${message}`, data);
  else console.log(`${prefix} ${message}`);
}

// انتخاب حرکت بهتر: اولویت با حرکتی که مهره را بیشتر به جلو می‌برد
function selectBestMove(legalMoves, gameState, playerId) {
  if (!legalMoves || legalMoves.length === 0) return null;
  const player = gameState.players.find((p) => p.id === playerId);
  const isWhite = player?.color === "white";
  // برای سفید: هر چه 'to' بزرگتر باشد بهتر (چون به سمت 23 حرکت می‌کند)
  // برای سیاه: هر چه 'to' کوچکتر باشد بهتر (چون به سمت 0 حرکت می‌کند)
  return legalMoves.reduce((best, move) => {
    const score = isWhite ? move.to : 23 - move.to;
    const bestScore = isWhite ? best.to : 23 - best.to;
    return score > bestScore ? move : best;
  }, legalMoves[0]);
}

function sendMove(move) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const payload = [
    {
      gameId: move.gameId || gameId,
      from: move.from,
      to: move.to,
      die: move.die,
    },
  ];
  ws.send(JSON.stringify({ type: "game.move", payload }));
  logWithTime(
    "info",
    `📤 Sending move (array): ${move.from} → ${move.to} (die ${move.die})`,
  );
}

function sendRoll() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "game.roll", payload: { gameId } }));
  logWithTime("info", "🎲 Sending game.roll");
}

function sendEndTurn() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  ws.send(JSON.stringify({ type: "game.endTurn", payload: { gameId } }));
  logWithTime("info", "⏭️ Sending game.endTurn");
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
        currentGameState = gameData;
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

        if (
          gameData.status === "in-progress" &&
          gameData.turn === parseInt(userId)
        ) {
          logWithTime(
            "info",
            `🕒 It's our turn! dice: ${gameData.dice?.join(",") || "none"}`,
          );
          const borneOff = gameData.board?.borneOff?.[parseInt(userId)] || 0;
          logWithTime("info", `📊 Borne off: ${borneOff} / 15`);

          if (!gameData.dice || gameData.dice.length === 0) {
            sendRoll();
          } else {
            const legalMoves = gameData.legalMoves;
            if (legalMoves && legalMoves.length > 0) {
              const move = selectBestMove(
                legalMoves,
                gameData,
                parseInt(userId),
              );
              if (move) sendMove(move);
              else logWithTime("warn", "No legal move found, but dice exist?");
            } else {
              logWithTime("info", "No legal moves, ending turn.");
              sendEndTurn();
            }
          }
        }

        if (gameData.status === "finished") {
          logWithTime("info", `🏁 Game finished. Winner: ${gameData.winner}`);
          setTimeout(() => gracefulShutdown(), 3000);
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
      setTimeout(() => gracefulShutdown(), 3000);
      break;

    case "game.error":
      logWithTime("error", `❌ Game error: ${payload?.message}`);
      break;

    default:
      logWithTime("debug", `Unhandled message type: ${type}`);
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
    currentGameState = null;
    ws.send(
      JSON.stringify({
        type: "game.join",
        payload: { gameId: -1, userId: parseInt(userId) },
      }),
    );
    logWithTime("debug", "Sent game.join with gameId=-1");
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (ws && ws.readyState === WebSocket.OPEN) ws.ping();
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

  ws.on("pong", () => logWithTime("debug", "Received pong from server"));
  ws.on("error", (err) => logWithTime("error", "WebSocket error", err.message));
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

function gracefulShutdown() {
  if (isClosing) return;
  isClosing = true;
  logWithTime("info", "Shutting down...");
  if (pingInterval) clearInterval(pingInterval);
  if (ws && ws.readyState === WebSocket.OPEN) ws.close();
  process.exit(0);
}

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

connect();
// ❌ تایمر ۵ دقیقه‌ای حذف شد – بازی تا انتها ادامه می‌یابد
