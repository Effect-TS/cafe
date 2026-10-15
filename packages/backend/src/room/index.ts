import * as Cloudflare from "alchemy/Cloudflare";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Model from "effect/ai/Model";
import { Room as RoomSchema } from "@cafe/api/room";
import { Kitchen } from "../kitchen/index.ts";
import { Barista } from "./barista.ts";
import { Broadcast } from "./broadcast.ts";
import { EventsHandler } from "./events.ts";
import { History } from "./history.ts";
import { PingHandler } from "./ping.ts";
import { SendPromptHandler } from "./send-prompt.ts";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";

/**
 * One Room per chat key, serving `@cafe/api/room` over WebSockets (and HTTP).
 * An open `events` stream is an unfinished request, so the Room stays in
 * memory (does not hibernate) while anyone is subscribed.
 */
export default class Room extends Cloudflare.RpcDurableObject<Room>()(
  "Room",
  { schema: RoomSchema },
  Effect.gen(function* () {
    const kitchen = yield* Kitchen;
    const ai = yield* Cloudflare.Workers.AI();
    // Agents need the provider and model names alongside the LanguageModel.
    const model = Model.make(
      "workers-ai",
      MODEL,
      ai.model({ model: MODEL, parameters: { maxTokens: 512 } }),
    );

    return Effect.gen(function* () {
      yield* Effect.log("TODO: bindings");

      return RoomSchema.toLayer(
        Effect.gen(function* () {
          return {
            events: yield* EventsHandler,
            sendPrompt: yield* SendPromptHandler,
            ping: yield* PingHandler,
          };
        }),
      ).pipe(
        Layer.provide(Barista.layer(kitchen, model)),
        Layer.provide(Broadcast.layer),
        Layer.provide(History.layer),
      );
    });
  }).pipe(Effect.provide(Cloudflare.Workers.AIBinding)),
) {}
