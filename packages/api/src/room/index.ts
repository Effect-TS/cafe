import * as RpcGroup from "effect/rpc/RpcGroup";
import { Events } from "./events.ts";
import { Ping } from "./ping.ts";
import { SendPrompt } from "./send-prompt.ts";

/** One Room per chat key, reached over a WebSocket at `/chats/:key/room`. */
export class Room extends RpcGroup.make(Events, SendPrompt, Ping) {
  static readonly path = /^\/chats\/([^/]+)\/room$/;

  static readonly url = (baseUrl: string, key: string) =>
    `${baseUrl.replace(/^http/, "ws")}/chats/${encodeURIComponent(key)}/room`;
}
