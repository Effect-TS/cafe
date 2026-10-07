import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import * as RpcSchema from "effect/rpc/RpcSchema";
import { ChatEvent } from "./event.ts";
import { ChatMessage } from "./message.ts";

/**
 * The RPCs a chat's Room (a Durable Object, one per chat key) serves over a
 * WebSocket, at `chatSocketUrl(baseUrl, key)` (socket.ts).
 */
export class ChatRpcs extends RpcGroup.make(
  /** The chat's history, then every new event, for as long as the stream runs. */
  Rpc.make("events", {
    success: RpcSchema.Stream(ChatEvent, Schema.Never),
  }),
  /** Post a prompt; resolves once the assistant's reply has been posted. */
  Rpc.make("sendPrompt", {
    payload: { key: Schema.String, text: Schema.NonEmptyString },
    success: ChatMessage,
  }),
  /** Health check: succeeds once the Room is reachable. */
  Rpc.make("ping", {}),
) {}
