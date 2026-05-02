import { Server, Socket } from "socket.io";
import { ClientToServerEvents, ServerToClientEvents } from "./contracts";

export type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
export type TypedIo = Server<ClientToServerEvents, ServerToClientEvents>;
