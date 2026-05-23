import WebSocket from "ws";

const PORT = 8080;
const API_BASE = `http://localhost:${PORT}/api`;
const WS_URL = `ws://localhost:${PORT}`;
const TIMEOUT_MS = 90000;

function sendMessage(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

async function createGame(whitePlayerId = 1) {
  const res = await fetch(`${API_BASE}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whitePlayerId }),
  });
  const data = await res.json();
  const gameId = data.id || data.data?.id;
  if (!gameId) throw new Error(`Cannot create game: ${JSON.stringify(data)}`);
  console.log(`✅ Game created with ID: ${gameId}`);
  return String(gameId);
}

function createPlayer(name, gameId, autoPlay = true) {
  const ws = new WebSocket(WS_URL);
  let state = null;
  let myPlayerId = null;
  let hasRolledStarting = false;
  let hasRolledDice = false;
  let moveAttempted = false;

  ws.on("open", () => {
    console.log(`[${name}] 🔌 Connected. Joining game ${gameId}...`);
    sendMessage(ws, "game.join", { gameId });
  });

  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    const { type, payload } = msg;

    if (type === "game.error") {
      console.error(`[${name}] ❌ Error:`, payload.message);
      if (payload.message.includes("not found")) ws.close();
      return;
    }

    if (type === "game.state") {
      console.log(
        `[${name}] 📢 game.state (status=${payload.data.status}, turn=${payload.data.turn?.slice(0, 8)}..., dice=${JSON.stringify(payload.data.dice)})`,
      );
      state = payload.data;
      handleGameState();
    } else if (type === "game.legalMoves") {
      const moves = payload.data;
      if (
        autoPlay &&
        state &&
        myPlayerId &&
        state.turn === myPlayerId &&
        !moveAttempted
      ) {
        if (
          moves &&
          moves.length > 0 &&
          moves[0].moves &&
          moves[0].moves.length > 0
        ) {
          const move = moves[0].moves[0];
          console.log(`[${name}] 🎯 Making move:`, move);
          sendMessage(ws, "game.move", {
            gameId,
            from: move.from,
            to: move.to,
          });
          moveAttempted = true;
        } else {
          console.log(
            `[${name}] ⚠️ No legal moves reported. Trying a fallback move...`,
          );
          // Fallback: اگر بازیکن مشکی است و تاس‌ها [1,3]، از نقطه 0 به 1 حرکت کن
          if (
            state.turn === myPlayerId &&
            state.dice &&
            state.dice.includes(1)
          ) {
            const fallbackMove = { from: 0, to: 1, die: 1 };
            console.log(`[${name}] 🔁 Fallback move:`, fallbackMove);
            sendMessage(ws, "game.move", { gameId, from: 0, to: 1 });
            moveAttempted = true;
          } else if (
            state.turn === myPlayerId &&
            state.dice &&
            state.dice.includes(3)
          ) {
            const fallbackMove = { from: 11, to: 8, die: 3 };
            console.log(`[${name}] 🔁 Fallback move:`, fallbackMove);
            sendMessage(ws, "game.move", { gameId, from: 11, to: 8 });
            moveAttempted = true;
          }
        }
      }
    } else if (type === "game.join") {
      if (payload.data?.playerId) {
        myPlayerId = payload.data.playerId;
        console.log(`[${name}] 🆔 My player ID: ${myPlayerId}`);
      }
    } else if (type === "game.roll") {
      console.log(`[${name}] 🎲 Dice rolled:`, payload.data);
    } else if (type === "game.startRoll") {
      console.log(`[${name}] 📨 game.startRoll`, payload);
    } else {
      console.log(`[${name}] 📨 ${type}`, payload);
    }
  });

  ws.on("close", () => console.log(`[${name}] 🔌 Disconnected`));
  ws.on("error", (err) =>
    console.error(`[${name}] ⚡ WebSocket error:`, err.message),
  );

  function handleGameState() {
    if (!state || !myPlayerId) return;

    if (state.status === "starting") {
      const startingDice = state.startingDice || {};
      if (!startingDice[myPlayerId] && !hasRolledStarting) {
        hasRolledStarting = true;
        console.log(`[${name}] 🎲 Rolling starting die...`);
        sendMessage(ws, "game.roll", { gameId });
      }
      return;
    }

    if (
      state.status === "in-progress" &&
      myPlayerId &&
      state.turn === myPlayerId
    ) {
      if ((!state.dice || state.dice.length === 0) && !hasRolledDice) {
        hasRolledDice = true;
        console.log(`[${name}] 🎲 Rolling dice...`);
        sendMessage(ws, "game.roll", { gameId });
      } else if (state.dice && state.dice.length > 0 && !moveAttempted) {
        console.log(`[${name}] Waiting for legal moves...`);
      }
    }

    if (state.status === "finished") {
      console.log(
        `[${name}] 🏆 Game finished! Winner: ${state.winner}, type: ${state.winType}`,
      );
      ws.close();
    }
  }

  return ws;
}

(async () => {
  console.log(`🔍 Checking server at ${API_BASE} ...`);
  const testRes = await fetch(`${API_BASE}`).catch(() => null);
  if (!testRes || !testRes.ok) {
    console.error(
      "❌ Server not reachable. Please start the server (npm run start).",
    );
    process.exit(1);
  }
  console.log("✅ Server is reachable.\n");

  try {
    const gameId = await createGame(1);
    console.log(`\n🚀 Starting test with game ID: ${gameId}\n`);
    const white = createPlayer("⚪ White", gameId);
    const black = createPlayer("⚫ Black", gameId);

    const cleanup = () => {
      console.log("\n🛑 Closing connections...");
      white.close();
      black.close();
      setTimeout(() => process.exit(0), 500);
    };
    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);

    setTimeout(() => {
      console.log(`\n⏰ Test timeout (${TIMEOUT_MS / 1000}s)`);
      cleanup();
    }, TIMEOUT_MS);
  } catch (err) {
    console.error("❌ Fatal error:", err.message);
    process.exit(1);
  }
})();
