import * as Schema from "effect/Schema";

/** A single chat message, broadcast to every subscriber of its key. */
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  text: Schema.String,
  sentAt: Schema.Number,
});
export type ChatMessage = typeof ChatMessage.Type;
