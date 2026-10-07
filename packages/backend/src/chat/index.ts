import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Api } from "@cafe/api";
import { SendPromptHandler } from "./send-prompt.ts";

export const ChatLive = HttpApiBuilder.group(
  Api,
  "Chat",
  Effect.fn("ChatLive")(function* (handlers) {
    return handlers.handle("sendPrompt", yield* SendPromptHandler);
  }),
);
