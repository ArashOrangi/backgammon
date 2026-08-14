import { SocketContext } from "./socket-context";

export const userSocketMap = new Map<number, SocketContext>();

export function registerUserSocket(userId: number, ctx: SocketContext) {
  userSocketMap.set(userId, ctx);
}

export function unregisterUserSocket(userId: number) {
  userSocketMap.delete(userId);
}

export function getUserSocket(userId: number): SocketContext | undefined {
  return userSocketMap.get(userId);
}
