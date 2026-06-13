import { GameEvent } from "./eventStore";

export function eventToTimeline(event: any) {
  const base = {
    id: event.id,
    time: new Date(event.createdAt).getTime(),
    roomId: event.gameId,
    seq: event.sequence,
    revert: event.isUndo === true, // اصلاح: نمایش Undo
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
      return { ...base, initiator: null, event: "RoomReady", details: null };
    case "STARTING_ROLLED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "StartingRolled",
        details: event.payload.value.toString(),
      };
    case "GAME_STARTED":
      return {
        ...base,
        initiator: null,
        event: "Assign",
        details: `${event.payload.whitePlayerId},${event.payload.blackPlayerId}`,
      };
    case "DICE_ROLLED":
      return {
        ...base,
        initiator: event.payload.playerId,
        event: "DiceResult",
        details: event.payload.dice.join(","),
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
      return { ...base, initiator: null, event: event.type, details: null };
  }
}
