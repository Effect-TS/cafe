import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Api } from "@cafe/api";
import { SendPromptHandler } from "./send-prompt.ts";

export const ChatLive = HttpApiBuilder.group(Api, "Chat", (handlers) =>
  Effect.gen(function* () {
    return handlers.handle("sendPrompt", yield* SendPromptHandler);
  }),
);
