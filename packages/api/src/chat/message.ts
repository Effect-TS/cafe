import * as Schema from "effect/Schema";

/** A posted prompt (`user`) or a completed model response (`assistant`). */
export const ChatMessage = Schema.Struct({
  id: Schema.String,
  key: Schema.String,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  sentAt: Schema.Number,
});
export type ChatMessage = typeof ChatMessage.Type;
