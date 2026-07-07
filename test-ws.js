import WebSocket from "ws";

const userId1 = 1;
const userId2 = 2;
let gameId = null;
let readySent1 = false;
let readySent2 = false;

const ws1 = new WebSocket("ws://localhost:8080");
const ws2 = new WebSocket("ws://localhost:8080");

ws1.on("open", () => {
  console.log("User1 connected");
  ws1.send(
    JSON.stringify({
      type: "game.join",
      payload: { gameId: -1, userId: userId1 },
    }),
  );
});

ws2.on("open", () => {
  console.log("User2 connected");
  ws2.send(
    JSON.stringify({
      type: "game.join",
      payload: { gameId: -1, userId: userId2 },
    }),
  );
});

function handleMessage(ws, userId, logPrefix, getReadyFlag, setReadyFlag) {
  return (data) => {
    const msg = JSON.parse(data.toString());
    console.log(
      `${logPrefix} received:`,
      msg.type,
      msg.payload?.data?.status || msg.payload?.message || "",
    );

    if (msg.type === "game.state") {
      const gameData = msg.payload?.data;
      if (!gameData) return;

      // ذخیره gameId اولین باری که دیده می‌شود
      if (!gameId && gameData.id && gameData.id !== -1) gameId = gameData.id;

      // ارسال player.ready فقط یک بار و فقط در وضعیت ready
      if (gameData.status === "ready" && !getReadyFlag()) {
        console.log(
          `${logPrefix}: sending player.ready for game ${gameData.id}`,
        );
        ws.send(
          JSON.stringify({
            type: "player.ready",
            payload: { gameId: gameData.id },
          }),
        );
        setReadyFlag(true);
      }
      // بعد از شروع بازی
      else if (gameData.status === "in-progress") {
        console.log(
          `${logPrefix}: Game started! Turn: ${gameData.turn}, dice: ${gameData.dice?.length || 0}`,
        );
        // اگر نوبت این کاربر است و تاسی ریخته نشده، خودکار تاس می‌ریزد
        if (
          gameData.turn === userId &&
          (!gameData.dice || gameData.dice.length === 0)
        ) {
          console.log(`${logPrefix}: auto-rolling dice...`);
          ws.send(
            JSON.stringify({
              type: "game.roll",
              payload: { gameId: gameData.id },
            }),
          );
        }
      }
    } else if (msg.type === "dice.result") {
      console.log(
        `${logPrefix}: 🎲 dice result = ${msg.payload.dice.join(",")} (player ${msg.payload.playerId})`,
      );
    } else if (msg.type === "game.turn") {
      console.log(
        `${logPrefix}: 🔄 turn -> player ${msg.payload.playerId} (${msg.payload.color})`,
      );
    } else if (msg.type === "game.error") {
      console.error(`${logPrefix}: ❌ error: ${msg.payload.message}`);
    }
  };
}

ws1.on(
  "message",
  handleMessage(
    ws1,
    userId1,
    "User1",
    () => readySent1,
    (v) => (readySent1 = v),
  ),
);
ws2.on(
  "message",
  handleMessage(
    ws2,
    userId2,
    "User2",
    () => readySent2,
    (v) => (readySent2 = v),
  ),
);

// بعد از 30 ثانیه اتصال را ببندید تا بازی فرصت کافی داشته باشد
setTimeout(() => {
  console.log("Closing connections...");
  ws1.close();
  ws2.close();
}, 30000);
