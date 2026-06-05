import { getDefaultTimerPreset } from "@/models/timerPreset";
import { GameState } from "@/game/types";
import { saveGame } from "@/game/gameStore";

async function applyTimerSettingsToGame(game: GameState) {
  const preset = await getDefaultTimerPreset();
  game.primaryTimePerTurn = preset.primarySeconds;
  if (!game.secondaryTimeBank) game.secondaryTimeBank = {};
  for (const p of game.players) {
    if (game.secondaryTimeBank[p.id] === undefined) {
      game.secondaryTimeBank[p.id] = preset.secondarySeconds;
    }
  }
  saveGame(game);
}
