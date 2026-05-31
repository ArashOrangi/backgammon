import WebSocket from "ws";

const userId = 1; // کاربر تست (حتماً در دیتابیس وجود داشته باشد)
const ws = new WebSocket("ws://localhost:8080");

ws.on("open", () => {
  console.log("✅ Connected to server");
  ws.send(
    JSON.stringify({ type: "game.join", payload: { gameId: -1, userId } }),
  );
});

ws.on("message", (data) => {
  const msg = JSON.parse(data.toString());
  console.log(
    `\n📨 Received [${msg.type}]:`,
    JSON.stringify(msg.payload, null, 2),
  );

  if (msg.type === "game.state" && msg.payload?.data?.status === "ready") {
    const gameId = msg.payload.data.id;
    console.log(`🎮 Game ${gameId} is ready. Sending player.ready...`);
    ws.send(JSON.stringify({ type: "player.ready", payload: { gameId } }));
  }

  if (msg.type === "game.result") {
    console.log(`🏆 Game finished! Winner: ${msg.payload?.data?.winner}`);
  }

  if (msg.type === "game.error") {
    console.error(`❌ Error: ${msg.payload?.message}`);
  }
});

ws.on("error", (err) => console.error("WebSocket error:", err));
ws.on("close", () => console.log("🔌 Connection closed"));

// نگه داشتن اتصال برای مدت کافی (۲ دقیقه)
setTimeout(() => {
  console.log("⏰ Closing connection after 2 minutes...");
  ws.close();
}, 120000);
