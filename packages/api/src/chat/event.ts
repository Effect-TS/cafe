import * as Schema from "effect/Schema";
import { ChatMessage } from "./message.ts";

/** What the Room streams to its subscribers. */
export const ChatEvent = Schema.Union([
  /** A message was added to the chat (kept in the chat's history). */
  Schema.TaggedStruct("MessagePosted", { message: ChatMessage }),
  /** The next chunk of an in-progress assistant response. */
  Schema.TaggedStruct("ResponseDelta", {
    responseId: Schema.String,
    text: Schema.String,
  }),
  /** An in-progress assistant response failed and will not complete. */
  Schema.TaggedStruct("ResponseFailed", {
    responseId: Schema.String,
    error: Schema.String,
  }),
]);
export type ChatEvent = typeof ChatEvent.Type;
