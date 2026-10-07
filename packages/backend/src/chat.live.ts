import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import { EventsHandler } from "./events.live.ts";
import { SendPromptHandler } from "./send-prompt.live.ts";

export const ChatLive = HttpApiBuilder.group(ChatApi, "Chat", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("sendPrompt", yield* SendPromptHandler)
      .handle("events", yield* EventsHandler);
  }),
);
