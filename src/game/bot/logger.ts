import { prisma } from "@/components/prisma";

export async function logBotDecision(data: {
  matchId: number;
  botId: number;
  turnNo: number;
  dice: string;
  nCandidates: number;
  bestScore: number;
  chosenScore: number;
  sigmaFinal: number;
  decisionType: "move" | "double" | "take" | "pass";
}) {
  await prisma.botDecision.create({ data });
}
