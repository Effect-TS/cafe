import * as Schema from "effect/Schema";
import { ChatMessage } from "./chat-message.ts";

/** Frames sent over the events WebSocket. */
export const ChatEvent = Schema.Union([
  Schema.TaggedStruct("MessagePosted", { message: ChatMessage }),
]);
export type ChatEvent = typeof ChatEvent.Type;

/** `ChatEvent` as it travels over the wire: a JSON string per frame. */
export const ChatEventJson = Schema.fromJsonString(ChatEvent);
