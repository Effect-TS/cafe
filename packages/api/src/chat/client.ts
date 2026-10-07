import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as RpcClient from "effect/rpc/RpcClient";
import type { RpcClientError } from "effect/rpc/RpcClientError";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Socket from "effect/socket/Socket";
import { ChatRpcs } from "./rpcs.ts";
import { chatSocketUrl } from "./socket.ts";

/** The `ChatRpcs` client: `events()`, `sendPrompt(...)`, `ping()`. */
export type ChatRpcClient = RpcClient.FromGroup<typeof ChatRpcs, RpcClientError>;

/** A `ChatRpcs` client connected to one chat's Room over its WebSocket. */
export class ChatClient extends Context.Service<ChatClient, ChatRpcClient>()(
  "ChatClient",
) {
  /** Connects to the chat `key` on the API at `baseUrl`; closes with the Layer. */
  static layer = (baseUrl: string, key: string) =>
    Layer.effect(ChatClient, RpcClient.make(ChatRpcs)).pipe(
      Layer.provide(
        RpcClient.layerProtocolSocket().pipe(
          Layer.provide([
            Socket.layerWebSocket(chatSocketUrl(baseUrl, key)),
            RpcSerialization.layerJson,
          ]),
        ),
      ),
    );
}
