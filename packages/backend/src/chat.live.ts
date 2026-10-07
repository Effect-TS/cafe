import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as HttpApiBuilder from "effect/http-api/HttpApiBuilder";
import { ChatApi } from "./api.ts";
import { EventsHandler, EventsLive } from "./events.live.ts";
import { SendPromptHandler, SendPromptLive } from "./send-prompt.live.ts";

export const ChatLive = HttpApiBuilder.group(ChatApi, "Chat", (handlers) =>
  Effect.gen(function* () {
    return handlers
      .handle("sendPrompt", yield* SendPromptHandler)
      .handle("events", yield* EventsHandler);
  }),
).pipe(Layer.provide([SendPromptLive, EventsLive]));
