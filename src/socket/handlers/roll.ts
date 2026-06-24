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
import { sleep } from "@/components/sleep";
import { BOT_USER_ID } from "@/static/statics";
import { broadcastTimerStarted, resetWarningState } from "@/game/engine/timer";

const gameQueue = new GameQueue();

// Map برای ردیابی بازی‌هایی که در انتظار endTurn از انسان هستند
const pendingEndTurnMap = new Map<
  number,
  { playerId: number; timestamp: number }
>();

type RollPayload = { gameId: number };

// تابع کمکی برای بررسی وجود حداقل یک حرکت ورودی از BAR با هر تاس ممکن (۱ تا ۶)
function canEnterFromBarWithAnyDie(game: any, playerId: number): boolean {
  const barCount = game.board.bar[playerId] ?? 0;
  if (barCount === 0) return true;
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

          // ریست وضعیت هشدار تایمر
          resetWarningState(gameId);

          // ارسال game.turn برای شروع بازی
          if (!game || game === null) {
            return ctx.send({
              type: "game.error",
              payload: onErrorSocketResponse("Game not found"),
            });
          }
          // حالا game قطعاً non-null است
          const startingPlayer = game!.players.find(
            (p) => p.id === game!.turn,
          )!;

          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: onOkSocketResponse({
              playerId: startingPlayer.id,
              color: startingPlayer.color,
            }),
          });

          // ارسال رویداد شروع تایمر
          broadcastTimerStarted(
            gameId,
            game.turn!,
            game.primaryTimePerTurn,
            game.secondaryTimeBank[game.turn!] || 0,
            game.turnStartedAt!,
            rooms,
          );
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

      const isBot = playerId === BOT_USER_ID;

      // ✅ بررسی کنید که آیا بازیکن روی BAR است و هیچ حرکت ورودی با هیچ تاسی ممکن نیست
      if (!canEnterFromBarWithAnyDie(game, playerId)) {
        if (isBot) {
          // ربات: auto-pass
          await appendGameEvent(game.id, {
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
              // ارسال timer.started برای نوبت جدید
              broadcastTimerStarted(
                gameId,
                afterPass.turn!,
                afterPass.primaryTimePerTurn,
                afterPass.secondaryTimeBank[afterPass.turn!] || 0,
                afterPass.turnStartedAt!,
                rooms,
              );
            }
            rooms.broadcast(gameId, {
              type: "game.state",
              payload: onOkSocketResponse(
                {
                  ...afterPass,
                  subStatus: "mustEndTurn",
                  legalMoves: [],
                },
                "Bot auto-passed (no bar entry)",
              ),
            });
          }
          return;
        } else {
          // انسان: بدون ریختن تاس، فقط state با mustEndTurn بفرست و منتظر endTurn باش
          const stateToSend: any = {
            ...game,
            subStatus: "mustEndTurn",
            legalMoves: [],
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              stateToSend,
              "No bar entry, please end turn",
            ),
          });
          pendingEndTurnMap.set(gameId, { playerId, timestamp: Date.now() });
          console.log(
            `[ROLL] Human player ${playerId} in game ${gameId} has no bar entry. Waiting for endTurn.`,
          );
          setTimeout(() => {
            if (pendingEndTurnMap.has(gameId)) {
              console.warn(
                `[ROLL] ⚠️ Human player ${playerId} in game ${gameId} still has NOT sent endTurn after 5 seconds (no bar entry)`,
              );
            }
          }, 5000);
          return;
        }
      }

      await sleep(150);

      // ---------- ریختن تاس ----------
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

      await new Promise((resolve) => setTimeout(resolve, 100));

      const legalMovesSequences = generateMoveSequences(game, playerId);
      const flatLegalMoves = flattenMoveSequences(legalMovesSequences);
      console.log(`[ROLL] legalMoves count = ${legalMovesSequences.length}`);

      // اگر هیچ حرکت قانونی وجود نداشت
      if (legalMovesSequences.length === 0) {
        if (isBot) {
          // ربات: auto-pass انجام بده
          await appendGameEvent(game.id, {
            type: "TURN_PASSED",
            payload: { playerId, reason: "NO_LEGAL_MOVES" },
          });
          const afterTurnPass = await loadGameState(gameId);
          if (afterTurnPass) {
            game = afterTurnPass;
            saveGame(game);
          }
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
          // ✅ انسان: subStatus: "playDice" با legalMoves: [] بفرست تا کلاینت خودش endTurn بفرستد
          const stateToSend: any = {
            ...game,
            subStatus: "playDice",
            legalMoves: [],
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(
              stateToSend,
              "No legal moves, please end turn",
            ),
          });
          pendingEndTurnMap.set(gameId, { playerId, timestamp: Date.now() });
          console.log(
            `[ROLL] Human player ${playerId} in game ${gameId} has no legal moves. Sent playDice with empty legalMoves. Waiting for endTurn.`,
          );
          setTimeout(() => {
            if (pendingEndTurnMap.has(gameId)) {
              console.warn(
                `[ROLL] ⚠️ Human player ${playerId} in game ${gameId} still has NOT sent endTurn after 5 seconds (no legal moves)`,
              );
            }
          }, 5000);
          return;
        }
      } else {
        // حرکت قانونی وجود دارد
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

// تابع برای پاک کردن pending entry هنگام دریافت endTurn
export function clearPendingEndTurn(gameId: number) {
  if (pendingEndTurnMap.has(gameId)) {
    pendingEndTurnMap.delete(gameId);
    console.log(`[ROLL] Removed game ${gameId} from pending endTurn map`);
  }
}
