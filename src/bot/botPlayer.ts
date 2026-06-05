import { GameState, PlayerId, SPECIAL_POSITIONS } from "@/game/types";
import {
  generateMoveSequences,
  flattenMoveSequences,
} from "@/game/moveGenerator";
import { appendGameEvent, loadGameState } from "@/game/eventStore";
import { RoomManager } from "@/socket/room-manager";
import { rollDice as rollDiceUtil } from "@/utils/dice";
import { validateMove } from "@/game/ruleValidator";
import { onOkSocketResponse } from "@/responses/response-builder";

export class BotPlayer {
  private botId: PlayerId;
  private gameId: number;
  private rooms: RoomManager;
  private interval: NodeJS.Timeout | null = null;
  private isProcessing: boolean = false;
  private isStarted: boolean = false;

  constructor(botId: PlayerId, gameId: number, rooms: RoomManager) {
    this.botId = botId;
    this.gameId = gameId;
    this.rooms = rooms;
  }

  async start() {
    if (this.isStarted) return;
    this.isStarted = true;
    console.log(`[Bot ${this.botId}] Started for game ${this.gameId}`);
    this.interval = setInterval(async () => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      try {
        await this.tick();
      } catch (err) {
        console.error(`[Bot ${this.botId}] Error in tick:`, err);
      } finally {
        this.isProcessing = false;
      }
    }, 500);
  }

  private async broadcastState() {
    const state = await loadGameState(this.gameId);
    if (state) {
      this.rooms.broadcast(this.gameId, {
        type: "game.state",
        payload: onOkSocketResponse(state),
      });
    }
  }

  private async tick() {
    const state = await loadGameState(this.gameId);
    if (!state) {
      console.log(`[Bot ${this.botId}] Game state not found`);
      return;
    }

    if (state.status !== "in-progress") {
      if (state.status === "finished") this.stop();
      return;
    }

    if (state.turn !== this.botId) return;

    console.log(
      `[Bot ${this.botId}] It's my turn. Dice: ${state.dice?.join(",") || "empty"}`,
    );

    if (!state.dice || state.dice.length === 0) {
      await this.rollDice();
      await this.broadcastState();
      return;
    }

    const moveSequences = generateMoveSequences(state, this.botId);
    const flatMoves = flattenMoveSequences(moveSequences);

    if (flatMoves.length === 0) {
      console.log(`[Bot ${this.botId}] No legal moves, ending turn`);
      await this.endTurn();
      await this.broadcastState();
      return;
    }

    let bestMove = flatMoves[0];
    let bestScore = this.evaluateMove(state, bestMove);
    for (let i = 1; i < flatMoves.length; i++) {
      const score = this.evaluateMove(state, flatMoves[i]);
      if (score > bestScore) {
        bestScore = score;
        bestMove = flatMoves[i];
      }
    }

    const validation = validateMove(
      state,
      this.botId,
      bestMove.from,
      bestMove.to,
      [bestMove.die],
    );
    if (!validation.isValid) {
      console.log(
        `[Bot ${this.botId}] Move invalid: ${validation.message}. Ending turn.`,
      );
      await this.endTurn();
      await this.broadcastState();
      return;
    }

    console.log(
      `[Bot ${this.botId}] Making move: ${bestMove.from} -> ${bestMove.to} (die ${bestMove.die})`,
    );
    await appendGameEvent(this.gameId, {
      type: "MOVE_APPLIED",
      payload: {
        playerId: this.botId,
        from: bestMove.from,
        to: bestMove.to,
        die: bestMove.die,
      },
    });
    await this.broadcastState();
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  private async rollDice() {
    console.log(`[Bot ${this.botId}] Rolling dice`);
    const dice = rollDiceUtil();
    await appendGameEvent(this.gameId, {
      type: "DICE_ROLLED",
      payload: { playerId: this.botId, dice },
    });
  }

  private async endTurn() {
    console.log(`[Bot ${this.botId}] Ending turn`);
    await appendGameEvent(this.gameId, {
      type: "TURN_PASSED",
      payload: { playerId: this.botId, reason: "MANUAL_END" },
    });
  }

  private evaluateMove(state: GameState, move: any): number {
    let score = 0;
    const { from, to } = move;
    const targetPoint = state.board.points[to];
    const isBearOff =
      to === SPECIAL_POSITIONS.BEAR_OFF_WHITE ||
      to === SPECIAL_POSITIONS.BEAR_OFF_BLACK;
    const isBar = from === SPECIAL_POSITIONS.BAR;
    const player = state.players.find((p) => p.id === this.botId)!;
    const opponent = state.players.find((p) => p.id !== this.botId)!;

    if (isBar) score += 200;
    if (targetPoint?.owner === opponent.id && targetPoint.count === 1)
      score += 150;
    if (isBearOff) score += 120;
    if (targetPoint?.owner === player.id && targetPoint.count >= 2) {
      score += 40;
      let consecutive = 1;
      let idx = to;
      const dir = player.color === "white" ? -1 : 1;
      for (let step = 1; step <= 3; step++) {
        const nextIdx = idx + step * dir;
        if (
          nextIdx >= 0 &&
          nextIdx < 24 &&
          state.board.points[nextIdx].owner === player.id &&
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
      targetPoint?.owner === player.id &&
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
    )
      score += 25;
    if (isBar && targetPoint?.owner === player.id && targetPoint.count === 1)
      score -= 15;
    return score;
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      this.isStarted = false;
      console.log(`[Bot ${this.botId}] Stopped`);
    }
  }
}
