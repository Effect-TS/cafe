import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import { ChatMessage } from "./chat-message.ts";

/** POST a prompt to a chat; it is broadcast to every subscriber of `key`. */
export const SendPrompt = HttpApiEndpoint.post(
  "sendPrompt",
  "/chats/:key/prompts",
  {
    params: Schema.Struct({ key: Schema.String }),
    payload: Schema.Struct({ text: Schema.NonEmptyString }),
    success: ChatMessage,
  },
);
