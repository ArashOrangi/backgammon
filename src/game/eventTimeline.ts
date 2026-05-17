import { GameEvent } from "./eventStore";

export function eventToTimeline(event: any) {
  const base = {
    id: event.id,
    time: new Date(event.createdAt).getTime(),
    roomId: event.gameId,
    seq: event.sequence,
    revert: false,
  };

  switch (event.type) {
    case "PLAYER_JOINED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "Joined",
        details: event.payload.playerId,
      };

    case "GAME_STARTING":
      return {
        ...base,
        initiator: null,
        event: "RoomReady",
        details: null,
      };

    case "GAME_STARTED":
      return {
        ...base,
        initiator: null,
        event: "Assign",
        details: `${event.payload.whiteId},${event.payload.blackId}`,
      };

    case "DICE_ROLLED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "DiceResult",
        details: `${event.payload.dice[0]},${event.payload.dice[1]}`,
      };

    case "MOVE_APPLIED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "Move",
        details: `${event.payload.from},${event.payload.to}`,
      };

    case "TURN_PASSED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "Turn",
        details: null,
      };

    case "GAME_FINISHED":
      return {
        ...base,
        initiator: null,
        event: "Result",
        details: event.payload.winner,
      };

    default:
      return {
        ...base,
        initiator: null,
        event: event.type,
        details: null,
      };
  }
}
