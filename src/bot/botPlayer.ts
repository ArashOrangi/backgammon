import { GameState, PlayerId, SPECIAL_POSITIONS } from "@/game/types";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import {
  appendGameEvent,
  loadGameState,
  calculateSubStatus,
} from "@/game/eventStore";
import { RoomManager } from "@/socket/room-manager";
import { saveGame } from "@/game/gameStore";
import { onOkSocketResponse } from "@/responses/response-builder";
import { rollDice as rollDiceUtil } from "@/utils/dice";

export class BotPlayer {
  private botId: PlayerId;
  private gameId: number;
  private rooms: RoomManager;
  private interval: NodeJS.Timeout | null = null;
  private lastActionTimestamp: number = 0;

  constructor(botId: PlayerId, gameId: number, rooms: RoomManager) {
    this.botId = botId;
    this.gameId = gameId;
    this.rooms = rooms;
  }

  async start() {
    this.interval = setInterval(async () => {
      const now = Date.now();
      if (now - this.lastActionTimestamp < 800) return;
      this.lastActionTimestamp = now;

      try {
        const state = await loadGameState(this.gameId);
        if (!state) return;
        if (state.status === "finished") {
          this.stop();
          return;
        }
        if (state.status !== "in-progress") return;
        if (state.turn !== this.botId) return;

        if (!state.dice || state.dice.length === 0) {
          await this.rollDice(state);
        } else {
          await this.makeBestMove(state);
        }
      } catch (err) {
        console.error(`[Bot] Error in interval:`, err);
        try {
          await this.endTurn();
        } catch (e) {}
        this.lastActionTimestamp = Date.now();
      }
    }, 800);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private async rollDice(state: GameState) {
    const dice = rollDiceUtil();
    await appendGameEvent(this.gameId, {
      type: "DICE_ROLLED",
      payload: { playerId: this.botId, dice },
    });
    const newState = await loadGameState(this.gameId);
    if (newState) {
      saveGame(newState);
      await this.broadcastState(newState);
    }
    this.lastActionTimestamp = Date.now();
  }

  private async makeBestMove(state: GameState) {
    const moves = generateMoveSequences(state, this.botId);
    const flatMoves = flattenMoveSequences(moves);
    if (flatMoves.length === 0) {
      console.log(`[Bot] No legal moves, ending turn.`);
      await this.endTurn();
      return;
    }

    let bestMove = flatMoves[0];
    let bestScore = this.evaluateMove(state, bestMove, this.botId);
    for (let i = 1; i < flatMoves.length; i++) {
      const score = this.evaluateMove(state, flatMoves[i], this.botId);
      if (score > bestScore) {
        bestScore = score;
        bestMove = flatMoves[i];
      }
    }

    await appendGameEvent(this.gameId, {
      type: "MOVE_APPLIED",
      payload: {
        playerId: this.botId,
        from: bestMove.from,
        to: bestMove.to,
        die: bestMove.die,
      },
    });

    const newState = await loadGameState(this.gameId);
    if (newState) {
      saveGame(newState);
      await this.broadcastState(newState);
    }

    this.lastActionTimestamp = Date.now();

    if (newState && (!newState.dice || newState.dice.length === 0)) {
      await this.endTurn();
    }
  }

  private async endTurn() {
    await appendGameEvent(this.gameId, {
      type: "TURN_PASSED",
      payload: { playerId: this.botId, reason: "MANUAL_END" },
    });
    const newState = await loadGameState(this.gameId);
    if (newState) {
      saveGame(newState);
      await this.broadcastState(newState);
    }
    this.lastActionTimestamp = Date.now();
  }

  private evaluateMove(
    state: GameState,
    move: any,
    playerId: PlayerId,
  ): number {
    let score = 0;
    const { from, to } = move;
    const targetPoint = state.board.points[to];
    const isBearOff =
      to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
      to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    const isBar = from === SPECIAL_POSITIONS.BAR;
    const player = state.players.find((p) => p.id === playerId)!;
    const opponent = state.players.find((p) => p.id !== playerId)!;

    if (isBar) score += 200;
    if (targetPoint.owner === opponent.id && targetPoint.count === 1)
      score += 150;
    if (isBearOff) score += 120;
    if (targetPoint.owner === playerId && targetPoint.count >= 2) {
      score += 40;
      let consecutive = 1;
      let idx = to;
      const dir = player.color === "white" ? -1 : 1;
      for (let step = 1; step <= 3; step++) {
        const nextIdx = idx + step * dir;
        if (
          nextIdx >= 0 &&
          nextIdx < 24 &&
          state.board.points[nextIdx].owner === playerId &&
          state.board.points[nextIdx].count >= 2
        ) {
          consecutive++;
        } else break;
      }
      score += consecutive * 10;
    }
    const homeStart = player.color === "white" ? 18 : 0;
    const homeEnd = player.color === "white" ? 23 : 5;
    if (to >= homeStart && to <= homeEnd) {
      const progress =
        player.color === "white" ? to - homeStart + 1 : homeEnd - to + 1;
      score += progress * 3;
    } else {
      const distanceToHome =
        player.color === "white" ? homeStart - to : to - homeEnd;
      if (distanceToHome > 0) score += (24 - distanceToHome) / 2;
    }
    if (
      targetPoint.owner === playerId &&
      targetPoint.count === 1 &&
      !isBearOff &&
      !isBar
    ) {
      const canBeHit = player.color === "white" ? to <= 5 : to >= 18;
      if (canBeHit) score -= 20;
    }
    if (
      state.dice &&
      state.dice.length === 4 &&
      state.dice[0] === state.dice[1]
    ) {
      score += 25;
    }
    if (isBar && targetPoint.owner === playerId && targetPoint.count === 1) {
      score -= 15;
    }
    return score;
  }

  private async broadcastState(state: GameState) {
    const subStatus = calculateSubStatus(state);
    const legalMoves = state.turn
      ? flattenMoveSequences(generateMoveSequences(state, state.turn))
      : [];
    const stateToSend = {
      ...state,
      subStatus,
      legalMoves,
    };
    this.rooms.broadcast(this.gameId, {
      type: "game.state",
      payload: onOkSocketResponse(stateToSend),
    });
  }
}
