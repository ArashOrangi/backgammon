import { GameEvent } from "./eventStore";

type TimelineEventRow = {
  type: GameEvent["type"];
  payload: any;
  sequence?: number;
  createdAt?: Date;
};

export function eventToTimeline(event: TimelineEventRow) {
  switch (event.type) {
    case "PLAYER_JOINED":
      return {
        sequence: event.sequence,
        message: `Player ${event.payload.playerId} joined`,
        createdAt: event.createdAt,
      };

    case "DICE_ROLLED":
      return {
        sequence: event.sequence,
        message: `Dice rolled ${event.payload.dice[0]}-${event.payload.dice[1]}`,
        createdAt: event.createdAt,
      };

    case "MOVE_APPLIED":
      return {
        sequence: event.sequence,
        message: `Move ${event.payload.from} → ${event.payload.to}`,
        createdAt: event.createdAt,
      };

    case "TURN_PASSED":
      return {
        sequence: event.sequence,
        message: "Turn passed",
        createdAt: event.createdAt,
      };

    case "GAME_STARTED":
      return {
        sequence: event.sequence,
        message: "Game started",
        createdAt: event.createdAt,
      };

    case "GAME_FINISHED":
      return {
        sequence: event.sequence,
        message: `Winner ${event.payload.winner}`,
        createdAt: event.createdAt,
      };

    default:
      return {
        sequence: event.sequence,
        message: event.type,
        createdAt: event.createdAt,
      };
  }
}
