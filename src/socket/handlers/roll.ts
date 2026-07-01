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

const pendingEndTurnMap = new Map<
  number,
  { playerId: number; timestamp: number }
>();

type RollPayload = { gameId: number };

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

    if (game.cubeOfferedBy || game.cubeOfferedTo) {
      return ctx.send({
        type: "game.error",
        payload: onErrorSocketResponse(
          "Resolve the pending doubling cube offer before rolling",
        ),
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

        if (playerId === BOT_USER_ID) {
          await sleep(1500);
        }

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

          resetWarningState(gameId);

          // ===== ترتیب جدید: game.state → game.turn → timer.started =====
          const subStatus = calculateSubStatus(game);
          const legalMoves = game.turn
            ? generateMoveSequences(game, game.turn)
            : [];
          const flatLegalMoves = flattenMoveSequences(legalMoves);
          const stateToSend = {
            ...game,
            subStatus,
            legalMoves: flatLegalMoves,
          };
          rooms.broadcast(gameId, {
            type: "game.state",
            payload: onOkSocketResponse(stateToSend),
          });

          const startingPlayer = game!.players.find(
            (p) => p.id === game!.turn!,
          )!;
          rooms.broadcast(gameId, {
            type: "game.turn",
            payload: onOkSocketResponse({
              playerId: startingPlayer.id,
              color: startingPlayer.color,
            }),
          });

          if (game.turn) {
            broadcastTimerStarted(
              gameId,
              game.turn,
              game.primaryTimePerTurn,
              game.secondaryTimeBank[game.turn] || 0,
              game.turnStartedAt!,
              rooms,
            );
          }

          // if (game.status === "in-progress") {
          //   await runBotIfNeeded(gameId, game.turn!, rooms);
          // }
          return;
        }

        // اگر didStart === false، ادامه به بخش state عمومی (پایین)
      }

      // ---------- فاز تاس ریختن معمولی (In-Progress) ----------
      if (game.dice && game.dice.length > 0) {
        return ctx.send({
          type: "game.error",
          payload: onErrorSocketResponse("Dice already rolled"),
        });
      }

      const isBot = playerId === BOT_USER_ID;

      if (!canEnterFromBarWithAnyDie(game, playerId)) {
        if (isBot) {
          await appendGameEvent(game.id, {
            type: "TURN_PASSED",
            payload: { playerId, reason: "NO_LEGAL_MOVES" },
          });
          const afterPass = await loadGameState(gameId);
          if (afterPass) {
            saveGame(afterPass);

            const subStatus = calculateSubStatus(afterPass);
            const stateToSend = {
              ...afterPass,
              subStatus,
              legalMoves: [],
            };
            rooms.broadcast(gameId, {
              type: "game.state",
              payload: onOkSocketResponse(
                stateToSend,
                "Bot auto-passed (no bar entry)",
              ),
            });

            const nextPlayer = afterPass!.players.find(
              (p) => p.id === afterPass!.turn,
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

            if (afterPass.turn) {
              broadcastTimerStarted(
                gameId,
                afterPass.turn,
                afterPass.primaryTimePerTurn,
                afterPass.secondaryTimeBank[afterPass.turn] || 0,
                afterPass.turnStartedAt!,
                rooms,
              );
            }
          }
          return;
        } else {
          const stateToSend = {
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

      if (legalMovesSequences.length === 0) {
        if (isBot) {
          await appendGameEvent(game.id, {
            type: "TURN_PASSED",
            payload: { playerId, reason: "NO_LEGAL_MOVES" },
          });
          const afterTurnPass = await loadGameState(gameId);
          if (afterTurnPass) {
            game = afterTurnPass;
            saveGame(game);

            const subStatus = calculateSubStatus(game);
            const stateToSend = {
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

            const nextPlayer = game!.players.find((p) => p.id === game!.turn);
            if (nextPlayer) {
              rooms.broadcast(gameId, {
                type: "game.turn",
                payload: onOkSocketResponse({
                  playerId: nextPlayer.id,
                  color: nextPlayer.color,
                }),
              });
            }

            if (game.turn) {
              broadcastTimerStarted(
                gameId,
                game.turn,
                game.primaryTimePerTurn,
                game.secondaryTimeBank[game.turn] || 0,
                game.turnStartedAt!,
                rooms,
              );
            }
          }
          return;
        } else {
          const stateToSend = {
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
        const subStatus = calculateSubStatus(game);
        const stateToSend = {
          ...game,
          subStatus,
          legalMoves: flatLegalMoves,
        };
        rooms.broadcast(gameId, {
          type: "game.state",
          payload: onOkSocketResponse(stateToSend),
        });
      }

      // ===== پس از ارسال state و در صورت لزوم اجرای ربات =====
      if (game.status === "in-progress") {
        const previousTurn = game.turn; // ذخیره نوبت فعلی قبل از اجرای ربات

        await runBotIfNeeded(gameId, game.turn!, rooms);

        // اگر ربات نوبت را تغییر داد، برای بازیکن جدید تایمر استارت بزن
        const updatedGame = await loadGameState(gameId);
        if (updatedGame && updatedGame.status === "in-progress") {
          if (updatedGame.turn && updatedGame.turn !== previousTurn) {
            const newPlayer = updatedGame.players.find(
              (p) => p.id === updatedGame.turn,
            );
            // اگر بازیکن جدید ربات نیست (انسان است) یا حتی اگر ربات است، باز هم تایمر استارت می‌خورد
            // اما چون ربات خودش بعداً تاس می‌ریزد، نیازی نیست ولی برای اطمینان می‌فرستیم
            broadcastTimerStarted(
              gameId,
              updatedGame.turn,
              updatedGame.primaryTimePerTurn,
              updatedGame.secondaryTimeBank[updatedGame.turn] || 0,
              updatedGame.turnStartedAt!,
              rooms,
            );
          }
        }
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

export function clearPendingEndTurn(gameId: number) {
  if (pendingEndTurnMap.has(gameId)) {
    pendingEndTurnMap.delete(gameId);
    console.log(`[ROLL] Removed game ${gameId} from pending endTurn map`);
  }
}
