import WebSocket from "ws";

const PORT = 8080;
const API = `http://localhost:${PORT}/api`;
const WS = `ws://localhost:${PORT}`;
const TIMEOUT = 300000;

// ثابت‌های موقعیت‌های خاص (مطابق با SPECIAL_POSITIONS سرور)
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
  return new Promise((r) => setTimeout(r, ms));
}

async function createGame() {
  const res = await fetch(`${API}/games`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      whitePlayerId: "player_white", // <-- string
    }),
  });

  const data = await res.json();
  // مسیرهای مختلف پاسخ ممکن
  const gameId = data.id || data.data?.id;

  if (!gameId) {
    throw new Error(`Game creation failed: ${JSON.stringify(data)}`);
  }

  return String(gameId);
}

function createPlayer(name, gameId) {
  let state = null;
  let myId = null;
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

      console.log(`[${name}] <- ${type}`);

      switch (type) {
        case "game.error":
          stats.errors++;
          console.error(`[${name}] ERROR:`, payload?.message || payload);
          break;

        case "game.join":
          myId =
            payload?.data?.playerId ||
            payload?.data?.game?.players?.find((p) => p.id)?.id;
          console.log(`[${name}] PlayerId:`, myId);
          break;

        case "game.state":
          stats.stateUpdates++;
          state = payload.data;
          console.log(
            `[${name}] status=${state.status} turn=${state.turn} dice=${JSON.stringify(state.dice)}`,
          );
          tick();
          break;

        case "game.roll":
          stats.rolls++;
          console.log(`[${name}] dice rolled`, payload.data);
          break;

        case "game.legalMoves":
          handleLegalMoves(payload.data || []);
          break;

        case "game.startRoll":
          tick();
          break;

        default:
          console.log(`[${name}] Event:`, type);
      }
    } catch (err) {
      console.error(`[${name}] Parse Error`, err);
    }
  });

  ws.on("close", () => {
    console.log(`[${name}] disconnected`);
  });

  ws.on("error", (err) => {
    console.error(`[${name}] WS error:`, err.message);
  });

  function formatMove(move) {
    const fromStr = move.from === POS.BAR ? "BAR" : move.from;
    let toStr = move.to;
    if (move.to === POS.BEAR_OFF_WHITE) toStr = "BEAR_OFF_WHITE";
    if (move.to === POS.BEAR_OFF_BLACK) toStr = "BEAR_OFF_BLACK";
    return `${fromStr} → ${toStr} (die=${move.die})`;
  }

  async function handleLegalMoves(legalMoves) {
    if (!state || !myId || state.turn !== myId) return;
    if (!legalMoves.length) {
      console.log(`[${name}] no legal moves`);
      return;
    }

    // اولین توالی حرکتی را انتخاب کن
    const sequence = legalMoves[0];
    if (!sequence?.moves?.length) return;

    console.log(`[${name}] Sequence moves:`, sequence.moves.map(formatMove));

    // حرکات را به ترتیب و با تأخیر کوتاه ارسال کن (تا سرور فرصت بروزرسانی داشته باشد)
    for (const move of sequence.moves) {
      stats.moves++;
      console.log(`[${name}] Sending move: ${formatMove(move)}`);

      send(ws, "game.move", {
        gameId,
        from: move.from,
        to: move.to,
      });

      // صبر کن تا سرور state را به‌روز کند (اختیاری ولی پایدارتر)
      await sleep(100);
    }
  }

  function tick() {
    if (!state || !myId) return;

    if (state.status === "finished") {
      console.log("\n====================");
      console.log("GAME FINISHED");
      console.log("Winner:", state.winner);
      console.log("WinType:", state.winType);
      console.log("Stats:");
      console.table(stats);
      process.exit(0);
    }

    if (state.status === "starting") {
      const startDice = state.startingDice || {};
      if (!startDice[myId] && !hasRolledStart) {
        hasRolledStart = true;
        console.log(`[${name}] rolling start dice`);
        send(ws, "game.roll", { gameId });
      }
      return;
    }

    if (state.status === "in-progress" && state.turn === myId) {
      if (!state.dice || state.dice.length === 0) {
        console.log(`[${name}] rolling`);
        send(ws, "game.roll", { gameId });
      }
    }
  }

  // نظارت بر idle بودن (در صورت قطع نشدن)
  setInterval(() => {
    const idle = (Date.now() - lastAction) / 1000;
    if (idle > 15) {
      console.log(`\n[${name}] stalled ${idle}s`);
      console.log({
        status: state?.status,
        turn: state?.turn,
        dice: state?.dice,
      });
    }
  }, 5000);

  return ws;
}

(async () => {
  console.log("Checking server...");
  const test = await fetch(API).catch(() => null);
  if (!test) throw new Error("Server offline");
  console.log("Server OK");

  const gameId = await createGame();
  console.log("\nGame ID:", gameId);

  createPlayer("WHITE", gameId);
  await sleep(500);
  createPlayer("BLACK", gameId);

  setTimeout(() => {
    console.log("\nTIMEOUT");
    console.table(stats);
    process.exit(1);
  }, TIMEOUT);
})();
