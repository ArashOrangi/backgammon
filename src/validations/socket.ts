import Ajv from "ajv";
import {
  RollPayload,
  MovePayload,
  LeavePayload,
  JoinPayload,
  ReadyPayload,
  EndTurnPayload,
} from "@/type-schemas/socket-schemas";

const ajv = new Ajv();

export const validateJoin = ajv.compile(JoinPayload);
export const validateRoll = ajv.compile(RollPayload);
export const validateMove = ajv.compile(MovePayload);
export const validateLeave = ajv.compile(LeavePayload);
export const validateReady = ajv.compile(ReadyPayload);
export const validateEndTurn = ajv.compile(EndTurnPayload);
