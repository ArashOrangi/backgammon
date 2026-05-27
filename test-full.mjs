import WebSocket from "ws";

const PORT = 8080;
const API = `http://localhost:${PORT}/api`;
const WS = `ws://localhost:${PORT}`;
const TIMEOUT = 300000; // 5 minutes

const POS = {
  BAR: -50,
  BEAR_OFF_WHITE: 100,
  BEAR_OFF_BLACK: -100,
};

const stats = {
  moves: 0,
  rolls: 0,
  errors: 0,
  stateUpdates: 0,
};

function send(ws, type, payload) {
  ws.send(JSON.stringify({ type, payload }));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ایجاد کاربر و برگرداندن id عددی
async function createUser(userName) {
  const res = await fetch(`${API}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName }),
  });
  const data = await res.json();
  const userId = data.id || data.data?.id;
  if (!userId) {
    throw new Error(`User creation failed: ${JSON.stringify(data)}`);
  }
  return userId;
}

// ایجاد بازی با استفاده از whitePlayerId عددی
async function createGame(whiteUserId) {
  const res = await fetch(`${API}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ whitePlayerId: whiteUserId }),
  });
  const data = await res.json();
  const gameId = data.id || data.data?.id;
  if (!gameId) {
    throw new Error(`Game creation failed: ${JSON.stringify(data)}`);
  }
  return gameId;
}

// ----- Create a player (WebSocket client) -----
function createPlayer(name, gameId) {
  let state = null;
  let myId = null;
  let myColor = null;
  let hasRolledStart = false;
  let lastAction = Date.now();

  const ws = new WebSocket(WS);

  ws.on("open", () => {
    console.log(`[${name}] Connected`);
    send(ws, "game.join", { gameId });
  });

  ws.on("message", (raw) => {
    lastAction = Date.now();
    try {
      const msg = JSON.parse(raw.toString());
      const { type, payload } = msg;

      console.log(
        `[${name}] <- ${type}`,
        payload ? JSON.stringify(payload).slice(0, 200) : "",
      );

      switch (type) {
        case "game.error":
          stats.errors++;
          console.error(`[${name}] ERROR:`, payload?.message || payload);
          break;

        case "player.assign":
          myId = payload.playerId;
          myColor = payload.color;
          console.log(`[${name}] Assigned as ${myColor} (id=${myId})`);
          break;

        case "game.state":
          stats.stateUpdates++;
          state = payload.data || payload;
          console.log(
            `[${name}] status=${state.status} turn=${state.turn} dice=${JSON.stringify(state.dice)}`,
          );
          tick();
          break;

        case "dice.result":
          stats.rolls++;
          console.log(
            `[${name}] Dice result: ${payload.dice.join(",")} (player=${payload.playerId})`,
          );
          tick();
          break;

        case "game.legalMoves":
          handleLegalMoves(payload.data || payload || []);
          break;

        case "game.turn":
          console.log(
            `[${name}] Turn -> player ${payload.playerId} (${payload.color})`,
          );
          tick();
          break;

        case "room.ready":
          console.log(`[${name}] Room ready, entering starting phase`);
          tick();
          break;

        case "game.result":
          console.log(
            `\n[${name}] GAME OVER: winner=${payload.winner} winType=${payload.winType} reason=${payload.reason}`,
          );
          console.log("Final stats:");
          console.table(stats);
          process.exit(0);
          break;

        case "player.move":
          console.log(
            `[${name}] Opponent moved: ${payload.from} -> ${payload.to}`,
          );
          break;

        default:
          console.log(`[${name}] Unhandled event: ${type}`);
      }
    } catch (err) {
      console.error(`[${name}] Parse error:`, err);
    }
  });

  ws.on("close", () => {
    console.log(`[${name}] Disconnected`);
  });

  ws.on("error", (err) => {
    console.error(`[${name}] WebSocket error:`, err.message);
  });

  function formatMove(move) {
    const fromStr = move.from === POS.BAR ? "BAR" : move.from;
    let toStr = move.to;
    if (move.to === POS.BEAR_OFF_WHITE) toStr = "BEAR_OFF(WHITE)";
    if (move.to === POS.BEAR_OFF_BLACK) toStr = "BEAR_OFF(BLACK)";
    return `${fromStr} → ${toStr} (die=${move.die})`;
  }

  async function handleLegalMoves(legalMoves) {
    if (!state || !myId || state.turn !== myId) return;
    if (!legalMoves || legalMoves.length === 0) {
      console.log(`[${name}] No legal moves available`);
      return;
    }

    const sequence = legalMoves[0];
    if (!sequence?.moves?.length) return;

    console.log(`[${name}] Playing ${sequence.moves.length} move(s):`);
    sequence.moves.forEach((m, idx) => {
      console.log(`  ${idx + 1}. ${formatMove(m)}`);
    });

    for (const move of sequence.moves) {
      stats.moves++;
      send(ws, "game.move", {
        gameId,
        from: move.from,
        to: move.to,
      });
      await sleep(150);
    }
  }

  function tick() {
    if (!state || !myId) return;

    if (state.status === "finished") return;

    if (state.status === "starting") {
      const startingDice = state.startingDice || {};
      const myRoll = startingDice[myId];
      if (!myRoll && !hasRolledStart) {
        hasRolledStart = true;
        console.log(`[${name}] Rolling starting die...`);
        send(ws, "game.roll", { gameId });
      }
      return;
    }

    if (state.status === "in-progress" && state.turn === myId) {
      if (!state.dice || state.dice.length === 0) {
        console.log(`[${name}] Rolling dice for my turn...`);
        send(ws, "game.roll", { gameId });
      }
    }
  }

  setInterval(() => {
    const idleSec = (Date.now() - lastAction) / 1000;
    if (idleSec > 15 && state?.status !== "finished") {
      console.log(
        `[${name}] ⚠️ Idle for ${idleSec.toFixed(1)}s, status=${state?.status}, turn=${state?.turn}`,
      );
    }
  }, 5000);

  return ws;
}

// ----- Main -----
(async () => {
  console.log("Checking server...");
  const test = await fetch(API).catch(() => null);
  if (!test) {
    console.error("❌ Server not reachable");
    process.exit(1);
  }
  console.log("✅ Server OK");

  // 1. Create two users (white and black)
  const whiteUser = await createUser("test_white");
  const blackUser = await createUser("test_black");
  console.log(`👤 Users created: white=${whiteUser}, black=${blackUser}`);

  // 2. Create game with whiteUserId (number)
  const gameId = await createGame(whiteUser);
  console.log(`🎲 Game created: ${gameId}`);

  // 3. Launch two WebSocket clients
  createPlayer("WHITE", gameId);
  await sleep(500);
  createPlayer("BLACK", gameId);

  setTimeout(() => {
    console.log("\n⏰ Global timeout");
    console.table(stats);
    process.exit(1);
  }, TIMEOUT);
})();
