export interface WsLogEntry {
  time: Date;
  direction: "in" | "out";
  data: string;
  gameId?: number;
  type?: string;
}

const MAX_LOG_LENGTH = 10000; // افزایش به 1۰۰۰۰ کاراکتر
const wsLogs: WsLogEntry[] = [];
const MAX_LOGS = 500;

export function logWSMessage(
  dir: "in" | "out",
  data: string,
  gameId?: number,
  type?: string,
) {
  const truncatedData =
    data.length > MAX_LOG_LENGTH ? data.slice(0, MAX_LOG_LENGTH) + "..." : data;
  wsLogs.push({
    time: new Date(),
    direction: dir,
    data: truncatedData,
    gameId,
    type,
  });
  if (wsLogs.length > MAX_LOGS) wsLogs.shift();
}

export function getWsLogs(limit?: number, filterGameId?: number) {
  let logs = [...wsLogs].reverse();
  if (filterGameId) {
    logs = logs.filter((log) => log.gameId === filterGameId);
  }
  if (limit && limit > 0) {
    logs = logs.slice(0, limit);
  }
  return logs;
}

export function clearWsLogs() {
  wsLogs.length = 0;
}
