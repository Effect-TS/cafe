import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import { ChatMessage } from "../chat/message.ts";

/** Posts a prompt to the chat and streams the assistant's reply to subscribers. */
export const SendPrompt = Rpc.make("sendPrompt", {
  payload: { key: Schema.String, text: Schema.NonEmptyString },
  success: ChatMessage,
});
