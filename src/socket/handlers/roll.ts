import { getGame, saveGame } from "../../game/gameStore";
import { SocketContext } from "../socket-context";
import { RoomManager } from "../room-manager";
import {
  onErrorSocketResponse,
  onOkSocketResponse,
} from "@/responses/response-builder";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import {
  rollDice,
  rollStartingDie,
  tryResolveStartingRoll,
} from "@/game/engine";
import { GameQueue } from "@/game/gameQueue";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { getTimerPresetByLeagueAndType } from "@/models/timerPreset";
import { runBotIfNeeded } from "@/game/botRunner";
import { BOT_USER_ID } from "@/static/statics";

const gameQueue = new GameQueue();

// ثابت دیلی برای auto-pass
const AUTO_PASS_DELAY_MS = 500;

// ذخیره‌ی تایمرهای در انتظار برای هر بازی (برای cancel کردن در صورت دریافت endTurn)
const pendingEndTurnTimeouts = new Map<number, NodeJS.Timeout>();

type RollPayload = { gameId: number };

// تابع کمکی برای بررسی وجود حداقل یک حرکت ورودی از BAR با هر تاس ممکن (۱ تا ۶)
function canEnterFromBarWithAnyDie(game: any, playerId: number): boolean {
  const barCount = game.board.bar[playerId] ?? 0;
  if (barCount === 0) return true; // اگر روی BAR نیست، نیازی به ورود نیست
  const player = game.players.find((p: any) => p.id === playerId);
  if (!player) return false;
  const isWhite = player.color === "white";
  for (let die = 1; die <= 6; die++) {
    const to = isWhite ? 24 - die : die - 1;
    const point = game.board.points[to];
    if (!point) continue;
    if (point.owner === null || point.owner === playerId) return true;
    if (point.owner !== playerId && point.count === 1) return true;
  }
  return false;
}

export async function handleRoll(
  ctx: SocketContext,
  payload: RollPayload,
  rooms: RoomManager,
) {
  const { gameId } = payload;
  const playerId = ctx.userId;

  if (!playerId) {
    return ctx.send({
      type: "game.error",
      payload: onErrorSocketResponse("Not authenticated"),
    });
  }
  console.log(
    `[ROLL] Received roll request from player ${playerId} for game ${gameId}`,
  );
  await gameQueue.enqueue(gameId, async () => {
    let game = await loadGameState(gameId);
    if (!game) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Game not found"),
      });
    }

    const currentPlayer = game.players.find((p) => p.id === playerId);
    if (!currentPlayer) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Player not in game"),
      });
    }

    if (game.status !== "starting" && game.turn !== playerId) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse("Not your turn"),
      });
    }

    try {
      // ---------- فاز تعیین شروع‌کننده (Starting) ----------
      if (game.status === "starting") {
        const value = rollStartingDie(game, playerId);

        await appendGameEvent(game.id, {
          type: "STARTING_ROLLED",
          payload: { playerId, value },
        });

        const afterFirstRoll = await loadGameState(gameId);
        if (!afterFirstRoll)
          throw new Error("Failed to reload after starting roll");
        game = afterFirstRoll;
        saveGame(game);

        rooms.broadcast(gameId, {
          type: "dice.result",
          payload: onOkSocketResponse({
            dice: [value],
            playerId,
            type: "starting",
          }),
        });

        const didStart = tryResolveStartingRoll(game);

        if (didStart) {
          const preset = await getTimerPresetByLeagueAndType(
            undefined,
            "casual",
          );
          const primarySeconds = preset?.primarySeconds ?? 12;
          const secondarySeconds = preset?.secondarySeconds ?? 120;

          const whitePlayer = game.players.find((p) => p.color === "white")!;
          const blackPlayer = game.players.find((p) => p.color === "black")!;

          await appendGameEvent(game.id, {
            type: "GAME_STARTED",
            payload: {
              whitePlayerId: whitePlayer.id,
              blackPlayerId: blackPlayer.id,
              startingPlayerId: game.turn!,
              primarySeconds,
              secondarySeconds,
              dice: [game.dice?.[0] ?? 0, game.dice?.[1] ?? 0],
            },
          });

          const freshGame = await loadGameState(gameId);
          if (!freshGame)
            throw new Error("Failed to reload after GAME_STARTED");
          game = freshGame;
          saveGame(game);

          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: onOkSocketResponse({
              playerId: freshGame.turn!,
              color: freshGame.players.find((p) => p.id === freshGame.turn)!
                .color,
            }),
          });
        }

        const subStatus = calculateSubStatus(game);
        const legalMoves = game.turn
          ? generateMoveSequences(game, game.turn)
          : [];
        const flatLegalMoves = flattenMoveSequences(legalMoves);
        const stateToSend: any = {
          ...game,
          subStatus,
          legalMoves: flatLegalMoves,
        };
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(stateToSend),
        });

        if (game.status === "in-progress") {
          await runBotIfNeeded(gameId, game.turn!, rooms);
        }
        return;
      }

      // ---------- فاز تاس ریختن معمولی (In-Progress) ----------
      if (game.dice && game.dice.length > 0) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Dice already rolled"),
        });
      }

      // ✅ بررسی کنید که آیا بازیکن روی BAR است و هیچ حرکت ورودی با هیچ تاسی ممکن نیست
      if (!canEnterFromBarWithAnyDie(game, playerId)) {
        // نوبت را بدون ریختن تاس بگذران
        await appendGameEvent(game.id, {
          type: "TURN_PASSED",
          payload: { playerId, reason: "NO_LEGAL_MOVES" },
        });

        // ✅ اضافه کردن دیلی قبل از broadcast
        await new Promise((resolve) => setTimeout(resolve, AUTO_PASS_DELAY_MS));

        const afterPass = await loadGameState(gameId);
        if (afterPass) {
          saveGame(afterPass);
          const nextPlayer = afterPass.players.find(
            (p) => p.id === afterPass.turn,
          );
          if (nextPlayer) {
            rooms.broadcast(gameId, {
              type: "game.turn",
              payload: onOkSocketResponse({
                playerId: nextPlayer.id,
                color: nextPlayer.color,
              }),
            });
          }
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              {
                ...afterPass,
                subStatus: "mustEndTurn",
                legalMoves: [],
              },
              "Turn passed (no bar entry)",
            ),
          });
        }
        return;
      }

      // ریختن تاس
      const dice = rollDice(game);

      await appendGameEvent(game.id, {
        type: "DICE_ROLLED",
        payload: { playerId, dice },
      });

      const afterRoll = await loadGameState(gameId);
      if (!afterRoll) throw new Error("Failed to reload after dice roll");
      game = afterRoll;
      saveGame(game);

      rooms.broadcast(gameId, {
        type: "dice.result",
        payload: onOkSocketResponse({ dice, playerId, type: "inGame" }),
      });

      //  اضافه کردن تأخیر 100 میلی‌ثانیه
      await new Promise((resolve) => setTimeout(resolve, 100));

      const legalMovesSequences = generateMoveSequences(game, playerId);
      const flatLegalMoves = flattenMoveSequences(legalMovesSequences);
      console.log(`[ROLL] legalMoves count = ${legalMovesSequences.length}`);

      const isBot = playerId === BOT_USER_ID;

      // اگر هیچ حرکت قانونی وجود نداشت
      if (legalMovesSequences.length === 0) {
        if (isBot) {
          // ربات: auto-pass انجام بده
          await appendGameEvent(game.id, {
            type: "TURN_PASSED",
            payload: { playerId, reason: "NO_LEGAL_MOVES" },
          });

          // ✅ اضافه کردن دیلی قبل از broadcast
          await new Promise((resolve) =>
            setTimeout(resolve, AUTO_PASS_DELAY_MS),
          );

          const afterTurnPass = await loadGameState(gameId);
          if (afterTurnPass) {
            game = afterTurnPass;
            saveGame(game);
          }
          // بعد از auto-pass، state را با تاس‌های خالی broadcast کن
          const subStatus = calculateSubStatus(game);
          const stateToSend: any = {
            ...game,
            subStatus,
            legalMoves: [],
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              stateToSend,
              "Bot auto-passed (no moves)",
            ),
          });
        } else {
          // انسان: auto-pass نکن، فقط state را با dice موجود و subStatus mustEndTurn بفرست
          const stateToSend: any = {
            ...game,
            subStatus: "mustEndTurn",
            legalMoves: [],
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              stateToSend,
              "No legal moves, please end turn",
            ),
          });

          // تایم‌اوت ۳ ثانیه‌ای برای auto-pass در صورت عدم دریافت endTurn از کلاینت
          // ابتدا تایمر قبلی را پاک کن (اگر وجود داشته باشد)
          if (pendingEndTurnTimeouts.has(gameId)) {
            clearTimeout(pendingEndTurnTimeouts.get(gameId)!);
            pendingEndTurnTimeouts.delete(gameId);
          }

          const timeoutId = setTimeout(async () => {
            pendingEndTurnTimeouts.delete(gameId);
            // دوباره وضعیت را بررسی کن
            const currentState = await loadGameState(gameId);
            if (
              currentState &&
              currentState.turn === playerId &&
              (currentState.dice?.length ?? 0) > 0
            ) {
              // ✅ اضافه کردن دیلی قبل از auto-pass
              await new Promise((resolve) =>
                setTimeout(resolve, AUTO_PASS_DELAY_MS),
              );

              // هنوز نوبت همان بازیکن است و تاس دارد → auto-pass
              await appendGameEvent(gameId, {
                type: "TURN_PASSED",
                payload: { playerId, reason: "NO_LEGAL_MOVES" },
              });
              const afterPass = await loadGameState(gameId);
              if (afterPass) {
                saveGame(afterPass);
                const nextPlayer = afterPass.players.find(
                  (p) => p.id === afterPass.turn,
                );
                if (nextPlayer) {
                  rooms.broadcast(gameId, {
                    type: "game.turn",
                    payload: onOkSocketResponse({
                      playerId: nextPlayer.id,
                      color: nextPlayer.color,
                    }),
                  });
                }
                rooms.broadcast(gameId, {
                  type: "game.state",
                  payload: onOkSocketResponse(
                    { ...afterPass, subStatus: "mustEndTurn", legalMoves: [] },
                    "Auto-pass after timeout",
                  ),
                });
                if (afterPass.status === "in-progress") {
                  await runBotIfNeeded(gameId, afterPass.turn!, rooms);
                }
              }
            }
          }, 3000); // ۳ ثانیه مهلت

          pendingEndTurnTimeouts.set(gameId, timeoutId);

          // از تابع خارج شو (منتظر endTurn یا تایم‌اوت)
          return;
        }
      } else {
        // حرکت قانونی وجود دارد: broadcast state با subStatus playDice
        const subStatus = calculateSubStatus(game);
        const stateToSend: any = {
          ...game,
          subStatus,
          legalMoves: flatLegalMoves,
        };
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(stateToSend),
        });
      }

      // اگر بازی در جریان است و نوبت ربات است، ربات را اجرا کن
      if (game.status === "in-progress") {
        await runBotIfNeeded(gameId, game.turn!, rooms);
      }
    } catch (err) {
      console.error("Roll Error:", err);
      ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          err instanceof Error ? err.message : "Roll failed",
        ),
      });
    }
  });
}

// تابع برای پاک کردن تایمر در هنگام دریافت endTurn (در فایل endTurn.ts استفاده می‌شود)
export function clearEndTurnTimeout(gameId: number) {
  if (pendingEndTurnTimeouts.has(gameId)) {
    clearTimeout(pendingEndTurnTimeouts.get(gameId)!);
    pendingEndTurnTimeouts.delete(gameId);
  }
}
