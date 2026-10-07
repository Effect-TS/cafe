import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcSchema from "effect/rpc/RpcSchema";
import { ChatEvent } from "../chat/event.ts";

/** Streams the chat's history as MessagePosted events, then live events. */
export const Events = Rpc.make("events", {
  success: RpcSchema.Stream(ChatEvent, Schema.Never),
});
