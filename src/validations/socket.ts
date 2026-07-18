import Ajv from "ajv";
import {
  RollPayload,
  MovePayload,
  LeavePayload,
  JoinPayload,
  ReadyPayload,
  EndTurnPayload,
  CubeOfferPayload,
  CubeRespondPayload,
} from "@/type-schemas/socket-schemas";

const ajv = new Ajv();

// ===== اعتبارسنجی‌های موجود =====
export const validateJoin = ajv.compile(JoinPayload);
export const validateRoll = ajv.compile(RollPayload);
export const validateMove = ajv.compile(MovePayload);
export const validateLeave = ajv.compile(LeavePayload);
export const validateReady = ajv.compile(ReadyPayload);
export const validateEndTurn = ajv.compile(EndTurnPayload);
export const validateCubeOffer = ajv.compile(CubeOfferPayload);
export const validateCubeRespond = ajv.compile(CubeRespondPayload);

// ===== اعتبارسنجی رویدادهای تورنمنت =====

// 1. شروع سری ماهانه
const tournamentMonthlyStartSchema = {
  type: "object",
  properties: {
    seasonId: { type: "integer", minimum: 1 },
  },
  required: ["seasonId"],
  additionalProperties: false,
};
export const validateTournamentMonthlyStart = ajv.compile(
  tournamentMonthlyStartSchema,
);

// 2. ثبت مسابقه ماهانه
const tournamentMonthlyRecordSchema = {
  type: "object",
  properties: {
    seriesId: { type: "integer", minimum: 1 },
    gameId: { type: "integer", minimum: 1 },
    matchIndex: { type: "integer", minimum: 0, maximum: 2 },
    result: {
      type: "string",
      enum: [
        "normal",
        "gammon",
        "backgammon",
        "timer",
        "doublingcube",
        "leave",
        "forfeit",
        "loss",
      ],
    },
    pipAdvantage: { type: "number", minimum: 0 },
    cleanPlay: { type: "boolean" },
  },
  required: ["seriesId", "gameId", "matchIndex", "result"],
  additionalProperties: false,
};
export const validateTournamentMonthlyRecord = ajv.compile(
  tournamentMonthlyRecordSchema,
);

// 3. بستن سری ماهانه
const tournamentMonthlyCloseSchema = {
  type: "object",
  properties: {
    seriesId: { type: "integer", minimum: 1 },
  },
  required: ["seriesId"],
  additionalProperties: false,
};
export const validateTournamentMonthlyClose = ajv.compile(
  tournamentMonthlyCloseSchema,
);

// 4. ورود به صف مچ‌میکینگ تورنمنت
const tournamentMatchmakingJoinSchema = {
  type: "object",
  properties: {
    seasonId: { type: "integer", minimum: 1 },
    type: { type: "string", enum: ["WEEKLY", "MONTHLY"] },
  },
  required: ["seasonId", "type"],
  additionalProperties: false,
};
export const validateTournamentMatchmakingJoin = ajv.compile(
  tournamentMatchmakingJoinSchema,
);

// 5. لغو صف مچ‌میکینگ تورنمنت
const tournamentMatchmakingCancelSchema = {
  type: "object",
  properties: {
    type: { type: "string", enum: ["WEEKLY", "MONTHLY"] },
  },
  required: ["type"],
  additionalProperties: false,
};
export const validateTournamentMatchmakingCancel = ajv.compile(
  tournamentMatchmakingCancelSchema,
);
