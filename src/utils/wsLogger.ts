export interface WsLogEntry {
  time: Date;
  direction: "in" | "out";
  data: string;
  gameId?: number;
  type?: string;
}

const wsLogs: WsLogEntry[] = [];
const MAX_LOGS = 500;

export function logWSMessage(
  dir: "in" | "out",
  data: string,
  gameId?: number,
  type?: string,
) {
  // محدود کردن حجم داده برای جلوگیری از پر شدن حافظه
  const truncatedData = data.length > 1000 ? data.slice(0, 1000) + "..." : data;
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
  let logs = [...wsLogs].reverse(); // آخرین ها اول
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
