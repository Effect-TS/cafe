import * as Effect from "effect/Effect";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { Api } from "./api.ts";
import { EventsHandler } from "./events.live.ts";
import { SendPromptHandler } from "./send-prompt.live.ts";

export const ChatLive = HttpApiBuilder.group(Api, "Chat", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("sendPrompt", yield* SendPromptHandler)
      .handle("events", yield* EventsHandler);
  }),
);
